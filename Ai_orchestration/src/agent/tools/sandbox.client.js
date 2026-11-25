// sandbox.client.js
// The only way the agent reaches a user's sandbox sidecar (Sandbox/Agent):
// callSandboxTool(config, name, args) calls one certified tool over the
// sandbox's MCP server (POST /mcp). The sidecar has no REST file API.
// Results never throw, so tools and nodes can turn failures into honest messages.

import { sandboxTokenFor, releaseSandboxCredential } from "./sandboxAuth.js";
import { CERTIFIED_TOOLS, McpUnavailableError, callMcpTool, closeMcpSession } from "./mcp.client.js";

// The sandbox id ends up in a hostname. Only a plain DNS label is accepted,
// so a crafted id can never point a request at another internal host.
const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const isValidSandboxId = (id) => typeof id === "string" && SANDBOX_ID_PATTERN.test(id);

export const sandboxIdFrom = (config) => config?.configurable?.sandboxId;

/**
 * Where a sandbox's MCP endpoint is reached, and the extra headers for it.
 *
 * - SANDBOX_URL_TEMPLATE set (local dev, tests, e2e:live): straight to that
 *   origin + "/mcp", e.g. "http://localhost:3000" with a port-forwarded pod.
 * - In the cluster: through the router, POST <SANDBOX_ROUTER_URL>/internal/sandboxes/<id>/mcp
 *   with X-Internal-Token. The router refreshes the sandbox idle TTL on every
 *   call, so a long agent run keeps its sandbox even with nobody in the editor.
 * - No INTERNAL_SERVICE_TOKEN: fails closed. Sandbox pods are reached only
 *   through the router; there is no direct path.
 */
export const sandboxMcpEndpoint = (sandboxId) => {
  if (!isValidSandboxId(sandboxId)) {
    throw new Error(`Invalid sandbox id: ${JSON.stringify(String(sandboxId)).slice(0, 80)}`);
  }
  const template = process.env.SANDBOX_URL_TEMPLATE?.trim();
  if (template) return { url: `${template.replace("{sandboxId}", sandboxId)}/mcp`, headers: {} };

  const internalToken = process.env.INTERNAL_SERVICE_TOKEN?.trim();
  if (internalToken) {
    const router = (process.env.SANDBOX_ROUTER_URL?.trim() || "http://router-service").replace(/\/+$/, "");
    return { url: `${router}/internal/sandboxes/${sandboxId}/mcp`, headers: { "X-Internal-Token": internalToken } };
  }

  throw new Error("Sandbox access is not configured: INTERNAL_SERVICE_TOKEN is missing in the AI service.");
};

// Per-tool timeouts. execute_command covers npm install and builds.
const TIMEOUT_MS = { execute_command: 150_000, get_vite_runtime_errors: 45_000, search_code: 15_000 };

/**
 * Calls one certified sandbox tool.
 * Returns { ok, data } or { ok: false, error, timedOut? }.
 */
export async function callSandboxTool(config, name, args = {}) {
  const token = sandboxTokenFor(config);
  if (!token) return { ok: false, error: "No sandbox credentials for this run. Start the request again." };
  if (!CERTIFIED_TOOLS.has(name)) return { ok: false, error: `"${name}" is not a certified sandbox tool.` };

  const key = config.configurable.credentialKey;
  const timeoutMs = TIMEOUT_MS[name] ?? 30_000;
  let endpoint;
  try {
    endpoint = sandboxMcpEndpoint(sandboxIdFrom(config));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const started = Date.now();
  let result;
  try {
    result = await callMcpTool({ key, url: endpoint.url, token, headers: endpoint.headers, signal: config?.signal }, name, args, { timeoutMs });
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof McpUnavailableError
        ? "This sandbox runs an old image without MCP. Stop and start the sandbox, then try again."
        : err.message,
    };
  }
  console.log(
    `[MCP] sandbox=${sandboxIdFrom(config)} tool=${name} ${argSummary(args)} -> ${result.ok ? "ok" : `error: ${result.error}`} ${Date.now() - started}ms`,
  );
  return result;
}

// KEY=value, --token value, "Bearer x" and known token prefixes, masked before a command is logged.
const SECRET_IN_TEXT = /([\w-]*(?:key|token|secret|passw(?:or)?d)[\w-]*\s*[=:]\s*|--?[\w-]*(?:key|token|secret|password)[\w-]*\s+|bearer\s+|\b(?:tks_mcp_|nvapi-|sk-))\S+/gi;

/** File paths, pattern or command of a call, for the log line. Never file contents. */
const argSummary = (args = {}) => {
  const files = args.files || args.updates;
  const text = files ? files.map((f) => f?.file ?? f).join(",") : (args.filePath ?? args.pattern ?? args.command ?? "");
  return String(text).replace(SECRET_IN_TEXT, "$1***").slice(0, 80);
};

/** Ends a run's sandbox access: drops the token and closes the MCP client. */
export async function releaseSandbox(credentialKey) {
  releaseSandboxCredential(credentialKey);
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
