import { authenticatedFetch } from '../../../services/apiClient';

/**
 * Co-pilot API service.
 * Calls /api/ai/app-agent/invoke — the app agent SSE endpoint.
 * Proxied by Vite to the AI orchestration service.
 */
export const invokeCopilotAPI = (payload) => {
  return authenticatedFetch('/api/ai/app-agent/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};
