// router.node.js — v2
// Entry-point node. Performs ONE LLM call to:
//   1. Classify intent: "general" | "coding"
//   2. Sub-classify coding intent: "new_feature" | "bug_fix" | "refactor"
//   3. Detect stuck loops by checking routingHistory for repeated transitions
//
// All other transitions in the graph are deterministic edge functions —
// no further LLM calls happen in the routing layer.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getAppModel } from "../model.js";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — Router / Traffic Controller
// ---------------------------------------------------------------------------
const ROUTER_SYSTEM_PROMPT = `You are a query classifier for Orion, an AI coding assistant inside Taksha.

Your ONLY job is to classify the user's message into one of these exact categories:

CATEGORY OPTIONS (pick exactly one):
  general       — Greetings, small talk, meta questions ("what can you do"), general CS/programming concepts that need no code changes
  new_feature   — Build/create/add/implement/scaffold something new in the codebase
  bug_fix       — Fix/debug/repair/resolve an error or broken behavior in existing code
  refactor      — Improve/restructure/clean up/reorganize existing code without changing behavior

RULES:
- Respond with ONLY the single category word from the list above
- No punctuation, explanation, quotes, or any other text
- When ambiguous between coding categories, prefer: new_feature > bug_fix > refactor
- If the user asks a general question about programming (e.g. "what is React?"), use: general
- If the user asks you to DO something to code, pick the appropriate coding category`;

// ---------------------------------------------------------------------------
// Stuck-loop detection
// If the same pair of nodes (A→B) appears more than twice in routingHistory
// without testResults.pass changing, the graph is stuck.
// ---------------------------------------------------------------------------
function detectStuckLoop(routingHistory = [], testResults = null) {
  if (routingHistory.length < 6) return false;

  // Check the last 6 transitions for identical pairs
  const last6 = routingHistory.slice(-6);
  const pairs = [];
  for (let i = 0; i < last6.length - 1; i++) {
    pairs.push(`${last6[i]}→${last6[i + 1]}`);
  }

  // Count occurrences of each pair
  const counts = {};
  for (const pair of pairs) {
    counts[pair] = (counts[pair] || 0) + 1;
    if (counts[pair] > 2) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// ROUTER NODE FUNCTION
// ---------------------------------------------------------------------------
export async function routerNode(state) {
  const messages = state.messages || [];
  const userText =
    state.task ||
    [...messages].reverse().find((m) => m.role === "user" || m._getType?.() === "human")?.content ||
    messages[messages.length - 1]?.content ||
    "";

  const userTextStr = (typeof userText === "string" ? userText : JSON.stringify(userText)).slice(0, 1200);

  // Track routing history for loop detection
  const routingHistory = [...(state.routingHistory || []), "router"];

  // --- Stuck loop detection (before LLM call, cheap) -----------------------
  if (detectStuckLoop(routingHistory, state.testResults)) {
    console.warn("[RouterNode] Stuck loop detected — escalating");
    return {
      intent: state.intent || "coding",
      taskSubType: state.taskSubType || "bug_fix",
      escalated: true,
      routingHistory,
      lastNodeInvoked: "router",
      currentSituation: "Router: Stuck loop detected after repeated transitions with no progress. Escalating to human review.",
      taskStatus: "escalated",
    };
  }

  // --- Fast-path detection for common conversational inputs ----------------
  const trimmedLower = userTextStr.trim().toLowerCase();
  const isDirectGreeting = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|yo|sup|help|who\s+are\s+you|what\s+can\s+you\s+do)[\s!.,?]*$/i.test(trimmedLower);
  const isQuestionOnly = /^(what\s+is|how\s+does|explain|why\s+is|tell\s+me\s+about)\b/i.test(trimmedLower) && !/\b(code|build|implement|fix|refactor|add|create|delete|update|modify|change|write|app|component|api)\b/i.test(trimmedLower);

  if (isDirectGreeting || isQuestionOnly) {
    console.log(`[RouterNode] Fast-path classified as "general": "${trimmedLower.slice(0, 40)}"`);
    return {
      intent: "general",
      taskSubType: null,
      escalated: false,
      routingHistory,
      lastNodeInvoked: "router",
      currentSituation: "Router: Classified as general conversational query. Directing to General node.",
      taskStatus: "routed",
    };
  }

  // --- LLM classification --------------------------------------------------
  let rawCategory = "general";

  try {
    const model = getAppModel();
    const response = await model.invoke([
      new SystemMessage(ROUTER_SYSTEM_PROMPT),
      new HumanMessage(`Classify this user message:\n\n"${userTextStr}"`),
    ]);
    const responseContent = String(response?.content ?? "").trim().toLowerCase();
    if (/\bbug_fix\b|\bdebug\b/i.test(responseContent)) {
      rawCategory = "bug_fix";
    } else if (/\brefactor\b|\brestructure\b/i.test(responseContent)) {
      rawCategory = "refactor";
    } else if (/\bnew_feature\b|\bfeature\b|\bbuild\b|\bcreate\b|\bimplement\b/i.test(responseContent)) {
      rawCategory = "new_feature";
    } else {
      rawCategory = "general";
    }
  } catch (err) {
    console.warn("[RouterNode] Classification failed, defaulting to 'general':", err.message);
    rawCategory = "general";
  }

  // Map to intent + subType
  let intent = "coding";
  let taskSubType = "new_feature";

  if (rawCategory === "general") {
    intent = "general";
    taskSubType = null;
  } else if (rawCategory === "bug_fix") {
    taskSubType = "bug_fix";
  } else if (rawCategory === "refactor") {
    taskSubType = "refactor";
  } else {
    taskSubType = "new_feature";
  }

  console.log(`[RouterNode] "${userTextStr.slice(0, 60)}..." → intent="${intent}" subType="${taskSubType}"`);

  return {
    intent,
    taskSubType,
    escalated: false,
    routingHistory,
    lastNodeInvoked: "router",
    currentSituation: `Router: Classified as "${intent}${taskSubType ? ` / ${taskSubType}` : ""}". Directing to ${intent === "general" ? "General" : "Planner"} node.`,
    taskStatus: "routed",
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after router node
// ---------------------------------------------------------------------------
export function routerEdge(state) {
  if (state.escalated) return "finalizer"; // exit gracefully on stuck loops
  if (state.intent === "general") return "general";
  return "planner";
}
