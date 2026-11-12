
// ai.controller.js
// HTTP handlers for Clio (copilot), project titles and Orion (coding agent).
// Handlers only validate input, call a service and write the response.
// Auth, sandbox ownership, rate limit and credits are checked by middleware.

import { generateTitle, runCopilot } from "../services/copilot.service.js";
import {
  approvePlan,
  attachSubscriber,
  getRun,
  openSseResponse,
  rejectPlan,
  sendStandaloneEvent,
  startRun,
  stopRun,
} from "../services/agentRun.service.js";

const HEARTBEAT_MS = 15_000;

const promptFrom = (body = {}) => String(body.userPrompt || body.message || "").trim();
const projectIdFrom = (body = {}) => body.projectId || body.sandboxId;

// ── Clio (copilot) over SSE ─────────────────────────────────────────────────
// Frames: `event: session` (JSON, first), `data: <text>` per token chunk,
// `event: final`, `event: done`, `event: error` (JSON). Every line of a text gets its own `data:` prefix,
// so newlines in the text can never break the SSE framing.

const writeSse = (res, event, text) => {
  if (res.writableEnded) return;
  const data = String(text).split("\n").map((line) => `data: ${line}`).join("\n");
  res.write(`${event ? `event: ${event}\n` : ""}${data}\n\n`);
};

// POST /app-agent/invoke
export const appAgentInvoke = async (req, res) => {
  const prompt = promptFrom(req.body);
  const { activeFile, activeFileContent } = req.body || {};
  const projectId = projectIdFrom(req.body);

  openSseResponse(res);
  if (!prompt || !projectId || !req.body?.sandboxId) {
    writeSse(res, "error", JSON.stringify({ message: "message, projectId and sandboxId are required", code: "VALIDATION_ERROR" }));
    return res.end();
  }

  const heartbeat = setInterval(() => !res.writableEnded && res.write(": heartbeat\n\n"), HEARTBEAT_MS);
  try {
    const answer = await runCopilot({
      user: req.user,
      authToken: req.authToken,
      projectId,
      sandboxId: req.body.sandboxId,
      prompt,
      sessionId: req.body.sessionId,
      activeFile: activeFile && activeFile !== "none" ? activeFile : "",
      activeFileContent,
      onSession: (session) => writeSse(res, "session", JSON.stringify(session)),
      onText: (text) => writeSse(res, null, text),
    });
    writeSse(res, "final", answer);
    writeSse(res, "done", "[DONE]");
  } catch (error) {
    console.error("[Clio] Run failed:", error.message);
    writeSse(res, "error", JSON.stringify({ message: error.message || "Clio hit an unexpected error", code: error.code || error.errorCode }));
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
};

// POST /app-agent/title
export const appAgentTitle = async (req, res, next) => {
  const prompt = promptFrom(req.body);
  if (!prompt) return res.status(400).json({ status: "error", message: "message or userPrompt is required" });
  try {
    const title = await generateTitle({ user: req.user, authToken: req.authToken, prompt });
    return res.status(200).json({ title });
  } catch (error) {
    return next(error);
  }
};

// ── Orion (coding agent) over SSE ───────────────────────────────────────────
// Runs live in agentRun.service.js; these handlers start, control and
// attach subscribers to a run.

// POST /code-agent/invoke
export const codeAgentInvoke = async (req, res) => {
  const { sandboxId, sessionId, attachments, autoApprovePlan } = req.body || {};
  const task = promptFrom(req.body);
  const projectId = projectIdFrom(req.body);

  openSseResponse(res);
  if (!task || !projectId || !sandboxId) {
    sendStandaloneEvent(res, "agent:error", { message: "message, projectId and sandboxId are required", code: "VALIDATION_ERROR" });
    return res.end();
  }

  try {
    const run = await startRun({ user: req.user, authToken: req.authToken, projectId, sandboxId, sessionId, task, attachments, autoApprovePlan });
    attachSubscriber(run, req, res, 0);
  } catch (error) {
    console.error("[Orion] Could not start run:", error.message);
    sendStandaloneEvent(res, "agent:error", { message: error.message || "Could not start Orion", code: error.code || error.errorCode || "AGENT_START_FAILED" });
    res.end();
  }
};

// GET /code-agent/stream/:projectId - re-attach after a reload or network blip
export const codeAgentStream = (req, res) => {
  const lastEventId = req.get("Last-Event-ID") ?? req.query.lastEventId;
  const run = getRun(req.user.id, req.params.projectId);
  // A finished run is only replayed to a client that was mid-stream.
  if (!run || (run.status === "finished" && lastEventId == null)) return res.status(204).end();

  openSseResponse(res);
  attachSubscriber(run, req, res, lastEventId);
};

const withRun = (handler) => (req, res) => {
  const run = getRun(req.user.id, projectIdFrom(req.body));
  if (!run) return res.status(404).json({ status: "error", code: "NO_ACTIVE_RUN", message: "No active Orion run for this project" });
  return handler(req, res, run);
};

const noPlanPending = (res) =>
  res.status(409).json({ status: "error", code: "NO_PLAN_PENDING", message: "No plan is waiting for review" });

// POST /code-agent/stop
export const codeAgentStop = withRun(async (_req, res, run) => {
  const stopped = await stopRun(run);
  return res.status(200).json({ status: "ok", message: stopped ? "Stopping the agent run" : "The run already finished" });
});

// POST /code-agent/plan-approve
export const codeAgentPlanApprove = withRun((req, res, run) =>
  approvePlan(run, req.authToken)
    ? res.status(202).json({ status: "ok", message: "Plan approved. Progress continues on the run stream." })
    : noPlanPending(res));

// POST /code-agent/plan-reject
export const codeAgentPlanReject = withRun((req, res, run) =>
  rejectPlan(run, req.body?.feedback, req.authToken)
    ? res.status(202).json({ status: "ok", message: "Re-planning. Progress continues on the run stream." })
    : noPlanPending(res));
