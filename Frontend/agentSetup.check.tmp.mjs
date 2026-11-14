// Temporary self-check for agentSetup.js. Deleted after use.
import assert from "node:assert/strict";
import { AGENTS, manualSnippets } from "./src/features/sandbox/components/agentSetup.js";

const url = "https://taksha.example/api/mcp/019fb816-f820-732c-abdb-5be70d45fced";
const token = "tks_mcp_" + "a".repeat(43);

for (const agent of AGENTS) {
  const prompt = agent.prompt(url, token);
  assert.ok(prompt.includes(url), `${agent.id}: url`);
  assert.ok(prompt.includes(`Bearer ${token}`), `${agent.id}: token`);
  // Every JSON block in the prompt must parse.
  for (const block of prompt.match(/^\{[\s\S]*?^\}/gm) || []) JSON.parse(block);
  console.log(`----- ${agent.label} -----\n${prompt}\n`);
}

const link = AGENTS.find((a) => a.id === "cursor").installLink(url, token);
const config = JSON.parse(atob(decodeURIComponent(new URL(link).searchParams.get("config"))));
assert.deepEqual(config, { url, headers: { Authorization: `Bearer ${token}` } });
console.log("cursor link:", link.slice(0, 80) + "...", "\ndecoded:", config);

for (const s of manualSnippets(url, token)) if (s.code.startsWith("{")) JSON.parse(s.code);
assert.ok(AGENTS[0].prompt(url, "").includes("<your-token>"));
console.log("ALL CHECKS PASSED");
