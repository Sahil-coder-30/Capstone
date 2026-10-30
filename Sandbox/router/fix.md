# Sandbox/router: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report.

---

## P0: Security

### P0-1. Any valid sandbox id is proxied with no auth ✅
- **Where:** `src/app.js` (`parseSandboxHost` at lines ~27-35, proxies at ~117-170).
- **What's good:** the Host header is validated against `^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$` and the target is restricted to `agent`/`preview`, so the Host-header SSRF is closed.
- **What's missing:** no token check. `*.agent.*` exposes the sidecar's `exec`, file APIs and PTY to anyone.
- **Fix:** for `targetHost === "agent"` (HTTP **and** WebSocket upgrade), require a sandbox access token (see `Sandbox/server/featureTobeBuild.md` #1): `Authorization: Bearer` for HTTP, `?token=` or `Sec-WebSocket-Protocol` for upgrades (browsers cannot set headers on WS). Verify signature, `aud`, expiry, and that the token's `sandboxId` equals the Host's id. Return 401/403 before proxying. Strip the token before forwarding if the sidecar uses a different secret.
- **Preview (`*.preview.*`):** decide whether previews are public. If private, use a signed, short-lived cookie set on the preview domain.

### P1-0. Proxy cache grows forever ✅ (new, not in the report; reliability, not security)
- `httpProxies`, `httpAgentProxies`, `wsProxies`, `wsAgentProxies` are plain objects keyed by sandbox id and never evicted. Over time this leaks memory (one proxy per sandbox ever seen).
- **Fix:** use an LRU (e.g. 500 entries) or evict on Redis key expiry.

## P1: Correctness

- **TTL refresh only on router traffic ✅** (`src/config/redis.js:14`). Fine for browser traffic; AI bypasses the router. Handled via Sandbox server keep-alive.
- **Refresh on every request 📄:** an `EXPIRE` per request (including every HMR asset) is a lot of Redis traffic. Throttle per sandbox (at most once every 30 s, in-memory timestamp map).
- **Dead sandbox gives a generic proxy error:** when the key is gone or the service does not exist, return a clear 404/503 JSON ("sandbox is stopped, start it again") instead of a proxy error page.

## P2

- Add `/healthz` alias for consistency with other services (or update docs).
- Router listens on 3000; ingress/docs mention 80. Align docs.

## Docs

`Sandbox/router/README.md`, `docs/infrastructure/sandbox-reverse-proxy-router.md`:
- Preview target is `sandbox-service-<id>:80`, agent target is `:3000`.
- Show the real `parseSandboxHost` with id validation; the doc's `host.split('.')` snippet would reintroduce SSRF if copied.
- Replace absolute `file:///Users/...` links. Document health routes. `.env.example` exists.
