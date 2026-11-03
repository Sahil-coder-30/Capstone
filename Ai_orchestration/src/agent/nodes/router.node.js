// router.node.js
// Classifies the latest message with one cheap model call:
//   general | new_feature | bug_fix | refactor
// Recent chat history is included so short follow-ups ("yes, do it") are
// classified with context.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getFastModel } from "../llm/model.js";
import { INTERNAL_TAGS } from "../llm/structured.js";
import { contentToText, formatChatHistory } from "../core/messages.js";

const SYSTEM_PROMPT = `You classify messages for Orion, an AI coding agent inside Taksha (a cloud IDE for React apps).

Classify the user's LATEST message into exactly one category:
  general      - greetings, small talk, questions about Orion, or questions that need NO change to the project (including "what does App.jsx do?")
  new_feature  - build / create / add / implement something in the project
  bug_fix      - fix / debug / repair an error or broken behavior
  refactor     - restructure or clean up code without changing behavior

Use the conversation to resolve short follow-ups: "yes do it" after Orion proposed a change is a coding category.
When unsure between coding categories prefer new_feature, then bug_fix, then refactor.
Reply with ONLY the category word.`;

const SMALL_TALK = /^(hi|hello|hey|yo|sup|thanks|thank\s+you|good\s+(morning|afternoon|evening)|who\s+are\s+you|what\s+can\s+you\s+do)[\s!.,?]*$/i;
const CATEGORIES = ["general", "bug_fix", "refactor", "new_feature"];

const classify = async (state, config) => {
  const history = formatChatHistory(state.messages, 2_000);
  const reply = await getFastModel().invoke(
    [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(`${history ? `Conversation so far:\n${history}\n\n` : ""}Latest message:\n"""${state.task.slice(0, 1_500)}"""`),
    ],
    { signal: config?.signal, tags: INTERNAL_TAGS },
  );
  const word = contentToText(reply.content).toLowerCase();
  return CATEGORIES.find((c) => word.includes(c)) || "new_feature";
};

export async function routerNode(state, config) {
  let category = "general";
  if (!SMALL_TALK.test(state.task.trim())) {
    try {
      category = await classify(state, config);
    } catch (err) {
      if (config?.signal?.aborted) throw err;
      // A failed classification must not turn a coding task into chit-chat.
      console.warn("[Router] Classification failed, using the coding path:", err.message);
      category = "new_feature";
    }
  }

  const intent = category === "general" ? "general" : "coding";
  console.log(`[Router] "${state.task.slice(0, 60)}" -> ${category}`);
  return {
    intent,
    taskSubType: intent === "coding" ? category : null,
    currentSituation: intent === "general"
      ? "Answering a question, no code changes needed."
      : `Classified as ${category.replace("_", " ")}. Inspecting the project to plan the work.`,
  };
}

export const routerEdge = (state) => (state.intent === "general" ? "general" : "planner");
