# Admin: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked on 2026-10-26.

The `Admin/` folder contains only `README.md` ✅. There is no code to fix. The only fix is honesty in the docs.

## Docs (Blocker for a capstone review)

- The README shows badges "version 1.0.0" and "status Production" and describes an AI support agent, escalation dashboard, audit-logged operations gateway and a Module Federation widget. None exist.
- **Fix:** change the status badge to "Planned", add a line at the top: "Not implemented yet. Admin endpoints currently live in Payments (`/api/payments/admin/*`) and are unreachable until Auth has roles." Fix ports and service names to match `k8s/`.
- Move the design content to `docs/proposals/admin-service.md` or keep it in this README under a "Design (proposed)" heading.

## Related fixes elsewhere

- `Auth/fix.md` P1-3: add a `role` field so any admin route can work.
- `Payments/fix.md` P0-2: admin `verifyToken` ignores `kid` and the blacklist.
- Admin actions in Payments write no audit log.
