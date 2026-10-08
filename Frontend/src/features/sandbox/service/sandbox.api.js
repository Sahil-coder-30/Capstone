import apiClient from '../../../services/apiClient';

/**
 * All requests use RELATIVE paths so the Vite dev server proxy
 * (and the Ingress in production) handles routing to the backend.
 */

export const startSandboxAPI = async (projectId) => {
  const response = await apiClient.post(`/api/sandbox/start/${projectId}`, {}, { timeout: 120_000 });
  return response.data;
};

export const createProjectAPI = async (title) => {
  const response = await apiClient.post('/api/sandbox/create-project', { title }, { timeout: 30_000 });
  return response.data;
};

export const listProjectsAPI = async () => {
  const response = await apiClient.get('/api/sandbox/projects', { timeout: 30_000 });
  return response.data;
};

export const getProjectStatusAPI = async (projectId) => {
  const response = await apiClient.get(`/api/sandbox/project/${projectId}`, { timeout: 30_000 });
  return response.data;
};

export const checkSandboxHealthAPI = async (sandboxId) => {
  const response = await apiClient.get(`/api/sandbox/health/${sandboxId}`, { timeout: 30_000 });
  return response.data;
};

/**
 * Stop a running sandbox — keeps the project record alive so it can be restarted.
 * Tears down: K8s Pod + Service + Redis key.  Status → "down".
 */
export const stopSandboxAPI = async (projectId) => {
  const response = await apiClient.post(`/api/sandbox/stop/${projectId}`, {}, { timeout: 120_000 });
  return response.data;
};

/**
 * Permanently delete a project and all its resources.
 * If the sandbox was live, K8s resources are removed first.
 */
export const deleteProjectAPI = async (projectId) => {
  const response = await apiClient.delete(`/api/sandbox/project/${projectId}`, { timeout: 120_000 });
  return response.data;
};

export const listTrashProjectsAPI = async () => {
  const response = await apiClient.get('/api/sandbox/projects/trash', { timeout: 30_000 });
  return response.data;
};

export const restoreProjectAPI = async (projectId) => {
  const response = await apiClient.patch(`/api/sandbox/project/${projectId}/restore`, {}, { timeout: 30_000 });
  return response.data;
};

export const permanentlyDeleteProjectAPI = async (projectId) => {
  const response = await apiClient.delete(`/api/sandbox/project/${projectId}/permanent`, { timeout: 120_000 });
  return response.data;
};

export const getTrashChatsAPI = async () => {
  const response = await apiClient.get('/api/ai/chats/trash', { timeout: 30_000 });
  return response.data;
};

export const deleteSingleChatMessageAPI = async (messageId, agentType = 'codingAgent') => {
  const ids = Array.isArray(messageId) ? messageId : String(messageId).split(',');
  const response = await apiClient.post('/api/ai/chats/message/batch-delete', { ids, agentType }, { timeout: 30_000 });
  return response.data;
};

export const restoreChatMessageAPI = async (messageId, agentType = 'codingAgent') => {
  const response = await apiClient.patch(`/api/ai/chats/message/${messageId}/restore`, { agentType }, { timeout: 30_000 });
  return response.data;
};

export const permanentlyDeleteChatMessageAPI = async (messageId, agentType = 'codingAgent') => {
  const response = await apiClient.delete(`/api/ai/chats/message/${messageId}/permanent?agentType=${agentType}`, { timeout: 30_000 });
  return response.data;
};

/**
 * Ping the preview URL to check if the sandbox container is fully up.
 *
 * The preview runs on a subdomain like http://<sandboxId>.preview.localhost
 * which is a different origin → direct fetch would be blocked by CORS.
 *
 * Instead we route through the Vite proxy at /api/preview-ping which:
 *   1. Reads the X-Preview-Host header to know the target host
 *   2. Forwards the request and returns the upstream status code
 *
 * Returns true if the preview responded with a non-5xx status (i.e. it's up),
 * false if the container is still starting / proxy still returning 502/503/504.
 */
export const pingPreviewURL = async (previewUrl) => {
  try {
    const host = previewUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const res = await fetch('/api/preview-ping', {
      method: 'GET',
      headers: {
        'x-preview-host': host,
      },
      // Don't follow redirects — a redirect means the app IS up
      redirect: 'manual',
    });
    // 502/503/504 = ingress/proxy error = container not yet ready
    // 200, 301, 302, 404 = something responded = container is up
    return res.status !== 502 && res.status !== 503 && res.status !== 504 && res.status !== 0;
  } catch {
    return false;
  }
};
