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

## Still open

### P0-1 (rest). Blacklist fails open when Redis is down
- `isTokenBlacklisted` returns `false` if Redis is not ready, so a logged-out token works during a Redis outage.
- **Fix:** fail closed (503) for state-changing routes (`/verify`, `/create/order`). Decide separately for `/credit/update`, since failing it loses usage records.

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
