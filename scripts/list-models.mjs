// Lists the models your Token Factory key can use, NVIDIA ones first.
// Run: npm run models
const base = (process.env.NEBIUS_API_BASE || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, "");
const key = process.env.NEBIUS_API_KEY;
if (!key) {
  console.error("Set NEBIUS_API_KEY in .env.local first.");
  process.exit(1);
}

const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`Token Factory returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { data } = await res.json();
const ids = data.map((m) => m.id).sort();
const nvidia = ids.filter((id) => /nvidia|nemotron/i.test(id));

console.log("NVIDIA models on your key:");
console.log(nvidia.length ? nvidia.map((id) => `  ${id}`).join("\n") : "  (none found)");
console.log(`\n${ids.length} models available in total.`);
