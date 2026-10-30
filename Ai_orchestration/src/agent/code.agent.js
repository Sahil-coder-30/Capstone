// code.agent.js
// Orion: multi-node LangGraph coding agent for Taksha.
//
// Graph:
//   START → router ─┬→ general → END
//                   └→ planner → critic ─┬→ planner (auto re-plan, max 2)
//                                        └→ plan_review (interrupt) ─┬→ planner (user feedback)
//                                                                    └→ coder (one step per pass, loops)
//   coder → tester ─┬→ reviewer ─┬→ finalizer
//                   │            └→ debugger
//                   └→ debugger → tester
//   (any failure path with no retries left) → finalizer → END
//
// Every working node gets a fresh, small prompt built from state facts.
// Chat history (state.messages) is read-only context and is never grown
// by node transcripts.

import {
  StateGraph,
  Annotation,
  END,
  START,
  MemorySaver,
} from "@langchain/langgraph";

import { hasModelKey, getAppModelInfo } from "./model.js";
import { onRateLimitEvent } from "./modelSafety.js";
import { routerNode, routerEdge } from "./nodes/router.node.js";
import { generalNode } from "./nodes/general.node.js";
import { plannerNode, plannerEdge } from "./nodes/planner.node.js";
import { criticNode, criticEdge } from "./nodes/critic.node.js";
import { planReviewNode, planReviewEdge } from "./nodes/planReview.node.js";
import { coderNode, coderEdge } from "./nodes/coder.node.js";
import { testerNode, testerEdge } from "./nodes/tester.node.js";
import { reviewerNode, reviewerEdge } from "./nodes/reviewer.node.js";
import { debuggerNode, debuggerEdge } from "./nodes/debugger.node.js";
import { finalizerNode } from "./nodes/finalizer.node.js";

export { onRateLimitEvent, getAppModelInfo };

// Last write wins, and an explicit null resets the value.
const value = (defaultValue) =>
  Annotation({
    reducer: (_prev, next) => next,
    default: typeof defaultValue === "function" ? defaultValue : () => defaultValue,
  });

// Appends arrays. Passing null resets to [].
const appendList = () =>
  Annotation({
    reducer: (prev, next) => (next === null ? [] : [...(prev || []), ...(Array.isArray(next) ? next : [next])]),
    default: () => [],
  });

// Set-like union of strings. Passing null resets to [].
const unionList = () =>
  Annotation({
    reducer: (prev, next) => (next === null ? [] : [...new Set([...(prev || []), ...(next || [])])]),
    default: () => [],
  });

export const AgentStateAnnotation = Annotation.Root({
  // ── Input ────────────────────────────────────────────────────────────────
  messages: value(() => []),          // prior chat turns, read-only context
  task: value(""),
  autoApprovePlan: value(false),

  // ── Router ───────────────────────────────────────────────────────────────
  intent: value("coding"),
  taskSubType: value("new_feature"),
  routingHistory: appendList(),

  // ── Planning ─────────────────────────────────────────────────────────────
  plan: value(null),
  planAnalysis: value(""),
  planError: value(null),
  planApproved: value(false),
  planFeedback: value(""),
  planRevisions: value(0),
  planWarnings: value(() => []),
  existingFiles: value(() => []),
  criticPass: value(false),
  criticFeedback: value(""),

  // ── Coding ───────────────────────────────────────────────────────────────
  currentStep: value(0),
  stepReports: appendList(),
  filesTouched: unionList(),

  // ── Verification ─────────────────────────────────────────────────────────
  testResults: value(null),
  buildLog: value(null),
  flaggedFiles: value(() => []),
  review: value(null),

  // ── Debugging ────────────────────────────────────────────────────────────
  attemptedFixes: appendList(),
  retryCount: value(0),
  maxRetries: value(3),
  escalated: value(false),
  escalationReason: value(""),

  // ── Output ───────────────────────────────────────────────────────────────
  finalAnswer: value(""),
  outcome: value(null),               // answered | complete | partial | failed
  currentSituation: value("Starting."),
  lastNodeInvoked: value("start"),
  taskStatus: value("routing"),
});

// One checkpointer for the process: threads are paused here during plan
// review and resumed with Command({ resume }).
const checkpointer = new MemorySaver();

export const buildAgentGraph = () =>
  new StateGraph(AgentStateAnnotation)
    .addNode("router", routerNode)
    .addNode("general", generalNode)
    .addNode("planner", plannerNode)
    .addNode("critic", criticNode)
    .addNode("plan_review", planReviewNode)
    .addNode("coder", coderNode)
    .addNode("tester", testerNode)
    .addNode("reviewer", reviewerNode)
    .addNode("debugger", debuggerNode)
    .addNode("finalizer", finalizerNode)

    .addEdge(START, "router")
    .addConditionalEdges("router", routerEdge, { general: "general", planner: "planner" })
    .addEdge("general", END)
    .addConditionalEdges("planner", plannerEdge, { critic: "critic", finalizer: "finalizer" })
    .addConditionalEdges("critic", criticEdge, { plan_review: "plan_review", planner: "planner" })
    .addConditionalEdges("plan_review", planReviewEdge, { coder: "coder", planner: "planner" })
    .addConditionalEdges("coder", coderEdge, { coder: "coder", tester: "tester", finalizer: "finalizer" })
    .addConditionalEdges("tester", testerEdge, { reviewer: "reviewer", debugger: "debugger", finalizer: "finalizer" })
    .addConditionalEdges("reviewer", reviewerEdge, { finalizer: "finalizer", debugger: "debugger" })
    .addConditionalEdges("debugger", debuggerEdge, { tester: "tester", finalizer: "finalizer" })
    .addEdge("finalizer", END)
    .compile({ checkpointer });

let compiledGraph = null;

/** Returns the compiled graph (built once) plus model metadata. */
export const createAgentForModel = () => {
  if (!hasModelKey()) {
    const error = new Error("No configured coding agent model available. Set MISTRALAI_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  compiledGraph ??= buildAgentGraph();
  return { agent: compiledGraph, model: getAppModelInfo() };
};

/** Drops a finished thread's checkpoints so MemorySaver does not grow forever. */
export const releaseThread = async (threadId) => {
  try {
    await checkpointer.deleteThread(threadId);
  } catch (err) {
    console.warn(`[CodeAgent] Could not release thread ${threadId}:`, err.message);
  }
};
