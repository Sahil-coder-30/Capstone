// coder.node.js — v2
// Software Engineer specialist. Implements ONE plan step at a time.
// After each step it performs a self-review against that step's
// acceptanceCriteria before handing to Tester.
//
// Tool write access is scoped to state.activeFiles — any write attempt
// outside that list is blocked at the guard layer.

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getAppModel } from "../model.js";
import { applyGuards } from "../guards.js";
import {
  listFiles,
  readFile,
  createFile,
  updateFile,
  patchFile,
  deleteFile,
  executeCommand,
  getViteRuntimeErrors,
  searchCode,
  searchInternetTool,
} from "../tool.js";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — Full-Stack Software Engineer
// ---------------------------------------------------------------------------
const CODER_SYSTEM_PROMPT = `You are Orion's Coder — a senior full-stack engineer. You implement EXACTLY ONE assigned task step.

=== EXECUTION PROTOCOL ===
1. READ the step's acceptance criteria first — they define what "done" means
2. READ all files in activeFiles before writing anything
3. Use search_code to find existing patterns before creating new ones
4. Implement the step. Use patch_file for changes < 20 lines, update_file for full rewrites
5. After implementing: re-read each modified file to self-verify against the acceptance criteria
6. If a criterion is not met, fix it before stopping

=== TOOL RULES ===
- Use execute_command ONLY for: npm install <pkg>, mkdir -p <dir>, git commands
- NEVER use: cat, head, tail, echo, touch, cp, mv, sed, awk, grep — use read_file instead
- Use search_internet only if you need library documentation you are unfamiliar with
- The Vite dev server runs on port 5173 — never run "npm run dev" yourself

=== CODING STANDARDS ===
- Match existing code style exactly (indentation, quote style, naming)
- No debug console.log statements
- No placeholder TODO comments unless the step explicitly requires them
- Import paths must be exact — check casing on Linux systems`;

function normalizePath(p) {
  return String(p || "").toLowerCase().replace(/^\.\//, "").replace(/^\//, "").trim();
}

function extractFilePaths(toolName, input) {
  if (!input || typeof input !== "object") return [];
  if (Array.isArray(input.files)) {
    return input.files.map((f) => (typeof f === "string" ? f : f?.file)).filter(Boolean);
  }
  if (Array.isArray(input.updates)) {
    return input.updates.map((u) => u?.file).filter(Boolean);
  }
  if (input.filePath) return [input.filePath];
  if (input.path) return [input.path];
  if (input.file) return [input.file];
  if (input.filename) return [input.filename];
  return [];
}

// ---------------------------------------------------------------------------
// Build a per-step file scope guard
// Wraps write tools to reject files outside activeFiles
// ---------------------------------------------------------------------------
function buildScopedTools(activeFiles) {
  const allowSet = new Set((activeFiles || []).map(normalizePath));

  const scopeCheck = (toolInstance) => {
    const original = toolInstance.invoke.bind(toolInstance);
    const wrapped = { ...toolInstance };
    wrapped.invoke = async (input, config) => {
      if (allowSet.size > 0) {
        const extracted = extractFilePaths(toolInstance.name, input).map(normalizePath);
        const violations = extracted.filter((p) => p && !allowSet.has(p));
        if (violations.length > 0) {
          console.warn(`[CoderNode] Write to ${violations.join(", ")} blocked — not in activeFiles allowlist`);
          return {
            error: `SCOPE_VIOLATION: ${violations.join(", ")} is not in the active files allowlist for this step. Only write to allowed files: ${[...allowSet].join(", ")}`,
          };
        }
      }
      return original(input, config);
    };
    return wrapped;
  };

  const writeTools = [createFile, updateFile, patchFile, deleteFile];
  const readTools = [listFiles, readFile, searchCode, searchInternetTool, executeCommand, getViteRuntimeErrors];

  return applyGuards([
    ...readTools,
    ...writeTools.map(scopeCheck),
  ]);
}

// ---------------------------------------------------------------------------
// CODER NODE FUNCTION
// ---------------------------------------------------------------------------
export async function coderNode(state, config) {
  const plan = state.plan;
  const currentStep = state.currentStep || 0;

  if (!plan?.steps?.length) {
    return {
      currentSituation: "Coder: No plan found. Routing back to Planner.",
      lastNodeInvoked: "coder",
      taskStatus: "error",
    };
  }

  // All steps done
  if (currentStep >= plan.steps.length) {
    console.log("[CoderNode] All plan steps implemented");
    return {
      currentSituation: "Coder: All plan steps implemented. Handing to Tester for final verification.",
      lastNodeInvoked: "coder",
      taskStatus: "coding_complete",
    };
  }

  const step = plan.steps[currentStep];

  // Update step status in plan
  const updatedPlan = {
    ...plan,
    steps: plan.steps.map((s, i) => ({
      ...s,
      status: i === currentStep ? "in_progress" : s.status,
    })),
  };

  const planContext = plan.steps
    .map((s, i) => {
      const marker = i === currentStep ? "→ ACTIVE" : s.status === "done" ? "✓ done" : "  pending";
      return `${marker}  Step ${s.id}: ${s.title}`;
    })
    .join("\n");

  const taskPrompt = `You are implementing Step ${step.id}/${plan.totalSteps}: "${step.title}"

Description: ${step.description}

Acceptance criteria (you must satisfy ALL of these before finishing):
${(step.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

Files you are allowed to write to (activeFiles):
${(step.activeFiles || []).length > 0 ? step.activeFiles.map((f) => `  - ${f}`).join("\n") : "  (not specified — read existing files to determine scope)"}

Full plan context (for reference only):
${planContext}

Implement this step now. Read files first, then implement, then self-verify against the criteria above.`;

  const coderAgent = createReactAgent({
    llm: getAppModel(),
    tools: buildScopedTools(step.activeFiles),
    prompt: CODER_SYSTEM_PROMPT,
  });

  try {
    const result = await coderAgent.invoke(
      { messages: [...(state.messages || []), { role: "user", content: taskPrompt }] },
      config
    );

    // Mark step done in plan
    const completedPlan = {
      ...plan,
      steps: plan.steps.map((s, i) => ({
        ...s,
        status: i === currentStep ? "done" : s.status,
      })),
    };

    const nextStep = currentStep + 1;
    const remaining = plan.steps.length - nextStep;

    console.log(`[CoderNode] Step ${step.id} complete (${remaining} remaining)`);

    return {
      plan: completedPlan,
      currentStep: nextStep,
      activeFiles: nextStep < plan.steps.length ? (plan.steps[nextStep]?.activeFiles || []) : [],
      messages: result.messages || [],
      lastNodeInvoked: "coder",
      taskStatus: remaining > 0 ? "coding" : "coding_complete",
      currentSituation: `Coder: Step ${step.id} done — "${step.title}". ${remaining > 0 ? `${remaining} step(s) remaining.` : "All steps implemented. Handing to Tester."}`,
    };
  } catch (err) {
    console.error(`[CoderNode] Step ${step.id} failed:`, err.message);

    const failedPlan = {
      ...plan,
      steps: plan.steps.map((s, i) => ({
        ...s,
        status: i === currentStep ? "failed" : s.status,
      })),
    };

    return {
      plan: failedPlan,
      currentStep: currentStep + 1, // skip failed step, continue
      lastNodeInvoked: "coder",
      taskStatus: "coding",
      currentSituation: `Coder: Step ${step.id} failed — "${err.message}". Skipping to next step.`,
    };
  }
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after coder node
// ---------------------------------------------------------------------------
export function coderEdge(state) {
  const plan = state.plan;
  const currentStep = state.currentStep || 0;

  // More steps remain — loop coder
  if (plan?.steps && currentStep < plan.steps.length) return "coder";

  // All steps done — go to tester
  return "tester";
}
