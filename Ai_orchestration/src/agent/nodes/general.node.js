// general.node.js — v2
// Lightweight conversational node for non-coding queries.
// Read-only: no file writes, no tool calls that modify state.
//
// Can detect mid-conversation pivots to coding tasks and route back to Router
// instead of answering directly, without requiring a fresh graph invocation.

import { getAppModel } from "../model.js";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — General Assistant
// ---------------------------------------------------------------------------
const GENERAL_SYSTEM_PROMPT = `You are Orion, an AI coding assistant inside Taksha — a cloud IDE built for React developers.

You are responding to a non-coding query: a greeting, a question about your capabilities, or a general programming concept.

Guidelines:
- Be friendly, concise, and helpful
- If the user asks what you can do, describe: building features, fixing bugs, refactoring code, running builds, debugging runtime errors
- If the user asks a programming concept question, answer it clearly without writing code changes
- If the response would benefit from a code snippet, include one inline
- Keep responses under 300 words unless depth is genuinely required

If the user's message is actually a request to change code (e.g. "build X", "fix Y", "add Z"), 
end your response with exactly this line on its own: [ROUTE_TO_CODING]`;

// ---------------------------------------------------------------------------
// GENERAL NODE FUNCTION
// ---------------------------------------------------------------------------
export async function generalNode(state) {
  const messages = state.messages || [];
  const userText =
    state.task ||
    [...messages].reverse().find((m) => m.role === "user" || m._getType?.() === "human")?.content ||
    "Hello";

  const userTextStr = typeof userText === "string" ? userText : JSON.stringify(userText);

  let responseText = "Hi! I'm Orion, your AI coding assistant. How can I help you today?";
  let pivotToCoding = false;

  try {
    const model = getAppModel();
    const response = await model.invoke([
      new SystemMessage(GENERAL_SYSTEM_PROMPT),
      new HumanMessage(userTextStr.slice(0, 2000)),
    ]);
    responseText = String(response?.content ?? "").trim();

    // Detect pivot signal
    if (responseText.includes("[ROUTE_TO_CODING]")) {
      pivotToCoding = true;
      responseText = responseText.replace("[ROUTE_TO_CODING]", "").trim();
    }
  } catch (err) {
    console.warn("[GeneralNode] LLM call failed:", err.message);
    responseText = "I'm having trouble connecting to my AI backend right now. Please try again in a moment.";
  }

  console.log(`[GeneralNode] Response ready (${responseText.length} chars) | pivotToCoding=${pivotToCoding}`);

  return {
    messages: [new AIMessage(responseText)],
    intent: pivotToCoding ? "coding" : "general",
    lastNodeInvoked: "general",
    taskStatus: pivotToCoding ? "routing" : "complete",
    currentSituation: pivotToCoding
      ? "General: User pivoted to a coding request. Routing back to Planner."
      : responseText,
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after general node
// ---------------------------------------------------------------------------
export function generalEdge(state) {
  if (state.intent === "coding") return "planner"; // pivot mid-conversation
  return "__end__"; // normal general reply directly ends graph
}
