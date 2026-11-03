// Offline checks for guards, tool-activity facts, the tool loop and the
// plan critic. No network, no database.
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { tool } from "@langchain/core/tools";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { combineGuards, shellGuard, writeScopeGuard } from "../src/agent/tools/guards.js";
import { analyzeToolActivity, isToolErrorOutput } from "../src/agent/core/toolActivity.js";
import { runToolLoop } from "../src/agent/core/toolLoop.js";
import { criticNode } from "../src/agent/nodes/critic.node.js";

test("shell guard blocks file commands and dev servers, allows tooling", () => {
  assert.match(shellGuard("execute_command", { command: "cat src/App.jsx" }), /WRONG TOOL/);
  assert.match(shellGuard("execute_command", { command: "npm install && grep foo src" }), /WRONG TOOL/);
  assert.match(shellGuard("execute_command", { command: "npm run dev" }), /dev server/);
  assert.equal(shellGuard("execute_command", { command: "npm install axios" }), null);
  assert.equal(shellGuard("execute_command", { command: "npx vite build" }), null);
  assert.equal(shellGuard("read_file", { files: ["a"] }), null);
});

test("write scope guard blocks writes outside the allowlist", () => {
  const guard = combineGuards(shellGuard, writeScopeGuard(["src/App.jsx"]));
  assert.match(guard("create_file", { files: [{ file: "src/Other.jsx", content: "" }] }), /SCOPE_VIOLATION/);
  assert.equal(guard("create_file", { files: [{ file: "./src/App.jsx", content: "" }] }), null);
  assert.equal(guard("read_file", { files: ["src/Other.jsx"] }), null);
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
    new ToolMessage({ tool_call_id: "b", content: JSON.stringify({ success: true, patched: "src/App.jsx" }) }),
    new ToolMessage({ tool_call_id: "c", content: JSON.stringify({ error: true, message: "Could not update files" }) }),
  ];

  const activity = analyzeToolActivity(messages);
  assert.deepEqual(activity.filesWritten.sort(), ["src/A.jsx", "src/App.jsx"]);
  assert.equal(activity.failures.length, 1);
  assert.equal(activity.failures[0].name, "update_file");
});

test("tool error detection", () => {
  assert.equal(isToolErrorOutput(JSON.stringify({ success: false, error: "oldStr not found" })), true);
  assert.equal(isToolErrorOutput(JSON.stringify({ error: true })), true);
  assert.equal(isToolErrorOutput("SCOPE_VIOLATION: x"), true);
  assert.equal(isToolErrorOutput(JSON.stringify({ status: "ok", files: [] })), false);
  assert.equal(isToolErrorOutput(JSON.stringify({ success: true, patched: "a" })), false);
});

// A model that replays a fixed list of replies.
class ReplayModel extends BaseChatModel {
  constructor(replies) {
    super({});
    this.replies = replies;
    this.calls = 0;
  }
  _llmType() {
    return "replay";
  }
  bindTools() {
    return this;
  }
  async _generate() {
    const message = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls += 1;
    return { generations: [{ text: String(message.content), message }] };
  }
}

const echoTool = () => {
  const seen = [];
  const t = tool(async ({ value }) => {
    seen.push(value);
    return JSON.stringify({ ok: true, value });
  }, { name: "echo", description: "echo", schema: z.object({ value: z.string() }) });
  return { t, seen };
};

const callReply = (name, args, id) => new AIMessage({ content: "", tool_calls: [{ id, name, args }] });

test("tool loop answers unknown tools, bad args and guard blocks with readable errors", async () => {
  const { t, seen } = echoTool();
  const model = new ReplayModel([
    callReply("made_up_tool", {}, "1"),
    callReply("echo", { value: 42 }, "2"),
    callReply("echo", { value: "blocked" }, "3"),
    new AIMessage("done"),
  ]);
  const { messages, finished } = await runToolLoop({
    model,
    tools: [t],
    system: "s",
    prompt: "p",
    maxTurns: 10,
    guard: (_name, args) => (args.value === "blocked" ? "BLOCKED by test" : null),
  });

  const results = messages.filter((m) => m._getType() === "tool").map((m) => JSON.parse(m.content).message);
  assert.equal(finished, true);
  assert.match(results[0], /Unknown tool "made_up_tool"/);
  assert.match(results[1], /Invalid call to echo/);
  assert.match(results[2], /BLOCKED by test/);
  assert.deepEqual(seen, []);
});

test("tool loop stops identical repeated calls", async () => {
  const { t, seen } = echoTool();
  const model = new ReplayModel([
    callReply("echo", { value: "a" }, "1"),
    callReply("echo", { value: "a" }, "2"),
    callReply("echo", { value: "a" }, "3"),
    new AIMessage("done"),
  ]);
  const { messages } = await runToolLoop({ model, tools: [t], system: "s", prompt: "p", maxTurns: 10 });
  assert.equal(seen.length, 2);
  assert.match(String(messages.filter((m) => m._getType() === "tool").at(-1).content), /already made this exact echo call/);
});

test("tool loop keeps all work when the turn budget runs out", async () => {
  const { t, seen } = echoTool();
  let n = 0;
  const model = new ReplayModel([]);
  model._generate = async () => {
    n += 1;
    const message = n <= 3 ? callReply("echo", { value: `v${n}` }, `c${n}`) : new AIMessage("STATUS: done\nSUMMARY: partial");
    return { generations: [{ text: "", message }] };
  };
  const { messages, finished } = await runToolLoop({ model, tools: [t], system: "s", prompt: "p", maxTurns: 3 });
  assert.equal(finished, false);
  assert.deepEqual(seen, ["v1", "v2", "v3"]);
  assert.match(String(messages.at(-1).content), /SUMMARY: partial/);
});

test("critic catches hallucinated near-miss paths and fixes risk labels", () => {
  const step = (over) => ({
    id: 1, title: "Edit app", action: "modify", description: "", acceptanceCriteria: ["x"],
    activeFiles: [], riskLevel: "low", dependsOn: [], status: "pending", ...over,
  });
  const plan = (steps) => ({ summary: "s", totalSteps: steps.length, steps });

  const bad = criticNode({ plan: plan([step({ activeFiles: ["src/App.js"] })]), existingFiles: ["src/App.jsx", "src/main.jsx"], planRevisions: 0 });
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

  const exhausted = criticNode({ plan: plan([step({ activeFiles: ["src/App.js"] })]), existingFiles: ["src/App.jsx"], planRevisions: 2 });
  assert.equal(exhausted.criticPass, true);
  assert.equal(exhausted.planWarnings.length, 1);
});
