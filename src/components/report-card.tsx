import type { Report, Verdict } from "@/lib/types";
import { VERDICTS, formatMs } from "@/lib/ui";

interface Props {
  report?: Report;
  verdicts: (Verdict | undefined)[];
  running: boolean;
  ms?: number;
}

export function ReportCard({ report, verdicts, running, ms }: Props) {
  const checked = verdicts.filter(Boolean).length;
  const counts = (Object.keys(VERDICTS) as Verdict[])
    .map((v) => ({ v, n: verdicts.filter((x) => x === v).length }))
    .filter((c) => c.n > 0);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-5">
        {report && report.score !== null ? <ScoreRing score={report.score} /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {report ? "Overall" : running ? "Checking" : "Results"}
          </p>
          <h2 className="mt-1 font-serif text-3xl leading-tight">
            {report?.headline ??
              (verdicts.length === 0 ? "Finding the claims" : `${checked} of ${verdicts.length} claims checked`)}
          </h2>
          {report ? <p className="mt-2 leading-relaxed text-muted">{report.summary}</p> : null}
        </div>
      </div>

      {verdicts.length > 0 ? (
        <div className="mt-5">
          <div className="flex gap-1" aria-hidden>
            {verdicts.map((v, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${v ? VERDICTS[v].bar : "bg-line motion-safe:animate-pulse"}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {counts.map(({ v, n }) => (
              <span key={v} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${VERDICTS[v].bar}`} />
                {n} {VERDICTS[v].label.toLowerCase()}
              </span>
            ))}
            {ms !== undefined ? <span className="ml-auto font-mono text-xs">{formatMs(ms)}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const tone = score >= 70 ? "text-supported" : score >= 40 ? "text-misleading" : "text-refuted";
  return (
    <div className={`relative size-20 shrink-0 ${tone}`} role="img" aria-label={`Credibility score ${score} out of 100`}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-line" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xl font-medium">{Math.round(score)}</span>
    </div>
  );
}
