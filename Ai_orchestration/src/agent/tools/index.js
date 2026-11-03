// tools/index.js
// Tool sets per role. A node picks a set; it never builds its own list.

import {
  createFileTool,
  deleteFileTool,
  listFilesTool,
  patchFileTool,
  readFileTool,
  updateFileTool,
} from "./file.tools.js";
import { searchCodeTool, searchInternetTool } from "./search.tools.js";
import { executeCommandTool, getViteRuntimeErrorsTool } from "./command.tools.js";

export {
  createFileTool,
  deleteFileTool,
  executeCommandTool,
  getViteRuntimeErrorsTool,
  listFilesTool,
  patchFileTool,
  readFileTool,
  searchCodeTool,
  searchInternetTool,
  updateFileTool,
};

/** Look around without changing anything (general answers, planning). */
export const READ_ONLY_TOOLS = [listFilesTool, readFileTool, searchCodeTool, searchInternetTool];

/** Implement a plan step. */
export const CODER_TOOLS = [
  ...READ_ONLY_TOOLS,
  createFileTool,
  updateFileTool,
  patchFileTool,
  deleteFileTool,
  executeCommandTool,
  getViteRuntimeErrorsTool,
];

/** Fix a failed check. No internet, no deletes. */
export const DEBUGGER_TOOLS = [
  listFilesTool,
  readFileTool,
  searchCodeTool,
  createFileTool,
  updateFileTool,
  patchFileTool,
  executeCommandTool,
  getViteRuntimeErrorsTool,
];

/** Clio, the editor copilot: read and make small edits. */
export const COPILOT_TOOLS = [...READ_ONLY_TOOLS, patchFileTool, updateFileTool];
