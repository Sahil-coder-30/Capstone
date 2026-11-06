// Offline tests of MCP tokens (create, list, revoke, router lookup) and the
// router's wake call. Mongo models and Redis are replaced by small fakes.

import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.REDIS_URI ||= "redis://127.0.0.1:1";
process.env.INTERNAL_SERVICE_TOKEN = "internal-secret";
const redisModule = await import("../src/config/redis.js");
redisModule.redis.disconnect();
redisModule.default.subscriber.disconnect();

// ── Fake Redis ──────────────────────────────────────────────────────────────
const kv = new Map();
Object.assign(redisModule.redis, {
  set: async (key, value) => kv.set(key, value),
  get: async (key) => kv.get(key) ?? null,
  mget: async (keys) => keys.map((k) => kv.get(k) ?? null),
  del: async (...keys) => keys.flat().forEach((k) => kv.delete(k)),
  exists: async (key) => (kv.has(key) ? 1 : 0),
});

// ── Fake Mongo models ───────────────────────────────────────────────────────
const McpToken = (await import("../src/models/McpToken.model.js")).default;
const Project = (await import("../src/models/Project.model.js")).default;
const tokens = [];
const projects = [];
const matches = (doc, filter) =>
  Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && "$gt" in v) return doc[k] > v.$gt;
    if (v && typeof v === "object" && "$nin" in v) return !v.$nin.includes(doc[k]);
    return String(doc[k] ?? null) === String(v ?? null);
  });
const lean = (value) => ({ lean: async () => value, sort: () => ({ lean: async () => value }) });
Object.assign(McpToken, {
  countDocuments: async (f) => tokens.filter((t) => matches(t, f)).length,
  create: async (doc) => {
    const saved = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), revokedAt: null, ...doc };
    tokens.push(saved);
    return saved;
  },
  find: (f) => lean(tokens.filter((t) => matches(t, f)).reverse()),
  findOne: (f) => lean(tokens.find((t) => matches(t, f)) || null),
  findOneAndUpdate: async (f, update) => {
    const doc = tokens.find((t) => matches(t, f));
    if (doc) Object.assign(doc, update);
    return doc || null;
  },
  updateMany: async (f, update) => tokens.filter((t) => matches(t, f)).forEach((t) => Object.assign(t, update)),
});
Object.assign(Project, {
  findOne: (f) => {
    const found = projects.find((p) => matches(p, f)) || null;
    return Object.assign(Promise.resolve(found), { lean: async () => found });
  },
});

const service = await import("../src/services/mcpTokens.service.js");
const { wakeSandboxController } = await import("../src/controllers/mcpToken.controller.js");

const project = { _id: new mongoose.Types.ObjectId(), user: "owner-1", sandboxId: "sbx-tok", status: "down", deletionStatus: "active" };
projects.push(project);

test("token input: read is always on, exec only when asked, limits enforced", () => {
  assert.deepEqual(service.normalizeTokenInput({ name: "Claude Code", scopes: [] }).scopes, ["read"]);
  assert.deepEqual(service.normalizeTokenInput({ name: "x", scopes: ["write"] }).scopes, ["read", "write"]);
  assert.deepEqual(service.normalizeTokenInput({ name: "x", scopes: ["exec", "write"] }).scopes, ["read", "write", "exec"]);
  for (const bad of [{ name: "" }, { name: "x".repeat(61) }, { name: "x", scopes: ["admin"] }, { name: "x", expiresInDays: 0 }, { name: "x", expiresInDays: 91 }]) {
    assert.throws(() => service.normalizeTokenInput(bad), service.TokenInputError, JSON.stringify(bad));
  }
});

test("create returns the token once, stores only its hash, and caches it for the router", async () => {
  const { token, record } = await service.createToken({ userId: "owner-1", project, input: { name: "Claude Code", scopes: ["write"] } });
  assert.match(token, /^tks_mcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(record.prefix, token.slice(0, 14));
  assert.ok(!JSON.stringify(tokens).includes(token), "the plain token is never stored");

  const cached = JSON.parse(kv.get(`mcptoken:${service.hashToken(token)}`));
  assert.deepEqual(cached.scopes, ["read", "write"]);
  assert.equal(cached.sandboxId, "sbx-tok");
  assert.equal(cached.userId, "owner-1");
});

test("list shows active tokens with last use; revoke removes the cache entry at once", async () => {
  const { token, record } = await service.createToken({ userId: "owner-1", project, input: { name: "Cursor" } });
  kv.set(`mcptoken-used:${record.id}`, String(Date.parse("2026-11-06T10:00:00Z")));

  const listed = await service.listTokens(project._id);
  const cursor = listed.find((t) => t.id === record.id);
  assert.equal(cursor.lastUsedAt.toISOString(), "2026-11-06T10:00:00.000Z");
  assert.equal(cursor.tokenHash, undefined, "the hash is not exposed");

  assert.equal(await service.revokeToken(project._id, record.id), true);
  assert.equal(kv.has(`mcptoken:${service.hashToken(token)}`), false);
  assert.equal(await service.revokeToken(project._id, record.id), false, "already revoked");
  assert.ok(!(await service.listTokens(project._id)).some((t) => t.id === record.id));
});

test("router lookup refills the cache for active tokens and refuses revoked or trashed ones", async () => {
  const { token } = await service.createToken({ userId: "owner-1", project, input: { name: "lookup" } });
  const hash = service.hashToken(token);
  kv.delete(`mcptoken:${hash}`); // e.g. Redis was flushed

  assert.equal((await service.lookupActiveToken(hash)).sandboxId, "sbx-tok");
  assert.ok(kv.has(`mcptoken:${hash}`), "re-cached");
  assert.equal(await service.lookupActiveToken("not-a-hash"), null);

  project.deletionStatus = "trash";
  assert.equal(await service.lookupActiveToken(hash), null);
  project.deletionStatus = "active";

  assert.ok((await service.revokeProjectTokens(project._id)) >= 1);
  assert.equal(await service.lookupActiveToken(hash), null);
});

test("at most 10 active tokens per project", async () => {
  await service.revokeProjectTokens(project._id);
  for (let i = 0; i < 10; i += 1) await service.createToken({ userId: "owner-1", project, input: { name: `t${i}` } });
  await assert.rejects(service.createToken({ userId: "owner-1", project, input: { name: "t10" } }), /at most 10/);
  await service.revokeProjectTokens(project._id);
});

test("wake: live sandboxes are left alone, unknown or trashed ones refused", async () => {
  const call = async (sandboxId) => {
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
    await wakeSandboxController({ params: { sandboxId } }, res, (err) => { throw err; });
    return res;
  };

  project.status = "live";
  kv.set("sandbox:sbx-tok", "{}");
  assert.deepEqual((await call("sbx-tok")).body, { status: "success", state: "live" });

  project.status = "building";
  assert.equal((await call("sbx-tok")).statusCode, 202);

  assert.equal((await call("sbx-unknown")).statusCode, 404);
  assert.equal((await call("Bad@Id")).statusCode, 400);
  project.deletionStatus = "trash";
  assert.equal((await call("sbx-tok")).statusCode, 404);
  project.deletionStatus = "active";
});
