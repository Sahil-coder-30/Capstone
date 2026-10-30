// sandboxClient.js
// Direct calls to the sandbox sidecar for deterministic verification steps
// (tester, reviewer, finalizer). These bypass the LangChain tools on
// purpose: no per-command LLM summary, no tool events, and exact results.

import axios from "axios";
import { sandboxBaseUrl } from "./tool.js";

const sandboxIdFrom = (config) => config?.configurable?.projectId;

/**
 * Runs a shell command in the sandbox workspace.
 * Returns { ok, stdout, stderr, error, timedOut } and never throws.
 */
export async function runSandboxCommand(config, command, { timeoutMs = 150_000 } = {}) {
  try {
    const res = await axios.post(
      `${sandboxBaseUrl(sandboxIdFrom(config))}/api/agent/exec`,
      { command },
      { timeout: timeoutMs, signal: config?.signal },
    );
    const data = res.data || {};
    return {
      ok: data.success === true && !data.timedOut,
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      error: data.error || null,
      timedOut: Boolean(data.timedOut),
    };
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: err.response?.data?.message || err.message,
      timedOut: err.code === "ECONNABORTED",
    };
  }
}

/**
 * Reads files from the sandbox. Returns a Map of path -> content for files
 * that were read, plus a list of paths that failed.
 */
export async function readSandboxFiles(config, paths) {
  const files = new Map();
  const missing = [];
  if (!paths?.length) return { files, missing };
  try {
    const res = await axios.get(
      `${sandboxBaseUrl(sandboxIdFrom(config))}/api/agent/read-file?files=${paths.map(encodeURIComponent).join(",")}`,
      { timeout: 30_000, signal: config?.signal },
    );
    for (const entry of res.data?.files || []) {
      if (entry?.error || typeof entry?.content !== "string") missing.push(entry?.file);
      else files.set(entry.file, entry.content);
    }
  } catch (err) {
    missing.push(...paths);
    console.warn("[sandboxClient] readSandboxFiles failed:", err.message);
  }
  return { files, missing };
}

/** Lists workspace files (node_modules and .git excluded by the sidecar). */
export async function listSandboxFiles(config) {
  try {
    const res = await axios.get(`${sandboxBaseUrl(sandboxIdFrom(config))}/api/agent/list-files`, {
      timeout: 30_000,
      signal: config?.signal,
    });
    return Array.isArray(res.data?.files) ? res.data.files : [];
  } catch (err) {
    console.warn("[sandboxClient] listSandboxFiles failed:", err.message);
    return null;
  }
}

/** Last lines of the sandbox dev server log, or null when unavailable. */
export async function getSandboxRuntimeLogs(config) {
  try {
    const res = await axios.get(`${sandboxBaseUrl(sandboxIdFrom(config))}/api/agent/vite-runtime-errors`, {
      timeout: 45_000,
      signal: config?.signal,
    });
    const logs = res.data?.logs;
    return typeof logs === "string" ? logs : logs ? JSON.stringify(logs) : "";
  } catch (err) {
    console.warn("[sandboxClient] getSandboxRuntimeLogs failed:", err.message);
    return null;
  }
}

/**
 * Emits a tool-log line in the same format tool.js uses, so the frontend
 * can show deterministic checks in the same activity list.
 */
export const logToRun = (config, message) => {
  if (typeof config?.writer === "function") {
    try {
      config.writer(message);
    } catch {
      /* stream already closed */
    }
  }
};
