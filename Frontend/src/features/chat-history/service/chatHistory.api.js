import { authenticatedFetch, parseFaultKitResponse } from '../../../services/apiClient';

// Chat sessions of one agent. `agentType` is 'codingAgent' (Orion) or 'copilot' (Clio).

const call = async (path, options = {}) => {
  const response = await authenticatedFetch(`/api/ai/chats${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw await parseFaultKitResponse(response);
  return response.json();
};

export const listSessionsAPI = (agentType, projectId, before) => {
  const query = new URLSearchParams({ projectId });
  if (before) query.set('before', before);
  return call(`/${agentType}/sessions?${query}`);
};

export const getSessionMessagesAPI = (agentType, sessionId) =>
  call(`/${agentType}/sessions/${sessionId}/messages`);

export const renameSessionAPI = (agentType, sessionId, title) =>
  call(`/${agentType}/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ title }) });

export const trashSessionAPI = (agentType, sessionId) =>
  call(`/${agentType}/sessions/${sessionId}`, { method: 'DELETE' });

export const trashMessagesAPI = (agentType, ids) =>
  call('/message/batch-delete', { method: 'POST', body: JSON.stringify({ ids, agentType }) });

/** Server message -> the shape both chat UIs render. Error replies show as an error, not as text. */
export const toChatMessage = (m) => ({
  id: m.id,
  _id: m.id,
  role: m.role,
  text: m.status === 'error' ? '' : m.content,
  error: m.status === 'error' ? m.content : undefined,
  toolLogs: m.toolLogs || [],
  steps: m.steps || [],
  outcome: m.outcome || null,
  file: m.file || '',
  status: m.status === 'error' ? 'error' : 'completed',
  timestamp: m.timestamp,
});
