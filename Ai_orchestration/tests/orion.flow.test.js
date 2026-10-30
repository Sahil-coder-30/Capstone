// Offline end-to-end check of an Orion run through the SSE run service:
//   router → planner → critic → plan review (interrupt) → approve → coder →
//   tester → reviewer → finalizer → agent:done
// The model is scripted, the sandbox sidecar is a fake axios adapter, and
// the ChatMessage model is stubbed. No network, no database.
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

process.env.MISTRALAI_API_KEY ||= "offline-test-key";

const { setModelsForTesting } = await import("../src/agent/model.js");
const ChatMessage = (await import("../src/models/ChatMessage.model.js")).default;
const service = await import("../src/services/agentRun.service.js");

// ── Scripted model ──────────────────────────────────────────────────────────

class ScriptedModel extends BaseChatModel {
  constructor(script) {
    super({});
    this.script = script;
    this.calls = 0;
  }

  _llmType() {
    return "scripted";
  }

  bindTools() {
    return this;
  }

  nextChunk() {
    const item = this.script[this.calls];
    this.calls += 1;
    if (!item) throw new Error(`Scripted model ran out of responses at call ${this.calls}`);
    return new AIMessageChunk({
      content: item.content || "",
      additional_kwargs: item.reasoning ? { reasoning_content: item.reasoning } : {},
      tool_call_chunks: (item.toolCalls || []).map((tc, index) => ({
        name: tc.name,
        args: JSON.stringify(tc.args),
        id: tc.id || `call_${this.calls}_${index}`,
        index,
        type: "tool_call_chunk",
      })),
    });
  }

  async _generate() {
    const message = this.nextChunk();
    return { generations: [{ text: String(message.content), message }] };
  }

  async *_streamResponseChunks() {
    const message = this.nextChunk();
    yield new ChatGenerationChunk({ text: String(message.content), message });
  }
}

const PLAN = {
  summary: "Add a Hello component and render it in App.",
  steps: [
    {
      id: 1,
      title: "Create Hello and render it",
      action: "modify",
      description: "Create src/Hello.jsx and render it in src/App.jsx",
      acceptanceCriteria: ["Hello.jsx exports a default component", "App.jsx renders <Hello />"],
      activeFiles: ["src/Hello.jsx", "src/App.jsx"],
      riskLevel: "low",
      dependsOn: [],
    },
  ],
};

const script = [
  { content: "new_feature" },                                                   // router
  { reasoning: "Looking at the project layout first.", content: "App.jsx is the root. Add src/Hello.jsx." }, // planner inspection
  { toolCalls: [{ name: "implementation_plan", args: PLAN }] },                 // planner structured plan
  { content: "Creating Hello.jsx.", toolCalls: [{ name: "create_file", args: { files: [{ file: "src/Hello.jsx", content: "export default function Hello() { return <p>Hi</p>; }\n" }] } }] },
  { content: "STATUS: done\nSUMMARY: Created src/Hello.jsx with a default Hello component." }, // coder final
  { toolCalls: [{ name: "acceptance_review", args: { pass: true, unmet: [], notes: "Looks good." } }] }, // reviewer
  { content: "Added a Hello component.\n\n### Files\n- src/Hello.jsx" },       // finalizer report
];

// ── Fake sandbox sidecar ────────────────────────────────────────────────────

const sandboxCalls = [];
axios.defaults.adapter = async (config) => {
  const url = new URL(config.url);
  sandboxCalls.push(`${config.method} ${url.pathname}`);
  const reply = (data) => ({ data, status: 200, statusText: "OK", headers: {}, config, request: {} });

  switch (url.pathname) {
    case "/api/agent/list-files":
      return reply({ status: "ok", files: ["package.json", "src/App.jsx", "src/main.jsx"] });
    case "/api/agent/read-file": {
      const files = (url.searchParams.get("files") || "").split(",").filter(Boolean);
      return reply({
        status: "ok",
        files: files.map((file) => (file === "package.json"
          ? { file, content: JSON.stringify({ scripts: { build: "vite build" }, devDependencies: { vite: "^6.0.0" } }) }
          : { file, content: "export default function App() { return null; }\n" })),
      });
    }
    case "/api/agent/create-file": {
      const body = JSON.parse(config.data);
      return reply({ status: "ok", results: body.files.map((f) => ({ file: f.file, status: "File created successfully" })) });
    }
    case "/api/agent/exec":
      return reply({ status: "ok", success: true, stdout: "built in 1.2s", stderr: "", error: null, timedOut: false });
    case "/api/agent/vite-runtime-errors":
      return reply({ success: true, logs: "VITE ready" });
    default:
      throw new Error(`Unexpected sandbox call: ${config.method} ${url.pathname}`);
  }
};

// ── Stubbed persistence ─────────────────────────────────────────────────────

const saved = [];
ChatMessage.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
ChatMessage.create = async (doc) => {
  saved.push(doc);
  return { _id: { toString: () => `msg${saved.length}` } };
};

// ── Fake SSE subscriber ─────────────────────────────────────────────────────

const createSubscriber = () => {
  const events = [];
  let buffer = "";
  const waiters = [];
  const res = {
    writableEnded: false,
    destroyed: false,
    write(chunk) {
      buffer += chunk;
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (event) {
          events.push({ event, data: data ? JSON.parse(data) : null });
          waiters.filter((w) => w.event === event).forEach((w) => w.resolve());
        }
        idx = buffer.indexOf("\n\n");
      }
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
  const req = { on() {} };
  const waitFor = (event, timeoutMs = 15_000) =>
    events.some((e) => e.event === event)
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}. Got: ${events.map((e) => e.event).join(", ")}`)), timeoutMs);
        waiters.push({ event, resolve: () => { clearTimeout(timer); resolve(); } });
      });
  return { res, req, events, waitFor };
};

test("coding run streams, pauses for plan review, resumes and finishes honestly", async () => {
  const model = new ScriptedModel(script);
  setModelsForTesting(model, model);

  const sub = createSubscriber();
  const run = await service.startRun({
    user: { id: "user1", subscription: "pro" },
    authToken: "token",
    projectId: "proj1",
    sandboxId: "sbx-1",
    task: "Add a Hello component",
  });
  service.attachSubscriber(run, sub.req, sub.res, 0);

  await sub.waitFor("agent:plan_review");
  assert.equal(run.status, "awaiting_review");
  const review = sub.events.find((e) => e.event === "agent:plan_review").data;
  assert.equal(review.plan.steps.length, 1);
  assert.deepEqual(review.plan.steps[0].activeFiles, ["src/Hello.jsx", "src/App.jsx"]);

  const thinking = sub.events.filter((e) => e.event === "agent:thinking").map((e) => e.data.text).join("");
  assert.match(thinking, /Looking at the project layout first/, "reasoning tokens stream as thinking");
  assert.match(thinking, /App.jsx is the root/, "planner text streams as thinking, not as the answer");
  assert.equal(sub.events.filter((e) => e.event === "agent:message").length, 0, "no answer text before the run ends");

  assert.equal(service.approvePlan(run), true);
  await sub.waitFor("agent:done");

  const step = sub.events.find((e) => e.event === "agent:step").data;
  assert.equal(step.status, "done");
  assert.deepEqual(step.filesWritten, ["src/Hello.jsx"]);

  const final = sub.events.find((e) => e.event === "agent:final").data;
  assert.equal(final.outcome, "complete");
  assert.match(final.text, /Hello component/);

  const done = sub.events.find((e) => e.event === "agent:done").data;
  assert.deepEqual(done.filesTouched, ["src/Hello.jsx"]);

  assert.ok(sandboxCalls.includes("post /api/agent/exec"), "the build check ran");
  assert.equal(model.calls, script.length, "every scripted model call was used, no extra calls");
  assert.equal(saved.at(-1).role, "assistant");
  assert.match(saved.at(-1).content, /Hello component/);
  assert.equal(sub.res.writableEnded, true, "the stream closes after agent:done");
});
