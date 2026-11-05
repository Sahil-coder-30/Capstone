// Offline tests of the sandbox MCP client against a real MCP SDK server on
// 127.0.0.1: result mapping, certified-tool check, retry rules, REST
// fallback for old pods, token renewal and auth errors.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = 39231;
process.env.SANDBOX_URL_TEMPLATE = `http://127.0.0.1:${PORT}/{sandboxId}`;
delete process.env.SANDBOX_TOOL_TRANSPORT;

const { callSandboxTool, releaseSandbox, runCommand } = await import("../src/agent/tools/sandbox.client.js");
const { setSandboxCredentialForTesting } = await import("../src/agent/tools/sandboxAuth.js");

const seenAuth = [];
const calls = {};
const dropNext = new Set();

const text = (data, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(data) }], isError });

const buildServer = () => {
  const server = new McpServer({ name: "fake-sandbox", version: "1.0.0" });
  const tool = (name, schema, fn) => server.registerTool(name, { inputSchema: schema }, async (args) => {
    calls[name] = (calls[name] || 0) + 1;
    return fn(args);
  });
  tool("list_files", {}, () => text({ status: "ok", files: ["src/App.jsx"] }));
  tool("read_file", { files: z.array(z.string()) }, ({ files }) =>
    files[0] === "bad" ? text({ status: "error", message: "Bad request" }, true) : text({ status: "ok", files: files.map((file) => ({ file, content: "x" })) }));
  tool("patch_file", { filePath: z.string(), oldStr: z.string(), newStr: z.string() }, () =>
    text({ success: false, error: "oldStr not found in file" }, true));
  tool("execute_command", { command: z.string(), subDir: z.string().optional() }, ({ command }) =>
    text({ status: "ok", success: true, stdout: command, stderr: "", error: null, timedOut: false }));
  tool("get_vite_runtime_errors", {}, () => text({ success: true, logs: "VITE ready" }));
  tool("evil_tool", {}, () => text({ pwned: true })); // not certified: must be ignored
  return server;
};

const httpServer = http.createServer(async (req, res) => {
  const [, sandboxId, ...rest] = req.url.split("/");
  const path = `/${rest.join("/")}`;
  seenAuth.push(req.headers.authorization);

  if (req.headers.authorization === "Bearer revoked") {
    res.writeHead(401).end(JSON.stringify({ status: "error", message: "Invalid token." }));
    return;
  }
  if (sandboxId === "old-pod") {
    if (path === "/mcp") return res.writeHead(404).end("Not found");
    if (path.startsWith("/api/agent/list-files")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "ok", files: ["from-rest.js"] }));
    }
  }
  if (path !== "/mcp" || req.method !== "POST") return res.writeHead(404).end();

  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const toolName = body?.method === "tools/call" ? body.params?.name : null;
  if (toolName && dropNext.has(toolName)) {
    dropNext.delete(toolName);
    calls[toolName] = (calls[toolName] || 0) + 1;
    req.socket.destroy(); // connection drops mid-call
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
});
await new Promise((resolve) => httpServer.listen(PORT, "127.0.0.1", resolve));
after(() => httpServer.close());

const configFor = (sandboxId, key = `run-${sandboxId}`, token = "sandbox-token") => {
  setSandboxCredentialForTesting(key, sandboxId, token);
  return { configurable: { sandboxId, credentialKey: key } };
};

test("tool results keep the REST shapes: request errors fail, domain results succeed", async () => {
  const config = configFor("sbx-a");

  assert.deepEqual(await callSandboxTool(config, "list_files"), { ok: true, data: { status: "ok", files: ["src/App.jsx"] } });

  const bad = await callSandboxTool(config, "read_file", { files: ["bad"] });
  assert.deepEqual(bad, { ok: false, error: "Bad request" });

  const patch = await callSandboxTool(config, "patch_file", { filePath: "a", oldStr: "x", newStr: "y" });
  assert.equal(patch.ok, true, "a not-found patch is a result the tool handles, like REST 200");
  assert.equal(patch.data.success, false);

  const run = await runCommand(config, "npm run build");
  assert.equal(run.ok, true);
  assert.equal(run.stdout, "npm run build");

  assert.ok(seenAuth.every((h) => h === "Bearer sandbox-token"), "every call carried the sandbox token");
  await releaseSandbox(config.configurable.credentialKey);
});

test("only certified tools: an extra server tool is unreachable, a missing one fails clearly", async () => {
  const config = configFor("sbx-b");
  const evil = await callSandboxTool(config, "evil_tool");
  assert.equal(evil.ok, false);
  assert.match(evil.error, /not a certified sandbox tool/);
  assert.equal(calls.evil_tool, undefined);

  const missing = await callSandboxTool(config, "delete_file", { files: ["a"] });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /does not offer the "delete_file" tool/);
  await releaseSandbox(config.configurable.credentialKey);
});

test("a dropped connection is retried for read-only tools only", async () => {
  const config = configFor("sbx-c");
  await callSandboxTool(config, "list_files"); // open the session

  calls.list_files = 0;
  dropNext.add("list_files");
  const listed = await callSandboxTool(config, "list_files");
  assert.equal(listed.ok, true);
  assert.equal(calls.list_files, 2, "dropped once, retried once");

  calls.execute_command = 0;
  dropNext.add("execute_command");
  const exec = await callSandboxTool(config, "execute_command", { command: "npm install axios" });
  assert.equal(exec.ok, false);
  assert.equal(calls.execute_command, 1, "a command is never sent twice");
  await releaseSandbox(config.configurable.credentialKey);
});

test("a pod without /mcp falls back to REST for the rest of the run", async () => {
  const config = configFor("old-pod");
  assert.deepEqual((await callSandboxTool(config, "list_files")).data.files, ["from-rest.js"]);
  assert.deepEqual((await callSandboxTool(config, "list_files")).data.files, ["from-rest.js"]);
  await releaseSandbox(config.configurable.credentialKey);
});

test("a renewed token opens a new session with the new header", async () => {
  const config = configFor("sbx-d", "run-d", "token-1");
  await callSandboxTool(config, "list_files");
  setSandboxCredentialForTesting("run-d", "sbx-d", "token-2");
  seenAuth.length = 0;
  await callSandboxTool(config, "list_files");
  assert.ok(seenAuth.length > 0 && seenAuth.every((h) => h === "Bearer token-2"));
  await releaseSandbox("run-d");
});

test("a rejected token is reported, not retried, and nothing works without credentials", async () => {
  const rejected = await callSandboxTool(configFor("sbx-e", "run-e", "revoked"), "list_files");
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /rejected/);

  await releaseSandbox("run-e");
  const none = await callSandboxTool({ configurable: { sandboxId: "sbx-e", credentialKey: "run-e" } }, "list_files");
  assert.match(none.error, /No sandbox credentials/);
});
