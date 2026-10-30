# Fix plan: service by service (2026-10-26)

Built from `docs/reviews/2026-10-26_DRIFT_REPORT.md`. Every Part 1 security finding was re-checked against the current working tree (including the uncommitted refactor). Each service folder now has:

- `fix.md`: bugs and drift to fix, by severity (P0 security/money → P1 correctness → P2 hardening → Docs), with file:line evidence and a concrete fix.
- `featureTobeBuild.md`: features the docs/PRD promise (or that the product clearly needs) that do not exist yet, with dependencies and rough size.

✅ = re-verified in code for this plan. 📄 = taken from the drift report.

## What the re-check changed

- **Confirmed:** all 11 security items in Part 1 and every "correctness bug that matters" I checked (Zero Day-Waste, ₹0.00 receipt, `patch_file` first-match, orderless checkout, fake settings success, missing `role`, missing `CLIENT_URL`/`NODE_ENV`, secrets example mismatch).
- **Nuance:** Payments' Redis blacklist client is not *never* connected; ioredis auto-connects on the first command (the cron lock), but nothing connects it at startup and the check returns "not revoked" whenever Redis is not ready.
- **New issues found:**
  - Payments sends receipts to the placeholder `user@unknown.com` (a real domain) when order notes lack an email.
  - Frontend's legacy `features/chat` hook sends only `sessionId` to Clio, the exact shape that bypasses the AI ownership check.
  - Frontend calls `PATCH /api/payments/subscription`, which does not exist.
  - Permanent project delete leaves the workspace in S3.
  - Router proxy caches are never evicted.
  - payments_frontend sells early-access and yearly plans that the backend does not have.
  - Once the Auth private key is removed from the image, Auth's `/getMe` and `/logout` crash at startup because they read `certs/public.pem`.
- **Cleared:** the sync-agent's `unlinkDir` prefix already ends with `/`. No fix is needed there.

## Suggested order

Work one service at a time, but some fixes span services. Do them as a group:

| Step | Service(s) | Why first |
|---|---|---|
| 1 | **Ai_orchestration** P0-1…P0-5, plus **Frontend** P0-1 | Three verified, easy-to-exploit holes (pod env read, cross-user sandbox, chat restore/delete) with small fixes. |
| 2 | **Auth** P0-1, P0-2 + **k8s** P0-4 (`.dockerignore`), then rotate the key | The signing key is in the image; every other auth fix is moot until it is rotated. |
| 3 | **Sandbox/sync-agent** P0-1 | One-line ignore rule; stops secrets going to S3. |
| 4 | **Sandbox/server** P0-1…P0-3 | Redis expiry handler can delete pods / crash; legacy start route. |
| 5 | **Sandbox/Agent + router + server + Frontend** sidecar auth | Biggest piece of work: tokens minted by server, checked by router and agent, sent by the Frontend. |
| 6 | **Payments** P0s, then **payments_frontend** P0s | Blacklist, admin verify, orderless checkout, placeholder email. |
| 7 | **k8s** P0-1…P0-3 | Example secrets, `NODE_ENV`/`CLIENT_URL`, RBAC. |
| 8 | P1s per service: Payments (day carryover), Auth (refresh race, logout), Notification (DLQ, amount), AI (patch_file, keep-alive, tier) | Correctness users will feel. |
| 9 | **docs** (label aspirational docs, fix README quick start) | Can run in parallel at any time; high value for the capstone review. |
| 10 | featureTobeBuild items, starting with each file's suggested order | |

## Files

| Service | Fixes | Features |
|---|---|---|
| Ai_orchestration | [fix.md](../../Ai_orchestration/fix.md) | [featureTobeBuild.md](../../Ai_orchestration/featureTobeBuild.md) |
| Auth | [fix.md](../../Auth/fix.md) | [featureTobeBuild.md](../../Auth/featureTobeBuild.md) |
| Payments | [fix.md](../../Payments/fix.md) | [featureTobeBuild.md](../../Payments/featureTobeBuild.md) |
| Notification | [fix.md](../../Notification/fix.md) | [featureTobeBuild.md](../../Notification/featureTobeBuild.md) |
| Sandbox/server | [fix.md](../../Sandbox/server/fix.md) | [featureTobeBuild.md](../../Sandbox/server/featureTobeBuild.md) |
| Sandbox/router | [fix.md](../../Sandbox/router/fix.md) | [featureTobeBuild.md](../../Sandbox/router/featureTobeBuild.md) |
| Sandbox/Agent | [fix.md](../../Sandbox/Agent/fix.md) | [featureTobeBuild.md](../../Sandbox/Agent/featureTobeBuild.md) |
| Sandbox/sync-agent | [fix.md](../../Sandbox/sync-agent/fix.md) | [featureTobeBuild.md](../../Sandbox/sync-agent/featureTobeBuild.md) |
| Sandbox/template | [fix.md](../../Sandbox/template/fix.md) | [featureTobeBuild.md](../../Sandbox/template/featureTobeBuild.md) |
| Frontend | [fix.md](../../Frontend/fix.md) | [featureTobeBuild.md](../../Frontend/featureTobeBuild.md) |
| payments_frontend | [fix.md](../../payments_frontend/fix.md) | [featureTobeBuild.md](../../payments_frontend/featureTobeBuild.md) |
| Admin | [fix.md](../../Admin/fix.md) | [featureTobeBuild.md](../../Admin/featureTobeBuild.md) |
| k8s / deployment | [fix.md](../../k8s/fix.md) | [featureTobeBuild.md](../../k8s/featureTobeBuild.md) |
| docs / root README | [fix.md](../fix.md) | n/a |

Nothing in code, config or git was changed. These are new Markdown files only; review and commit them by hand.
