import apiClient from "../../../services/apiClient";

/**
 * Coding Agent API service.
 * The pipeline agent currently uses Socket.io for streaming. Keep this helper
 * aligned with the same payload shape for any REST fallback or future endpoint.
 */
export const invokeCodingAgentAPI = async ({ message, projectId, sandboxId, modelName, attachments = [] }) => {
  const result = await apiClient.post('/api/ai/invoke', {
    message,
    projectId,
    sandboxId,
    modelName,
    attachments,
  });
  return result.data;
};
