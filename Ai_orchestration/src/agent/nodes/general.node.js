// general.node.js
// Answers messages that need no code change. It may read the project, so
// answers about the user's own code come from the real files.

import { getMainModel } from "../llm/model.js";
import { isFatalModelError } from "../llm/rateLimiter.js";
import { runToolLoop } from "../core/toolLoop.js";
import { formatChatHistory, lastAiText } from "../core/messages.js";
import { GROUNDING_RULES, PROJECT_CONTEXT } from "../core/prompts.js";
import { READ_ONLY_TOOLS } from "../tools/index.js";

const SYSTEM_PROMPT = `You are Orion, the AI coding agent inside Taksha, a cloud IDE. ${PROJECT_CONTEXT}

You are answering a message that does NOT need code changes: a greeting, a question about what you can do, a programming concept, or a question about the user's project.

- Questions about the project: look first with list_files, search_code and read_file, then answer from what the files contain. Cite file paths.
- Concept questions: answer directly. Use search_internet only for fast-moving library details.
- Be clear and concise. Markdown with short sections, bullets and code blocks where they help. Under ~300 words unless depth is really needed.
- You can not change files in this mode. If the user wants a change, describe it and ask "Want me to implement this?".

${GROUNDING_RULES}`;

export async function generalNode(state, config) {
  const history = formatChatHistory(state.messages);
  let answer = "";
  try {
    const { messages } = await runToolLoop({
      model: getMainModel(),
      tools: READ_ONLY_TOOLS,
      system: SYSTEM_PROMPT,
      prompt: `${history ? `Conversation so far:\n${history}\n\n` : ""}User message:\n${state.task || "Hello"}`,
      config,
      maxTurns: 12,
    });
    answer = lastAiText(messages);
  } catch (err) {
    if (config?.signal?.aborted || isFatalModelError(err)) throw err;
    console.warn("[General] Failed:", err.message);
    answer = "I could not reach the AI model just now. Please try again in a moment.";
  }

  return {
    finalAnswer: answer || "I'm Orion. Ask me to build a feature, fix a bug, or explain your code.",
    outcome: "answered",
    currentSituation: "Answered the question.",
  };
}
