import { useCallback } from 'react';
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

  /**
   * Poll previewUrl every POLL_INTERVAL_MS until the container responds
   * with a non-error HTTP status, or until WARM_TIMEOUT_MS is exceeded.
   */
  const waitForPreview = useCallback(async (url) => {
    const deadline = Date.now() + WARM_TIMEOUT_MS;
    let attempt = 0;

    while (Date.now() < deadline) {
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
   * Uses the sandboxId already allocated when the project was created.
   */
  const startSandbox = useCallback(async (projectId) => {
    try {
      dispatch(setStatus('starting'));

      const data = await startSandboxAPI(projectId);

      // Extract the sandboxId from previewUrl (backend does not return it directly)
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
        dispatch(setWarmingProgress({ attempt: 0, message: WARMING_STEPS[0].message }));
        await waitForPreview(data.previewUrl);
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
   * Stop the sandbox (soft-stop).
   * Tears down K8s Pod + Service + Redis key.
   * The project record is KEPT — sandbox can be restarted later.
   * projectId is required; sandboxId is cleared from Redux state.
   */
  const terminateSandbox = useCallback(async (projectId) => {
    try {
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
   * Also clears Redux sandbox state.
   */
  const deleteProject = useCallback(async (projectId) => {
    try {
      await deleteProjectAPI(projectId);
      dispatch(clearSandbox(projectId));
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to delete project';
      dispatch(setError(errMsg));
      throw err;
    }
  }, [dispatch]);

  const loadSandboxStatus = useCallback(async (projectId) => {
    if (!projectId) {
      dispatch(initializeSandboxForProject(null));
      return;
    }
    try {
      dispatch(setStatus('starting'));
      const data = await getProjectStatusAPI(projectId);
      if (data.status === 'success' && data.project) {
        const { status: projStatus, sandboxId: sId } = data.project;
        if (projStatus === 'live') {
          dispatch(setSandboxDetails({
            projectId,
            sandboxId: sId,
            previewUrl: `http://${sId}.preview.localhost`,
            agentUrl: '',
          }));
          return;
        } else if (projStatus === 'building') {
          const previewUrl = `http://${sId}.preview.localhost`;
          dispatch(setSandboxDetails({
            projectId,
            sandboxId: sId,
            previewUrl,
            agentUrl: '',
          }));
          dispatch(setWarmingProgress({ attempt: 0, message: 'Attaching to active sandbox boot…' }));
          await waitForPreview(previewUrl);
          return;
        }
      }
      dispatch(initializeSandboxForProject(projectId));
    } catch (err) {
      dispatch(initializeSandboxForProject(projectId));
    }
  }, [dispatch, waitForPreview]);

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
