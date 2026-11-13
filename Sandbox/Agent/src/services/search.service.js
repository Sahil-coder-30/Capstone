// search.service.js
// Input checks and the workspace walk behind the search-code tool.

import fs from "fs";
import path from "path";
import { isInsideWorkspace } from "../workspace/paths.js";

const SEARCHABLE_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html",
  ".json", ".md", ".yml", ".yaml", ".env", ".mjs", ".cjs"
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vite"]);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — skip huge lockfiles/bundles, not code files
const MAX_PATTERN_LENGTH = 500;
export const SEARCH_TIME_BUDGET_MS = 8000;
const MAX_WALK_DEPTH = 20; // guards against symlink loops inflating recursion

// Heuristic ReDoS guard: reject patterns with nested quantifiers that are the
// classic catastrophic-backtracking shape, e.g. (a+)+ or (a*)*. Not exhaustive,
// but catches the patterns an LLM is statistically most likely to generate.
const REDOS_RISK_PATTERN = /(\([^()]*[+*]\)[+*])|(\([^()]*\{\d*,\}\)[+*])/;

export function validateSearchInputs(query) {
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

export async function walkTextFiles(dir, basePath = "", out = [], skipped = { count: 0 }, depth = 0, visitedReal = new Set()) {
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
        if (!isInsideWorkspace(real)) continue; // never search outside the workspace
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
