// Offline checks for the P0 security gates: every gate fails closed.
// Redis, Payments, JWKS and the Sandbox service are stubbed. No network.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import jwt from "jsonwebtoken";

process.env.NVIDIA_API_KEY ||= "offline-test-key";
process.env.JWT_ACCESS_SECRET = "shared-secret"; // must no longer be accepted

const { default: redis } = await import("../src/config/redis.js");
const { requireOwnedSandbox } = await import("../src/services/sandboxOwnership.service.js");
const { creditLedger } = await import("../src/middleware/creditLedger.middleware.js");
const { aiRateLimiter } = await import("../src/middleware/rateLimit.middleware.js");
const { decodeAndVerifyToken } = await import("../src/middleware/auth.middleware.js");
const { computeOutcome } = await import("../src/agent/nodes/finalizer.node.js");

after(() => redis.disconnect());

const runMw = (mw, req) => new Promise((resolve) => {
  const res = { setHeader() {} };
  mw(req, res, (err) => resolve(err));
});
const user = { id: "u1" };

test("invoke without projectId or sandboxId is refused, not run on a guessed id", async () => {
  const err = await runMw(requireOwnedSandbox, { body: { sessionId: "victim-sandbox" }, authToken: "t", user });
  assert.equal(err?.statusCode, 400);
});

test("credit check fails closed when Payments is down or unclear", async () => {
  axios.defaults.adapter = async () => { throw Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }); };
  const down = await runMw(creditLedger, { headers: {}, authToken: "t", user });
  assert.equal(down?.statusCode, 503);
  assert.equal(down.details?.code, "CREDIT_CHECK_UNAVAILABLE");

  axios.defaults.adapter = async (config) => ({ data: { status: "success" }, status: 200, headers: {}, config });
  const unclear = await runMw(creditLedger, { headers: {}, authToken: "t", user });
  assert.equal(unclear?.statusCode, 402, "a reply without canQuery is not a yes");

  axios.defaults.adapter = async (config) => ({ data: { canQuery: true, creditsRemaining: 5 }, status: 200, headers: {}, config });
  assert.equal(await runMw(creditLedger, { headers: {}, authToken: "t", user }), undefined);
});

test("rate limiter fails closed when Redis errors", async () => {
  redis.consumeTokenBucket = async () => { throw new Error("redis down"); };
  const err = await runMw(aiRateLimiter, { user, headers: {} });
  assert.equal(err?.statusCode, 503);
});

test("an HS256 token signed with JWT_ACCESS_SECRET is rejected", async () => {
  redis.get = async () => null;
  globalThis.fetch = async () => { throw new Error("jwks offline"); };
  const token = jwt.sign({ sub: "attacker" }, "shared-secret", { algorithm: "HS256", keyid: "auth-rsa-v1" });
  await assert.rejects(decodeAndVerifyToken(token), (err) => err.statusCode === 401);
});

test("a skipped review with no real build check is not a complete run", () => {
  const base = { plan: { steps: [{ status: "done" }] }, filesTouched: ["a.js"], review: { pass: true, skipped: true } };
  assert.equal(computeOutcome({ ...base, testResults: { pass: true, stage: "skipped" } }), "partial");
  assert.equal(computeOutcome({ ...base, testResults: { pass: true, stage: "build" } }), "complete");
});
