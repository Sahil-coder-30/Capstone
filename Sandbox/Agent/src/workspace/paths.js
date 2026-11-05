// paths.js
// Every path a tool or route receives is resolved here, and must stay inside
// the workspace even after following symlinks (`ln -s /etc x` then reading
// `x/passwd` is rejected).

import fs from "fs";
import path from "path";

export const WORKING_DIR = process.env.WORKSPACE_DIR || "/workspace";

const realWorkspace = () => {
  try {
    return fs.realpathSync(WORKING_DIR);
  } catch {
    return WORKING_DIR;
  }
};

const isInside = (root, p) => p === root || p.startsWith(root + path.sep);

/** Real path of `p`, or of its nearest existing parent joined with the rest (for new files). */
const realpathOfNearest = (p) => {
  let current = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), path.relative(current, p));
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
      const parent = path.dirname(current);
      if (parent === current) return p;
      current = parent;
    }
  }
};

/** "/workspace/src/App.jsx" -> "src/App.jsx" */
export function stripWorkspace(fullPath) {
  return fullPath.startsWith(WORKING_DIR)
    ? fullPath.slice(WORKING_DIR.length).replace(/^\/+/, "")
    : fullPath;
}

/** True when `fullPath`, after following symlinks, is inside the workspace. */
export function isInsideWorkspace(fullPath) {
  return isInside(realWorkspace(), realpathOfNearest(fullPath));
}

/**
 * Resolves a workspace-relative path and throws "Access denied" when it
 * escapes the workspace, by `..` or through a symlink.
 *
 * @param {string} file
 * @param {{ followLink?: boolean }} [opts] followLink: false checks only the
 *   parent folder, so a symlink itself can be deleted without touching its target.
 */
export function safeResolve(file, { followLink = true } = {}) {
  const normalized = String(file).replace(/^\/+/, "");
  const resolved = path.resolve(WORKING_DIR, normalized);
  if (!resolved.startsWith(WORKING_DIR + path.sep)) {
    throw new Error(`Access denied: "${file}" resolves outside the workspace`);
  }
  if (!isInsideWorkspace(followLink ? resolved : path.dirname(resolved))) {
    throw new Error(`Access denied: "${file}" points outside the workspace through a symlink`);
  }
  return resolved;
}
