# Sandbox 3: the router, external agents and edge auth

> **Shipped:** router 2026-06-06; hardened 2026-10-30 to 2026-11-25 · **Commits:** `b9e1817` (host validation) `aeb5910` `88c62df` `dbeed19` `04131db` `9279491` (external agents) `7ea4116` (internal MCP path) `d7d12e0` (edge auth + share links)
> **Code:** `Sandbox/router/src/` (`app.js`, `mcpGateway.js`, `internalMcpProxy.js`, `sandboxEdgeAuth.js`)
> **One line:** the router is the only door into a sandbox, and it decides who may come in.

## 1. The four ways in

| Entry | Who | Auth | Refreshes idle TTL |
|---|---|---|---|
| `<id>.agent.<domain>` → sidecar :3000 | Owner's editor (file tree, terminal socket) | Owner bearer or `tks_sbx_<id>` cookie | yes |
| `<id>.preview.<domain>` → Vite :5173 | Owner, or anyone with a share link | Owner bearer/cookie, or `tks_shr_<id>` share cookie | owner yes, share link **no** |
| `POST /api/mcp/<id>` | External agents (Claude Code, Cursor) | MCP token `tks_mcp_...` | yes |
| `POST /internal/sandboxes/<id>/mcp` | AI service (Orion, Clio) | `X-Internal-Token` + sandbox token | yes |

The sandbox id comes from the Host header and becomes part of the proxy target hostname, so it must match a single DNS label (`b9e1817`). Before that, a Host like `x@10.0.0.5` could point the proxy at another internal host (SSRF).

## 2. External agents through the MCP gateway (6 Nov)

```
Claude Code ──POST /api/mcp/<id>, Bearer tks_mcp_...──► Router
   1. hash token → Redis mcptoken:<hash> (miss: Sandbox server /internal lookup); token must belong to <id>
   2. rate limit 120 calls/min per token
   3. sandbox down? POST /internal/sandboxes/<id>/wake, wait ≤45 s (else 503 + Retry-After)
   4. swap for a 10-min scoped sandbox token from Auth /internal/sandbox-token (cached)
   5. strip cookies + MCP token, proxy to sidecar /mcp, refresh TTL, record last use
```

- Owner creates tokens in the editor (Connect agent modal): shown once, SHA-256 hash in Mongo, 1–90 days, max 10 per project, scopes `read` (always), `write`, `exec` (opt-in). Trashing a project revokes its tokens; revoke deletes the Redis key at once.
- A scoped token reaches only `/mcp`, and the sidecar registers only the tools in its scopes, so an `exec` tool does not even exist for a read-only token (`88c62df`).
- The modal gives a paste-in prompt per client so the user's own agent writes its MCP config (`9279491`).
- Path-based (`/api/mcp/<id>`), not `*.mcp.localhost`: Node clients on macOS cannot resolve wildcard `.localhost` names.

## 3. AI tool calls through the router (`7ea4116`, 25 Nov)

The AI service used to call `sandbox-service-<id>:3000/mcp` directly. Those calls did not refresh the TTL, so a long Orion run with nobody in the editor could lose its sandbox after 20 minutes. Now every call goes to `POST /internal/sandboxes/<id>/mcp` on the router: it needs `X-Internal-Token` (fails closed), refuses sandbox hosts, refreshes the TTL, and forwards only the sandbox token with a 180 s timeout. The NetworkPolicy then dropped the direct ai-service rule: pods accept traffic only from the router. There is no direct fallback.

## 4. Owner-only edge with share links (`d7d12e0`, 25 Nov)

Before this, anyone who knew a sandbox id could open the preview and the sidecar's HTTP and socket routes, and each request kept the sandbox alive. Vite has no auth, so the router is the only possible guard for the preview.

```
Editor ──POST /__taksha/session (Bearer)──► Router: owner? ──► Set-Cookie tks_sbx_<id>
        (HttpOnly, Secure, SameSite=None, Partitioned, HMAC(sandbox, owner, exp), 12 h)
New tab: POST {ticket:true} → 60 s single-use ticket (Redis SET NX)
         → GET /__taksha/session?ticket=..&next=/ → first-party cookie, redirect
Share:   POST /__taksha/share → tks_shr token (HMAC sandbox+shareId+exp, 1 h default, 24 h max)
         revoke: Redis sbx-share-rev:<sid>
```

- Owner comes from `GET /internal/sandboxes/:id/owner` on the Sandbox server, cached (owners never change; unknown ids cached 30 s).
- Public edge accepts only access tokens (audience `takshacodespace-services`), not sandbox tokens; those use the internal path or the gateway.
- `/api/agent/report-error` is 404 on the public agent host; only the pod's own Vite proxy reaches it.
- Tickets and share tokens are masked in the access log.
- Frontend wiring of `/__taksha/session` was still pending on 2026-11-25.

## 5. Decisions

| Decision | Rejected | Why |
|---|---|---|
| Cookie for iframes, tabs and sockets | Token in the URL; header only | Iframes, new tabs and WebSocket upgrades cannot send `Authorization`. URLs leak into history and logs |
| `Partitioned` (CHIPS) + `SameSite=None` | Plain third-party cookie | Editor and sandbox are different sites; partitioned cookies still work where third-party cookies are blocked |
| Single-use 60 s ticket for new tabs | Reuse the fetch-set cookie | A cookie set by a cross-site `fetch` is partitioned to the editor and invisible to a top-level tab |
| Share links multi-use | Single-use | WhatsApp and Slack fetch a link to build a preview card before anyone taps it; single-use would be spent by the bot |
| Share links view-only (GET, HEAD, HMR socket), refused on agent host | Full access | A viewer must never write data or run commands. Product decision 2026-11-25 |
| Share links never refresh the TTL | Treat like the owner | A public link must not hold someone's compute open forever |
| Revocation list in Redis by share id | Short TTL only | Owner can kill a leaked link immediately; the key outlives any link (24 h + 1 h) |
| Swap MCP token for a 10-min scoped sandbox token at the router | Forward the MCP token to the pod | The long-lived secret never enters user-controlled code; the pod only sees a short token |
| Hash-only storage, Redis cache of active tokens | Store plaintext; DB lookup per call | DB leak does not leak tokens; the router checks in one Redis read |

## 6. Failure cases

| Case | Result |
|---|---|
| `SANDBOX_SESSION_SECRET`, owner lookup or JWKS unavailable | Fails closed (no access) |
| `INTERNAL_SERVICE_TOKEN` missing | Internal routes and AI tool calls fail closed with a clear error |
| Sandbox stopped when an external agent calls | Woken; 503 + `Retry-After` after 45 s |
| Ticket replayed | Second `SET NX` fails → refused |
| Share link used on agent host or with POST | Refused / 405 |

**Known limits:** a share viewer reaches the Vite dev server and can read the source (fix: Taksha Hosting serves a built app, planned). One shared `INTERNAL_SERVICE_TOKEN` for all internal callers (F2, planned). Proxy objects are cached per sandbox id in router memory and never evicted.

## 7. Interview questions

**Q1. How does a browser iframe authenticate to a different origin without exposing the token?**
A: The editor calls `POST /__taksha/session` on the sandbox host with the bearer token. The router checks the user owns the sandbox and sets an HttpOnly, Secure, SameSite=None, Partitioned cookie signed with HMAC and bound to sandbox, owner and expiry. The iframe and sockets then send it automatically. JavaScript never sees it, and the URL carries nothing secret.

**Q2. Why does a new tab need a ticket?**
A: Partitioned cookies set from the editor live in the editor's partition. A top-level tab on the sandbox host is a different partition and does not see them. So the editor gets a 60-second single-use ticket and the tab exchanges it for a first-party cookie. Single use is enforced with Redis `SET NX`.

**Q3. Design a shareable preview link. What can go wrong?**
A: Risks: guessing (use HMAC over id and expiry), leaking (expire in 1 h by default, revocable by id), abuse (view-only, no agent host), and cost (it must not keep the sandbox alive). Chat apps pre-fetch links, so it must be multi-use. Remaining risk: the viewer sees the dev server and can read source, which a built-app hosting mode would fix.

**Q4. Why not let the AI service call pods directly? It's faster.**
A: One hop saved is not worth a second door. Direct calls skipped the TTL refresh, which actually killed sandboxes during long runs, and they forced the NetworkPolicy to admit the AI service. With one door, auth, TTL and rate limits live in one place.

**Q5. How do you give a third-party agent access without giving it your account?**
A: A per-project MCP token with explicit scopes and an expiry, shown once and stored hashed. The router validates it, wakes the sandbox, then swaps it for a 10-minute scoped token that the pod sees. The sidecar exposes only tools in scope. Revoking deletes the cache key, so access ends immediately.

**Q6. What is the SSRF bug you fixed in the router?**
A: The proxy target was built from the Host header: `http://sandbox-service-${id}`. A Host like `x@10.0.0.5.agent...` made the target a different host. Fix: the id must be one DNS label and the second label must be `agent` or `preview`.

## 8. Revise in 60 seconds

- Four doors: agent host, preview host, `/api/mcp` gateway, `/internal/.../mcp`. All through the router.
- Edge: bearer or HMAC cookie (Partitioned, 12 h); new tab via 60 s single-use ticket.
- Share link: 1 h default, 24 h max, revocable, multi-use, view-only, preview only, no TTL refresh.
- MCP token: hashed, scoped, Redis-cached; swapped for a 10-min sandbox token.
- AI calls via router since `7ea4116`: TTL refresh, pods admit only the router.
