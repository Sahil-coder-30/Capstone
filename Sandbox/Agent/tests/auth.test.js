// Offline tests of the sidecar auth layer. A throwaway RSA key plays the
// Auth service; no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

import { createTokenVerifier } from "../src/auth/verifyToken.js";
import { corsForEditor, requireOwner, requireOwnerSocket, setVerifierForTesting } from "../src/auth/middleware.js";

const OWNER = "owner-1";
const SANDBOX = "sbx-abc";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "auth-rsa-v1", use: "sig", alg: "RS256" };

const sign = (claims, opts = {}) =>
  jwt.sign({ sub: OWNER, ...claims }, privateKey, {
    algorithm: "RS256",
    keyid: "auth-rsa-v1",
    issuer: "auth.takshacodespace.in",
    audience: "takshacodespace-services",
    expiresIn: "15m",
    ...opts,
  });

let jwksCalls = 0;
const verify = createTokenVerifier({
  ownerId: OWNER,
  sandboxId: SANDBOX,
  fetchJwks: async () => {
    jwksCalls += 1;
    return { keys: [jwk] };
  },
});

const rejects = async (token, status) => {
  await assert.rejects(verify(token), (err) => err.status === status);
};

test("accepts the owner's access token and the owner's sandbox token for this sandbox", async () => {
  assert.equal((await verify(sign({}))).sub, OWNER);
  assert.equal((await verify(sign({ sbx: SANDBOX }, { audience: "taksha-sandbox", expiresIn: "2h" }))).sbx, SANDBOX);
  assert.equal(jwksCalls, 1, "keys are cached by kid");
});

test("rejects other users, other sandboxes and bad tokens", async () => {
  await rejects(sign({ sub: "intruder" }), 403);
  await rejects(sign({ sbx: "sbx-other" }, { audience: "taksha-sandbox" }), 403);
  await rejects(sign({}, { audience: "payments" }), 401);
  await rejects(sign({}, { issuer: "evil" }), 401);
  await rejects(sign({}, { expiresIn: -120 }), 401);
  await rejects(jwt.sign({ sub: OWNER }, "shared-secret", { algorithm: "HS256", keyid: "auth-rsa-v1" }), 401);
  await rejects(sign({}, { keyid: "unknown-kid" }), 401);
  await rejects("not-a-jwt", 401);
  await rejects(undefined, 401);
});

test("fails closed when the sandbox has no owner", async () => {
  const noOwner = createTokenVerifier({ ownerId: "", sandboxId: SANDBOX, fetchJwks: async () => ({ keys: [jwk] }) });
  await assert.rejects(noOwner(sign({})), (err) => err.status === 503);
});

// ── HTTP layer ──────────────────────────────────────────────────────────────

const startApp = async () => {
  setVerifierForTesting(verify);
  const app = express();
  app.use(corsForEditor);
  app.use(requireOwner);
  app.use(express.json());
  app.all(/.*/, (req, res) => res.json({ ok: true, user: req.auth?.sub ?? null }));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};

test("REST: protected routes need the owner token, probes and report-error stay open", async (t) => {
  const { server, url } = await startApp();
  t.after(() => server.close());

  const res = await fetch(`${url}/api/agent/list-files`);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), "Bearer");

  const ok = await fetch(`${url}/api/agent/list-files`, { headers: { Authorization: `Bearer ${sign({})}` } });
  assert.deepEqual(await ok.json(), { ok: true, user: OWNER });

  const other = await fetch(`${url}/api/agent/exec`, { method: "POST", headers: { Authorization: `Bearer ${sign({ sub: "x" })}` } });
  assert.equal(other.status, 403);

  for (const path of ["/api/agent/health", "/api/agent/ready", "/api/agent/report-error"]) {
    assert.equal((await fetch(`${url}${path}`, { method: path.endsWith("error") ? "POST" : "GET" })).status, 200, path);
  }
  assert.equal((await fetch(`${url}/mcp`, { method: "POST" })).status, 401, "anything else is protected");
});

test("REST: CORS preflight from the editor passes without a token, other origins get no CORS headers", async (t) => {
  const { server, url } = await startApp();
  t.after(() => server.close());

  const pre = await fetch(`${url}/api/agent/list-files`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.match(pre.headers.get("access-control-allow-headers"), /Authorization/);

  const evil = await fetch(`${url}/api/agent/list-files`, { method: "OPTIONS", headers: { Origin: "http://evil.test" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
});

test("socket handshake: owner token connects, anything else is refused as unauthorized", async () => {
  setVerifierForTesting(verify);
  const handshake = (token) =>
    new Promise((resolve) => {
      const socket = { handshake: { auth: token ? { token } : {} }, data: {} };
      requireOwnerSocket(socket, (err) => resolve({ err, socket }));
    });

  const ok = await handshake(sign({}));
  assert.equal(ok.err, undefined);
  assert.equal(ok.socket.data.auth.sub, OWNER);

  assert.equal((await handshake(null)).err.message, "unauthorized");
  assert.equal((await handshake(sign({ sub: "intruder" }))).err.message, "unauthorized");
});
