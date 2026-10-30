# Ai_orchestration: features to be built

Features that the docs, README or PRD describe as done (or planned) but that do not exist in code as of 2026-10-26. Ordered by how much they matter for a working, honest product. Fix the P0 items in `fix.md` first.

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Persistent checkpointing (Mongo or Redis saver) and shared run registry | Today `MemorySaver` + an in-process `runs` Map force a single replica; a pod restart loses every paused plan and live run. Required before any HPA. | Mongo `ai` db | M |
| 2 | Horizontal scaling (HPA) | Docs claim HPA at 70% CPU; deployment is `replicas: 1`. Needs #1 plus sticky SSE or Redis pub/sub for run events. | #1, k8s | M |
| 3 | Real subscription-aware limits | Rate limiter and credit ledger always see `free`. Read tier from Payments with a short Redis cache. | Payments `/credit` | S |
| 4 | Sandbox keep-alive during runs | Agent-only runs expire after 120 s. Heartbeat to Sandbox server while a run is active. | Sandbox server endpoint | S |
| 5 | Role-based tool sets (`ALLOWED_TOOLS_BY_ROLE`) | Docs promise per-role toolsets; each node hand-picks tools today. One table makes scope reviewable and testable. | none | S |
| 6 | Command allow/deny policy for `execute_command` | Only file-manipulation and dev-server starts are blocked. Needed with sidecar auth for real isolation. | Sandbox Agent | S |
| 7 | Circuit breaker (transition counter + per-file retry) | Docs promise abort at 16 transitions; only signature repeat + `recursionLimit: 120` exist. | none | S |
| 8 | Context compactor wired into the graph | `compactor.node.js` exists but is not registered and keys on a missing `tokenCount`. Long runs will overflow context. | token counting | M |
| 9 | Risk-based plan approval | Every plan pauses for approval. Docs describe high-risk-only `interrupt()` driven by the Critic's risk score. | Critic output | S |
| 10 | Tri-layer tester | Tester runs unit tests + `npm run build` only. Add: ESLint fallback when no build script, and `vite-runtime-errors` check after build. (Browser-extension layer is separate, see Frontend.) | Sidecar `/vite-runtime-errors` | M |
| 11 | Multi-provider LLM failover | Only Mistral `codestral-latest`. Docs/PRD/env list Google, OpenAI, Cohere. Add a provider interface + fallback on 5xx/429. | Payments per-provider buckets already exist | M |
| 12 | Input safety middleware (edgeSecurity / contentGuard) | Docs mark as done: prompt-injection filter, PII redaction, 25k-char cap. None exist. Start with the size cap and PII redaction for chat history. | none | M |
| 13 | Usage telemetry over RabbitMQ (`ai_telemetry_queue`) | Usage is a synchronous HTTP POST to Payments; a Payments outage loses usage. Queue makes billing durable. | Payments consumer | M |
| 14 | MCP / JSON-RPC tool gateway | Headline feature in README/PRD; the README's own `curl … /mcp` check 404s. Either build a thin MCP server over the existing sidecar REST tools or drop the claim. | Sandbox Agent | L |
| 15 | Jev / RLCD fast router ("System 1") | README claims a sub-100 ms routing brain; routing is an LLM call + greeting regex. A rules/embedding classifier before the LLM would cut cost and latency. | none | M |
| 16 | Prompt prefix caching | Documented, not present. Mistral supports it; reduces cost for long system prompts. | provider support | S |
| 17 | Prometheus `/metrics` | Only Auth has metrics. Add request, run, node-duration, token and tool-error metrics. | monitoring stack | S |
| 18 | Structured logging with request IDs | morgan text logs, no `req.id`. Pino JSON + request id propagated to sandbox and Payments calls. | none | S |

Size: S = under a day, M = 1-3 days, L = a week or more.

**Suggested build order:** 3 → 4 → 6 → 5 → 7 → 1 → 2 → 8 → 10 → 9 → 11 → 13 → 17/18 → 12 → 14/15/16.
