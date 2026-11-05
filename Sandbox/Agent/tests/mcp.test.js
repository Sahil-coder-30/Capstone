// End-to-end test of the sandbox MCP endpoint: the real sidecar app (same
// REST handlers), the real MCP SDK client, a temp workspace and a throwaway
// RSA key as the Auth service.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 39123;
const OWNER = "owner-1";
const SANDBOX = "sbx-mcp";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "taksha-mcp-"));
const workspace = path.join(root, "workspace");
fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
fs.writeFileSync(path.join(workspace, "src", "App.jsx"), "export default function App() {\n  return <h1>Hi</h1>;\n}\n");
fs.writeFileSync(path.join(workspace, "package.json"), "{}\n");
fs.writeFileSync(path.join(root, "vite.log"), "VITE ready\n");

Object.assign(process.env, {
  WORKSPACE_DIR: workspace,
  VITE_LOG_FILE: path.join(root, "vite.log"),
  SANDBOX_ID: SANDBOX,
  OWNER_USER_ID: OWNER,
  MCP_ALLOWED_HOSTS: `127.0.0.1:${PORT}`,
});

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "auth-rsa-v1" };
const { createTokenVerifier } = await import("../src/auth/verifyToken.js");
const { setVerifierForTesting } = await import("../src/auth/middleware.js");
setVerifierForTesting(createTokenVerifier({ ownerId: OWNER, sandboxId: SANDBOX, fetchJwks: async () => ({ keys: [jwk] }) }));

const sandboxToken = jwt.sign({ sub: OWNER, sbx: SANDBOX }, privateKey, {
  algorithm: "RS256",
  keyid: "auth-rsa-v1",
  issuer: "auth.takshacodespace.in",
  audience: "taksha-sandbox",
  expiresIn: "2h",
});

const httpServer = (await import("../src/app.js")).default;
await new Promise((resolve) => httpServer.listen(PORT, "127.0.0.1", resolve));
after(() => httpServer.close());

const url = `http://127.0.0.1:${PORT}/mcp`;
const connect = async (token = sandboxToken) => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return client;
};
const call = async (client, name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { isError: Boolean(res.isError), data: JSON.parse(res.content[0].text) };
};

test("lists exactly the certified tools", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "create_file", "delete_file", "execute_command", "get_vite_runtime_errors", "list_files",
    "patch_file", "read_file", "search_code", "update_file",
  ]);
  assert.equal(tools.find((t) => t.name === "read_file").annotations.readOnlyHint, true);
  await client.close();
});

test("tools run the same handlers as REST and keep the REST result shapes", async () => {
  const client = await connect();

  const listed = await call(client, "list_files");
  assert.equal(listed.isError, false);
  assert.ok(listed.data.files.includes("src/App.jsx"));

  const created = await call(client, "create_file", { files: [{ file: "src/Hello.jsx", content: "export const Hello = () => null;\n" }] });
  assert.equal(created.isError, false);
  assert.ok(Array.isArray(created.data.results));
  assert.equal(fs.readFileSync(path.join(workspace, "src", "Hello.jsx"), "utf8"), "export const Hello = () => null;\n");

  const patched = await call(client, "patch_file", { filePath: "src/App.jsx", oldStr: "<h1>Hi</h1>", newStr: "<h1>Hello</h1>" });
  assert.deepEqual(patched, { isError: false, data: { success: true, patched: "src/App.jsx" } });

  const read = await call(client, "read_file", { files: ["src/App.jsx"] });
  assert.match(read.data.files[0].content, /<h1>Hello<\/h1>/);

  const missing = await call(client, "patch_file", { filePath: "src/App.jsx", oldStr: "not there", newStr: "x" });
  assert.equal(missing.isError, true);
  assert.equal(missing.data.success, false);

  const logs = await call(client, "get_vite_runtime_errors");
  assert.match(logs.data.logs, /VITE ready/);

  const found = await call(client, "search_code", { pattern: "Hello", filesOnly: true });
  assert.equal(found.isError, false);

  await client.close();
});

test("execute_command runs commands but refuses file commands and dev servers", async () => {
  const client = await connect();
  const ok = await call(client, "execute_command", { command: "echo built" });
  assert.equal(ok.isError, false);
  assert.equal(ok.data.stdout, "built");

  for (const command of ["cat src/App.jsx", "npm run dev"]) {
    const blocked = await call(client, "execute_command", { command });
    assert.equal(blocked.isError, true, command);
    assert.match(blocked.data.message, /WRONG TOOL/);
  }
  await client.close();
});

test("paths outside the workspace are refused", async () => {
  fs.symlinkSync(root, path.join(workspace, "escape"));
  const client = await connect();
  const read = await call(client, "read_file", { files: ["../vite.log", "escape/vite.log"] });
  for (const entry of read.data.files) assert.match(entry.error, /Access denied/, entry.file);
  await client.close();
});

test("the endpoint needs the owner's token and refuses other hosts", async () => {
  const noToken = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(noToken.status, 401);

  const otherUser = jwt.sign({ sub: "intruder", sbx: SANDBOX }, privateKey, {
    algorithm: "RS256", keyid: "auth-rsa-v1", issuer: "auth.takshacodespace.in", audience: "taksha-sandbox", expiresIn: "1h",
  });
  await assert.rejects(connect(otherUser));

  // fetch can not override Host, so use node:http for the DNS-rebinding check.
  const wrongHostStatus = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const req = http.request({
      host: "127.0.0.1",
      port: PORT,
      path: "/mcp",
      method: "POST",
      headers: {
        Host: "evil.test",
        Authorization: `Bearer ${sandboxToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end(body);
  });
  assert.equal(wrongHostStatus, 403);

  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${sandboxToken}` } })).status, 405);
});
