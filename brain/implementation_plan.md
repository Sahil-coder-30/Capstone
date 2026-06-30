# K8s Pod Status Reconciliation

## Problem
MongoDB is used as the source of truth for sandbox status (`not_started`, `building`, `live`, `down`).
But K8s pod state evolves independently — pods can crash, be deleted, or be started externally
without the DB ever being updated. This causes:
- DB says `"live"` → pod is actually gone → frontend shows broken sandbox
- DB says `"down"` → pod is actually Running → frontend forces a redundant restart
- Force-restart hit 409 because DB said `"live"` but the old pod was still terminating

## Solution: Reconcile on every GET /project/:id

Add a `getPodStatus(sandboxId)` helper that queries K8s for the actual pod phase.
Update `getProjectStatusController` to call it and sync the DB status from the real pod state.

### K8s Pod Phases → DB Status mapping
| K8s Phase   | DB Status set to |
|-------------|-----------------|
| Running     | `live`          |
| Pending     | `building`      |
| Succeeded / Failed / Unknown | `down` |
| 404 (no pod)| `down` (or `not_started` if was never started) |

## Files Changed

### [NEW] pod.js — add getPodStatus()
Export a function that reads the real pod phase from K8s. Returns `"Running"`, `"Pending"`,
`"Succeeded"`, `"Failed"`, `"Unknown"`, or `null` (pod not found).

### sandbox.controller.js — reconcile in getProjectStatusController
Before returning status, call `getPodStatus(sandboxId)`. Map the real phase to the canonical
DB status, update MongoDB if it changed, then return the reconciled value to the frontend.

### startSandboxController — remove stale-status workaround
The force-restart / allSettled cleanup is no longer needed for the stale-status case because
`getProjectStatusController` now corrects the DB before the frontend ever calls `/start`.
Keep the 409-safe createPod/createService for safety.
