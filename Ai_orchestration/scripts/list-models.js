// Lists the NVIDIA models this API key can use.
// Usage: npm run list:models [filter]   e.g. npm run list:models -- coder
// The key itself is never printed.

import "dotenv/config";

const key = process.env.NVIDIA_API_KEY?.trim();
if (!key) {
  console.error("NVIDIA_API_KEY is not set.");
  process.exit(1);
}

const baseUrl = process.env.NVIDIA_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1";
const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const filter = (process.argv[2] || "").toLowerCase();
const ids = (await res.json()).data.map((m) => m.id).filter((id) => id.toLowerCase().includes(filter)).sort();
console.log(ids.join("\n"));
console.log(`\n${ids.length} model(s)`);
