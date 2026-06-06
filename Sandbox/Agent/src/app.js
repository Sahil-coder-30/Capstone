import express from "express";
import morgan from "morgan";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

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
app.get("/api/agent/list-files", async (req, res) => {
  const listFiles = async (dir, basePath = "") => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(`Cannot read directory "${basePath || "/"}": ${err.message}`);
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
      message: "Query parameter 'files' is required (comma-separated list of relative paths)",
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
    })
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
      message: "'updates' must be a non-empty array of { file, content } objects",
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
    })
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
    })
  );

  res.status(201).json({ status: "ok", results });
});

export default app;