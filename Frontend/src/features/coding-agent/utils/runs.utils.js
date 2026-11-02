// Shapes the flat message list into runs (one user task plus Orion's reply).

const WELCOME_ID = 'welcome';

const PLAN_STEP_STATUS = {
  done: 'success',
  failed: 'error',
  skipped: 'skipped',
  in_progress: 'running',
};

/**
 * `key` uses the timestamp because updateMessageId swaps a message id mid-run.
 * A key built from the id would remount the live turn and lose its open panels.
 */
export function buildRuns(messages) {
  const runs = [];
  for (let i = 0; i < (messages || []).length; i++) {
    const msg = messages[i];
    if (msg.id === WELCOME_ID) continue;
    const key = `${msg.timestamp || msg.id}-${msg.role}`;
    if (msg.role === 'user') {
      const assistant = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null;
      runs.push({ id: msg.id, key, goal: msg.text, timestamp: msg.timestamp, assistant });
      if (assistant) i++;
    } else {
      runs.push({ id: msg.id, key, goal: null, timestamp: msg.timestamp, assistant: msg });
    }
  }
  return runs;
}

export const isEmptyChat = (runs) => runs.length === 0;

/** Only runs that have a user task can be selected. A recovered run has none. */
export const getSelectableIds = (runs) => runs.filter((run) => run.goal !== null).map((run) => run.id);

/** One state for a turn: live, paused, finished or failed. */
export function getTurnState(assistant, { isLatest, isStreaming, planReview }) {
  if (!assistant) return isLatest && isStreaming ? 'live' : 'finished';
  if (assistant.error || assistant.status === 'error') return 'failed';
  if (assistant.status !== 'running' || !isLatest) return 'finished';
  if (planReview) return 'paused';
  return isStreaming ? 'live' : 'finished';
}

/** The state shown in the panel header. */
export function getPanelState({ isOffline, isStreaming, planReview }) {
  if (planReview) return 'waiting';
  if (isStreaming) return 'working';
  return isOffline ? 'offline' : 'ready';
}

/** Real plan steps for the phase list. Empty when the run has no plan. */
export function getPlanPhases(steps, { isLive }) {
  const list = steps || [];
  const firstPending = list.findIndex((step) => !step.status || step.status === 'pending');
  const hasActiveStep = list.some((step) => step.status === 'in_progress');
  return list.map((step, index) => ({
    id: `step-${step.id}`,
    name: step.title,
    detail: step.summary || '',
    status: PLAN_STEP_STATUS[step.status]
      || (isLive && !hasActiveStep && index === firstPending ? 'running' : 'pending'),
  }));
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
