import type { Tier, Verdict } from "./types";

export const VERDICTS: Record<Verdict, { label: string; badge: string; bar: string }> = {
  supported: { label: "Supported", badge: "text-supported bg-supported/10 ring-supported/25", bar: "bg-supported" },
  refuted: { label: "False", badge: "text-refuted bg-refuted/10 ring-refuted/25", bar: "bg-refuted" },
  misleading: { label: "Misleading", badge: "text-misleading bg-misleading/10 ring-misleading/25", bar: "bg-misleading" },
  unverified: { label: "Unverified", badge: "text-unverified bg-unverified/10 ring-unverified/25", bar: "bg-unverified" },
};

export const TIERS: Record<Tier, { label: string; short: string; text: string; dot: string }> = {
  nano: { label: "Nemotron Nano", short: "Nano", text: "text-nano", dot: "bg-nano" },
  super: { label: "Nemotron Super", short: "Super", text: "text-super", dot: "bg-super" },
  ultra: { label: "Nemotron Ultra", short: "Ultra", text: "text-ultra", dot: "bg-ultra" },
  vision: { label: "Nemotron Super VL", short: "Vision", text: "text-vision", dot: "bg-vision" },
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
