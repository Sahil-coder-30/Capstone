import axios from "axios";
import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import CommandSummary from "../models/CommandSummary.model.js";

function formatError(err) {
  try {
    const isAxios = axios.isAxiosError && axios.isAxiosError(err);
    if (isAxios) {
      return {
        message: err.message,
        code: err.code || null,
        stack: err.stack || null,
        config: err.config || null,
        response: err.response
          ? {
              status: err.response.status,
              statusText: err.response.statusText,
              data: err.response.data,
              headers: err.response.headers,
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
      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/read-file?files=` +
          file.join(","),
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

const summaryModel = new ChatMistralAI({
  model: "mistral-medium-latest",
  apiKey: process.env.MISTRALAI_API_KEY,
  maxRetries: 6,
  timeout: 180_000, // 3 minutes
});

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

        const summaryResponse = await summaryModel.invoke([
          { role: "user", content: prompt }
        ]);
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
      "Execute shell commands within the workspace directory with safety restrictions. Commands run in /workspace by default. Optional subDir restricts execution to a subdirectory. Commands timeout after 30 seconds. Output is limited to 1MB per stream. Use only for shell tooling like npm install, build commands, tests, git, mkdir, rm. Never use executeCommand to read, write, or create files; use readFile/createFile/updateFile for that.",
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
 * patchFile — targeted string-replace with automatic read-then-retry fallback.
 *
 * Attempt order (all transparent to the agent):
 *   1. POST /api/agent/patch-file with the supplied oldStr/newStr.
 *   2. If the patch fails (oldStr not found / ambiguous), automatically read
 *      the current file content via GET /api/agent/read-file, then retry the
 *      patch with the freshest possible content as context.
 *   3. If the retry also fails, fall through to an updateFile rewrite using
 *      the live file content with newStr substituted in.
 *   4. Only surface a hard failure string to the agent if all three attempts
 *      fail — at that point the agent has enough context to decide what to do.
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

    // ── attempt 2: retry patch — the server now has the freshest content ─────
    // The most common failure is a stale/mismatched oldStr. We do a best-effort
    // substring search in the live content to give the agent a corrected oldStr.
    config.writer(`patchFile: attempt 2 - retrying patch for "${filePath}"`);
    try {
      patchResult = await tryPatch(oldStr);
    } catch (err) {
      const formatted = logError("patchFile/attempt2", err);
      config.writer(`patchFile: attempt 2 network error - ${JSON.stringify(formatted)}`);
      // fall through to auto-rewrite below
      patchResult = { success: false, error: formatted.message };
    }

    if (patchResult.success) {
      config.writer(`patchFile: attempt 2 success - "${filePath}" patched on retry`);
      return `Patched ${filePath} successfully (on retry)`;
    }

    config.writer(
      `patchFile: attempt 2 failed - "${patchResult.error}". Attempting auto-rewrite via updateFile.`,
    );

    // ── attempt 3: auto-rewrite ──────────────────────────────────────────────
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
  2. If it fails, reads the live file content and retries automatically.
  3. If it still fails, attempts a direct string-replace rewrite as a last resort.
  4. Only surfaces an error to you if all three attempts fail — which is rare.

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



