# Payments 2: adversarial tests and the 14 money bugs

> **Shipped:** 2026-11-09 · **Commit:** `48aee60` · **Migration:** `0002_refund_and_duplicate_types.sql` (was still pending on Supabase on 2026-11-13: run `npm run db:migrate` before deploying)
> **Code:** `Payments/tests/adversarial/{pipeline,gateway}.test.js` (58 tests), full suite 81
> **One line:** tests written to break the money paths, and the fixes for everything they broke.

## 1. Method

Tests run against a throwaway local Postgres (Docker, port 5433; they refuse non-localhost because they truncate tables), a fake Auth JWKS with a test RSA key, and a mocked Razorpay. Groups:

| Group | Attacks |
|---|---|
| W webhook | wrong / missing / garbage signature, tampered amount, wrong content type |
| I idempotency | webhook replayed 5×, 10× in parallel, verify vs webhook race, duplicate payment, repeated `payment.failed` |
| C concurrency | 5 parallel Pro purchases = exactly 150 days; Pro + Max at once; 40 parallel usage events, no lost update |
| A amounts | client amounts ignored, under/zero/negative/huge/string amounts, overpayment, int32 overflow tokens |
| Z authz | user B verifying A's order, usage on another account, Redis down |
| P partial failure | DB fails halfway → full rollback, webhook gets 5xx so Razorpay retries |
| R refunds | replay, refund the upgrade brings back queued Pro, partial refund, refund of an extension |
| G gateway | Razorpay hangs, 5xx, 404, wrong order, wrong currency, failed capture |
| T time | expiry while away → Free, not stuck; carried days return |

## 2. What they found (all fixed)

| Bug | Fix |
|---|---|
| A second captured payment for a paid order was silently dropped (`onConflictDoNothing` with no target) | Kept as a `PAYMENT_DUPLICATE` transaction marked for refund, logged as an error |
| `refund.processed` webhook ignored | Idempotent per refund id; full refund marks payment refunded and removes the 30 days it bought; partial is logged |
| Currency not checked | Must match the order on webhook and verify |
| `/verify` accepted a payment with missing or different `order_id` | Rejected |
| Logout blacklist skipped when Redis down | Writes fail closed with 503 (`AUTH_BLACKLIST_FAIL_CLOSED`, default on); reads and `/credit/update` stay open so usage is not lost |
| HMAC compared with `===` | Constant-time compare |
| Razorpay call could hang forever | `RAZORPAY_TIMEOUT_MS` (10 s) → 503 |
| `payment.failed` repeated emails, even after success | Deduped per payment id; skipped once the order is paid |
| Bad amounts gave 500 (Razorpay retries 500 forever) | 400; overpayment flagged in metadata |
| Token counts above int32 crashed | 400 |
| `/verify` ids as objects/arrays | Must be strings |

## 3. Earlier hardening (2026-10-30)

- `26166c2`: verify needs `orderId` + signature (a known `paymentId` alone could be claimed); payments bound to order, account and package; synthetic test payments only with `NODE_ENV=test`; webhooks verified over the exact raw bytes with the webhook secret.
- `f047cc4`: usage billed only to the caller; paid tiers only from a verified payment.

## 4. Decisions

| Decision | Rejected | Why |
|---|---|---|
| Keep duplicate payments as records | Drop them; auto-refund | Money taken must be visible. A human or a later job refunds |
| 400 for bad input, 5xx only for retryable faults | 500 for everything | Razorpay retries 5xx; a permanent 500 would retry forever |
| Constant-time HMAC compare | `===` | `===` stops at the first wrong byte, leaking timing |
| Verify HMAC on raw bytes (`req.rawBody`) | Re-serialise parsed JSON | Re-serialising changes bytes, so valid signatures fail or tampered ones pass. No other body parser may run first |
| Fail closed on blacklist writes, open on usage recording | Same rule for both | A missed logout is a security hole; a missed usage record is lost revenue and breaks idempotent retries |

## 5. Interview questions

**Q1. How do you test a payment system?**
A: Think like an attacker and like a flaky network. I wrote tests that replay webhooks, race verify against webhook, fire many purchases in parallel, send bad amounts and currencies, kill the DB mid-transaction and make the gateway hang. Each asserts the money outcome: exact days granted, one invoice, nothing written on failure.

**Q2. How do you make webhook handling idempotent?**
A: Use the provider's id as a unique key: payment id is the primary key of `payments`; refunds are keyed by refund id; failure events are deduped per payment id. Processing happens inside the transaction before responding, so a failure returns 5xx and the provider retries safely.

**Q3. Why constant-time comparison for HMAC?**
A: A normal string compare returns as soon as a byte differs, so response time leaks how many leading bytes were right. With enough requests an attacker can guess a valid signature byte by byte. `crypto.timingSafeEqual` takes the same time regardless.

**Q4. What happens if a user is charged twice for the same order?**
A: The second capture is stored as a `PAYMENT_DUPLICATE` transaction marked for refund and logged as an error, and `/verify` reports it. It does not grant extra time. Before the fix it was silently dropped, so the money was taken with no record.

**Q5. How does a refund affect the subscription?**
A: A full refund marks the payment refunded and removes the 30 days that payment bought. If it was an upgrade, the queued lower plan comes back with its days. Partial refunds are logged and keep the plan until the rest is refunded.

## 6. Revise in 60 seconds

- 58 adversarial tests in 9 groups; found 14 bugs.
- Duplicate capture kept as `PAYMENT_DUPLICATE`; refunds idempotent and remove bought days.
- Currency and order id must match; constant-time HMAC over raw body.
- 400 for permanent errors, 5xx only for retryable ones; Razorpay timeout 10 s.
- Before deploy: migration 0002 on Supabase.
