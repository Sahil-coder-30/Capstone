# WhatsApp and notifications: screens and components

UI for [kafka-whatsapp-architecture.md](../../kafka-whatsapp-architecture.md). Wireframes: [wireframes.html](wireframes.html). Design rules: [../README.md](../README.md#design-system).

## Which stages need UI

| Stage | UI | Why |
|---|---|---|
| K0 Learn, K1 Kafka core | None | Infrastructure |
| K2 Payments mail, K3 Auth on Kafka | None | Same emails, delivered more reliably |
| K4 AI events | None for users | Pro users get Pro limits; nothing to show |
| **K5 WhatsApp** | WA-1 to WA-5 in the user app | "Link phone" screen (plan 3.7), runs controlled by message |
| **K6 Admin on Kafka** | NT-1 to NT-4 in the admin portal | Announcements, delivery log, failed deliveries and replay (plan 7.2, 7.3) |
| K7 Metrics and logs | Admin portal cluster pages | Covered in [../admin-platform/screens.md](../admin-platform/screens.md) (AD-30 to AD-33) |
| K8 Scale | Admin portal Kafka health | One panel in AD-30 (consumer lag), optional |

## User app (Frontend)

| Screen | Component |
|---|---|
| WA-1 Notifications settings | `features/settings/components/SettingsNotificationsPage.jsx`, new sub tab `notifications` |
| WA-2 Link phone | `features/settings/components/LinkWhatsappModal.jsx` |
| WA-3 Linked | same page, linked state |
| WA-4 Run from WhatsApp | `features/coding-agent/components/conversation/UserMessage.jsx` (source pill), `PlanReviewCard.jsx` (hint) |
| WA-5 Message copy | Notification service templates, `src/channels/whatsapp/` |

### WA-1 Notifications settings

- Sub tab "Notifications" (bell icon) in the settings sidebar.
- **Email card**: "Sent to <masked email>. Payment receipts and security alerts always go by email." One switch: "Offers and product news" → `recipients.marketingOptIn`.
- **WhatsApp card**, not linked: icon, title, one sentence, `Link WhatsApp` (`btn-primary`).

### WA-2 Link phone

1. `Link WhatsApp` calls Notification (through the gateway) to create a 6 digit code, 10 minute TTL.
2. Modal (app `.modal-card` style, 440 px): code as six mono boxes, then the exact message `LINK 482917` with the Taksha number and a copy button.
3. `Open WhatsApp with the message`: click-to-chat link with the text prefilled.
4. Waiting notice with spinner and countdown. Poll link status every 3 s.
5. Success: green check ring, "WhatsApp linked", masked number, `Done`.

**Errors**
| Case | Copy | Action |
|---|---|---|
| Code expired | This code expired. | `New code` |
| Number already linked to another account | This number is linked to another Taksha account. Unlink it there first. | `Close` |
| Test number limit (free tier) | Taksha can only message approved numbers during the trial. Ask support to add yours. | `Contact support` |

### WA-3 Linked state

- Badge "Linked", masked number, link date, `Unlink` (`btn-danger`, confirm "Unlink WhatsApp? You stop getting messages there and cannot control runs by message.").
- Switch "Run updates on WhatsApp" → `whatsappOptIn`. Switch "Offers on WhatsApp" → marketing on WhatsApp (off by default).
- Commands card: the same list the bot sends after linking: `projects`, `run <n> <prompt>`, `status`, `approve`, `reject <reason>`, `stop`.

### WA-4 Runs started from WhatsApp

- The user message gets a small pill above it: message icon + "From WhatsApp · 18:20". Needs `source: 'whatsapp'` on the stored message.
- PlanReviewCard unchanged, plus a right-aligned muted hint "also sent to WhatsApp" when the run came from WhatsApp.
- When approved on one side, the other side shows "Approved on WhatsApp" / "Approved in Taksha" instead of the buttons.

### WA-5 Message copy

Rules: plain text, short lines, the project name in every run message, one link at most, no emoji in system replies. Templates for closed windows carry the same facts. The full copy table is on the wireframe. The phone sketch is only there to read the copy; it does not copy WhatsApp's look.

## Admin portal (K6, notify module)

These screens use the admin portal shell from [../admin-platform/](../admin-platform/). They appear only after K6 exists and only for accounts with the `notify.*` grants.

| Screen | Grant | Data |
|---|---|---|
| NT-1 Announcements list | `notify.send` or `notify.view_deliveries` | Admin DB announcements + `deliveries` counts |
| NT-2 Compose | `notify.send` (limits: audience, channels, max per day) + passkey step-up | Readers resolve the audience |
| NT-3 Delivery log | `notify.view_deliveries` | `deliveries` (read-only Mongo user) |
| NT-4 Failed and replay | `notify.replay` | `deliveries` status failed, `POST /internal/deliveries/:id/replay` |

### NT-1 Announcements

Table: title, audience, channels, sent, failed (red when above 0), skipped, status badge (`Draft`, `Sending n%`, `Sent`, `Stopped`), when. Primary action `New announcement`. Footnote explains "Skipped".

### NT-2 Compose

- Left column: Type (`Service notice` / `Offer`), Title, Message (plain text, counter), Audience chips (`All users`, `By tier` → tier chips, `User list` → paste box), Channels checkboxes.
- Right column: "Who gets it" panel with the live count per channel and skipped, a WhatsApp cost warning (rate comes from config, never hard-coded), the admin's daily limit and what is used today. Email preview below.
- Top bar: `Save draft`, `Send to <n> people`. Send asks for the passkey step-up (AD-05), then returns to NT-1 with the row in "Sending".
- Offer type forces opt-in only and adds the unsubscribe footer in the preview.

### NT-3 Delivery log

- Scope strip (dashed indigo) with the limits the backend applied: history days, masking. The strip text comes from the API response, never from the client.
- Filters: user id or email search, event, channel, status, date range.
- Columns: when, user (masked unless the grant allows), event (mono), channel, status badge (`Sent`, `Retrying`, `Failed`, `Skipped`), attempts, last error.
- Row opens a drawer: event id, payload summary (no secrets), every attempt with time and error.
- The same table filtered to one user is a tab in User 360 (AD-21).

### NT-4 Failed deliveries

- KPIs: items in the DLQ (with age of the oldest), email failure rate 24 h, WhatsApp failure rate 24 h.
- Table with checkboxes, per-row `Replay`. Rows that cannot succeed show "Will fail again" instead (invalid number, unsubscribed).
- `Replay selected` opens a confirm drawer: counts per channel, the dedupe promise "A delivery already marked sent is skipped, so nobody gets a message twice.", "Logged in the audit log". Button `Replay n`.
