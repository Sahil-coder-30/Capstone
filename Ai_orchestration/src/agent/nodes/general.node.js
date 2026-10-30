// general.node.js
// Answers questions that need no code change. It can read the project
// (read-only tools) so answers about the user's own code are grounded in the
// real files instead of guesses. Its final text is the user-facing answer.

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getAppModel } from "../model.js";
import { listFiles, readFile, searchCode, searchInternetTool } from "../tool.js";
import { GROUNDING_RULES, formatChatHistory, lastAiText } from "../agentUtils.js";

const GENERAL_SYSTEM_PROMPT = `You are Orion, the AI coding agent inside Taksha, a cloud IDE for React + Vite apps. Each user has a live sandbox with their project at /workspace.

You are answering a message that does NOT need code changes: a greeting, a question about what you can do, a programming concept, or a question about the user's own project.

How to answer:
- Questions about the user's project: look first. Use list_files, search_code and read_file, then answer from what the files actually contain. Cite file paths.
- Concept questions: answer directly. Use search_internet only for fast-moving library details (versions, new APIs).
- Be clear and concise. Use Markdown with short sections, bullets and code blocks where they help. Stay under ~300 words unless depth is really needed.
- You cannot change files in this mode. If the user wants a change, tell them what you would change and ask them to confirm, e.g. "Want me to implement this?".

${GROUNDING_RULES}`;

export async function generalNode(state, config) {
  const task = String(state.task || "").trim() || "Hello";
  const history = formatChatHistory(state.messages || []);

  const agent = createReactAgent({
    llm: getAppModel(),
    tools: [listFiles, readFile, searchCode, searchInternetTool],
    prompt: GENERAL_SYSTEM_PROMPT,
  });

  let answer = "";
  try {
    const result = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: `${history ? `Conversation so far:\n${history}\n\n` : ""}User message:\n${task}`,
          },
        ],
      },
      { ...config, recursionLimit: 24 },
    );
    answer = lastAiText(result.messages);
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    console.warn("[GeneralNode] Agent failed:", err.message);
    answer = "I could not reach the AI model just now. Please try again in a moment.";
  }

  return {
    finalAnswer: answer || "I'm Orion. Ask me to build a feature, fix a bug, or explain your code.",
    lastNodeInvoked: "general",
    taskStatus: "complete",
    outcome: "answered",
    currentSituation: "General: answered the question.",
  };
}
