// command.tools.js
// Shell commands and dev-server logs inside the sandbox.

import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { getRuntimeLogs, logToRun, runCommand } from "./sandbox.client.js";
import { toolError, toolOk } from "./toolResult.js";

const MAX_STREAM_CHARS = 6_000;

/** Build and install tools print errors at the end, so keep the tail. */
const tail = (text) =>
  text.length <= MAX_STREAM_CHARS ? text : `...[${text.length - MAX_STREAM_CHARS} chars cut]...\n${text.slice(-MAX_STREAM_CHARS)}`;

export const executeCommandTool = tool(
  async ({ command, subDir }, config) => {
    logToRun(config, `execute_command: start - "${command}"`);
    const result = await runCommand(config, command, { subDir });
    logToRun(config, `execute_command: ${result.ok ? "success" : "error"} - "${command}"`);

    const output = { stdout: tail(result.stdout), stderr: tail(result.stderr) };
    if (result.ok) return toolOk({ success: true, ...output });
    return toolError(result.timedOut ? `Command timed out: ${command}` : `Command failed: ${command}`, {
      success: false,
      detail: result.error,
      ...output,
    });
  },
  {
    name: "execute_command",
    description:
      "Run a shell command in /workspace (npm install, npm run build, tests, git, mkdir). Times out after 120s. Never use it to read or write files (use the file tools) and never start dev/preview servers.",
    schema: z.object({
      command: z.string().min(1).describe('Shell command, e.g. "npm install axios"'),
      subDir: z.string().optional().describe('Run inside this subfolder of /workspace, e.g. "packages/ui"'),
    }),
  },
);

export const getViteRuntimeErrorsTool = tool(
  async (_args, config) => {
    logToRun(config, "get_vite_runtime_errors: start");
    const logs = await getRuntimeLogs(config);
    logToRun(config, `get_vite_runtime_errors: ${logs === null ? "error" : "success"}`);
    if (logs === null) return toolError("Could not read the dev server logs.");
    return toolOk({ logs: tail(logs) });
  },
  {
    name: "get_vite_runtime_errors",
    description: "Read the last lines of the running Vite dev server log to find compile or runtime errors.",
    schema: z.object({}),
  },
);
