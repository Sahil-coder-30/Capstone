import { apiClient } from './apiClient.js';

/**
 * Calls one coding tool on a sandbox's MCP server (POST /mcp on the sidecar).
 * The sidecar has no REST file API: the editor, file tree and logs panel use
 * the same certified tools as the agents.
 *
 * Goes through apiClient, so every call carries the access token and a 401
 * refreshes it and retries once. Returns the tool's JSON result (same shape
 * the old REST endpoints returned). A request-level failure throws, with the
 * tool's error body on err.response.data, like an axios error.
 */
export const callSandboxTool = async (sandboxId, name, args = {}) => {
  const isDev = window.location.port === '5173';
  const response = await apiClient.post(
    '/mcp',
    { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } },
    {
      baseURL: isDev ? '/api/agent-proxy' : `http://${sandboxId}.agent.localhost`,
      headers: {
        ...(isDev && { 'x-sandbox-id': sandboxId }),
        Accept: 'application/json, text/event-stream',
      },
      timeout: 30000,
    },
  );

  const { result, error } = response.data || {};
  if (error) throw Object.assign(new Error(error.message || 'Sandbox tool call failed'), { response: { data: error } });

  const text = result?.content?.find((c) => c.type === 'text')?.text ?? '';
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  // Same rule as the AI service: request errors throw, tool results (e.g. one
  // missing file in a batch) come back as data.
  if (result?.isError && (data?.status === 'error' || data?.error === true)) {
    throw Object.assign(new Error(data.message || 'Sandbox tool call failed'), { response: { data } });
  }
  return data;
};
