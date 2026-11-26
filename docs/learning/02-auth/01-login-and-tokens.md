# Auth: Google login, RS256 + JWKS, refresh rotation, service tokens

> **Shipped:** 2026-06-29 (`d20a6af`), extended through Nov · **Commits:** `7b9728c` (metrics, k6) `9899b46` (sandbox tokens) `aeb5910` (internal scoped tokens) `6abc158` (cookie path, error handler)
> **Code:** `Auth/src/` (`controllers/auth.controller.js`, `utils/generateTokens.js`, `routes/jwks.route.js`)
> **One line:** one service signs every token; every other service checks it locally with the public key.

## 1. How it flows

```
Login   Browser → GET /api/auth/google → Google → callback (passport, no session)
        → upsert User → publish auth_notification_queue (email)
        → issue pair → redirect to CLIENT_URL

Pair    access : RS256 JWT, 15 min, kid auth-rsa-v1, aud takshacodespace-services
                 claims sub, id, email, name, role. Kept in browser MEMORY only
        refresh: random opaque string, SHA-256 hash in Mongo with familyId,
                 30 days, HttpOnly cookie on path /api/auth

Refresh POST /api/auth/refresh: find by hash
        used already? → REUSE → delete the whole family → 401
        else mark used, issue new pair in the SAME family

Logout  blacklist access token in Redis until its exp; delete refresh family; clear cookie

Others  Payments, AI, Sandbox, sidecar, router → fetch JWKS once (cached by kid) → verify locally
```

Extra token types:

| Token | Issued by | Lifetime | Audience / use |
|---|---|---|---|
| Sandbox token | `POST /api/auth/sandbox-token` (user's token, rate limited) | 2 h | `taksha-sandbox`, `sbx` claim; only the sidecar accepts it |
| Scoped sandbox token | `POST /internal/sandbox-token` (router, internal token) | 1–15 min | same, plus `scope` (read/write/exec) |

`/internal/*` is not routed by the ingress and needs `INTERNAL_SERVICE_TOKEN`; without it the routes fail closed. Auth also serves Prometheus metrics at `/metrics` (cluster-internal) and has a k6 load test.

## 2. Decisions

| Decision | Rejected | Why |
|---|---|---|
| RS256 + JWKS | HS256 shared secret | With HS256 every service holding the secret could also forge tokens. With RS256 only Auth has the private key; `kid` allows key rotation |
| Verify locally in each service | Call Auth per request (introspection) | No extra hop or single point of failure on every request |
| Access token in memory, refresh in HttpOnly cookie | Both in localStorage | XSS can read localStorage. Memory + HttpOnly means script can steal at most a 15-min token |
| Rotating refresh tokens with families + reuse detection | One long-lived refresh token | A stolen refresh token gets detected the moment either party uses an old one, and the whole family dies |
| Store only the hash of the refresh token | Store plaintext | A DB leak does not give usable tokens |
| Redis blacklist on logout, TTL = token's remaining life | No revocation; short tokens only | Logout should end access now, and the blacklist cleans itself |
| Cookie path `/api/auth` (fixed in `6abc158`) | `/api/auth/refresh` | With the old path the browser never sent the cookie to `/logout`, so logout could not revoke the family |
| Separate audiences for sandbox tokens | Long-lived access tokens for agent runs | A leaked sandbox token is useless anywhere but one sandbox |

## 3. Failure cases and limits

| Case | Result |
|---|---|
| Old refresh token replayed | Family revoked, both attacker and user must log in again |
| Google login fails | Redirect to `CLIENT_URL?auth=failed` (was a dead `/failed` route) |
| Crash in a handler | JSON error (Auth had no error handler before `6abc158`); Mongoose validation → 400 |
| Redis down on logout in Payments | Blacklist write fails closed (503), see Payments note |

Known limits:
- Only Auth and Payments check the blacklist. AI, Sandbox and the sidecar do not, so a logged-out access token works there until it expires (max 15 min).
- No `subscription` claim, so the AI rate limiter always uses the free tier.
- The rotation check is read-then-save (`findOne`, then `used = true`), not one atomic update. Two refreshes at the same instant could both pass. Fix: `findOneAndUpdate({ tokenHash, used: false }, { used: true })`. (Observed in the code, not yet fixed.)
- One shared internal token for all internal callers (F2 plan: per-caller tokens).

## 4. Interview questions

**Q1. Why RS256 over HS256 in microservices?**
A: Asymmetric keys separate who can sign from who can verify. Only Auth holds the private key; every other service gets the public key from JWKS. If Payments is compromised, the attacker can read tokens but cannot mint them. With HS256 every verifier is also a signer. The AI service kept an HS256 "test only" fallback until 2026-11-26 with no algorithm, issuer or audience check; one env var would have let forged tokens in, so it was deleted (commit "fix(ai): close the P0 security gates").

**Q2. JWTs are stateless. How do you log someone out?**
A: Two parts. The refresh token family is deleted in Mongo, so no new access tokens. The current access token goes on a Redis blacklist with a TTL equal to its remaining life, so the list never grows. Services that check the blacklist reject it at once; others accept it for at most 15 minutes, which is the trade-off of short-lived JWTs.

**Q3. Explain refresh token rotation with reuse detection.**
A: Each refresh returns a new refresh token and marks the old one used. All tokens from one login share a family id. If a used token comes back, either the attacker or the user is holding a stale copy, so we cannot tell who is legit; we delete the whole family and force a new login. This turns a silent theft into a visible event.

**Q4. Where do you store tokens in the browser and why?**
A: Access token in a JavaScript variable only, never localStorage. Refresh token in an HttpOnly, Secure cookie scoped to `/api/auth`, so scripts cannot read it and it is only sent to auth routes. On page load the app calls refresh to get a new access token.

**Q5. An agent run lasts an hour but access tokens last 15 minutes. What did you do?**
A: A separate sandbox token: 2 hours, audience `taksha-sandbox`, bound to one sandbox id, minted only for the owner, rate limited. The sidecar accepts it, nothing else does. External agents get an even narrower one: 10 minutes with scopes, minted by the router through an internal route.

**Q6. How would you rotate the signing key?**
A: Publish the new public key in JWKS next to the old one with a new `kid`, start signing with the new key, and remove the old key after the longest token lifetime has passed. Verifiers pick the key by `kid` and refetch JWKS on an unknown `kid`.

## 5. Revise in 60 seconds

- RS256, `kid`, JWKS; verify locally everywhere.
- Access 15 min in memory; refresh 30 days, hashed, HttpOnly cookie on `/api/auth`, rotated, family revoke on reuse.
- Logout = Redis blacklist with TTL + delete family.
- Sandbox token (2 h, aud `taksha-sandbox`) and scoped internal token (≤15 min).
- Gaps: blacklist not checked everywhere, no tier claim, non-atomic rotation, shared internal token.
