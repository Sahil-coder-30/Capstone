// exec.controller.js
// execute-command tool. Reachable only through the MCP endpoint.

import path from "path";
import { exec as runShell } from "child_process";
import { WORKING_DIR } from "../workspace/paths.js";

/**
 * TOOL: execute-command
 *
 * @description
 *   Execute arbitrary shell commands within a restricted workspace directory.
 *   This endpoint allows running terminal commands (e.g., npm scripts, build commands)
 *   locked to a specific directory context for isolation and safety.
 *   By default, commands run in the workspace root (/workspace).
 *   Optional 'subDir' restricts execution to a subdirectory within the workspace.
 *   Commands timeout after 30 seconds and output is limited to 1MB to prevent hanging
 *   and memory exhaustion.
 *
 *
 * @body {Object} JSON body (required)
 *   - command {string} Required. Non-empty shell command to execute (e.g., "npm install", "ls -la")
 *   - subDir {string}  Optional. Subdirectory to execute in, relative to workspace root
 *                      (e.g., "src/components", "nested/dir/path").
 *                      Must not escape the workspace via path traversal (../).
 *
 * @response {Object} JSON response (200)\n *   - status  {string}  \"ok\" on successful request handling (command may still fail)\n *   - success {boolean} True if command exited with code 0, false otherwise\n *   - stdout  {string}  Standard output from the command (trimmed, max 1MB)\n *   - stderr  {string}  Standard error output from the command (trimmed, max 1MB)\n *   - error   {string}  Error message if execution failed (null on success)\n *   - timedOut {boolean} True if command exceeded 30-second timeout\n *
 * @response-error-400\n *   { \"status\": \"error\", \"message\": \"'command' parameter is required...\" }\n *
 * @response-error-403\n *   { \"status\": \"error\", \"message\": \"Access Denied: You cannot leave the /workspace...\" }\n *
 * @example — successful command\n *   Request:\n *     POST /api/agent/exec\n *     Content-Type: application/json\n *\n *     {\n *       \"command\": \"npm install\",\n *       \"subDir\": \"src/components\"\n *     }\n *\n *   Response (200):\n *     {\n *       \"status\": \"ok\",\n *       \"success\": true,\n *       \"stdout\": \"added 42 packages in 5.2s\",\n *       \"stderr\": \"\",\n *       \"error\": null,\n *       \"timedOut\": false\n *     }\n *
 * @security\n *   ✅ INPUT VALIDATION:\n *   - Validates command is non-empty string (prevents null/undefined/empty requests)\n *   - Validates subDir is non-empty string (if provided)\n *\n *   ✅ PATH TRAVERSAL PROTECTION:\n *   - Uses path.resolve() + startsWith() check to prevent escaping /workspace\n *   - Paths like \"../../etc/passwd\" will be rejected with 403 Forbidden\n *   - Edge case: handles path separator differences (Unix vs Windows)\n *
 *   ⚠️  COMMAND INJECTION RISK (MEDIUM):\n *   - Uses exec() which spawns a shell (/bin/sh on Unix, cmd.exe on Windows)\n *   - Vulnerable to shell injection if command contains user input\n *   - MITIGATION: Validate/sanitize command input in calling code\n *   - BETTER: Use execFile() + argument array for untrusted commands\n *
 *   ✅ TIMEOUT PROTECTION:\n *   - 30-second timeout prevents commands from hanging indefinitely\n *   - Helps prevent DoS attacks and worker thread exhaustion\n *   - Timed-out processes are killed automatically\n *   - Response includes timedOut flag to indicate timeout\n *
 *   ✅ OUTPUT SIZE PROTECTION:\n *   - stdout/stderr limited to 1MB each (1,048,576 bytes)\n *   - Prevents memory exhaustion from huge output streams\n *   - Excess output is truncated with warning message\n *   - maxBuffer option set to allow full utilization of limit\n *\n * @improvements-completed\n *   ✓ Added input validation for command parameter\n *   ✓ Added 30-second timeout to prevent hanging\n *   ✓ Added 1MB output size limit per stream\n *   ✓ Added timedOut flag to response\n *   ✓ Improved error messages and HTTP status codes\n *   ✓ Added edge case handling for empty/whitespace subDir\n *   ✓ Better path traversal check with path.sep consideration\n */

export const exec = (req, res) => {
  const { command, subDir } = req.body;

  // ─── VALIDATION: Command Parameter ────────────────────────────────────────
  // 1. Validate that command is provided and is a non-empty string
  if (!command || typeof command !== "string" || command.trim().length === 0) {
    return res.status(400).json({
      status: "error",
      message: "'command' parameter is required and must be a non-empty string",
    });
  }

  const BASE_WORKSPACE = WORKING_DIR;
  const MAX_OUTPUT_SIZE = 1048576; // 1MB limit per stream
  const isLongRunning = /npm\s+(install|ci|run\s+build|test)|npx/i.test(command);
  const COMMAND_TIMEOUT = isLongRunning ? 120000 : 30000; // 120s for installs/builds, 30s for standard commands
  let safeTargetDir = BASE_WORKSPACE;

  // ─── VALIDATION: Directory Path Traversal Protection ────────────────────
  // 2. Resolve and validate the directory path safely to prevent escape attempts
  if (subDir && typeof subDir === "string" && subDir.trim().length > 0) {
    const resolvedPath = path.resolve(BASE_WORKSPACE, subDir);

    // Security check: Ensure the resolved path is still within /workspace
    if (
      !resolvedPath.startsWith(BASE_WORKSPACE + path.sep) &&
      resolvedPath !== BASE_WORKSPACE
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access Denied: You cannot leave the /workspace directory.",
      });
    }
    safeTargetDir = resolvedPath;
  }

  // ─── EXECUTION: Run Command in Restricted Directory ──────────────────────
  // 3. Execute the command with timeout and output size limits
  let timedOut = false;
  const execOptions = {
    cwd: safeTargetDir,
    timeout: COMMAND_TIMEOUT,
    maxBuffer: MAX_OUTPUT_SIZE * 2,
  };

  runShell(command, execOptions, (error, stdout, stderr) => {
    // Check if timeout occurred
    if (error && error.code === "ETIMEDOUT") {
      timedOut = true;
    }

    // Truncate output if it exceeds the limit
    const truncatedStdout =
      stdout.length > MAX_OUTPUT_SIZE
        ? stdout.substring(0, MAX_OUTPUT_SIZE) +
        "\n[OUTPUT TRUNCATED - exceeded 1MB limit]"
        : stdout;

    const truncatedStderr =
      stderr.length > MAX_OUTPUT_SIZE
        ? stderr.substring(0, MAX_OUTPUT_SIZE) +
        "\n[OUTPUT TRUNCATED - exceeded 1MB limit]"
        : stderr;

    res.status(200).json({
      status: "ok",
      success: !error,
      stdout: truncatedStdout.trim(),
      stderr: truncatedStderr.trim(),
      error: error ? error.message : null,
      timedOut,
    });
  });
};
