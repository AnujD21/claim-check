// Best-effort limits so a public demo can't burn through the Token Factory and Tavily credits.
// Counters live in memory, so each server instance keeps its own; that's enough to stop casual abuse.

const HOUR = 60 * 60 * 1000;
const PER_IP_PER_HOUR = Number(process.env.CHECKS_PER_IP_PER_HOUR) || 10;
const PER_DAY = Number(process.env.CHECKS_PER_DAY) || 40;

const recentByIp = new Map<string, number[]>();
let day = "";
let checksToday = 0;

/** Records one check for `ip`, or returns the reason it's over a limit. */
export function takeCheck(ip: string, now = Date.now()): string | null {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    checksToday = 0;
  }
  if (checksToday >= PER_DAY) {
    return "Claim Check has used up today's free checks. Please come back tomorrow.";
  }

  const recent = (recentByIp.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= PER_IP_PER_HOUR) {
    return `You've run ${PER_IP_PER_HOUR} checks in the last hour. Please try again a little later.`;
  }

  recent.push(now);
  recentByIp.set(ip, recent);
  checksToday++;

  if (recentByIp.size > 5000) {
    for (const [key, times] of recentByIp) {
      if (times.every((t) => now - t >= HOUR)) recentByIp.delete(key);
    }
  }
  return null;
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
