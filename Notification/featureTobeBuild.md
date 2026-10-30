# Notification: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Retry + dead-letter queues | No email is lost silently. | none | S |
| 2 | Message contract (shared schema) | Payments and Notification disagree on field names today. A small JSON schema per event, validated on both sides. | Payments | S |
| 3 | PDF receipts as attachments | Documented, not built. | Payments #6 | M |
| 4 | User notification preferences | Respect opt-out of login emails; Auth already has a preferences model. | Auth preferences | S |
| 5 | Sandbox / agent run notifications | "Your agent run finished / needs plan approval" email when the user is away. | AI events over MQ | M |
| 6 | In-app notifications (SSE/WebSocket) | Real-time toasts in the Frontend. | Frontend | M |
| 7 | Delivery log | Store sent/failed status per message (Mongo is already a dependency) for support and the Admin service. | Admin | S |
