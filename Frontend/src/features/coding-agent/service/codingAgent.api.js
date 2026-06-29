/**
 * Coding Agent API service.
 * The pipeline agent uses Socket.io for streaming — this file exists as a
 * utility for any future REST-based invocations.
 */
export const invokeCodingAgentAPI = async (message, projectId) => {
  return fetch('/api/ai/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, projectId }),
  });
};
