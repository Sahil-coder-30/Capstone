# Plans

The checklist we follow is [CHECKLIST.md](CHECKLIST.md).

Screens and wireframes for every plan that needs UI are in [ui/](ui/README.md). Open [ui/index.html](ui/index.html) in a browser.

Index of the design plans, who owns what, and the rules that keep them apart. All plans were checked against the code on 2026-11-14 and audited again on 2026-11-24 ([AUDIT-2026-11-24.md](AUDIT-2026-11-24.md)). Where a plan and the code disagree, trust the code and fix the plan.

**Rule for every plan (from `CLAUDE.md`, 2026-11-25):** architecture first. Pods are reached only through the router; no service reads another service's database; no silent fallback that keeps a bypass alive; nothing that breaks with a second replica.

## The plans

| Plan | Status | Owns |
|---|---|---|
| [mcp-sandbox-server.md](mcp-sandbox-server.md) | Built | Record of the sandbox MCP server, sandbox tokens and external agent tokens |
| [platform-foundations-plan.md](platform-foundations-plan.md) | Plan, **first** | F1 durable agent runs (Mongo checkpointer, run leases, Redis streams, shared model pacing), F2 per-caller internal service identity, F3 safe sandbox stop (grace period, flush, restore fails closed) |
| [github-source-control-plan.md](github-source-control-plan.md) | Plan | New `git-service`, GitHub App, `.git` in the pod and its archive, Source Control panel, terminal git, `git_keeper`, `ask_user`, agent presence |
| [taksha-tool-call-analytics-plan.md](taksha-tool-call-analytics-plan.md) | Plan | Logging agent tool calls to Mongo `ai`, rollups, reports |
| [taksha-agent-tools-build-plan.md](taksha-agent-tools-build-plan.md) | Plan | The sandbox tool set (9 to 24 tools), browser telemetry, checkpoints, live editor |
| [admin-platform-hld.md](admin-platform-hld.md) with `Admin/PLAN.md` | Plan | Admin portal, admin login, permissions, audit, the admin mailer. Data comes **only through each service's `/internal/admin/*` routes** (decision 2026-11-24, section 1a); this overrides `Admin/PLAN.md` on data access |
| [llmops-evals-cicd-plan.md](llmops-evals-cicd-plan.md) | Plan, last phase | Evals (golden datasets, context precision and recall, LLM as judge), token economics and latency (cost per request, model routing, prompt compression, semantic cache), production Dockerfiles, GitHub Actions, cloud deploy, LLM tracing (OpenTelemetry, Langfuse) |
| [kafka-whatsapp-architecture.md](kafka-whatsapp-architecture.md) | Plan | **All queue work**: Kafka, every topic, producer and consumer, outbox, retry, DLQ, the Notification service, WhatsApp, and the admin platform's events |
| [taksha-hosting-deployments-plan.md](taksha-hosting-deployments-plan.md) | Plan (V2.5) | Taksha Hosting: sites, builds, the serving edge, the hosting domain, custom domains, the deployments dashboard |
| [admin-native-app-plan.md](admin-native-app-plan.md) | Plan | The admin client: Phase 1 web + PWA (HLD auth), Phase 2 Tauri v2 macOS app: system-browser passkey login, DPoP device-bound tokens in the Keychain, Touch ID, offline aggregates, signing and updates. Section 9: V3 Taksha desktop app with a local LLM |

## Every plan stands alone

| Plan | Needs another plan? | Safe to build if the others are never built? |
|---|---|---|
| Tool call analytics | No | Yes |
| Agent tools | No. Its gates use the eval runner's own result files | Yes |
| Foundations F1 to F3 | No | Yes |
| GitHub source control | Needs F2 before G1, F3 before G2, F1 before G6b, G6c, G6d | Yes, once its foundations are in |
| Admin platform (P0 to P8) | Needs F2 (caller `admin`). It sends its own mail. Analytics use per-service stats routes until Kafka K4, then the read models of Kafka 7.5 | Yes |
| Kafka K1 to K5, K7, K8 | No | Yes |
| Kafka K6 (admin on Kafka) | Yes: admin phases P1 and P2 | Skipped while the admin backend does not exist |

## Suggested order

Any order works. This one gives the most value early and the least rework.

| # | Build | Why here |
|---|---|---|
| 0 | Foundations F3, then F2, then F1 (about 3 weeks) | F3 fixes data loss today; F2 before any new internal caller; F1 before any feature that pauses a run or needs a second AI replica |
| 1 | Tool call analytics (about 5 days) | Small, and it shows which tools to fix first |
| 2 | Agent tools, Phase 0 to 2 | Biggest gain for the agent, no infrastructure |
| 3 | Admin platform P0 to P4 | Documents first (PRD, OpenAPI, UI), then the backend |
| 4 | Kafka K1 to K4 | Replaces RabbitMQ, fixes lost emails and lost usage reports |
| 5 | Agent tools Phase 3 to 5, admin P5 to P8, Kafka K5 to K8, GitHub source control G0 to G7 | In any order, respecting each plan's foundation needs |
| 6 | LLMOps plan: evals, token economics, CI/CD and cloud, LLM observability | **Last.** Product testing phase, after 1 to 5 are built end to end |

## Where queue work lives

Only the Kafka plan designs brokers, topics, consumers, outboxes that feed a broker, retries and dead letter queues. If another plan needs one, the design goes into the Kafka plan and the other plan links to it.

| Looks like a queue, but is not broker work | Stays in |
|---|---|
| The in-memory array and batch writer for tool call records | Tool call analytics plan |
| Ring buffers for console logs, errors and job output in the sandbox | Agent tools plan |
| The admin backend's `outbox` table and mailer worker (plain SMTP) | `Admin/PLAN.md` section 8.1 |

| Admin work that needs a broker | Lives in |
|---|---|
| `admin.events`, announcements and offers, delivery log, DLQ replay, analytics rollups | Kafka plan section 7 (stage K6) |

## Shared touch points

These are the only places where two plans change the same thing. Each has one rule, so the second plan never has to undo the first.

| Touch point | Plans | Rule |
|---|---|---|
| Monitoring stack (`kube-prometheus-stack`, Loki, Alloy, namespace `monitoring`) | Admin P5, Kafka K7 | Helm values live in `k8s/monitoring/`. The stage that runs first installs it, the other only checks it is there. Admin P5 only reads from it. Kafka K7 adds metrics and log fields inside the services |
| `Ai_orchestration/src/routes/internal.routes.js` (does not exist yet) | Admin P7 (stop run), Kafka K5 (WhatsApp run control) | Whoever builds first creates the file with the `requireInternalCaller` pattern from Auth. The other adds its routes. Add the `internal-service` secret to `k8s/ai-deployment.yml` once |
| `config.configurable` of an agent run | Tool call analytics (adds `userId`, `projectId`, `sessionId`, `runId`, `agentType`), agent tools (reads it for the hash memory) | Additive keys only. Never rename `sandboxId`, `credentialKey` or `thread_id` |
| Tool result shape | Agent tools (adds the `{ ok, data, error }` envelope), tool call analytics (reads the outcome) | The logger reads `error.code` when present and falls back to today's shapes. It needs no change when the envelope ships |
| `TOOLS_VERSION` constant | Tool call analytics (defines it), agent tools (raises it per phase) | If analytics is not built, the agent tools plan skips this step |
| Mongo `ai` database | Tool call analytics (`toolcalls`, `toolstatshourly`), foundations F1 (`agentruns`, `orion_checkpoints`, `orion_checkpoint_writes`), Kafka K4 (`outbox`) | Owned by the AI service only. The admin platform reads through AI `/internal/admin/*` routes |
| `/internal/*` routes and the internal token | Every plan that adds a caller | Per-caller identity and route allowlists from foundations F2. Never add a route that any internal caller can reach |
| Sidecar MCP tool list and scopes | Agent tools, GitHub plan (`git`, `git-remote`) | One change list (agent tools section 4). `git-remote` only in short tokens git-service asks for |
| `.git` archive code path in the sync-agent | GitHub plan G2, agent tools P4 (checkpoints in `/taksha-state`) | One implementation, two directories |
| Outbox tables | Kafka K2 (Payments Postgres), K3 and K4 (Auth and AI Mongo `outbox`), Admin P1 (admin Postgres) | One per database, never shared. Mongo services share the small `src/events/outbox.js` helper pattern |
| `Auth/src/app/app.js` | Admin P1 (mounts admin routes), Kafka K3 (removes the RabbitMQ import in the controller) | Different lines. Rebase, do not rewrite |
| `k8s/ingress.yml` | Kafka K5 adds `/api/whatsapp` | The admin platform uses its own Ingress object in `Admin/k8s/` and never edits this file |
| `skaffold.yml` manifest list | Kafka K1 adds `k8s/kafka.yml` | The admin platform uses `Admin/skaffold.yml` |
| Eval runner, `Ai_orchestration/evals/` | Agent tools P0 (builds the runner and 30 tasks), LLMOps (adds datasets, judge, CI gate) | LLMOps extends the runner, never replaces it |
| Redaction helpers `redactInput`, `redactText` | Tool call analytics (writes them), LLMOps (reuses them before sending traces to Langfuse) | One copy, in `Ai_orchestration/src/services/` |
| Dockerfiles | LLMOps adds a `prod` stage to each | `skaffold.yml` builds `target: dev`, so the dev loop does not change |
| Docker Desktop memory | Kafka (about 1 GB), monitoring (1.5 to 2 GB), headless Chrome per sandbox (agent tools Phase 3) | Do not run all three with many sandboxes on one laptop |

## Rules for every plan

- Each stage or phase ends with its tests passing and one local commit. No push unless asked.
- Changes outside a plan's own area are additive: new files, new routes, new optional fields. A plan never changes how an existing user flow behaves, except where it says so in its own "changes" table.
- Never open `k8s/secrets.yml`, `.env` or the Auth key files. Use the `.example` files and the manifests.
- When a stage is built, update its status line in the plan and the matching part of `CLAUDE.md` in the same commit.
