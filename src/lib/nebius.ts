import OpenAI from "openai";
import type { z } from "zod";
import type { Tier, TraceStep } from "./types";

// Token Factory speaks the OpenAI chat-completions protocol, so the official SDK works with a custom base URL.
let client: OpenAI | undefined;

function getClient() {
  client ??= new OpenAI({
    baseURL: process.env.NEBIUS_API_BASE || "https://api.tokenfactory.nebius.com/v1/",
    apiKey: process.env.NEBIUS_API_KEY,
  });
  return client;
}

const CONFIGURED: Record<Tier, string | undefined> = {
  nano: process.env.NEMOTRON_NANO_MODEL,
  super: process.env.NEMOTRON_SUPER_MODEL,
  ultra: process.env.NEMOTRON_ULTRA_MODEL,
};

// If a tier isn't configured, fall back to the next one so the app still runs with a single model.
const FALLBACKS: Record<Tier, Tier[]> = {
  nano: ["nano", "super", "ultra"],
  super: ["super", "nano", "ultra"],
  ultra: ["ultra", "super", "nano"],
};

export function modelFor(tier: Tier): string {
  for (const t of FALLBACKS[tier]) {
    const id = CONFIGURED[t];
    if (id) return id;
  }
  throw new Error("No Nemotron model configured. Set NEMOTRON_NANO_MODEL, NEMOTRON_SUPER_MODEL or NEMOTRON_ULTRA_MODEL.");
}

export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.NEBIUS_API_KEY) missing.push("NEBIUS_API_KEY");
  if (!process.env.TAVILY_API_KEY) missing.push("TAVILY_API_KEY");
  if (!CONFIGURED.nano && !CONFIGURED.super && !CONFIGURED.ultra) missing.push("NEMOTRON_*_MODEL");
  return missing;
}

interface JSONCall<T> {
  id: string;
  label: string;
  tier: Tier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  /** Nemotron 3 thinks before answering by default; turning it off makes quick calls about 3x faster. */
  thinking?: boolean;
  signal?: AbortSignal;
}

export interface JSONResult<T> {
  data: T;
  model: string;
  reasoning?: string;
  step: TraceStep;
}

/** Calls a Nemotron model, parses its JSON reply against `schema`, and retries once with the validation error if it doesn't match. */
export async function chatJSON<T>(call: JSONCall<T>): Promise<JSONResult<T>> {
  const model = modelFor(call.tier);
  const started = Date.now();
  const tokens = { prompt: 0, completion: 0 };
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: call.system },
    { role: "user", content: call.user },
  ];
  let problem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const body: OpenAI.ChatCompletionCreateParamsNonStreaming & { chat_template_kwargs?: { enable_thinking: boolean } } = {
      model,
      messages,
      max_tokens: call.maxTokens ?? 4096,
      temperature: 0.2,
    };
    if (call.thinking === false) body.chat_template_kwargs = { enable_thinking: false };
    const res = await getClient().chat.completions.create(body, { signal: call.signal });
    tokens.prompt += res.usage?.prompt_tokens ?? 0;
    tokens.completion += res.usage?.completion_tokens ?? 0;

    const message = res.choices[0]?.message as (OpenAI.ChatCompletionMessage & ReasoningFields) | undefined;
    const raw = message?.content ?? "";
    const { answer, reasoning } = splitReasoning(raw, message?.reasoning ?? message?.reasoning_content);
    const parsed = call.schema.safeParse(parseJSON(answer));
    if (parsed.success) {
      return {
        data: parsed.data,
        model,
        reasoning,
        step: { id: call.id, label: call.label, provider: "nebius", tier: call.tier, model, ms: Date.now() - started, tokens },
      };
    }

    problem = parsed.error.issues.map((i) => `${i.path.join(".") || "reply"}: ${i.message}`).join("; ");
    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: `That reply didn't match the required JSON (${problem}). Reply with only the corrected JSON object.` },
    );
  }

  throw new Error(`${call.label}: ${model} returned invalid JSON (${problem})`);
}

// Token Factory returns Nemotron's thinking in `reasoning`; other vLLM deployments use `reasoning_content` or inline <think>…</think>.
interface ReasoningFields {
  reasoning?: string;
  reasoning_content?: string;
}

function splitReasoning(content: string, reasoningContent?: string) {
  const end = content.indexOf("</think>");
  if (end === -1) return { answer: content, reasoning: reasoningContent?.trim() || undefined };
  return {
    answer: content.slice(end + "</think>".length),
    reasoning: content.slice(0, end).replace("<think>", "").trim() || reasoningContent?.trim(),
  };
}

function parseJSON(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
