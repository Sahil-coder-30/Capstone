// router.node.js
// Entry-point node. One cheap LLM call (fast model, not streamed) classifies:
//   general | new_feature | bug_fix | refactor
// Recent chat history is included so short follow-ups ("yes, do it",
// "now add dark mode") are classified with context.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getFastModel } from "../model.js";
import { contentToText, formatChatHistory } from "../agentUtils.js";

const ROUTER_SYSTEM_PROMPT = `You are a query classifier for Orion, an AI coding agent inside Taksha (a cloud IDE for React apps).

Classify the user's LATEST message into exactly one category:
  general      - greetings, small talk, questions about Orion, or programming questions that need NO change to the user's project
  new_feature  - build / create / add / implement / scaffold something in the project
  bug_fix      - fix / debug / repair an error or broken behavior in the project
  refactor     - restructure / clean up existing code without changing behavior

Rules:
- Use the conversation so far to resolve short follow-ups. "yes do it" after Orion proposed a change is a coding category.
- Questions about the user's own code that need reading but no change ("what does App.jsx do?") are general.
- When unsure between coding categories prefer: new_feature > bug_fix > refactor.
- Reply with ONLY the category word.`;

const GREETING = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|yo|sup|thanks|thank\s+you|who\s+are\s+you|what\s+can\s+you\s+do)[\s!.,?]*$/i;

export async function routerNode(state) {
  const task = String(state.task || "").trim();
  const routingHistory = [...(state.routingHistory || []), "router"];

  if (GREETING.test(task)) {
    return {
      intent: "general",
      taskSubType: null,
      routingHistory,
      lastNodeInvoked: "router",
      currentSituation: "Router: conversational message, answering directly.",
      taskStatus: "routed",
    };
  }

  let category = "new_feature";
  try {
    const history = formatChatHistory(state.messages || [], 2_000);
    const response = await getFastModel().invoke(
      [
        new SystemMessage(ROUTER_SYSTEM_PROMPT),
        new HumanMessage(
          `${history ? `Conversation so far:\n${history}\n\n` : ""}Latest message:\n"""${task.slice(0, 1_500)}"""`,
        ),
      ],
      { tags: ["nostream", "orion_internal"] },
    );
    const word = contentToText(response?.content).trim().toLowerCase();
    if (/\bgeneral\b/.test(word)) category = "general";
    else if (/\bbug_fix\b/.test(word)) category = "bug_fix";
    else if (/\brefactor\b/.test(word)) category = "refactor";
    else category = "new_feature";
  } catch (err) {
    // A failed classification should not silently turn a coding task into
    // chit-chat, so default to the coding path.
    console.warn("[RouterNode] Classification failed, defaulting to coding:", err.message);
  }

  const intent = category === "general" ? "general" : "coding";
  const taskSubType = intent === "general" ? null : category;
  console.log(`[RouterNode] "${task.slice(0, 60)}" -> ${category}`);

  return {
    intent,
    taskSubType,
    routingHistory,
    lastNodeInvoked: "router",
    currentSituation: intent === "general"
      ? "Router: answering a question, no code changes needed."
      : `Router: classified as ${taskSubType.replace("_", " ")}. Inspecting the project to plan the work.`,
    taskStatus: "routed",
  };
}

export function routerEdge(state) {
  return state.intent === "general" ? "general" : "planner";
}
