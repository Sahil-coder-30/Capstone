# Sandbox MCP server and shared MCP client

Status: **phase 1 built** (2026-11-06): sandbox auth, pod hardening, MCP server, MCP client for Orion and Clio. External agents (Claude Code, Cursor) are the next build.

## What exists now

```
AI service (Orion, Clio)
  1. POST /api/auth/sandbox-token  -> 2h token, aud taksha-sandbox, sbx=<id>
  2. POST http://sandbox-service-<id>:3000/mcp   Authorization: Bearer <sandbox token>
        |
agent container (port 3000, uid 1000)
  requireOwner  ->  /mcp (9 certified tools)  ->  same handlers as /api/agent/*
                ->  /api/agent/* REST and Socket.IO (editor, logs, terminal)
```

| Piece | Code | Commit |
|---|---|---|
| Sandbox token (2h, one user, one sandbox, own audience) | `Auth/src/controllers/sandboxToken.controller.js`, `signSandboxToken` in `Auth/src/utils/generateTokens.js` | `9899b46` |
| Owner-only auth on REST, MCP and sockets, inside the sidecar | `Sandbox/Agent/src/auth/` | `014721c` |
| Frontend sends the token (REST through `apiClient`, sockets through `auth`) | `Frontend/src/services/sandboxAgentClient.js`, `sandboxSocketAuth.js` | `014721c` |
| Pod hardening: no service account token, non-root, Vite log file, symlink checks, report-error limits, NetworkPolicy | `Sandbox/server/src/kubernetes/pod.js`, `Sandbox/Agent/src/workspace/`, `k8s/sandbox-networkpolicy.yml` | `e913250` |
| MCP server: frozen list of 9 certified tools, stateless Streamable HTTP, Host check | `Sandbox/Agent/src/mcp/` | `5c1272d` |
| MCP client: allowlist, timeouts, retry rules, REST fallback | `Ai_orchestration/src/agent/tools/mcp.client.js`, `sandbox.client.js` | `d208d87` |

Design decisions (developer, 2026-11-05):

| Topic | Decision |
|---|---|
| Where | MCP lives in the existing agent container, same port 3000, path `/mcp`. No new container, port or Service. |
| Auth | The Auth RS256 JWT, verified with JWKS inside the sidecar. Only the sandbox owner (`sub == OWNER_USER_ID`). The router is not the guard, because the preview app's Vite proxy can also reach port 3000. |
| Long runs | Access tokens last 15 minutes, Orion runs up to an hour, so the AI service gets a 2-hour sandbox token per run and renews it on plan approve/reject. |
| Certified tools | Server: `CERTIFIED_TOOLS` in `Sandbox/Agent/src/mcp/tools.js`, frozen, nothing registers at runtime. Client: `CERTIFIED_TOOLS` in `mcp.client.js`; extra server tools are ignored; the model only sees the AI service's own descriptions. |

## How to verify

| Check | Command |
|---|---|
| Auth token endpoint | `cd Auth && npm test` |
| Sidecar auth, hardening, MCP end to end | `cd Sandbox/Agent && npm test` |
| Pod manifest | `cd Sandbox/server && npm test`, and `node scripts/print-pod-manifest.js \| kubectl create --dry-run=server -f -` |
| AI client and graph | `cd Ai_orchestration && npm test` |
| Real model + real sidecar over MCP, no cluster | `cd Ai_orchestration && npm run e2e:live -- "task"` |
| In the cluster | Start a project, then in its terminal: `whoami` prints `node`, `ls /var/run/secrets/kubernetes.io` fails. Without a token, `curl localhost:3000/api/agent/list-files` gives 401. |

## Next build: external agents

Agreed earlier (2026-11-05): all plans, `exec` scope opt-in with a warning, and a stopped sandbox is auto-woken (wait up to 45s).

1. **MCP tokens** in the Sandbox server: create, list and revoke per project. Hashed at rest, shown once, scopes `read` / `write` / `exec`, expiry 30 days by default.
2. **Exchange at the router:** a host such as `<sandboxId>.mcp.localhost` checks the MCP token, rate-limits per token, wakes the sandbox if needed, then asks Auth for a short sandbox token and forwards to `/mcp`. The sidecar keeps one rule: owner JWT only.
3. **Scopes on the server:** the router passes the token's scopes and `/mcp` lists only the matching tools (`scope` is already on each certified tool).
4. **Frontend panel** "Connect your own agent" with ready-to-copy snippets for Claude Code and Cursor.
5. Later: OAuth 2.1 per the MCP authorization spec (one-click connect), output caps tuned for external clients, an audit log.

## Known gaps

- Old projects keep the template's old `vite.config.js` proxy (it lives in their workspace). That proxy now only reaches the auth check and returns 401.
- `Frontend/.gitignore` has a `logs` pattern that ignores `src/features/logs/`, so that feature folder is not in git.
- NetworkPolicy is not enforced by Docker Desktop's Kubernetes.
- Usage billing at the end of a long run uses the user's token from the last request (invoke or plan approve), which can be older than 15 minutes.
