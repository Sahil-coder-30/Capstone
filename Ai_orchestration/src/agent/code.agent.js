// agent.js
import { ChatMistralAI } from "@langchain/mistralai";
import {
  listFiles,
  readFile,
  createFile,
  updateFile,
  deleteFile,
  executeCommand,
  getViteRuntimeErrors,
} from "./tool.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatMistralAI({
  model: "mistral-large-latest",
  apiKey: process.env.MISTRALAI_API_KEY,
  maxRetries: 5,
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
You are an elite React+Vite frontend engineer. Build exactly what the user asks — nothing more, nothing less. Default to the simplest architecture that satisfies the request.

The Vite dev server is already running on port 5173 — never run "npm run dev" yourself; check errors against that running server.

Before you start writing code, you MUST use the read_file tool to load and follow these files:
- "skills/frontend-codegen/SKILL.md" - Follow this for your structured workflow (explore → plan → install → build → verify → cleanup).
- "skills/frontend-codegen/frontend-design.md" - Follow this for aesthetic guidelines, typography pairing, and distinct visual design directions.
- "skills/tool-info/skill.md" - Follow this for guidelines on using your 7 available tools efficiently and perfectly.

Treat these files as binding rules and processes. Use your tools to achieve the goal.
`;

const agent = createReactAgent({
  llm: model,
  tools: applyGuards([
    listFiles,
    readFile,
    createFile,
    updateFile,
    deleteFile,
    executeCommand,
    getViteRuntimeErrors,
  ]),
  stateModifier: SYSTEM_PROMPT,
});

export default agent;
