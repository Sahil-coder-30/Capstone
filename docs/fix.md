# docs/ and root README: fixes

Doc-only fixes from Part 2 of the drift report that do not belong to one service. Service-specific doc drift is listed at the bottom of each service's `fix.md`.

Biggest credibility risk for the capstone review: docs describe features as built (with `[x]` checklists) that have no code. A reviewer who runs the README's `curl … /mcp` check gets a 404.

## Step 1: label aspirational docs (fastest, highest value)

For each doc below, either move it to `docs/proposals/` or add this header at the top, and flip every `[x]` for an unbuilt item back to `[ ]`:

> **Status: Proposed, not implemented.** Parts of this document describe the target design. See "Current state" for what the code does today.

| Doc | Unbuilt claims |
|---|---|
| `docs/architecture/02-mcp-sandbox-sidecar.md` | MCP/JSON-RPC, `ALLOWED_TOOLS_BY_ROLE`, command whitelist, `tools/list`, LRU, `TEMPLATE_TYPE` |
| `docs/architecture/04-distributed-transports-streaming.md` | gRPC, ALB, headless service, DLX |
| `docs/architecture/05-observability-and-error-handling.md` | ServiceMonitors, alerts, Alloy, Loki, `k8s/monitoring/`, Pino, request ids, `packages/faultkit` |
| `docs/architecture/06-api-contracts-and-specifications.md` | openapi-typescript, Spectral, Prism, request validators, gateway 422 |
| `docs/architecture/08-browser-agent-extension.md` | whole doc (all six `[x]`) |
| `docs/deep-dives/ai-orchestration-pipeline-middleware.md` | edgeSecurity, contentGuard, MCP, Redis `DECR` quota |
| `docs/deep-dives/orion-v3-benchmarks-world-comparison.md` | Jev Guard, JEV_DECIDE, tri-layer HMR, risk-only interrupt |
| `docs/infrastructure/grafana-prometheus-loki-stack.md` | manifests, `Helpers/metrics.js`, domain metrics |
| `docs/prd/taksha-codespace-prd.md` | MCP gateway, sidecar auth target, `.env` exclusion, failover, tier quotas, KMP patching |
| `Admin/README.md` | whole service |

## Step 2: root `README.md`

- Remove or label: Jev/RLCD "sub-100 ms routing brain", `POST /mcp` and its `curl` check, `ALLOWED_TOOLS_BY_ROLE`, MongoDB checkpoint, Vite HMR socket, Visual QA, gRPC, ALB, `ai_telemetry_queue`, sidecar "token" auth.
- Fix quick start: there is no root `package.json`. Describe `skaffold dev` with `k8s/secrets.yml` copied from the example, or per-service `npm run dev` with each `.env.example`.
- Service inventory: use the port table from `CLAUDE.md` (it was checked against code). `/readyz`, not `/ready`.
- Node count is 10. Debounce value 400 ms.
- MIT badge with no `LICENSE` file: add a LICENSE or remove the badge.

## Step 3: `docs/README.md` and links

- Invariants 3 and 4 (MCP, `errorSignatureHistory`, 16 hops) do not match code; rewrite to the real behaviour.
- Replace every absolute `file:///Users/...` link with a repo-relative link (search: `grep -rn "file:///" docs README.md`).

## Step 4: `docs/openapi.yaml`

- Add the ~25 missing routes (AI stream/batch-delete/health; Payments webhook, aliases, admin, analytics; Sandbox trash/restore/permanent; agent health and patch-file; router health; Auth `/metrics`).
- Fix health and JWKS paths (`/.well-known/jwks.json` is not under `/api`).
- Refresh never returns `TOKEN_REUSE_DETECTED`; Auth never returns `TOKEN_EXPIRED`. Either implement those codes or remove them.
- Logout does not "purge the refresh family" until `Auth/fix.md` P0-3 is done.
- Fix enums: tiers `free|pro|max`, package ids, transaction status casing.
- Define `CookieAuth` once, correctly (only the refresh route uses a cookie).
- Add an `ErrorResponse` schema matching FaultKit `{ success: false, error: { code, message } }`.

## Step 5: keep it from drifting again

- Add a "Last verified against code: <date>" line to each architecture doc.
- Re-run the EGM drift report after each service's fixes land.
