import express from "express";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";
import { Server} from "socket.io";
import http from 'http';
import pty from 'node-pty';
import os from 'os';


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

const httpServer = http.createServer(app);


const WORKING_DIR = "/workspace";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strips the WORKING_DIR prefix from a full path, returning a clean relative path.
 * e.g. "/workspace/src/App.jsx" → "src/App.jsx"
 */
function stripWorkspace(fullPath) {
  return fullPath.startsWith(WORKING_DIR)
    ? fullPath.slice(WORKING_DIR.length).replace(/^\/+/, "")
    : fullPath;
}

/**
 * Safely resolves a user-supplied relative path within WORKING_DIR.
 * Throws if the resolved path escapes the workspace (path traversal protection).
 */
function safeResolve(file) {
  const normalized = file.replace(/^\/+/, "");
  const resolved = path.resolve(WORKING_DIR, normalized);
  if (!resolved.startsWith(WORKING_DIR + "/")) {
    throw new Error(`Access denied: "${file}" resolves outside the workspace`);
  }
  return resolved;
}








// ─── Health ───────────────────────────────────────────────────────────────────

/**
 * TOOL: health-check
 *
 * @description
 *   Use this tool to check if the Agent API server is alive and running.
 *   Call this before making any other API calls to confirm the agent is reachable.
 *
 * @method  GET
 * @route   /api/agent/health
 * @input   None — no query params, no body required.
 *
 * @example
 *   Request:
 *     GET /api/agent/health
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "message": "Agent API is working fine"
 *     }
 */
app.get("/api/agent/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Agent API is working fine",
  });
});

// ─── Ready ────────────────────────────────────────────────────────────────────

/**
 * TOOL: ready-check
 *
 * @description
 *   Use this tool to check if the Agent API is ready to accept traffic.
 *   Similar to health-check but specifically signals readiness (used by Kubernetes
 *   readiness probes). Call this before sending file operation requests.
 *
 * @method  GET
 * @route   /api/agent/ready
 * @input   None — no query params, no body required.
 *
 * @example
 *   Request:
 *     GET /api/agent/ready
 *
 *   Response (200):
 *     {
 *       "status": "ready",
 *       "message": "Agent API is ready to accept traffic"
 *     }
 */
app.get("/api/agent/ready", (req, res) => {
  res.status(200).json({
    status: "ready",
    message: "Agent API is ready to accept traffic",
  });
});

// ─── List Files ───────────────────────────────────────────────────────────────

/**
 * TOOL: list-files
 *
 * @description
 *   Use this tool to get a full list of every file inside the workspace.
 *   Returns all file paths as relative paths (e.g. "src/App.jsx", not "/workspace/src/App.jsx").
 *   Automatically skips "node_modules" and ".git" directories.
 *   Always call this first to understand the project structure before reading or editing files.
 *
 * @method  GET
 * @route   /api/agent/list-files
 * @input   None — no query params, no body required.
 *
 * @example
 *   Request:
 *     GET /api/agent/list-files
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "files": [
 *         "index.html",
 *         "src/main.jsx",
 *         "src/App.jsx",
 *         "src/App.css",
 *         "src/assets/hero.png",
 *         "src/components/Header.jsx"
 *       ]
 *     }
 *
 *   Response on error (500):
 *     {
 *       "status": "error",
 *       "message": "Cannot read directory \"/\": permission denied"
 *     }
 */

const io = new Server(httpServer,{
  cors : {
    origin : "*",
    methods: ["GET", "POST" , "PATCH"]
  }
})




const shell = process.env.SHELL || 'bash';
const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: "/workspace",
  env: process.env
});

ptyProcess.onData((data) => {
  io.emit("terminal-output" , data);
});

ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`Terminal process exited with code ${exitCode}, signal ${signal}`);
});

io.on("connection",(socket) => {
  console.log(`A user has connected ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`User disconnected : ${socket.id}`);
  });

  socket.on("terminal-input" , (data) => {
    ptyProcess.write(data);
  })

  socket.on("connect_error",(err) => {
    console.log(`Connection error : ${err.message}`);
  })
})


app.get("/api/agent/list-files", async (req, res) => {
  const listFiles = async (dir, basePath = "") => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `Cannot read directory "${basePath || "/"}": ${err.message}`,
      );
    }

    const result = [];
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        const nested = await listFiles(fullPath, relativePath);
        result.push(...nested);
      } else if (entry.isFile()) {
        result.push(relativePath);
      }
    }
    return result;
  };

  try {
    const files = await listFiles(WORKING_DIR);
    res.status(200).json({ status: "ok", files });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ─── Read File ────────────────────────────────────────────────────────────────

/**
 * TOOL: read-file
 *
 * @description
 *   Use this tool to read the content of one or more files in the workspace.
 *   Pass a comma-separated list of relative file paths as the "files" query parameter.
 *   All paths must be relative to the workspace root (e.g. "src/App.jsx", NOT "/workspace/src/App.jsx").
 *   You can read multiple files in a single call — prefer batching over multiple requests.
 *   Each file in the response includes its relative path and full text content.
 *   If a file fails (not found, is a directory, access denied), that entry returns an "error"
 *   field instead of "content" — other files in the batch still succeed.
 *
 * @method  GET
 * @route   /api/agent/read-file
 *
 * @queryparam {string} files
 *   Required. Comma-separated list of relative file paths to read.
 *   Example: files=src/App.jsx,src/index.css,index.html
 *
 * @example — read a single file
 *   Request:
 *     GET /api/agent/read-file?files=src/App.jsx
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "files": [
 *         {
 *           "file": "src/App.jsx",
 *           "content": "import React from 'react';\n\nfunction App() {\n  return <div>Hello</div>;\n}\n\nexport default App;"
 *         }
 *       ]
 *     }
 *
 * @example — read multiple files in one call
 *   Request:
 *     GET /api/agent/read-file?files=src/App.jsx,src/App.css,index.html
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "files": [
 *         { "file": "src/App.jsx",  "content": "..." },
 *         { "file": "src/App.css",  "content": "..." },
 *         { "file": "index.html",   "content": "..." }
 *       ]
 *     }
 *
 * @example — partial failure (one file missing, others succeed)
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "files": [
 *         { "file": "src/App.jsx",       "content": "..." },
 *         { "file": "src/missing.jsx",   "error": "Error reading file: ENOENT: no such file or directory" }
 *       ]
 *     }
 */
app.get("/api/agent/read-file", async (req, res) => {
  const { files } = req.query;

  if (!files || typeof files !== "string") {
    return res.status(400).json({
      status: "error",
      message:
        "Query parameter 'files' is required (comma-separated list of relative paths)",
    });
  }

  const fileList = files
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (fileList.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "No valid file paths provided",
    });
  }

  const results = await Promise.all(
    fileList.map(async (file) => {
      try {
        const filePath = safeResolve(file);
        const stat = await fs.promises.stat(filePath);

        if (stat.isDirectory()) {
          return { file, error: "Path is a directory, not a file" };
        }

        const content = await fs.promises.readFile(filePath, "utf-8");
        return { file, content };
      } catch (err) {
        return {
          file,
          error: err.message.startsWith("Access denied")
            ? err.message
            : `Error reading file: ${err.message}`,
        };
      }
    }),
  );

  res.status(200).json({ status: "ok", files: results });
});

// ─── Update File ──────────────────────────────────────────────────────────────

/**
 * TOOL: update-file
 *
 * @description
 *   Use this tool to overwrite the content of one or more existing files in the workspace.
 *   If a file's parent directory doesn't exist, it will be created automatically.
 *   Send a JSON body with an "updates" array — each item must have a "file" (relative path)
 *   and "content" (full new file content as a string) property.
 *   You can update multiple files in one call — always prefer batching.
 *   NOTE: This fully replaces the file content. If you only want to change part of a file,
 *   read it first with read-file, modify the content, then send the full updated content here.
 *
 * @method  PATCH
 * @route   /api/agent/update-file
 *
 * @body {Object} JSON body
 * @body {Array}  updates — Required. Array of { file: string, content: string } objects.
 *   - file    {string} Relative path of the file to update (e.g. "src/App.jsx")
 *   - content {string} Full new content to write to the file. Empty string "" is valid.
 *
 * @example — update a single file
 *   Request:
 *     PATCH /api/agent/update-file
 *     Content-Type: application/json
 *
 *     {
 *       "updates": [
 *         {
 *           "file": "src/App.jsx",
 *           "content": "import React from 'react';\n\nfunction App() {\n  return <h1>Updated!</h1>;\n}\n\nexport default App;"
 *         }
 *       ]
 *     }
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/App.jsx", "status": "File updated successfully" }
 *       ]
 *     }
 *
 * @example — update multiple files in one call
 *   Request:
 *     PATCH /api/agent/update-file
 *     Content-Type: application/json
 *
 *     {
 *       "updates": [
 *         { "file": "src/App.jsx",  "content": "..." },
 *         { "file": "src/App.css",  "content": "body { margin: 0; }" },
 *         { "file": "index.html",   "content": "<!DOCTYPE html>..." }
 *       ]
 *     }
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/App.jsx",  "status": "File updated successfully" },
 *         { "file": "src/App.css",  "status": "File updated successfully" },
 *         { "file": "index.html",   "status": "File updated successfully" }
 *       ]
 *     }
 *
 * @example — partial failure
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/App.jsx",       "status": "File updated successfully" },
 *         { "file": "../../etc/passwd",  "error": "Access denied: \"../../etc/passwd\" resolves outside the workspace" }
 *       ]
 *     }
 */
app.patch("/api/agent/update-file", async (req, res) => {
  const { updates } = req.body;

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      status: "error",
      message:
        "'updates' must be a non-empty array of { file, content } objects",
    });
  }

  const results = await Promise.all(
    updates.map(async (update) => {
      const { file, content } = update;

      if (!file) {
        return { file: "unknown", error: "'file' property is required" };
      }

      // content == null covers null/undefined but allows valid empty string ""
      if (content == null) {
        return { file, error: "'content' property is required" };
      }

      try {
        const filePath = safeResolve(file);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, "utf-8");
        return { file, status: "File updated successfully" };
      } catch (err) {
        return {
          file,
          error: err.message.startsWith("Access denied")
            ? err.message
            : `Error updating file: ${err.message}`,
        };
      }
    }),
  );

  res.status(200).json({ status: "ok", results });
});

// ─── Create File ──────────────────────────────────────────────────────────────

/**
 * TOOL: create-file
 *
 * @description
 *   Use this tool to create one or more new files in the workspace.
 *   All intermediate parent directories are created automatically at any nesting depth —
 *   you do NOT need to create directories manually before creating a file inside them.
 *   For example, creating "src/components/ui/Button.jsx" will automatically create
 *   "src/", "src/components/", and "src/components/ui/" if they don't exist.
 *   If the file already exists, its content will be overwritten.
 *   Send a JSON body with a "files" array — each item must have a "file" (relative path)
 *   and "content" (file content as a string) property.
 *   Always prefer batching multiple file creations into a single call.
 *
 * @method  POST
 * @route   /api/agent/create-file
 *
 * @body {Object} JSON body
 * @body {Array}  files — Required. Array of { file: string, content: string } objects.
 *   - file    {string} Relative path of the file to create (e.g. "src/components/Header.jsx").
 *             Supports any nesting level. Do NOT include a leading slash.
 *   - content {string} Full content to write to the file. Empty string "" is valid.
 *
 * @example — create a single file at root level
 *   Request:
 *     POST /api/agent/create-file
 *     Content-Type: application/json
 *
 *     {
 *       "files": [
 *         {
 *           "file": "README.md",
 *           "content": "# My Project\n\nThis is the readme."
 *         }
 *       ]
 *     }
 *
 *   Response (201):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "README.md", "status": "File created successfully" }
 *       ]
 *     }
 *
 * @example — create a deeply nested file (folders auto-created)
 *   Request:
 *     POST /api/agent/create-file
 *     Content-Type: application/json
 *
 *     {
 *       "files": [
 *         {
 *           "file": "src/components/ui/Button.jsx",
 *           "content": "export default function Button({ label }) {\n  return <button>{label}</button>;\n}"
 *         }
 *       ]
 *     }
 *
 *   Response (201):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/components/ui/Button.jsx", "status": "File created successfully" }
 *       ]
 *     }
 *
 * @example — create multiple files across different directories in one call
 *   Request:
 *     POST /api/agent/create-file
 *     Content-Type: application/json
 *
 *     {
 *       "files": [
 *         { "file": "src/pages/Home.jsx",            "content": "..." },
 *         { "file": "src/pages/About.jsx",           "content": "..." },
 *         { "file": "src/hooks/useWindowSize.js",    "content": "..." },
 *         { "file": "src/styles/variables.css",      "content": ":root { --primary: #6366f1; }" }
 *       ]
 *     }
 *
 *   Response (201):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/pages/Home.jsx",          "status": "File created successfully" },
 *         { "file": "src/pages/About.jsx",         "status": "File created successfully" },
 *         { "file": "src/hooks/useWindowSize.js",  "status": "File created successfully" },
 *         { "file": "src/styles/variables.css",    "status": "File created successfully" }
 *       ]
 *     }
 *
 * @example — partial failure (one path is invalid)
 *   Response (201):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/App.jsx",       "status": "File created successfully" },
 *         { "file": "../../hack.js",     "error": "Access denied: \"../../hack.js\" resolves outside the workspace" }
 *       ]
 *     }
 */
app.post("/api/agent/create-file", async (req, res) => {
  const { files } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "'files' must be a non-empty array of { file, content } objects",
    });
  }

  const results = await Promise.all(
    files.map(async (item) => {
      const { file, content } = item;

      if (!file) {
        return { file: "unknown", error: "'file' property is required" };
      }

      // content == null covers null/undefined but allows valid empty string ""
      if (content == null) {
        return { file, error: "'content' property is required" };
      }

      try {
        const filePath = safeResolve(file);

        // Recursively create all parent directories at any nesting depth
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, "utf-8");

        return { file, status: "File created successfully" };
      } catch (err) {
        return {
          file,
          error: err.message.startsWith("Access denied")
            ? err.message
            : `Error creating file: ${err.message}`,
        };
      }
    }),
  );

  res.status(201).json({ status: "ok", results });
});

// ─── Patch File ───────────────────────────────────────────────────────────────

/**
 * TOOL: patch-file
 *
 * @description
 *   Make a small, targeted edit to an existing file by replacing one exact
 *   string occurrence with a new string. Unlike update-file, this never
 *   touches any content outside the matched region.
 *
 *   Rules:
 *   - oldStr must match exactly once. Zero matches → error. Multiple matches → error.
 *   - The file must already exist.
 *   - Paths must be relative to /workspace.
 *
 * @method  POST
 * @route   /api/agent/patch-file
 *
 * @body {Object} JSON body
 *   - filePath {string} Required. Relative path (e.g. "src/App.jsx").
 *   - oldStr   {string} Required. Exact string to find and replace (must appear exactly once).
 *   - newStr   {string} Required. Replacement string.
 *
 * @example
 *   Request:
 *     POST /api/agent/patch-file
 *     Content-Type: application/json
 *
 *     {
 *       "filePath": "src/App.jsx",
 *       "oldStr": "  return <div>Hello</div>;\n}",
 *       "newStr": "  return <div>Hello World</div>;\n}"
 *     }
 *
 *   Response (200 — success):
 *     { "success": true, "patched": "src/App.jsx" }
 *
 *   Response (200 — not found):
 *     { "success": false, "error": "oldStr not found", "hint": "..." }
 *
 *   Response (200 — ambiguous):
 *     { "success": false, "error": "oldStr matches 3 times", "hint": "..." }
 */
app.post("/api/agent/patch-file", async (req, res) => {
  const { filePath, oldStr, newStr } = req.body;

  if (!filePath || typeof filePath !== "string") {
    return res.status(400).json({
      success: false,
      error: "'filePath' is required and must be a string",
    });
  }
  if (typeof oldStr !== "string" || oldStr.length === 0) {
    return res.status(400).json({
      success: false,
      error: "'oldStr' is required and must be a non-empty string",
    });
  }
  if (typeof newStr !== "string") {
    return res.status(400).json({
      success: false,
      error: "'newStr' is required and must be a string",
    });
  }

  try {
    const resolvedPath = safeResolve(filePath);

    let content;
    try {
      content = await fs.promises.readFile(resolvedPath, "utf-8");
    } catch (readErr) {
      return res.status(200).json({
        success: false,
        error: `File not found or unreadable: ${readErr.message}`,
        hint: "Verify the filePath is correct and relative to /workspace.",
      });
    }

    // Count occurrences so we can give a precise error on ambiguous matches
    let count = 0;
    let searchIdx = 0;
    while (true) {
      const idx = content.indexOf(oldStr, searchIdx);
      if (idx === -1) break;
      count++;
      searchIdx = idx + 1;
      if (count > 1) break; // no need to keep counting past 2
    }

    if (count === 0) {
      return res.status(200).json({
        success: false,
        error: "oldStr not found in file",
        hint: "The string you supplied does not appear verbatim in the file. Include 2–3 lines of surrounding context to make the match unique, or use read-file to fetch the current content first.",
      });
    }

    if (count > 1) {
      return res.status(200).json({
        success: false,
        error: `oldStr is ambiguous — it matches more than once in "${filePath}"`,
        hint: "Add more surrounding context to oldStr so it matches exactly one location in the file.",
      });
    }

    // Exactly one match — perform the replacement
    const patched = content.replace(oldStr, newStr);
    await fs.promises.writeFile(resolvedPath, patched, "utf-8");

    return res.status(200).json({ success: true, patched: filePath });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message.startsWith("Access denied")
        ? err.message
        : `Patch error: ${err.message}`,
    });
  }
});

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
 * @method  POST
 * @route   /api/agent/exec
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

app.post("/api/agent/exec", (req, res) => {
  const { command, subDir } = req.body;

  // ─── VALIDATION: Command Parameter ────────────────────────────────────────
  // 1. Validate that command is provided and is a non-empty string
  if (!command || typeof command !== "string" || command.trim().length === 0) {
    return res.status(400).json({
      status: "error",
      message: "'command' parameter is required and must be a non-empty string",
    });
  }

  const BASE_WORKSPACE = "/workspace";
  const MAX_OUTPUT_SIZE = 1048576; // 1MB limit per stream
  const COMMAND_TIMEOUT = 30000; // 30 seconds
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

  exec(command, execOptions, (error, stdout, stderr) => {
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
});

// ─── Kubernetes Log Helper ─────────────────────────────────────────────────

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();
const kubeApi = kubeConfig.makeApiClient(CoreV1Api);

app.get("/api/agent/vite-runtime-errors", async (req, res) => {
  let podName = process.env.HOSTNAME;
  let namespace = "default";

  try {
    namespace = fs
      .readFileSync(
        "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
        "utf8",
      )
      .trim();
  } catch (err) {
    namespace = "default";
  }

  try {
    if (!podName) {
      const podList = await kubeApi.listNamespacedPod({ namespace });
      const items = podList?.items ?? [];

      const candidate =
        items.find(
          (p) =>
            p?.status?.phase === "Running" &&
            p?.metadata?.name?.includes("sandbox"),
        ) || items.find((p) => p?.status?.phase === "Running");

      if (candidate?.metadata?.name) {
        podName = candidate.metadata.name;
        console.log(`Discovered podName=${podName} in namespace=${namespace}`);
      } else {
        throw new Error(
          "Unable to determine pod name: HOSTNAME missing and no running pod found",
        );
      }
    }

    if (!podName) {
      throw new Error("podName is null before calling readNamespacedPodLog");
    }

    const response = await kubeApi.readNamespacedPodLog({
      name: podName,
      namespace,
      container: "sandbox-container",
      follow: false,
      tailLines: 50,
      timestamps: false,
    });

    res.status(200).json({
      success: true,
      podName,
      namespace,
      logs: response.body ?? response,
    });
  } catch (err) {
    console.error("Error in /api/agent/vite-runtime-errors:", {
      message: err?.message ?? String(err),
      podName,
      namespace,
    });

    res.status(500).json({
      success: false,
      error: err?.message ?? "Failed to read Kubernetes pod logs",
      podName: podName ?? null,
      namespace,
    });
  }
});

export default httpServer;
