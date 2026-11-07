import { getSandboxAgentClient as getAgentClient } from '../../../services/sandboxAgentClient';

export const fetchViteLogsAPI = async (sandboxId) => {
  const client = getAgentClient(sandboxId);
  const response = await client.get('/api/agent/vite-runtime-errors');
  return response.data;
};
