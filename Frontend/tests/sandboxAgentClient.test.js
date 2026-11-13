// callSandboxTool: the editor's MCP client for the sandbox sidecar.
// apiClient.post is replaced, so no network. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { port: '5173' } };
const { apiClient } = await import('../src/services/apiClient.js');
const { callSandboxTool } = await import('../src/services/sandboxAgentClient.js');

let sent;
const reply = (result) => {
  apiClient.post = async (url, body, config) => {
    sent = { url, body, config };
    return { data: { jsonrpc: '2.0', id: body.id, ...result } };
  };
};
const toolResult = (data, isError = false) => ({ result: { content: [{ type: 'text', text: JSON.stringify(data) }], isError } });

test('sends a JSON-RPC tools/call to the sandbox /mcp and returns the tool JSON', async () => {
  reply(toolResult({ status: 'ok', files: [{ file: 'src/App.jsx', content: 'x' }] }));
  const data = await callSandboxTool('sbx-1', 'read_file', { files: ['src/App.jsx'] });

  assert.deepEqual(data.files[0], { file: 'src/App.jsx', content: 'x' });
  assert.equal(sent.url, '/mcp');
  assert.equal(sent.config.baseURL, '/api/agent-proxy');
  assert.equal(sent.config.headers['x-sandbox-id'], 'sbx-1');
  assert.match(sent.config.headers.Accept, /text\/event-stream/);
  assert.deepEqual(sent.body.params, { name: 'read_file', arguments: { files: ['src/App.jsx'] } });
});

test('a tool-level result is data, a request-level error throws like axios', async () => {
  reply(toolResult({ success: false, error: 'oldStr not found in file' }, true));
  assert.equal((await callSandboxTool('sbx-1', 'patch_file', {})).success, false);

  reply(toolResult({ status: 'error', message: 'Missing parameter' }, true));
  await assert.rejects(callSandboxTool('sbx-1', 'read_file', {}), (err) => err.response.data.message === 'Missing parameter');

  reply({ error: { code: -32602, message: 'Tool delete_file not found' } });
  await assert.rejects(callSandboxTool('sbx-1', 'delete_file', {}), /not found/);
});
