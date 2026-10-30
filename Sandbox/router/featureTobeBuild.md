# Sandbox/router: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Token gate for `*.agent.*` (HTTP + WS) | Closes the unauthenticated sidecar path. | Sandbox server access tokens | M |
| 2 | Private previews (optional) | Signed cookie per preview host if previews should not be public. | #1 | S |
| 3 | LRU proxy cache + throttled TTL refresh | Memory and Redis load under many sandboxes. | none | S |
| 4 | Friendly "sandbox stopped" responses | Clear UX when a pod has been torn down. | none | S |
| 5 | Metrics (requests per sandbox, upstream errors, WS connections) | Visibility. | monitoring stack | S |
