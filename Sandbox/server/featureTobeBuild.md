# Sandbox/server: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Sandbox access tokens | Mint short-lived JWTs `{ sub, sandboxId, aud: "sandbox-agent" }` for the frontend, and a per-pod secret for AI. Foundation for sidecar auth. | Router + Agent | M |
| 2 | Keep-alive endpoint | `POST /keepalive/:projectId` so agent-only runs do not expire. | AI calls it | S |
| 3 | Readiness-driven status | Status `live` only when the pod is Ready; push status to the frontend (SSE) instead of polling. | none | S |
| 4 | Tier-based pod quotas and idle times | PRD promises different CPU/memory/idle timeouts per plan (Max: "4.0 vCPU + 4GB"). Today every pod is the same and the TTL is fixed. Read tier from Payments at start. | Payments tier lookup | M |
| 5 | Pod hardening bundle | Resource limits, non-root, no SA token, NetworkPolicy, ephemeral-storage limit. | Agent stops using k8s API | M |
| 6 | Per-project scoped S3 credentials | Replace bucket-wide static keys with STS / IRSA scoped to the project prefix. | AWS IAM | M |
| 7 | S3 cleanup on permanent delete | Data deletion completeness. | none | S |
| 8 | Prometheus metrics | Pods running, start latency, start failures, teardown count. | monitoring stack | S |
| 9 | Pod pre-warming pool | Cuts cold start (init container + `npm install`). Optional, for later. | #5 | L |

Suggested order: 2 → 1 → 5 → 3 → 7 → 4 → 6 → 8 → 9.
