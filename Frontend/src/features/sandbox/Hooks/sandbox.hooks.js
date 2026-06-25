import { useDispatch, useSelector } from 'react-redux';
import { startSandboxAPI, stopSandboxAPI, pingPreviewURL } from '../service/sandbox.api';
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
        // Container is up — transition to fully running
        dispatch(setStatus('running'));
        return true;
      }

      attempt++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Timeout
    dispatch(setError(
      'Sandbox preview took too long to become available. ' +
      'The container may still be starting — try refreshing.'
    ));
    return false;
  };

  const startSandbox = async () => {
    try {
      dispatch(setStatus('starting'));

      const data = await startSandboxAPI();

      /**
       * Backend response shape (from /api/sandbox/start):
       * {
       *   status: "success",
       *   message: "Sandbox with ID <uuid> created successfully",
       *   previewUrl: "http://<uuid>.preview.localhost",
       *   agentUrl:   "http://<uuid>.agent.localhost/api/agent/list-files"
       * }
       *
       * Note: the backend does NOT return sandboxId as its own field.
       * We extract it from previewUrl, which is the most reliable source.
       */
      const extractedId =
        // 1. Direct field (future-proof if backend adds it)
        data.sandboxId ||
        // 2. Parse from previewUrl: "http://<uuid>.preview.localhost"
        data.previewUrl?.match(/^https?:\/\/([^.]+)\./)?.[1] ||
        // 3. Fallback: parse from the message string
        data.message?.match(/ID\s+([a-f0-9-]{36})/i)?.[1];

      if (!extractedId) {
        throw new Error(
          data.message || 'Sandbox started but could not determine sandbox ID'
        );
      }

      // Save sandbox details immediately so terminal / file explorer can use them
      dispatch(setSandboxDetails({
        sandboxId: extractedId,
        previewUrl: data.previewUrl || '',
        agentUrl: data.agentUrl || '',
      }));

      // Enter warming phase — poll until preview container responds
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

  const terminateSandbox = async () => {
    if (sandboxId) {
      try {
        await stopSandboxAPI(sandboxId);
      } catch {
        // Swallow teardown errors — always clear local state
      }
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
  };
};
