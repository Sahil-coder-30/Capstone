// planReview.node.js
// Human-in-the-loop gate. interrupt() pauses the graph until the user
// approves or rejects the plan; the run resumes with
//   new Command({ resume: { approved: true } })
//   new Command({ resume: { approved: false, feedback: "..." } })
// On resume LangGraph re-runs this node from the top, so nothing before
// interrupt() may have side effects.

import { interrupt } from "@langchain/langgraph";

export function planReviewNode(state) {
  if (state.autoApprovePlan) {
    return { planApproved: true, planFeedback: "", currentSituation: "Plan auto-approved. Starting implementation." };
  }

  const decision = interrupt({
    type: "plan_review",
    plan: state.plan,
    taskSubType: state.taskSubType,
    warnings: state.planWarnings,
  });

  if (decision?.approved) {
    return { planApproved: true, planFeedback: "", currentSituation: "Plan approved. Starting implementation." };
  }

  const feedback = String(decision?.feedback || "").trim() || "The user asked for a different plan.";
  return {
    planApproved: false,
    planFeedback: feedback,
    plan: null,
    criticFeedback: "",
    planRevisions: 0,
    currentSituation: `Plan rejected. Revising with feedback: "${feedback.slice(0, 120)}"`,
  };
}

export const planReviewEdge = (state) => (state.planApproved ? "coder" : "planner");
