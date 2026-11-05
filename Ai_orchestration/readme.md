# AI Orchestration Service

Runs the two AI agents of Taksha CodeSpace and streams them to the frontend over Server-Sent Events.

| Agent | What it does | Endpoint |
|---|---|---|
| **Orion** | Coding agent. Plans a change, waits for approval, writes code in the user's sandbox, builds, reviews and fixes it. | `/api/ai/code-agent/*` |
| **Clio** | Editor copilot. Explains code and makes small edits to the open file. | `/api/ai/app-agent/invoke` |

The model is NVIDIA-hosted (build.nvidia.com) through its OpenAI-compatible API. Tools reach the sandbox over **MCP** at `http://sandbox-service-<sandboxId>:3000/mcp` (REST `/api/agent/*` only as a fallback for older pods).

### Sandbox access
| Step | What happens |
|---|---|
| Run start (Orion) / each turn (Clio) | `tools/sandboxAuth.js` trades the user's token for a 2-hour sandbox token (`POST /api/auth/sandbox-token`, `aud: taksha-sandbox`, one sandbox). Plan approve/reject renews it. |
| Every tool call | `callSandboxTool(config, name, args)` in `tools/sandbox.client.js` sends it as `Authorization: Bearer`. The sidecar accepts it only for the sandbox owner. |
| Transport | `tools/mcp.client.js`: one MCP client per run, closed when the run ends. Timeouts: 150s for `execute_command`, 45s logs, 30s otherwise. A dropped connection is retried once for read-only tools only, never for writes or commands. |
| Certified tools | Only the 9 tools in `CERTIFIED_TOOLS` are called. Extra tools a server offers are ignored and logged; the model only sees this service's own tool descriptions. |
| Fallback | A sandbox without `/mcp` (404) uses REST for the rest of that run. `SANDBOX_TOOL_TRANSPORT=rest` forces REST. `SANDBOX_URL_TEMPLATE` (e.g. `http://localhost:3000`) points at a port-forwarded pod for local dev. |

---

## Code layout

```
server.js                    boots HTTP, loads .env first
src/
  app/app.js                 Express app, health routes, error handler
  routes/ai.routes.js        routes + middleware order
  middleware/                auth (JWT), rate limit (Redis token bucket), credit ledger
  controllers/               ai.controller.js (agents), chat.controller.js (history)
  services/                  agentRun (Orion runs + SSE), copilot (Clio + titles),
                             credit (Payments), sandboxOwnership, internetSearch
  models/                    ChatMessage, CopilotChatMessage
  agent/
    index.js                 the only entry point the rest of the service imports
    llm/
      model.js               NVIDIA model (main + fast), the only provider code
      rateLimiter.js         pacing, 429 backoff, call timeout
      structured.js          schema output: function calling, then JSON fallback
    tools/
      sandbox.client.js      the only way to the sandbox: callSandboxTool (MCP, REST fallback)
      mcp.client.js          MCP client, certified-tool allowlist, retry rules
      sandboxAuth.js         per-run sandbox token from Auth
      file.tools.js          list / read / create / update / patch / delete
      search.tools.js        search_code, search_internet
      command.tools.js       execute_command, get_vite_runtime_errors
      guards.js              shell guard, write-scope guard
      toolResult.js          one JSON result shape for every tool
      index.js               tool sets per role (read-only, coder, debugger, copilot)
    core/
      toolLoop.js            the ReAct loop every agent node uses
      toolActivity.js        what really happened, from tool results
      messages.js            message and usage helpers
      prompts.js             shared grounding rules
    nodes/                   one file per graph node
    graph/
      orion.state.js         Orion state + limits
      orion.graph.js         Orion graph
      clio.graph.js          Clio graph
```

Rule of thumb: a node never calls axios or builds its own tool list. It picks a tool set from `tools/index.js` and runs `core/toolLoop.js`.

---

## Orion flow

```
router -+-> general (answers, read-only) -> END
        +-> planner -> critic -> plan_review (pause) -> coder (one step per pass)
            -> tester (build/tests) -> reviewer (acceptance criteria) -> finalizer -> END
                  \-> debugger -> tester   (max 3 fix attempts)
```

How it avoids hallucinated results:

| Guard | Where |
|---|---|
| The planner starts from the real file list. The critic rejects near-miss paths (`App.js` vs `App.jsx`). | `planner.node.js`, `critic.node.js` |
| Step status comes from tool results. A step that changed nothing has failed, whatever the model says. | `coder.node.js`, `core/toolActivity.js` |
| A failed step gets one retry with the reason it failed. | `coder.node.js` |
| Unknown tools, bad arguments and repeated identical calls get a readable error instead of a crash or a loop. | `core/toolLoop.js` |
| When the turn budget runs out, finished work is kept and the model must report honestly. | `core/toolLoop.js` |
| Pass/fail of the build comes from the exit code. The reviewer checks criteria against current file contents. | `tester.node.js`, `reviewer.node.js` |
| The outcome (`complete / partial / failed`) is computed in code. The model only phrases it. | `finalizer.node.js` |

Auth failures and lasting rate limits end the run at once instead of being retried by every node.

---

## SSE contracts

**Orion** (`/api/ai/code-agent/*`). Frames are `id`, `event`, `data: <json>`.

| Endpoint | Purpose |
|---|---|
| `POST /code-agent/invoke` | Start a run. The response is the stream. |
| `GET /code-agent/stream/:projectId` | Re-attach after reload. Honors `Last-Event-ID`. `204` when no run. |
| `POST /code-agent/plan-approve` / `plan-reject` | Resume the paused run. |
| `POST /code-agent/stop` | Abort the run. |

Events: `agent:run`, `agent:snapshot`, `agent:status`, `agent:model`, `agent:thinking`, `agent:message`, `agent:message_retract`, `agent:final`, `agent:tool_start`, `agent:tool_end`, `agent:tool_log`, `agent:steps`, `agent:step`, `agent:plan_review`, `agent:msg_created`, `agent:done`, `agent:stopped`, `agent:error`.

**Clio** (`POST /app-agent/invoke`). Token chunks as `data:` lines (one `data:` per text line), then `event: final` (full answer), `event: done`, or `event: error` (JSON).

Runs and paused threads live in process memory, so the service runs as a single replica.

---

## Environment variables

| Key | Required | Description |
|---|---|---|
| `PORT` | yes | HTTP port (default 3000) |
| `MONGO_URI` | yes | MongoDB for the `ai` database |
| `REDIS_URI` | yes | Redis for the rate limiter |
| `AUTH_JWKS_URI` | yes | Auth service JWKS URL |
| `PAYMENTS_SERVICE_URL` | yes | Payments service base URL |
| `SANDBOX_SERVICE_URL` | yes | Sandbox service base URL (ownership check) |
| `NVIDIA_API_KEY` | yes | Key from build.nvidia.com (`nvapi-...`) |
| `NVIDIA_MODEL` | no | Main model id. Default `nvidia/nemotron-3-ultra-550b-a55b` |
| `NVIDIA_FAST_MODEL` | no | Model for routing, titles and reports. Default `nvidia/nemotron-3.5-lightning-30b-a3b` |
| `NVIDIA_BASE_URL` | no | Default `https://integrate.api.nvidia.com/v1` |
| `AUTH_SERVICE_URL` | yes | Auth base URL for sandbox tokens. Default `http://auth-service` |
| `SANDBOX_TOOL_TRANSPORT` | no | `mcp` (default) or `rest` |
| `SANDBOX_URL_TEMPLATE` | no | Sidecar origin, default `http://sandbox-service-{sandboxId}:3000` |
| `TAVILY_API_KEY` | no | Enables `search_internet` |

Not every catalog model is enabled for every account, and models reach end of life. `npm run list:models` shows what your key can see; `npm run check:model` confirms a model answers and calls tools.

---

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Offline tests (no network, no DB) | `npm test` |
| Live check of the NVIDIA key and model (plain reply + tool call) | `npm run check:model` |
| Models your key can use (optional filter) | `npm run list:models -- nemotron` |
| Full Orion run with the real model against the real sidecar (auth + MCP) on a temp workspace, no cluster (needs `npm install` in `Sandbox/Agent`) | `npm run e2e:live -- "your task"` |
| Whole cluster | `skaffold dev` from the repo root |
