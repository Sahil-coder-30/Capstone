// clio.node.js
// Clio, the editor copilot: explains code, answers questions about the open
// file and makes small, surgical edits. One tool loop, streamed as the answer.

import { getMainModel } from "../llm/model.js";
import { runToolLoop } from "../core/toolLoop.js";
import { lastAiText, truncate } from "../core/messages.js";
import { GROUNDING_RULES, PROJECT_CONTEXT } from "../core/prompts.js";
import { COPILOT_TOOLS } from "../tools/index.js";

const MAX_ACTIVE_FILE_CHARS = 6_000;

const SYSTEM_PROMPT = `You are Clio, a developer copilot inside Taksha, a cloud IDE. ${PROJECT_CONTEXT}

You help the user understand their code, answer questions about files and fix small bugs.
- Talk like a senior engineer helping a teammate: direct, clear, no filler.
- Read a file before you change it. Keep edits small; prefer patch_file.
- For large features, suggest asking Orion (the coding agent) instead.
- If a file does not exist, say so. Never invent content.
- After an edit, say exactly which file changed and what changed.

${GROUNDING_RULES}`;

const buildPrompt = ({ prompt, activeFile, activeFileContent }) => {
  if (!activeFile) return prompt;
  const content = activeFileContent ? truncate(activeFileContent, MAX_ACTIVE_FILE_CHARS) : "(not provided, use read_file)";
  return `The user has this file open: ${activeFile}\n\n--- ${activeFile} ---\n${content}\n--- end ---\n\n${prompt}`;
};

export async function clioNode(state, config) {
  const { messages } = await runToolLoop({
    model: getMainModel(),
    tools: COPILOT_TOOLS,
    system: SYSTEM_PROMPT,
    history: state.history,
    prompt: buildPrompt(state),
    config,
    maxTurns: 15,
  });
  return { answer: lastAiText(messages) };
}
