// finalizer.node.js — v2 (NEW)
// Post-completion node. Always runs before END.
//
// Responsibilities:
//  1. Re-scan for stray build/temp artifacts and delete them
//     (independent of Tester's cleanup — catches crashes mid-Tester)
//  2. Produce a concise diff summary of what actually changed
//  3. Set taskStatus: "complete" or "escalated"

import { executeCommand, listFiles } from "../tool.js";
import { AIMessage } from "@langchain/core/messages";

const BUILD_ARTIFACT_DIRS = ["dist", "build", ".next", "out", ".cache", ".vite", "coverage", "tmp"];

// ---------------------------------------------------------------------------
// FINALIZER NODE FUNCTION
// ---------------------------------------------------------------------------
export async function finalizerNode(state, config) {
  const {
    plan,
    escalated = false,
    retryCount = 0,
    maxRetries = 3,
    testResults,
    attemptedFixes = [],
    currentSituation: previousSituation,
  } = state;

  console.log("[FinalizerNode] Running final cleanup and summary pass");

  // ── 1. Consolidated cleanup pass (only if coding/build took place) ──────
  const hadCodingActivity = state.currentStep > 0 || state.testResults || state.buildLog;
  if (hadCodingActivity) {
    try {
      await executeCommand.invoke(
        { command: "rm -rf dist build .next out .cache .vite coverage tmp 2>/dev/null || true" },
        config
      );
    } catch (_) {}
  }

  // ── 2. Diff summary of changes ───────────────────────────────────────────
  let diffSummary = null;
  try {
    const gitStatus = await executeCommand.invoke({ command: "git status --short 2>&1 || true" }, config);
    const gitStatusRaw = typeof gitStatus === "string" ? gitStatus : JSON.stringify(gitStatus);

    if (gitStatusRaw && gitStatusRaw.trim() && !gitStatusRaw.includes("fatal")) {
      const changedLines = gitStatusRaw.split("\n").filter((l) => l.trim()).slice(0, 25);
      diffSummary = changedLines.map((l) => l.trim()).join("\n");
    }
  } catch (_) {
    diffSummary = "Unable to retrieve git status.";
  }

  // ── 3. Build outcome summary ─────────────────────────────────────────────
  const completedSteps = (plan?.steps || []).filter((s) => s.status === "done").length;
  const totalSteps = plan?.totalSteps || plan?.steps?.length || 0;
  const testPassed = testResults?.pass === true;

  let outcomeTitle = "Task complete";
  let outcomeSituation = "";

  if (escalated) {
    outcomeTitle = "Task escalated — human review required";
    outcomeSituation = `Task escalated: Could not be completed automatically after ${retryCount}/${maxRetries} debugger attempts. ${attemptedFixes.length} fix(es) were tried.\n\nChanges so far:\n${diffSummary || "No file changes."}`;
  } else if (!testPassed && totalSteps > 0) {
    outcomeTitle = `Partial completion (${completedSteps}/${totalSteps} steps done)`;
    outcomeSituation = `Partial completion: ${completedSteps} of ${totalSteps} plan steps implemented. Build/tests did not pass after all retries.\n\nChanges:\n${diffSummary || "No file changes."}`;
  } else {
    outcomeSituation = `Done. All ${totalSteps} plan step(s) implemented and verified.\n\nChanges:\n${diffSummary || "Files updated successfully."}`;
  }

  console.log(`[FinalizerNode] ${outcomeTitle}`);

  return {
    diffSummary,
    messages: [new AIMessage(outcomeSituation)],
    taskStatus: escalated ? "escalated" : "complete",
    lastNodeInvoked: "finalizer",
    currentSituation: outcomeSituation,
  };
}
