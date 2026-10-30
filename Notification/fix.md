# Notification: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report.

---

## P1: Correctness

### P1-1. Failed emails are dropped with no dead-letter queue ✅
- **Where:** `src/app/app.js:50` and `:82` call `channel.nack(msg, false, false)` on any error; queues are asserted with only `{ durable: true }` (`src/config/mq.js:16-17`).
- **Fix:** declare a dead-letter exchange and a retry queue: `assertQueue(Q, { durable: true, deadLetterExchange: 'notifications.dlx' })`, a `*.retry` queue with `messageTtl` (e.g. 30 s) that dead-letters back to the main queue, and a `*.dead` queue after N attempts (count via `x-death` header). Separate parse errors (bad JSON → straight to `.dead`) from SMTP errors (retry).
- **Note:** changing queue arguments on an existing queue fails with `PRECONDITION_FAILED`. Use new queue names or delete the old queues during a maintenance window (destructive, developer approves).

### P1-2. Payment receipt shows ₹0.00 ✅
- `src/emails/template/paymentNotification.js:110` reads `transactionDetails.amount || totalAmount`; Payments sends `amountPaise`. Read `amountPaise` and format `/ 100`; keep `amount` as a fallback. Remove the "sometimes paise, convert if large" guess at line ~12.

### P1-3. Process crashes before `listen` if RabbitMQ is slow; no reconnect ✅
- `src/config/mq.js` uses top-level `await connectMQ()` (10 tries × 3 s) and throws, killing the process; no `close`/`error` handlers, so a broker restart leaves the service alive but consuming nothing while `/readyz` still says 200.
- **Fix:** start HTTP first, connect in the background with exponential backoff, re-create the channel and consumers on `close`, and make `/readyz` return 503 while disconnected.

### P1-4. No prefetch 📄
- Without `channel.prefetch(n)` the broker pushes every message at once; a backlog means hundreds of parallel SMTP sends. Set `prefetch(5)`.

### P1-5. Port hard-coded to 4000 ✅
- `server.js:9`. Read `process.env.PORT ?? 4000`.

## P2: Hardening

- `verifyToken.middleware.js` and `AUTH_JWKS_URI` are unused ✅ (no HTTP routes). Delete the middleware or keep it for future admin routes; drop `mongoose` from dependencies (unused).
- No error handler; add one if HTTP routes are added.
- Dockerfile runs `nodemon -L` in production. Use `node server.js`.
- Validate message payloads (email present, action known) before building templates.
- Add metrics: sent, failed, dead-lettered per queue (and an alert on `payment_notification_queue` depth).

## Docs

`Notification/README.md`:
- Consumes `auth_notification_queue` and `payment_notification_queue`; no HTTP API other than `/healthz`, `/readyz`.
- Uses Gmail app password **or** OAuth, not both; document `EMAIL_USER`, `EMAIL_PASS`, `MQ_URL`.
- No retry/DLQ today (until P1-1 is done).
