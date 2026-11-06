// The Redis expiry handler must only tear down sandboxes for `sandbox:<id>`
// keys, and must never throw (other services' keys expire in the same DB).

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.REDIS_URI ||= "redis://127.0.0.1:1";
const redisModule = await import("../src/config/redis.js");
redisModule.redis.disconnect();
redisModule.default.subscriber.disconnect();
const { handleExpiredKey } = redisModule;

const fakeDeps = (failures = {}) => {
  const calls = [];
  const step = (name) => async (arg) => {
    calls.push([name, arg]);
    if (failures[name]) throw new Error(`${name} failed`);
  };
  return {
    calls,
    deps: {
      deletePod: step("deletePod"),
      deleteService: step("deleteService"),
      Project: { updateOne: step("updateOne") },
    },
  };
};

test("ignores keys that are not sandbox idle keys", async () => {
  const { calls, deps } = fakeDeps();
  for (const key of ["ratelimit:tokenbucket:user:1:free", "mcptoken:abc", "sandbox-token:rate:u:1", "sandbox:", undefined]) {
    assert.equal(await handleExpiredKey(key, deps), false, String(key));
  }
  assert.equal(calls.length, 0);
});

test("tears down the sandbox for sandbox:<id>", async () => {
  const { calls, deps } = fakeDeps();
  assert.equal(await handleExpiredKey("sandbox:0190abcd-1234", deps), true);
  assert.deepEqual(calls.map((c) => c[0]), ["deletePod", "deleteService", "updateOne"]);
  assert.equal(calls[0][1], "0190abcd-1234");
});

test("a failing step does not stop the others or throw", async () => {
  const { calls, deps } = fakeDeps({ deletePod: true });
  await assert.doesNotReject(handleExpiredKey("sandbox:gone", deps));
  assert.deepEqual(calls.map((c) => c[0]), ["deletePod", "deleteService", "updateOne"]);
});
