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
import chokidar from 'chokidar';


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

app.post("/api/agent/report-error", (req, res) => {
  const { type, message, source, line, col, stack } = req.body;
  console.error(`[Browser Error] Type: ${type}`);
  console.error(`Message: ${message}`);
  if (source) console.error(`Source: ${source}:${line}:${col}`);
  if (stack) console.error(`Stack: ${stack}`);

  // Broadcast the formatted error to the connected terminal UI(s)
  if (typeof io !== 'undefined' && io) {
    let titleColor = '\x1b[1;31m'; // Bold red for general runtime errors
    if (type === 'promise') titleColor = '\x1b[1;33m'; // Bold yellow for unhandled rejections
    if (type === 'console') titleColor = '\x1b[1;35m'; // Bold magenta for console.error

    let formattedOutput = `\r\n${titleColor}✖ [Browser Error - ${type.toUpperCase()}]\x1b[0m ${message}\r\n`;
    if (source) {
      formattedOutput += `  \x1b[90mSource:\x1b[0m ${source}:${line}:${col}\r\n`;
    }
    if (stack) {
      // Split stack trace into individual lines and format them
      const cleanStack = stack
        .split('\n')
        .map(line => `    \x1b[90m${line.trim()}\x1b[0m`)
        .join('\r\n');
      formattedOutput += `  \x1b[90mStack Trace:\x1b[0m\r\n${cleanStack}\r\n`;
    }
    formattedOutput += '\r\n';

    io.emit("terminal-output", formattedOutput);
  }

  res.status(200).json({ status: "ok" });
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

// Initialize chokidar watcher on WORKING_DIR
const watcher = chokidar.watch(WORKING_DIR, {
  ignored: [
    (filePath) => filePath.includes('node_modules') || filePath.includes('.git') || /(^|[\/\\])\../.test(filePath)
  ],
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 100
  }
});

// Broadcast workspace changes to all connected clients
watcher.on('all', (event, filePath) => {
  const relativePath = stripWorkspace(filePath);
  console.log(`[Chokidar] File event: ${event} on ${relativePath}`);
  
  io.emit('workspace-change', {
    event,
    path: relativePath
  });
});





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

  socket.on("terminal-resize", ({ cols, rows }) => {
    if (cols && rows) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (err) {
        console.error("Failed to resize ptyProcess:", err);
      }
    }
  });

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

// ─── Delete File ──────────────────────────────────────────────────────────────

/**
 * TOOL: delete-file
 *
 * @description
 *   Delete one or more files/directories in the workspace.
 *   Paths must be relative to the workspace root (e.g. "src/App.jsx", NOT "/workspace/src/App.jsx").
 *
 * @method  DELETE
 * @route   /api/agent/delete-file
 *
 * @queryparam {string} file
 *   Optional. Single relative path of the file/directory to delete.
 *   Example: file=src/App.jsx
 *
 * @body {Object} JSON body
 * @body {Array}  files — Optional. Array of strings representing the relative paths of the files to delete.
 *
 * @example — delete a single file via query param
 *   Request:
 *     DELETE /api/agent/delete-file?file=src/App.jsx
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "results": [
 *         { "file": "src/App.jsx", "status": "File deleted successfully" }
 *       ]
 *     }
 */
app.delete("/api/agent/delete-file", async (req, res) => {
  let fileList = [];
  const { file } = req.query;
  const { files } = req.body;

  if (file && typeof file === "string") {
    fileList.push(file.trim());
  } else if (files && Array.isArray(files)) {
    fileList = files.map((f) => typeof f === "string" ? f.trim() : "").filter(Boolean);
  }

  if (fileList.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Parameter 'file' or request body 'files' (array of strings) is required",
    });
  }

  const results = await Promise.all(
    fileList.map(async (filename) => {
      try {
        const filePath = safeResolve(filename);
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
          await fs.promises.rm(filePath, { recursive: true, force: true });
          return { file: filename, status: "Directory deleted successfully" };
        } else {
          await fs.promises.unlink(filePath);
          return { file: filename, status: "File deleted successfully" };
        }
      } catch (err) {
        if (err.code === "ENOENT") {
          return { file: filename, error: "File or directory does not exist" };
        }
        return {
          file: filename,
          error: err.message.startsWith("Access denied")
            ? err.message
            : `Error deleting file: ${err.message}`,
        };
      }
    })
  );

  res.status(200).json({ status: "ok", results });
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

// ─── Search Code ──────────────────────────────────────────────────────────────

/**
 * TOOL: search-code
 *
 * @description
 *   Use this tool to search for a text pattern or regex across the entire codebase
 *   WITHOUT reading full files. Returns matching file paths, line numbers, the matched
 *   line, and surrounding context lines — everything needed to locate an issue and then
 *   patch it directly with patch-file, without ever calling read-file first.
 *
 *   Always prefer this over read-file when you're looking for something specific
 *   (a function name, an import, a string, a bug pattern) rather than trying to
 *   understand a whole file's structure.
 *
 *   The "context" lines returned preserve exact original whitespace/indentation,
 *   so you can copy them directly into patch-file's oldStr for a guaranteed match —
 *   no need to re-read the file to get exact formatting.
 *
 *   Skips node_modules, .git, dist, build automatically. Skips binary/asset files
 *   and any file over 2MB. Results are capped at maxResults — if truncated is true,
 *   narrow your pattern or add a fileGlob filter and search again.
 *   Overall search is capped at 8 seconds — if timedOut is true, results are partial;
 *   narrow fileGlob and retry rather than re-running the same broad search.
 *
 * @method  GET
 * @route   /api/agent/search-code
 *
 * @queryparam {string}  pattern        Required. Text or regex pattern to search for. Max 500 chars.
 * @queryparam {boolean} isRegex        Optional. Treat pattern as a regex. Default: false (literal text search).
 * @queryparam {boolean} caseSensitive  Optional. Default: false.
 * @queryparam {string}  fileGlob       Optional. Only search files whose relative path includes this substring.
 * @queryparam {number}  contextLines   Optional. Lines of context above/below each match. Default: 2. Max: 5.
 * @queryparam {number}  maxResults     Optional. Cap on total matches returned. Default: 20. Max: 50.
 *
 * @response-error-400
 *   Invalid input — bad pattern (missing/array/too long/unsafe regex), bad numeric params.
 *   {
 *     "status": "error",
 *     "message": "Human-readable reason",
 *     "hint": "What the agent should do differently next call"
 *   }
 *
 * @response-error-500
 *   Filesystem-level failure unrelated to input validity (rare — e.g. workspace unreadable).
 *
 * @example — simple text search
 *   Request:
 *     GET /api/agent/search-code?pattern=useProjects
 *
 *   Response (200):
 *     {
 *       "status": "ok",
 *       "totalMatches": 3,
 *       "truncated": false,
 *       "timedOut": false,
 *       "filesSkipped": 0,
 *       "matches": [ ... ]
 *     }
 *
 * @example — invalid input (agent sent pattern twice, becomes an array)
 *   Response (400):
 *     {
 *       "status": "error",
 *       "message": "'pattern' must be a single string, received an array",
 *       "hint": "Send exactly one pattern value, not repeated query params."
 *     }
 */

const SEARCHABLE_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html",
  ".json", ".md", ".yml", ".yaml", ".env", ".mjs", ".cjs"
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vite"]);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — skip huge lockfiles/bundles, not code files
const MAX_PATTERN_LENGTH = 500;
const SEARCH_TIME_BUDGET_MS = 8000;
const MAX_WALK_DEPTH = 20; // guards against symlink loops inflating recursion

// Heuristic ReDoS guard: reject patterns with nested quantifiers that are the
// classic catastrophic-backtracking shape, e.g. (a+)+ or (a*)*. Not exhaustive,
// but catches the patterns an LLM is statistically most likely to generate.
const REDOS_RISK_PATTERN = /(\([^()]*[+*]\)[+*])|(\([^()]*\{\d*,\}\)[+*])/;

function validateSearchInputs(query) {
  const { pattern, isRegex, caseSensitive, fileGlob, contextLines, maxResults, filesOnly } = query;

  // Agent sent the same query param twice → Express parses it as an array.
  if (Array.isArray(pattern)) {
    return { error: "'pattern' must be a single string, received an array", hint: "Send exactly one pattern value, not repeated query params." };
  }
  if (!pattern || typeof pattern !== "string" || pattern.trim().length === 0) {
    return { error: "'pattern' is required and must be a non-empty string", hint: "Provide a text or regex pattern to search for." };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { error: `'pattern' exceeds max length of ${MAX_PATTERN_LENGTH} characters`, hint: "Use a shorter, more specific pattern." };
  }
  if (fileGlob !== undefined) {
    if (Array.isArray(fileGlob)) {
      return { error: "'fileGlob' must be a single string, received an array", hint: "Send exactly one fileGlob value." };
    }
    if (typeof fileGlob !== "string") {
      return { error: "'fileGlob' must be a string", hint: "Provide a single string value for fileGlob." };
    }
  }
  if (filesOnly !== undefined) {
    if (Array.isArray(filesOnly)) {
      return { error: "'filesOnly' must be a single value, received an array", hint: "Send exactly one filesOnly value." };
    }
  }

  const useRegex = isRegex === "true" || isRegex === true;
  if (useRegex) {
    if (REDOS_RISK_PATTERN.test(pattern)) {
      return {
        error: "Pattern rejected: nested quantifiers risk catastrophic backtracking (e.g. (a+)+)",
        hint: "Rewrite the regex to avoid nested repetition groups, or use isRegex=false for a literal search.",
      };
    }
    try {
      new RegExp(pattern);
    } catch (err) {
      return { error: `Invalid regex pattern: ${err.message}`, hint: "Fix the regex syntax or set isRegex=false for a literal text search." };
    }
  }

  if (contextLines !== undefined) {
    if (Array.isArray(contextLines)) {
      return { error: "'contextLines' must be a single value, received an array", hint: "Send exactly one contextLines value." };
    }
    if (typeof contextLines !== "string" && typeof contextLines !== "number") {
      return { error: "'contextLines' must be a string or number", hint: "Provide a numeric value for contextLines." };
    }
  }
  if (maxResults !== undefined) {
    if (Array.isArray(maxResults)) {
      return { error: "'maxResults' must be a single value, received an array", hint: "Send exactly one maxResults value." };
    }
    if (typeof maxResults !== "string" && typeof maxResults !== "number") {
      return { error: "'maxResults' must be a string or number", hint: "Provide a numeric value for maxResults." };
    }
  }

  return null; // valid
}

async function walkTextFiles(dir, basePath = "", out = [], skipped = { count: 0 }, depth = 0, visitedReal = new Set()) {
  if (depth > MAX_WALK_DEPTH) return out; // symlink loop / pathological nesting guard

  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // unreadable dir (permissions, race with delete) — skip silently, not fatal
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    try {
      if (entry.isSymbolicLink()) {
        const real = await fs.promises.realpath(fullPath);
        if (visitedReal.has(real)) continue; // loop detected
        visitedReal.add(real);
        const targetStat = await fs.promises.stat(real);
        if (targetStat.isDirectory()) {
          await walkTextFiles(fullPath, relativePath, out, skipped, depth + 1, visitedReal);
        } else if (targetStat.isFile() && SEARCHABLE_EXT.has(path.extname(entry.name))) {
          if (targetStat.size <= MAX_FILE_SIZE) out.push({ fullPath, relativePath });
          else skipped.count++;
        }
        continue;
      }

      if (entry.isDirectory()) {
        await walkTextFiles(fullPath, relativePath, out, skipped, depth + 1, visitedReal);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SEARCHABLE_EXT.has(ext)) continue;
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > MAX_FILE_SIZE) {
          skipped.count++;
          continue;
        }
        out.push({ fullPath, relativePath });
      }
    } catch {
      // File vanished mid-walk, broken symlink, permission denied on stat — skip, not fatal
      skipped.count++;
      continue;
    }
  }
  return out;
}

app.get("/api/agent/search-code", async (req, res) => {
  const validationError = validateSearchInputs(req.query);
  if (validationError) {
    return res.status(400).json({ status: "error", ...validationError });
  }

  const {
    pattern,
    isRegex = "false",
    caseSensitive = "false",
    fileGlob = "",
    contextLines = "2",
    maxResults = "20",
    filesOnly = "false",
  } = req.query;

  const ctxLines = Math.min(Math.max(parseInt(contextLines, 10) || 2, 0), 5);
  const cap = Math.min(Math.max(parseInt(maxResults, 10) || 20, 1), 50);
  const useRegex = isRegex === "true" || isRegex === true;
  const isCaseSensitive = caseSensitive === "true" || caseSensitive === true;
  const wantFilesOnly = filesOnly === "true" || filesOnly === true;

  let matcher;
  try {
    if (useRegex) {
      matcher = new RegExp(pattern, isCaseSensitive ? "" : "i");
    } else {
      const flatPattern = isCaseSensitive ? pattern : pattern.toLowerCase();
      matcher = { test: (line) => (isCaseSensitive ? line : line.toLowerCase()).includes(flatPattern) };
    }
  } catch (err) {
    // Belt-and-suspenders — already checked in validateSearchInputs, but regex
    // construction can still surprise us with engine-specific edge cases.
    return res.status(400).json({
      status: "error",
      message: `Invalid regex pattern: ${err.message}`,
      hint: "Fix the regex syntax or set isRegex=false.",
    });
  }

  const startTime = Date.now();
  const skipped = { count: 0 };

  try {
    const allFiles = await walkTextFiles(WORKING_DIR, "", [], skipped);
    const candidateFiles = fileGlob
      ? allFiles.filter((f) => f.relativePath.includes(fileGlob))
      : allFiles;

    const matches = [];
    let truncated = false;
    let timedOut = false;

    fileLoop:
    for (const { fullPath, relativePath } of candidateFiles) {
      if (Date.now() - startTime > SEARCH_TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      if (matches.length >= cap) {
        truncated = true;
        break;
      }

      let content;
      try {
        content = await fs.promises.readFile(fullPath, "utf-8");
      } catch {
        skipped.count++;
        continue; // unreadable / non-UTF8 file that slipped past the extension filter
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (i % 500 === 0 && Date.now() - startTime > SEARCH_TIME_BUDGET_MS) {
          timedOut = true;
          break fileLoop; // bail mid-file on a pathological single-file match storm
        }
        if (matches.length >= cap) {
          truncated = true;
          break fileLoop;
        }

        let isMatch;
        try {
          isMatch = matcher.test(lines[i]);
        } catch {
          continue; // defensive — a matcher should never throw, but never trust user regex fully
        }

        if (isMatch) {
          const start = Math.max(0, i - ctxLines);
          const end = Math.min(lines.length - 1, i + ctxLines);
          const context = [];
          for (let j = start; j <= end; j++) {
            context.push({ line: j + 1, text: lines[j], ...(j === i ? { isMatch: true } : {}) });
          }
          matches.push({ file: relativePath, line: i + 1, match: lines[i], context });
        }
      }
    }

    if (wantFilesOnly) {
      const uniqueFiles = [...new Set(matches.map((m) => m.file))];
      return res.status(200).json({
        status: "ok",
        totalMatches: matches.length,
        truncated,
        timedOut,
        filesSkipped: skipped.count,
        files: uniqueFiles,
      });
    }

    res.status(200).json({
      status: "ok",
      totalMatches: matches.length,
      truncated,
      timedOut,
      filesSkipped: skipped.count,
      matches,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: `Search failed: ${err.message}`,
      hint: "This is a server-side failure, not a bad query — retry, or narrow fileGlob if the workspace is very large.",
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
