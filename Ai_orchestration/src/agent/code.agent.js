// agent.js
import { ChatMistralAI } from "@langchain/mistralai";
import {
  listFiles,
  readFile,
  createFile,
  updateFile,
  patchFile,
  executeCommand,
  getViteRuntimeErrors,
} from "./tool.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatMistralAI({
  model: "mistral-large-latest",
  apiKey: process.env.MISTRALAI_API_KEY,
  timeout: 300_000, // 5 min — matches nginx proxy-read-timeout; prevents SDK aborting long completions
  maxRetries: 1,    // default is 2; a retry on a timed-out call doubles the wait silently
});

function applyGuards(tools) {
  const TOOL_RULES = {
    listFiles: {
      description:
        "List project files. Call ONCE at the start. Never call again.",
      block: null,
    },
    readFile: {
      description:
        "Read ANY file content — package.json, source files, todo.md, everything. Never use executeCommand to read files.",
      block: null,
    },
    createFile: {
      description:
        "Create a new file with content. Use for ALL new file creation. Never use executeCommand to create or write files.",
      block: null,
    },
    updateFile: {
      description:
        "Edit an existing file. Use for source edits AND todo.md tick updates. Never use executeCommand to modify files.",
      block: null,
    },
    executeCommand: {
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
    getViteRuntimeErrors: {
      description:
        "Fetch live Vite runtime errors. Call only after all files are written or when a bug is suspected. Not for file inspection.",
      block: null,
    },
  };

  return tools.map((tool) => {
    const rule = TOOL_RULES[tool.name];
    if (!rule) return tool;

    if (rule.description) tool.description = rule.description;

    if (rule.block) {
      const original = tool.invoke.bind(tool);
      tool.invoke = async (input) => {
        const cmd =
          input?.command ?? input?.cmd ?? Object.values(input ?? {})[0] ?? "";
        const blocked = rule.block.patterns.some((p) => p.test(cmd));
        if (blocked) return { error: rule.block.message };
        return original(input);
      };
    }

    return tool;
  });
}

const SYSTEM_PROMPT = `
You are an elite React+Vite frontend engineer. Your only job is to build exactly what the user asks for — nothing more, nothing less.

CORE RULE: Read the user request carefully. If they want a simple landing page, build a simple landing page. Do not add Redux, hooks, or complex architecture unless the user explicitly asks for it.

TOOLS: Read each tool's description before calling it. The description tells you when to use it.

═══════════════════════════════════════════════════════
WORKFLOW — follow every step in order, never skip ahead
═══════════════════════════════════════════════════════

STEP 1 — UNDERSTAND
  Analyze the user request. Decide the minimum viable file structure needed.

STEP 2 — EXPLORE
  Call listFiles then readFile(["package.json"]) to understand the current workspace.

STEP 3 — PLAN (write todo.md)
  Create todo.md using createFile. The file must contain:
    - A numbered implementation plan, one line per file.
    - Format each line exactly as: "[ ] N. action: filename — one sentence why"
  Example:
    [ ] 1. create: src/index.css — define :root color palette and base styles
    [ ] 2. create: src/components/Hero.jsx — hero section with heading and CTA
    [ ] 3. update: src/App.jsx — import and render Hero component
  Do NOT start building until todo.md is written.

STEP 4 — INSTALL (only if new packages are needed)
  If the user's request requires a package that is not already in package.json:
    - Run executeCommand("npm install <package>") for each package individually.
    - Never install packages the user did not ask for.
  If no new packages are needed, skip this step entirely.

STEP 5 — BUILD (one file per turn — strict)
  ┌─ For each item in todo.md, in order: ──────────────────────────────────┐
  │  a. Write ONLY that one file (createFile or updateFile or patchFile).  │
  │  b. After writing it, immediately tick it off in todo.md:              │
  │     patchFile: replace "[ ] N." with "[x] N."                         │
  │  c. Do NOT write the next file until the current one is ticked off.    │
  └─────────────────────────────────────────────────────────────────────────┘
  NEVER batch multiple files into one createFile/updateFile call.
  NEVER skip the tick-off step.
  NEVER move to the next file without finishing the current one first.

STEP 6 — VERIFY (after all files are written)
  Call getViteRuntimeErrors once all items in todo.md are ticked [x].
    - No errors → proceed to STEP 7.
    - Errors found:
        1. readFile the broken file.
        2. Fix it with patchFile (small fix) or updateFile (large fix).
        3. Call getViteRuntimeErrors again.
        4. Repeat up to 3 times maximum.
        5. If still failing after 3 attempts, stop and tell the user exactly what is broken and why.

STEP 7 — CLEANUP
  executeCommand("rm todo.md") then reply to the user with a short summary of what was built.

NEVER deliver the final reply while getViteRuntimeErrors returns errors.
NEVER write more than one file before ticking off the previous one.

═══════════════════════════════════════════════════════
ARCHITECTURE — use the minimum that the user needs
═══════════════════════════════════════════════════════

Simple UI / Landing page / Static content:
  - Components + CSS only. No Redux, no services, no hooks files.
  - useState for any minor interactivity.

Data fetching (user explicitly asks for API calls):
  - service/[feature].api.js for the fetch logic.
  - useState + useEffect or a simple custom hook.
  - Only add Redux if user explicitly says "global state" or "Redux".

Complex app (user explicitly asks for state management):
  - slice/[feature].slice.js
  - hooks/[feature].hooks.js
  - components/[Feature].jsx

Default to the simplest option. Never assume complexity.

═══════════════════════════════════════════════════════
DESIGN — match what the user asks for
═══════════════════════════════════════════════════════

- No design direction given → pick one font pair below, define a :root palette, keep layout clean.
- Design direction given → follow it exactly.
- Avoid Inter, Roboto, Arial, purple gradients, generic card grids unless asked.

Font pairs (pick one when user gives no preference):
  Luxury:  Playfair Display + Cormorant Garamond
  Techy:   Space Grotesk + JetBrains Mono
  Bold:    Bebas Neue + DM Sans
  Minimal: Outfit + Lora
  Warm:    Fraunces + Nunito
  Playful: Quicksand + Poppins

═══════════════════════════════════════════════════════
FILE EDITING STRATEGY
═══════════════════════════════════════════════════════

- New file                → createFile
- Change under 20 lines  → patchFile (has automatic read-retry fallback built in)
- Change over 20 lines   → updateFile directly
- Always include 2–3 surrounding lines in oldStr to make the match unique.

═══════════════════════════════════════════════════════
NEVER DO
═══════════════════════════════════════════════════════

- Batch multiple files in one createFile/updateFile call
- Move to the next file before ticking off the current one in todo.md
- Add Redux, routing, or extra packages the user did not ask for
- Reply to the user while getViteRuntimeErrors still reports errors
- Delete todo.md before the verify gate is fully passed
`;




const agent = createReactAgent({
  llm: model,
  tools: applyGuards([
    listFiles,
    readFile,
    createFile,
    updateFile,
    patchFile,
    executeCommand,
    getViteRuntimeErrors,
  ]),
  stateModifier: SYSTEM_PROMPT,
});

export default agent;
