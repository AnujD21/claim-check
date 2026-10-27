import { z } from "zod";
import { chatJSON, modelFor } from "./nebius";
import { extractArticle, searchEvidence } from "./tavily";
import type { CheckEvent, Claim, ClaimVerdict, Source, Tier, Verdict } from "./types";

const MAX_INPUT_CHARS = 12_000;
const MAX_CLAIMS = 6;
/** Super verdicts below this confidence get a second opinion from Ultra. */
const ESCALATE_BELOW = 0.75;
const CONCURRENCY = 3;

type Emit = (event: CheckEvent) => void;

const ClaimsSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string().min(1),
      query: z.string().min(1),
      complexity: z.enum(["simple", "complex"]),
    }),
  ),
});

const VerdictSchema = z.object({
  verdict: z.enum(["supported", "refuted", "misleading", "unverified"]),
  confidence: z.coerce.number().min(0).max(1),
  explanation: z.string().min(1),
  citations: z.array(z.coerce.number().int()),
});

const TranscriptSchema = z.object({ messages: z.array(z.object({ text: z.string() })) });

const ReportSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
});

/** How much each verdict counts toward the credibility score; unverified claims are left out. */
const VERDICT_VALUE: Record<Verdict, number | undefined> = { supported: 1, misleading: 0.5, refuted: 0, unverified: undefined };

// The model reliably transcribes names and timestamps when told not to, so it gets fields for them
// and the pipeline keeps only each message's text.
const READ_IMAGE_PROMPT = `You read screenshots for a fact-checking pipeline. List every message or post visible in the screenshot, in order.
For each one give:
- "sender": who sent it, if shown, otherwise ""
- "label": any app label such as "Forwarded many times", otherwise ""
- "time": its timestamp, if shown, otherwise ""
- "text": the message body word for word, including any text inside images within it (captions, headlines, chart labels)
Ignore the phone status bar, buttons and message box.
Reply with only JSON: {"messages":[{"sender":"","label":"","time":"","text":"..."}]}
If there is no readable text, reply {"messages":[]}.`;

const EXTRACT_PROMPT = `You are the claim extractor in a fact-checking pipeline.
Read the user's text and list the distinct factual claims that can be checked against public sources: statistics, dates, events, quotes, scientific or medical statements, attributions.
Skip opinions, predictions, jokes, vague statements, and personal anecdotes no public source could confirm (like "my cousin already got paid"). Merge duplicates. Keep at most ${MAX_CLAIMS}, choosing the ones most central to the text's message.
Don't split one statement into several claims: fold appeals to authority like "doctors are warning" or "scientists say" into the claim they support.
For each claim give:
- "claim": one self-contained sentence that makes sense without the original text (replace "he", "this", etc. with what they refer to).
- "query": a web search query that would find evidence for or against it.
- "complexity": "simple" if one reliable source can settle it (a date, a number, who said what); "complex" if it needs weighing several sources, causal reasoning, statistics in context, or is likely partly true.
Reply with only JSON: {"claims":[{"claim":"...","query":"...","complexity":"simple"}]}
If there are no checkable claims, reply {"claims":[]}.`;

const verifyPrompt = () => `You are a careful fact-checker. Today's date is ${new Date().toISOString().slice(0, 10)}.
Judge one claim using only the numbered sources provided, not your own memory.
Verdicts:
- "supported": the sources confirm the claim as stated.
- "refuted": the sources contradict it.
- "misleading": partly true, missing important context, or exaggerated.
- "unverified": the sources don't settle it either way.
Judge the substance, not the wording: a rounded or approximate figure that matches the precise one counts as supported. Don't refute a claim over trivial differences in precision or phrasing.
"confidence": a number from 0 to 1 for how sure you are the verdict is right, given these sources.
"explanation": 2-3 plain sentences a non-expert can follow, citing sources inline like [1].
"citations": the source numbers you relied on.
Reply with only JSON: {"verdict":"...","confidence":0.0,"explanation":"...","citations":[1]}`;

const REPORT_PROMPT = `You write the summary card for a fact-check. You get the claims, their verdicts, and a credibility score: the share of checkable claims that hold up, from 0 (all false) to 100 (all accurate). Reply with:
- "headline": a verdict on the text overall, at most 8 words, consistent with the score.
- "summary": 2 sentences on what holds up and what doesn't.
Reply with only JSON: {"headline":"...","summary":"..."}`;

export async function runCheck(input: { text?: string; url?: string; image?: string }, emit: Emit, signal?: AbortSignal) {
  const started = Date.now();

  let text = input.text?.trim() ?? "";
  if (input.url) {
    const t0 = Date.now();
    text = await extractArticle(input.url, signal);
    emit({ type: "trace", step: { id: "read-url", label: "Read article", provider: "tavily", ms: Date.now() - t0 } });
  }
  if (input.image) {
    const read = await chatJSON({
      id: "read-image",
      label: "Read screenshot",
      tier: "vision",
      system: READ_IMAGE_PROMPT,
      user: [
        { type: "text", text: "Read this screenshot." },
        { type: "image_url", image_url: { url: input.image } },
      ],
      schema: TranscriptSchema,
      maxTokens: 2048,
      thinking: false,
      signal,
    });
    emit({ type: "trace", step: read.step });
    text = read.data.messages
      .map((m) => m.text.trim())
      .filter(Boolean)
      .join("\n\n");
    emit({ type: "transcript", text });
  }
  text = text.slice(0, MAX_INPUT_CHARS);
  emit({ type: "input", source: input.image ? "image" : input.url ? "url" : "text", chars: text.length });

  const extracted = await chatJSON({
    id: "extract",
    label: "Extract claims",
    tier: "nano",
    system: EXTRACT_PROMPT,
    user: text,
    schema: ClaimsSchema,
    thinking: false,
    signal,
  });
  emit({ type: "trace", step: extracted.step });

  const claims: Claim[] = extracted.data.claims.slice(0, MAX_CLAIMS).map((c, i) => ({
    id: `c${i + 1}`,
    text: c.claim,
    query: c.query,
    complexity: c.complexity,
  }));
  emit({ type: "claims", claims });

  if (claims.length === 0) {
    emit({
      type: "report",
      report: { headline: "No checkable claims found", score: null, summary: "This text doesn't contain factual statements that can be checked against public sources." },
    });
    emit({ type: "done", ms: Date.now() - started });
    return;
  }

  const verdicts = await mapLimit(claims, CONCURRENCY, (claim) => checkClaim(claim, emit, signal));

  const values = verdicts.map((v) => VERDICT_VALUE[v.verdict]).filter((v) => v !== undefined);
  const score = values.length > 0 ? Math.round((100 * values.reduce((a, b) => a + b, 0)) / values.length) : null;

  const report = await chatJSON({
    id: "report",
    label: "Write report",
    tier: "nano",
    system: REPORT_PROMPT,
    user: JSON.stringify({
      score: score ?? "none of the claims could be verified",
      claims: claims.map((c, i) => ({ claim: c.text, verdict: verdicts[i].verdict })),
    }),
    schema: ReportSchema,
    maxTokens: 1024,
    thinking: false,
    signal,
  });
  emit({ type: "trace", step: report.step });
  emit({ type: "report", report: { ...report.data, score } });
  emit({ type: "done", ms: Date.now() - started });
}

async function checkClaim(claim: Claim, emit: Emit, signal?: AbortSignal): Promise<ClaimVerdict> {
  try {
    const t0 = Date.now();
    const sources = await searchEvidence(claim.query, signal);
    emit({ type: "trace", step: { id: `${claim.id}-search`, label: `Search: ${claim.query}`, provider: "tavily", ms: Date.now() - t0 } });
    emit({ type: "sources", claimId: claim.id, sources });

    if (sources.length === 0) {
      return finish(emit, {
        claimId: claim.id,
        verdict: "unverified",
        confidence: 0,
        explanation: "The web search found no sources about this claim.",
        citations: [],
        tier: "nano",
        model: "",
        escalated: false,
      });
    }

    // Router: complex claims go straight to Ultra; simple ones start on Super and escalate if Super is unsure.
    const first: Tier = claim.complexity === "complex" ? "ultra" : "super";
    emit({
      type: "routing",
      claimId: claim.id,
      tier: first,
      reason: first === "ultra" ? "Complex claim, sent straight to Ultra" : "Simple claim, Super checks first",
    });
    let result = await verify(claim, sources, first, signal);
    emit({ type: "trace", step: result.step });

    let tier = first;
    const canEscalate = modelFor("ultra") !== modelFor("super");
    if (first === "super" && canEscalate && result.data.confidence < ESCALATE_BELOW) {
      emit({
        type: "routing",
        claimId: claim.id,
        tier: "ultra",
        reason: `Super was only ${Math.round(result.data.confidence * 100)}% confident, escalating to Ultra`,
      });
      result = await verify(claim, sources, "ultra", signal);
      emit({ type: "trace", step: result.step });
      tier = "ultra";
    }

    return finish(emit, {
      claimId: claim.id,
      ...result.data,
      citations: result.data.citations.filter((n) => sources.some((s) => s.n === n)),
      tier,
      model: result.model,
      escalated: tier !== first,
      reasoning: result.reasoning,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    return finish(emit, {
      claimId: claim.id,
      verdict: "unverified",
      confidence: 0,
      explanation: `This claim couldn't be checked: ${err instanceof Error ? err.message : "unknown error"}`,
      citations: [],
      tier: "nano",
      model: "",
      escalated: false,
    });
  }
}

function verify(claim: Claim, sources: Source[], tier: Tier, signal?: AbortSignal) {
  const evidence = sources.map((s) => `[${s.n}] ${s.title} (${s.url})\n${s.snippet}`).join("\n\n");
  return chatJSON({
    id: `${claim.id}-verify-${tier}`,
    label: `Verify: ${claim.text}`,
    tier,
    system: verifyPrompt(),
    user: `Claim: ${claim.text}\n\nSources:\n${evidence}`,
    schema: VerdictSchema,
    maxTokens: tier === "ultra" ? 8192 : 4096,
    signal,
  });
}

function finish(emit: Emit, verdict: ClaimVerdict) {
  emit({ type: "verdict", verdict });
  return verdict;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
