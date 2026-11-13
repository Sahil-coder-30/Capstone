// index.js
// Coding-tool handlers by name. They are NOT Express routes: the only way to
// reach them is the MCP endpoint (mcp/server.js runs them through invokeRoute).
// The names must match the `route` values in mcp/tools.js.

import { listFiles, readFile, updateFile, createFile, deleteFile, patchFile } from "./files.controller.js";
import { searchCode } from "./search.controller.js";
import { exec } from "./exec.controller.js";
import { viteRuntimeErrors } from "./logs.controller.js";

export const toolHandlers = {
  listFiles,
  readFile,
  updateFile,
  createFile,
  deleteFile,
  patchFile,
  searchCode,
  exec,
  viteRuntimeErrors,
};
