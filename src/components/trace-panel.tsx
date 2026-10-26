import type { Tier, TraceStep } from "@/lib/types";
import { TIERS, formatMs } from "@/lib/ui";

export function TracePanel({ trace, running }: { trace: TraceStep[]; running: boolean }) {
  const calls = (tier: Tier) => trace.filter((s) => s.tier === tier).length;
  const searches = trace.filter((s) => s.provider === "tavily").length;
  const tokens = trace.reduce((sum, s) => sum + (s.tokens ? s.tokens.prompt + s.tokens.completion : 0), 0);

  return (
    <aside className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium">Agent trace</h2>
      <p className="mt-0.5 text-sm text-muted">Every model call and web search in this check.</p>

      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
        {(["nano", "super", "ultra"] as const).map((tier) => (
          <div key={tier} className="rounded-lg bg-surface-2 px-1 py-2">
            <dt className={`text-xs ${TIERS[tier].text}`}>{TIERS[tier].label.replace("Nemotron ", "")}</dt>
            <dd className="font-mono text-lg tabular-nums">{calls(tier)}</dd>
          </div>
        ))}
        <div className="rounded-lg bg-surface-2 px-1 py-2">
          <dt className="text-xs text-tavily">Tavily</dt>
          <dd className="font-mono text-lg tabular-nums">{searches}</dd>
        </div>
      </dl>

      <ol className="mt-4 max-h-[26rem] space-y-3 overflow-auto pr-1">
        {trace.map((step, i) => (
          <li key={`${step.id}-${i}`} className="motion-safe:animate-rise flex gap-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${step.tier ? TIERS[step.tier].dot : "bg-tavily"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={step.label}>
                {step.label}
              </p>
              <p className="truncate text-xs text-muted" title={step.model}>
                <span className={step.tier ? TIERS[step.tier].text : "text-tavily"}>
                  {step.tier ? TIERS[step.tier].label : "Tavily search"}
                </span>
                <span className="font-mono">
                  {" "}
                  · {formatMs(step.ms)}
                  {step.tokens ? ` · ${(step.tokens.prompt + step.tokens.completion).toLocaleString()} tok` : ""}
                </span>
              </p>
            </div>
          </li>
        ))}
        {running ? (
          <li className="flex items-center gap-2.5 text-sm text-muted">
            <span className="size-2 rounded-full bg-muted motion-safe:animate-pulse" />
            Working…
          </li>
        ) : null}
      </ol>

      {trace.length > 0 ? (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          {trace.length} steps · {tokens.toLocaleString()} tokens on Nebius Token Factory
        </p>
      ) : null}
    </aside>
  );
}
