# Sandbox/template: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Vite HMR error channel for the agent | Docs describe a "Vite HMR socket" that feeds compile errors to the Tester. Today only browser runtime errors are reported. Add a Vite plugin that forwards `server.ws` error payloads to `/api/agent/report-error`. | Agent error buffer | S |
| 2 | Additional templates (e.g. Node API, Next.js) | PRD mentions template types; only Vite React exists. Needs `TEMPLATE_TYPE` support in Agent and AI. | Agent #9 | L |
| 3 | Visual QA hook (screenshots) | README/doc 08 claim a visual verifier. Could be a headless Chromium sidecar later. | Browser extension or headless browser | L |
