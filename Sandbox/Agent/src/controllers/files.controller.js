// files.controller.js
// Workspace file tools: list, read, update, create, delete, patch.
// Not Express routes: reachable only through the MCP endpoint (see controllers/index.js).

import fs from "fs";
import path from "path";
import { WORKING_DIR, safeResolve } from "../workspace/paths.js";

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
export const listFiles = async (req, res) => {
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
};

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
export const readFile = async (req, res) => {
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
};

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
export const updateFile = async (req, res) => {
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
};

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
export const createFile = async (req, res) => {
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
};

// ─── Delete File ──────────────────────────────────────────────────────────────

/**
 * TOOL: delete-file
 *
 * @description
 *   Delete one or more files/directories in the workspace.
 *   Paths must be relative to the workspace root (e.g. "src/App.jsx", NOT "/workspace/src/App.jsx").
 *
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
export const deleteFile = async (req, res) => {
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
        // lstat + followLink:false: deleting a symlink removes the link, never its target.
        const filePath = safeResolve(filename, { followLink: false });
        const stat = await fs.promises.lstat(filePath);
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
};

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
export const patchFile = async (req, res) => {
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
};
