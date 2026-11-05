import { getSandboxAgentClient as getAgentClient } from '../../../services/sandboxAgentClient';

export const listFilesAPI = async (sandboxId) => {
  const client = getAgentClient(sandboxId);
  const response = await client.get('/api/agent/list-files');
  return response.data;
};

export const readFileAPI = async (sandboxId, file) => {
  const client = getAgentClient(sandboxId);
  const response = await client.get(`/api/agent/read-file?files=${encodeURIComponent(file)}`);
  return response.data;
};

export const updateFileAPI = async (sandboxId, file, content) => {
  const client = getAgentClient(sandboxId);
  const response = await client.patch('/api/agent/update-file', {
    updates: [{ file, content }]
  });
  return response.data;
};

export const createFileAPI = async (sandboxId, file, content = '') => {
  const client = getAgentClient(sandboxId);
  const response = await client.post('/api/agent/create-file', {
    files: [{ file, content }]
  });
  return response.data;
};

export const deleteFileAPI = async (sandboxId, file) => {
  const client = getAgentClient(sandboxId);
  const response = await client.delete(`/api/agent/delete-file?file=${encodeURIComponent(file)}`);
  return response.data;
};

