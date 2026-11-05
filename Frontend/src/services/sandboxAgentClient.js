import { apiClient } from './apiClient';

/**
 * HTTP client for a sandbox's sidecar (file tree, editor, logs).
 * Goes through apiClient, so every call carries the access token and a 401
 * refreshes the token and retries once. The sidecar only accepts the
 * sandbox owner's token.
 */
export const getSandboxAgentClient = (sandboxId) => {
  const isDev = window.location.port === '5173';
  const config = () => ({
    baseURL: isDev ? '/api/agent-proxy' : `http://${sandboxId}.agent.localhost`,
    headers: isDev ? { 'x-sandbox-id': sandboxId } : {},
    timeout: 30000,
  });

  return {
    get: (url) => apiClient.get(url, config()),
    post: (url, data) => apiClient.post(url, data, config()),
    patch: (url, data) => apiClient.patch(url, data, config()),
    delete: (url) => apiClient.delete(url, config()),
  };
};
