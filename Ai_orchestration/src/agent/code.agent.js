// agent.js
import { ChatMistralAI } from "@langchain/mistralai";
import {
  listFiles,
  readFile,
  createFile,
  updateFile,
  executeCommand,
  getViteRuntimeErrors,
} from "./tool.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatMistralAI({
  model: "mistral-medium-latest",
  apiKey: process.env.MISTRALAI_API_KEY,
});

function applyGuards(tools) {
  const TOOL_RULES = {
    listFiles: {
      description: "List project files. Call ONCE at the start. Never call again.",
      block: null,
    },
    readFile: {
      description: "Read ANY file content — package.json, source files, todo.md, everything. Never use executeCommand to read files.",
      block: null,
    },
    createFile: {
      description: "Create a new file with content. Use for ALL new file creation. Never use executeCommand to create or write files.",
      block: null,
    },
    updateFile: {
      description: "Edit an existing file. Use for source edits AND todo.md tick updates. Never use executeCommand to modify files.",
      block: null,
    },
    executeCommand: {
      description: "Shell only. Valid: 'npm install [pkg]', 'rm todo.md', 'mkdir [dir]', 'git [cmd]'. Nothing else.",
      block: {
        patterns: [/^\s*cat /, /^\s*head /, /^\s*tail /, /^\s*echo .+>/, /^\s*touch /, /^\s*cp /, /^\s*mv /, /^\s*sed /, /^\s*awk /, /^\s*grep /],
        message: "WRONG TOOL. Use readFile to read, createFile/updateFile to write. executeCommand is for npm/rm/mkdir/git only.",
      },
    },
    getViteRuntimeErrors: {
      description: "Fetch live Vite runtime errors. Call only after all files are written or when a bug is suspected. Not for file inspection.",
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
        const cmd = input?.command ?? input?.cmd ?? Object.values(input ?? {})[0] ?? "";
        const blocked = rule.block.patterns.some((p) => p.test(cmd));
        if (blocked) return { error: rule.block.message };
        return original(input);
      };
    }

    return tool;
  });
}

const SYSTEM_PROMPT = `
Elite React+Vite engineer. Ship production-grade, memorable UIs.

TOOLS: each tool description is your only rule for when to use it. Read descriptions before every call.

WORKFLOW:
1. listFiles + readFile(["package.json"]) — once, together, never again.
2. createFile("todo.md") — aesthetic on line 1, one file per line.
3. ONE executeCommand("npm install a b c") if needed. Continue immediately.
4. createFile / updateFile for all source files. updateFile todo.md every 3 files.
5. BEFORE replying — mandatory error gate:
   a. getViteRuntimeErrors → if errors exist: readFile the broken file, fix with updateFile, getViteRuntimeErrors again.
   b. Repeat until clean or 3 attempts exhausted.
   c. Only reply when getViteRuntimeErrors returns no errors.
6. executeCommand("rm todo.md"). Reply to user.

NEVER deliver the final reply while getViteRuntimeErrors returns errors. A broken delivery is a failed task.

ARCHITECTURE:
Simple (≤2 endpoints): service/[f].api.js + slice/[f].slice.js with inline hook.
Complex: + hooks/[f].hooks.js + components/[F].jsx. Default to simple.
State: async→Redux hook | global UI→Redux slice | local→useState.

DESIGN: ONE bold aesthetic. Distinctive Google Font pair via @import. :root token palette. Asymmetric layout.
Forbidden: Inter/Roboto/Arial, purple gradients, symmetric card grids.
Pairs — Luxury:Playfair+Cormorant | Techy:Space Grotesk+JetBrains Mono | Bold:Bebas+DM Sans | Brutalist:Anton+Space Mono | Minimal:Outfit+Lora | Retro:Orbitron+Exo 2 | Warm:Fraunces+Nunito | Playful:Quicksand+Poppins
`;

const agent = createReactAgent({
  llm: model,
  tools: applyGuards([
    listFiles,
    readFile,
    createFile,
    updateFile,
    executeCommand,
    getViteRuntimeErrors,
  ]),
  stateModifier: SYSTEM_PROMPT,
});

export default agent;