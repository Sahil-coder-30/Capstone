import { useDispatch, useSelector } from 'react-redux';
import { startSandboxAPI, stopSandboxAPI, deleteProjectAPI, pingPreviewURL } from '../service/sandbox.api';
import {
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
  const waitForPreview = async (url) => {
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
  };

  /**
   * Start the sandbox for a given project.
   * Uses the sandboxId already allocated when the project was created.
   */
  const startSandbox = async (projectId) => {
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
  };

  /**
   * Stop the sandbox (soft-stop).
   * Tears down K8s Pod + Service + Redis key.
   * The project record is KEPT — sandbox can be restarted later.
   * projectId is required; sandboxId is cleared from Redux state.
   */
  const terminateSandbox = async (projectId) => {
    try {
      await stopSandboxAPI(projectId);
    } catch {
      // Swallow teardown errors — always clear local Redux state
    }
    dispatch(clearSandbox());
  };

  /**
   * Permanently delete a project and all its resources.
   * Also clears Redux sandbox state.
   */
  const deleteProject = async (projectId) => {
    try {
      await deleteProjectAPI(projectId);
    } catch {
      // Swallow errors — always clear local Redux state
    }
    dispatch(clearSandbox());
  };

  return {
    sandboxId,
    status,
    previewUrl,
    agentUrl,
    warmingMessage,
    warmingAttempt,
    error,
    startSandbox,
    terminateSandbox,
    deleteProject,
  };
};
