# payments_frontend: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report.

---

## P0: Money

### P0-1. Orderless checkout fallback can charge users without activating a plan ✅
- **Where:** `src/features/payments/service/payments.api.js:235-255`: if `POST /create/order` fails, it returns `{ orderId: null, amount: <hard-coded paise>, keyId: <hard-coded test key> }`. `src/features/payments/components/CheckoutModal.jsx:150-165` then opens Razorpay **without** `order_id`. The backend `/verify` needs an order id and signature, so it rejects the payment: the user is charged (in live mode) and gets nothing.
- **Fix:** if order creation fails, show an error and stop. Never open Razorpay without a server-created `order_id`. Remove the `tierPaise` price table from the client.

### P0-2. Hard-coded Razorpay key ✅
- `rzp_test_TQWMeVZgOXKG3C` appears in `CheckoutModal.jsx:155` and `payments.api.js:251`. Key ids are public by design, but a hard-coded **test** key in a live build means live checkouts run against the test account.
- **Fix:** use only `orderData.keyId` from the backend (which knows the mode). Drop `VITE_RAZORPAY_KEY_ID` and the literal.

## P1: Correctness

- **Plans the backend does not sell ✅:** `pro_early_access`, `max_early_access` and a yearly cycle (Max ₹799) exist in the UI; backend packages are `free`, `pro_regular` (₹499), `max_regular` (₹999). Fetch the catalogue from `GET /api/payments/credit/packages` and render from it, instead of duplicating prices in `CheckoutModal.jsx`, `CompareTablePage.jsx`, `PlanDetailPage.jsx`.
- **"Unlimited tokens" / "4.0 vCPU + 4GB" copy ✅:** these promises are not enforced anywhere (Max has the same pod size; the real limit is a 5-hour credit window). Change the copy or build the features (see Sandbox server featureTobeBuild #4).
- **"Upgrades prorate unused time" FAQ ✅** (`PaymentsLandingPage.jsx:108`): the backend queues the old plan, it does not prorate, and the queue currently loses those days. Fix the copy after `Payments/fix.md` P1-1.
- **Free plan switch** calls `changeSubscription('free')` → hits the route that 404s for users. See `Payments/fix.md` P1-8.
- **Lightfall is never mounted 📄:** remove it or mount it; clamp its `dpr` (e.g. `Math.min(devicePixelRatio, 2)`).

## Docs

`payments_frontend/README.md` is the untouched create-vite template. Replace with: purpose, base path `/payments/`, dev port 5174, `/api` proxy to the ingress, routes/pages, checkout flow (create order → Razorpay → `/verify` → webhook backup), env vars.
