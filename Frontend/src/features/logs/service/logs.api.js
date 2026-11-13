import { callSandboxTool } from '../../../services/sandboxAgentClient';

// Dev server log tail, through the sandbox's MCP tool.
export const fetchViteLogsAPI = (sandboxId) => callSandboxTool(sandboxId, 'get_vite_runtime_errors');
