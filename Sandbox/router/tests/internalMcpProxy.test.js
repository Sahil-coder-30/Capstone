// Tests of the router's internal MCP path (AI service -> router -> sidecar)
// with a real HTTP server standing in for the sandbox sidecar.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createInternalMcpProxy } from "../src/internalMcpProxy.js";

const SANDBOX = "sbx-int";
const SECRET = "internal-secret";

const upstreamSeen = [];
const upstream = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  upstreamSeen.push({ method: req.method, path: req.url, headers: req.headers, body });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
after(() => upstream.close());

const refreshed = [];
let refreshFails = false;
const refreshTTL = async (id) => {
  if (refreshFails) throw new Error("redis down");
  refreshed.push(id);
};

const makeApp = (env) => {
  const app = express();
  app.all("/internal/sandboxes/:sandboxId/mcp", createInternalMcpProxy({ refreshTTL, env }));
  return app;
};

const env = {
  INTERNAL_SERVICE_TOKEN: SECRET,
  SANDBOX_URL_TEMPLATE: `http://127.0.0.1:${upstream.address().port}`,
};
const server = makeApp(env).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
after(() => server.close());
const base = `http://127.0.0.1:${server.address().port}`;

const call = (path, headers = {}, init = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    ...init,
  });

const reset = () => {
  upstreamSeen.length = 0;
  refreshed.length = 0;
  refreshFails = false;
};

test("a call with the internal token refreshes the TTL and reaches the sidecar's /mcp", async () => {
  reset();
  const res = await call(`/internal/sandboxes/${SANDBOX}/mcp`, {
    "X-Internal-Token": SECRET,
    Authorization: "Bearer sandbox-token",
    Cookie: "session=abc",
  });
  assert.equal(res.status, 200);
  assert.deepEqual(refreshed, [SANDBOX]);
  assert.equal(upstreamSeen.length, 1);
  const seen = upstreamSeen[0];
  assert.equal(seen.path, "/mcp");
  assert.equal(seen.headers.authorization, "Bearer sandbox-token", "the sandbox token goes upstream");
  assert.equal(seen.headers["x-internal-token"], undefined, "the internal token never reaches the sandbox");
  assert.equal(seen.headers.cookie, undefined);
  assert.match(seen.body, /tools\/list/, "the JSON-RPC body is passed through untouched");
});

test("missing or wrong internal token is refused and nothing is refreshed", async () => {
  reset();
  assert.equal((await call(`/internal/sandboxes/${SANDBOX}/mcp`)).status, 401);
  assert.equal((await call(`/internal/sandboxes/${SANDBOX}/mcp`, { "X-Internal-Token": "wrong" })).status, 401);
  assert.equal(refreshed.length, 0);
  assert.equal(upstreamSeen.length, 0);
});

test("fails closed when the router has no internal token configured", async () => {
  reset();
  const s = makeApp({ ...env, INTERNAL_SERVICE_TOKEN: "" }).listen(0, "127.0.0.1");
  await new Promise((r) => s.once("listening", r));
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/internal/sandboxes/${SANDBOX}/mcp`, {
      method: "POST",
      headers: { "X-Internal-Token": "" },
    });
    assert.equal(res.status, 503);
    assert.equal(upstreamSeen.length, 0);
  } finally {
    s.close();
  }
});

test("public sandbox hosts can not use the internal path, even with the token", async () => {
  reset();
  for (const host of [`${SANDBOX}.agent.localhost`, `${SANDBOX}.preview.takshacodespace.in`]) {
    // fetch() ignores a custom Host header, so use http.request.
    const status = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/internal/sandboxes/${SANDBOX}/mcp`, {
        method: "POST",
        headers: { "X-Internal-Token": SECRET, Host: host },
      }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject);
      req.end("{}");
    });
    assert.equal(status, 404, host);
  }
  assert.equal(upstreamSeen.length, 0);
});

test("a sandbox id that is not a plain DNS label is refused", async () => {
  reset();
  const res = await call(`/internal/sandboxes/${encodeURIComponent("x@10.0.0.5")}/mcp`, { "X-Internal-Token": SECRET });
  assert.equal(res.status, 404);
  assert.equal(upstreamSeen.length, 0);
});

test("a failed TTL refresh does not fail the tool call", async () => {
  reset();
  refreshFails = true;
  const res = await call(`/internal/sandboxes/${SANDBOX}/mcp`, { "X-Internal-Token": SECRET, Authorization: "Bearer t" });
  assert.equal(res.status, 200);
  assert.equal(upstreamSeen.length, 1);
});

test("GET and DELETE (MCP session stream and close) are passed through too", async () => {
  reset();
  for (const method of ["GET", "DELETE"]) {
    const res = await fetch(`${base}/internal/sandboxes/${SANDBOX}/mcp`, { method, headers: { "X-Internal-Token": SECRET } });
    assert.equal(res.status, 200, method);
  }
  assert.deepEqual(upstreamSeen.map((s) => s.method), ["GET", "DELETE"]);
});
