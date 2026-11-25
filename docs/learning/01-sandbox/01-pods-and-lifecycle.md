# Sandbox 1: pods, idle cleanup, S3 sync, hardening

> **Shipped:** Jun–Jul 2026, hardened Nov 2026 · **Commits:** `2da9caf` `350cee8` (TTL) `6f87f3c` (sync) `e913250` (hardening) `300a998` (expiry fix)
> **Services:** Sandbox server, Router, Sandbox pod (template, agent, sync-agent)
> **One line:** every project gets its own live dev environment that starts on demand, dies when idle, and keeps its files in S3.

## 1. What it is

A user can have up to 5 projects. Starting one creates a Kubernetes pod and Service just for that project. The pod runs the user's Vite app, an agent sidecar for files and terminal, and a sync agent that saves every file change to S3. If nobody uses the sandbox for a while, it is deleted automatically and restored from S3 next time.

## 2. How it flows

```
POST /api/sandbox/start/:projectId
        │
        ▼
 Sandbox server ──► k8s API: create Pod sandbox-pod-<id> + Service sandbox-service-<id>
        │                 init: template (seed files) → sync-agent --restore-only (S3 pull)
        │                       → fix-permissions (chown 1000)
        │                 run:  template (Vite :5173) | agent (:3000) | sync-agent (S3 push)
        └──► Redis SET sandbox:<id> EX 120

 Every request through the Router ──► EXPIRE sandbox:<id> 1200   (keeps it alive)

 Key expires ──► Redis keyspace event "expired" ──► Sandbox server
                 ──► delete Pod + Service, project status = down
```

1. `POST /api/sandbox/create-project` stores a project with a UUIDv7 `sandboxId`, status `not_started` (`Sandbox/server/src/controllers/sandbox.controller.js`).
2. Start runs `services/sandboxLifecycle.service.js` (shared with the router's wake call), which builds the pod in `kubernetes/pod.js`.
3. Init containers run in order: copy the template, restore the workspace from S3, fix file ownership.
4. Redis key `sandbox:<id>` gets a 120 s TTL. The router refreshes it to 1200 s on every request.
5. The Sandbox server turns on Redis keyspace notifications at startup (`CONFIG SET`) and listens for expired keys. Only keys with the `sandbox:` prefix trigger cleanup (`300a998`).
6. `GET /api/sandbox/projects` reconciles the DB status with the real pod phase.
7. The sync-agent (`Sandbox/sync-agent/sync.js`) watches `/workspace` with chokidar, debounces each file for 400 ms, uploads with at most 8 parallel S3 calls (`p-limit`), retries with backoff, and deletes S3 objects when files are removed.

## 3. Decisions (and what was rejected)

| Decision | Rejected alternatives | Why this one |
|---|---|---|
| One pod per project, 3 containers sharing a volume | One big pod for all users; a VM per user; Docker-in-Docker | Pod gives process, network and resource isolation cheaply. Containers share `/workspace` through an `emptyDir` but each has one job |
| Idle timeout with a Redis TTL key + keyspace notifications | A cron that scans all pods; a timer in the Sandbox server process | The TTL is the state itself: no scan, survives a Sandbox server restart, and the router can refresh it with one `EXPIRE` |
| Short TTL on start (120 s), long TTL after use (1200 s) | One fixed TTL | A sandbox that was started but never opened dies fast and frees the node |
| Sync agent as its own container, the only one with S3 keys | Upload from the agent sidecar | The sidecar runs user commands; keeping S3 credentials out of it limits what user code can steal. Also, a stalled S3 upload never blocks the terminal |
| Debounce per file (400 ms) + concurrency cap (8) | Upload on every event; a full sync on a timer | An agent writing 20 files in 2 s becomes 20 uploads, not hundreds, and S3 is not throttled |
| Restore in an init container before the app starts | Restore inside the running sync-agent | Vite must not start on half-restored files |
| Max 5 projects per user | No limit | Pods cost real CPU and memory |

### Hardening against user code (`e913250`, 2026-11-05)

User code runs in the agent container (terminal, exec) and in Vite. Before this commit it ran as root, and the pod mounted a service account token that could read every pod's logs in the namespace, Auth and Payments included.

| Change | Why |
|---|---|
| `automountServiceAccountToken: false`, `sandbox-agent-sa` removed | User code cannot talk to the k8s API |
| `template` and `agent` run as uid 1000, no privilege escalation, all capabilities dropped | Escaping the container gets much harder |
| Vite output teed to a shared `emptyDir` file; the sidecar reads its tail | The sidecar no longer needs the k8s client to read logs |
| Paths checked after resolving symlinks; search does not follow symlinks out | A symlink to `/etc` cannot read outside `/workspace` |
| `report-error` (open route) rate limited, capped, control characters stripped | The preview app cannot inject escape sequences into the owner's terminal |
| NetworkPolicy: ingress only from the router; egress only DNS, Auth and the public internet (private ranges blocked) | A compromised pod cannot reach Mongo, Redis or other services. Not enforced on Docker Desktop |

## 4. Failure cases

| What breaks | What happens |
|---|---|
| Another service's Redis key expires (for example a rate limit bucket) | Ignored. Before `300a998` the handler treated any key as a sandbox id, tried to delete pod "tokenbucket", and an unhandled 404 could crash the server |
| Pod deletion fails in one cleanup step | Each step has its own try/catch, so the rest still runs |
| Sync agent crashes | Vite and the terminal keep working; files already synced are safe in S3 |
| S3 list fails during restore | **Known gap:** it continues with the template, and a later edit can overwrite the real file in S3 (audit X5) |
| Pod is stopped | **Known gap:** deleted with grace period 0 and sync-agent runs under nodemon, so edits inside the last 400 ms can be lost (audit X4) |

## 5. Known limits

- F3 "safe sandbox stop" (grace period, final flush, restore fails closed) is planned in `docs/plans/platform-foundations-plan.md`, not built.
- No cap on live sandboxes per node yet (audit L-4: a 24 GB node fits about 10 to 12).
- `previewUrl` is hardcoded to `http://<id>.preview.localhost`.

## 6. Interview questions

**Q1. How do you clean up idle sandboxes?**
A: Each live sandbox has a Redis key `sandbox:<id>` with a TTL. The router refreshes it on every request, so an active sandbox never expires. When nobody touches it for 20 minutes, Redis expires the key and publishes a keyspace event. The Sandbox server subscribes to those events and deletes the pod and service and marks the project down. No polling and no timers in memory.

**Q2. Redis keyspace notifications are fire-and-forget. What if the Sandbox server is down when a key expires?**
A: The event is lost, so the pod would keep running. The safety net is reconciliation: `GET /api/sandbox/projects` compares DB status with the real pod phase. A stronger fix is a periodic sweep that lists sandbox pods and deletes any whose Redis key no longer exists. That is a good follow-up to mention.

**Q3. Why is S3 sync its own container instead of part of the agent sidecar?**
A: Least privilege and failure isolation. The agent sidecar runs commands the user or AI types, so anything in its environment can be read by user code. Only the sync-agent has S3 credentials. And if S3 is slow, uploads back up in the sync-agent, not in the terminal or file API.

**Q4. How do you avoid hammering S3 when the AI writes many files?**
A: A debounce map keyed by file path: each new event for a file resets its 400 ms timer, so only the final version uploads. All S3 calls go through `p-limit(8)`. Failed uploads retry with exponential backoff up to 5 times.

**Q5. What data can be lost today and how would you fix it?**
A: Two cases from my own audit. The pod is deleted with grace period 0, so the sync-agent never gets SIGTERM to flush its pending debounced writes. And if the S3 list fails during restore, the pod starts from the template and the next edit can overwrite the real file. The fix is a grace period with a flush hook on SIGTERM, running sync-agent with plain node instead of nodemon, and making restore fail closed so the project shows an error instead of an empty template.

**Q6. The user can run any command in their sandbox. How do you stop them attacking the cluster?**
A: Layers. No service account token, so no k8s API. Containers run as non-root with all capabilities dropped. A NetworkPolicy blocks private IP ranges on egress, so `npm install` works but Mongo, Redis and other pods are unreachable, and only the router may connect in. S3 credentials live only in the sync-agent. I found the service account problem myself: the old token could read Auth's and Payments' pod logs.

**Q7. Why UUIDv7 for sandbox ids?**
A: It is time ordered, so indexes stay compact, and it is still unguessable enough to be safe as a hostname label. (The router also validates it as a single DNS label.)

## 7. Revise in 60 seconds

- Pod per project: template (Vite), agent (sidecar), sync-agent (S3), three init steps.
- Idle cleanup = Redis TTL key + keyspace notifications, router refreshes on every request.
- Only `sandbox:` keys trigger deletion (bug fixed in `300a998`).
- Sync agent: chokidar, 400 ms per-file debounce, 8 parallel uploads, retries.
- Hardening: no SA token, uid 1000, caps dropped, NetworkPolicy (router in, no private ranges out).
- Open gaps: grace-0 stop and restore that does not fail closed (F3).
