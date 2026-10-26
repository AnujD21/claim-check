import type { Tier, Verdict } from "./types";

export const VERDICTS: Record<Verdict, { label: string; badge: string; bar: string }> = {
  supported: { label: "Supported", badge: "text-supported bg-supported/10 ring-supported/25", bar: "bg-supported" },
  refuted: { label: "False", badge: "text-refuted bg-refuted/10 ring-refuted/25", bar: "bg-refuted" },
  misleading: { label: "Misleading", badge: "text-misleading bg-misleading/10 ring-misleading/25", bar: "bg-misleading" },
  unverified: { label: "Unverified", badge: "text-unverified bg-unverified/10 ring-unverified/25", bar: "bg-unverified" },
};

export const TIERS: Record<Tier, { label: string; role: string; text: string; dot: string }> = {
  nano: { label: "Nemotron Nano", role: "Pulls out claims, writes the report", text: "text-nano", dot: "bg-nano" },
  super: { label: "Nemotron Super", role: "Checks simple claims", text: "text-super", dot: "bg-super" },
  ultra: { label: "Nemotron Ultra", role: "Reasons through complex or uncertain claims", text: "text-ultra", dot: "bg-ultra" },
};

/** "nvidia/Nemotron-3-Super-..." → "Nemotron-3-Super-..." */
export function shortModel(id?: string) {
  return id ? id.slice(id.lastIndexOf("/") + 1) : "";
}

export function formatMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
