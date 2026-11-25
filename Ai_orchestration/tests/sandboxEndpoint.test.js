// Where the AI service sends sandbox MCP calls: straight to a dev origin, or
// through the router's internal path (which refreshes the sandbox idle TTL).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sandboxMcpEndpoint } from "../src/agent/tools/sandbox.client.js";

const KEYS = ["SANDBOX_URL_TEMPLATE", "INTERNAL_SERVICE_TOKEN", "SANDBOX_ROUTER_URL"];
beforeEach(() => KEYS.forEach((k) => delete process.env[k]));

test("in the cluster, calls go through the router with the internal token", () => {
  process.env.INTERNAL_SERVICE_TOKEN = "shh";
  assert.deepEqual(sandboxMcpEndpoint("sbx-1"), {
    url: "http://router-service/internal/sandboxes/sbx-1/mcp",
    headers: { "X-Internal-Token": "shh" },
  });
});

test("SANDBOX_ROUTER_URL overrides the router origin", () => {
  process.env.INTERNAL_SERVICE_TOKEN = "shh";
  process.env.SANDBOX_ROUTER_URL = "http://localhost:3005/";
  assert.equal(sandboxMcpEndpoint("sbx-1").url, "http://localhost:3005/internal/sandboxes/sbx-1/mcp");
});

test("SANDBOX_URL_TEMPLATE (local dev, tests) still goes straight to that origin", () => {
  process.env.INTERNAL_SERVICE_TOKEN = "shh";
  process.env.SANDBOX_URL_TEMPLATE = "http://127.0.0.1:9999/{sandboxId}";
  assert.deepEqual(sandboxMcpEndpoint("sbx-1"), { url: "http://127.0.0.1:9999/sbx-1/mcp", headers: {} });
});

test("without the internal token there is no direct path: it fails closed", () => {
  assert.throws(() => sandboxMcpEndpoint("sbx-1"), /INTERNAL_SERVICE_TOKEN is missing/);
});

test("a sandbox id that is not a DNS label is refused", () => {
  process.env.INTERNAL_SERVICE_TOKEN = "shh";
  assert.throws(() => sandboxMcpEndpoint("x@10.0.0.5"), /Invalid sandbox id/);
  assert.throws(() => sandboxMcpEndpoint("../a"), /Invalid sandbox id/);
});
