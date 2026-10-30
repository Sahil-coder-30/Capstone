# 🤖 AI Orchestration Service

> Runs the LangGraph ReAct loop that turns a user's natural-language prompt into a verified, working change inside their live sandbox — the only service that holds LLM credentials and decides how code is written.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-Node.js%2020%20ESM-informational)

---

## 📖 Table of Contents
- [Overview & The "Why"](#-overview--the-why)
- [Built Features & Current State](#-built-features--current-state)
- [Architecture & Design Patterns](#-architecture--design-patterns)
- [Usage & Setup](#-usage--setup)
- [Communication & Contracts](#-communication--contracts)
- [Production Readiness](#-production-readiness)
- [Changelog & Migration State](#-changelog--migration-state)

---

## 🎯 Overview & The "Why"

### What this service does
AI Orchestration is the agent brain of the platform. It receives a user's coding prompt, validates that the user has credits, runs the Orion LangGraph agent (Mistral models, default codestral-latest), invokes filesystem and terminal tools through the sandbox sidecar's File API, persists chat history in MongoDB, and streams thinking, tool activity and the final report back to the frontend over Server-Sent Events.

### Orion agent flow

```
router ─┬→ general (read-only answers) → END
        └→ planner → critic → plan_review (interrupt) → coder (one step per pass)
           → tester (build/tests by exit code) → reviewer (acceptance criteria vs real files)
           → debugger ↺ tester (max 3) → finalizer (report from facts) → END
```

Anti-hallucination rules built into the graph:
- Step status comes from tool results. A step that should change files but wrote nothing is reported as failed.
- The tester decides pass/fail from the command exit status. Vite builds go to `node_modules/.orion-build-check`, so user folders are never deleted.
- The reviewer checks acceptance criteria against the current file contents, not the model's claims.
- The finalizer computes the outcome (`complete | partial | failed`) in code and only lets the model phrase it.

### SSE contract (`/api/ai/code-agent/*`)

| Endpoint | Purpose |
|---|---|
| `POST /code-agent/invoke` | Start a run. Response is the SSE stream. |
| `GET /code-agent/stream/:projectId` | Re-attach after reload or network loss. Honors `Last-Event-ID`. `204` when no run is active. |
| `POST /code-agent/plan-approve` / `plan-reject` | Resume the paused run. Events continue on the open stream. |
| `POST /code-agent/stop` | Abort the active run. |

Every frame is `id: <n>`, `event: <name>`, `data: <json>`. Events: `agent:run`, `agent:snapshot`, `agent:status`, `agent:model`, `agent:thinking`, `agent:message`, `agent:message_retract`, `agent:final`, `agent:tool_start`, `agent:tool_end`, `agent:tool_log`, `agent:steps`, `agent:step`, `agent:plan_review`, `agent:msg_created`, `agent:done`, `agent:stopped`, `agent:error`.

Runs and paused threads are kept in process memory, so the service must run as a single replica (or with sticky sessions) until they move to a shared store.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** AI Orchestration exclusively owns the decision of _how to interpret a prompt, plan a multi-step coding task, and verify the result_. No other service runs LLM calls or constructs LangGraph graphs.
- **Independent scaling need:** LLM inference is I/O-bound with long-tail latency (seconds to minutes per request, 10-minute timeout configured). This profile is completely different from Auth (fast, stateless JWT checks) or Payments (low-volume transactional writes). Scaling them together would massively over-provision Auth/Payments or starve AI under burst load.
- **Independent deployability:** LLM provider integrations, tool definitions, and agent prompts change frequently as the product iterates. Auth and Payments are stable for months. Decoupling deploys lets the AI team ship provider changes without touching identity or billing.
- **Failure isolation:** If AI Orchestration goes down, the sandbox continues running, the terminal still works, and the user can still edit files manually. Prompt-driven coding becomes unavailable, but the core environment is unaffected.
- **Data isolation strategy:** Database-per-service. AI Orchestration owns the `ai` MongoDB database (chat message history, command summaries). No other service connects to this database. User identity is verified via JWT only; credit balance is queried and deducted via HTTP calls to the Auth Service.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| Frontend SPA | Sync REST + Socket.io | `POST /api/ai/app-agent/invoke` to start an agent run; real-time step output streamed back over Socket.io |
| Frontend SPA | Sync REST | `POST /api/ai/app-agent/title` to generate a conversation title; `GET /api/ai/chats/:projectId/:agentType` to fetch history |
| Auth Service (via JWT) | JWT verification (local) | Every request carries a JWT; `identifyUser` middleware verifies it against `JWT_ACCESS_SECRET` — no runtime call to Auth |
| Sandbox Agent Container | Outbound REST (tool call) | The LangGraph tools call the sidecar's File API (`http://sandbox-service-<sandboxId>:3000`) to read/write files and execute terminal commands |
| Auth Service (credit endpoints) | Outbound REST | Checks credit availability before invoking the LLM; deducts credits after a successful run |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | The tool layer calls the sandbox sidecar over HTTP using a URL constructed from the `sandboxId` extracted from the JWT — there is no circuit breaker, so if the sidecar is slow the LangGraph loop blocks until the 10-minute server timeout fires. Adding a circuit breaker (or tool-level timeout) is the priority hardening item. |

### Features built (working today)

- `POST /api/ai/app-agent/invoke` — Starts a LangGraph ReAct loop; streams incremental steps (plan → tool calls → verification) over Socket.io — ✅ done
- `POST /api/ai/app-agent/title` — Generates a short title for a new conversation using the configured LLM — ✅ done
- `GET /api/ai/chats/:projectId/:agentType` — Returns paginated chat message history for a project + agent type combination — ✅ done
- `GET /api/ai/chats/trash` — Lists soft-deleted chat messages — ✅ done
- `DELETE /api/ai/chats/:projectId/:agentType` — Soft-deletes all messages in a conversation — ✅ done
- `DELETE /api/ai/chats/message/:messageId` — Soft-deletes a single message — ✅ done
- `PATCH /api/ai/chats/message/:messageId/restore` — Restores a soft-deleted message — ✅ done
- `DELETE /api/ai/chats/message/:messageId/permanent` — Hard-deletes a message — ✅ done
- Multi-provider LLM routing: Mistral Devstral (primary), Google Gemini, OpenAI-compatible, Cohere, Tavily web search — ✅ done
- LangGraph tool set: file read, file write, file create, directory list, terminal command execution — ✅ done
- Copilot chat (separate agent type, uses `CopilotChatMessage` model) — ✅ done

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** Express 5 + Socket.io 4 (for streaming agent output)
- **Design patterns used:**
  - **LangGraph ReAct loop** — The agent is modeled as a stateful graph (`@langchain/langgraph`) where each node is a reasoning step or tool invocation. This lets the agent re-plan after each tool result rather than committing to a fixed sequence upfront, which is critical for multi-file coding tasks where earlier steps change later ones.
  - **Dependency injection for LLM providers** — Provider instantiation (Mistral, Gemini, OpenAI-compat, Cohere) is isolated in the `agent` layer; the graph nodes receive the provider instance at build time. Swapping providers requires no changes to tool or routing code.
  - **Zod schema validation** — All tool output schemas and agent-facing structured data are validated with Zod to catch LLM format violations before they crash the graph.
  - **Soft-delete pattern on chat messages** — `ChatMessage` and `CopilotChatMessage` models have a `deletedAt` field; queries filter `deletedAt: null` by default, enabling the trash/restore workflow.
- **Key libraries:** `@langchain/langgraph`, `@langchain/core`, `@langchain/mistralai`, `@langchain/google-genai`, `@langchain/openai`, `@langchain/cohere`, `@tavily/core`, `langchain`, `socket.io`, `mongoose`, `ioredis`, `zod`, `jsonwebtoken`, `axios`

---

## 🏗️ Architecture & Design Patterns

Requests enter via Express routes, pass through `identifyUser` JWT middleware, and reach a thin controller. The controller creates or retrieves a LangGraph agent graph (built from the `code.agent.js` definition), invokes it with the user's message, and streams intermediate node outputs back over Socket.io. Completed steps and final messages are persisted to MongoDB via Mongoose models. Redis stores transient session state (e.g. active socket mapping).

```
Ai_orchestration/
├── server.js                        # Entry — HTTP server, Socket.io init, DB connect
└── src/
    ├── app/
    │   └── app.js                   # Express setup, route mounting, CORS
    ├── agent/
    │   ├── code.agent.js            # LangGraph graph definition (nodes, edges, tools)
    │   └── tool.js                  # Tool implementations (file read/write, exec, search)
    ├── controllers/
    │   ├── ai.controller.js         # invoke + title endpoints
    │   └── chat.controller.js       # Chat history CRUD
    ├── middleware/
    │   └── auth.middleware.js       # identifyUser — JWT verification
    ├── models/
    │   ├── ChatMessage.model.js     # Persistent agent chat history
    │   ├── CopilotChatMessage.model.js
    │   └── CommandSummary.model.js  # Per-command execution records
    ├── routes/
    │   └── ai.routes.js
    ├── services/                    # LLM provider factory, credit service calls
    ├── skills/
    │   ├── frontend-codegen/        # Prompt skill: React/Vite code generation patterns
    │   └── tool-info/               # Prompt skill: tool usage guidance for the agent
    ├── socket/
    │   └── socket.js               # Socket.io server init + event registration
    └── config/
        ├── db.js                    # Mongoose connection
        └── redis.js                 # ioredis client
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the service listens on | `3000` |
| `MONGO_URI` | ✅ | MongoDB connection string for the `ai` database | `mongodb+srv://user:FAKE@cluster.mongodb.net/ai` |
| `JWT_ACCESS_SECRET` | ✅ | Shared JWT signing secret (same value as Auth Service) | `your-256-bit-random-secret` |
| `REDIS_URI` | ✅ | Redis connection URL | `redis://default:password@host:port` |
| `MISTRALAI_API_KEY` | ✅ | Mistral AI API key (primary LLM provider) | `fake_mistral_key_xxxx` |
| `GOOGLE_API_KEY` | ✅ | Google Generative AI API key | `fake_google_key_xxxx` |
| `OPENAI_API_KEY` | ✅ | OpenAI-compatible API key (may point to NVIDIA NIM or similar) | `nvapi-fake_key_xxxx` |
| `COHERE_API_KEY` | ✅ | Cohere API key | `fake_cohere_key_xxxx` |
| `DEEPSEEK_API_KEY` | ❌ | DeepSeek API key (optional provider) | `sk-fake_deepseek_key` |
| `TAVILY_API_KEY` | ✅ | Tavily web search API key (used by the web search tool) | `tvly-fake-key-xxxx` |

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in all required keys above

# 3. Start in dev mode (nodemon with -L flag for Docker volume compat)
npm run dev

# 4. Run the offline tests (no network, no database)
npm test
```

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t ai-orchestration:local .

# Run as part of the full cluster (watches src/**, server.js, package.json)
skaffold dev
# Declared in skaffold.yml as image: ai-orchestration, context: Ai_orchestration
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
| Direction | Protocol | Endpoint | Counterpart |
|---|---|---|---|
| Inbound | REST | `POST /api/ai/app-agent/invoke` | Frontend SPA (via Ingress `/api/ai/*`) |
| Inbound | REST | `POST /api/ai/app-agent/title` | Frontend SPA |
| Inbound | REST | `GET /api/ai/chats/:projectId/:agentType` | Frontend SPA |
| Inbound | REST | `GET /api/ai/chats/trash` | Frontend SPA |
| Inbound | REST | `DELETE /api/ai/chats/:projectId/:agentType` | Frontend SPA |
| Inbound | REST | `DELETE/PATCH /api/ai/chats/message/:messageId` | Frontend SPA |
| Outbound | REST | `GET /api/auth/credit/check` | Auth Service — pre-invocation credit check |
| Outbound | REST | `POST /api/auth/credit/update` | Auth Service — post-invocation credit deduction |
| Outbound | REST | Sidecar File API (`http://sandbox-service-<id>:3000/*`) | Sandbox Agent Container — tool calls |

### Asynchronous (event/queue)
AI Orchestration does not produce or consume RabbitMQ messages. It streams to the frontend over Server-Sent Events only (see the SSE contract above). Socket.IO is no longer used.

### Contract source of truth
[`src/routes/ai.routes.js`](./src/routes/ai.routes.js). No OpenAPI spec yet.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** No dedicated `/healthz` endpoint — gap. TCP probe used by K8s.
- **Readiness:** No dedicated `/ready` or `/readyz` endpoint — gap.
- **Graceful shutdown:** 10-minute `server.timeout` is set to allow long-running LLM calls to complete. No explicit SIGTERM handler for in-flight Socket.io connections — gap.
- **Structured logging:** `morgan` HTTP logging only. No structured JSON logs, no request IDs — gap.
- **Tracing / Metrics:** Not implemented.

> ⚠️ **Gap:** The 10-minute timeout prevents most hung requests, but a circuit breaker on outbound tool calls to the sandbox sidecar is the highest-priority hardening item before scaling.

### Security & compliance
- **AuthN/AuthZ:** JWT verification on every route via `identifyUser` middleware. Uses `JWT_ACCESS_SECRET` shared with Auth Service.
- **CORS policy:** Configured at Express app level; aligned with Nginx Ingress allowed origins.
- **Rate limiting:** Not implemented at the service layer. Expected at Ingress level.
- **Hardening:** No `helmet`. Zod validates all structured LLM outputs.
- **Secrets management:** K8s Secrets. Secret names: `database` (`AI`), `jwt` (`JWT_SECRET`), `ai-secret` (LLM keys).

### CI/CD & deployment
- **Container:** [`Ai_orchestration/dockerfile`](./dockerfile) — Node 20 Alpine base.
- **Orchestration:** K8s Deployment: `k8s/ai-deployment.yml`, Service: `k8s/ai-service.yml`. Request timeout is 10 minutes (`server.timeout = 600000`).
- **Pipeline:** No CI pipeline defined. Manual Skaffold for development.
- **Rollback strategy:** Manual `kubectl rollout undo`.

---

## 📝 Changelog & Migration State
> MAJOR = any change to REST response shape or Socket.io event payload schema.

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Initial release: LangGraph ReAct loop, multi-provider routing, chat history CRUD, Socket.io streaming | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
