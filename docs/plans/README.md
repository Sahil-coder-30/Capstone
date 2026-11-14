# Plans

Index of the design plans, who owns what, and the rules that keep them apart. All plans were checked against the code on 2026-11-14. Where a plan and the code disagree, trust the code and fix the plan.

## The plans

| Plan | Status | Owns |
|---|---|---|
| [mcp-sandbox-server.md](mcp-sandbox-server.md) | Built | Record of the sandbox MCP server, sandbox tokens and external agent tokens |
| [taksha-tool-call-analytics-plan.md](taksha-tool-call-analytics-plan.md) | Plan | Logging agent tool calls to Mongo `ai`, rollups, reports |
| [taksha-agent-tools-build-plan.md](taksha-agent-tools-build-plan.md) | Plan | The sandbox tool set (9 to 24 tools), browser telemetry, checkpoints, live editor |
| [admin-platform-hld.md](admin-platform-hld.md) with `Admin/PLAN.md` | Plan | Admin portal, admin login, permissions, read access to every database, audit, the admin mailer |
| [kafka-whatsapp-architecture.md](kafka-whatsapp-architecture.md) | Plan | **All queue work**: Kafka, every topic, producer and consumer, outbox, retry, DLQ, the Notification service, WhatsApp, and the admin platform's events |

## Every plan stands alone

| Plan | Needs another plan? | Safe to build if the others are never built? |
|---|---|---|
| Tool call analytics | No | Yes |
| Agent tools | No. Its gates use the eval runner's own result files | Yes |
| Admin platform (P0 to P8) | No. It sends its own mail and reads databases directly | Yes |
| Kafka K1 to K5, K7, K8 | No | Yes |
| Kafka K6 (admin on Kafka) | Yes: admin phases P1 and P2 | Skipped while the admin backend does not exist |

## Suggested order

Any order works. This one gives the most value early and the least rework.

| # | Build | Why here |
|---|---|---|
| 1 | Tool call analytics (about 5 days) | Small, and it shows which tools to fix first |
| 2 | Agent tools, Phase 0 to 2 | Biggest gain for the agent, no infrastructure |
| 3 | Admin platform P0 to P4 | Documents first (PRD, OpenAPI, UI), then the backend |
| 4 | Kafka K1 to K4 | Replaces RabbitMQ, fixes lost emails and lost usage reports |
| 5 | Agent tools Phase 3 to 5, admin P5 to P8, Kafka K5 to K8 | In any order |

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
| Mongo `ai` database | Tool call analytics (new collections `toolcalls`, `toolstatshourly`), admin readers (read-only) | The admin read-only user covers new collections. No new credential |
| Payments `outbox` table and Admin `outbox` table | Kafka K2, Admin P1 | Two tables in two databases. Same column idea, no shared code |
| `Auth/src/app/app.js` | Admin P1 (mounts admin routes), Kafka K3 (removes the RabbitMQ import in the controller) | Different lines. Rebase, do not rewrite |
| `k8s/ingress.yml` | Kafka K5 adds `/api/whatsapp` | The admin platform uses its own Ingress object in `Admin/k8s/` and never edits this file |
| `skaffold.yml` manifest list | Kafka K1 adds `k8s/kafka.yml` | The admin platform uses `Admin/skaffold.yml` |
| Docker Desktop memory | Kafka (about 1 GB), monitoring (1.5 to 2 GB), headless Chrome per sandbox (agent tools Phase 3) | Do not run all three with many sandboxes on one laptop |

## Rules for every plan

- Each stage or phase ends with its tests passing and one local commit. No push unless asked.
- Changes outside a plan's own area are additive: new files, new routes, new optional fields. A plan never changes how an existing user flow behaves, except where it says so in its own "changes" table.
- Never open `k8s/secrets.yml`, `.env` or the Auth key files. Use the `.example` files and the manifests.
- When a stage is built, update its status line in the plan and the matching part of `CLAUDE.md` in the same commit.
