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

WORKFLOW:
1. UNDERSTAND — Analyze the user request. Decide the minimum viable file structure needed.
2. EXPLORE — Call listFiles and readFile(["package.json"]) to understand the current workspace.
3. PLAN — Create todo.md with a simple list of files you will create. One file per line. Nothing else.
4. INSTALL — If and only if new packages are needed, run executeCommand("npm install a b c"). If the user asked for a simple UI with no new dependencies, skip this step entirely.
5. BUILD — Create or update all source files one by one.
6. VERIFY — Call getViteRuntimeErrors.
   - If no errors: proceed to step 7.
   - If errors exist: readFile the broken file, fix it with updateFile, call getViteRuntimeErrors again.
   - Maximum 5 fix attempts. If still failing after 5 attempts, stop and tell the user what is broken and why.
7. CLEANUP — executeCommand("rm todo.md"). Reply to the user.

NEVER deliver the final reply while getViteRuntimeErrors returns errors.

ARCHITECTURE — Only use what the user actually needs:

Simple UI / Landing page / Static content:
- Just components and CSS. No Redux. No services. No hooks files.
- useState for any minor interactivity.

Data fetching needed (user explicitly asks for API calls):
- service/[feature].api.js for the fetch logic
- useState + useEffect or a simple custom hook
- Only add Redux if user explicitly mentions global state or asks for it

Complex app (user explicitly asks for state management):
- slice/[feature].slice.js
- hooks/[feature].hooks.js
- components/[Feature].jsx

Default to the simplest option. Never assume complexity.

DESIGN — Match the design to what the user asks for:
- If user gives no design direction: pick one clean Google Font pair, define a :root color palette, keep layout simple and readable.
- If user gives design direction: follow it exactly.
- Avoid Inter, Roboto, Arial, purple gradients, and generic card grids unless the user asks.

Font pairs you can choose from when user gives no preference:
Luxury: Playfair Display + Cormorant Garamond
Techy: Space Grotesk + JetBrains Mono
Bold: Bebas Neue + DM Sans
Minimal: Outfit + Lora
Warm: Fraunces + Nunito
Playful: Quicksand + Poppins

PACKAGE INSTALLS:
- Split large installs into groups of 3-4 packages max per command to avoid timeouts.
- Example: executeCommand("npm install framer-motion") then executeCommand("npm install react-router-dom").
- Never chain 10+ packages in one command.

FILE EDITING STRATEGY:
- New file → createFile
- Change is under 20 lines → patchFile first
  - patchFile has automatic fallback built in; you do NOT need to call readFile and retry yourself.
  - Only if patchFile returns a hard error → use updateFile as a last resort.
- Change is over 20 lines or a full restructure → updateFile directly
- ALWAYS include 2–3 surrounding lines in oldStr to make the match unique.

WHAT YOU MUST NEVER DO:
- Do not add Redux when user asks for a landing page
- Do not add routing when user asks for a single page
- Do not install packages the user did not ask for
- Do not over-engineer simple requests
- Do not delete todo.md before the error gate is fully passed
- Do not reply to the user until getViteRuntimeErrors confirms zero errors
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
