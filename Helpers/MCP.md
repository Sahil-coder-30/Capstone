# Taksha MCP Server — Implementation Plan
> Grounded in project source: `Sandbox/Agent/README.md`, `Sandbox/router/README.md`, `Ai_orchestration/readme.md`, `Auth/README.md`, `Sandbox/server/README.md`, and live code in `router/src/app.js`, `Agent/src/app.js`, `Auth/src/utils/generateTokens.js`, `Ai_orchestration/src/middleware/auth.middleware.js`.

---

## 1. What We Know From the Codebase (Ground Truth)

Before specifying anything, here is what is established from reading the actual services:

| Fact | Source |
|---|---|
| Auth issues **RS-256 JWTs** signed with a private RSA key, verified by all services via JWKS endpoint `http://localhost:5000/.well-known/jwks.json` | `Auth/src/utils/generateTokens.js` + `Ai_orchestration/src/middleware/auth.middleware.js` |
| Access tokens carry `{ sub, id, email, name, role }`, issued `15m`, audience `takshacodespace-services`, issuer `auth.takshacodespace.in` | `Auth/src/utils/generateTokens.js` |
| The existing `identifyUser` middleware already accepts **`Authorization: Bearer <token>`** as a fallback to cookie auth — the exact pattern MCP clients use | `Ai_orchestration/src/middleware/auth.middleware.js:L78-81` |
| The Router resolves `sandboxId` from the **hostname prefix** (`host.split('.')[0]`), target from the second segment (`preview` or `agent`) | `Sandbox/router/src/app.js:L111-112` |
| Router proxies `*.agent.*` → `http://sandbox-service-<sandboxId>:3000` — Agent sidecar listens on port 3000 | `Sandbox/router/src/app.js:L43-51` |
| The Agent sidecar has **no auth on its REST routes today** — it trusts that Router-level ingress means the caller is legitimate | `Sandbox/Agent/README.md:L173` |
| The entire Agent sidecar is a **single `src/app.js`** file by intentional design (`Single app.js architecture` design pattern documented in the README) | `Sandbox/Agent/README.md:L84` |
| `sandbox:<sandboxId>` Redis key is the liveness signal — set by Sandbox Control Server, refreshed by Router on every request, deleted on pod stop | `Sandbox/server/README.md:L74` |
| AI Orchestration constructs sandbox sidecar URL as `http://sandbox-service-<sandboxId>:3000` using the `sandboxId` from the JWT — not the Router subdomain | `Ai_orchestration/readme.md:L42` |
| The `sandboxId` is a UUID assigned per pod, also used as the K8s Service name suffix and Redis key | `Sandbox/server/README.md:L73` |

---

## 2. The Problem Being Solved

Claude Code (external MCP client) needs to call the same file tools — `read_file`, `update_file`, `search_code`, `patch_file`, `get_status` — that Orion's LangGraph tools already invoke against the Agent sidecar's REST API. The challenge is:

1. The Agent sidecar has a **different URL per session** (resolved from the sandboxId UUID).
2. Claude Code's `.mcp.json` config is **static** — it can't be re-pointed on every pod rebuild.
3. The Agent sidecar has **no auth** — external traffic needs its own auth layer.
4. No new container is allowed — MCP must live in the same Agent sidecar process.

---

## 3. Architecture Decision: Where Each Piece Lives

```
Claude Code (external MCP client)
          │
          │  POST https://taksha.dev/mcp
          │  Authorization: Bearer <access_token>
          │  X-Sandbox-ID: <sandboxId>  (or encoded in token)
          │
          ▼
┌──────────────────────────────────────────────────────┐
│                 Nginx Ingress                         │
│  Route: /mcp  →  router-service (NEW rule)           │
└──────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────┐
│              Sandbox Router Service                   │
│  (Sandbox/router/src/app.js — MODIFY)                │
│                                                       │
│  1. Read X-Sandbox-ID header (or ?sandboxId= param)  │
│  2. refreshTTL(sandboxId) — already exists           │
│  3. Forward to getHttpAgentProxy(sandboxId)           │
│     → http://sandbox-service-<sandboxId>:3000/mcp    │
└──────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────┐
│      Sandbox Pod — Agent Sidecar (port 3000)          │
│      (Sandbox/Agent/src/app.js — MODIFY)             │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  /api/agent/*  — existing REST, no auth today   │ │
│  │  (unchanged — AI Orchestration keeps calling    │ │
│  │   these directly via sandbox-service DNS)        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  POST /mcp  — NEW MCP endpoint                  │ │
│  │  • Validates Bearer JWT (RS-256, JWKS)          │ │
│  │  • Verifies sandboxId in token matches pod env  │ │
│  │  • Handles MCP JSON-RPC: initialize, tools/list │ │
│  │    tools/call                                   │ │
│  │  • Tools call the SAME inline functions that    │ │
│  │    the /api/agent/* routes already use          │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Key architectural constraint honored:** No new container. The `/mcp` route mounts into the same Express app as `/api/agent/*`. Tool logic is the same code — the MCP handler calls the same functions (e.g., `safeResolve`, `fs.promises.readFile`) that are inline in `app.js`.

---

## 4. Transport Decision

**Chosen transport: Streamable-HTTP (HTTP POST JSON-RPC, no persistent SSE)**

**Why:**

| Factor | HTTP+SSE | Streamable-HTTP POST |
|---|---|---|
| NGINX config | Requires `proxy_buffering off`, `proxy_read_timeout 3600` — changes to the existing Ingress config | Works with the existing Nginx config — no changes needed |
| Pod rebuild behavior | SSE stream dies silently; Claude Code hangs | Each POST is independent — next POST gets a clean response |
| File operations (read/write/search) | Don't benefit from server push — they're request-response | Perfectly matched to HTTP request-response |
| MCP SDK support | `SSEServerTransport` in `@modelcontextprotocol/sdk` | `StreamableHTTPServerTransport` in `@modelcontextprotocol/sdk` |
| Complexity in `app.js` | Requires GET (SSE stream) + POST (message) routes, session tracking | Single POST route handler |

**Assumption stated:** MCP clients using Claude Code with file tools don't need push notifications. If a future tool needs server-initiated events, an SSE fallback can be added at `/mcp/sse` without touching the primary handler.

---

## 5. Auth Design

### What already exists (do not duplicate)

The `identifyUser` middleware in AI Orchestration already:
- Accepts `Authorization: Bearer <token>` headers (not just cookies)
- Fetches and caches the RS-256 public key from Auth Service's JWKS endpoint
- Verifies issuer (`auth.takshacodespace.in`) and audience (`takshacodespace-services`)
- Falls back to `JWT_ACCESS_SECRET` HS-256 if JWKS is unavailable

**This is the exact same pattern MCP auth needs.** We do not invent a new token format.

### MCP Auth Flow

```
User in Dashboard → "Generate MCP Token" button
        │
        ▼
Auth Service: POST /api/auth/mcp-token   [NEW endpoint in Auth]
        │  Accepts: existing accessToken cookie (user is already logged in)
        │  Returns: { mcpToken: "<RS-256 JWT>", sandboxId: "<uuid>" }
        │  mcpToken payload:
        │    { sub: userId, sandboxId: "uuid", scope: "mcp", exp: 24h }
        │    signed with the same RSA private key, same issuer/audience
        ▼
Claude Code .mcp.json config (one-time setup):
  {
    "mcpServers": {
      "taksha": {
        "url": "https://taksha.dev/mcp",
        "headers": {
          "Authorization": "Bearer <mcpToken>",
          "X-Sandbox-ID": "<sandboxId>"
        }
      }
    }
  }
```

### MCP Auth Middleware in Agent Sidecar

A lightweight `verifyMcpToken` guard, placed only on `/mcp`, not on `/api/agent/*`:

1. Extract `Authorization: Bearer <token>` header.
2. Fetch RS-256 public key from Auth JWKS — same pattern as `Ai_orchestration/src/middleware/auth.middleware.js` (can copy the JWKS fetch logic verbatim).
3. Verify `scope === "mcp"` claim exists in the token.
4. Verify `sandboxId` claim in the token matches `process.env.SANDBOX_ID` (injected by Sandbox Control Server into the pod spec — same mechanism as `PORT` and `WORKSPACE_DIR`).
5. Attach `req.mcpUser = { userId, sandboxId }` and call `next()`.

**Security note:** Step 4 is the critical binding — it prevents one user's MCP token from accessing another user's sandbox even if they got the token string.

---

## 6. Gateway Routing: How the Router Handles `/mcp`

### Current Router dispatch (from live code)
```javascript
// Sandbox/router/src/app.js:L104-123
app.use(async (req, res, next) => {
  const sandboxId = host.split('.')[0];   // from *.agent.* subdomain
  const targetHost = host.split('.')[1];  // "agent" or "preview"
  await refreshTTL(sandboxId);
  if (targetHost === 'agent') return getHttpAgentProxy(sandboxId)(req, res, next);
  if (targetHost === 'preview') return getHttpProxy(sandboxId)(req, res, next);
  next();
});
```

### Problem

This dispatch is driven entirely by the **hostname**. `taksha.dev/mcp` doesn't have a `sandboxId` in the hostname — the sandboxId comes from the `X-Sandbox-ID` header (or JWT claim).

### Solution: Add a `/mcp` path-based route BEFORE the host-based middleware

```javascript
// NEW block to add in Sandbox/router/src/app.js BEFORE the existing app.use(...)

app.use('/mcp', async (req, res, next) => {
  // 1. Get sandboxId from header first, fallback to JWT claim
  let sandboxId = req.headers['x-sandbox-id'];

  if (!sandboxId) {
    // Try to extract from Authorization Bearer JWT (decode without verify — 
    // actual verification happens in the Agent sidecar)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(
          Buffer.from(authHeader.split('.')[1], 'base64url').toString()
        );
        sandboxId = payload.sandboxId;
      } catch (_) {}
    }
  }

  if (!sandboxId) {
    return res.status(400).json({ error: 'Missing sandboxId: provide X-Sandbox-ID header or encode sandboxId in the Bearer token.' });
  }

  await refreshTTL(sandboxId);
  
  // Reuse the existing agent proxy cache — MCP goes to the same agent port 3000
  return getHttpAgentProxy(sandboxId)(req, res, next);
});
```

**No new proxy type is needed.** `getHttpAgentProxy(sandboxId)` already points to `http://sandbox-service-<sandboxId>:3000` — the MCP handler in the Agent sidecar is mounted at `/mcp` on that same port.

### Edge cases

| Case | Behavior |
|---|---|
| `sandboxId` not in Redis (pod stopped or not started) | `refreshTTL` is a no-op; proxy attempt hits dead K8s service DNS → `ECONNREFUSED` → `http-proxy-middleware` returns 502. Router returns `502 Bad Gateway`. Client gets a clear signal to start the sandbox from the dashboard first. |
| Pod rebuilt (new UUID) | Sandbox Control Server writes new Redis key with new sandboxId. Client must update its `X-Sandbox-ID` header — this is unavoidable and correct. The MCP token is sandboxId-scoped; user re-generates it when starting a new sandbox. |
| Stale proxy cache in Router (known tech debt per router README) | Existing issue, existing tech debt. Same mitigation applies: Router restart clears cache. For MCP specifically, a 502 back to Claude Code triggers a retry with the same sandboxId, which creates a fresh proxy entry pointing to the new pod service — self-healing on first retry. |

---

## 7. MCP Tool Surface

These are the exact Agent sidecar REST endpoints that get a matching MCP tool wrapper. The underlying logic is NOT duplicated — the MCP handler calls the same code.

| MCP Tool Name | Wraps Agent Route | Input | Notes |
|---|---|---|---|
| `read_file` | `GET /api/agent/read-file` | `{ files: string[] }` | Batched; returns `{ file, content }[]` |
| `update_file` | `PATCH /api/agent/update-file` | `{ updates: [{file, content}][] }` | Overwrites; creates parent dirs |
| `create_file` | `POST /api/agent/create-file` | `{ files: [{file, content}][] }` | Creates with mkdir -p semantics |
| `delete_file` | `DELETE /api/agent/delete-file` | `{ files: string[] }` | Handles files and directories |
| `patch_file` | `POST /api/agent/patch-file` | `{ filePath, oldStr, newStr }` | Exact-match-once replace |
| `search_code` | `GET /api/agent/search-code` | `{ pattern, isRegex?, caseSensitive?, fileGlob?, maxResults? }` | ReDoS guard already in place |
| `list_files` | `GET /api/agent/list-files` | `{}` | Full recursive workspace tree |
| `get_status` | `GET /api/agent/health` | `{}` | Pod health + sidecar alive check |

**Tools deliberately kept internal (not exposed via MCP):**
- `POST /api/agent/exec` — Arbitrary shell execution; exposing this to external clients (even authenticated ones) is a deliberate security boundary. Claude Code can use file tools to make changes; it does not need shell access.
- Terminal Socket.io bridge — Not a request-response tool; not relevant to MCP.
- Yjs sync events — Internal collaborative editing protocol.

**Input validation:** Zod schemas. Use the same validation patterns already proven in AI Orchestration's tool layer (`Ai_orchestration/src/agent/tool.js`). The schemas are thin — the underlying validation (path traversal via `safeResolve`, ReDoS guard regex, etc.) already exists in `app.js` and is reused, not reimplemented.

---

## 8. File Changes Required

### 8a. `Sandbox/Agent/src/app.js` — MODIFY (in-place additions, no refactor)

The README documents the "single `app.js` architecture" as an intentional design decision. We honor this. No refactor into services/. We add to the bottom of the file.

**Additions:**
1. **Import block** — Add `import jwt from 'jsonwebtoken'` at the top (alongside existing `import fs`, `import path`, etc.).
2. **`verifyMcpToken` middleware** — Inline async function (≈40 lines). Fetches RS-256 public key from Auth JWKS (same pattern as `Ai_orchestration/src/middleware/auth.middleware.js`), verifies token, checks `scope === 'mcp'` and `sandboxId === process.env.SANDBOX_ID`.
3. **MCP tool handler map** — An object keyed by tool name, each value being an `async (args) => result` function that calls the same inline helpers (`safeResolve`, `fs.promises.readFile`, etc.) that the existing `/api/agent/*` routes use.
4. **`POST /mcp` route** — Mounted with `verifyMcpToken` middleware. Parses MCP JSON-RPC body, dispatches to tool handler map, returns MCP-shaped JSON-RPC response.

**No existing lines are deleted or moved.** `/api/agent/*` routes remain untouched. The only structural change is adding the import and three new blocks at the bottom.

**New dependencies to add to `Sandbox/Agent/package.json`:**
- `@modelcontextprotocol/sdk` — MCP SDK for JSON-RPC envelope parsing and `StreamableHTTPServerTransport`
- `jsonwebtoken` — Already present in Auth, AI Orchestration, and Sandbox/server. Not yet in Agent.
- `zod` — Already in AI Orchestration. Not yet in Agent.

### 8b. `Sandbox/router/src/app.js` — MODIFY

Add a single `app.use('/mcp', ...)` block **before** the existing `app.use(async (req, res, next) => {...})` host-based middleware. The new block extracts `sandboxId` from the header or JWT, calls `refreshTTL`, and forwards to `getHttpAgentProxy(sandboxId)`.

**No existing lines are deleted.** The existing host-based dispatch continues handling `*.agent.*` and `*.preview.*` traffic unchanged.

### 8c. `Auth/src/` — ADD one new endpoint

Add `POST /api/auth/mcp-token` to Auth Service:
- Requires the user's existing authenticated session (cookie or Bearer accessToken).
- Reads `sandboxId` from the request body (user selects which active sandbox to link to).
- Issues a new RS-256 JWT with `{ sub: userId, sandboxId, scope: "mcp", exp: "24h" }` signed with the existing RSA private key via `signAccessToken`-equivalent helper.
- Returns `{ mcpToken, sandboxId, expiresAt }`.

**Files changed in Auth:**
- `src/controllers/auth.controller.js` — add `generateMcpToken` controller function
- `src/routes/auth.routes.js` — add `POST /api/auth/mcp-token` route with `identifyUser` middleware

### 8d. Kubernetes / Pod Spec — ADD `SANDBOX_ID` env var

The Agent sidecar needs to know its own `sandboxId` to validate the token claim in step 4 of the auth flow. The Sandbox Control Server already has the `sandboxId` when it builds the pod spec.

**File changed:** `Sandbox/server/src/kubernetes/` (pod manifest builder)
- Add env var `SANDBOX_ID: <sandboxId>` to the agent container spec, alongside the existing `PORT` and `WORKSPACE_DIR` variables.

### 8e. Nginx Ingress — ADD `/mcp` path rule

Add a location rule in the Ingress config that routes `taksha.dev/mcp` to the Router service — the same way `/api/auth/*` routes to Auth.

**File changed:** `k8s/` ingress manifest (the specific filename is not in scope to change — add one path entry).

---

## 9. New Environment Variables

| Variable | Service | Where Set | Description |
|---|---|---|---|
| `SANDBOX_ID` | `Sandbox/Agent` | Pod spec (via Sandbox/server pod manifest builder) | The sandboxId UUID of this specific pod. Used by MCP auth middleware to validate token binding. |
| `AUTH_JWKS_URI` | `Sandbox/Agent` | Pod spec | URL to Auth Service JWKS endpoint, e.g. `http://auth-service:3000/.well-known/jwks.json`. Same env var name as in AI Orchestration. |

No other new env vars are required.

---

## 10. MCP JSON-RPC Protocol Shape

The Agent sidecar's `/mcp` endpoint implements the MCP protocol using `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`. It handles three MCP methods:

| MCP Method | What It Does |
|---|---|
| `initialize` | Returns server capabilities: `{ tools: true }`. Responds with server name `taksha-agent`, version `1.0.0`. |
| `tools/list` | Returns the array of tool definitions (name, description, JSON schema for inputs). |
| `tools/call` | Dispatches to the tool handler map, returns `{ content: [{ type: "text", text: "<JSON result>" }] }`. |

The SDK handles all envelope parsing, error codes, and JSON-RPC formatting. The Agent only implements the tool handlers.

---

## 11. Phased Testing Plan (Skaffold / Local)

### Phase 1: Auth endpoint works

1. Run `skaffold dev` (full cluster locally).
2. Log in via browser. POST to `https://taksha.dev/api/auth/mcp-token` with session cookie + `{ sandboxId: "<active-uuid>" }`.
3. Verify response contains `{ mcpToken: "...", sandboxId: "..." }`.
4. Decode the token payload — confirm `scope === "mcp"`, `sandboxId` matches, `exp` is 24h out.

### Phase 2: Router `/mcp` proxying works

1. With `sandboxId` from Phase 1, send:
   ```
   POST http://localhost:<router-port>/mcp
   X-Sandbox-ID: <sandboxId>
   Authorization: Bearer <mcpToken>
   Content-Type: application/json
   Body: { "jsonrpc": "2.0", "method": "initialize", "id": 1, "params": { "protocolVersion": "2024-11-05", "capabilities": {} } }
   ```
2. Verify response is `200` and contains `{ "result": { "protocolVersion": "...", "capabilities": { "tools": {} } } }`.
3. Verify Agent sidecar logs show the request reached it.

### Phase 3: Tool calls reach the filesystem

1. Call `tools/call` with name `read_file` and `{ files: ["package.json"] }`.
2. Verify response body contains the content of `/workspace/package.json` inside the pod.
3. Call `tools/call` with name `update_file` and `{ updates: [{ file: "mcp-test.txt", content: "hello from claude code" }] }`.
4. Exec into the pod: `kubectl exec <pod> -c agent -- cat /workspace/mcp-test.txt` — verify content.

### Phase 4: Auth boundary enforcement

1. Use a token with a mismatched `sandboxId` claim (for a different user's pod UUID).
2. Verify the Agent sidecar returns `401 Unauthorized` with `{ error: "MCP token sandboxId does not match this sandbox" }`.
3. Omit the Bearer token entirely — verify `401`.
4. Use an expired token — verify `401`.

### Phase 5: Claude Code end-to-end

1. Configure Claude Code's `.mcp.json` pointing to local gateway.
2. Open Claude Code — verify it lists the 8 tools in its tool panel.
3. Ask Claude Code to "read the src/App.jsx file" — verify it uses `read_file` tool and returns the content.
4. Ask Claude Code to "add a comment to src/App.jsx" — verify `patch_file` is called and the file is mutated in the pod.

---

## 12. Risks and Known Tech Debt This Touches

| Risk | Source | Mitigation |
|---|---|---|
| **Stale proxy cache for dead pods** | Known tech debt in Router README | First retry after pod rebuild creates a fresh proxy entry. Claude Code retries on 502 — self-healing. For the MCP token, the user re-generates it after restarting their sandbox (token is sandboxId-scoped). |
| **No auth on existing `/api/agent/*` routes** | Security gap in Agent README | This plan does NOT add auth to `/api/agent/*` — that is a separate hardening item. MCP adds its own auth only to `/mcp`. AI Orchestration and frontend continue using `/api/agent/*` unchanged. |
| **Single process, potentially blocking searches** | Agent README (PTY runs as same user, no sandboxing below container) | `search_code` already has a hard 8-second timeout and per-file async reads. No additional mitigation needed for Phase 1 — this is pre-existing. |
| **MCP token expiry with long Claude Code sessions** | Token is 24h | Claude Code will get a 401 after 24h. User re-generates token. Document this clearly in the "Claude Code setup" guide. A refresh flow for MCP tokens is a Phase 2 item. |
| **`SANDBOX_ID` env var not yet in pod spec** | Pod manifest in Sandbox/server | Must be added before deployment. If missing, the sidecar can't verify the sandboxId claim and must either reject all MCP calls or skip that check — choose reject-all as the safe default. |

---

## 13. What This Does NOT Change

- The LangGraph tool layer in AI Orchestration. It continues calling `http://sandbox-service-<sandboxId>:3000/api/agent/*` directly. No change.
- The existing Router host-header dispatch for `*.agent.*` and `*.preview.*`. No change.
- The Auth Service JWT format for regular access tokens. The MCP token is a separate issuance using the same RSA key.
- The Agent sidecar's single-file `app.js` architecture. We add to it, not refactor it.
- Any other service.
