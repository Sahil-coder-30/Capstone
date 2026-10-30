# Auth: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Key rotation with multiple `kid`s in JWKS | Needed right away to recover from the baked-in key, and for routine rotation. | none | S |
| 2 | User roles (`user`, `admin`) and admin promotion flow | Unblocks all admin features in Payments and the future Admin service. | none | S |
| 3 | Logout everywhere ("sign out all devices") | Docs imply replay detection logs out all devices; today only one family. Revoke all families for a user + blacklist current token. | none | S |
| 4 | Session list (active devices) | Show/revoke refresh families from Settings. | #3 | M |
| 5 | Refresh grace window (`replacedBy`) | Stops multi-tab logouts. | none | S |
| 6 | Subscription in token or tier lookup endpoint | Other services need the user's tier. Prefer an internal `GET /internal/users/:id/tier` from Payments rather than a JWT claim. | Payments | S |
| 7 | OAuth `state`/PKCE | Hardening; mentioned in PRD. | none | S |
| 8 | Additional login providers (GitHub) | Natural for a developer IDE. Optional. | none | M |
| 9 | Account deletion (GDPR-style) | Delete user + cascade events to Sandbox (projects, S3), AI (chats), Payments (anonymise). | RabbitMQ events | M |
| 10 | Shared auth middleware package | Five copies of JWKS verification drift apart (Payments `keys[0]`, AI HS256). One internal package fixes that class of bug. | all services | M |
