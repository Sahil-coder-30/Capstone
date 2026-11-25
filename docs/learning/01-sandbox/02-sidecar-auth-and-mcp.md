# Sandbox 2: sidecar auth and the MCP tool server

> **Shipped:** 2026-11-05 to 2026-11-16 · **Commits:** `9899b46` (sandbox tokens) `014721c` (owner auth) `5c1272d` (MCP server) `d208d87` (MCP client) `1063098` + `176702d` (MCP only) `59134e7` (split app.js) `a144178` + `86896aa` (call log, masking)
> **Code:** `Sandbox/Agent/src/` (sidecar), `Ai_orchestration/src/agent/tools/mcp.client.js`, `Frontend/src/services/sandboxAgentClient.js`
> **One line:** every coding tool lives in one place (the sandbox's own MCP server), and only the owner can call it.

## 1. What it is

The agent sidecar (port 3000 in each pod) is where files are read and written and commands run. Two problems were fixed here:

1. **No auth.** Anyone who knew a sandbox id could call the sidecar, including `exec` and the terminal socket.
2. **Many copies of the tools.** The AI service, the frontend and future external agents (Claude Code, Cursor) each talked REST to the sidecar in their own way.

Now the sidecar checks the owner's token on every route and socket, and exposes exactly 9 certified tools over MCP at `POST /mcp`. Orion, Clio, the editor and external agents all call the same tools.

## 2. How it flows

```
Orion run starts
  AI ──POST /api/auth/sandbox-token {sandboxId}──► Auth
     ◄── 2 h RS256 token, aud "taksha-sandbox", sbx=<id>
  AI ──MCP tools/call (Bearer sandbox token)──► Router ──► sidecar /mcp
                                                     auth.middleware:
                                                       owner access token (sub == OWNER_USER_ID)
                                                    or sandbox token (sbx == SANDBOX_ID)
                                                     → tool handler → JSON result
```

The 9 tools (frozen list in `Sandbox/Agent/src/mcp/tools.js`): `list_files`, `read_file`, `create_file`, `update_file`, `patch_file`, `delete_file`, `search_code`, `execute_command`, `get_vite_runtime_errors`. `search_internet` (Tavily) stays in the AI service because it does not touch the sandbox.

- **Sidecar auth** (`src/middleware/auth.middleware.js`) verifies RS256 tokens with the Auth JWKS. It fails closed without `OWNER_USER_ID`. CORS only for `CLIENT_URL`. Open routes: `health`, `ready`, `report-error`.
- **Sandbox tokens:** an access token lives 15 minutes, but an Orion run can last an hour. So the AI service mints a 2-hour sandbox token per run (`sandboxAuth.js`), renewed on plan approve. Its audience `taksha-sandbox` is accepted by nothing except the sidecar.
- **MCP server:** stateless Streamable HTTP, JSON responses, DNS-rebinding protection, GET and DELETE return 405. Nothing can register a tool at runtime.
- **MCP client** (AI side): one client per run, closed at the end. Only the 9 certified tool names are called; the model only sees the AI service's own tool descriptions, never the server's. Per-tool timeouts (150 s for commands). A dropped connection is retried once for read-only tools only.
- **Frontend:** editor, file tree and logs panel send plain JSON-RPC `tools/call` through `apiClient` (so token refresh on 401 still works). Results keep the old REST shapes, so components did not change.
- **Call log:** one line per call on both sides (sandbox id, tool, target, outcome, duration, never file contents). Secrets in commands (`KEY=value`, `--token x`, `Bearer`, `tks_mcp_`, `nvapi-`, `sk-`) are masked as `***` (`86896aa`).

## 3. Decisions

| Decision | Rejected | Why |
|---|---|---|
| Auth inside the sidecar, not only at the router | Trust the router; trust "came from localhost" | The preview app's Vite proxy also reaches port 3000 inside the pod, so the network position proves nothing. Defence in depth |
| Separate sandbox token (aud `taksha-sandbox`, 2 h) | Long-lived access tokens; pass the user's refresh token to the AI service | Long access tokens would work on every service. A narrow audience limits damage if one leaks |
| MCP as the one tool protocol | Keep REST; gRPC | MCP is what Claude Code and Cursor already speak, so external agents work with no adapter, and Orion uses the same code path |
| Frozen certified list, AI-side descriptions | Let the server advertise tools; trust its descriptions | A compromised pod could otherwise add a tool or write a description that injects instructions into the model |
| Retry only read-only tools | Retry everything | A retried `execute_command` or `create_file` can run twice |
| Remove REST fully, no fallback (`176702d`) | Keep REST as backup | A fallback keeps a second path alive that bypasses MCP rules. Old pods get "stop and start the sandbox" instead |
| `execute_command` refuses file commands and dev servers server-side | Only prompt the model not to | Prompts are hints; the server rule holds for every client |

## 4. Failure cases

| Case | Result |
|---|---|
| No or wrong token, other user's token, HS256 token, wrong audience, expired, unknown `kid` | 401/403, covered by sidecar tests |
| Pod from before MCP (404 on `/mcp`) | Clear "stop and start the sandbox" error |
| Connection drops mid-call | Read tool retried once; write tool fails, model sees the error |
| Tool-level failure (patch text not found, command exits 1) | Passed back as data so the model can react; only transport errors fail the call |

## 5. Interview questions

**Q1. Why put auth in the sidecar when the router already checks?**
A: Because the router is not the only thing that can reach port 3000. The user's own Vite app runs in the same pod and its dev proxy can call localhost:3000. If the sidecar trusted local traffic, any code in the preview could run commands. So the sidecar verifies the JWT itself; the router check is an extra layer.

**Q2. Why a special sandbox token instead of the user's access token?**
A: Access tokens expire in 15 minutes and agent runs last up to an hour. Making access tokens longer would weaken every service. A sandbox token has its own audience, so Payments or Auth reject it, it names one sandbox in `sbx`, and only the owner can mint it. Blast radius stays small.

**Q3. What is MCP and why use it here?**
A: Model Context Protocol is a JSON-RPC protocol for exposing tools to AI agents (`tools/list`, `tools/call`). Using it in the sidecar means Orion, the editor and outside agents like Claude Code all call one implementation, and I can certify that list once.

**Q4. How do you stop a malicious MCP server from attacking your agent?**
A: The client only calls names in its allowlist and ignores extra tools, and the model never sees the server's descriptions, only ours. Results are treated as data. So the pod can return bad data but cannot change what the model is told to do.

**Q5. Why not retry every failed tool call?**
A: Tools are not all idempotent. Reading a file twice is harmless, running `npm install` or creating a file twice is not. So only read-only tools retry, once.

**Q6. You log every tool call. What went wrong?**
A: The log showed the first 80 characters of each command, so `API_KEY=... npm run dev` leaked a key into pod logs. Now both sides mask key-value pairs, token flags, bearer values and known key prefixes, with a test.

## 6. Revise in 60 seconds

- Sidecar checks owner access token or sandbox token (aud `taksha-sandbox`, `sbx`), fails closed.
- 9 frozen MCP tools; AI, editor and external agents all use them; REST removed.
- Client: allowlist, own descriptions, retry read-only once, per-tool timeouts.
- One log line per call, secrets masked.
