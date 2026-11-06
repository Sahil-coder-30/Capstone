// Tests of the router's MCP gateway with a fake Redis, fake internal
// services (Auth, Sandbox server) and a real HTTP server standing in for the
// sandbox sidecar, so the proxy path is exercised for real.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import { createMcpGateway } from "../src/mcpGateway.js";

const SANDBOX = "sbx-gw";
const TOKEN = `tks_mcp_${"a".repeat(43)}`;
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const record = (over = {}) => ({
  id: "tok1", userId: "65f0c0ffee0000000000abcd", projectId: "p1", sandboxId: SANDBOX,
  scopes: ["read", "write"], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), ...over,
});

// ── Upstream sidecar stand-in ───────────────────────────────────────────────
const upstreamSeen = [];
const upstream = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  upstreamSeen.push({ path: req.url, auth: req.headers.authorization, cookie: req.headers.cookie, body });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
after(() => upstream.close());

// ── Fakes ───────────────────────────────────────────────────────────────────
const kv = new Map();
const redis = {
  get: async (k) => kv.get(k) ?? null,
  set: async (k, v) => kv.set(k, v),
  incr: async (k) => { kv.set(k, (kv.get(k) || 0) + 1); return kv.get(k); },
  expire: async () => 1,
  exists: async (k) => (kv.has(k) ? 1 : 0),
};
const internal = { minted: [], wakes: 0, lookups: 0, ready: true };
const fakeFetch = async (url, init = {}) => {
  const u = new URL(url);
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  assert.equal(u.pathname.endsWith("/api/agent/ready") || init.headers?.["X-Internal-Token"] === "internal-secret", true, "internal calls carry the shared token");
  if (u.pathname === "/internal/sandbox-token") {
    const body = JSON.parse(init.body);
    internal.minted.push(body);
    return json(200, { token: `sandbox-token-${internal.minted.length}`, expiresIn: 600 });
  }
  if (u.pathname.startsWith("/internal/mcp-tokens/")) {
    internal.lookups += 1;
    return json(404, { status: "error" });
  }
  if (u.pathname.endsWith("/wake")) {
    internal.wakes += 1;
    kv.set(`sandbox:${SANDBOX}`, "{}");
    return json(202, { state: "starting" });
  }
  if (u.pathname.endsWith("/api/agent/ready")) return json(internal.ready ? 200 : 503, {});
  throw new Error(`unexpected fetch ${url}`);
};

const refreshed = [];
const gateway = createMcpGateway({
  redis,
  refreshTTL: async (id) => refreshed.push(id),
  fetch: fakeFetch,
  env: {
    INTERNAL_SERVICE_TOKEN: "internal-secret",
    SANDBOX_URL_TEMPLATE: `http://127.0.0.1:${upstream.address().port}`,
  },
  options: { callsPerMinute: 5, wakeTimeoutMs: 300, readyPollMs: 50, readyCacheMs: 0 },
});
const app = express();
app.all("/api/mcp/:sandboxId", gateway);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
after(() => server.close());
const base = `http://127.0.0.1:${server.address().port}/api/mcp`;

const call = (sandboxId, { token = TOKEN, method = "POST", cookie } = {}) =>
  fetch(`${base}/${sandboxId}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cookie && { Cookie: cookie }),
    },
    body: method === "POST" ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) : undefined,
  });

test("a valid token reaches the sidecar's /mcp with a scoped sandbox token, never the MCP token", async () => {
  kv.set(`mcptoken:${hash(TOKEN)}`, JSON.stringify(record()));
  kv.set(`sandbox:${SANDBOX}`, "{}");

  const res = await call(SANDBOX, { cookie: "session=secret" });
  assert.equal(res.status, 200);
  const seen = upstreamSeen.at(-1);
  assert.equal(seen.path, "/mcp");
  assert.equal(seen.auth, "Bearer sandbox-token-1");
  assert.equal(seen.cookie, undefined, "cookies are stripped");
  assert.match(seen.body, /tools\/list/);
  assert.deepEqual(internal.minted[0].scopes, ["read", "write"]);
  assert.ok(refreshed.includes(SANDBOX), "the sandbox stays alive while used");
  assert.ok(kv.has("mcptoken-used:tok1"), "last use is recorded");

  await call(SANDBOX);
  assert.equal(internal.minted.length, 1, "the sandbox token is reused until it nears expiry");
});

test("missing, unknown, expired or other-project tokens are refused", async () => {
  assert.equal((await call(SANDBOX, { token: null })).status, 401);
  assert.equal((await call(SANDBOX, { token: "not-an-mcp-token" })).status, 401);

  const unknown = `tks_mcp_${"b".repeat(43)}`;
  assert.equal((await call(SANDBOX, { token: unknown })).status, 401);
  assert.equal(internal.lookups, 1, "a cache miss asks the Sandbox server");

  const expired = `tks_mcp_${"c".repeat(43)}`;
  kv.set(`mcptoken:${hash(expired)}`, JSON.stringify(record({ id: "tok2", expiresAt: new Date(Date.now() - 1000).toISOString() })));
  assert.equal((await call(SANDBOX, { token: expired })).status, 401);

  assert.equal((await call("sbx-someone-else")).status, 403);
  assert.equal((await call("Bad@Id")).status, 404);
  assert.equal((await call(SANDBOX, { method: "GET" })).status, 405);
});

test("rate limit per token", async () => {
  const limited = `tks_mcp_${"d".repeat(43)}`;
  kv.set(`mcptoken:${hash(limited)}`, JSON.stringify(record({ id: "tok3" })));
  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await call(SANDBOX, { token: limited })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

test("a stopped sandbox is woken first; if it does not get ready in time the client is told to retry", async () => {
  const sleeper = `tks_mcp_${"e".repeat(43)}`;
  kv.set(`mcptoken:${hash(sleeper)}`, JSON.stringify(record({ id: "tok4" })));
  kv.delete(`sandbox:${SANDBOX}`);
  const woken = await call(SANDBOX, { token: sleeper });
  assert.equal(woken.status, 200);
  assert.equal(internal.wakes, 1);

  kv.delete(`sandbox:${SANDBOX}`);
  internal.ready = false;
  const slow = await call(SANDBOX, { token: sleeper });
  assert.equal(slow.status, 503);
  assert.equal(slow.headers.get("retry-after"), "15");
  internal.ready = true;
});
