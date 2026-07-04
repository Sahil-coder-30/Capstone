import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { startSandboxAPI, stopSandboxAPI, deleteProjectAPI, pingPreviewURL, getProjectStatusAPI } from '../service/sandbox.api';
import {
  initializeSandboxForProject,
  setSandboxDetails,
  setStatus,
  setWarmingProgress,
  setError,
  clearSandbox,
} from '../slice/sandbox.slice';
import { clearCachedFilesForSandbox, deleteCachedProject } from '../../editor/service/dbService';

// How long to poll before giving up (ms)
const WARM_TIMEOUT_MS = 90_000;
// Delay between polls (ms)
const POLL_INTERVAL_MS = 2_000;

const WARMING_STEPS = [
  { attempt: 0,  message: 'Provisioning sandbox container…'      },
  { attempt: 3,  message: 'Container starting — pulling image…'  },
  { attempt: 6,  message: 'Installing dependencies…'             },
  { attempt: 10, message: 'Starting Vite dev server…'            },
  { attempt: 14, message: 'Waiting for network to be ready…'     },
  { attempt: 18, message: 'Almost there…'                        },
];

function getWarmingMessage(attempt) {
  let msg = WARMING_STEPS[0].message;
  for (const step of WARMING_STEPS) {
    if (attempt >= step.attempt) msg = step.message;
  }
  return msg;
}

export const useSandbox = () => {
  const dispatch = useDispatch();
  const {
    sandboxId,
    status,
    previewUrl,
    agentUrl,
    warmingMessage,
    warmingAttempt,
    error,
  } = useSelector((state) => state.sandbox);

  // Tracks ongoing waitForPreview loops so we can abort them on project switch
  const warmingAbortRef = useRef(false);

  /**
   * Poll previewUrl every POLL_INTERVAL_MS until the container responds,
   * or until WARM_TIMEOUT_MS is exceeded, or until aborted.
   * Returns true if preview came up, false otherwise.
   */
  const waitForPreview = useCallback(async (url, abortRef) => {
    const deadline = Date.now() + WARM_TIMEOUT_MS;
    let attempt = 0;

    while (Date.now() < deadline) {
      // Abort if project switched mid-wait
      if (abortRef?.current) return false;

      dispatch(setWarmingProgress({
        attempt,
        message: getWarmingMessage(attempt),
      }));

      const isUp = await pingPreviewURL(url);

      if (isUp) {
        dispatch(setStatus('running'));
        return true;
      }

      attempt++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    dispatch(setError(
      'Sandbox preview took too long to become available. ' +
      'The container may still be starting — try refreshing.'
    ));
    return false;
  }, [dispatch]);

  /**
   * Start the sandbox for a given project.
   * On success, kicks off the preview warmup polling loop.
   * This should be called explicitly (user action or loadSandboxStatus decision).
   * NEVER call this in response to a status change — use loadSandboxStatus instead.
   */
  const startSandbox = useCallback(async (projectId) => {
    try {
      dispatch(setStatus('starting'));

      const data = await startSandboxAPI(projectId);

      const extractedId =
        data.sandboxId ||
        data.previewUrl?.match(/^https?:\/\/([^.]+)\./)?.[1] ||
        data.message?.match(/ID\s+([a-f0-9-]{36})/i)?.[1];

      if (!extractedId) {
        throw new Error(data.message || 'Sandbox started but could not determine sandbox ID');
      }

      dispatch(setSandboxDetails({
        projectId,
        sandboxId: extractedId,
        previewUrl: data.previewUrl || '',
        agentUrl: data.agentUrl || '',
      }));

      if (data.previewUrl) {
        warmingAbortRef.current = false;
        dispatch(setWarmingProgress({ attempt: 0, message: WARMING_STEPS[0].message }));
        waitForPreview(data.previewUrl, warmingAbortRef);
      } else {
        dispatch(setStatus('running'));
      }

      return data;
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Error launching sandbox';
      dispatch(setError(errMsg));
      throw err;
    }
  }, [dispatch, waitForPreview]);

  /**
   * Load the REAL sandbox status for a project by querying the backend.
   * The backend reconciles with K8s before responding, so the status returned
   * is always the ground truth — not a stale DB value.
   *
   * This function is SILENT — it does NOT flash the UI with 'starting' before
   * the fetch completes. This prevents disrupting a sandbox that is already
   * running (e.g. after the Dashboard playground flow just started it).
   *
   * Status flow after this call:
   *   "live"        → set Redux to 'running' immediately (pod is confirmed up by backend)
   *   "building"    → attach to the warmup polling loop
   *   "down" / "not_started" → set Redux to 'idle' (caller decides whether to start)
   *   error / null  → set Redux to 'idle' (safe default)
   *
   * Returns the reconciled status string so callers can decide what to do next.
   */
  const loadSandboxStatus = useCallback(async (projectId) => {
    // Abort any in-progress warmup loop from a previous project
    warmingAbortRef.current = true;

    if (!projectId) {
      dispatch(initializeSandboxForProject(null));
      return 'idle';
    }

    try {
      // NOTE: No dispatch(setStatus('starting')) here.
      // Flashing 'starting' upfront would disrupt a sandbox already running
      // (e.g. just started by the Dashboard playground flow), causing AIChat
      // to show "Sandbox offline." and breaking the initialPrompt timing.
      const data = await getProjectStatusAPI(projectId);

      if (data.status !== 'success' || !data.project) {
        dispatch(initializeSandboxForProject(projectId));
        return 'idle';
      }

      const { status: realStatus, sandboxId: sId, previewUrl: pUrl } = data.project;

      if (realStatus === 'live') {
        // Backend confirmed the pod is Running — show immediately as running
        dispatch(setSandboxDetails({
          projectId,
          sandboxId: sId,
          previewUrl: pUrl || `http://${sId}.preview.localhost`,
          agentUrl: '',
        }));
        return 'live';
      }

      if (realStatus === 'building') {
        // Pod is Pending in K8s — attach to warmup loop
        const previewUrl = pUrl || `http://${sId}.preview.localhost`;
        dispatch(setSandboxDetails({
          projectId,
          sandboxId: sId,
          previewUrl,
          agentUrl: '',
        }));
        warmingAbortRef.current = false;
        dispatch(setWarmingProgress({ attempt: 0, message: 'Attaching to active sandbox boot…' }));
        const isUp = await waitForPreview(previewUrl, warmingAbortRef);
        if (!isUp && !warmingAbortRef.current) {
          // Warmup timed out and we weren't aborted — reset to idle
          dispatch(initializeSandboxForProject(projectId));
        }
        return isUp ? 'live' : 'idle';
      }

      // "down", "not_started", or any unexpected value → idle
      dispatch(initializeSandboxForProject(projectId));
      return 'idle';

    } catch (_err) {
      // Network error or backend crash — don't leave the UI broken
      dispatch(initializeSandboxForProject(projectId));
      return 'idle';
    }
  }, [dispatch, waitForPreview]);

  /**
   * Stop the sandbox (soft-stop).
   * Tears down K8s Pod + Service + Redis key.
   * The project record is KEPT — sandbox can be restarted later.
   */
  const terminateSandbox = useCallback(async (projectId) => {
    try {
      warmingAbortRef.current = true; // abort any in-progress warmup
      await stopSandboxAPI(projectId);
      dispatch(clearSandbox(projectId));
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to stop sandbox';
      dispatch(setError(errMsg));
      throw err;
    }
  }, [dispatch]);

  /**
   * Permanently delete a project and all its resources.
   */
  const deleteProject = useCallback(async (projectId, sandboxId = null) => {
    try {
      warmingAbortRef.current = true; // abort any in-progress warmup
      await deleteProjectAPI(projectId);
      dispatch(clearSandbox(projectId));

      // Clean up cached files from IndexedDB for this sandbox
      if (sandboxId) {
        await clearCachedFilesForSandbox(sandboxId);
      }

      // Clean up project from IndexedDB projects list
      await deleteCachedProject(projectId);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to delete project';
      dispatch(setError(errMsg));
      throw err;
    }
  }, [dispatch]);

  return {
    sandboxId,
    status,
    previewUrl,
    agentUrl,
    warmingMessage,
    warmingAttempt,
    error,
    loadSandboxStatus,
    startSandbox,
    terminateSandbox,
    deleteProject,
  };
};
