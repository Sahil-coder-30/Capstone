# Sandbox/sync-agent: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against code on 2026-10-26.
Legend: ✅ re-verified in code. 📄 from the report.

---

## P0: Security

### P0-1. `.env` files are uploaded to S3 ✅
- **Where:** `sync.js:160-172`. `DEFAULT_IGNORE_FILES` is only `.DS_Store` and `.is-new-project`; no rule for `.env`. The PRD says `.env` is excluded.
- **Fix:** add `.env`, `.env.*` (but keep `.env.example`), `*.pem`, `*.key`, `.npmrc` to the ignore rules. Match on basename with a small glob, not `filePath.includes(...)` (the current `extraIgnorePatterns` check is a substring match, so a pattern like `env` would also drop `environment.js`).
- **Clean-up:** list existing `.env` objects in the bucket and decide with the developer whether to delete them (destructive, needs approval).

## P1: Correctness

- **Restore applies no ignore rules 📄:** if a bad object is in S3 (e.g. old `node_modules`), restore pulls it. Apply the same ignore rules on restore.
- **`unlinkDir` deletes by S3 prefix ✅ (OK):** the prefix already ends with `/` (`sync.js:280`), so deleting `src/comp` does not touch `src/components/`. No fix needed; just document it and keep a test for it.
- **Only `PROJECT_ID` and `AWS_BUCKET_NAME` fail fast 📄:** also fail fast on missing `AWS_REGION` and credentials, with a clear log line.
- **Restore then `npm install` 📄:** a failed install leaves the pod half-ready with no signal. Write a marker file / exit non-zero so the init container fails visibly.

## P2

- Add a max file size (e.g. 20 MB) so a user cannot push huge binaries to S3 through the editor.
- Log a per-run summary (files uploaded, bytes, failures) for debugging.

## Docs

`Sandbox/sync-agent/README.md`:
- Restore runs in a separate init container with `--restore-only`, then `npm install`.
- Secret name is `aws-secret`, not `aws`.
- Restore runs in parallel (p-limit 8) and applies no ignore rules (until fixed).
