// agentUtils.js
// Small helpers shared by Orion nodes: message text extraction, tool result
// parsing, and a factual record of which files a ReAct run actually changed.
//
// The "facts" here come from tool calls and tool results, never from what
// the model says it did. Nodes use them to keep reports honest.

import { WRITE_TOOL_NAMES, extractWritePaths, normalizePath } from "./guards.js";

export const truncate = (value, maxLength) => {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
};

/** Plain text from a message content (string or content blocks). Reasoning blocks are skipped. */
export const contentToText = (content) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block?.type === "text" || block?.type === "text_delta") return block.text || "";
        return "";
      })
      .join("");
  }
  return typeof content === "object" ? content.text || "" : String(content);
};

const messageType = (m) => m?._getType?.() || m?.getType?.() || m?.type || m?.role;

export const isAiMessage = (m) => ["ai", "assistant", "AIMessageChunk"].includes(messageType(m));
export const isToolMessage = (m) => messageType(m) === "tool";

/** Text of the last AI message that has text (skips pure tool-call turns). */
export const lastAiText = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!isAiMessage(messages[i])) continue;
    const text = contentToText(messages[i].content).trim();
    if (text) return text;
  }
  return "";
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Decides whether a tool result is a failure. Tool outputs in tool.js are
 * JSON strings ({ error: true }, { success: false }, ...) or plain text for
 * patch_file success.
 */
export const isToolErrorOutput = (content) => {
  const text = contentToText(content).trim();
  if (!text) return false;
  if (/^(SCOPE_VIOLATION|WRONG TOOL)/.test(text)) return true;
  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== "object") return /^error[:\s]/i.test(text);
  if (parsed.error === true) return true;
  if (typeof parsed.error === "string" && parsed.error && parsed.success !== true) return true;
  if (parsed.success === false) return true;
  if (parsed.status === "error") return true;
  return false;
};

/** For batch write tools, the paths whose per-file result reports an error. */
const failedPathsInResult = (content) => {
  const parsed = parseJson(contentToText(content));
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  return new Set(results.filter((r) => r?.error).map((r) => normalizePath(r.file)));
};

/**
 * Walks a ReAct message list and returns what really happened:
 *   calls         — every tool call with ok/error
 *   filesWritten  — paths changed by successful write calls
 *   filesDeleted  — paths removed by successful delete calls
 *   failures      — failed calls with a short error text
 *   commands      — execute_command calls and whether they succeeded
 */
export const analyzeToolActivity = (messages = []) => {
  const pending = new Map();
  for (const m of messages) {
    if (!isAiMessage(m)) continue;
    for (const call of m.tool_calls || []) {
      if (call?.id) pending.set(call.id, { name: call.name, args: call.args || {} });
    }
  }

  const calls = [];
  const filesWritten = new Set();
  const filesDeleted = new Set();
  const failures = [];
  const commands = [];

  for (const m of messages) {
    if (!isToolMessage(m)) continue;
    const call = pending.get(m.tool_call_id);
    if (!call) continue;
    const ok = !isToolErrorOutput(m.content);
    const text = contentToText(m.content);
    calls.push({ name: call.name, args: call.args, ok });

    if (!ok) failures.push({ name: call.name, error: truncate(text, 300) });

    if (call.name === "execute_command") {
      commands.push({ command: call.args.command, ok });
    }

    if (ok && WRITE_TOOL_NAMES.has(call.name)) {
      const failedPaths = failedPathsInResult(m.content);
      for (const p of extractWritePaths(call.name, call.args)) {
        if (failedPaths.has(p)) continue;
        if (call.name === "delete_file") filesDeleted.add(p);
        else filesWritten.add(p);
      }
    }
  }

  return {
    calls,
    filesWritten: [...filesWritten],
    filesDeleted: [...filesDeleted],
    failures,
    commands,
  };
};

/** Prior chat turns as a compact transcript for prompts. */
export const formatChatHistory = (messages = [], maxChars = 6_000) => {
  const lines = messages
    .map((m) => {
      const role = messageType(m) === "human" || m.role === "user" ? "User" : "Orion";
      const text = contentToText(m.content).trim();
      return text ? `${role}: ${truncate(text, 1_500)}` : "";
    })
    .filter(Boolean);
  const joined = lines.join("\n\n");
  return joined.length > maxChars ? joined.slice(joined.length - maxChars) : joined;
};

/** Stable prompt block describing the plan with step statuses. */
export const formatPlan = (plan, activeIndex = -1) => {
  if (!plan?.steps?.length) return "(no plan)";
  return plan.steps
    .map((s, i) => {
      const marker = i === activeIndex ? "→ ACTIVE" : s.status === "done" ? "✓ done" : s.status === "failed" ? "✗ failed" : "  pending";
      const files = s.activeFiles?.length ? ` [${s.activeFiles.join(", ")}]` : "";
      return `${marker}  Step ${s.id} (${s.action}): ${s.title}${files}`;
    })
    .join("\n");
};

/**
 * Structured output with one retry. Function calling is used because it
 * works across the most model providers. The call is tagged so the
 * stream layer never shows the raw JSON to the user.
 */
export const invokeStructured = async (model, schema, name, messages, config) => {
  const structured = model.withStructuredOutput(schema, { name, method: "functionCalling" });
  const callConfig = { signal: config?.signal, tags: ["nostream", "orion_internal"] };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await structured.invoke(messages, callConfig);
    } catch (err) {
      if (config?.signal?.aborted) throw err;
      lastError = err;
      console.warn(`[invokeStructured] ${name} attempt ${attempt + 1} failed:`, err.message);
    }
  }
  throw lastError;
};

/** Rules appended to every working node's system prompt. */
export const GROUNDING_RULES = `=== GROUNDING RULES (always) ===
- Only state facts you saw in a tool result in THIS run. Never claim a file was created, changed, or verified unless a tool result confirmed it.
- Never invent file paths, imports, components, packages, APIs or command output. If you have not read or listed it, check first.
- If a tool result has "error": true or "success": false, the action did NOT happen. Read the error, fix the input, and retry or report the blocker.
- Prefer reading the real file over remembering it. File contents change during the run.
- If something is impossible or unclear, say so plainly. A truthful "blocked" is better than a fake "done".`;
