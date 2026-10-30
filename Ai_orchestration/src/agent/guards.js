// guards.js
// Shared tool-guard middleware for all agent nodes.
//
// Each guard returns a NEW tool with the same name, description and schema
// as the original, so the model sees the full tool documentation from
// tool.js. The shared tool instances are never mutated (clio.agent.js uses
// the same instances).
//
// Guards receive the parsed tool args (not the raw ToolCall), so the checks
// actually run when the tool is called by a ReAct agent.

import { tool } from "@langchain/core/tools";

// Shell commands that have a dedicated file tool. Blocking them keeps file
// writes visible to the run report and the UI.
const BLOCKED_SHELL_PATTERNS = [
  /^\s*cat\s/,
  /^\s*head\s/,
  /^\s*tail\s/,
  /^\s*echo\s.+>/,
  /^\s*printf\s.+>/,
  /^\s*touch\s/,
  /^\s*cp\s/,
  /^\s*mv\s/,
  /^\s*sed\s/,
  /^\s*awk\s/,
  /^\s*grep\s/,
];

// Long-running dev servers never exit and would hang the exec endpoint.
const BLOCKED_LONG_RUNNING = /\b(npm|pnpm|yarn)\s+(run\s+)?(dev|start|preview)\b|\bvite(\s|$)(?!build)/;

const SHELL_BLOCK_MESSAGE =
  "WRONG TOOL: use read_file / search_code / create_file / update_file / patch_file for file operations, not shell commands.";

const toolError = (message) => JSON.stringify({ error: true, message });

/**
 * Creates a guarded copy of a tool. `check(args)` returns an error message
 * to block the call, or null to let it through.
 */
const guardTool = (original, check) =>
  tool(
    async (args, config) => {
      const blockedMessage = check(args || {});
      if (blockedMessage) return toolError(blockedMessage);

      // Drop the ToolCall and callbacks so the original tool returns plain
      // output and does not emit a second, nested tool event to the stream.
      // eslint-disable-next-line no-unused-vars
      const { toolCall, callbacks, runId, runName, ...rest } = config || {};
      return original.invoke(args, { ...rest, callbacks: [] });
    },
    {
      name: original.name,
      description: original.description,
      schema: original.schema,
    },
  );

const shellGuard = (args) => {
  const segments = String(args.command || "").split(/&&|\|\||;|\|/);
  if (segments.some((segment) => BLOCKED_SHELL_PATTERNS.some((p) => p.test(segment)))) {
    return SHELL_BLOCK_MESSAGE;
  }
  if (BLOCKED_LONG_RUNNING.test(String(args.command || ""))) {
    return "The Vite dev server is already running on port 5173. Do not start dev/preview servers. Use get_vite_runtime_errors to check the running app.";
  }
  return null;
};

/**
 * Applies the shell guard to execute_command. Other tools pass through
 * untouched (same instance), keeping their full descriptions.
 */
export function applyGuards(tools) {
  return tools.map((toolInstance) =>
    toolInstance.name === "execute_command" ? guardTool(toolInstance, shellGuard) : toolInstance,
  );
}

// ---------------------------------------------------------------------------
// File path helpers shared by nodes that need to know which files a write
// tool call touches.
// ---------------------------------------------------------------------------

export const WRITE_TOOL_NAMES = new Set(["create_file", "update_file", "patch_file", "delete_file"]);

export function normalizePath(p) {
  return String(p || "").trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/^workspace\//, "");
}

/** Returns the workspace-relative paths a write tool call targets. */
export function extractWritePaths(toolName, args) {
  if (!args || typeof args !== "object") return [];
  if (toolName === "create_file" && Array.isArray(args.files)) {
    return args.files.map((f) => normalizePath(f?.file)).filter(Boolean);
  }
  if (toolName === "update_file" && Array.isArray(args.updates)) {
    return args.updates.map((u) => normalizePath(u?.file)).filter(Boolean);
  }
  if (toolName === "patch_file" && args.filePath) return [normalizePath(args.filePath)];
  if (toolName === "delete_file" && Array.isArray(args.files)) {
    return args.files.map((f) => normalizePath(f)).filter(Boolean);
  }
  return [];
}

/**
 * Restricts write tools to an allowlist of paths. Used by the debugger so a
 * fix pass cannot wander into unrelated files. Read tools pass through.
 */
export function scopeWriteTools(tools, allowedPaths) {
  const allowSet = new Set((allowedPaths || []).map((p) => normalizePath(p).toLowerCase()));
  if (allowSet.size === 0) return tools;

  return tools.map((toolInstance) => {
    if (!WRITE_TOOL_NAMES.has(toolInstance.name)) return toolInstance;
    return guardTool(toolInstance, (args) => {
      const outside = extractWritePaths(toolInstance.name, args)
        .filter((p) => !allowSet.has(p.toLowerCase()));
      if (outside.length === 0) return null;
      return `SCOPE_VIOLATION: ${outside.join(", ")} is outside the files you may change in this pass. Allowed: ${[...allowSet].join(", ")}. If the root cause is in another file, say so in your final report instead of editing it.`;
    });
  });
}
