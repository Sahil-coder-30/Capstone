// toolActivity.js
// Facts about what a tool loop really did, taken from tool calls and tool
// results, never from what the model says it did. Nodes use these facts to
// decide step status and to keep reports honest.

import { contentToText, isAiMessage, isToolMessage, truncate } from "./messages.js";
import { WRITE_TOOLS, extractWritePaths, normalizePath } from "../tools/guards.js";

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** True when a tool result reports a failure. */
export const isToolErrorOutput = (content) => {
  const text = contentToText(content).trim();
  if (!text) return false;
  if (/^(SCOPE_VIOLATION|WRONG TOOL)/.test(text)) return true;
  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== "object") return /^error[:\s]/i.test(text);
  if (parsed.error === true || parsed.success === false || parsed.status === "error") return true;
  return typeof parsed.error === "string" && parsed.error !== "" && parsed.success !== true;
};

/** For batch write tools: the paths whose per-file result reports an error. */
const failedPaths = (content) => {
  const results = parseJson(contentToText(content))?.results;
  return new Set((Array.isArray(results) ? results : []).filter((r) => r?.error).map((r) => normalizePath(r.file)));
};

/**
 * Walks a tool-loop message list and returns:
 *   filesWritten / filesDeleted - paths changed by successful write calls
 *   failures                    - failed calls with a short error
 *   commands                    - execute_command calls and their result
 */
export const analyzeToolActivity = (messages = []) => {
  const callsById = new Map();
  for (const m of messages) {
    if (!isAiMessage(m)) continue;
    for (const call of m.tool_calls || []) if (call?.id) callsById.set(call.id, call);
  }

  const filesWritten = new Set();
  const filesDeleted = new Set();
  const failures = [];
  const commands = [];

  for (const m of messages) {
    if (!isToolMessage(m)) continue;
    const call = callsById.get(m.tool_call_id);
    if (!call) continue;
    const ok = !isToolErrorOutput(m.content);

    if (!ok) failures.push({ name: call.name, error: truncate(contentToText(m.content), 300) });
    if (call.name === "execute_command") commands.push({ command: call.args?.command, ok });

    if (ok && WRITE_TOOLS.has(call.name)) {
      const failed = failedPaths(m.content);
      for (const p of extractWritePaths(call.name, call.args)) {
        if (failed.has(p)) continue;
        (call.name === "delete_file" ? filesDeleted : filesWritten).add(p);
      }
    }
  }

  return { filesWritten: [...filesWritten], filesDeleted: [...filesDeleted], failures, commands };
};
