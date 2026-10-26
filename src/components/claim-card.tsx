import type { Claim, ClaimVerdict, Source, Tier } from "@/lib/types";
import { TIERS, VERDICTS, hostname, shortModel } from "@/lib/ui";

export interface ClaimState {
  claim: Claim;
  sources?: Source[];
  routes: { tier: Tier; reason: string }[];
  verdict?: ClaimVerdict;
}

export function ClaimCard({ index, state }: { index: number; state: ClaimState }) {
  const { claim, sources, routes, verdict } = state;
  const activeTier = routes.at(-1)?.tier;

  return (
    <article className="motion-safe:animate-rise rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
          {verdict ? (
            <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${VERDICTS[verdict.verdict].badge}`}>
              {VERDICTS[verdict.verdict].label}
              {verdict.model ? <span className="opacity-70"> · {Math.round(verdict.confidence * 100)}%</span> : null}
            </span>
          ) : !sources ? (
            <Pending dot="bg-tavily">Searching the web</Pending>
          ) : activeTier ? (
            <Pending dot={TIERS[activeTier].dot}>
              {TIERS[activeTier].label} is weighing {sources.length} sources
            </Pending>
          ) : (
            <Pending dot="bg-muted">Reading sources</Pending>
          )}
        </div>
        {verdict?.model ? (
          <span className={`font-mono text-xs ${TIERS[verdict.tier].text}`} title={verdict.model}>
            {shortModel(verdict.model)}
            {verdict.escalated ? " · escalated" : ""}
          </span>
        ) : null}
      </div>

      <p className="mt-3 font-serif text-xl leading-snug sm:text-[1.4rem]">{claim.text}</p>

      {verdict ? (
        <p className="mt-3 leading-relaxed text-ink/90">
          <Cited text={verdict.explanation} sources={sources ?? []} />
        </p>
      ) : null}

      {routes.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {routes.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted">
              <span className={`size-1.5 shrink-0 rounded-full ${TIERS[r.tier].dot}`} />
              {r.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {(sources?.length ?? 0) > 0 || verdict?.reasoning ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
          {sources && sources.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                {sources.length} sources
              </summary>
              <ol className="mt-2 space-y-2">
                {sources.map((s) => {
                  const cited = verdict?.citations.includes(s.n);
                  return (
                    <li key={s.n} className="flex gap-3 text-sm">
                      <span className="font-mono text-xs text-muted tabular-nums">[{s.n}]</span>
                      <span className="min-w-0">
                        <a href={s.url} target="_blank" rel="noreferrer" className={`hover:underline ${cited ? "font-medium" : ""}`}>
                          {s.title}
                        </a>
                        <span className="block text-xs text-muted">
                          {hostname(s.url)}
                          {cited ? " · cited" : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </details>
          ) : null}
          {verdict?.reasoning ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                How {TIERS[verdict.tier].label} reasoned
              </summary>
              <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-muted">
                {verdict.reasoning}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Pending({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <span className={`size-2 rounded-full motion-safe:animate-pulse ${dot}`} />
      {children}…
    </span>
  );
}

/** Turns "[2]" markers in an explanation into links to the matching source. */
function Cited({ text, sources }: { text: string; sources: Source[] }) {
  return text.split(/(\[\d+\])/).map((part, i) => {
    const n = part.match(/^\[(\d+)\]$/)?.[1];
    const source = n ? sources.find((s) => s.n === Number(n)) : undefined;
    if (!source) return part;
    return (
      <a
        key={i}
        href={source.url}
        target="_blank"
        rel="noreferrer"
        title={source.title}
        className="ml-1 inline-flex min-w-[1.5em] items-center justify-center rounded bg-surface-2 px-1 align-[0.1em] font-mono text-[0.7em] leading-normal text-muted ring-1 ring-line ring-inset hover:bg-line hover:text-ink"
      >
        {n}
      </a>
    );
  });
}
