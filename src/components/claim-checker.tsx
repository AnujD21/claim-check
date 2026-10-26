"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import type { CheckEvent, Report, TraceStep } from "@/lib/types";
import { TIERS } from "@/lib/ui";
import { ClaimCard, type ClaimState } from "./claim-card";
import { ReportCard } from "./report-card";
import { TracePanel } from "./trace-panel";

interface State {
  status: "idle" | "running" | "done" | "error";
  claims: ClaimState[];
  trace: TraceStep[];
  report?: Report;
  error?: string;
  ms?: number;
}

type Action = { type: "start" } | { type: "event"; event: CheckEvent } | { type: "fail"; message: string };

const INITIAL: State = { status: "idle", claims: [], trace: [] };

function reducer(state: State, action: Action): State {
  if (action.type === "start") return { ...INITIAL, status: "running" };
  if (action.type === "fail") return { ...state, status: "error", error: action.message };

  const e = action.event;
  const updateClaim = (id: string, fn: (c: ClaimState) => ClaimState) => ({
    ...state,
    claims: state.claims.map((c) => (c.claim.id === id ? fn(c) : c)),
  });

  switch (e.type) {
    case "input":
      return state;
    case "claims":
      return { ...state, claims: e.claims.map((claim) => ({ claim, routes: [] })) };
    case "sources":
      return updateClaim(e.claimId, (c) => ({ ...c, sources: e.sources }));
    case "routing":
      return updateClaim(e.claimId, (c) => ({ ...c, routes: [...c.routes, { tier: e.tier, reason: e.reason }] }));
    case "verdict":
      return updateClaim(e.verdict.claimId, (c) => ({ ...c, verdict: e.verdict }));
    case "report":
      return { ...state, report: e.report };
    case "trace":
      return { ...state, trace: [...state.trace, e.step] };
    case "error":
      return { ...state, status: "error", error: e.message };
    case "done":
      return { ...state, status: "done", ms: e.ms };
  }
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CheckEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as CheckEvent;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as CheckEvent;
}

export function ClaimChecker() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [mode, setMode] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const running = state.status === "running";
  const input = mode === "text" ? text.trim() : url.trim();

  // Bring the results into view as soon as a check starts, so the live progress isn't hidden below the fold.
  useEffect(() => {
    if (state.status !== "running") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [state.status]);

  async function check() {
    if (!input || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "start" });

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "text" ? { text: input } : { url: input }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `The check failed (${res.status}).`);
      }
      let finished = false;
      for await (const event of readEvents(res.body)) {
        if (event.type === "done" || event.type === "error") finished = true;
        dispatch({ type: "event", event });
      }
      if (!finished) throw new Error("The connection dropped before the check finished.");
    } catch (err) {
      dispatch({
        type: "fail",
        message: controller.signal.aborted ? "You stopped this check." : err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2 py-6">
        <span className="font-serif text-2xl">Claim Check</span>
        <span className="text-xs text-muted">NVIDIA Nemotron · Nebius Token Factory · Tavily</span>
      </header>

      <section className="pt-6 pb-8 sm:pt-12 sm:pb-10">
        <h1 className="max-w-3xl font-serif text-[2.75rem] leading-[1.05] tracking-tight sm:text-6xl">
          Paste it. We&rsquo;ll check every claim.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Claim Check pulls out each factual claim, searches the live web for evidence, and has NVIDIA Nemotron models
          weigh it, with sources you can click.
        </p>
      </section>

      <form
        className="rounded-2xl border border-line bg-surface"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <div className="flex gap-1 p-2" role="tablist" aria-label="Input type">
          {(["text", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${mode === m ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
            >
              {m === "text" ? "Paste text" : "Article URL"}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                check();
              }
            }}
            rows={6}
            maxLength={20000}
            placeholder="Paste a forwarded message, a post, a speech or an article…"
            aria-label="Text to fact-check"
            className="block w-full resize-y bg-transparent px-5 py-2 text-[1.05rem] leading-relaxed outline-none placeholder:text-muted/70"
          />
        ) : (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/news/article"
            aria-label="Article URL to fact-check"
            className="block w-full bg-transparent px-5 py-4 text-[1.05rem] outline-none placeholder:text-muted/70"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                disabled={running}
                onClick={() => {
                  setMode("text");
                  setText(ex.text);
                }}
                className="rounded-full border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-full px-4 py-2 text-sm text-muted hover:text-ink"
              >
                Stop
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!input || running}
              className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {running ? "Checking…" : "Check claims"}
            </button>
          </div>
        </div>
      </form>

      {state.status === "idle" ? (
        <HowItWorks />
      ) : (
        <div ref={resultsRef} className="mt-8 grid scroll-mt-6 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4" aria-live="polite">
            {state.error ? (
              <p role="alert" className="rounded-2xl border border-refuted/30 bg-refuted/5 px-5 py-4 text-sm text-refuted">
                {state.error}
              </p>
            ) : null}
            {state.claims.length > 0 || running ? (
              <ReportCard
                report={state.report}
                verdicts={state.claims.map((c) => c.verdict?.verdict)}
                running={running}
                ms={state.ms}
              />
            ) : null}
            {running && state.claims.length === 0 ? (
              <p className="flex items-center gap-2 px-1 text-sm text-muted">
                <span className="size-2 rounded-full bg-nano motion-safe:animate-pulse" />
                Nemotron Nano is reading the text and pulling out the claims…
              </p>
            ) : null}
            {state.claims.map((c, i) => (
              <ClaimCard key={c.claim.id} index={i} state={c} />
            ))}
          </div>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <TracePanel trace={state.trace} running={running} />
          </div>
        </div>
      )}
    </main>
  );
}

function HowItWorks() {
  const steps = [
    {
      dot: TIERS.nano.dot,
      title: "Nemotron Nano pulls out the claims",
      body: "Each checkable statement becomes its own search, and Nano rates how hard it will be to settle.",
    },
    {
      dot: "bg-tavily",
      title: "Tavily searches the live web",
      body: "Up to five fresh sources per claim, fetched for every check rather than recalled from training data.",
    },
    {
      dot: TIERS.ultra.dot,
      title: "Super or Ultra gives the verdict",
      body: "Simple claims go to Super. Complex ones, and any Super isn't sure about, go to Ultra for deeper reasoning.",
    },
  ];
  return (
    <ol className="mt-10 grid gap-4 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-2xl border border-line p-5">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${s.dot}`} />
            <span className="font-mono text-xs text-muted">0{i + 1}</span>
          </div>
          <h2 className="mt-3 font-medium">{s.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
