// orion.graph.js
// Orion, the coding agent, as a LangGraph state machine.
//
//   START -> router -+-> general -> END
//                    +-> planner -+-> critic -+-> planner      (auto re-plan)
//                                 |           +-> plan_review  (pause for user)
//                                 +-> finalizer (planning failed)
//
//   plan_review -+-> planner (rejected)
//                +-> coder (approved)
//
//   coder -+-> coder (loop over plan steps)
//          +-> finalizer (no files touched)
//          +-> tester -+-> reviewer -+-> finalizer -> END
//                      |             +-> debugger -+-> tester (re-verify)
//                      +-> debugger ---------------+-> finalizer (exhausted)
//
//   Any path that runs out of retries ends in the finalizer.

import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { OrionState } from "./orion.state.js";
import { routerEdge, routerNode } from "../nodes/router.node.js";
import { generalNode } from "../nodes/general.node.js";
import { plannerEdge, plannerNode } from "../nodes/planner.node.js";
import { criticEdge, criticNode } from "../nodes/critic.node.js";
import { planReviewEdge, planReviewNode } from "../nodes/planReview.node.js";
import { coderEdge, coderNode } from "../nodes/coder.node.js";
import { testerEdge, testerNode } from "../nodes/tester.node.js";
import { reviewerEdge, reviewerNode } from "../nodes/reviewer.node.js";
import { debuggerEdge, debuggerNode } from "../nodes/debugger.node.js";
import { finalizerNode } from "../nodes/finalizer.node.js";

// Threads pause here during plan review and resume with Command({ resume }).
// In memory, so the service must run as a single replica.
const checkpointer = new MemorySaver();

const buildOrionGraph = () =>
  new StateGraph(OrionState)
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
    .addConditionalEdges("router", routerEdge, ["general", "planner"])
    .addEdge("general", END)
    .addConditionalEdges("planner", plannerEdge, ["critic", "finalizer"])
    .addConditionalEdges("critic", criticEdge, ["plan_review", "planner"])
    .addConditionalEdges("plan_review", planReviewEdge, ["coder", "planner"])
    .addConditionalEdges("coder", coderEdge, ["coder", "tester", "finalizer"])
    .addConditionalEdges("tester", testerEdge, ["reviewer", "debugger", "finalizer"])
    .addConditionalEdges("reviewer", reviewerEdge, ["finalizer", "debugger"])
    .addConditionalEdges("debugger", debuggerEdge, ["tester", "finalizer"])
    .addEdge("finalizer", END)
    .compile({ checkpointer });

let orionGraph = null;

export const getOrionGraph = () => (orionGraph ??= buildOrionGraph());

/** Drops a finished thread's checkpoints so memory does not grow forever. */
export const releaseOrionThread = async (threadId) => {
  try {
    await checkpointer.deleteThread(threadId);
  } catch (err) {
    console.warn(`[Orion] Could not release thread ${threadId}:`, err.message);
  }
};
