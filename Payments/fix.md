# Payments: fixes

Re-checked on 2026-11-03 after the Postgres rewrite. Severity: **P0** security/money, **P1** correctness, **P2** hardening.

Tests run against a local Postgres only (`docker compose up -d`, then `npm test`). They truncate every table and refuse non-localhost hosts.

---

## Fixed by the Postgres rewrite (2026-11-03)

| Id | Issue | How it is fixed |
|---|---|---|
| P0-1 (part) | Redis never connected, blacklist skipped | `server.js` connects Redis before listening |
| P0-2 | Admin `verifyToken` ignored `kid` | Admin code removed; one `identifyUser` picks the key by `kid` |
| P0-3 | Synthetic payment bypass | Also requires `NODE_ENV=test` |
| P0-4 | Receipts sent to placeholder addresses | Email comes from the order row; no email means no send |
| P1-1 | Upgrade lost the queued plan's days | Queued slots store `remaining_ms` |
| P1-2 | `/credit/update` made 4 non-atomic writes | One transaction, idempotent on `(user_id, request_id)` |
| P1-3 | Paise mixed into a USD-cents field | Metered billing removed; money is paise only |
| P1-4 | Receipt showed Rs 0.00 | Payments sends `amount` in rupees plus `amountPaise` |
| P1-5 | `payment.failed` dropped `errorReason` | Forwarded in `transactionDetails.errorReason` |
| P1-6 | Broken `rate-limit.middleware.js` | Deleted |
| P1-7 | `ensureAccount` read a claim Auth never sets | Uses `sub` and `email` only |
| P1-10 | Referral model and cron with no routes | Referral removed |
| P2 | `/readyz` always 200 | Checks the database |

---

## Fixed after the adversarial test pass (2026-11-09)

`tests/adversarial/` holds tests written to break the checkout pipeline. They found these, now fixed and covered:

| Id | Issue | How it is fixed |
|---|---|---|
| P0-1 (rest) | Blacklist failed open when Redis was down | POST/PUT/PATCH/DELETE return 503 when Redis cannot be asked (`AUTH_BLACKLIST_FAIL_CLOSED`, default on). Reads and `/credit/update` stay open so usage is not lost |
| P0-5 | Second captured payment for a paid order was silently dropped (`onConflictDoNothing()` with no target) | Conflict target is the payment id only. A second payment is logged as `PAYMENT_DUPLICATE` (status `PENDING`, `needsRefund`) and logged as an error |
| P0-6 | Refunds were ignored, plan stayed active | `refund.processed` webhook: idempotent on refund id, full refund marks the payment `refunded` and removes its 30 days (`removePaidPeriod`), partial refund is logged |
| P0-7 | No currency check | Payment currency must match the order (webhook and `/verify`) |
| P0-8 | `/verify` accepted a payment with no `order_id` | `order_id` must equal the order |
| P1-12 | No Razorpay timeout, `/verify` could hang forever | Every gateway call has a timeout (`RAZORPAY_TIMEOUT_MS`, default 10s), then 503 |
| P1-13 | `payment.failed` replay logged and emailed again; a late failure after success emailed "payment failed" | Deduped on payment id, skipped when the order is paid |
| P1-14 | Missing or huge webhook amount gave 500 (Razorpay retries forever) | Amount must be a safe positive integer, else 400 |
| P1-15 | Token counts above int32 gave 500 on `/credit/update` | Capped, 400 |
| P2 | Overpayment not visible | `overpaidPaise` in transaction metadata plus a warning log |
| P2 | Webhook and checkout HMAC compared with `===` | Constant-time compare, lowercase hex only |
| P2 | `/verify` accepted arrays/objects as ids | Must be strings |

Migration `0002_refund_and_duplicate_types` adds the two transaction types. The developer runs `npm run db:migrate` against Supabase.

---

## Still open

### P1-8. Frontend calls `PATCH /api/payments/subscription`, which does not exist
- `Frontend/src/features/{payments,settings}/service/*.api.js` call it. Paid tiers only come from checkout.
- **Fix:** remove the call from the Frontend, or add a user route for downgrade-to-free only.

### P1-9. Package catalogue mismatch
- Backend sells `free`, `pro_regular` (Rs 499), `max_regular` (Rs 999). `payments_frontend` also shows early-access plans and a yearly cycle that the backend does not sell.
- **Fix:** add them to `config/plans.config.js` or remove them from the UI.

### P1-11. Webhook for an order created before this rewrite is ignored
- Fresh start: old Razorpay orders have no row in `orders`, so their webhooks are logged and dropped. Only matters if old test orders get paid now.

## P2: Hardening

- No `helmet` and no CORS config. Add both.
- Accept `x-request-id` from the ingress and propagate it.
- MQ connects once at import with no reconnect (`config/mq.js`). Add reconnect and publish confirms; consider an outbox table so receipts survive MQ outages.
- `PORT`: 5002 locally, 5051 in k8s. Pick one.
- Supabase project has a `public.rls_auto_enable()` SECURITY DEFINER function callable by `anon` (created by Supabase, not by us). Revoke `EXECUTE` from `anon` and `authenticated` if it is not needed.
