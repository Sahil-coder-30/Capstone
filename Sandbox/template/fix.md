# Sandbox/template: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report.

---

## P1: Correctness

- **`/api/terminal-proxy` is proxied but does not exist on the agent 📄:** remove that proxy entry from `vite.config.js` (the main Frontend has its own `terminal-proxy`, which is a different thing).
- **Error reporter wraps `console.error` and POSTs every call ✅** (`vite.config.js` `error-reporter` plugin): a component that logs in a render loop floods `/api/agent/report-error`. Debounce/dedupe (same message within 2 s) and cap at ~20 per minute in the injected script.
- **`allowedHosts: true` 📄:** acceptable behind the router, but restrict to `.preview.localhost` / the production preview domain once known.
- **`PORT` is ignored (hard-coded 5173) 📄:** read `process.env.PORT ?? 5173` or remove `PORT` from docs.

## P2

- The image ships `node_modules` and is also the long-running Vite container. Fine, but keep the image small: multi-stage build, `npm ci --omit=dev` is not possible for Vite, so at least clean the npm cache.
- Pin the Node base image to a digest or minor version.

## Docs

`Sandbox/template/README.md`:
- The image is not init-only: it runs as the init container (copies seed files) **and** as the long-running Vite dev server on 5173.
- Document the injected error reporter, the `/api/agent` proxy, the auto-restart on `package.json` change, and `allowedHosts: true`.
- `skills/`: the tool count is 10, not "exactly 8".
