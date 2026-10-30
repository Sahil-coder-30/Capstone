# Auth: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report. Severity: **P0** security, **P1** correctness, **P2** hardening, **Docs**.

---

## P0: Security

### P0-1. RSA private key is baked into the Docker image ✅
- **Where:** `Auth/.dockerignore` contains only `node_modules` and `.env`; `Auth/dockerfile` does `COPY . .`, so `certs/private.pem` ships in the image. Anyone with registry pull access has the signing key and can mint tokens for any user.
- **Fix:**
  1. Add `certs/`, `*.pem`, `*.key`, `.env*` (keep `!.env.example`) to `Auth/.dockerignore`. Do the same for every service that has a `certs/` folder (AI, Notification, Sandbox server all have one).
  2. Load the key only from `RSA_PRIVATE_KEY` (k8s secret). Keep the file fallback for local dev only (`NODE_ENV !== "production"`).
  3. **Rotate the key** (new `kid`, e.g. `auth-rsa-v2`) because the old one must be treated as leaked. Serve both public keys from JWKS for 15 min, then drop v1.
  4. Delete old images from the registry (developer action).

### P0-2. `/getMe` and `/logout` verify against a different key than the one used to sign ✅
- **Where:** `src/middleware/auth.middleware.js:10-11` reads `certs/public.pem` at module load; tokens are signed with `RSA_PRIVATE_KEY` (`src/utils/generateTokens.js:12-19`), and JWKS derives the public key from `RSA_PRIVATE_KEY` (`src/routes/jwks.route.js:29-35`).
- **Impact:** once P0-1 is fixed (no `certs/` in the image), Auth crashes at startup. If the env key and the file differ, every `/getMe` and `/logout` call fails.
- **Fix:** derive the verify key from the same source as JWKS (`createPublicKey(RSA_PRIVATE_KEY)`), in one shared `keys.js` module used by signer, verifier and JWKS.

### P0-3. Logout does not revoke the refresh token ✅
- **Where:** `src/controllers/auth.controller.js:76-110`; cookie path `/api/auth/refresh` (`generateTokens.js:94`); route `authRouter.post('/logout', identifyUser, ...)`.
- **What happens:** the browser only sends the refresh cookie to `/api/auth/refresh`, so `/logout` never sees it and the family is never revoked. Also, `identifyUser` on `/logout` means a user with an expired access token cannot log out at all.
- **Fix (pick one):**
  - Scope the refresh cookie to `Path=/api/auth` (covers `/refresh` and `/logout`), keep `HttpOnly; Secure; SameSite=Lax`; or
  - Add `POST /api/auth/refresh/logout` (under the cookie path) that revokes the family.
  - Remove `identifyUser` from logout; blacklist the access token only if one is present and valid.
  - `clearCookie` must use the same path as the set call.

### P0-3b. Cookie not `Secure`, redirects to localhost in k8s ✅
- `NODE_ENV` and `CLIENT_URL` are not set in any k8s manifest, so `secure` is false and login redirects to `http://localhost:5173`. Fix in `k8s/fix.md`; in code, fail fast at startup in production if `CLIENT_URL` is missing.

---

## P1: Correctness

### P1-1. Concurrent refresh logs the user out ✅
- **Where:** `auth.controller.js:125-150`. Check `stored.used`, then `stored.used = true; save()` is not atomic. Two tabs (or Frontend + payments_frontend) refreshing at the same time: the second sees `used: true` and revokes the whole family.
- **Fix:** atomic claim: `RefreshToken.findOneAndUpdate({ tokenHash, used: false, expiresAt: { $gt: now } }, { used: true, usedAt: now })`. If it returns null but the token exists with `used: true` and `usedAt` within a short grace window (~10 s), return the **same** new token pair issued for it (store `replacedBy`), instead of revoking. Revoke only on reuse outside the grace window.

### P1-2. Login fails if RabbitMQ is down ✅
- **Where:** `auth.controller.js:26-32` awaits `sendAuthNotification` before issuing tokens; the MQ channel has no reconnect.
- **Fix:** issue tokens and redirect first; send the notification fire-and-forget with try/catch. Add a reconnecting MQ helper (shared with Payments).

### P1-3. No `role` field, so admin routes are unreachable ✅
- `User` schema has no `role`; `signAccessToken` writes `role: user.role || 'user'` (`generateTokens.js:49`). Payments `/admin/*` can never be reached.
- **Fix:** add `role: { type: String, enum: ['user', 'admin'], default: 'user' }`. Promote admins by a one-off script or env allow-list (`ADMIN_EMAILS`), never by an API without auth.

### P1-4. No error handler: Express returns its default HTML 500 ✅
- `src/app/app.js` mounts no error middleware. Add the FaultKit handler (same as AI and Payments) so errors are JSON and stack traces do not leak.

### P1-5. `getMe` returns the access token in the body 📄 (✅ code returns `accessToken: req.authToken`)
- The frontend keeps the token in memory, so echoing it back adds nothing and widens exposure in logs. Remove it unless the frontend depends on it (check `Frontend/src/services/apiClient.js` first).

### P1-6. Dead credit code ✅
- `src/controllers/credit.controller.js`, `src/routes/credit.routes.js`, `src/models/credit.model.js` are never mounted; credits live in Payments. Remove them (developer approves deletes) after confirming `Payments/scripts/migrate_credits_from_auth.js` has been run.

## P2: Hardening

- Dockerfile runs `npm run dev` (nodemon) in production. Use `npm ci --omit=dev` and `node server.js`. Same for all services.
- Rate-limit `/google/callback` and `/refresh` per IP.
- Consider PKCE / `state` on the OAuth flow (passport-google-oauth20 supports `state: true`).
- Publish a `logout` event if Notification or analytics need it (README claims one).

## Docs

`Auth/README.md`, `docs/architecture/03-auth-and-security.md`, `docs/architecture/auth-architecture-reference.md`:
- Signing is RS256 with `RSA_PRIVATE_KEY`, `kid: auth-rsa-v1`; downstream services use JWKS, not `JWT_ACCESS_SECRET`.
- Refresh token: opaque hex, 30 days, SHA-256 stored, `SameSite=Lax`, path `/api/auth/refresh`.
- Port is **3000**, not 5000 (downstream defaults for `AUTH_JWKS_URI` still say `:5000`, fix those too).
- Blacklist matrix: Auth ✅, AI ✅ (fails closed), Payments ❌ (effectively disabled), Sandbox ❌, Notification n/a.
- Health `/healthz`, readiness `/readyz`, metrics `/metrics` exist.
- Replay revocation kills one session family, not all devices.
- Document `RSA_PRIVATE_KEY`, `CLIENT_URL`, `REDIS_URI`, `MQ_URL`.
