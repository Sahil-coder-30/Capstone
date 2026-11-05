// tools.js
// The certified MCP tools of a sandbox: a fixed, frozen list. Nothing else
// is ever registered, at startup or at runtime. Each tool maps to one
// existing REST handler, so MCP and REST behave exactly the same.
//
// Names and arguments match the AI service's tools
// (Ai_orchestration/src/agent/tools/), which keeps its own descriptions and
// never shows the model what a server advertises.

import { z } from "zod";

const filePath = z.string().min(1).describe('Path relative to /workspace, e.g. "src/App.jsx". No leading slash.');

// Same rules as the AI service's shellGuard: file work goes through the file
// tools (so every change is visible), and dev servers would never exit.
const FILE_SHELL_COMMANDS = /^\s*(cat|head|tail|touch|cp|mv|sed|awk|grep|tee)\s|^\s*(echo|printf)\s.*>/;
const DEV_SERVER = /\b(npm|pnpm|yarn)\s+(run\s+)?(dev|start|preview)\b|\bvite(\s|$)(?!build)/;

export const shellCommandProblem = (command) => {
  if (String(command).split(/&&|\|\||;|\|/).some((part) => FILE_SHELL_COMMANDS.test(part))) {
    return "WRONG TOOL: use read_file / search_code / create_file / update_file / patch_file for file operations, not shell commands.";
  }
  if (DEV_SERVER.test(command)) {
    return "WRONG TOOL: the Vite dev server is already running on port 5173. Do not start dev/preview servers.";
  }
  return null;
};

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

/**
 * scope: read | write | exec (for scoped external tokens later)
 * run(routes, args) -> { route, query?, body? } picks the REST handler and its input
 */
export const CERTIFIED_TOOLS = Object.freeze([
  {
    name: "list_files",
    scope: "read",
    description: "List every file in the project (node_modules and .git are skipped).",
    inputSchema: {},
    annotations: readOnly,
    call: () => ({ route: "listFiles" }),
  },
  {
    name: "read_file",
    scope: "read",
    description: "Read one or more files and return their content. A missing file comes back with an error field.",
    inputSchema: { files: z.array(filePath).min(1).max(10).describe("Files to read (1 to 10)") },
    annotations: readOnly,
    call: ({ files }) => ({ route: "readFile", query: { files: files.join(",") } }),
  },
  {
    name: "create_file",
    scope: "write",
    description: "Create files with full content. Parent folders are created. An existing file is overwritten.",
    inputSchema: {
      files: z.array(z.object({ file: filePath, content: z.string() })).min(1).describe("Files to create"),
    },
    annotations: writes,
    call: ({ files }) => ({ route: "createFile", body: { files } }),
  },
  {
    name: "update_file",
    scope: "write",
    description: "Replace the whole content of existing files.",
    inputSchema: {
      updates: z.array(z.object({ file: filePath, content: z.string() })).min(1).describe("Files to rewrite"),
    },
    annotations: writes,
    call: ({ updates }) => ({ route: "updateFile", body: { updates } }),
  },
  {
    name: "patch_file",
    scope: "write",
    description: "Replace one exact text that appears exactly once in a file.",
    inputSchema: {
      filePath,
      oldStr: z.string().min(1).describe("Exact text to replace, must appear once"),
      newStr: z.string().describe("Replacement text"),
    },
    annotations: writes,
    call: ({ filePath: file, oldStr, newStr }) => ({ route: "patchFile", body: { filePath: file, oldStr, newStr } }),
  },
  {
    name: "delete_file",
    scope: "write",
    description: "Delete files or folders (folders recursively).",
    inputSchema: { files: z.array(filePath).min(1).describe("Paths to delete") },
    annotations: { ...writes, destructiveHint: true },
    call: ({ files }) => ({ route: "deleteFile", body: { files } }),
  },
  {
    name: "search_code",
    scope: "read",
    description: "Search the project for text or a regex. Returns paths, line numbers and surrounding lines.",
    inputSchema: {
      pattern: z.string().min(1).max(500),
      isRegex: z.boolean().optional(),
      caseSensitive: z.boolean().optional(),
      fileGlob: z.string().optional(),
      contextLines: z.number().int().min(0).max(5).optional(),
      maxResults: z.number().int().min(1).max(50).optional(),
      filesOnly: z.boolean().optional(),
    },
    annotations: readOnly,
    call: (args) => ({
      route: "searchCode",
      query: Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])),
    }),
  },
  {
    name: "execute_command",
    scope: "exec",
    description: "Run a shell command in /workspace (npm install, builds, tests). 120s limit. Not for reading or writing files, not for dev servers.",
    inputSchema: { command: z.string().min(1), subDir: z.string().optional() },
    annotations: { ...writes, destructiveHint: true, openWorldHint: true },
    call: ({ command, subDir }) => ({ route: "exec", body: { command, subDir }, problem: shellCommandProblem(command) }),
  },
  {
    name: "get_vite_runtime_errors",
    scope: "read",
    description: "Read the last lines of the running Vite dev server log.",
    inputSchema: {},
    annotations: readOnly,
    call: () => ({ route: "viteRuntimeErrors" }),
  },
].map((tool) => Object.freeze(tool)));

export const CERTIFIED_TOOL_NAMES = Object.freeze(CERTIFIED_TOOLS.map((t) => t.name));
