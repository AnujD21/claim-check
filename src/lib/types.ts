export type Tier = "nano" | "super" | "ultra" | "vision";

export type Verdict = "supported" | "refuted" | "misleading" | "unverified";

export interface Claim {
  id: string;
  text: string;
  query: string;
  complexity: "simple" | "complex";
}

export interface Source {
  n: number;
  title: string;
  url: string;
  snippet: string;
}

export interface ClaimVerdict {
  claimId: string;
  verdict: Verdict;
  confidence: number;
  explanation: string;
  citations: number[];
  tier: Tier;
  model: string;
  escalated: boolean;
  reasoning?: string;
}

export interface Report {
  headline: string;
  /** Share of checkable claims that hold up: 0 = all false, 100 = all accurate. Null when nothing could be verified. */
  score: number | null;
  summary: string;
}

export interface TraceStep {
  id: string;
  label: string;
  provider: "nebius" | "tavily";
  tier?: Tier;
  model?: string;
  ms: number;
  tokens?: { prompt: number; completion: number };
}

/** One line of the NDJSON stream sent by /api/check. */
export type CheckEvent =
  | { type: "input"; source: "text" | "url" | "image"; chars: number }
  | { type: "transcript"; text: string }
  | { type: "claims"; claims: Claim[] }
  | { type: "sources"; claimId: string; sources: Source[] }
  | { type: "routing"; claimId: string; tier: Tier; reason: string }
  | { type: "verdict"; verdict: ClaimVerdict }
  | { type: "report"; report: Report }
  | { type: "trace"; step: TraceStep }
  | { type: "error"; message: string }
  | { type: "done"; ms: number };
