// agent.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  listFiles,
  readFile,
  createFile,
  updateFile,
  patchFile,
  deleteFile,
  executeCommand,
  getViteRuntimeErrors,
} from "./tool.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Concise guidelines to keep system prompt size minimal and optimize token costs
const codegenSkill = `
- **Read First**: Always read the existing codebase files (like App.jsx, package.json, index.html) using read_file to understand the setup before writing code.
- **Incremental Steps**: Implement features incrementally. Do not rewrite large chunks of code unless requested.
- **Syntax & Execution**: Run commands like npm run build or tests using execute_command to verify syntax and compilation before ending the task.
- **No Dev Server Run**: The Vite dev server is already running on port 5173 — never execute "npm run dev" or "vite".
`;

const frontendDesign = `
- **Premium Aesthetics**: Use modern typography (Google Fonts like Outfit, Inter, Roboto), vibrant custom color palettes (no default red/blue/green), smooth gradients, and glassmorphism.
- **Animations & Responsiveness**: Build interfaces that feel alive with responsive flexbox/grid layouts and subtle hover micro-animations.
- **No Placeholders**: Never write placeholder text or generic boxes. Use complete content.
`;

const toolInfoSkill = `
- **Read Before Write**: Always invoke read_file on a path before invoking update_file or patch_file on it to avoid conflicts.
- **Surgical Edits**: Prefer target edits rather than overwriting entire files to fix small issues.
- **Never Exec for File Read**: Do not use execute_command to run commands like "cat", "grep", or "ls" to inspect files/directories; use read_file and list_files instead.
`;

const model = new ChatMistralAI({
  model: "mistral-large-latest",
  apiKey: process.env.MISTRALAI_API_KEY,
  maxRetries: 10,
  timeout: 180_000, // 3 minutes
});

export const appModel = new ChatMistralAI({
  model: "mistral-medium-latest",
  apiKey: process.env.MISTRALAI_API_KEY,
  maxRetries: 5,
  timeout: 180_000, // 3 minutes
});

function applyGuards(tools) {
  const TOOL_RULES = {
    list_files: {
      description:
        "List project files. Call ONCE at the start. Never call again.",
      block: null,
    },
    read_file: {
      description:
        "Read ANY file content — package.json, source files, todo.md, everything. Never use executeCommand to read files.",
      block: null,
    },
    create_file: {
      description:
        "Create a new file with content. Use for ALL new file creation. Never use executeCommand to create or write files.",
      block: null,
    },
    update_file: {
      description:
        "Edit an existing file. Use for source edits AND todo.md tick updates. Never use executeCommand to modify files.",
      block: null,
    },
    patch_file: {
      description:
        "Make a targeted, surgical line-level replacement in a file. Prefer this over update_file for small changes under 20 lines. Never use executeCommand to modify files.",
      block: null,
    },
    execute_command: {
      description:
        "Shell only. Valid: 'npm install [pkg]', 'rm todo.md', 'mkdir [dir]', 'git [cmd]'. Never use executeCommand to read or create files. Use readFile/createFile/updateFile for file work.",
      block: {
        patterns: [
          /^\s*cat /,
          /^\s*head /,
          /^\s*tail /,
          /^\s*echo .+>/,
          /^\s*touch /,
          /^\s*cp /,
          /^\s*mv /,
          /^\s*sed /,
          /^\s*awk /,
          /^\s*grep /,
        ],
        message:
          "WRONG TOOL. Use readFile to read, createFile/updateFile to write. executeCommand is for npm/rm/mkdir/git only.",
      },
    },
    get_vite_runtime_errors: {
      description:
        "Fetch live Vite runtime errors. Call only after all files are written or when a bug is suspected. Not for file inspection.",
      block: null,
    },
    delete_file: {
      description:
        "Delete one or more files or directories in the workspace. Use ONLY if the user explicitly asks to delete files/directories.",
      block: null,
    },
  };

  return tools.map((tool) => {
    const rule = TOOL_RULES[tool.name];
    if (!rule) return tool;

    if (rule.description) tool.description = rule.description;

    if (rule.block) {
      const original = tool.invoke.bind(tool);
      tool.invoke = async (input, config) => {
        const cmd =
          input?.command ?? input?.cmd ?? Object.values(input ?? {})[0] ?? "";
        const blocked = rule.block.patterns.some((p) => p.test(cmd));
        if (blocked) return { error: rule.block.message };
        return original(input, config);
      };
    }

    return tool;
  });
}
const SYSTEM_PROMPT = `
You are Orion, an elite React+Vite frontend engineer embedded inside Taksha — an AI code generation platform. Build exactly what the user asks — nothing more, nothing less.

The Vite dev server is already running on port 5173 — never run "npm run dev" yourself.

=== EXECUTION RULES (MANDATORY) ===
- **Silent execution**: DO NOT narrate your plan, announce what you are about to do, or describe steps in prose before doing them. Jump straight to tool calls.
- **No pre-work commentary**: Never write text like "Here's my plan:", "Step 1:", "I'll start by...", "Let me...", or "Here's what I'll build" before invoking tools.
- **Compact final report only**: After ALL tool calls are complete, write ONE brief summary (3-8 bullet points max) covering only: files created/changed, commands run, and anything notable. No code blocks in the report unless directly asked.
- **No redundant explanations**: Do not explain CSS properties, React patterns, or design decisions unless the user asked. Just implement.

=== WORKFLOW RULES ===
${codegenSkill}

=== DESIGN GUIDELINES ===
${frontendDesign}

=== TOOL USAGE GUIDELINES ===
${toolInfoSkill}
`;

const agent = createReactAgent({
  llm: model,
  tools: applyGuards([
    listFiles,
    readFile,
    createFile,
    updateFile,
    patchFile,
    deleteFile,
    executeCommand,
    getViteRuntimeErrors,
  ]),
  stateModifier: SYSTEM_PROMPT,
});

export const appAgent = createReactAgent({
  llm: appModel,
  tools: applyGuards([
    readFile,
    updateFile,
    patchFile
  ]),
  stateModifier: `You are Clio, an elite developer co-pilot. Your job is to help users understand their codebase, clear doubts about specific files, and fix small bugs in any file in the workspace.

=== CO-PILOT INSTRUCTIONS ===
- Speak like a direct, senior engineer helping a teammate: clear, concise, no filler.
- Use tools (read_file, update_file, patch_file) to inspect, edit, or patch files.
- Keep edits surgical. Prefer patch_file for changes under 20 lines.
- Always check files first before updating them.
- If a file doesn't exist, say so. Don't invent content.
- Do not explain your reasoning or CSS/React details unless asked.
- Provide a brief summary after updating or patching a file.`
})

export default agent;
