// sandbox.client.js
// The only way the agent reaches a user's sandbox sidecar (Sandbox/Agent).
//
// callSandboxTool(config, name, args) calls one certified tool:
//   - over MCP (POST /mcp) by default,
//   - over the old REST API when SANDBOX_TOOL_TRANSPORT=rest, or for a
//     sandbox whose pod predates the MCP endpoint (404 on /mcp).
// Both give the same result shape and never throw, so tools and nodes can
// turn failures into honest messages.

import axios from "axios";
import { sandboxTokenFor, releaseSandboxCredential } from "./sandboxAuth.js";
import { McpUnavailableError, callMcpTool, closeMcpSession } from "./mcp.client.js";

// The sandbox id ends up in a hostname. Only a plain DNS label is accepted,
// so a crafted id can never point a request at another internal host.
const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const isValidSandboxId = (id) => typeof id === "string" && SANDBOX_ID_PATTERN.test(id);

export const sandboxIdFrom = (config) => config?.configurable?.sandboxId;

/**
 * Sidecar origin for a sandbox. SANDBOX_URL_TEMPLATE overrides it for local
 * development, e.g. "http://localhost:3000" with a port-forwarded pod.
 */
const sandboxOrigin = (sandboxId) => {
  if (!isValidSandboxId(sandboxId)) {
    throw new Error(`Invalid sandbox id: ${JSON.stringify(String(sandboxId)).slice(0, 80)}`);
  }
  const template = process.env.SANDBOX_URL_TEMPLATE?.trim() || "http://sandbox-service-{sandboxId}:3000";
  return template.replace("{sandboxId}", sandboxId);
};

// Per-tool timeouts. execute_command covers npm install and builds.
const TIMEOUT_MS = { execute_command: 150_000, get_vite_runtime_errors: 45_000, search_code: 15_000 };

// REST equivalents, for the fallback.
const REST_ROUTES = {
  list_files: () => ({ path: "list-files" }),
  read_file: ({ files }) => ({ path: "read-file", query: { files: files.join(",") } }),
  create_file: ({ files }) => ({ method: "post", path: "create-file", body: { files } }),
  update_file: ({ updates }) => ({ method: "patch", path: "update-file", body: { updates } }),
  patch_file: (body) => ({ method: "post", path: "patch-file", body }),
  delete_file: ({ files }) => ({ method: "delete", path: "delete-file", body: { files } }),
  search_code: (args) => ({
    path: "search-code",
    query: Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])),
  }),
  execute_command: ({ command, subDir }) => ({ method: "post", path: "exec", body: { command, subDir } }),
  get_vite_runtime_errors: () => ({ path: "vite-runtime-errors" }),
};

const restOnly = new Set(); // credential keys whose sandbox has no /mcp

const errorText = (data) => {
  if (!data) return "";
  if (typeof data === "string") return data.slice(0, 500);
  return data.message || data.error || "";
};

async function callRest(config, token, { method = "get", path, query, body }, timeoutMs) {
  try {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    const res = await axios({
      method,
      url: `${sandboxOrigin(sandboxIdFrom(config))}/api/agent/${path}${qs}`,
      data: body,
      headers: { Authorization: `Bearer ${token}` },
      timeout: timeoutMs,
      signal: config?.signal,
      validateStatus: () => true,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: `The sandbox rejected the request: ${errorText(res.data) || `HTTP ${res.status}`}` };
    }
    if (res.status >= 400) {
      return { ok: false, status: res.status, error: errorText(res.data) || `Sandbox returned HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: res.data };
  } catch (err) {
    const timedOut = err.code === "ECONNABORTED";
    const unreachable = ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN"].includes(err.code);
    return {
      ok: false,
      timedOut,
      error: timedOut
        ? "The sandbox did not answer in time."
        : unreachable
          ? "The sandbox is not reachable. It may be stopped or still starting."
          : err.message,
    };
  }
}

/**
 * Calls one certified sandbox tool.
 * Returns { ok, data } or { ok: false, error, timedOut? }.
 */
export async function callSandboxTool(config, name, args = {}) {
  const token = sandboxTokenFor(config);
  if (!token) return { ok: false, error: "No sandbox credentials for this run. Start the request again." };
  if (!REST_ROUTES[name]) return { ok: false, error: `"${name}" is not a certified sandbox tool.` };

  const key = config.configurable.credentialKey;
  const timeoutMs = TIMEOUT_MS[name] ?? 30_000;
  let origin;
  try {
    origin = sandboxOrigin(sandboxIdFrom(config));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const useMcp = process.env.SANDBOX_TOOL_TRANSPORT !== "rest" && !restOnly.has(key);
  if (useMcp) {
    try {
      return await callMcpTool({ key, url: `${origin}/mcp`, token, signal: config?.signal }, name, args, { timeoutMs });
    } catch (err) {
      if (!(err instanceof McpUnavailableError)) return { ok: false, error: err.message };
      console.warn(`[Sandbox] ${sandboxIdFrom(config)} has no MCP endpoint, using REST for this run.`);
      restOnly.add(key);
    }
  }
  return callRest(config, token, REST_ROUTES[name](args), timeoutMs);
}

/** Ends a run's sandbox access: drops the token and closes the MCP client. */
export async function releaseSandbox(credentialKey) {
  releaseSandboxCredential(credentialKey);
  restOnly.delete(credentialKey);
  await closeMcpSession(credentialKey);
}

// ── Direct helpers for deterministic checks (tester, reviewer, planner) ────

/** Runs a shell command. Returns { ok, stdout, stderr, error, timedOut }. */
export async function runCommand(config, command, { subDir } = {}) {
  const res = await callSandboxTool(config, "execute_command", { command, ...(subDir && { subDir }) });
  if (!res.ok) return { ok: false, stdout: "", stderr: "", error: res.error, timedOut: Boolean(res.timedOut) };
  const data = res.data || {};
  return {
    ok: data.success === true && !data.timedOut,
    stdout: data.stdout || "",
    stderr: data.stderr || "",
    error: data.error || null,
    timedOut: Boolean(data.timedOut),
  };
}

/** Reads files. Returns { files: Map(path -> content), missing: [{ file, error }] }. */
export async function readFiles(config, paths = []) {
  const files = new Map();
  const missing = [];
  if (!paths.length) return { files, missing };

  const res = await callSandboxTool(config, "read_file", { files: paths });
  if (!res.ok) return { files, missing: paths.map((file) => ({ file, error: res.error })) };

  for (const entry of res.data?.files || []) {
    if (typeof entry?.content === "string" && !entry.error) files.set(entry.file, entry.content);
    else missing.push({ file: entry?.file, error: entry?.error || "not readable" });
  }
  return { files, missing };
}

/** Workspace file list (the sidecar skips node_modules and .git), or null on failure. */
export async function listFiles(config) {
  const res = await callSandboxTool(config, "list_files");
  return res.ok && Array.isArray(res.data?.files) ? res.data.files : null;
}

/** Last lines of the dev server log, or null when unavailable. */
export async function getRuntimeLogs(config) {
  const res = await callSandboxTool(config, "get_vite_runtime_errors");
  if (!res.ok) return null;
  const logs = res.data?.logs;
  return typeof logs === "string" ? logs : logs ? JSON.stringify(logs) : "";
}

/** Sends a line to the run's activity log (shown in the UI). */
export const logToRun = (config, message) => {
  try {
    config?.writer?.(message);
  } catch {
    /* stream already closed */
  }
};
