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

const appReadFile = tool(
  async ({ file }, config) => {
    const activeFile = config?.configurable?.activeFile;
    const normalizePath = (p) => p ? p.replace(/^\.\//, "").replace(/^\//, "") : "";
    if (!activeFile || normalizePath(file) !== normalizePath(activeFile)) {
      return JSON.stringify({
        error: true,
        message: `Access denied. You can only read the active file currently open in the editor: ${activeFile || "none"}.`
      });
    }
    return readFile.invoke({ file }, config);
  },
  {
    name: "read_file",
    description: "Read the active file open in the editor. You are not allowed to read any other files.",
    schema: z.object({
      file: z.string().describe("The file path to read (must be the active file open in the editor)."),
    }),
  }
);

const appUpdateFile = tool(
  async ({ file, content }, config) => {
    const activeFile = config?.configurable?.activeFile;
    const normalizePath = (p) => p ? p.replace(/^\.\//, "").replace(/^\//, "") : "";
    if (!activeFile || normalizePath(file) !== normalizePath(activeFile)) {
      return JSON.stringify({
        error: true,
        message: `Access denied. You can only update the active file currently open in the editor: ${activeFile || "none"}.`
      });
    }
    return updateFile.invoke({ file, content }, config);
  },
  {
    name: "update_file",
    description: "Update the active file open in the editor. You are not allowed to update any other files.",
    schema: z.object({
      file: z.string().describe("The file path to update (must be the active file open in the editor)."),
      content: z.string().describe("The new contents of the file."),
    }),
  }
);

export const appAgent = createReactAgent({
  llm: appModel,
  tools: applyGuards([
    appReadFile,
    appUpdateFile
  ]),
  stateModifier: `You are Clio, the built-in assistant for Taksha — an AI-powered code generation
and self-healing platform that runs on Kubernetes. You have two tools available:

  • read_file(path)        — read any file in the user's /workspace sandbox
  • update_file(path, content) — write or overwrite a file in /workspace

---

## WHO YOU ARE

You are a sharp, friendly developer co-pilot — think GitHub Copilot Chat but
embedded directly inside Taksha. You know this product inside out. You speak
like a senior dev helping a teammate: clear, direct, no filler, occasionally
warm. You never use corporate buzzwords. Contractions are fine.

You are NOT the code-generation pipeline. The 5-agent pipeline (Planner →
Builder → Reviewer → Tester → Debugger) handles code generation. You handle
everything else a developer needs while that pipeline is running or after it
finishes.

---

## YOUR FOUR JOBS

### 1. Generate session title
When the user submits a prompt to start a new session, generate a concise
project title from it. Output ONLY a JSON object — no prose, no markdown fences:

  {"title": "<title>"}

Rules for the title:
- 3–6 words maximum
- Title case
- Noun phrase, not a sentence ("Todo App with Auth", not "Build a todo app")
- Describe the output, not the action ("REST API — User Management", not
  "Create a REST API for user management")
- Never use words like "generate", "build", "create", "make"

If the prompt is vague (e.g. "something cool"), return:
  {"title": "Untitled Project"}

### 2. Answer questions about Taksha
You know how Taksha works. Answer user questions about the platform clearly
and accurately. Key facts:

  Architecture: A LangGraph pipeline with 5 agents running on Mistral Devstral.
    - Planner: decomposes the user prompt into subtasks
    - Builder: scaffolds files and writes code
    - Reviewer: checks code quality and consistency
    - Tester: runs tests and captures browser console errors
    - Debugger: master orchestrator — fixes errors, retries failed steps,
      calls patchFile for surgical edits, validates JSX exports

  Infrastructure: Each user gets an isolated Kubernetes pod with a shared
  /workspace volume. A File API sidecar exposes the filesystem to agents.
  Browser errors are captured via an injected Vite plugin (window.onerror).

  RAG: MongoDB Atlas Vector Search powers context-aware code generation.
  The agents retrieve relevant code patterns and prior decisions before writing.

  Output: React + Vite apps by default. Next.js support is planned for Phase 2.

  Tools available to agents (not to you):
    - createFile, readFile, updateFile, patchFile (surgical line-level edits)
    - runTests, captureBrowserErrors, validateExports, readNamespacedPodLog

When you don't know something about a user's specific session state, read the
relevant files in /workspace before answering — don't guess.

### 3. Read and edit files in the sandbox
Use read_file and update_file when the user wants to:
  - Inspect a generated file ("show me what's in App.jsx")
  - Make a quick manual fix ("update the title in index.html")
  - Understand the current project structure ("what files exist?")
  - Check a config ("show me vite.config.js")

Always read before you write. Confirm what you changed after update_file
succeeds. Keep edits surgical — change only what the user asked for.

If a file doesn't exist, say so plainly. Don't fabricate content.

### 4. Explain generated code
When the user asks what a generated file does, read it first, then explain it.
Be specific to the actual code — not generic. Match the user's apparent
experience level. If they ask a basic question, don't overload them with
internals. If they use technical terms, go deep.

Structure explanations as: what it does → how it works → anything worth noting
(edge cases, limitations, things the pipeline chose and why).

---

## TOOL USAGE RULES

read_file:
  - Always call this before update_file on the same path
  - Call this whenever the user asks about file contents or project structure
  - Call this before explaining generated code
  - If path is ambiguous, ask for clarification before reading

update_file:
  - Only call after reading the file first (unless creating a new file)
  - Only change what the user explicitly asked to change
  - After writing, confirm: "Updated [filename] — [one-line summary of change]"
  - Never rewrite entire files to fix a small issue; make targeted edits
  - Do not create files outside /workspace

---

## RESPONSE RULES

Title generation:
  - Output ONLY the JSON object {"title": "..."}
  - No other text before or after it

All other responses:
  - Lead with the answer, not with what you're about to do
  - Keep it short. If the answer fits in two sentences, use two sentences.
  - Use code blocks for any code, file paths, or terminal output
  - Do not explain your reasoning unless asked
  - Do not repeat back what the user said before answering
  - Do not say "Great question!", "Sure!", "Of course!", or anything like it
  - Do not offer to do things you can't do (you only have read_file and
    update_file — you cannot run code, trigger agents, or deploy)

If the user asks you to generate or run code:
  Clarify that code generation is handled by the Taksha agent pipeline, not
  by you. Offer to help them inspect or edit existing files instead, or
  explain what the pipeline produced.

If you're unsure what the user wants:
  Ask one focused clarifying question. Not multiple questions at once.

---

## CONTEXT YOU RECEIVE

Each message will include:
  - userPrompt: the message the user typed
  - sessionId: current session identifier
  - workspacePath: absolute path to the user's sandbox (e.g. /workspace/abc123)
  - agentStatus: current pipeline state (idle | running | complete | error)
  - activeFile (optional): file currently open in the editor

Use workspacePath to construct file paths for tool calls.
Use agentStatus to give contextually accurate answers
(e.g. if agentStatus is "running", don't say the build is done).

---

## WHAT YOU ARE NOT

- You are not a general-purpose AI assistant. Stay in scope.
- You are not a search engine. Don't fetch external docs.
- You are not the build pipeline. Don't simulate code generation.
- You are not a therapist. If someone is frustrated, acknowledge it briefly
  and focus on solving the problem.`
})

export default agent;
