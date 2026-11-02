// Decides the one status line shown under a turn.

import { formatTargets } from './toolSteps.utils';

const OUTCOME_TONES = {
  'Could not complete': 'error',
  'Partly done': 'warning',
  Stopped: 'info',
};

const looksLikeRawData = (text) => /^\s*[[{]/.test(text || '');

const liveStatus = (streamState, steps) => {
  if (streamState?.phase === 'rate_limit') {
    return { tone: 'warning', title: streamState.title, detail: streamState.detail };
  }

  const current = [...steps].reverse().find((step) => step.status === 'running');
  if (current) {
    return { tone: 'running', title: current.verb.active, detail: formatTargets(current.targets) };
  }

  if (streamState?.phase === 'tool') return { tone: 'running', title: 'Working', detail: '' };
  if (!streamState?.title) return { tone: 'running', title: 'Preparing Orion', detail: '' };

  const detail = looksLikeRawData(streamState.detail) ? '' : streamState.detail;
  return { tone: 'running', title: streamState.title, detail };
};

/**
 * Returns { tone, title, detail } or null when the turn needs no line.
 * A clean finish needs none, the report itself says it. A failure is shown by
 * the error notice instead.
 */
export function getRunStatus(streamState, steps, turnState) {
  if (turnState === 'live') return liveStatus(streamState, steps);
  if (turnState === 'paused') {
    return { tone: 'paused', title: 'Waiting for your approval', detail: 'Review the plan below' };
  }
  if (turnState === 'finished') {
    const tone = OUTCOME_TONES[streamState?.title];
    return tone ? { tone, title: streamState.title, detail: '' } : null;
  }
  return null;
}
