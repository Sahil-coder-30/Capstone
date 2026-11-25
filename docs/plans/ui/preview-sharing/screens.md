# Preview access and share links: screens and components

UI for the sandbox edge auth built on 2026-11-25 (`Sandbox/router/src/sandboxEdgeAuth.js`, commits `a777787` and `49ea8c7`) and the preview share links decided the same day. Wireframes: [wireframes.html](wireframes.html). Design rules: [../README.md](../README.md#design-system).

## Decisions these screens follow

- `*.agent` and `*.preview` are owner-only. Strangers get "This preview is private".
- A **share link** lets anyone open the live preview with no login: **1 hour**, **view-only** (GET and HEAD only, anything else is 405), revocable, multi-use (chat apps fetch links to draw a card), refused on the agent host, and it **never refreshes the sandbox idle TTL**.
- The header **Share** button belongs to V2.5 Taksha Hosting (deploys). It is hidden until V2.5. Sharing a dev-server preview lives in the Preview tab.
- A share viewer reaches the Vite dev server, so they can read the source. The popover says so. A built, source-free public site is V2.5 Hosting.

| Screen | Where | Component(s) |
|---|---|---|
| PS-1 Preview tab, owner | `App.jsx` Preview tab | `PreviewBar.jsx` (new), `usePreviewSession.js` (new), `SandboxHeader.jsx` (hide Share) |
| PS-2 Share this preview | Popover under "Share preview" | `SharePreviewPopover.jsx` |
| PS-3 The link is live | Same popover | `SharePreviewPopover.jsx`, `LiveLinkRow.jsx`, `Toast` |
| PS-4 From WhatsApp | WhatsApp bot (K5) | Bot copy in Notification service |
| PS-5 What a viewer sees | Any browser | The user's own app, untouched |
| PS-6 Link pages | Router | Static HTML pages in the router |

## PS-1 Preview tab for the owner

- The iframe never loads straight away. `usePreviewSession(sandboxId)` first calls `POST https://<id>.preview…/__taksha/session` with `credentials: "include"` and the owner's bearer. The router sets the partitioned `tks_sbx_<id>` cookie (12 h). Then the iframe loads. Same call on the agent host before the terminal socket and agent client start.
- Renew the session before 12 h (on focus if older than 11 h). On 401, refresh the access token once, then show "Couldn't open your preview" (States).
- `pingPreviewURL` (readiness ping) sends the bearer through the Vite proxy; it no longer works anonymously.
- URL bar: lock + "Only you" while no link is live; amber globe + "Shared · 59 min left" while one is.
- **New tab**: `POST /__taksha/session?ticket` → `{ ticket }` (60 s, single use) → `window.open(https://<id>.preview…/__taksha/session?ticket=…&next=<current path>)`. The router sets a first-party cookie and redirects, so the token leaves the address bar at once.
- `SandboxHeader.jsx`: remove the Share button (it copied `previewUrl`, which strangers now can't open). It comes back in V2.5 pointing at Hosting.

## PS-2 Share this preview

- Popover, 340 px, anchored to "Share preview". Title "Share a live preview".
- Four facts, icon + one sentence each: view-only; 1 hour; doesn't keep your sandbox on; viewers can read the source.
- One primary action `Create link`. No duration picker (1 hour is the decision).
- Footer link to V2.5 Hosting ("Want a permanent public site?"), hidden until V2.5.

## PS-3 The link is live

- Title "Anyone with this link can view", the full URL in mono with `Copy` (on mobile `navigator.share`). Toast "Link copied".
- "View-only. Stops working at 11:42 AM (59 min)." in the user's local time.
- Live links list, newest first: created time, source (this editor or WhatsApp), time left, `Turn off`. `Turn off all links` (danger) with a confirm (States).
- Counts down every minute; a link that ends drops off the list. When none are left the URL bar returns to "Only you".

## PS-4 From WhatsApp (K5)

- "preview <project>" → the bot replies with the link, who can see it, for how long, and how to stop it. "stop sharing" turns off the newest link from that chat; "stop sharing all" turns off every live link for the project.
- Stopped sandbox: the bot asks "Start it and send the link?" first. A share link never wakes a sandbox.
- The bot is honest about the idle timer: only the owner's activity (editor, agent, bot commands) keeps it on.

## PS-5 What a viewer sees

- The user's own app at a clean URL. Taksha injects nothing into it.
- Any write the app tries (POST, PUT, PATCH, DELETE) gets 405 from the router; the app shows its own error. Expected for view-only.

## PS-6 Link pages

- Router error answers become small static HTML pages when the request accepts `text/html`; API calls keep the JSON. Same status codes.
- Pages: expired (401), turned off (401), asleep (503, pod unreachable), private (401, a bare URL without a cookie). Never name the owner.

## States

Connecting (skeleton in the preview, spinner in the URL bar), session failed, create failed, confirm "Turn off all 2 links?", done toast "Turned off 2 links".

## Backend work these screens need (not built yet)

| Need | Where | Why |
|---|---|---|
| `previewShares` records: sid, sandboxId, ownerId, source (`editor` / `whatsapp`), createdAt, expiresAt; TTL index on expiresAt | Sandbox server (Mongo) | PS-3 list, "Turn off all", "stop sharing" from WhatsApp. The router stays stateless apart from the Redis revoke key. |
| `POST /internal/sandboxes/:id/share` and `…/share/:sid/revoke` with `X-Internal-Token` | Router (signs) called by the Sandbox server (records) | The WhatsApp bot has no user access token. Bot → Notification → Sandbox server → router, the same internal path pattern as `/internal/sandboxes/:id/mcp`. |
| HTML versions of the 401/405/503 answers | Router `sandboxEdgeAuth.js` `deny` | PS-6 |
| Session call before iframe and sockets, ticket for New tab, bearer on the preview ping, hide header Share | Frontend | PS-1 |
