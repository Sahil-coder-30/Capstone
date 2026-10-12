import axios from "axios";
import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { ChatOpenRouter } from "@langchain/openrouter";
import CommandSummary from "../models/CommandSummary.model.js";
import { searchInternet } from "../services/internetSearch.service.js";

// Caps how much of any single string field gets sent back into the model's
// context. Response bodies/error data can otherwise be arbitrarily large
// (e.g. an echoed file payload), which bloats tokens and derails the agent.
const MAX_ERROR_FIELD_CHARS = 2000;

function truncate(value) {
  if (typeof value !== "string") return value;
  return value.length > MAX_ERROR_FIELD_CHARS
    ? value.slice(0, MAX_ERROR_FIELD_CHARS) + "...[truncated]"
    : value;
}

function formatError(err) {
  try {
    const isAxios = axios.isAxiosError && axios.isAxiosError(err);
    if (isAxios) {
      // IMPORTANT: never spread the raw err.config/err.request back into the
      // tool result. err.config.data is the JSON body we just sent (e.g. the
      // full new file content for create_file/update_file), so including it
      // verbatim would echo potentially huge payloads straight back into the
      // model's context on every transient failure. err.config can also hold
      // non-plain values (agents, transformers) that are unsafe to serialize.
      // Only pull out the small, safe-to-share bits of request context.
      return {
        message: err.message,
        code: err.code || null,
        stack: err.stack || null,
        request: err.config
          ? {
              method: err.config.method || null,
              url: err.config.url || null,
              timeout: err.config.timeout || null,
            }
          : null,
        response: err.response
          ? {
              status: err.response.status,
              statusText: err.response.statusText,
              data: truncate(
                typeof err.response.data === "string"
                  ? err.response.data
                  : JSON.stringify(err.response.data),
              ),
            }
          : null,
      };
    }

    return {
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
    };
  } catch (e) {
    return {
      message: "Unknown error while formatting error",
      details: String(e),
    };
  }
}

function logError(toolName, err) {
  const formatted = formatError(err);
  console.error("============================");
  console.error(`Error in ${toolName}:`, formatted);
  console.error("============================");
  return formatted;
}

function ensureWriter(config) {
  if (!config) {
    return { writer: () => {}, configurable: { projectId: "unknown" } };
  }
  const safeConfig = { ...config };
  if (typeof safeConfig.writer !== "function") {
    safeConfig.writer = () => {};
  }
  if (!safeConfig.configurable) {
    safeConfig.configurable = { projectId: "unknown" };
  }
  return safeConfig;
}

export const listFiles = tool(
  async ({}, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `listFiles: start (project=${config?.configurable?.projectId || "unknown"})`,
      );
      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/list-files`,
        { timeout: 30_000 },
      );
      config.writer(
        `listFiles: success - response: ${JSON.stringify(response.data)}`,
      );

      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("listFiles", err);
      config.writer(
        `listFiles: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to list files",
        details: formatted,
      });
    }
  },
  {
    name: "list_files",
    description:
      "List all files in the working directory of the project and return the file names as a list of strings.",
    schema: z.object({}),
  },
);

export const readFile = tool(
  async ({ file }, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `readFile: start - files: ${JSON.stringify(file)}`,
      );
      // File paths must be URL-encoded individually — an un-encoded path
      // containing spaces, "&", "#", "%", or non-ASCII characters would
      // otherwise corrupt the query string (breaking the request or silently
      // dropping/merging file names).
      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/read-file?files=` +
          file.map(encodeURIComponent).join(","),
        { timeout: 30_000 },
      );
      const filesContent = response.data.files || response.data.content || response.data;
      config.writer(
        `readFile: success - response: ${JSON.stringify(filesContent)}`,
      );
      return JSON.stringify(filesContent);
    } catch (err) {
      const formatted = logError("readFile", err);
      config.writer(
        `readFile: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to read file(s)",
        details: formatted,
      });
    }
  },
  {
    name: "read_file",
    description:
      'Read the content of a file in the working directory of the project and return it as a string, can read multiple files at once, just pass the file names as a list of strings. If the file is in a subdirectory, include the relative path from the working directory. For example, if the file is located at "src/utils/helper.js", the fileName should be "src/utils/helper.js".',
    schema: z.object({
      file: z
        .array(z.string())
        .describe(
          "List of file names to read, can include relative paths for files in subdirectories",
        ),
    }),
  },
);

export const updateFile = tool(
  async ({ updates }, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `updateFile: start - updates: ${JSON.stringify(updates)}`,
      );
      const response = await axios.patch(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/update-file`,
        {
          updates,
        },
        { timeout: 30_000 },
      );
      config.writer(
        `updateFile: success - response: ${JSON.stringify(response.data)}`,
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("updateFile", err);
      config.writer(
        `updateFile: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to update file(s)",
        details: formatted,
      });
    }
  },
  {
    name: "update_file",
    description:
      "Use to update the content of files. Multiple files can also be updated at the same time.",
    schema: z.object({
      updates: z
        .array(
          z.object({
            file: z
              .string()
              .describe(
                'The name of the file to update. If the file is in a subdirectory, include the relative path from the working directory. For example, if the file is located at "src/utils/helper.js", the file name should be "src/utils/helper.js".',
              ),
            content: z
              .string()
              .describe("The new content to write to the file."),
          }),
        )
        .describe("List of files to update with their new content"),
    }),
  },
);

export const createFile = tool(
  async ({ files }, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `createFile: start - files: ${JSON.stringify(files)}`,
      );
      const response = await axios.post(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/create-file`,
        {
          files,
        },
        { timeout: 30_000 },
      );
      config.writer(
        `createFile: success - response: ${JSON.stringify(response.data)}`,
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("createFile", err);
      config.writer(
        `createFile: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to create file(s)",
        details: formatted,
      });
    }
  },
  {
    name: "create_file",
    description:
      'Create one or more new files in the workspace. All intermediate parent directories are created automatically at any nesting depth — you do NOT need to create directories manually before creating a file inside them. For example, creating "src/components/ui/Button.jsx" will automatically create "src/", "src/components/", and "src/components/ui/" if they don\'t exist. If the file already exists, its content will be overwritten. Send a JSON body with a "files" array — each item must have a "file" (relative path) and "content" (file content as a string) property. Always prefer batching multiple file creations into a single call.',
    schema: z.object({
      files: z
        .array(
          z.object({
            file: z
              .string()
              .describe(
                'Relative path of the file to create (e.g. "src/components/Header.jsx"). Supports any nesting level. Do NOT include a leading slash.',
              ),
            content: z
              .string()
              .describe(
                'Full content to write to the file. Empty string "" is valid.',
              ),
          }),
        )
        .describe(
          "Array of { file: string, content: string } objects representing the files to create",
        ),
    }),
  },
);

let summaryModelInstance = null;
const getSummaryModel = () => {
  if (!summaryModelInstance) {
    const openRouterApiKey = (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER)?.trim();
    if (!openRouterApiKey) {
      throw new Error("No AI provider key configured. Set OPENROUTER_API_KEY.");
    }
    summaryModelInstance = new ChatOpenRouter({
      model: "openai/gpt-6-luna",
      apiKey: openRouterApiKey,
      temperature: 0.1,
      maxRetries: 3,
      timeout: 180_000, // 3 minutes
      tags: ["tool_summary_internal"],
    });
  }
  return summaryModelInstance;
};

export const executeCommand = tool(
  async ({ command, subDir }, config) => {
    config = ensureWriter(config);
    const projectId = config?.configurable?.projectId || "unknown";
    try {
      config.writer(
        `executeCommand: start - command: "${command}", subDir: "${subDir || ""}"`,
      );
      const response = await axios.post(
        `http://sandbox-service-${projectId}:3000/api/agent/exec`,
        {
          command,
          ...(subDir && { subDir }),
        },
        { timeout: 120_000 }, // npm install can be slow — keep high
      );
      
      const rawData = response.data;
      const outputText = typeof rawData === "string" ? rawData : JSON.stringify(rawData);
      
      // Summarize the command execution using Gemini
      let summary = "";
      try {
        const prompt = `Command executed: "${command}"
Subdirectory: "${subDir || "root"}"
Output from terminal:
${outputText.substring(0, 5000)}

Please provide a concise one-sentence summary of the work that was accomplished by this command (e.g. "Installed package lodash", "Built project successfully", "Tests passed"). Be extremely direct.`;
        
        let promptTokens = 0;
        let completionTokens = 0;
        let totalTokens = 0;

        const summaryResponse = await getSummaryModel().invoke(
          [{ role: "user", content: prompt }],
          { tags: ["tool_summary_internal"] }
        );
        summary = summaryResponse.content?.trim() || "Executed command successfully";

        // Capture token usage from summarization model run
        if (summaryResponse.usage_metadata) {
          promptTokens = summaryResponse.usage_metadata.input_tokens || 0;
          completionTokens = summaryResponse.usage_metadata.output_tokens || 0;
          totalTokens = summaryResponse.usage_metadata.total_tokens || 0;
        } else if (summaryResponse.response_metadata?.tokenUsage || summaryResponse.response_metadata?.usage) {
          const usage = summaryResponse.response_metadata.tokenUsage || summaryResponse.response_metadata.usage;
          promptTokens = usage.prompt_tokens || usage.promptTokens || 0;
          completionTokens = usage.completion_tokens || usage.completionTokens || 0;
          totalTokens = usage.total_tokens || usage.totalTokens || 0;
        }

        // Save command log and summary to MongoDB
        try {
          await CommandSummary.create({
            projectId,
            command,
            subDir: subDir || "",
            output: outputText.substring(0, 10000), // Cap output size in DB
            summary,
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens: totalTokens || (promptTokens + completionTokens),
            },
          });
          console.log(`Saved command summary for project ${projectId} with token usage: input=${promptTokens}, output=${completionTokens}`);
        } catch (dbErr) {
          console.error("Failed to save command summary to MongoDB:", dbErr.message);
        }
      } catch (err) {
        console.error("Error generating command summary:", err.message);
        summary = `Executed command: ${command}`;
      }

      config.writer(
        `executeCommand: success - response: ${JSON.stringify(response.data)}`,
      );
      
      // Return a structured JSON containing the original output and the summary so the agent can read it too
      return JSON.stringify({
        ...rawData,
        summary,
      });
    } catch (err) {
      const formatted = logError("executeCommand", err);
      config.writer(
        `executeCommand: error - details: ${JSON.stringify(formatted)}`,
      );
      
      // Save failed command to MongoDB
      try {
        const errorText = formatted.message || JSON.stringify(formatted);
        const summary = `Failed to execute: ${command} (${errorText})`;
        await CommandSummary.create({
          projectId,
          command,
          subDir: subDir || "",
          output: errorText,
          summary,
        });
      } catch (dbErr) {
        console.error("Failed to save failed command summary to MongoDB:", dbErr.message);
      }

      return JSON.stringify({
        error: true,
        message: "Failed to execute command",
        details: formatted,
      });
    }
  },
  {
    name: "execute_command",
    description:
      "Execute shell commands within the workspace directory with safety restrictions. Commands run in /workspace by default. Optional subDir restricts execution to a subdirectory. Commands timeout after 120 seconds. Output is limited to 1MB per stream. Use only for shell tooling like npm install, build commands, tests, git, mkdir, rm. Never use executeCommand to read, write, or create files; use readFile/createFile/updateFile for that.",
    schema: z.object({
      command: z
        .string()
        .min(1)
        .describe(
          'Non-empty shell command to execute. Examples: "npm install", "npm run build", "ls -la", "git status", "node script.js". IMPORTANT: Only pass sanitized/validated commands to prevent shell injection.',
        ),
      subDir: z
        .string()
        .optional()
        .describe(
          'Optional subdirectory to execute the command in, relative to workspace root. Examples: "src", "src/components", "packages/ui". Must not contain path traversal attempts (../).',
        ),
    }),
  },
);

export const getViteRuntimeErrors = tool(
  async ({}, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `getViteRuntimeErrors: start (project=${config?.configurable?.projectId || "unknown"})`,
      );
      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/vite-runtime-errors`,
        { timeout: 45_000 }, // k8s log fetch — give it time but not infinite
      );
      console.log("============================");
      console.log("Using the getViteRuntimeErrors tool");
      console.log(response.data);
      console.log("============================");
      config.writer(
        `getViteRuntimeErrors: success - response: ${JSON.stringify(response.data)}`,
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("getViteRuntimeErrors", err);
      config.writer(
        `getViteRuntimeErrors: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to fetch Vite runtime errors",
        details: formatted,
      });
    }
  },
  {
    name: "get_vite_runtime_errors",
    description:
      "Fetch recent Vite runtime logs from the sandbox pod. Returns the current pod name, namespace, and the last 50 log lines from the sandbox container.",
    schema: z.object({}),
  },
);

/**
 * patchFile — targeted string-replace with automatic read-then-rewrite fallback.
 *
 * Attempt order (all transparent to the agent):
 *   1. POST /api/agent/patch-file with the supplied oldStr/newStr.
 *   2. If the patch fails (oldStr not found / ambiguous), automatically read
 *      the current file content via GET /api/agent/read-file, then fall
 *      through to an updateFile rewrite: an exact match of oldStr against
 *      the live content is tried first, then a whitespace-trimmed match.
 *   3. Only surface a hard failure string to the agent if every attempt
 *      fails — at that point the agent has enough context to decide what to do.
 */
export const patchFile = tool(
  async ({ filePath, oldStr, newStr }, config) => {
    config = ensureWriter(config);
    const baseUrl = `http://sandbox-service-${config.configurable.projectId}:3000`;

    // ── helper: call the sandbox patch endpoint ──────────────────────────────
    const tryPatch = async (oldString) => {
      const res = await axios.post(
        `${baseUrl}/api/agent/patch-file`,
        { filePath, oldStr: oldString, newStr },
        { timeout: 30_000 },
      );
      return res.data; // { success, error?, hint?, patched? }
    };

    // ── attempt 1: patch with the caller-supplied oldStr ─────────────────────
    config.writer(`patchFile: attempt 1 - file: "${filePath}"`);
    let patchResult;
    try {
      patchResult = await tryPatch(oldStr);
    } catch (err) {
      const formatted = logError("patchFile/attempt1", err);
      config.writer(`patchFile: attempt 1 network error - ${JSON.stringify(formatted)}`);
      return JSON.stringify({
        error: true,
        message: "patchFile failed (network error on attempt 1). Fall back to updateFile.",
        details: formatted,
      });
    }

    if (patchResult.success) {
      config.writer(`patchFile: attempt 1 success - "${filePath}" patched`);
      return `Patched ${filePath} successfully`;
    }

    config.writer(
      `patchFile: attempt 1 failed - error: "${patchResult.error}", hint: "${patchResult.hint}". Auto-reading file for retry.`,
    );

    // ── auto-read the file to get the current content ────────────────────────
    let currentContent;
    try {
      const readRes = await axios.get(
        `${baseUrl}/api/agent/read-file?files=${encodeURIComponent(filePath)}`,
        { timeout: 30_000 },
      );
      const files = readRes.data.files || [];
      const entry = files.find((f) => f.file === filePath || f.file === filePath.replace(/^\//, ""));
      if (!entry || entry.error) {
        throw new Error(entry?.error || "File not found in read response");
      }
      currentContent = entry.content;
    } catch (readErr) {
      const formatted = logError("patchFile/auto-read", readErr);
      config.writer(`patchFile: auto-read failed - ${JSON.stringify(formatted)}`);
      return JSON.stringify({
        error: true,
        message: `patchFile failed and auto-read also failed for "${filePath}". Use updateFile as a last resort.`,
        patchError: patchResult.error,
        readError: formatted.message,
      });
    }

    // NOTE: there used to be an "attempt 2" here that just called tryPatch()
    // again with the exact same oldStr/newStr. Since the sandbox patch
    // endpoint is a deterministic string match, resending an identical
    // request is guaranteed to fail identically (barring a pure network
    // blip already handled above) — it only added a wasted round trip and
    // extra latency before the agent got useful feedback. The real recovery
    // path is the substring-based repair below, using the content we just
    // read, so we go straight there.

    // ── attempt 2: auto-rewrite ───────────────────────────────────────────────
    // If oldStr does not appear in the live content at all, nothing we can do
    // automatically — surface a clear error with the live content snippet so
    // the agent can craft a correct call.
    if (!currentContent.includes(oldStr)) {
      // Try a trimmed version as a last-ditch effort
      const trimmedOld = oldStr.trim();
      const idx = currentContent.indexOf(trimmedOld);
      if (idx === -1) {
        config.writer(`patchFile: oldStr not found in live content — surfacing error`);
        // Show a snippet of the file so the agent can self-correct without an extra readFile call
        const snippet = currentContent.length > 800
          ? currentContent.slice(0, 800) + "\n...[truncated]"
          : currentContent;
        return JSON.stringify({
          error: true,
          message: `patchFile failed: oldStr not found in "${filePath}" after reading live content.`,
          hint: "The oldStr you supplied does not appear verbatim in the file. Use the current_content below to pick a new, exact oldStr and retry patchFile — or call updateFile for a full rewrite.",
          current_content: snippet,
        });
      }

      // oldStr found when trimmed — do the rewrite with the trimmed version
      const rewritten = currentContent.replace(trimmedOld, newStr);
      config.writer(`patchFile: auto-rewrite with trimmed oldStr for "${filePath}"`);
      try {
        const updateRes = await axios.patch(
          `${baseUrl}/api/agent/update-file`,
          { updates: [{ file: filePath, content: rewritten }] },
          { timeout: 120000 },
        );
        config.writer(`patchFile: auto-rewrite success - ${JSON.stringify(updateRes.data)}`);
        return `Patched ${filePath} successfully (auto-rewrite after trimming whitespace)`;
      } catch (updateErr) {
        const formatted = logError("patchFile/auto-rewrite", updateErr);
        config.writer(`patchFile: auto-rewrite failed - ${JSON.stringify(formatted)}`);
        return JSON.stringify({
          error: true,
          message: `patchFile auto-rewrite failed for "${filePath}". Call updateFile manually.`,
          details: formatted,
        });
      }
    }

    // oldStr is present — do the rewrite directly
    const rewritten = currentContent.replace(oldStr, newStr);
    config.writer(`patchFile: auto-rewrite (direct replace) for "${filePath}"`);
    try {
      const updateRes = await axios.patch(
        `${baseUrl}/api/agent/update-file`,
        { updates: [{ file: filePath, content: rewritten }] },
        { timeout: 120000 },
      );
      config.writer(`patchFile: auto-rewrite success - ${JSON.stringify(updateRes.data)}`);
      return `Patched ${filePath} successfully (auto-rewrite fallback)`;
    } catch (updateErr) {
      const formatted = logError("patchFile/auto-rewrite", updateErr);
      config.writer(`patchFile: auto-rewrite failed - ${JSON.stringify(formatted)}`);
      return JSON.stringify({
        error: true,
        message: `patchFile auto-rewrite failed for "${filePath}". Call updateFile manually.`,
        details: formatted,
      });
    }
  },
  {
    name: "patch_file",
    description: `Make a small, targeted edit to an existing file by replacing one exact string with another.
Prefer this over updateFile for changes under 20 lines.

IMPORTANT — oldStr quality rules (follow these to avoid failures):
  • Always include 2–3 lines of surrounding context so the match is unique.
  • Never pass a fragment so short it could match in multiple places (e.g. just "<div>").
  • oldStr must match the file content exactly — same whitespace, same indentation.

This tool has automatic fallback built in:
  1. Tries the patch directly.
  2. If it fails, reads the live file content and attempts a direct string-replace rewrite instead (falling back to a whitespace-trimmed match if needed).
  3. Only surfaces an error to you if every attempt fails — which is rare.

You do NOT need to manually call readFile and retry — the tool does it for you.`,
    schema: z.object({
      filePath: z.string().describe("Path relative to /workspace (e.g. src/App.jsx)"),
      oldStr: z
        .string()
        .describe(
          "Exact string to replace — must be unique in the file. Include 2–3 surrounding lines of context to guarantee uniqueness.",
        ),
      newStr: z.string().describe("Replacement string"),
    }),
  },
);

export const deleteFile = tool(
  async ({ files }, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `deleteFile: start - files: ${JSON.stringify(files)}`,
      );
      const response = await axios.delete(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/delete-file`,
        {
          data: { files },
          timeout: 30_000,
        },
      );
      config.writer(
        `deleteFile: success - response: ${JSON.stringify(response.data)}`,
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("deleteFile", err);
      config.writer(
        `deleteFile: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to delete file(s)/directory(ies)",
        details: formatted,
      });
    }
  },
  {
    name: "delete_file",
    description:
      "Delete one or more files or directories in the workspace. Send a list of relative file/directory paths to delete. Parent directories or nested files are deleted recursively if a directory path is passed. Always prefer batching multiple file deletions into a single call.",
    schema: z.object({
      files: z
        .array(z.string())
        .describe(
          "List of relative paths to delete (e.g. ['src/components/Header.jsx', 'temp_dir/']). Supports folders and files. Do NOT include a leading slash.",
        ),
    }),
  },
);

export const searchCode = tool(
  async ({ pattern, isRegex, caseSensitive, fileGlob, contextLines, maxResults, filesOnly }, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `searchCode: start - pattern: ${pattern}, isRegex: ${isRegex}, caseSensitive: ${caseSensitive}, fileGlob: ${fileGlob}, contextLines: ${contextLines}, maxResults: ${maxResults}, filesOnly: ${filesOnly}`,
      );

      const params = {};
      if (pattern !== undefined) params.pattern = pattern;
      if (isRegex !== undefined) params.isRegex = String(isRegex);
      if (caseSensitive !== undefined) params.caseSensitive = String(caseSensitive);
      if (fileGlob !== undefined) params.fileGlob = fileGlob;
      if (contextLines !== undefined) params.contextLines = String(contextLines);
      if (maxResults !== undefined) params.maxResults = String(maxResults);
      if (filesOnly !== undefined) params.filesOnly = String(filesOnly);

      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/search-code`,
        {
          params,
          timeout: 15_000,
        },
      );
      config.writer(
        `searchCode: success - response: ${JSON.stringify(response.data)}`,
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("searchCode", err);
      config.writer(
        `searchCode: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to search code",
        details: formatted,
      });
    }
  },
  {
    name: "search_code",
    description: `Search for a text pattern or regex across the entire codebase WITHOUT reading full files.
Returns matching file paths, line numbers, the matched line, and surrounding context lines.
Use this to find specific variables, functions, classes, imports, or bug patterns.
The context lines returned preserve exact original whitespace and indentation, so they can be copied directly into patch_file's oldStr.
Always prefer this over read_file when you know what you are looking for.`,
    schema: z.object({
      pattern: z
        .string()
        .describe("The text pattern or regex pattern to search for (max 500 characters)."),
      isRegex: z
        .boolean()
        .optional()
        .describe("Whether to treat the pattern as a regular expression. Defaults to false."),
      caseSensitive: z
        .boolean()
        .optional()
        .describe("Whether to perform a case-sensitive search. Defaults to false."),
      fileGlob: z
        .string()
        .optional()
        .describe("Substring filter to restrict search to matching relative file paths (e.g. 'src/components')."),
      contextLines: z
        .number()
        .optional()
        .describe("Number of lines of context above and below the match to return (0 to 5, default 2). Ignored if filesOnly is true."),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of search results to return (1 to 50, default 20)."),
      filesOnly: z
        .boolean()
        .optional()
        .describe("If true, only returns a list of unique relative file paths containing matches (much cheaper and faster). Defaults to false."),
    }),
  },
);

export const searchInternetTool = tool(
  async (args, config) => {
    config = ensureWriter(config);
    try {
      config.writer(
        `searchInternet: start - query: "${args.query}"`,
      );
      const resultStr = await searchInternet(args);
      config.writer(
        `searchInternet: success - response received`,
      );
      return resultStr;
    } catch (err) {
      const formatted = logError("searchInternet", err);
      config.writer(
        `searchInternet: error - details: ${JSON.stringify(formatted)}`,
      );
      return JSON.stringify({
        error: true,
        message: "Failed to search internet",
        details: formatted,
      });
    }
  },
  {
    name: "search_internet",
    description:
      "Search the internet using Tavily for up-to-date documentation, current package versions, API surfaces, breaking changes, or unfamiliar libraries. Treat as a scoped tool during PLANNING before writing code. Costs API credits — use judiciously.",
    schema: z.object({
      query: z
        .string()
        .describe("The focused search query string (e.g., 'React 19 new hooks API', 'Vite 5 config server.proxy')."),
      searchDepth: z
        .enum(["basic", "advanced"])
        .optional()
        .describe("Search depth. Use 'advanced' for technical library/API queries, 'basic' for quick checks. Defaults to 'basic'."),
      topic: z
        .enum(["general", "news", "finance"])
        .optional()
        .describe("Category of search. Defaults to 'general'."),
      maxResults: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of search results to return (1-20). Defaults to 5."),
      timeRange: z
        .enum(["day", "week", "month", "year", "d", "w", "m", "y"])
        .optional()
        .describe("Time filter for results. Prefer 'year' or 'month' when checking if an API is current."),
      startDate: z
        .string()
        .optional()
        .describe("Only results after this date (YYYY-MM-DD)."),
      endDate: z
        .string()
        .optional()
        .describe("Only results before this date (YYYY-MM-DD)."),
      includeAnswer: z
        .union([z.boolean(), z.enum(["basic", "advanced"])])
        .optional()
        .describe("Whether to include an LLM-synthesized answer from results. Set true for planning."),
      includeRawContent: z
        .union([z.boolean(), z.enum(["markdown", "text"])])
        .optional()
        .describe("Include full cleaned page content instead of just snippets."),
      chunksPerSource: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Number of content chunks per source (advanced searchDepth only)."),
      includeDomains: z
        .array(z.string())
        .optional()
        .describe("Restrict search to specific domains (e.g. ['react.dev', 'npmjs.com'])."),
      excludeDomains: z
        .array(z.string())
        .optional()
        .describe("Exclude specific domains from search results."),
      country: z
        .string()
        .optional()
        .describe("Boost results from a specific country (topic must be 'general')."),
      includeImages: z
        .boolean()
        .optional()
        .describe("Include query-related images in response."),
      includeImageDescriptions: z
        .boolean()
        .optional()
        .describe("Include descriptions for images in response."),
      exactMatch: z
        .boolean()
        .optional()
        .describe("Only return results containing the exact quoted phrase in query."),
      includeFavicon: z
        .boolean()
        .optional()
        .describe("Include favicon URL per result."),
      includeUsage: z
        .boolean()
        .optional()
        .describe("Include credit usage info in response."),
      timeout: z
        .number()
        .optional()
        .describe("Request timeout in seconds (default 60)."),
    }),
  },
);