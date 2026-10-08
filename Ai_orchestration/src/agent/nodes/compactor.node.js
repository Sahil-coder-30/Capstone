// compactor.node.js — v2 (NEW)
// Token-budget guardian. Triggered when state.tokenCount > TOKEN_THRESHOLD.
//
// Compaction strategy:
//   - Keeps verbatim: plan, flaggedFiles, attemptedFixes, retryCount, buildLog
//     (these are decisions and history, not noise)
//   - Summarises: verbose tool-call chatter, intermediate AI reasoning messages
//   - Preserves: the user's original task and the last AI response
//   - Routes back to: state.returnToNode (the node that triggered compaction)

import { getAppModel } from "../model.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const TOKEN_THRESHOLD = 100_000;

const COMPACTOR_SYSTEM_PROMPT = `You are Orion's Compactor — a context window manager.

You receive a verbose list of tool call messages and AI reasoning steps.
Produce a single concise summary paragraph that captures:
  1. What has been implemented so far (completed plan steps)
  2. Any errors that were found and how they were addressed
  3. The current state of the task (what step are we on, what is the status)

Do not include:
  - Repeated file reads that produced no changes
  - Token counts or internal metrics
  - Verbatim tool output or long file contents

Keep the summary under 400 words. Use plain prose, not bullet points.`;

// ---------------------------------------------------------------------------
// COMPACTOR NODE FUNCTION
// ---------------------------------------------------------------------------
export async function compactorNode(state, config) {
  const { messages = [], returnToNode, tokenCount = 0 } = state;

  // Skip if token count is below threshold (safety in case edge fires early)
  if (tokenCount < TOKEN_THRESHOLD) {
    return {
      lastNodeInvoked: "compactor",
      currentSituation: "Compactor: Token count below threshold — no compaction needed.",
    };
  }

  console.log(`[CompactorNode] Token count ${tokenCount} > ${TOKEN_THRESHOLD}, compacting ${messages.length} messages`);

  // Separate messages to preserve vs messages to compress
  // Always preserve: first message (user task) + last 2 messages (most recent context)
  const userMessages = messages.filter((m) => m.role === "user" || m._getType?.() === "human");
  const firstUserMsg = userMessages[0];
  const recentMessages = messages.slice(-2);

  const verboseMessages = messages.slice(
    firstUserMsg ? 1 : 0,
    Math.max(0, messages.length - 2)
  );

  if (verboseMessages.length === 0) {
    return {
      lastNodeInvoked: "compactor",
      currentSituation: "Compactor: Nothing to compact.",
    };
  }

  // Summarise the verbose middle messages
  const rawContent = verboseMessages
    .map((m) => {
      const type = m.role || m._getType?.() || "unknown";
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content || "");
      return `[${type}]: ${content.slice(0, 500)}`;
    })
    .join("\n---\n");

  let summary = "Previous context (compacted): task is in progress.";
  try {
    const model = getAppModel();
    const response = await model.invoke([
      new SystemMessage(COMPACTOR_SYSTEM_PROMPT),
      new HumanMessage(`Summarize these intermediate messages:\n\n${rawContent.slice(0, 8000)}`),
    ]);
    summary = String(response?.content || "").trim().slice(0, 1500);
  } catch (err) {
    console.warn("[CompactorNode] Summarization failed:", err.message);
  }

  // Rebuild compact message history
  const compactedMessages = [
    ...(firstUserMsg ? [firstUserMsg] : []),
    { role: "assistant", content: `[Context Summary]\n${summary}` },
    ...recentMessages,
  ];

  console.log(`[CompactorNode] Compacted ${messages.length} → ${compactedMessages.length} messages`);

  return {
    messages: compactedMessages,
    tokenCount: 0, // reset after compaction
    lastNodeInvoked: "compactor",
    currentSituation: `Compactor: Compressed ${messages.length} messages to ${compactedMessages.length}. Resuming ${returnToNode || "previous node"}.`,
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — routes back to whichever node triggered compaction
// ---------------------------------------------------------------------------
export function compactorEdge(state) {
  const target = state.returnToNode;
  const validTargets = ["router", "planner", "critic", "coder", "tester", "debugger", "finalizer"];
  return validTargets.includes(target) ? target : "finalizer";
}

// ---------------------------------------------------------------------------
// Helper: called at the start of any major node to check if compaction needed
// Returns the node name to route to ("compactor" | null)
// ---------------------------------------------------------------------------
export function shouldCompact(state, currentNodeName) {
  if ((state.tokenCount || 0) > TOKEN_THRESHOLD) {
    return { returnToNode: currentNodeName, triggerCompactor: true };
  }
  return null;
}
