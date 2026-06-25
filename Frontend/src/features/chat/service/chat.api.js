import axios from 'axios';

/**
 * Chat / AI invoke uses a relative path → routed by Vite proxy to backend.
 * Using native fetch (not axios) so we can read the SSE response body as a
 * ReadableStream directly in the browser.
 */
export const invokeAgentAPI = async (message, projectId) => {
  return fetch('/api/ai/invoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, projectId }),
  });
};
