# Plan: Sandbox MCP server + shared MCP client

Status: **draft for review** (2026-11-03). Nothing here is built yet.

## 1. Goal

Every sandbox exposes its workspace tools as an **MCP server**. Three kinds of clients use the same server:

| Client | How it connects | Credential |
|---|---|---|
| Orion (coding agent, AI service) | in-cluster, `http://sandbox-service-<id>:3000/mcp` | per-sandbox service key |
| Clio (copilot, AI service) | same MCP client module as Orion | per-sandbox service key |
| External harness (Claude Code, Cursor, Codex, any MCP client) | public URL through ingress and router | user-created MCP token |

Why: one tool implementation for all agents, and users who prefer their own agent can code in their Taksha sandbox without using Orion.

Non-goals for v1: OAuth one-click connect, MCP resources/prompts, multi-replica AI service.

## 2. What the code does today (facts this plan builds on)

| Fact | Where |
|---|---|
| Each sandbox pod runs `sandbox-container` (Vite :5173), `agent-container` (sidecar :3000), `sync-agent-container` (S3). | `Sandbox/server/src/kubernetes/pod.js` |
| Service `sandbox-service-<id>` exposes 80 -> 5173 and 3000 -> 3000. | `kubernetes/service.js` |
| The sidecar REST API (`/api/agent/*`: list, read, create, update, patch, delete, search, exec, vite logs) has **no auth**. | `Sandbox/Agent/src/app.js` |
| `exec` runs shell commands **inside the agent container**. | `app.js` `/api/agent/exec` |
| The agent container mounts the `sandbox-agent-sa` token: `get/list` on `pods` and `pods/log` in namespace `default`. | `pod.js`, `k8s/rabc.yml` |
| `safeResolve` uses `path.resolve` only, so symlinks inside `/workspace` are followed. | `app.js:40` |
| Router proxies `<id>.agent.localhost` to the sidecar and refreshes the sandbox TTL (1200s) on every request. Expiry deletes the pod. | `Sandbox/router/src/app.js` |
| AI tools live in `Ai_orchestration/src/agent/tools/`, and all sidecar HTTP goes through `tools/sandbox.client.js`. | refactor `2e16c83` |
| The frontend also uses the sidecar REST API (file tree, editor sync, terminal socket). | `Frontend/vite.config.js` proxies |

## 3. Blockers to fix first (P0, security)

Exposing tools to the internet multiplies three existing holes. They must be closed before P3.

| # | Problem | Fix |
|---|---|---|
| S1 | Anyone in the cluster can call any sidecar (no auth). | Sidecar requires `X-Sandbox-Key` on `/api/agent/*` and `/mcp`. Key = `HMAC_SHA256(SANDBOX_KEY_SECRET, sandboxId)`. Sandbox server injects it into the pod env; AI service and router derive it from the shared secret (new k8s secret `sandbox-key`). Compare with `timingSafeEqual`. The frontend proxy path goes through the router, which adds the key after checking the user (see P3). |
| S2 | `exec` can read the service account token and then every pod log in `default` (Auth, Payments included). | Set `automountServiceAccountToken: false` on sandbox pods. Vite logs: the template container writes `vite 2>&1 \| tee /workspace-logs/vite.log` to a shared `emptyDir`; the sidecar reads the file tail. Delete `sandbox-agent-sa` RBAC. |
| S3 | Symlink escape: `ln -s /var/run/secrets x` then `read_file x`. Matters for tokens without `exec` scope. | `safeResolve` uses `fs.realpath` on the target (or its nearest existing parent for new files) and checks the real path stays in `/workspace`. |
| S4 (recommended) | Sandbox pods can reach internal services (Mongo, Redis, auth). | `NetworkPolicy`: sandbox pods egress only DNS + public internet; ingress only from router, ai-service, sandbox-service. |

## 4. Target architecture

```
External harness ──HTTPS──> ingress (mcp.<domain>) ──> router
                                                        │ 1. token -> {sandboxId, userId, scopes}  (Redis, Mongo fallback)
                                                        │ 2. rate limit, wake sandbox if down
                                                        │ 3. add X-Sandbox-Key + X-MCP-Scopes, refresh TTL
                                                        ▼
AI service (Orion, Clio) ──X-Sandbox-Key──> sandbox-service-<id>:3000/mcp   (agent container)
                                                        │
                                                        └─ same tool handlers as /api/agent/* (REST stays for the frontend)
```

### 4.1 MCP server (in the existing agent container)

The agent container becomes the MCP server, as planned. No new container: each pod already requests ~1.1 GB of memory, and the tools need the same `/workspace` mount anyway.

- Package: `@modelcontextprotocol/sdk` (1.32.x), `McpServer` + `StreamableHTTPServerTransport` mounted at `POST/GET /mcp` on the same Express app (port 3000).
- **Stateless mode** (`sessionIdGenerator: undefined`): no session to lose when the pod restarts, and each call stands alone. Progress notifications still work inside a single request's SSE response.
- DNS-rebinding protection on (`allowedHosts`), Origin check for browser clients.
- Code layout in `Sandbox/Agent/src/`:

```
mcp/
  server.js          builds McpServer, registers tools by scope
  tools/files.js     list_files, read_file, create_file, update_file, patch_file, delete_file
  tools/search.js    search_code
  tools/command.js   execute_command, get_vite_runtime_errors
  scopes.js          read | write | exec  -> tool names
workspace/           the existing handlers, moved out of app.js so REST and MCP share them
```

- Tool names, schemas and result shape stay exactly as in `Ai_orchestration/src/agent/tools/` today, so prompts and guards do not change. The logic now in the AI-side wrappers moves into the server (benefits external harnesses too): output caps (24k chars, file 40k), `patch_file` trimmed retry, `execute_command` tail of stdout/stderr, `read_file` max 10 files.
- Failures return `isError: true` plus the same `{ "error": true, "message": ... }` JSON text.
- `execute_command` sends a progress notification every 10s so clients with a 60s request timeout stay alive; hard limit stays 120s.
- `search_internet` stays in the AI service (needs the Tavily key; no secrets in sandbox pods).

### 4.2 Scopes

| Scope | Tools | Default for new external tokens |
|---|---|---|
| `read` | list_files, read_file, search_code, get_vite_runtime_errors | on |
| `write` | create_file, update_file, patch_file, delete_file | on |
| `exec` | execute_command | on, with a warning: it gives full shell access to the container |

The AI service key gets all scopes. A tool outside the caller's scopes is not even listed in `tools/list`.

### 4.3 MCP client (AI service, shared by Orion and Clio)

New file `Ai_orchestration/src/agent/tools/mcp.client.js`, used only through `tools/index.js`:

- Uses the SDK `Client` + `StreamableHTTPClientTransport` directly with a ~60-line adapter that turns MCP tools into LangChain tools. Reason: `@langchain/mcp-adapters` 2.x needs `@langchain/langgraph ^1.4.18` (we have 1.3.6), and the own adapter gives control over timeouts and `isError`.
- `getSandboxTools(config)` lists tools once per sandbox and caches the definitions (keyed by sidecar image version from `serverInfo.version`).
- `callSandboxTool(config, name, args)` for deterministic nodes (planner file list, tester build, reviewer reads), replacing the direct REST helpers in `sandbox.client.js`.
- Connection cache: one client per sandbox, closed after 5 minutes idle and at run end.
- Per-call timeout 150s for `execute_command`, 30s otherwise, with `resetTimeoutOnProgress`.
- Retry: once on connect failure or 404/503 before the request was sent. Never auto-retry `execute_command` or writes after the request may have reached the server; return an honest error to the model instead.
- Tool sets per role stay a name filter (`READ_ONLY_TOOLS`, `CODER_TOOLS`, ...), plus the local `search_internet`.
- `core/toolLoop.js` and the guards stay unchanged. Tool events still stream to the UI because the adapter tools are normal LangChain tools invoked with the node config.
- `agent:tool_log` lines (today written by the tools) are produced by the run service from `on_tool_start/on_tool_end`, so the frontend keeps working.

### 4.4 Rollout flag

`SANDBOX_TOOL_TRANSPORT=rest|mcp` in the AI service. Pods started before the new sidecar image have no `/mcp`; with `mcp`, a 404 on `/mcp` falls back to REST for that sandbox and logs a warning. Remove REST from the AI service once all pods have restarted.

### 4.5 External access

**Tokens** (Sandbox server owns them; it already owns project -> sandbox mapping):

| Endpoint | Purpose |
|---|---|
| `POST /api/sandbox/mcp-tokens` `{ projectId, name, scopes, expiresInDays }` | Create. Returns `tks_mcp_<32 random bytes base62>` **once**. |
| `GET /api/sandbox/mcp-tokens?projectId=` | List (name, scopes, created, last used, expiry). Never the token. |
| `DELETE /api/sandbox/mcp-tokens/:id` | Revoke. Deletes the Redis cache entry at once. |

- Stored as SHA-256 hash in Mongo `sandbox.mcpTokens` with `userId`, `projectId`, `sandboxId`, `scopes`, `expiresAt`, `lastUsedAt`. Redis cache `mcp-token:<hash>` with TTL = min(expiry, 1h).
- Limits: 10 active tokens per project, default expiry 30 days, max 90.
- Deleting or trashing the project revokes its tokens.
- Owner check uses the verified JWT (`req.user.id`), never a body field.

**URL:** one URL for every project: `https://mcp.<domain>/mcp` (dev: `http://mcp.localhost/mcp`). The token selects the sandbox, so users copy one URL and TLS needs one certificate.

**Router** (new host `mcp.*` in `k8s/ingress.yml`):
1. Read `Authorization: Bearer tks_mcp_...`; missing or bad -> `401` with `WWW-Authenticate: Bearer`.
2. Resolve the token (Redis, then Sandbox server internal lookup on miss). Expired or revoked -> `401`.
3. Rate limit per token (Redis token bucket, e.g. 120 calls/min, 20 concurrent) -> `429` with `Retry-After`.
4. Sandbox down -> call Sandbox server `POST /internal/sandboxes/:sandboxId/wake`, wait up to 45s for readiness; still not ready -> `503` + `Retry-After: 15` with a JSON-RPC error "Sandbox is starting".
5. Refresh the TTL, add `X-Sandbox-Key` and `X-MCP-Scopes`, strip the user's `Authorization`, proxy to `sandbox-service-<id>:3000/mcp` with streaming (no buffering) and a 180s timeout.
6. Update `lastUsedAt` at most once per minute.

**Frontend:** project settings get a "Connect your own agent" panel: create / list / revoke tokens, and ready-to-copy snippets:

```
claude mcp add --transport http taksha http://mcp.localhost/mcp --header "Authorization: Bearer tks_mcp_..."
```

plus the JSON block for Cursor and Codex. An "External agent connected" badge shows while a token was used in the last 2 minutes.

## 5. Edge cases

| Case | Behavior |
|---|---|
| Sandbox stopped (TTL expired) | External: auto-wake (4.5 step 4). Orion/Clio: the run fails early with "Start the sandbox" as today. |
| Pod restarts mid-run | Stateless server, so the next call just works. A call in flight fails; the tool loop shows the error to the model. |
| Old pod without `/mcp` | REST fallback via the rollout flag. |
| Long `npm install` (>60s) | Progress notifications every 10s; 150s client timeout; 120s server limit with a clear timeout error. |
| Huge outputs or files | Server-side caps with `truncated: true` and a hint to narrow the request. |
| Binary files | `read_file` returns `{ error: "binary file, size N" }`, never raw bytes. |
| Orion and an external agent edit the same file | Allowed. `patch_file` exact match fails safely if the file changed; Orion re-reads before writing (coder prompt rule). The editor already live-syncs file changes. v2 option: per-project "exclusive mode" that makes external write tools return "Orion is running". |
| Two external harnesses on one project | Allowed; same rules as above. |
| Token leaked | Revoke takes effect at once (Redis delete). Tokens are hashed at rest and only shown once. |
| Token for project A used on project B | Impossible: the token decides the sandbox; there is no sandbox id in the URL. |
| Project deleted or trashed | Tokens revoked; router returns 401. |
| User downgrades plan | Decide in open question 1; router checks the plan on token lookup. |
| Prompt injection inside repo files | Same risk as today for Orion; external harnesses run under the user's own control. Tool results are data, the server never executes instructions from file content. |
| Path tricks (`../`, absolute, symlink) | S3 realpath check, for both REST and MCP. |
| Dev servers via `execute_command` | Same block as the AI-side shell guard, now enforced in the server for every client. |
| AI service restarts | Clients are rebuilt on demand; runs in memory are lost (known single-replica limit). |

## 6. Phases

| Phase | Work | Done when |
|---|---|---|
| **P0** Security | S1 sandbox key, S2 no SA token + Vite log file, S3 realpath, S4 NetworkPolicy | `cat` of the SA token path fails in a sandbox; an unauthenticated in-cluster call to `:3000` returns 401; existing features still work |
| **P1** MCP server | `mcp/` in the agent container, handlers shared with REST, scopes, progress | MCP Inspector lists and calls every tool against a local pod; unit tests with the SDK `InMemoryTransport` |
| **P2** MCP client | `mcp.client.js`, adapter, Orion + Clio + deterministic nodes switched, rollout flag | AI offline tests run against an in-process MCP server; `npm run e2e:live` uses an in-process MCP server and reaches `complete` |
| **P3** External access | tokens API, router `mcp.*` host, rate limit, wake, ingress, frontend panel | Claude Code connects to `mcp.localhost/mcp`, edits a file, the editor shows the change; revoke cuts access within a second |
| **P4** Later | OAuth 2.1 per the MCP authorization spec (one-click connect), MCP resources for files, audit log UI, exclusive mode | separate plan |

Each phase ends with tests and one local commit.

## 7. Tests

- Sandbox/Agent: unit tests per tool (path escape, symlink, caps, patch ambiguity, scope filtering, auth header) via `InMemoryTransport`.
- AI service: contract test that the MCP `tools/list` names and schemas equal what `tools/index.js` expects; offline flow tests against an in-process MCP server; fallback test for a 404 `/mcp`.
- Router: token -> sandbox mapping, expired/revoked, rate limit, wake timeout, header stripping (user `Authorization` and any user-sent `X-Sandbox-Key` never reach the pod).
- Manual: Claude Code and Cursor against `skaffold dev`.

## 8. Open questions for the developer

1. Which plans get external MCP access: all, or Pro/Max only?
2. Should `exec` be on by default for new tokens, or opt-in?
3. Auto-wake a stopped sandbox on an external call (costs compute), or return "start it in Taksha"?
4. Production domain for the MCP URL (e.g. `mcp.takshacodespace.in`)?
5. P4 OAuth: worth planning now, or are tokens enough for launch?
