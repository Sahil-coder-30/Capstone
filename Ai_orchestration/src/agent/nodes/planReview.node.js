// planReview.node.js
// Human-in-the-loop gate. Pauses the graph with interrupt() and waits for
// the user to approve or reject the plan. The run is resumed with
//   new Command({ resume: { approved: true } })
//   new Command({ resume: { approved: false, feedback: "..." } })
//
// interrupt() re-runs this node from the top on resume, so the node does
// nothing before the interrupt call except read state.

import { interrupt } from "@langchain/langgraph";

export function planReviewNode(state) {
  if (state.autoApprovePlan) {
    return {
      planApproved: true,
      planFeedback: "",
      lastNodeInvoked: "plan_review",
      currentSituation: "Plan auto-approved. Starting implementation.",
    };
  }

  const decision = interrupt({
    type: "plan_review",
    plan: state.plan,
    taskSubType: state.taskSubType,
    warnings: state.planWarnings || [],
  });

  if (decision?.approved) {
    return {
      planApproved: true,
      planFeedback: "",
      lastNodeInvoked: "plan_review",
      taskStatus: "plan_approved",
      currentSituation: "Plan approved. Starting implementation.",
    };
  }

  const feedback = String(decision?.feedback || "").trim() || "The user asked for a different plan.";
  return {
    planApproved: false,
    planFeedback: feedback,
    plan: null,
    criticFeedback: "",
    planRevisions: 0,
    lastNodeInvoked: "plan_review",
    taskStatus: "replanning",
    currentSituation: `Plan rejected. Revising with feedback: "${feedback.slice(0, 120)}"`,
  };
}

export function planReviewEdge(state) {
  return state.planApproved ? "coder" : "planner";
}
