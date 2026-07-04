/**
 * Coding Agent API service.
 * The pipeline agent currently uses Socket.io for streaming. Keep this helper
 * aligned with the same payload shape for any REST fallback or future endpoint.
 */
export const invokeCodingAgentAPI = async ({ message, projectId, sandboxId, modelName, attachments = [] }) => {
  return fetch('/api/ai/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, projectId, sandboxId, modelName, attachments }),
  });
};
