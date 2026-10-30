// agentRun.service.js
// Owns Orion coding-agent runs and streams them over Server-Sent Events.
//
// A run lives independently of any HTTP connection:
//   - POST /code-agent/invoke creates the run and attaches the response as a
//     subscriber. The graph keeps running if the browser disconnects.
//   - GET /code-agent/stream/:projectId re-attaches (page reload, network
//     blip). Events after Last-Event-ID are replayed; if they were trimmed
//     from the buffer, a snapshot is sent instead.
//   - Plan review pauses the graph (interrupt). Approve/reject resume the
//     same thread with Command({ resume }) and events keep flowing to the
//     same subscribers.
//
// Every SSE frame is `id: <seq>\nevent: <name>\ndata: <json>\n\n`. Data is
// always JSON so text with newlines can never break the framing.

import { Command } from "@langchain/langgraph";
import ChatMessage from "../models/ChatMessage.model.js";
import { checkAiCredit, recordAiUsage } from "./credit.service.js";
import { createAgentForModel, onRateLimitEvent, releaseThread } from "../agent/code.agent.js";
import { contentToText, isToolErrorOutput, truncate } from "../agent/agentUtils.js";

const HEARTBEAT_MS = 15_000;
const RUN_TIMEOUT_MS = 60 * 60 * 1000;      // active work per segment
const REVIEW_TIMEOUT_MS = 30 * 60 * 1000;   // waiting for plan approval
const FINISHED_RUN_TTL_MS = 2 * 60 * 1000;  // keep finished runs for late reconnects
const MAX_BUFFERED_EVENTS = 4_000;
const HISTORY_MESSAGES = 6;
const MAX_TOOL_LOGS = 400;

// Nodes whose model text is the user-facing answer. Text from every other
// node (planner, coder, debugger, ...) is shown as thinking.
const ANSWER_NODES = new Set(["general", "finalizer"]);
const INTERNAL_TAGS = ["nostream", "langsmith:nostream", "orion_internal", "tool_summary_internal"];

const NODE_STATUS = {
  router: { phase: "thinking", title: "Understanding the request" },
  general: { phase: "thinking", title: "Answering" },
  planner: { phase: "planner", title: "Inspecting the project" },
  critic: { phase: "planner", title: "Validating the plan" },
  plan_review: { phase: "plan_review", title: "Waiting for plan approval" },
  coder: { phase: "coder", title: "Writing code" },
  tester: { phase: "tester", title: "Running build checks" },
  reviewer: { phase: "reviewer", title: "Reviewing against the plan" },
  debugger: { phase: "debugger", title: "Fixing problems" },
  finalizer: { phase: "done", title: "Writing the report" },
};

/** @type {Map<string, object>} runKey -> run */
const runs = new Map();

export const runKeyFor = (userId, projectId) => `${userId}:${projectId}`;
export const getRun = (userId, projectId) => runs.get(runKeyFor(userId, projectId)) || null;

// ── SSE plumbing ────────────────────────────────────────────────────────────

const writeFrame = (res, id, event, data) => {
  if (res.writableEnded || res.destroyed) return false;
  try {
    res.write(`${id != null ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    return true;
  } catch {
    return false;
  }
};

export const openSseResponse = (res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("retry: 3000\n\n");
};

/** Sends one event to a response that is not attached to a run (early errors). */
export const sendStandaloneEvent = (res, event, data) => writeFrame(res, null, event, data);

const publish = (run, event, data) => {
  run.seq += 1;
  const frame = { id: run.seq, event, data };
  run.buffer.push(frame);
  if (run.buffer.length > MAX_BUFFERED_EVENTS) run.buffer.splice(0, run.buffer.length - MAX_BUFFERED_EVENTS);
  run.updatedAt = Date.now();
  for (const res of run.subscribers) {
    if (!writeFrame(res, frame.id, event, data)) run.subscribers.delete(res);
  }
};

const closeSubscribers = (run) => {
  for (const res of run.subscribers) {
    clearInterval(res.orionHeartbeat);
    try {
      res.end();
    } catch {
      /* already closed */
    }
  }
  run.subscribers.clear();
};

const snapshotOf = (run) => ({
  runId: run.id,
  projectId: run.projectId,
  status: run.status,
  task: run.task,
  model: run.model,
  lastStatus: run.lastStatus,
  thinking: run.thinking.slice(-20_000),
  message: run.finalText || [...run.segments.values()].join(""),
  toolLogs: run.toolLogs,
  planReview: run.status === "awaiting_review" ? run.pendingReview : null,
  steps: run.steps,
  startedAt: run.startedAt,
});

/**
 * Attaches an SSE response to a run. Replays missed events when possible,
 * otherwise sends a snapshot of the run so far.
 */
export const attachSubscriber = (run, req, res, lastEventId) => {
  const lastId = Number(lastEventId);
  const firstBuffered = run.buffer[0]?.id ?? run.seq + 1;
  const canReplay = Number.isFinite(lastId) && lastId >= firstBuffered - 1;

  if (canReplay) {
    for (const frame of run.buffer) {
      if (frame.id > lastId) writeFrame(res, frame.id, frame.event, frame.data);
    }
  } else {
    writeFrame(res, run.seq, "agent:snapshot", snapshotOf(run));
  }

  if (run.status === "finished") {
    res.end();
    return;
  }

  run.subscribers.add(res);
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return clearInterval(heartbeat);
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_MS);
  res.orionHeartbeat = heartbeat;

  req.on("close", () => {
    clearInterval(heartbeat);
    run.subscribers.delete(res);
  });
};

// ── Rate-limit notices ──────────────────────────────────────────────────────

onRateLimitEvent((event) => {
  for (const run of runs.values()) {
    if (run.status !== "running") continue;
    publish(run, "agent:status", {
      phase: "rate_limit",
      title: "Rate limit backoff",
      detail: `The AI provider is rate-limiting. Retrying in ${Math.round(event.delayMs / 1000)}s (attempt ${event.attempt}).`,
    });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const topLevelNode = (event) => {
  const ns = String(event.metadata?.langgraph_checkpoint_ns || "");
  const first = ns.split("|")[0]?.split(":")[0];
  return first || event.metadata?.langgraph_node || null;
};

const isTopLevelNodeEvent = (event) =>
  NODE_STATUS[event.name] &&
  event.metadata?.langgraph_node === event.name &&
  !String(event.metadata?.langgraph_checkpoint_ns || "").includes("|");

const isInternal = (event) =>
  (event.tags || []).some((t) => INTERNAL_TAGS.includes(t)) ||
  String(event.name || "").includes("tool_summary_internal");

/**
 * Adds text to the run's thinking stream. Text from a different model call
 * starts a new paragraph, so separate calls never run together mid-sentence.
 */
const appendThinking = (run, node, text, source) => {
  let out = text;
  if (run.thinking && run.thinkingSource && run.thinkingSource !== source && !run.thinking.endsWith("\n\n")) {
    out = `${run.thinking.endsWith("\n") ? "\n" : "\n\n"}${text}`;
  }
  run.thinkingSource = source;
  run.thinking += out;
  publish(run, "agent:thinking", { node, text: out });
};

const reasoningOf = (chunk) => {
  const direct = chunk?.additional_kwargs?.reasoning_content;
  if (typeof direct === "string" && direct) return direct;
  if (Array.isArray(chunk?.content)) {
    return chunk.content
      .filter((b) => b?.type === "reasoning")
      .map((b) => b.reasoning || b.text || "")
      .join("");
  }
  return "";
};

const preview = (value, max = 220) => {
  if (value == null) return "";
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const parseToolWriterMessage = (message) => {
  const text = String(message || "");
  const toolName = text.split(":")[0]?.trim() || "tool";
  const lower = text.toLowerCase();
  const level = /\berror\b|failed/.test(lower) ? "error" : /success|passed|finished/.test(lower) ? "success" : "info";
  return { toolName, level, message: text };
};

const addUsage = (run, output) => {
  const usage = output?.usage_metadata || output?.response_metadata?.tokenUsage || output?.response_metadata?.usage;
  if (!usage) return;
  const input = usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
  const out = usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
  run.usage.promptTokens += input;
  run.usage.completionTokens += out;
  run.usage.totalTokens += usage.total_tokens || usage.totalTokens || input + out;
};

const setStatus = (run, status) => {
  run.lastStatus = status;
  publish(run, "agent:status", status);
};

const classifyError = (error) => {
  const message = String(error?.message || "");
  if (error?.code === "INSUFFICIENT_CREDITS") return { code: error.code, message };
  if (error?.code === "MODEL_CALL_TIMEOUT") {
    return { code: "MODEL_CALL_TIMEOUT", message: "The AI model did not respond in time. Please retry." };
  }
  if (error?.code === "PERSISTENT_RATE_LIMIT" || error?.status === 429) {
    return { code: "RATE_LIMIT", message: "The AI provider is rate-limiting requests. Please wait a moment and try again." };
  }
  if (error?.status === 402 || /insufficient credits|payment required/i.test(message)) {
    return { code: "PROVIDER_CREDITS", message: "The AI provider account is out of credits." };
  }
  if (error?.code === "AI_PROVIDER_NOT_CONFIGURED") return { code: error.code, message };
  return { code: error?.code || "AGENT_ERROR", message: message || "Orion hit an unexpected error." };
};

// ── Event stream → SSE ──────────────────────────────────────────────────────

const handleGraphEvent = (run, event) => {
  const type = event.event;

  if (type === "on_chain_start" && isTopLevelNodeEvent(event)) {
    const base = NODE_STATUS[event.name];
    const stepHint = event.name === "coder" && run.steps.length
      ? ` (step ${Math.min((event.data?.input?.currentStep ?? 0) + 1, run.steps.length)} of ${run.steps.length})`
      : "";
    setStatus(run, { ...base, node: event.name, title: `${base.title}${stepHint}`, detail: run.lastStatus?.detail || "" });
    return;
  }

  if (type === "on_chain_end" && isTopLevelNodeEvent(event)) {
    const output = event.data?.output || {};
    if (output.plan?.steps) {
      run.steps = output.plan.steps.map((s) => ({ id: s.id, title: s.title, status: s.status }));
      publish(run, "agent:steps", { steps: run.steps });
    }
    if (event.name === "coder" && Array.isArray(output.stepReports)) {
      for (const report of output.stepReports) {
        publish(run, "agent:step", {
          stepId: report.stepId,
          status: report.status,
          summary: report.summary,
          filesWritten: report.filesWritten,
        });
      }
    }
    if (output.currentSituation) {
      const base = NODE_STATUS[event.name];
      setStatus(run, { ...base, node: event.name, detail: output.currentSituation });
    }
    return;
  }

  if (type === "on_chat_model_stream") {
    if (isInternal(event)) return;
    const node = topLevelNode(event);
    const chunk = event.data?.chunk;
    const reasoning = reasoningOf(chunk);
    if (reasoning) appendThinking(run, node, reasoning, `${event.run_id}:reasoning`);
    const text = contentToText(chunk?.content);
    if (!text) return;
    if (ANSWER_NODES.has(node)) {
      const segment = event.run_id;
      run.segments.set(segment, (run.segments.get(segment) || "") + text);
      publish(run, "agent:message", { segment, text });
    } else {
      appendThinking(run, node, text, `${event.run_id}:text`);
    }
    return;
  }

  if (type === "on_chat_model_end") {
    addUsage(run, event.data?.output);
    const node = topLevelNode(event);
    const segment = event.run_id;
    // Text an answer node wrote before calling a tool was narration, not
    // the answer: move it from the message to the thinking stream.
    if (ANSWER_NODES.has(node) && run.segments.has(segment) && event.data?.output?.tool_calls?.length) {
      const moved = run.segments.get(segment);
      run.segments.delete(segment);
      publish(run, "agent:message_retract", { segment });
      appendThinking(run, node, `${moved}\n`, `${segment}:moved`);
    }
    return;
  }

  if (type === "on_tool_start") {
    const toolName = event.name;
    const input = event.data?.input;
    publish(run, "agent:tool_start", { id: event.run_id, node: topLevelNode(event), toolName, input: preview(input, 400) });
    setStatus(run, { phase: "tool", node: topLevelNode(event), title: `Running ${toolName}`, detail: preview(input, 150) });
    return;
  }

  if (type === "on_tool_end") {
    const output = event.data?.output;
    const content = output?.content ?? output;
    const ok = !isToolErrorOutput(content);
    publish(run, "agent:tool_end", {
      id: event.run_id,
      node: topLevelNode(event),
      toolName: event.name,
      ok,
      output: preview(contentToText(content) || content, 300),
    });
  }
};

// ── Run lifecycle ───────────────────────────────────────────────────────────

const graphConfig = (run) => ({
  version: "v2",
  signal: run.abortController.signal,
  recursionLimit: 120,
  configurable: { thread_id: run.threadId, projectId: run.sandboxId },
  writer: (msg) => {
    const parsed = parseToolWriterMessage(msg);
    run.toolLogs.push(parsed.message);
    if (run.toolLogs.length > MAX_TOOL_LOGS) run.toolLogs.splice(0, run.toolLogs.length - MAX_TOOL_LOGS);
    publish(run, "agent:tool_log", parsed);
  },
});

const scheduleCleanup = (run) => {
  setTimeout(() => {
    if (runs.get(run.key) === run) runs.delete(run.key);
  }, FINISHED_RUN_TTL_MS).unref?.();
};

const recordUsage = async (run) => {
  if (run.usageRecorded || run.usage.totalTokens <= 0) return;
  run.usageRecorded = true;
  try {
    await recordAiUsage({
      authToken: run.authToken,
      userId: run.userId,
      company: run.model.provider,
      modelId: run.model.modelId,
      agentType: "codingAgent",
      projectId: run.projectId,
      ...run.usage,
    });
  } catch (err) {
    console.error("[AgentRun] Failed to record credit usage:", err.message);
  }
};

const saveAssistantMessage = async (run, content) => {
  try {
    const doc = await ChatMessage.create({
      projectId: run.projectId,
      userId: run.userId,
      agentType: "codingAgent",
      role: "assistant",
      content: content || "(no response)",
      toolLogs: run.toolLogs,
      tokenUsage: run.usage,
    });
    return doc._id.toString();
  } catch (err) {
    console.error("[AgentRun] Failed to save assistant message:", err.message);
    return null;
  }
};

const finishRun = async (run, { event, payload, content }) => {
  if (run.status === "finished") return;
  run.status = "finished";
  clearTimeout(run.reviewTimer);
  await recordUsage(run);
  const assistantMsgId = await saveAssistantMessage(run, content);
  if (assistantMsgId) publish(run, "agent:msg_created", { role: "assistant", id: assistantMsgId });
  publish(run, event, { ...payload, assistantMsgId });
  closeSubscribers(run);
  await releaseThread(run.threadId);
  scheduleCleanup(run);
};

const finishStopped = (run, reason = "Stopped by user.") => {
  const partial = run.finalText || [...run.segments.values()].join("");
  const content = partial ? `${partial}\n\n_${reason}_` : reason;
  return finishRun(run, {
    event: "agent:stopped",
    payload: { message: reason, text: content },
    content,
  });
};

/** Runs the graph until it ends or pauses at an interrupt. */
const executeSegment = async (run, input) => {
  run.status = "running";
  run.abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    run.abortController.abort();
  }, RUN_TIMEOUT_MS);

  const config = graphConfig(run);
  try {
    const stream = run.agent.streamEvents(input, config);
    for await (const event of stream) {
      handleGraphEvent(run, event);
    }

    const snapshot = await run.agent.getState({ configurable: config.configurable });
    const interrupt = snapshot.tasks?.flatMap((t) => t.interrupts || []).find(Boolean);
    if (interrupt?.value?.type === "plan_review") {
      run.status = "awaiting_review";
      run.pendingReview = {
        plan: interrupt.value.plan,
        taskSubType: interrupt.value.taskSubType,
        warnings: interrupt.value.warnings || [],
        threadId: run.threadId,
      };
      run.steps = (interrupt.value.plan?.steps || []).map((s) => ({ id: s.id, title: s.title, status: s.status }));
      publish(run, "agent:plan_review", run.pendingReview);
      setStatus(run, {
        phase: "plan_review",
        node: "plan_review",
        title: "Plan ready for review",
        detail: `${interrupt.value.plan?.totalSteps || 0} steps. Approve or ask for changes.`,
        status: "paused",
      });
      run.reviewTimer = setTimeout(() => {
        if (run.status === "awaiting_review") finishStopped(run, "Plan review expired after 30 minutes.");
      }, REVIEW_TIMEOUT_MS);
      run.reviewTimer.unref?.();
      return;
    }

    const values = snapshot.values || {};
    run.finalText = values.finalAnswer || [...run.segments.values()].join("") || "Task finished.";
    publish(run, "agent:final", { text: run.finalText, outcome: values.outcome || "complete" });
    setStatus(run, {
      phase: "done",
      title: values.outcome === "failed" ? "Could not complete" : values.outcome === "partial" ? "Partly done" : "Done",
      detail: values.currentSituation || "",
      status: values.outcome === "failed" ? "error" : "success",
    });
    await finishRun(run, {
      event: "agent:done",
      payload: { outcome: values.outcome || "complete", filesTouched: values.filesTouched || [] },
      content: run.finalText,
    });
  } catch (error) {
    if (run.abortController.signal.aborted && !timedOut) {
      await finishStopped(run);
      return;
    }
    const { code, message } = timedOut
      ? { code: "AGENT_TIMEOUT", message: "Orion timed out after 60 minutes of work." }
      : classifyError(error);
    console.error(`[AgentRun] ${run.key} failed (${code}):`, error?.message);
    await finishRun(run, {
      event: "agent:error",
      payload: { message, code },
      content: `Error occurred during execution: ${message}`,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const formatAttachments = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  return attachments
    .slice(0, 5)
    .map((att) => `=== ATTACHED FILE: ${att?.path || "unknown"} ===\n${truncate(att?.content || "", 12_000)}`)
    .join("\n\n");
};

/**
 * Validates credits, persists the user message and starts a new run in the
 * background. Throws coded errors the controller turns into SSE errors.
 */
export const startRun = async ({ user, authToken, projectId, sandboxId, task, attachments, autoApprovePlan }) => {
  const key = runKeyFor(user.id, projectId);
  const existing = runs.get(key);
  if (existing && existing.status !== "finished") {
    const error = new Error("Orion is already working on this project. Wait for it to finish or stop it first.");
    error.code = "AGENT_RUN_IN_PROGRESS";
    throw error;
  }

  const { agent, model } = createAgentForModel();

  const isMeteredPlan = user.subscription === "pro" || user.subscription === "max";
  if (!isMeteredPlan) {
    const credit = await checkAiCredit({ authToken, company: model.provider });
    if (!credit?.hasCredit) {
      const error = new Error("Insufficient AI credits. Free users receive 20 credits per model company. Please upgrade to Pro to continue.");
      error.code = "INSUFFICIENT_CREDITS";
      throw error;
    }
  }

  // History is loaded before saving the new message so the current task is
  // not duplicated in the context.
  const history = await ChatMessage.find({
    projectId,
    agentType: "codingAgent",
    deletionStatus: { $ne: "trash" },
    $or: [{ userId: user.id }, { userId: { $exists: false } }],
  })
    .sort({ timestamp: -1 })
    .limit(HISTORY_MESSAGES)
    .lean();
  history.reverse();

  const userMsg = await ChatMessage.create({
    projectId,
    userId: user.id,
    agentType: "codingAgent",
    role: "user",
    content: task,
  });

  const attachmentText = formatAttachments(attachments);
  const run = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    key,
    userId: user.id,
    projectId,
    sandboxId,
    authToken,
    task,
    model,
    agent,
    threadId: `${sandboxId}:${Date.now()}`,
    status: "starting",
    abortController: new AbortController(),
    subscribers: new Set(),
    buffer: [],
    seq: 0,
    thinking: "",
    segments: new Map(),
    finalText: "",
    toolLogs: [],
    steps: [],
    lastStatus: null,
    pendingReview: null,
    reviewTimer: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    usageRecorded: false,
    startedAt: new Date().toISOString(),
    updatedAt: Date.now(),
  };
  runs.set(key, run);

  publish(run, "agent:run", { runId: run.id, threadId: run.threadId, projectId });
  publish(run, "agent:msg_created", { role: "user", id: userMsg._id.toString() });
  publish(run, "agent:model", { ...model, fallback: false });
  setStatus(run, { phase: "queued", title: "Starting Orion", detail: `${model.label} is reading your request` });

  const input = {
    task: attachmentText ? `${task}\n\n${attachmentText}` : task,
    messages: history.map((h) => ({ role: h.role, content: truncate(h.content, 4_000) })),
    autoApprovePlan: Boolean(autoApprovePlan),
  };

  // Fire and forget: the run reports through events, not through this promise.
  executeSegment(run, input).catch((err) => console.error("[AgentRun] Unhandled segment error:", err));
  return run;
};

export const approvePlan = (run) => {
  if (run.status !== "awaiting_review") return false;
  clearTimeout(run.reviewTimer);
  run.pendingReview = null;
  setStatus(run, { phase: "coder", title: "Plan approved", detail: "Starting implementation", status: "running" });
  executeSegment(run, new Command({ resume: { approved: true } })).catch((err) =>
    console.error("[AgentRun] Unhandled resume error:", err),
  );
  return true;
};

export const rejectPlan = (run, feedback) => {
  if (run.status !== "awaiting_review") return false;
  clearTimeout(run.reviewTimer);
  run.pendingReview = null;
  setStatus(run, {
    phase: "planner",
    title: "Revising the plan",
    detail: feedback ? `Feedback: "${truncate(feedback, 120)}"` : "Re-planning",
    status: "running",
  });
  executeSegment(run, new Command({ resume: { approved: false, feedback: String(feedback || "") } })).catch((err) =>
    console.error("[AgentRun] Unhandled resume error:", err),
  );
  return true;
};

export const stopRun = async (run) => {
  if (run.status === "running") {
    setStatus(run, { phase: "stop", title: "Stopping Orion", detail: "Cancelling the current step" });
    run.abortController.abort();
    return true;
  }
  if (run.status === "awaiting_review" || run.status === "starting") {
    await finishStopped(run);
    return true;
  }
  return false;
};
