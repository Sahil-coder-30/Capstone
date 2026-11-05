// file.tools.js
// File tools: list, read, create, update, patch and delete files in the
// user's sandbox workspace.

import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { callSandboxTool, logToRun } from "./sandbox.client.js";
import { fromSandbox, toolError, toolOk } from "./toolResult.js";

const MAX_LISTED_FILES = 500;
const MAX_FILE_CHARS = 40_000;

const filePath = z.string().describe('Path relative to /workspace, e.g. "src/components/Header.jsx". No leading slash.');

export const listFilesTool = tool(
  async (_args, config) => {
    logToRun(config, "list_files: start");
    const res = await callSandboxTool(config, "list_files");
    if (!res.ok) return fromSandbox(res, "Could not list files");
    const files = res.data?.files || [];
    logToRun(config, `list_files: success - ${files.length} files`);
    return toolOk({
      count: files.length,
      files: files.slice(0, MAX_LISTED_FILES),
      ...(files.length > MAX_LISTED_FILES && { note: `Only the first ${MAX_LISTED_FILES} paths are shown. Use search_code to find others.` }),
    });
  },
  {
    name: "list_files",
    description: "List every file in the project (node_modules and .git are skipped). Returns workspace-relative paths.",
    schema: z.object({}),
  },
);

export const readFileTool = tool(
  async ({ files }, config) => {
    logToRun(config, `read_file: start - ${files.join(", ")}`);
    const res = await callSandboxTool(config, "read_file", { files });
    if (!res.ok) return fromSandbox(res, "Could not read files");
    const results = (res.data?.files || []).map((entry) =>
      typeof entry.content === "string" && entry.content.length > MAX_FILE_CHARS
        ? { file: entry.file, content: entry.content.slice(0, MAX_FILE_CHARS), truncated: true }
        : entry,
    );
    logToRun(config, `read_file: success - ${results.length} file(s)`);
    return toolOk({ files: results });
  },
  {
    name: "read_file",
    description: "Read one or more files and return their full content. Batch related files in one call. A missing file comes back with an \"error\" field.",
    schema: z.object({
      files: z.array(filePath).min(1).max(10).describe("Files to read (1 to 10)"),
    }),
  },
);

export const createFileTool = tool(
  async ({ files }, config) => {
    logToRun(config, `create_file: start - ${files.map((f) => f.file).join(", ")}`);
    const res = await callSandboxTool(config, "create_file", { files });
    logToRun(config, `create_file: ${res.ok ? "success" : `error - ${res.error}`}`);
    return fromSandbox(res, "Could not create files");
  },
  {
    name: "create_file",
    description: "Create new files with full content. Parent folders are created automatically. An existing file is overwritten, so use patch_file or update_file to change existing files.",
    schema: z.object({
      files: z
        .array(z.object({ file: filePath, content: z.string().describe("Full file content") }))
        .min(1)
        .describe("Files to create"),
    }),
  },
);

export const updateFileTool = tool(
  async ({ updates }, config) => {
    logToRun(config, `update_file: start - ${updates.map((u) => u.file).join(", ")}`);
    const res = await callSandboxTool(config, "update_file", { updates });
    logToRun(config, `update_file: ${res.ok ? "success" : `error - ${res.error}`}`);
    return fromSandbox(res, "Could not update files");
  },
  {
    name: "update_file",
    description: "Replace the whole content of existing files. Use it for large rewrites. For small edits use patch_file. Always read_file first so nothing is lost.",
    schema: z.object({
      updates: z
        .array(z.object({ file: filePath, content: z.string().describe("The complete new content") }))
        .min(1)
        .describe("Files to rewrite"),
    }),
  },
);

const patchOnce = (config, args) => callSandboxTool(config, "patch_file", args);

export const patchFileTool = tool(
  async ({ filePath: file, oldStr, newStr }, config) => {
    logToRun(config, `patch_file: start - ${file}`);
    let res = await patchOnce(config, { filePath: file, oldStr, newStr });

    // Models often add or drop surrounding whitespace. Retry once with a
    // trimmed oldStr. The sidecar still rejects an ambiguous match.
    const notFound = res.ok && res.data?.success === false && /not found/i.test(res.data?.error || "");
    if (notFound && oldStr.trim() && oldStr.trim() !== oldStr) {
      res = await patchOnce(config, { filePath: file, oldStr: oldStr.trim(), newStr: newStr.trim() });
    }

    if (!res.ok) return toolError(`Could not patch ${file}: ${res.error}`);
    if (res.data?.success !== true) {
      logToRun(config, `patch_file: error - ${res.data?.error}`);
      return toolError(`Could not patch ${file}: ${res.data?.error || "unknown error"}`, {
        hint: `${res.data?.hint || ""} Copy oldStr exactly from read_file or search_code output, or use update_file for a full rewrite.`.trim(),
      });
    }
    logToRun(config, `patch_file: success - ${file}`);
    return toolOk({ success: true, patched: file });
  },
  {
    name: "patch_file",
    description:
      "Replace one exact, unique piece of text in an existing file. Best for small edits. oldStr must match the file exactly (same whitespace and indentation) and appear only once, so include 2-3 surrounding lines.",
    schema: z.object({
      filePath,
      oldStr: z.string().min(1).describe("Exact text to replace. Must appear exactly once in the file."),
      newStr: z.string().describe("Replacement text"),
    }),
  },
);

export const deleteFileTool = tool(
  async ({ files }, config) => {
    logToRun(config, `delete_file: start - ${files.join(", ")}`);
    const res = await callSandboxTool(config, "delete_file", { files });
    logToRun(config, `delete_file: ${res.ok ? "success" : `error - ${res.error}`}`);
    return fromSandbox(res, "Could not delete files");
  },
  {
    name: "delete_file",
    description: "Delete files or folders (folders are deleted recursively).",
    schema: z.object({ files: z.array(filePath).min(1).describe("Paths to delete") }),
  },
);
