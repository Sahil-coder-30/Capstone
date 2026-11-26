# Overview: Taksha CodeSpace as a whole

> **Built:** June 2026 to today (first commit `4d35992`, 2026-06-04) · **Repo:** `Sahil-coder-30/Capstone`
> **One line:** a cloud IDE where each project gets its own Kubernetes sandbox pod and an AI coding agent (Orion) edits and runs the code inside it.

Read this note first. Every other note zooms into one box of this picture.

## 1. What it is

A user signs in with Google, creates a project, and presses Start. Taksha creates a pod for that project with a Vite dev server, an agent sidecar (file tools, terminal, MCP server) and a sync agent (saves the workspace to S3). The user edits in a Monaco editor, sees a live preview, and can ask Orion (the coding agent) or Clio (the file copilot) to do the work. Usage is billed in credits by the Payments service.

## 2. The big picture

```
                 Browser (Frontend :5173, payments_frontend :5174)
                              │  /api/*                 *.preview / *.agent hosts
                              ▼                                   │
                     ┌──── NGINX Ingress ────┐                    │
   /api/auth ────────┤                       ├──── /api/mcp ──────┤
   /api/payments     │                       │                    ▼
   /api/ai           │                       │            ┌──── Router ─────┐
   /api/sandbox      │                       │            │ edge auth, TTL, │
                     └───────────────────────┘            │ MCP gateway,    │
                                                          │ internal MCP    │
 ┌──────┐  ┌──────────┐  ┌────────┐  ┌──────────────┐     └───────┬─────────┘
 │ Auth │  │ Payments │  │   AI   │──┤ (tool calls) ├────────────►│
 │Mongo │  │ Postgres │  │ Mongo  │  └──────────────┘             ▼
 │Redis │  │ Redis    │  │ Redis  │              ┌──── Sandbox pod (per project) ───┐
 └──┬───┘  └────┬─────┘  └────────┘              │ template (Vite :5173)            │
    │ RabbitMQ  │                                │ agent    (sidecar :3000, /mcp)   │
    └─────┬─────┘     Sandbox server ──creates──►│ sync-agent (S3 push)             │
          ▼           (Mongo, Redis TTL keys)    └──────────────────────────────────┘
   Notification (email)
```

| Service | Job | Store |
|---|---|---|
| Auth | Google login, RS256 tokens + JWKS, refresh rotation, sandbox tokens | Mongo `auth`, Redis blacklist |
| Payments | Razorpay checkout, subscription slots, 5-hour credit window | Postgres (Supabase, Drizzle) |
| AI orchestration | Orion (LangGraph) and Clio, SSE streaming, chat sessions, memory agent | Mongo `ai`, Redis rate limit |
| Notification | Emails from RabbitMQ queues | none |
| Sandbox server | Projects, pod lifecycle, MCP tokens, idle cleanup | Mongo `sandbox`, Redis TTL |
| Router | Single entry to every sandbox pod | Redis |
| Sandbox pod | template + agent + sync-agent | emptyDir + S3 |

## 3. The rules that shaped everything

| Rule | Where it shows up |
|---|---|
| **Router is the only door into a sandbox pod** | AI tool calls (`7ea4116`), external agents (`04131db`), edge auth (`d7d12e0`), NetworkPolicy only allows the router in |
| **User id only from the verified token** | Payments rejects a body `userId`; AI chat queries start with `userId` |
| **Fail closed when a failure could cost security or money** | Ownership, rate limiter and credit check all fail closed (rate limiter and credit check failed open until commit "fix(ai): close the P0 security gates", 2026-11-26). Payments still records usage when the blacklist read fails, so usage is not lost |
| **Each service owns its data** | Every service has its own database; others go through its API (for example the AI service asks Sandbox for ownership, Payments for credits) |
| **Idempotency on anything with money** | Payment id is a primary key; `usage_events` unique on `(user_id, request_id)` |
| **Defence in depth** | Sidecar checks the token even though the router already did |

## 4. Timeline of what shipped

| When | What |
|---|---|
| Jun 2026 | Sandbox server, router, agent sidecar, AI service skeleton, k8s + Skaffold |
| Jun to Jul | Auth (Google + JWT), Redis TTL cleanup, sync-agent to S3, frontend IDE, settings |
| Jul to Aug | Payments v1 (Mongo), payments frontend |
| Oct 2026 | AI refactors; 30 Oct: security fixes, Orion rebuilt with SSE, offline tests |
| 3 Nov | Payments moved to Postgres; agent split into modules, NVIDIA models |
| 5 Nov | Sidecar owner auth, sandbox tokens, pod hardening |
| 6 Nov | Sandbox MCP server, MCP client in AI, MCP tokens, router MCP gateway |
| 9 Nov | Payments adversarial tests, 14 money bugs fixed |
| 12 Nov | Chat sessions, memory agent, platform-paid usage |
| 13 to 17 Nov | MCP-only tools, call logging, secret masking, 409 on stopped sandbox |
| 25 Nov | AI tool calls through the router; owner-only edge auth + share links |
| 26 Nov | AI security gates fail closed: credit check, rate limiter, ownership with no ids; HS256 fallback removed (commit "fix(ai): close the P0 security gates") |

## 5. Known limits of the whole system (be honest in interviews)

- **AI is single replica.** LangGraph `MemorySaver`, live runs and the memory queue are in process memory. Plan: Foundations F1 (Mongo checkpointer, Redis leases and streams). Not built.
- **One shared `INTERNAL_SERVICE_TOKEN`** for all internal routes. Plan: F2 per-caller tokens. Not built.
- **Pods are deleted with grace period 0**, so the sync-agent cannot flush its last 400 ms of edits; a failed S3 list at restore continues with the template. Plan: F3. Not built.
- **Rate limit tier is always free**, because Auth does not put `subscription` in the token.
- **RabbitMQ only**, no DLQ: a failed email is nacked without requeue and dropped. Kafka is a plan.

## 6. Interview questions

**Q1. Walk me through your system in two minutes.**
A: Taksha is a cloud IDE built as Node microservices on Kubernetes. Auth issues RS256 tokens that every other service verifies through JWKS, so no service calls Auth per request. When a user starts a project, the Sandbox server creates a pod with three containers: Vite for the live app, an agent sidecar that exposes file and command tools over MCP, and a sync agent that mirrors the workspace to S3. A router is the single entry point to every pod; it checks the owner and refreshes an idle TTL in Redis, and when the key expires the Sandbox server deletes the pod. The AI service runs a LangGraph agent that plans, codes, tests and reviews, calling the sandbox tools through the router, and streams progress over SSE. Payments meters token usage against a 5-hour credit window in Postgres.

**Q2. Why microservices and not a monolith?**
A: The parts have very different load and risk. Sandbox pods run untrusted user code and must be isolated; the AI service holds long-running streaming connections; Payments needs strict transactions in Postgres. Splitting lets each one use the right store and scale on its own, and a crash in the AI service does not take down login or billing. The cost is more network calls and harder debugging, which I handle with JWKS (no auth round trip), one-line logs per tool call and an OpenAPI file for all 76 operations.

**Q3. Why does everything go through the router?**
A: One door means one place for auth, for the idle TTL refresh and for rate limits. Earlier the AI service called pods directly, and those calls did not refresh the TTL, so a long agent run could lose its sandbox. Moving it behind the router fixed that and let the NetworkPolicy allow only the router into pods.

**Q4. What is the biggest scaling problem today?**
A: The AI service is single replica because run state and LangGraph checkpoints are in memory. With two replicas a plan-review resume could land on the wrong pod. The fix is a durable checkpointer in Mongo, a Redis lease per run so one replica owns it, and Redis streams so any replica can serve the SSE stream. It is planned as Foundation F1.

**Q5. How do you decide fail open vs fail closed?**
A: If a failure could let someone do something they should not (ownership, auth, edge access, logout blacklist writes), it fails closed. I first let the AI rate limiter and credit pre-check fail open, so an outage would not block users. That leaked: a wrong Payments URL made every run free and nobody noticed. Since 2026-11-26 both fail closed with a clear 503, because each AI run spends paid model tokens that cannot be taken back. Fail open stays only where failing closed loses data, like recording usage after a run.

## 7. Revise in 60 seconds

- 7 backend services + 2 React frontends, Node 20 ESM + Express, on k8s with Skaffold.
- Sandbox pod = template (Vite) + agent (MCP sidecar) + sync-agent (S3).
- Router = single door: owner check, TTL refresh, MCP gateway, internal MCP path.
- Auth = RS256 + JWKS, rotating refresh tokens with reuse detection.
- Biggest open gap: in-memory AI runs (F1), shared internal token (F2), unsafe pod stop (F3).
