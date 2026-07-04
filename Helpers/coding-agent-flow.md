# Coding Agent Flow

This document explains how the Orion coding agent works in this project, why it can get stuck, and how the reload/stop recovery flow is implemented.

## 1. Main Pieces

The coding agent is split across three areas:

- Frontend chat UI: `Frontend/src/features/coding-agent/components/AIChat.jsx`
- Frontend socket/state hook: `Frontend/src/features/coding-agent/Hooks/codingAgent.hooks.js`
- Backend Socket.io orchestrator: `Ai_orchestration/src/socket/socket.js`
- Backend LangGraph agent/model setup: `Ai_orchestration/src/agent/code.agent.js`
- Backend workspace tools: `Ai_orchestration/src/agent/tool.js`

The frontend does not edit files directly. It sends a user request to the AI orchestration service over Socket.io. The backend LangGraph agent chooses tools like `read_file`, `patch_file`, `update_file`, and `execute_command`. Those tools call the sandbox service, which performs the actual workspace operations.

## 2. Normal Request Flow

1. User types a request in the Orion chat box.
2. `AIChat.jsx` calls `sendMessage(...)` from `useCodingAgent`.
3. `codingAgent.hooks.js` opens a Socket.io connection to `/api/ai/socket.io`.
4. On socket connect, the frontend emits:

```js
socket.emit("agent:invoke", {
  message,
  projectId,
  sandboxId,
  modelName,
  attachments
});
```

5. `socket.js` authenticates the socket from the `token` cookie.
6. The backend creates an active run key:

```js
const runKey = `${userId}:${projectId}`;
```

7. The backend saves the user message to MongoDB.
8. The backend loads recent coding-agent chat history.
9. The backend creates/selects a LangGraph agent through `createAgentForModel(modelName)`.
10. LangGraph calls the selected model.
11. The model either returns a final response or tool calls.
12. Tool calls are executed by functions from `tool.js`.
13. Tool progress is streamed back to the frontend.
14. The final assistant text and tool logs are saved to MongoDB.
15. The frontend receives `agent:done`, refreshes the workspace file list, and unlocks the chat box.

## 3. Important Socket Events

Frontend to backend:

- `agent:invoke`: start a new coding-agent run.
- `agent:subscribe`: ask whether a run is already active for this project.
- `agent:stop`: cancel the active run.

Backend to frontend:

- `agent:active_run`: tells the frontend whether a run already exists.
- `agent:model`: selected model information.
- `agent:status`: current phase/status card information.
- `agent:thinking`: streamed assistant text.
- `agent:tool_start`: tool execution started.
- `agent:tool_log`: tool progress from the tool writer.
- `agent:tool_end`: tool execution finished.
- `agent:done`: run completed.
- `agent:stopped`: run was stopped by the user.
- `agent:error`: run failed.

## 4. Active Run Registry

The backend keeps active runs in memory in `activeAgentRuns`.

Each run stores:

```js
{
  abortController,
  sockets,
  projectId,
  sandboxId,
  userId,
  message,
  assistantText,
  toolLogs,
  status,
  model,
  startedAt,
  updatedAt
}
```

The important field is `sockets`. Before the fix, a run effectively belonged to one socket. If the user reloaded the page, the original socket disconnected and the frontend forgot the run. Now a run can have multiple socket subscribers. A reloaded page can subscribe to the existing run and regain the live UI state.

## 5. Reload Recovery Flow

On page load, after chat history is loaded, `codingAgent.hooks.js` opens a lightweight recovery socket and emits:

```js
socket.emit("agent:subscribe", { projectId, sandboxId });
```

The backend checks:

```js
const runKey = `${userId}:${projectId}`;
const run = activeAgentRuns.get(runKey);
```

If no run exists, the backend returns:

```js
{ active: false }
```

If a run exists, the backend attaches the new socket to the run and returns:

```js
{
  active: true,
  run: {
    projectId,
    sandboxId,
    message,
    model,
    status,
    assistantText,
    toolLogs,
    startedAt,
    updatedAt
  }
}
```

The frontend rebuilds a running assistant card from that snapshot, sets `isStreaming` to `true`, disables the input, and shows the stop button again.

## 6. Stop Flow

The stop button calls:

```js
socket.emit("agent:stop", { projectId });
```

The backend finds the active run by user/project and calls:

```js
activeRun.abortController.abort();
```

The LangGraph stream sees the abort signal and throws `AGENT_STOPPED`. The backend saves a stopped assistant message, emits `agent:stopped`, clears the active run, and the frontend unlocks the chat box.

The important change is that stop no longer requires the original socket id. Any reattached socket for the same authenticated user/project can stop the run.

## 7. Why The Agent Was Getting Stuck

The agent was reaching:

```txt
Model ready
Still working
Waiting for model or tool results
```

That means the backend got as far as selecting a model, but the model call did not return a tool call or final text. In practice, provider calls can hang or take too long.

`code.agent.js` now wraps model calls in a hard per-model timeout. If a provider call hangs, it throws:

```txt
MODEL_CALL_TIMEOUT
```

`socket.js` treats that as recoverable if no tool has started yet. It tries the next configured model instead of leaving every future request waiting behind a stuck model call.

Another common stuck case is provider quota or rate limiting. If the only configured key is `GOOGLE_API_KEY`, then all fallback choices may still be Google models. In that situation switching from one Google model to another does not fix a Google quota problem. The backend now detects this and emits a clear provider-level error instead of cycling models forever:

```txt
PROVIDER_RATE_LIMIT
```

or:

```txt
PROVIDER_MODEL_TIMEOUT
```

## 8. Model Selection And Fallback

`createAgentForModel(modelName)` resolves the requested model from aliases, then falls back through configured providers.

The fallback order is defined in `MODEL_FALLBACK_ORDER` in `code.agent.js`.

If a model is rate-limited or times out before any work begins, the backend excludes that model and tries the next configured model from a different provider. The UI receives:

```txt
Switching model
<old model> timed out; trying <next model>
```

If the next available model is from the same provider, the backend stops fallback and returns a provider error. This prevents the exact failure where the UI keeps saying "Switching model" but no tools are called.

Once a tool starts, the backend does not switch models because the run has already begun mutating/inspecting workspace state.

The current stable model IDs are:

- Mistral: `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest`, `codestral-latest`, `devstral-latest`
- Google: `gemini-1.5-flash`, `gemini-1.5-pro`
- Cohere: `command-r-plus-08-2024`

The frontend can still send aliases like `gemini-2.5-flash`; `code.agent.js` maps those aliases to the stable backend model IDs.

## 9. Tool Execution

Tools are defined in `Ai_orchestration/src/agent/tool.js`.

Examples:

- `list_files`: asks sandbox service for project files.
- `read_file`: reads one or more files.
- `create_file`: creates files.
- `update_file`: rewrites files.
- `patch_file`: targeted string replacement.
- `execute_command`: runs shell commands inside the sandbox.
- `get_vite_runtime_errors`: checks Vite/runtime logs.
- `search_code`: searches code without reading whole files.

The tools receive a `writer` function from `socket.js`. The writer sends `agent:tool_log` events so the frontend can show progress even when LangGraph tool events are sparse or provider-specific.

## 10. Frontend State

Redux stores:

- `messages`
- `isStreaming`
- `error`

The chat input is disabled when `isStreaming` is true. The send button changes to the stop button while streaming.

After reload, Redux is rebuilt from local storage and MongoDB history. The recovery socket then asks the backend for any in-memory active run. If one exists, the hook adds a running assistant placeholder and sets `isStreaming` back to true.

## 11. How To Build This Again

Use this sequence:

1. Create a chat component that only renders UI and calls hook actions.
2. Create a hook that owns Socket.io connection, Redux updates, and run lifecycle.
3. On submit, add a user message and an empty running assistant message.
4. Emit `agent:invoke` to the backend.
5. On the backend, authenticate the socket.
6. Create a run key from `userId:projectId`.
7. Store active run state in a map.
8. Broadcast events to every socket subscribed to that run.
9. Run the LangGraph agent with a model timeout and abort signal.
10. Stream model text, tool starts, tool logs, tool ends, errors, stops, and done events.
11. Save final assistant output and tool logs to MongoDB.
12. On page load, connect a recovery socket and emit `agent:subscribe`.
13. If an active run exists, rebuild the running UI and wire the stop button to `agent:stop`.
14. Never tie a backend run to one browser socket. Tie it to user/project, then let sockets subscribe.

## 12. Debug Checklist

If the UI says `Still working` forever:

- Check whether the backend logged `Model ready`.
- If yes, the model call is slow or stuck.
- Confirm `MODEL_CALL_TIMEOUT` is emitted after the configured timeout.
- Confirm fallback model status appears.
- If the status keeps switching between models but no tools appear, check configured provider keys. With only one provider configured, provider quota/rate limits now surface as `PROVIDER_RATE_LIMIT` instead of continuing same-provider fallback.
- Check the backend error payload for quota text such as `RESOURCE_EXHAUSTED`, `quota`, `rate limit`, `billing`, or `credits`.

If reload loses the stop button:

- Check that frontend emits `agent:subscribe`.
- Check backend emits `agent:active_run` with `active: true`.
- Check Redux `isStreaming` becomes true.
- Check the stop button calls `agent:stop`.

If tools do not show:

- Check `writer` logs in `tool.js`.
- Check backend emits `agent:tool_log`.
- Check frontend listens for `agent:tool_log`.

If a second message is accepted while a run is active:

- Check backend `activeAgentRuns.has(runKey)`.
- Check frontend received `agent:active_run`.
- Check `isStreaming` is true after reattach.

## 13. Current Design Limits

Active runs are stored in memory inside the AI orchestration process. If the AI orchestration pod/process restarts, active run memory is lost. MongoDB still has saved completed/error messages, but an in-flight run cannot be reattached after process restart.

For production-grade durability, move active run state to Redis or a database-backed job system and let workers resume/cancel by run id.
