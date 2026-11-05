// mcp.client.js
// MCP client for a user's sandbox (POST /mcp on the sidecar, see
// Sandbox/Agent/src/mcp). One client per graph run (credential key),
// closed when the run releases its credentials.
//
// Certified tools: on connect the server's tool list is checked against
// CERTIFIED_TOOLS. A tool the server does not offer fails with a clear
// error; anything extra the server offers is ignored. The model never sees
// server-provided descriptions: the LangChain tools in this folder carry
// their own.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export const CERTIFIED_TOOLS = new Set([
  "list_files",
  "read_file",
  "create_file",
  "update_file",
  "patch_file",
  "delete_file",
  "search_code",
  "execute_command",
  "get_vite_runtime_errors",
]);

// Safe to retry once on a dropped connection: they change nothing.
const READ_ONLY_TOOLS = new Set(["list_files", "read_file", "search_code", "get_vite_runtime_errors"]);

const CLIENT_INFO = { name: "taksha-ai-orchestration", version: "1.0.0" };

/** Thrown when the sidecar has no /mcp yet (pod started from an older image). */
export class McpUnavailableError extends Error {}

const sessions = new Map(); // credentialKey -> { token, client, offered: Set }

const httpStatusOf = (err) => (err instanceof StreamableHTTPError ? err.code : undefined);

const connect = async (url, token) => {
  const client = new Client(CLIENT_INFO);
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    await client.connect(transport);
  } catch (err) {
    if (httpStatusOf(err) === 404) throw new McpUnavailableError("This sandbox has no MCP endpoint.");
    throw err;
  }
  const { tools } = await client.listTools();
  const offered = new Set(tools.map((t) => t.name).filter((name) => CERTIFIED_TOOLS.has(name)));
  const extra = tools.map((t) => t.name).filter((name) => !CERTIFIED_TOOLS.has(name));
  if (extra.length) console.warn(`[MCP] ${url} offers uncertified tools, ignored: ${extra.join(", ")}`);
  return { client, offered };
};

const sessionFor = async (key, url, token) => {
  const existing = sessions.get(key);
  if (existing && existing.token === token && existing.url === url) return existing;
  if (existing) await existing.client.close().catch(() => {});
  const session = { token, url, ...(await connect(url, token)) };
  sessions.set(key, session);
  return session;
};

export async function closeMcpSession(key) {
  const session = sessions.get(key);
  sessions.delete(key);
  await session?.client.close().catch(() => {});
}

const parseText = (result) => {
  const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Calls one certified tool.
 * Returns the sandbox client's result shape: { ok, data } or { ok: false, error, timedOut? }.
 * A tool whose own result says "not done" (e.g. patch_file oldStr not found,
 * a failing command) is ok: true with that data, exactly like a REST 200.
 * Throws McpUnavailableError when the sandbox has no /mcp (caller falls back to REST).
 */
export async function callMcpTool({ key, url, token, signal }, name, args = {}, { timeoutMs = 30_000 } = {}) {
  if (!CERTIFIED_TOOLS.has(name)) return { ok: false, error: `"${name}" is not a certified sandbox tool.` };

  for (let attempt = 0; ; attempt += 1) {
    let session;
    try {
      session = await sessionFor(key, url, token);
      if (!session.offered.has(name)) return { ok: false, error: `The sandbox does not offer the "${name}" tool.` };

      const result = await session.client.callTool({ name, arguments: args }, undefined, {
        timeout: timeoutMs,
        resetTimeoutOnProgress: true,
        signal,
      });
      const data = parseText(result);
      const requestFailed = result.isError && (data?.status === "error" || data?.error === true);
      return requestFailed
        ? { ok: false, error: data?.message || "The sandbox reported an error." }
        : { ok: true, data };
    } catch (err) {
      if (err instanceof McpUnavailableError || signal?.aborted) throw err;
      const status = httpStatusOf(err);
      if (status === 401 || status === 403) {
        return { ok: false, status, error: `The sandbox rejected the request (HTTP ${status}).` };
      }
      const timedOut = err instanceof McpError && err.code === ErrorCode.RequestTimeout;
      // A dropped connection may have reached the server already: only read-only tools are retried.
      await closeMcpSession(key);
      if (!timedOut && attempt === 0 && READ_ONLY_TOOLS.has(name)) continue;
      return {
        ok: false,
        timedOut,
        error: timedOut
          ? "The sandbox did not answer in time."
          : /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(`${err.message} ${err.cause?.code || ""}`)
            ? "The sandbox is not reachable. It may be stopped or still starting."
            : err.message,
      };
    }
  }
}
