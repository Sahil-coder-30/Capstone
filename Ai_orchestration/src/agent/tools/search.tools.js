// search.tools.js
// Search the project code (sidecar) and the internet (Tavily).

import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { callSandboxTool, logToRun } from "./sandbox.client.js";
import { fromSandbox, toolError, toolOk } from "./toolResult.js";
import { searchInternet } from "../../services/internetSearch.service.js";

export const searchCodeTool = tool(
  async ({ pattern, isRegex, caseSensitive, fileGlob, contextLines, maxResults, filesOnly }, config) => {
    logToRun(config, `search_code: start - "${pattern}"`);
    const args = Object.fromEntries(
      Object.entries({ pattern, isRegex, caseSensitive, fileGlob, contextLines, maxResults, filesOnly })
        .filter(([, value]) => value !== undefined),
    );
    const res = await callSandboxTool(config, "search_code", args);
    logToRun(config, `search_code: ${res.ok ? "success" : `error - ${res.error}`}`);
    return fromSandbox(res, "Code search failed");
  },
  {
    name: "search_code",
    description:
      "Search the project for text or a regex without reading whole files. Returns file paths, line numbers and surrounding lines with exact indentation (safe to copy into patch_file oldStr). Use it to find where a component, function, import or string lives.",
    schema: z.object({
      pattern: z.string().min(1).max(500).describe("Text or regex to search for"),
      isRegex: z.boolean().optional().describe("Treat pattern as a regex. Default false."),
      caseSensitive: z.boolean().optional().describe("Default false."),
      fileGlob: z.string().optional().describe('Only search paths containing this text, e.g. "src/components"'),
      contextLines: z.number().int().min(0).max(5).optional().describe("Lines of context around each match. Default 2."),
      maxResults: z.number().int().min(1).max(50).optional().describe("Default 20."),
      filesOnly: z.boolean().optional().describe("Only return matching file paths. Cheaper."),
    }),
  },
);

export const searchInternetTool = tool(
  async (args, config) => {
    logToRun(config, `search_internet: start - "${args.query}"`);
    try {
      const result = await searchInternet(args);
      logToRun(config, "search_internet: success");
      return toolOk(result);
    } catch (err) {
      logToRun(config, `search_internet: error - ${err.message}`);
      return toolError(`Internet search failed: ${err.message}`);
    }
  },
  {
    name: "search_internet",
    description:
      "Search the web for current library docs, package versions or API changes. Use only when the project files can not answer the question.",
    schema: z.object({
      query: z.string().min(2).describe('Focused query, e.g. "React Router v7 createBrowserRouter"'),
      maxResults: z.number().int().min(1).max(10).optional().describe("Default 5."),
    }),
  },
);
