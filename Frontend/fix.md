# Frontend: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report. Severity: **P0** security, **P1** correctness, **P2** cleanup, **Docs**.

---

## P0: Security-related

### P0-1. Legacy chat hook sends only `sessionId` to Clio ✅
- **Where:** `src/features/chat/Hooks/chat.hooks.js:175-185` sends `{ sessionId: sandboxId, workspacePath, activeFile, ... }`. This is exactly the shape that bypasses the AI ownership check (`Ai_orchestration/fix.md` P0-2). The copilot hook (`features/copilot/Hooks/copilot.hooks.js:47-58`) already sends `projectId` + `sandboxId`.
- **Fix:** delete `features/chat` (the report calls it an unused duplicate of `coding-agent`/`copilot`; confirm no imports first, developer approves the delete), or switch it to send `projectId` + `sandboxId`. Stop sending `workspacePath` from every hook once AI ignores it.

### P0-2. Sidecar calls carry no token 📄
- `features/logs/service/logs.api.js`, `features/editor/service/editor.api.js`, `features/editor/Hooks/useWorkspaceSync.js`, `features/editor/components/TerminalShell.jsx` call `*.agent.localhost` (via `/api/agent-proxy` and `/api/terminal-proxy`) with no bearer token.
- **Fix (after Sandbox router/agent auth exists):** fetch a sandbox access token from Sandbox server when a project opens, attach it as `Authorization: Bearer` on agent HTTP calls and in the Socket.IO `auth` payload for the terminal, and refresh it before expiry.

---

## P1: Correctness

### P1-1. Settings services fake success on any error ✅
- **Where:** `src/features/settings/service/settings.api.js` (e.g. `fetchCreditAPI` lines ~75-93 returns a fake free plan with 20 credits; 10 `catch` blocks return made-up success).
- **Impact:** the hooks' error paths never run; users see wrong balances and "saved" messages for writes that failed.
- **Fix:** remove the fake fallbacks; let errors throw and show an error state. If an offline placeholder is wanted for reads, mark it (`{ stale: true }`) and show it as such.

### P1-2. Fake API key generation ✅
- **Where:** `settings.api.js:190-205` posts to `/api/settings/keys` (no such backend route) and on failure invents `sk_test_...<Math.random>`.
- **Fix:** hide the API keys section behind a feature flag until a backend exists (see featureTobeBuild.md), and remove the fake key.

### P1-3. Calls to routes that do not exist ✅
- `PATCH /api/payments/subscription` (`settings.api.js:99`, `features/payments/service/payments.api.js:28`) → 404. Real route is `PATCH /api/payments/credit/subscription` (admin-only for paid tiers). Paid upgrades should go through payments_frontend checkout; free downgrade needs a backend decision (see `Payments/fix.md` P1-8).
- `GET /api/sandbox/health/:id` (`features/sandbox/service/sandbox.api.js:29`) → no such route. Use `GET /api/sandbox/project/:projectId` (reconciles pod phase).
- `POST /api/ai/invoke` (`features/coding-agent/service/codingAgent.api.js:9`, `features/chat/service/chat.api.js:9`) → no such route. The live code uses `/api/ai/code-agent/invoke` via `authenticatedFetch` in hooks. Delete the dead api files or point them at the real route.

### P1-4. "Razorpay checkout done" is false for this app 📄
- This app has no Razorpay; subscription changes 404. Link "Upgrade" to payments_frontend (`/payments/`) instead of calling the API directly.

### P1-5. Theme flashes and "system" saves `dark` 📄
- Apply the theme before first paint (inline script in `index.html` that reads `localStorage` and sets `data-theme`). Store `system` as `system` and resolve it with `matchMedia`. Sync the preference from Auth `/preferences` on login (currently never applied across devices).

## P2: Cleanup

- Unused API modules: `codingAgent`, `copilot`, `dashboard` api files are never imported; components call `authenticatedFetch` directly. Pick one pattern (service files) and delete the rest.
- `features/chat` duplicates `coding-agent`; remove after P0-1.
- Vite dev proxy `/api/agent-proxy` and `/api/terminal-proxy` exist only in dev (`vite.config.js`). Production needs a real path (ingress) to the router; document or build it.
- `dist/` is in the folder; make sure it is gitignored.

## Docs

`Frontend/README.md`, `docs/frontend/frontend-architecture-and-design-tokens.md`:
- AI streaming is SSE (fetch + reader), not Socket.IO. Socket.IO is used only for the terminal and `workspace-change` events.
- No Redux thunks; access token is a module variable in `services/apiClient.js`.
- Dexie is in active use; document the real schema (DB name, versions, tables) so nobody generates an incompatible one.
- Vite 8, not 7. No inline completion. GSAP not used in layout. Remove the "Production" status claim.
