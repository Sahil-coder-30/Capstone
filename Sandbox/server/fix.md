# Sandbox/server: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report. Severity: **P0** security, **P1** correctness, **P2** hardening, **Docs**.

---

## P0: Security / data safety

### P0-1. Any expiring Redis key triggers a pod delete ✅
- **Where:** `src/config/redis.js:20-42`.
- **What happens:** the subscriber listens to `__keyevent@0__:expired` for **every** key in db 0 and runs `deletePod(key.split(':')[1])` with no prefix check. Auth's `blacklist:<token>` keys, Payments' `lock:cron:*` keys and AI rate-limit keys (if they share the Redis db) all fire this handler. A `blacklist:<jwt>` key produces a bogus "sandbox id" (`<jwt>`), the k8s delete throws, and the `await` inside the `message` handler has no try/catch → unhandled rejection. A key named `anything:<real sandboxId>` would delete a real pod.
- **Fix:**
  1. `if (!key.startsWith("sandbox:")) return;` at the top of the handler, and validate the id against the UUID pattern.
  2. Wrap the whole handler in try/catch; use `Promise.allSettled` for pod/service delete like the controllers do.
  3. Give each service its own Redis logical db (or key prefix + ACL) via `REDIS_URI` (`/1`, `/2`…). Subscribe to the matching `__keyevent@<db>__:expired` channel.
  4. `CONFIG SET notify-keyspace-events` at startup will fail on managed Redis (ElastiCache disables `CONFIG`). Move that to Redis config / Helm values and log a clear error if notifications are off.

### P0-2. Legacy `POST /api/sandbox/start` creates pods with no project and no limit ✅
- **Where:** `src/app/app.js:35` (outside the router).
- **Fix:** delete the route (developer approves), or make it return 410 Gone. Check the frontend does not call it (`Frontend/src/features/sandbox/service/sandbox.api.js`).

### P0-3. Raw error messages leak on 500 ✅
- **Where:** `src/middleware/error.middleware.js` returns `err.message` for every status, including k8s client errors that contain cluster details.
- **Fix:** for `statusCode >= 500` return a generic message plus a request id; log the full error server side. Adopt FaultKit like AI and Payments for one error shape.

### P0-4. Sandbox pod security context 📄
- Pods mount the `sandbox-agent-sa` token (namespace-wide `pods`/`pods/log` read) and run user code. See `Sandbox/Agent/fix.md` P0-4.
- **Fix in `src/kubernetes/pod.js`:** set `automountServiceAccountToken: false` (after the agent stops calling the k8s API), `securityContext: { runAsNonRoot: true, runAsUser: 1000, allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } }`, CPU/memory `requests`/`limits` per container, and an `ephemeral-storage` limit. Add a NetworkPolicy so sandbox pods cannot reach Mongo, Redis, RabbitMQ or other services (egress only to the internet/npm registry and DNS).
- **AWS creds:** every pod gets the bucket-wide keys from `aws-secret`. Scope with an IAM policy limited to `s3://<bucket>/<projectId>/*`, ideally via short-lived STS credentials per pod (see featureTobeBuild.md).

---

## P1: Correctness

### P1-1. Sandboxes expire mid agent run ✅
- 120 s TTL at creation (`redis.js:6-9`); only router traffic extends it. Add `POST /api/sandbox/keepalive/:projectId` (owner-checked, sets `EXPIRE sandbox:<id> 1200`), called by AI during runs. Also consider a longer initial TTL (e.g. 600 s) so a user who starts a sandbox and waits does not lose it.

### P1-2. Trashed projects count toward the cap and can still be started ✅
- `createProjectController` counts `Project.find({ user })` with no `deletionStatus` filter (line ~55). `startSandboxController` does not reject trashed projects.
- **Fix:** count only `deletionStatus: { $ne: "trash" }` (or decide that trash counts and say so in the UI), and return 409 when starting a trashed project. Use `countDocuments` instead of loading every document.

### P1-3. Status set to `live` before the pod is ready ✅
- `startSandboxController` sets `live` as soon as the create calls return (line ~240).
- **Fix:** keep `building` and let `getProjectStatusController` / `listAllProjectsController` (which already reconcile with the pod phase) flip it to `live` when the pod is `Running` and ready. Or poll readiness with a timeout before responding.

### P1-4. Permanent delete leaves workspace files in S3 ✅
- `permanentlyDeleteProjectController` removes pod, service, Redis key and the Mongo doc, but not `s3://<bucket>/<projectId>/`.
- **Fix:** delete the S3 prefix (batch `DeleteObjects`), or enqueue a cleanup job. Needed for user data deletion requests.

### P1-5. Race on concurrent start 📄
- Two quick `start` calls can both pass the status check. Use an atomic `findOneAndUpdate({ _id, status: { $nin: ["building"] } }, { status: "building" })` and return 409 if it does not match.

## P2: Hardening

- Add CORS config (ingress-only today), remove unused `cookie-parser`.
- `.env.example` uses `PORT=4000`, k8s uses 3000. Pick one.
- Add readiness that checks Mongo, Redis and the k8s API, not a static 200.
- Move k8s/Redis logic out of controllers into a `services/` layer (README already claims one).

## Docs

`Sandbox/server/README.md`:
- JWT is RS256 via `AUTH_JWKS_URI`, not `JWT_ACCESS_SECRET`.
- `create-project` only inserts a Mongo record; `start/:projectId` creates pod + service + Redis key.
- Auto-teardown is driven by Redis key expiry; the router does not check the key before proxying.
- Soft delete uses the `deletionStatus` enum. Pod AWS secret is `aws-secret`. HTTP probes exist.
