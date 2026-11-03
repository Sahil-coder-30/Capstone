# Payments: features to be built

Day carry-over for queued plans is done (Postgres rewrite, 2026-11-03). Referral and admin were removed on purpose and are not planned right now.

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Tier lookup for other services | Internal `GET /internal/tier/:userId` (or reuse `/credit/check`) with caching, used by AI and Sandbox. Fixes AI rate limits always using `free`. | none | S |
| 2 | Early-access and yearly packages | UI sells them; backend does not. Add to `config/plans.config.js` with prices that match the UI. | none | S |
| 3 | Daily/monthly token caps per tier | Configured in `TIER_LIMITS`; only the 5-hour window is enforced. Sum `usage_events` per day/month. | none | M |
| 4 | PDF invoice | `invoices` table exists; generate a PDF in Notification or Payments and store it in S3. | Notification | M |
| 5 | Durable notification outbox | Store payment events in a table and retry publishing, so receipts survive MQ outages. | none | S |
| 6 | Usage via queue (`ai_telemetry_queue`) consumer | Billing survives Payments downtime. Idempotency on `requestId` already exists. | AI | M |
| 7 | Refunds and cancellations | No refund flow; Razorpay supports it. `payment_status` already has `refunded`. | Razorpay API | M |
| 8 | Credit top-ups | Buy extra credits outside the 5-hour window. | none | M |
| 9 | Admin console API | Grant credits, view users and payments, with an audit log. Waits for the Admin service. | Admin service, Auth roles | M |
| 10 | Prometheus metrics | Orders, verifications, webhook failures, revenue. | monitoring stack | S |
