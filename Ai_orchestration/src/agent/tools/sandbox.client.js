// sandbox.client.js
// The only HTTP client for the sandbox sidecar (Sandbox/Agent) that runs in
// each sandbox pod at http://sandbox-service-<sandboxId>:3000/api/agent/*.
//
// Every function returns a result object and never throws, so tools and
// nodes can turn failures into honest messages.

import axios from "axios";

// The sandbox id ends up in a hostname. Only a plain DNS label is accepted,
// so a crafted id can never point a request at another internal host.
const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const isValidSandboxId = (id) => typeof id === "string" && SANDBOX_ID_PATTERN.test(id);

export const sandboxIdFrom = (config) => config?.configurable?.sandboxId;

const baseUrl = (sandboxId) => {
  if (!isValidSandboxId(sandboxId)) {
    throw new Error(`Invalid sandbox id: ${JSON.stringify(String(sandboxId)).slice(0, 80)}`);
  }
  return `http://sandbox-service-${sandboxId}:3000/api/agent`;
};

const errorText = (data) => {
  if (!data) return "";
  if (typeof data === "string") return data.slice(0, 500);
  return data.message || data.error || "";
};

/**
 * Calls one sidecar endpoint.
 * Returns { ok, status, data } on success or { ok: false, error, timedOut } on failure.
 */
export async function callSandbox(config, { method = "get", path, query, body, timeoutMs = 30_000 }) {
  try {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    const res = await axios({
      method,
      url: `${baseUrl(sandboxIdFrom(config))}/${path}${qs}`,
      data: body,
      timeout: timeoutMs,
      signal: config?.signal,
      validateStatus: () => true,
    });
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

// ── Direct helpers for deterministic checks (tester, reviewer, planner) ────

/** Runs a shell command. Returns { ok, stdout, stderr, error, timedOut }. */
export async function runCommand(config, command, { subDir, timeoutMs = 150_000 } = {}) {
  const res = await callSandbox(config, { method: "post", path: "exec", body: { command, subDir }, timeoutMs });
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

  const res = await callSandbox(config, { path: "read-file", query: { files: paths.join(",") } });
  if (!res.ok) return { files, missing: paths.map((file) => ({ file, error: res.error })) };

  for (const entry of res.data?.files || []) {
    if (typeof entry?.content === "string" && !entry.error) files.set(entry.file, entry.content);
    else missing.push({ file: entry?.file, error: entry?.error || "not readable" });
  }
  return { files, missing };
}

/** Workspace file list (the sidecar skips node_modules and .git), or null on failure. */
export async function listFiles(config) {
  const res = await callSandbox(config, { path: "list-files" });
  return res.ok && Array.isArray(res.data?.files) ? res.data.files : null;
}

/** Last lines of the dev server log, or null when unavailable. */
export async function getRuntimeLogs(config) {
  const res = await callSandbox(config, { path: "vite-runtime-errors", timeoutMs: 45_000 });
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
