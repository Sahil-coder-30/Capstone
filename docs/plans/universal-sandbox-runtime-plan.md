# Plan: Universal sandbox runtime and preview gateway

Written 2026-11-26 from the thread "Evaluate browser rendering service idea". Checked against the code that day (`Sandbox/template/vite.config.js`, `Sandbox/server/src/kubernetes/pod.js` and `service.js`, `Sandbox/router/src/app.js`, `k8s/sandbox-networkpolicy.yml`, `Sandbox/Agent/dockerfile`). Plan only, nothing built.

## 1. Goal

Sahil's words: a seamless cloud experience, and an agent that can do **any kind of development** in its sandbox, installing whatever it needs, instead of Sahil hand-tweaking a Vite template for every framework.

Done means: in a fresh sandbox the agent can scaffold a Next.js app, a Vite app, a SvelteKit app or an Express/FastAPI backend, start it, and the user sees it live in the preview (with HMR) with **zero platform-specific lines in the project's own config**. The agent can see the app itself (console, errors, DOM, screenshot).

## 2. Decisions (Sahil, 2026-11-26)

| # | Decision | Rejected and why |
|---|---|---|
| D1 | User preview stays a **real URL** (`<id>.preview`, through the router) in an iframe | **Chromium service streaming pixels to the user.** Dev server still has to run, so templates do not go away. About 0.5 to 1 GB RAM and 0.5 to 1 vCPU per active user for a headed browser plus video encoding. Every click and keystroke is a round trip. Breaks the user's own DevTools, copy-paste, mobile view, file upload. A shared browser is multi-tenant (SSRF, cross-user risk). Backend projects have no UI to stream. Nobody in the market does this for previews: Lovable, Replit, CodeSandbox proxy a real dev server URL; Bolt runs Node in the user's browser (WebContainers). |
| D2 | **Generic runtime image + preview gateway** (Replit-style any framework) | Lovable-style single fixed stack: simpler but does not meet "any kind of development". |
| D3 | Install model: **non-root + `mise` and user-space package managers now, gVisor later** | Root in a plain container: one user's agent could attack the node and other sandboxes. Root + gVisor now: needs self-managed nodes and a RuntimeClass, slower I/O; kept as a later phase. Firecracker/Kata microVMs: need bare metal or nested virtualization, not free tier. |
| D4 | Headless Chromium is **for the agent only**, as already planned in agent-tools P3 | (see D1) |

Decisions I made inside the plan, open for Sahil to overrule, are marked **(proposed)** below.

## 3. What makes the template "tweaked" today (checked)

| Line in `vite.config.js` | Why it exists | What replaces it |
|---|---|---|
| `host: '0.0.0.0'` | The k8s Service sends traffic to the pod IP, so Vite must listen on all interfaces | The gateway runs **inside the pod** and reaches the dev server on `127.0.0.1` / `::1`. Default `localhost` binding is enough |
| `allowedHosts: true` | Router sends `Host: sandbox-service-<id>` (`changeOrigin`), Vite blocks unknown hosts | Gateway sends `Host: localhost:<port>` to the dev server |
| `hmr.clientPort: 80` | Browser must open the HMR socket on the public port, not 5173 | Gateway is same-origin with the page, so the default client logic (page origin) works. **Must be verified per framework in the R0 spike** |
| fixed `port: 5173` + Service `targetPort: 5173` | Router and Service only know one port | Gateway detects the port; Service points at the gateway |
| `error-reporter` plugin (inline script) | Only Vite plugins could inject the telemetry script | Gateway injects one `<script src>` into every HTML response, any framework |
| `proxy: /api/agent/report-error` → `:3000` | Telemetry has to reach the agent sidecar | Gateway serves the telemetry routes itself, no project config |
| `watch.usePolling` | File watching across containers on the shared volume | Keep as an env default only (`CHOKIDAR_USEPOLLING`, `WATCHPACK_POLLING`), verify in spike whether still needed |
| Pod `command: npm run dev` in the template container | Only one framework | Supervisor reads the project's run file (section 5.2) |

Also found: **port collision.** The agent sidecar listens on `3000` (`Sandbox/Agent/server.js`), which is the default port of Next.js, Express, Remix and many others. All containers in a pod share one network namespace, so a user's Next.js app fails with `EADDRINUSE`. Must move (R1).

Also found: **two different base images.** `template` is `node:20-alpine` (musl), `agent` is `node:20-bullseye` (glibc). Toolchains installed on the shared volume must run in both containers, so they need the same libc.

## 4. Target architecture

```
User browser (iframe <id>.preview)          Agent (AI service)
      |                                            |
      v                                            v
   Router (single entry point, edge auth)  --->  Router /internal/sandboxes/:id/mcp
      |                                            |
      v  Service port 80 -> 39080                  v  Service port 39000
 ┌──────────────────────── sandbox pod ─────────────────────────────┐
 │ agent container (uid 1000)                                        │
 │   sidecar :39000  (MCP tools, terminal, exec, telemetry buffers)  │
 │   preview gateway :39080 (port detect, Host rewrite, script       │
 │      inject, /__taksha/rt/* telemetry, "app not running" page)   │
 │   headless Chromium (lazy, P3) -> http://localhost:39080          │
 │                                                                   │
 │ runtime container (was "template", uid 1000)                      │
 │   taksha-run supervisor -> user's dev command (any framework)     │
 │   on 127.0.0.1:<any port>                                         │
 │                                                                   │
 │ sync-agent container -> S3 (/workspace, minus caches and tools)  │
 │                                                                   │
 │ shared: /workspace (code), /sandbox-run (logs, status, control)   │
 └───────────────────────────────────────────────────────────────────┘
```

Still three containers, router still the only door. Nothing calls a sidecar directly.

## 5. Components

### 5.1 Base image and toolchains (`mise`)

- Both `runtime` and `agent` images move to the same **Debian bookworm-slim** base (glibc), with `mise`, `git`, `curl`, build tools, and Node LTS + Python 3.12 **prebaked** so the common case downloads nothing.
- Anything else the agent installs with `mise use node@22`, `mise use go@1.23`, `pip install`, `npm i -g` etc. Paths: `MISE_DATA_DIR=/workspace/.taksha/tools`, `npm prefix`, `PIP_USER`, all under `/workspace` so both containers see them.
- The project records its toolchain in `mise.toml` (synced to S3 like any project file). **(proposed)** `/workspace/.taksha/tools` is **not** synced to S3 (added to the sync-agent ignore list next to `node_modules`); on a cold start the supervisor runs `mise install` from `mise.toml`. Reason: runtimes are 50 to 300 MB each and are reproducible.
- No root, no `apt`. Projects that truly need system packages wait for the gVisor phase (R7). The agent is told this in its tool description, so it picks a user-space alternative instead of looping on `sudo`.
- Workspace `emptyDir` gets a `sizeLimit` and the pod an `ephemeral-storage` request, so one sandbox cannot fill the node's disk. **(proposed)** 5 Gi on free tier.

### 5.2 Runtime container + `taksha-run` supervisor

- **(proposed)** The dev server keeps running in its own container, not in the agent container: its CPU and memory limits stay separate, so a runaway `next dev` cannot OOM-kill the agent sidecar (and the user's terminal with it).
- `taksha-run` is a tiny supervisor (Node, under `tini`) that reads `/workspace/.taksha/run.json`:
  ```json
  { "dev": "npm run dev", "cwd": ".", "port": null, "env": {} }
  ```
  `port: null` means detect. The file is project config, so it syncs with the project.
- It writes the process output to `/sandbox-run/dev.log` (replaces today's `vite.log` tee) and its state to `/sandbox-run/status.json` (`state: starting | running | crashed | stopped | no-command`, `pid`, `exitCode`, `startedAt`, `port`).
- Restart control is **file based** through the shared `/sandbox-run` volume: the agent writes `/sandbox-run/control.json` (`{ "action": "restart", "nonce": ... }`) and the supervisor reacts. No HTTP between containers, no `shareProcessNamespace`. `control.json` is not in `/workspace`, so it never reaches S3.
- Crash loop guard: backoff 1s → 30s, `crashed` after 5 fast exits, waits for the next control nonce.

### 5.3 Preview gateway (in the agent container)

- Listens on `:39080`. The Service maps port 80 → 39080 and 39000 → 39000. NetworkPolicy ingress ports change to 39080 and 39000.
- **Port choice, in order:** `run.json` port, then `status.json` port, then the newest LISTEN socket in `/proc/net/tcp` and `/proc/net/tcp6` (same network namespace for the whole pod) owned by uid 1000, excluding reserved ports 39000 to 39099. Re-checked on each miss, cached for a few seconds.
- **Proxy:** HTTP and WebSocket to `127.0.0.1:<port>`, falling back to `[::1]:<port>` (Node 18+ often binds `localhost` to IPv6 only). Sends `Host: localhost:<port>`, keeps `X-Forwarded-Host` and `X-Forwarded-Proto` from the router.
- **Script injection:** only for `text/html` responses. Asks the upstream for `Accept-Encoding: identity` on navigations, inserts `<script src="/__taksha/rt/telemetry.js" defer></script>` before `</head>` (or at the start of `<body>`), caps the rewritten size, streams everything else untouched. If the page sends a CSP that would block it, **do not edit the CSP**: skip injection and expose `telemetryBlocked: true` so the agent tools say why their lists are empty.
- **Telemetry routes** `/__taksha/rt/*` (script + batch POST) are served by the gateway and land in the sidecar's in-memory buffers from agent-tools P1. Same rules as P1: open route, cleaned fields, capped batch, rate limited. This replaces the `report-error` Vite proxy and the old `POD_ONLY_AGENT_PATHS` rule in the router.
- The router keeps owning `/__taksha/session` and `/__taksha/share`; it passes `/__taksha/rt/*` through to the pod. The gateway refuses any other `/__taksha/*` path so the two never collide.
- **App not running:** instead of a 502, the gateway serves a small page with the state from `status.json` and the last lines of `dev.log`, and reloads itself when the app comes up.

### 5.4 Agent tools (adds to the agent-tools plan)

| Tool | Phase there | Change |
|---|---|---|
| `restart_dev_server` | P3 | Writes `control.json`, waits for `status.json` = running and a port, returns both |
| `get_dev_server_log` | P1 | Reads `/sandbox-run/dev.log` (any framework) |
| `set_run_command` | new | Writes `run.json` after validating it (no shell metacharacters outside the command string, cwd inside `/workspace`) |
| `get_dev_server_status` | new | Returns `status.json` + detected port + `telemetryBlocked` |
| `screenshot`, `get_dom`, `browser_action` | P3 | Chromium opens `http://localhost:39080`, so it gets the injected telemetry too |

Prompt rules: scaffold non-interactively (`--yes`, `--no-install` then install), never `sudo`, record runtimes in `mise.toml`, set the run command, then prove the app works with `get_browser_errors` + `get_dom` or `screenshot` before saying done.

### 5.5 Templates become optional starters

- New projects can start **empty** (agent scaffolds) or from a starter. Starters are plain framework projects with **no** Taksha lines.
- Existing projects keep working: their old `vite.config.js` lines are harmless behind the gateway, and a missing `run.json` defaults to `npm run dev`.

## 6. Security

- Still non-root, all capabilities dropped, `seccomp RuntimeDefault`, no service account token.
- Installing anything needs internet egress. `k8s/sandbox-networkpolicy.yml` already allows public internet and blocks private ranges and cloud metadata, so registries work and the cluster stays closed. Only the ingress ports change.
- Prompt injection: package READMEs, install scripts and page text are data, never instructions (same rule as P1 telemetry).
- Abuse (crypto mining, spam): CPU limits stay; tool-call analytics and the admin dashboard flag long 100% CPU runs. Egress rate limiting is a later item.
- Chromium in the agent container only opens `localhost:39080`, a fresh context per call (P3 rule).

## 7. Cost and scale (free tier)

- No new per-user always-on process. Gateway is a few MB in the existing agent container. Chromium starts only on the first See call and stops after 5 idle minutes (P3).
- Bigger cost is disk and cold start: prebaked Node + Python keeps the common cold start close to today; unusual runtimes add a download on every cold start (no S3 sync of tools).
- Agent container memory limit (512Mi today) will need to rise when Chromium is running; decided by the P3 spike.
- Framework dev servers are heavier than Vite (Next.js dev often 500 MB to 1 GB). The runtime container limit (512Mi today) needs a per-plan size; ties into Payments plan tiers.

## 8. Phases

| Phase | Work | Done when |
|---|---|---|
| **R0 Spike (2 to 3 days)** | Throwaway gateway in a test pod: HMR through a same-origin proxy for Vite, Next.js, SvelteKit, Astro, plain Express; IPv6 localhost; `/proc/net/tcp` detection; `mise` as uid 1000 on bookworm; injection with and without CSP; polling needed or not | A table of framework × result; any framework that needs a config line is listed with the exact line |
| R1 Ports and base | Sidecar 3000 → 39000 (sidecar, Service, router `SANDBOX_URL_TEMPLATE`, NetworkPolicy, Frontend landing text); both images on bookworm-slim with `mise` | Next.js on port 3000 starts in a sandbox; all router + sidecar tests green |
| R2 Supervisor | `taksha-run`, `run.json`, `/sandbox-run` volume, status and control files | Changing `run.json` restarts the app; crash loop lands in `crashed` |
| R3 Gateway | Section 5.3, Service port 80 → 39080, router passes `/__taksha/rt/*` | Same preview works for Vite and Next.js with no Taksha lines in their config |
| R4 Toolchains | `MISE_DATA_DIR`, prebaked runtimes, sync-agent ignore, cold-start `mise install`, workspace `sizeLimit` | Agent installs Go, builds and runs a Go server, preview shows it; restart restores it |
| R5 Agent tools | Section 5.4 tools and prompt rules (depends on agent-tools P1 buffers and P3 browser) | Agent scaffolds Next.js from an empty sandbox and proves it with `get_dom` |
| R6 Starters | Strip Taksha lines from the Vite template, add empty project option | New project from a starter has a clean config |
| R7 Later: gVisor | `runsc` RuntimeClass on self-managed nodes, root inside the sandbox, real `apt` | Only after the cluster is on nodes we control; separate plan |

**(proposed)** Order in the project checklist: R0 to R3 right after agent-tools P1 (they replace the P1 Vite-script work, so P1 does less), R4 and R5 together with agent-tools P3.

## 9. Open questions for Sahil

1. Backend-only projects: should the preview tab show an API panel (send requests, see responses and logs) instead of a page? Not in this plan yet.
2. OK to not sync installed runtimes to S3 and reinstall from `mise.toml` on cold start?
3. Which runtimes to prebake besides Node LTS and Python 3.12 (Go? Bun? Java)?
4. Sidecar port `39000` and gateway `39080`, fine?
5. Per-plan memory for the runtime container (Next.js dev needs more than 512Mi).
