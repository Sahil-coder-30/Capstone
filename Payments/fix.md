# Payments: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report. Severity: **P0** security/money, **P1** correctness, **P2** hardening, **Docs**.

Reminder from AGENTS.md: the test suites in `Payments/tests/` run `deleteMany` against `MONGO_URI`. Agents do not run them; the developer runs them against a throwaway database.

---

## P0: Security and money

### P0-1. Token blacklist check is effectively disabled ✅
- **Where:** `config/redis.js:5-10,27-29`. The client is created with `lazyConnect: true` and `enableOfflineQueue: false`, and `connect()` is never called. `isTokenBlacklisted` returns `false` whenever `redis.status !== 'ready'`, so logged-out tokens are accepted.
- **Nuance:** ioredis auto-connects on the first command, so once the cron's `redis.set(...)` lock runs (`services/cron.service.js:34`) the client may become ready. Until then, and whenever Redis blips, revoked tokens pass.
- **Fix:** call `await redis.connect()` at startup (in `server.js`, before `listen`), and make the blacklist check **fail closed** for state-changing routes (`/verify`, `/order`, `/credit/update`, `/admin/*`): if Redis is not ready, return 503.

### P0-2. Admin `verifyToken` ignores `kid` and skips the blacklist 📄 (✅ `data.keys[0]` at `middleware/verifyToken.middleware.js:55`)
- **Fix:** pick the JWK by `kid` from the token header, enforce `algorithms: ['RS256']`, issuer and audience, and check the blacklist. Better: delete `verifyToken.middleware.js` and reuse `identifyUser` + `identifyAdmin` everywhere.

### P0-3. Synthetic payment bypass 📄 (✅ `services/razorpay.service.js:41-42`)
- `ALLOW_SYNTHETIC_PAYMENTS=true` with a `rzp_test_` key skips signature checks. Safe only if it can never be on in production.
- **Fix:** also require `NODE_ENV === 'test'`; log a loud warning at startup if it is on; never set it in k8s.

### P0-4. Receipt emails go to a real third-party domain when notes are missing ✅ (new, not in the report)
- **Where:** `controllers/webhook.controller.js:121` uses `notes?.email ?? 'user@unknown.com'`; `razorpay.service.js` uses `user@takshacodespace.in`. `unknown.com` is a real domain, so receipts (payment id, amount, plan) can be sent to a stranger's mailbox.
- **Fix:** look up the user's email from the account/Auth by `userId` in the order notes; if unknown, skip the email and log it. Never use a placeholder address.

---

## P1: Correctness

### P1-1. "Zero Day-Waste" loses reserved days ✅
- **Where:** `services/subscription.service.js:216-245` (upgrade) and `~420-445` (promotion on expiry).
- **What happens:** on upgrade, the old slot is pushed to `reservedSlots` with its **original** `validUntil`. When the new plan expires 30 days later, that date is already in the past, so promotion computes `now + remainingDays(nextSlot)` = `now + 0`. Pro with 15 days left, upgraded to Max, comes back with 0 days.
- **Fix:** store remaining **duration** for queued slots, not an absolute end date. On queue: `slot.remainingMs = max(0, validUntil - now)` and clear `validUntil`. On promotion: `validFrom = now; validUntil = now + remainingMs`. Migrate existing reserved slots once (developer runs it). Same issue applies to Case D new reserved slots (`validUntil = now + 30d` while queued). Add a test: Pro 15 days left → buy Max → expire Max → Pro has 15 days.

### P1-2. `/credit/update` makes 4 non-atomic writes 📄
- Usage event, provider bucket, billing totals and account are updated separately; a crash in between leaves totals out of sync.
- **Fix:** wrap in a Mongo transaction (`session.withTransaction`) like the subscription path does, and make it idempotent on `requestId` (unique index on usage events).

### P1-3. `syncCreditTier` adds INR paise into a USD-cents field and swallows errors 📄
- **Fix:** keep currency explicit (`amountMinor` + `currency`), never mix. Let errors propagate or at least log with context and a metric.

### P1-4. Receipt email shows ₹0.00 ✅
- Payments sends `transactionDetails.amountPaise` (`webhook.controller.js:126`, `razorpay.service.js:267`); Notification reads `amount`/`totalAmount`. Fix on **one** side and agree a contract: recommended, Payments sends `{ amountPaise, currency }` and Notification formats `amountPaise / 100`. See `Notification/fix.md`.

### P1-5. `payment.failed` drops `errorReason` ✅
- `_handlePaymentFailed` passes `errorReason` to `notifyPaymentEvent`, but `notifyPaymentEvent` (`services/payment.service.js:132`) does not accept or forward it. Add it to the signature and pass it to `sendPaymentIssue`.

### P1-6. `rate-limit.middleware.js` imports a function that does not exist 📄
- Nothing mounts it, so it does not crash today, but any import will. Delete it (developer approves) or fix the import and mount it.

### P1-7. `ensureAccount` reads a JWT claim Auth never sets 📄
- Check which claim (likely `subscription`/`email`) and fetch it from Auth/Account instead.

### P1-8. Frontend calls `PATCH /api/payments/subscription`, which does not exist ✅
- Only `GET /subscription` exists on `subscriptionRouter`; the real update route is `PATCH /api/payments/credit/subscription` and it is admin-only for paid tiers. Decide: keep admin-only (and fix the frontends to go through checkout) or add a user route for downgrade-to-free only.

### P1-9. Package catalogue mismatches ✅
- Backend has `free`, `pro_regular` (₹499), `max_regular` (₹999). The payments frontend also offers `pro_early_access`, `max_early_access` and a "yearly" cycle (₹799 Max), none of which the backend sells. Either add them to `config/packages.config.js` or remove them from the UI.

### P1-10. `is_active` is never read; Referral model and cron have no routes 📄 (✅ cron runs referral settlement hourly)
- Either finish referrals (see featureTobeBuild.md) or stop the cron job so it does not run against an empty collection. Rename `refral.model.js` → `referral.model.js` (collection is already `referrals`).

## P2: Hardening

- No `helmet` and no CORS config ✅. Add both.
- Readiness `/readyz` always returns 200 📄. Check Mongo and Redis.
- Payments invents fallback request ids 📄. Accept `x-request-id` from the ingress/caller and propagate it.
- MQ connects once at import with top-level await and no reconnect ✅ (`config/mq.js`). Add reconnect + publish confirms; queue unsent messages in Mongo (outbox) so receipts are not lost.
- `PORT`: 5002 locally, 5051 in k8s. Pick one.

## Docs

`Payments/README.md`, `docs/architecture/07-payments-and-subscriptions.md`:
- Auth is RS256 via JWKS, Bearer header only (no cookies).
- Webhook `POST /api/payments/webhook` exists and activates subscriptions from order notes.
- No `checkout-session`; real routes are `/create/order` (alias `/order`), `/verify` (alias `/confirm`), `/credit/*`, `/admin/*`, `/dashboard/overview`, `/subscription`, `/transactions`, `/usage-events`.
- The real usage gate is a 5-hour credit window per provider, not daily/monthly token caps.
- 3 packages; no annual pricing; `SUBSCRIPTION_EXTENSION` transaction type exists.
- No PDF receipt.
