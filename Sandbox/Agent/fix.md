# Sandbox/Agent (sidecar): fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report. Severity: **P0** security, **P1** correctness, **P2** hardening, **Docs**.

This is the highest-risk service in the repo: it runs arbitrary shell commands and is reachable from the public ingress with no authentication.

---

## P0: Security

### P0-1. No authentication on any endpoint ✅
- **Where:** `src/app.js` routes from line 79 (`/api/agent/health`) through `/api/agent/exec` (line 1246); Socket.IO server at lines ~190-258. Reachable from outside via `*.agent.localhost` → router → `sandbox-service-<id>:3000` (`k8s/ingress.yml:61-70`, `Sandbox/router/src/app.js`).
- **Impact:** anyone who knows or guesses a sandbox id (UUIDv7, time-ordered, so partly guessable) can read/write/delete files and run any shell command in that user's pod.
- **Fix (two layers, do both):**
  1. **Router gate (external traffic):** the router verifies a token before proxying `*.agent.*` (and optionally `*.preview.*`). See `Sandbox/router/fix.md`.
  2. **Sidecar gate (defence in depth, covers in-cluster calls from AI):** add an Express middleware that requires `Authorization: Bearer <token>` on every `/api/agent/*` route except `health`/`ready`, and the same token in the Socket.IO `auth` handshake. Accept either:
     - a short-lived **sandbox access token** (JWT, RS256) minted by Sandbox server with claims `{ sub: userId, sandboxId, aud: "sandbox-agent" }`, verified via Auth's JWKS or a Sandbox-server JWKS; check `sandboxId === process.env.SANDBOX_ID`; or
     - a per-pod **shared secret** injected at pod creation (`SANDBOX_AGENT_TOKEN`, random 32 bytes, stored in a k8s Secret owned by the pod) that only Sandbox server and AI can fetch.
  - Recommended: per-pod secret for AI→sidecar, scoped JWT for browser→router→sidecar.

### P0-2. One global PTY shared by every client, CORS `*` ✅
- **Where:** `pty.spawn` at line ~227, output broadcast with `io.emit("terminal-output")` (line 236, also 144); Socket.IO `cors: { origin: "*" }` (line 192).
- **Impact:** every connected client sees every other client's terminal; any website can open a socket to it.
- **Fix:** restrict CORS to the frontend origin(s). Require the token from P0-1 in the handshake. Spawn one PTY per authenticated socket (or per user) and `socket.emit` to that socket only; kill the PTY on disconnect. Cap concurrent PTYs per pod (e.g. 3).

### P0-3. `exec` runs any string ✅
- **Where:** `POST /api/agent/exec`, line 1246.
- **Fix:** after auth, also: run as a non-root user (check the dockerfile), keep the 30 s timeout and 1 MB output cap, reject commands that touch paths outside `/workspace`, and apply the same deny-list as AI's `guards.js` (see `Ai_orchestration/fix.md` P1-5). The pod-level controls (non-root, read-only root fs, no service-account token, network policy) live in `Sandbox/server/fix.md`.

### P0-4. Pod can read other tenants' pods and logs ✅
- **Where:** pods run as `sandbox-agent-sa` (`Sandbox/server/src/kubernetes/pod.js:13`), which has `get, list` on `pods` and `pods/log` in the whole `default` namespace (`k8s/rabc.yml`). `vite-runtime-errors` (line 1327) uses it; when `HOSTNAME` is unset it lists pods and may pick **another tenant's** pod (line ~1359).
- **Fix:** stop calling the Kubernetes API from inside the sandbox. Read Vite errors from the template container directly instead: the error reporter already POSTs to `/api/agent/report-error`; keep those in an in-memory ring buffer and serve them from `/vite-runtime-errors`. For Vite's own terminal output, have the template container write to a shared `emptyDir` log file that the agent tails. Then remove the `sandbox-agent-sa` Role and set `automountServiceAccountToken: false` on the pod.

---

## P1: Correctness

- **`exec` `timedOut` flag is probably never true 📄** (lines 1284-1316): verify the timeout path sets it before the response is sent, and that the child process is actually killed (`killSignal`, kill the process group, not just the shell).
- **`search-code` caps at 8 s ✅** (lines 1083-1202): fine, but document `timedOut`.
- **No k8s probes on `agent-container` ✅** (`pod.js` has no probe): add `readinessProbe` on `/api/agent/ready` and `livenessProbe` on `/api/agent/health` so AI does not call a sidecar that is still booting.
- **`WORKSPACE_DIR` is never read 📄:** either read it (default `/workspace`) or remove it from docs.
- **Template skills say "exactly 8 tools", there are 10 📄** (`Sandbox/template/skills`): update the count.

## P2: Hardening

- Add a request body size limit (`express.json({ limit: "2mb" })`) and a max file size on `read-file` (docs promise a 2 MB cap that does not exist).
- Validate every file path with one shared `resolveInsideWorkspace()` helper (the exec route already checks `path.sep`; make all routes use the same function).
- Rate-limit `exec` and `report-error` per connection.

## Docs

`Sandbox/Agent/README.md`, `docs/architecture/02-mcp-sandbox-sidecar.md`:
- It is plain Express REST under `/api/agent/*`, not MCP/JSON-RPC.
- Real endpoints: `health`, `ready`, `report-error`, `list-files`, `read-file?files=`, `update-file`, `create-file`, `delete-file`, `patch-file`, `search-code`, `exec`, `vite-runtime-errors`.
- The watcher emits `workspace-change`, not `file-change`. No Yjs. One global PTY today (until P0-2 is fixed).
- Remove "shell is never exposed to the internet" until P0-1 is done; then describe the token model.
- AI calls `sandbox-service-<id>:3000` directly, not via the router.
