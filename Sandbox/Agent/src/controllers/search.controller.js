// search.controller.js
// search-code tool. Reachable only through the MCP endpoint.

import fs from "fs";
import { WORKING_DIR } from "../workspace/paths.js";
import { SEARCH_TIME_BUDGET_MS, validateSearchInputs, walkTextFiles } from "../services/search.service.js";

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

export const searchCode = async (req, res) => {
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
};
