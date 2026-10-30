# Admin: features to be built

Everything here is unbuilt. Build only after Auth roles exist.

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Admin service skeleton (Express, RS256/JWKS auth, `role: admin` check, FaultKit, health/ready) | Base for everything below. | Auth roles | S |
| 2 | Audit log | Every admin action (grant/reset credits, plan changes) recorded with actor, target, before/after, reason. | #1 | S |
| 3 | User and subscription lookup | Search users, see tier, credits, transactions (proxy to Payments admin routes). | Payments admin API | M |
| 4 | Operations gateway | Safe, audited repairs: resync a Razorpay payment, grant credits, stop a stuck sandbox. | Payments, Sandbox server | M |
| 5 | System health dashboard | Service health, queue depths, running sandboxes. | metrics stack | M |
| 6 | Support tickets + escalation | Ticket model, admin replies, real-time updates. | Notification | L |
| 7 | AI support agent (RAG over FAQs, credit lookups) | README headline. | AI service | L |
| 8 | Module Federation `SupportChatWidget` | Embed support chat in Frontend. | Frontend build config | M |
| 9 | Admin frontend | UI for 3-6. | #1-#5 | L |

Suggested order: 1 → 2 → 3 → 4 → 9 (basic) → 5 → 6 → 7 → 8.
