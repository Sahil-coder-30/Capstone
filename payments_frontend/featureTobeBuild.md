# payments_frontend: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Server-driven plan catalogue | One source of truth for plans and prices. | `GET /credit/packages` (exists) | S |
| 2 | Post-payment status page | Poll `/subscription` after Razorpay returns, so the webhook path (when `/verify` fails) still shows activation. | Payments webhook | S |
| 3 | Invoice download | Pairs with PDF receipts. | Payments #6 | S |
| 4 | Yearly / early-access plans (if kept) | Only after the backend sells them. | Payments #4 | S |
| 5 | Refund / cancel UI | Pairs with Payments refunds. | Payments #10 | M |
| 6 | Referral UI | Pairs with Payments referral API. | Payments #9 | M |
| 7 | Real README | Template README today. | none | S |
