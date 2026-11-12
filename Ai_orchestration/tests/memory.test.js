// Offline checks for the memory layer: what goes into a turn's background
// notes, what one memory job writes, and how jobs are queued and billed.
// Models, the database and Payments are stubbed.

import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import mongoose from "mongoose";

process.env.NVIDIA_API_KEY ||= "offline-test-key";

const { setModelsForTesting } = await import("../src/agent/llm/model.js");
const { CHAT_STORES } = await import("../src/models/chatStores.js");
const memory = await import("../src/services/memory.service.js");

const orion = CHAT_STORES.codingAgent;

// A fast model that returns a fixed memory update and reports token usage.
const modelCalls = [];
let reply = { sessionSummary: "- Built login", title: "Login Page Work", projectNotes: "- Uses React Router" };
const fakeFast = {
  withStructuredOutput: () => ({
    invoke: async (messages, config) => {
      modelCalls.push(messages);
      config.callbacks[0].handleLLMEnd({ generations: [[{ message: { usage_metadata: { input_tokens: 900, output_tokens: 100, total_tokens: 1000 } } }]] });
      if (reply instanceof Error) throw reply;
      return reply;
    },
  }),
};
setModelsForTesting(fakeFast, fakeFast);

const usagePosts = [];
axios.defaults.adapter = async (config) => {
  usagePosts.push({ url: config.url, body: JSON.parse(config.data) });
  return { data: { status: "success" }, status: 200, headers: {}, config };
};

const chain = (rows) => {
  const c = { sort: () => c, limit: () => c, select: () => c, lean: async () => rows };
  return c;
};

test("background notes hold project notes and other chats, and the chat summary only when turns fell out of the window", async () => {
  const session = { _id: new mongoose.Types.ObjectId(), userId: "u1", projectId: "p1", summary: "- earlier work on auth" };
  const sessionFilters = [];
  orion.Memory.findOne = async (filter) => {
    assert.deepEqual(filter, { userId: "u1", projectId: "p1" });
    return { content: "- Uses Tailwind" };
  };
  orion.Session.find = (filter) => {
    sessionFilters.push(filter);
    return chain([
      { title: "Navbar", summary: "- Added a navbar\n- Sticky on scroll", lastMessageAt: new Date("2026-11-10T10:00:00Z") },
      { title: "Footer", summary: "x".repeat(2_000), lastMessageAt: new Date("2026-11-09T10:00:00Z") },
    ]);
  };

  orion.Message.countDocuments = async () => 4;
  const short = await memory.buildMemory(orion, session, { historyWindow: 10 });
  assert.match(short, /Project notes:\n- Uses Tailwind/);
  assert.match(short, /- Navbar \(2026-11-10\): - Added a navbar - Sticky on scroll/);
  assert.ok(!short.includes("x".repeat(500)), "each earlier chat is capped");
  assert.ok(!short.includes("This chat so far"), "no chat summary while the window still holds every turn");
  assert.equal(sessionFilters[0].userId, "u1");
  assert.deepEqual(sessionFilters[0]._id, { $ne: session._id }, "the current chat is not its own memory");

  orion.Message.countDocuments = async () => 25;
  const long = await memory.buildMemory(orion, session, { historyWindow: 10 });
  assert.match(long, /This chat so far .*\n- earlier work on auth/);

  orion.Memory.findOne = async () => null;
  orion.Session.find = () => chain([]);
  assert.equal(await memory.buildMemory(orion, { ...session, summary: "" }, { historyWindow: 10 }), "");
});

test("a memory job folds new turns into summary, title and notes, and bills the platform", async () => {
  const sessionId = new mongoose.Types.ObjectId();
  const t1 = new Date("2026-11-12T10:00:00Z");
  const t2 = new Date("2026-11-12T10:05:00Z");
  orion.Session.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: String(sessionId), userId: "u1", projectId: "p1" });
    return { _id: sessionId, userId: "u1", projectId: "p1", summary: "", summaryThrough: null };
  };
  let turnFilter;
  orion.Message.find = (filter) => {
    turnFilter = filter;
    return chain([
      { role: "user", content: "add a login page", timestamp: t1 },
      { role: "assistant", content: "Error: model timed out", timestamp: t1 }, // legacy error row
      { role: "assistant", content: "<think>plan</think>Added src/Login.jsx.", timestamp: t2 },
    ]);
  };
  orion.Memory.findOne = async () => ({ content: "- old note", version: 3 });
  const sessionWrites = [];
  const notesWrites = [];
  orion.Session.updateOne = async (...args) => sessionWrites.push(args);
  orion.Memory.updateOne = async (...args) => notesWrites.push(args);

  modelCalls.length = 0;
  usagePosts.length = 0;
  await memory.updateMemory({ agentType: "codingAgent", userId: "u1", projectId: "p1", sessionId: String(sessionId), authToken: "tok" });

  assert.equal(turnFilter.userId, "u1");
  assert.deepEqual(turnFilter.status, { $ne: "error" });
  assert.equal(turnFilter.timestamp, undefined, "a first job reads the whole chat");

  const prompt = modelCalls[0].map((m) => String(m.content)).join("\n");
  assert.match(prompt, /OLD PROJECT NOTES:\n- old note/);
  assert.match(prompt, /Assistant: Added src\/Login.jsx\./);
  assert.ok(!prompt.includes("timed out"), "error replies are not memory");
  assert.ok(!prompt.includes("<think>"), "thinking is not memory");

  const [filter, [{ $set: set }]] = sessionWrites[0];
  assert.deepEqual(filter, { _id: sessionId, userId: "u1", summaryThrough: null });
  assert.deepEqual(set.summary, { $literal: "- Built login" });
  assert.deepEqual(set.summaryThrough, { $literal: t2 });
  assert.deepEqual(set.title, { $cond: ["$titleLocked", "$title", { $literal: "Login Page Work" }] }, "a renamed chat keeps its name");

  assert.deepEqual(notesWrites[0][0], { userId: "u1", projectId: "p1", version: 3 }, "notes are written only if nobody changed them meanwhile");
  assert.deepEqual(notesWrites[0][1], { $set: { content: "- Uses React Router" }, $inc: { version: 1 } });

  assert.equal(usagePosts.length, 1);
  const usage = usagePosts[0].body;
  assert.equal(usage.agentType, "memory");
  assert.equal(usage.userId, "u1");
  assert.equal(usage.projectId, "p1");
  assert.equal(usage.chatId, String(sessionId));
  assert.equal(usage.requestId, `memory:codingAgent:${sessionId}:${t2.getTime()}`);
  assert.equal(usage.totalTokens, 1000);
});

test("a later job reads only new turns and keeps the title", async () => {
  const sessionId = new mongoose.Types.ObjectId();
  const through = new Date("2026-11-12T10:05:00Z");
  orion.Session.findOne = async () => ({ _id: sessionId, userId: "u1", projectId: "p1", summary: "- Built login", summaryThrough: through });
  let turnFilter;
  orion.Message.find = (filter) => {
    turnFilter = filter;
    return chain([]);
  };
  modelCalls.length = 0;
  await memory.updateMemory({ agentType: "codingAgent", userId: "u1", projectId: "p1", sessionId: String(sessionId) });
  assert.deepEqual(turnFilter.timestamp, { $gt: through });
  assert.equal(modelCalls.length, 0, "no new turns, no model call");
});

test("jobs for one project run one at a time and a failure never escapes", async () => {
  const order = [];
  orion.Session.findOne = async (filter) => {
    order.push(`start ${filter._id}`);
    await new Promise((r) => setTimeout(r, 5));
    order.push(`end ${filter._id}`);
    return null;
  };
  memory.scheduleMemoryUpdate({ agentType: "codingAgent", userId: "u1", projectId: "p1", sessionId: "a" });
  memory.scheduleMemoryUpdate({ agentType: "codingAgent", userId: "u1", projectId: "p1", sessionId: "b" });
  await memory.waitForMemoryJobs();
  assert.deepEqual(order, ["start a", "end a", "start b", "end b"]);

  orion.Session.findOne = async () => {
    throw new Error("database down");
  };
  await memory.scheduleMemoryUpdate({ agentType: "codingAgent", userId: "u1", projectId: "p1", sessionId: "c" });
  await memory.waitForMemoryJobs();
});
