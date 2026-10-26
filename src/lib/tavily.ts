import type { Source } from "./types";

const TAVILY_API = "https://api.tavily.com";

// Social and video sites mostly repeat the claim being checked rather than evidence about it.
const EXCLUDED_DOMAINS = ["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "reddit.com", "youtube.com", "quora.com", "pinterest.com"];

async function tavily<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${TAVILY_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Tavily ${path} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

/** Live web search for evidence about one claim. */
export async function searchEvidence(query: string, signal?: AbortSignal): Promise<Source[]> {
  const data = await tavily<{ results: { title: string; url: string; content: string }[] }>(
    "/search",
    { query, search_depth: "advanced", max_results: 5, include_answer: false, exclude_domains: EXCLUDED_DOMAINS },
    signal,
  );
  return data.results.map((r, i) => ({ n: i + 1, title: r.title, url: r.url, snippet: r.content.slice(0, 1200) }));
}

/** Pulls the readable text out of an article URL. */
export async function extractArticle(url: string, signal?: AbortSignal): Promise<string> {
  const data = await tavily<{ results: { url: string; raw_content: string }[] }>("/extract", { urls: [url] }, signal);
  const content = data.results[0]?.raw_content?.trim();
  if (!content) throw new Error("Couldn't read that page. Try pasting the text instead.");
  return content;
}
