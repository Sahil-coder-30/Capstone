// Offline checks for Orion's guard, grounding and plan-validation helpers.
// No network, no database, no model calls.
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { tool } from "@langchain/core/tools";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

import { applyGuards, scopeWriteTools } from "../src/agent/guards.js";
import { analyzeToolActivity, isToolErrorOutput } from "../src/agent/agentUtils.js";
import { criticNode } from "../src/agent/nodes/critic.node.js";
import * as realTools from "../src/agent/tool.js";

// ToolNode calls tools with a ToolCall object, so the tests do the same.
const call = (t, args, id = "t1") => t.invoke({ name: t.name, args, id, type: "tool_call" });

const makeFakeExec = () => {
  const seen = [];
  const t = tool(async ({ command }) => {
    seen.push(command);
    return JSON.stringify({ success: true, stdout: command });
  }, { name: "execute_command", description: "exec", schema: z.object({ command: z.string() }) });
  return { t, seen };
};

test("shell guard blocks file-reading commands and dev servers", async () => {
  const { t, seen } = makeFakeExec();
  const [guarded] = applyGuards([t]);

  assert.match(String((await call(guarded, { command: "cat src/App.jsx" })).content), /WRONG TOOL/);
  assert.match(String((await call(guarded, { command: "npm install && grep foo src" })).content), /WRONG TOOL/);
  assert.match(String((await call(guarded, { command: "npm run dev" })).content), /dev server/);
  assert.equal(seen.length, 0);

  await call(guarded, { command: "npm install axios" });
  await call(guarded, { command: "npx vite build" });
  await call(guarded, { command: "npx vitest run" });
  assert.deepEqual(seen, ["npm install axios", "npx vite build", "npx vitest run"]);
});

test("guards keep full tool descriptions and never mutate shared tools", () => {
  const patchBefore = realTools.patchFile.description;
  const [patch, exec] = applyGuards([realTools.patchFile, realTools.executeCommand]);
  assert.equal(patch, realTools.patchFile);
  assert.equal(realTools.patchFile.description, patchBefore);
  assert.equal(exec.description, realTools.executeCommand.description);
  assert.ok(exec.description.length > 100);
});

test("scope guard blocks writes outside the allowlist", async () => {
  const create = tool(async ({ files }) => JSON.stringify({ status: "ok", results: files.map((f) => ({ file: f.file })) }), {
    name: "create_file",
    description: "create",
    schema: z.object({ files: z.array(z.object({ file: z.string(), content: z.string() })) }),
  });
  const [scoped] = scopeWriteTools([create], ["src/App.jsx"]);

  const outside = await call(scoped, { files: [{ file: "src/Other.jsx", content: "" }] });
  assert.match(String(outside.content), /SCOPE_VIOLATION/);

  const inside = await call(scoped, { files: [{ file: "./src/App.jsx", content: "" }] });
  assert.doesNotMatch(String(inside.content), /SCOPE_VIOLATION/);
});

test("tool activity comes from tool results, including per-file batch errors", () => {
  const messages = [
    new AIMessage({
      content: "",
      tool_calls: [
        { id: "a", name: "create_file", args: { files: [{ file: "src/A.jsx", content: "" }, { file: "../bad.js", content: "" }] } },
        { id: "b", name: "patch_file", args: { filePath: "src/App.jsx", oldStr: "x", newStr: "y" } },
        { id: "c", name: "update_file", args: { updates: [{ file: "src/B.jsx", content: "" }] } },
      ],
    }),
    new ToolMessage({
      tool_call_id: "a",
      content: JSON.stringify({ status: "ok", results: [{ file: "src/A.jsx", status: "ok" }, { file: "../bad.js", error: "Access denied" }] }),
    }),
    new ToolMessage({ tool_call_id: "b", content: "Patched src/App.jsx successfully" }),
    new ToolMessage({ tool_call_id: "c", content: JSON.stringify({ error: true, message: "Failed to update file(s)" }) }),
  ];

  const activity = analyzeToolActivity(messages);
  assert.deepEqual([...activity.filesWritten].sort(), ["src/A.jsx", "src/App.jsx"]);
  assert.equal(activity.failures.length, 1);
  assert.equal(activity.failures[0].name, "update_file");
});

test("tool error detection", () => {
  assert.equal(isToolErrorOutput(JSON.stringify({ success: false, error: "oldStr not found" })), true);
  assert.equal(isToolErrorOutput(JSON.stringify({ error: true })), true);
  assert.equal(isToolErrorOutput("SCOPE_VIOLATION: x"), true);
  assert.equal(isToolErrorOutput(JSON.stringify({ status: "ok", files: [] })), false);
  assert.equal(isToolErrorOutput("Patched src/App.jsx successfully"), false);
});

test("critic catches hallucinated near-miss paths and fixes risk labels", () => {
  const step = (over) => ({
    id: 1, title: "Edit app", action: "modify", description: "", acceptanceCriteria: ["x"],
    activeFiles: [], riskLevel: "low", dependsOn: [], status: "pending", ...over,
  });
  const plan = (steps) => ({ summary: "s", totalSteps: steps.length, steps });

  const bad = criticNode({
    plan: plan([step({ activeFiles: ["src/App.js"] })]),
    existingFiles: ["src/App.jsx", "src/main.jsx"],
    planRevisions: 0,
  });
  assert.equal(bad.criticPass, false);
  assert.match(bad.criticFeedback, /Did you mean "src\/App.jsx"/);

  const good = criticNode({
    plan: plan([
      step({ activeFiles: ["src/App.jsx"] }),
      step({ id: 2, title: "Login", action: "create", activeFiles: ["src/auth/Login.jsx"], dependsOn: [1] }),
    ]),
    existingFiles: ["src/App.jsx"],
    planRevisions: 0,
  });
  assert.equal(good.criticPass, true);
  assert.equal(good.plan.steps[1].riskLevel, "high");

  const exhausted = criticNode({
    plan: plan([step({ activeFiles: ["src/App.js"] })]),
    existingFiles: ["src/App.jsx"],
    planRevisions: 2,
  });
  assert.equal(exhausted.criticPass, true);
  assert.equal(exhausted.planWarnings.length, 1);
});
