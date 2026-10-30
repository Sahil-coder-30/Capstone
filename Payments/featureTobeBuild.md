# Payments: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Correct day-carryover for queued plans | The headline "Zero Day-Waste" promise. See fix.md P1-1. | none | S |
| 2 | Reachable admin console API | Admin routes exist but no user has `role: admin`. Add audit logging (who granted/reset what, when). | Auth roles | S |
| 3 | Tier lookup for other services | Internal `GET /internal/tier/:userId` (or reuse `/credit`) with caching, consumed by AI and Sandbox. | none | S |
| 4 | Early-access and yearly packages | UI sells them; backend does not. Add to `packages.config.js` with prices that match the UI. | none | S |
| 5 | Daily/monthly token caps per tier | Documented; only the 5-hour window exists. | none | M |
| 6 | PDF invoice / receipt | Documented; email has no PDF. Generate in Notification or Payments and store in S3. | Notification | M |
| 7 | Durable notification outbox | Persist payment events and retry publishing, so receipts survive MQ outages. | none | S |
| 8 | Usage via queue (`ai_telemetry_queue`) consumer | Pairs with AI feature #13; billing survives Payments downtime. | AI | M |
| 9 | Referral program API | Model + hourly cron exist with no routes. Add create/redeem/list endpoints and UI, or remove. | Frontend | M |
| 10 | Refunds and cancellations | No refund flow; Razorpay supports it. Needed for real customers. | Razorpay API | M |
| 11 | Credit top-ups (`payment.credit.topup`) | README describes it; not built. | none | M |
| 12 | Prometheus metrics | Orders, verifications, webhook failures, revenue. | monitoring stack | S |
