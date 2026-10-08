// debugger.node.js — v2
// Surgical bug fixer scoped to flaggedFiles (files Tester implicated).
//
// Key upgrade over v1:
//   BEFORE applying any fix, Debugger computes a SHA-256 hash of the intended patch.
//   If that hash already appears in state.attemptedFixes, it means this exact fix
//   was tried before and failed. In that case, it escalates immediately instead of
//   burning another retry on a guaranteed repeat.
//
// Debugger NEVER marks its own fix as verified — it always routes back to Tester.

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getAppModel } from "../model.js";
import { applyGuards } from "../guards.js";
import { readFile, patchFile, searchCode } from "../tool.js";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — Surgical Debugger
// ---------------------------------------------------------------------------
const DEBUGGER_SYSTEM_PROMPT = `You are Orion's Debugger — a specialist in root-cause analysis and surgical bug fixing.

=== PROTOCOL ===
1. READ the build log and error lines first — do not guess the cause from memory
2. READ each flagged file entirely before touching it
3. Identify the root cause from the actual error output
4. Apply the MINIMAL fix using patch_file — not a full rewrite
5. Do NOT mark the work as done — Tester will verify your fix

=== CONSTRAINTS ===
- You may ONLY modify files in the flaggedFiles list
- Use patch_file, not update_file (surgical, minimal diffs only)
- If the root cause is in an unlisted file, report it in your response — do not modify that file
- After patching, re-read the file to confirm the patch applied correctly

=== ESCALATION RULE ===
If you believe the fix you are about to apply has already been tried and failed, say so explicitly.
The system will handle escalation — do not attempt to fix it again yourself.`;

// ---------------------------------------------------------------------------
// Compute a stable hash for a given fix description
// Used to detect repeat fix attempts
// ---------------------------------------------------------------------------
function hashFix(description) {
  return createHash("sha256").update(description || "").digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Build scope-locked tools (only flaggedFiles writable)
function normalizePath(p) {
  return String(p || "").toLowerCase().replace(/^\.\//, "").replace(/^\//, "").trim();
}

// ---------------------------------------------------------------------------
// Build scope-locked tools (only target files writable)
// ---------------------------------------------------------------------------
function buildDebuggerTools(targetFiles) {
  const allowSet = new Set((targetFiles || []).map(normalizePath));

  const scopedPatch = { ...patchFile };
  const originalInvoke = patchFile.invoke.bind(patchFile);
  scopedPatch.invoke = async (input, config) => {
    const rawPath = input?.filePath || input?.path || input?.file || "";
    const filePath = normalizePath(rawPath);
    if (filePath && allowSet.size > 0 && !allowSet.has(filePath)) {
      console.warn(`[DebuggerNode] patchFile to "${filePath}" blocked — not in target files allowlist`);
      return {
        error: `SCOPE_VIOLATION: "${filePath}" is not in the allowed files list. Allowed files: ${[...allowSet].join(", ")}`,
      };
    }
    return originalInvoke(input, config);
  };

  return applyGuards([readFile, scopedPatch, searchCode]);
}

// ---------------------------------------------------------------------------
// DEBUGGER NODE FUNCTION
// ---------------------------------------------------------------------------
export async function debuggerNode(state, config) {
  const {
    buildLog,
    testResults,
    flaggedFiles = [],
    attemptedFixes = [],
    retryCount = 0,
    maxRetries = 3,
    plan,
    currentStep,
    messages = [],
  } = state;

  const filesForDebugger = flaggedFiles.length > 0
    ? flaggedFiles
    : (state.activeFiles && state.activeFiles.length > 0 ? state.activeFiles : []);

  // --- Build a concise context of what failed ------------------------------
  const errorSummary = (testResults?.errorLines || [])
    .slice(0, 10)
    .map((e) => `${e.file || "unknown"}:${e.line || "?"} — ${e.message}`)
    .join("\n");

  const debugPrompt = `You are fixing a build/test failure.

=== BUILD LOG (trimmed) ===
${(buildLog || "No build log available").slice(0, 3000)}

=== STRUCTURED ERRORS ===
${errorSummary || "No structured errors — check build log above"}

=== FLAGGED FILES (you may modify these) ===
${filesForDebugger.length > 0 ? filesForDebugger.map((f) => `  - ${f}`).join("\n") : "  (none — read build log above to determine root cause)"}

=== PREVIOUS FIX ATTEMPTS THIS CYCLE ===
${attemptedFixes.length > 0 ? attemptedFixes.map((f, i) => `  ${i + 1}. [${f.hash}] ${f.description}`).join("\n") : "  (none — first attempt)"}

Root-cause the failure from the build log, then apply the minimal surgical fix using patch_file.
If you cannot determine a root cause from the log, say so explicitly.`;

  // --- Run debugger agent -------------------------------------------------
  const debuggerAgent = createReactAgent({
    llm: getAppModel(),
    tools: buildDebuggerTools(filesForDebugger),
    prompt: DEBUGGER_SYSTEM_PROMPT,
  });

  let fixDescription = "";
  let newMessages = [];

  try {
    const result = await debuggerAgent.invoke(
      { messages: [...messages, { role: "user", content: debugPrompt }] },
      config
    );

    newMessages = result.messages || [];

    // Extract the AI's fix description from the last AI message
    const lastAI = [...newMessages].reverse()
      .find((m) => m._getType?.() === "ai" || m.constructor?.name === "AIMessage");
    fixDescription = String(lastAI?.content || "").slice(0, 300);
  } catch (err) {
    console.error("[DebuggerNode] Agent invocation failed:", err.message);
    fixDescription = `Agent error: ${err.message}`;
  }

  // --- Hash check: did we already try this fix? ----------------------------
  const fixHash = hashFix(fixDescription);
  const alreadyTried = attemptedFixes.some((f) => f.hash === fixHash);

  if (alreadyTried) {
    console.warn(`[DebuggerNode] Duplicate fix detected (hash ${fixHash}) — escalating`);
    return {
      escalated: true,
      retryCount: retryCount + 1,
      attemptedFixes,
      messages: newMessages,
      lastNodeInvoked: "debugger",
      taskStatus: "escalated",
      currentSituation: `Debugger: Duplicate fix detected (hash ${fixHash}). This exact fix was tried before and did not resolve the issue. Escalating to human review.`,
    };
  }

  // --- Record this fix attempt ----------------------------------------------
  const updatedAttemptedFixes = [
    ...attemptedFixes,
    { hash: fixHash, description: fixDescription, retryCount: retryCount + 1 },
  ];

  console.log(`[DebuggerNode] Fix applied (hash ${fixHash}), attempt #${retryCount + 1}`);

  return {
    retryCount: retryCount + 1,
    attemptedFixes: updatedAttemptedFixes,
    messages: newMessages,
    escalated: false,
    lastNodeInvoked: "debugger",
    taskStatus: "debugging",
    currentSituation: `Debugger: Fix applied (attempt ${retryCount + 1}/${maxRetries}). Routing back to Tester for verification.`,
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after debugger node
// ---------------------------------------------------------------------------
export function debuggerEdge(state) {
  // Escalated (duplicate fix or gave up) — go to finalizer
  if (state.escalated) return "finalizer";

  // Max retries hit — go to finalizer
  const { retryCount = 0, maxRetries = 3 } = state;
  if (retryCount >= maxRetries) return "finalizer";

  // Otherwise — back to Tester to verify the fix
  return "tester";
}
