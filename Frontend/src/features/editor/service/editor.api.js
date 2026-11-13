import { callSandboxTool } from '../../../services/sandboxAgentClient';

// File operations go through the sandbox's MCP tools (no REST file API).

export const listFilesAPI = (sandboxId) => callSandboxTool(sandboxId, 'list_files');

export const readFileAPI = (sandboxId, file) => callSandboxTool(sandboxId, 'read_file', { files: [file] });

export const updateFileAPI = (sandboxId, file, content) =>
  callSandboxTool(sandboxId, 'update_file', { updates: [{ file, content }] });

export const createFileAPI = (sandboxId, file, content = '') =>
  callSandboxTool(sandboxId, 'create_file', { files: [{ file, content }] });

export const deleteFileAPI = (sandboxId, file) => callSandboxTool(sandboxId, 'delete_file', { files: [file] });
