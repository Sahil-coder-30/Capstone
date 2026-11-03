// guards.js
// Checks that run before a tool call. Each check gets (toolName, args) and
// returns an error message to block the call, or null to allow it.
// The tool loop runs them, so tools themselves stay simple.

export const WRITE_TOOLS = new Set(["create_file", "update_file", "patch_file", "delete_file"]);

// Shell commands that have a dedicated file tool. Blocking them keeps every
// file change visible to the run report and the UI.
const FILE_SHELL_COMMANDS = /^\s*(cat|head|tail|touch|cp|mv|sed|awk|grep|tee)\s|^\s*(echo|printf)\s.*>/;

// Dev servers never exit and would hang the exec endpoint.
const DEV_SERVER = /\b(npm|pnpm|yarn)\s+(run\s+)?(dev|start|preview)\b|\bvite(\s|$)(?!build)/;

export const normalizePath = (p) =>
  String(p || "").trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/^workspace\//, "");

/** Workspace-relative paths a write tool call targets. */
export const extractWritePaths = (toolName, args = {}) => {
  const list = (items, pick) => (Array.isArray(items) ? items.map(pick).map(normalizePath).filter(Boolean) : []);
  switch (toolName) {
    case "create_file":
      return list(args.files, (f) => f?.file);
    case "update_file":
      return list(args.updates, (u) => u?.file);
    case "patch_file":
      return args.filePath ? [normalizePath(args.filePath)] : [];
    case "delete_file":
      return list(args.files, (f) => f);
    default:
      return [];
  }
};

/** Blocks shell commands that should use a file tool, and dev servers. */
export const shellGuard = (toolName, args) => {
  if (toolName !== "execute_command") return null;
  const command = String(args?.command || "");
  if (command.split(/&&|\|\||;|\|/).some((part) => FILE_SHELL_COMMANDS.test(part))) {
    return "WRONG TOOL: use read_file / search_code / create_file / update_file / patch_file for file operations, not shell commands.";
  }
  if (DEV_SERVER.test(command)) {
    return "WRONG TOOL: the Vite dev server is already running on port 5173. Do not start dev/preview servers. Use get_vite_runtime_errors to check the running app.";
  }
  return null;
};

/** Limits write tools to an allowlist of paths (used by the debugger). */
export const writeScopeGuard = (allowedPaths = []) => {
  const allowed = new Set(allowedPaths.map((p) => normalizePath(p).toLowerCase()));
  return (toolName, args) => {
    if (!WRITE_TOOLS.has(toolName) || allowed.size === 0) return null;
    const outside = extractWritePaths(toolName, args).filter((p) => !allowed.has(p.toLowerCase()));
    if (outside.length === 0) return null;
    return `SCOPE_VIOLATION: ${outside.join(", ")} is outside the files you may change in this pass. Allowed: ${[...allowed].join(", ")}. If the root cause is in another file, say so in your final report instead of editing it.`;
  };
};

/** Runs several guards in order and returns the first block message. */
export const combineGuards = (...guards) => (toolName, args) => {
  for (const guard of guards) {
    const blocked = guard?.(toolName, args);
    if (blocked) return blocked;
  }
  return null;
};
