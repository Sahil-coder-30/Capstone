import { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { authenticatedFetch, parseFaultKitResponse } from '../../../services/apiClient';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import {
  addMessage,
  updateLastMessage,
  updateMessageId,
  setStreaming,
  setError,
  setMessages,
  clearHistory,
  setPlanReview,
} from '../slice/codingAgent.slice';

const createActivityEntry = ({ kind, title, detail, status = 'running' }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  kind,
  title,
  detail,
  status,
  timestamp: new Date().toISOString(),
});

const createInitialStreamState = () => ({
  phase: 'queued',
  title: 'Preparing Orion',
  detail: 'Opening realtime stream',
  status: 'running',
  events: [
    createActivityEntry({
      kind: 'queued',
      title: 'Preparing Orion',
      detail: 'Opening realtime stream',
    }),
  ],
  updatedAt: new Date().toISOString(),
});

const createRecoveredStreamState = (run) => {
  const status = run?.status || {};
  return {
    phase: status.phase || 'working',
    title: status.title || 'Run in progress',
    detail: status.detail || 'Reconnected to an active Orion task',
    status: status.status || 'running',
    events: [
      createActivityEntry({
        kind: 'reconnected',
        title: 'Reconnected',
        detail: 'Recovered active Orion task after page reload',
      }),
      ...(status.title ? [createActivityEntry({
        kind: status.phase || 'status',
        title: status.title,
        detail: status.detail || 'Orion is processing the task',
        status: status.status || 'running',
      })] : []),
    ].slice(-6),
    updatedAt: run?.updatedAt || new Date().toISOString(),
  };
};

const stringifyPreview = (value, maxLength = 150) => {
  if (!value) return '';
  let preview;
  try {
    preview = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    preview = String(value);
  }
  return preview.length > maxLength ? `${preview.substring(0, maxLength)}...` : preview;
};

const summarizeToolInput = (toolName, input) => {
  const preview = stringifyPreview(input, 110);
  if (!preview) return 'Tool started';
  if (toolName === 'readFile' || toolName === 'read_file') return `Reading ${preview}`;
  if (toolName === 'createFile' || toolName === 'create_file') return `Creating ${preview}`;
  if (toolName === 'updateFile' || toolName === 'update_file') return `Updating ${preview}`;
  if (toolName === 'patchFile' || toolName === 'patch_file') return `Patching ${preview}`;
  if (toolName === 'executeCommand' || toolName === 'execute_command') return `Running ${preview}`;
  return preview;
};

const summarizeToolOutput = (toolName, output) => {
  const preview = stringifyPreview(output, 130);
  if (!preview) return `${toolName} finished`;
  return preview;
};

/**
 * useCodingAgent — hook for the left-panel Coding Agent.
 * Uses Socket.io to stream through the pipeline agent at /api/ai/socket.io.
 * Completely isolated from the Co-pilot / App Agent feature.
 */
export const useCodingAgent = (projectId) => {
  const dispatch = useDispatch();
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const { messages, isStreaming, error, planReview } = useSelector((state) => state.codingAgent);
  const { sandboxId } = useSelector((state) => state.sandbox);
  const { fetchFilesList } = useEditor();
  const activeSocketRef = useRef(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback((text, attachments, onComplete) => {
    if (!text.trim() || !sandboxId || !projectId) return;

    let actualAttachments = attachments;
    let actualOnComplete = onComplete;
    if (typeof attachments === 'function') {
      actualOnComplete = attachments;
      actualAttachments = [];
    }

    // 1. Add user message
    dispatch(addMessage({ role: 'user', text }));

    let streamState = createInitialStreamState();

    // 2. Add placeholder assistant message
    dispatch(addMessage({
      role: 'assistant',
      text: '',
      toolLogs: [],
      status: 'running',
      streamState,
    }));

    dispatch(setStreaming(true));
    dispatch(setError(null));

    let assistantText = '';
    let toolLogs = [];
    let hasReportToken = false;

    const publishAssistant = (overrides = {}) => {
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'running',
        streamState,
        ...overrides,
      }));
    };

    const pushActivity = (entry, messageStatus = 'running', extra = {}) => {
      const activity = createActivityEntry(entry);
      streamState = {
        phase: activity.kind,
        title: activity.title,
        detail: activity.detail,
        status: activity.status,
        events: [...(streamState?.events || []), activity].slice(-6),
        updatedAt: activity.timestamp,
      };
      publishAssistant({ status: messageStatus, ...extra });
    };

    // 3. Connect to AI Orchestration service via SSE
    (async () => {
      try {
        pushActivity({
          kind: 'connected',
          title: 'Connected',
          detail: 'Dispatching task to Orion',
        });

        const response = await authenticatedFetch('/api/ai/code-agent/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            projectId,
            sandboxId,
            attachments: actualAttachments,
          }),
        });

        if (!response.ok) {
          throw await parseFaultKitResponse(response);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop(); // Keep incomplete block in buffer

          for (const block of blocks) {
            if (!block.trim() || block.startsWith(':')) continue;

            const eventMatch = block.match(/^event:\s*(.+)$/m);
            const dataMatch = block.match(/^data:\s*([\s\S]+)$/m);

            const event = eventMatch ? eventMatch[1].trim() : 'message';
            const rawData = dataMatch ? dataMatch[1].trim() : '';
            let payload = {};
            if (rawData) {
              try { payload = JSON.parse(rawData); } catch (_) { payload = rawData; }
            }

            if (event === 'agent:msg_created') {
              if (payload.role && payload.id) {
                dispatch(updateMessageId({ role: payload.role, realId: payload.id }));
              }
            } else if (event === 'agent:thinking') {
              if (!hasReportToken) {
                hasReportToken = true;
                pushActivity({
                  kind: 'report',
                  title: 'Streaming report',
                  detail: 'Writing the final agent report',
                });
              }
              assistantText += (typeof payload === 'string' ? payload : rawData);
              publishAssistant();
            } else if (event === 'agent:model') {
              const modelLabel = payload.label || payload.modelId || 'GPT-6 Luna (OpenRouter)';
              const providerText = payload.provider ? ` (${payload.provider})` : '';
              toolLogs = [...toolLogs, `model: using ${modelLabel}${providerText}`].filter(Boolean);
              pushActivity({
                kind: 'model',
                title: 'Model selected',
                detail: `${modelLabel}${providerText}`,
              });
            } else if (event === 'agent:plan_review') {
              dispatch(setPlanReview(payload));
              dispatch(setStreaming(false));
              pushActivity({
                kind: 'plan_review',
                title: 'Plan review required',
                detail: `${payload?.plan?.totalSteps || 0} steps proposed`,
                status: 'paused',
              });
            } else if (event === 'agent:status') {
              pushActivity({
                kind: payload.phase || 'status',
                title: payload.title || 'Working',
                detail: payload.detail || 'Orion is processing the task',
                status: payload.status || 'running',
              });
            } else if (event === 'agent:tool_start') {
              const { toolName, input } = payload;
              let inputStr = stringifyPreview(input);
              if (inputStr.length > 150) inputStr = inputStr.substring(0, 150) + '...';
              toolLogs = [...toolLogs, `${toolName}: starting with input (${inputStr})`].filter(Boolean);
              pushActivity({
                kind: 'tool',
                title: toolName || 'Tool started',
                detail: summarizeToolInput(toolName, input),
              });
            } else if (event === 'agent:tool_log') {
              const { toolName, message, level = 'info' } = payload;
              const logLine = message || `${toolName || 'tool'}: ${level}`;
              toolLogs = [...toolLogs, logLine].filter(Boolean);
              pushActivity({
                kind: 'tool',
                title: toolName || 'Tool activity',
                detail: stringifyPreview(logLine, 140),
                status: level === 'error' ? 'error' : level === 'success' ? 'success' : 'running',
              });
            } else if (event === 'agent:tool_end') {
              const { toolName, output } = payload;
              let outputStr = stringifyPreview(output);
              toolLogs = [...toolLogs, `${toolName}: finished (${outputStr})`].filter(Boolean);
              pushActivity({
                kind: 'tool',
                title: `${toolName || 'Tool'} complete`,
                detail: summarizeToolOutput(toolName, output),
                status: 'success',
              });
            } else if (event === 'agent:done') {
              dispatch(setPlanReview(null));
              pushActivity({
                kind: 'done',
                title: 'Run complete',
                detail: 'Workspace sync requested',
                status: 'success',
              }, 'completed');
              dispatch(setStreaming(false));
              fetchFilesList(sandboxId, { forceNetwork: true });
              actualOnComplete?.();
            } else if (event === 'agent:stopped') {
              if (payload.text) assistantText = payload.text;
              pushActivity({
                kind: 'stopped',
                title: 'Stopped',
                detail: payload.message || 'Orion stopped the current task',
                status: 'success',
              }, 'completed');
              dispatch(setStreaming(false));
              if (sandboxId) fetchFilesList(sandboxId, { forceNetwork: true });
              actualOnComplete?.();
            } else if (event === 'agent:error') {
              const errMsg = payload.message || 'Error running agent';
              pushActivity({
                kind: 'error',
                title: 'Agent error',
                detail: payload.code ? `${errMsg} (${payload.code})` : errMsg,
                status: 'error',
              }, 'error', { error: errMsg });
              dispatch(setError(errMsg));
              dispatch(setStreaming(false));
            }
          }
        }
      } catch (err) {
        console.error('[CodingAgent] SSE connection error:', err);
        const errMsg = err.message || 'Failed to connect to the AI Orchestration service';
        pushActivity({
          kind: 'error',
          title: 'Connection failed',
          detail: errMsg,
          status: 'error',
        }, 'error', { error: errMsg });
        dispatch(setError(errMsg));
        dispatch(setStreaming(false));
      }
    })();
  }, [projectId, sandboxId, dispatch, fetchFilesList]);

  useEffect(() => {
    if (!projectId || !sandboxId || isHistoryLoading) return undefined;
    if (activeSocketRef.current?.connected) return undefined;

    const socket = io(window.location.origin, {
      path: '/api/ai/socket.io',
      transports: ['polling'],
      upgrade: false,
      withCredentials: true,
      timeout: 15000,
      reconnection: true,
      reconnectionAttempts: 4,
      reconnectionDelay: 1500,
    });

    activeSocketRef.current = socket;

    let assistantText = '';
    let toolLogs = [];
    let streamState = null;
    let recoveredActiveRun = false;
    let hasReportToken = false;

    const publishRecoveredAssistant = (overrides = {}) => {
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'running',
        streamState,
        ...overrides,
      }));
    };

    const pushRecoveredActivity = (entry, messageStatus = 'running', extra = {}) => {
      if (!recoveredActiveRun) return;
      const activity = createActivityEntry(entry);
      streamState = {
        phase: activity.kind,
        title: activity.title,
        detail: activity.detail,
        status: activity.status,
        events: [...(streamState?.events || []), activity].slice(-6),
        updatedAt: activity.timestamp,
      };
      publishRecoveredAssistant({ status: messageStatus, ...extra });
    };

    socket.on('connect', () => {
      socket.emit('agent:subscribe', { projectId, sandboxId });
    });

    socket.on('agent:active_run', ({ active, run } = {}) => {
      if (!active || !run) {
        if (activeSocketRef.current === socket) activeSocketRef.current = null;
        socket.disconnect();
        return;
      }

      recoveredActiveRun = true;
      assistantText = run.assistantText || '';
      toolLogs = run.toolLogs || [];
      streamState = createRecoveredStreamState(run);

      const currentMessages = messagesRef.current || [];
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (lastMessage?.role === 'assistant' && lastMessage?.status === 'running') {
        publishRecoveredAssistant();
      } else {
        dispatch(addMessage({
          role: 'assistant',
          text: assistantText,
          toolLogs,
          status: 'running',
          streamState,
        }));
      }
      dispatch(setStreaming(true));
      dispatch(setError(null));
    });

    socket.on('agent:thinking', (token) => {
      if (!recoveredActiveRun) return;
      if (!hasReportToken) {
        hasReportToken = true;
        pushRecoveredActivity({
          kind: 'report',
          title: 'Streaming report',
          detail: 'Writing the final agent report',
        });
      }
      assistantText += token;
      publishRecoveredAssistant();
    });

    socket.on('agent:model', (modelInfo = {}) => {
      if (!recoveredActiveRun) return;
      const modelLabel = modelInfo.label || modelInfo.modelId || 'selected model';
      const providerText = modelInfo.provider ? ` (${modelInfo.provider})` : '';
      const fallbackText = modelInfo.fallback && modelInfo.fallbackFrom
        ? ` after ${modelInfo.fallbackFrom}`
        : '';
      toolLogs = [...toolLogs, `model: using ${modelLabel}${providerText}${fallbackText}`].filter(Boolean);
      pushRecoveredActivity({
        kind: 'model',
        title: 'Model selected',
        detail: `${modelLabel}${providerText}${fallbackText}`,
      });
    });

    socket.on('agent:status', (statusInfo = {}) => {
      pushRecoveredActivity({
        kind: statusInfo.phase || 'status',
        title: statusInfo.title || 'Working',
        detail: statusInfo.detail || 'Orion is processing the task',
        status: statusInfo.status || 'running',
      });
    });

    socket.on('agent:tool_start', ({ toolName, input }) => {
      if (!recoveredActiveRun) return;
      const inputStr = stringifyPreview(input);
      toolLogs = [...toolLogs, `${toolName}: starting with input (${inputStr})`].filter(Boolean);
      pushRecoveredActivity({
        kind: 'tool',
        title: toolName || 'Tool started',
        detail: summarizeToolInput(toolName, input),
      });
    });

    socket.on('agent:tool_log', ({ toolName, message, level = 'info' } = {}) => {
      if (!recoveredActiveRun) return;
      const logLine = message || `${toolName || 'tool'}: ${level}`;
      toolLogs = [...toolLogs, logLine].filter(Boolean);
      pushRecoveredActivity({
        kind: 'tool',
        title: toolName || 'Tool activity',
        detail: stringifyPreview(logLine, 140),
        status: level === 'error' ? 'error' : level === 'success' ? 'success' : 'running',
      });
    });

    socket.on('agent:tool_end', ({ toolName, output }) => {
      if (!recoveredActiveRun) return;
      const outputStr = stringifyPreview(output);
      toolLogs = [...toolLogs, `${toolName}: finished (${outputStr})`].filter(Boolean);
      pushRecoveredActivity({
        kind: 'tool',
        title: `${toolName || 'Tool'} complete`,
        detail: summarizeToolOutput(toolName, output),
        status: 'success',
      });
    });

    socket.on('agent:done', () => {
      if (!recoveredActiveRun) return;
      pushRecoveredActivity({
        kind: 'done',
        title: 'Run complete',
        detail: 'Workspace sync requested',
        status: 'success',
      }, 'completed');
      dispatch(setStreaming(false));
      if (activeSocketRef.current === socket) activeSocketRef.current = null;
      socket.disconnect();
      fetchFilesList(sandboxId, { forceNetwork: true });
    });

    socket.on('agent:stopped', ({ message, text: stoppedText } = {}) => {
      if (!recoveredActiveRun) return;
      if (stoppedText) assistantText = stoppedText;
      pushRecoveredActivity({
        kind: 'stopped',
        title: 'Stopped',
        detail: message || 'Orion stopped the current task',
        status: 'success',
      }, 'completed');
      dispatch(setStreaming(false));
      if (activeSocketRef.current === socket) activeSocketRef.current = null;
      socket.disconnect();
      fetchFilesList(sandboxId, { forceNetwork: true });
    });

    socket.on('agent:error', ({ message, code }) => {
      if (!recoveredActiveRun) return;
      const errMsg = message || 'Error running agent';
      pushRecoveredActivity({
        kind: 'error',
        title: 'Agent error',
        detail: code ? `${errMsg} (${code})` : errMsg,
        status: 'error',
      }, 'error', { error: errMsg });
      dispatch(setError(errMsg));
      dispatch(setStreaming(false));
      if (activeSocketRef.current === socket) activeSocketRef.current = null;
      socket.disconnect();
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      if (recoveredActiveRun) {
        dispatch(setStreaming(false));
      }
      if (activeSocketRef.current === socket) activeSocketRef.current = null;
    });

    return () => {
      if (activeSocketRef.current === socket) activeSocketRef.current = null;
      socket.disconnect();
    };
  }, [projectId, sandboxId, isHistoryLoading, dispatch, fetchFilesList]);

  const stopAgent = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await authenticatedFetch('/api/ai/code-agent/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sandboxId }),
      });
      if (!response.ok) {
        throw await parseFaultKitResponse(response);
      }
    } catch (err) {
      console.error('[CodingAgent] Failed to send stop request:', err);
    }
  }, [projectId, sandboxId]);

  // Auto-load chat history from MongoDB when projectId changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!projectId) {
        // Reset to initial welcome message if no project is active
        dispatch(clearHistory());
        setIsHistoryLoading(false);
        return;
      }
      setIsHistoryLoading(true);
      try {
        const response = await authenticatedFetch(`/api/ai/chats/${projectId}/codingAgent`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok') {
            if (data.messages && data.messages.length > 0) {
              const mapped = data.messages.map(m => ({
                id: m._id || m.id || Math.random().toString(36).substring(7),
                _id: m._id,
                role: m.role,
                text: m.content,
                toolLogs: m.toolLogs || [],
                status: 'completed',
                timestamp: m.timestamp
              }));
              dispatch(setMessages(mapped));
            } else {
              dispatch(clearHistory());
            }
          }
        }
      } catch (err) {
        console.error('Failed to load codingAgent chat history:', err);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    loadChatHistory();
  }, [projectId, dispatch]);

  const clearChatHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      await authenticatedFetch(`/api/ai/chats/${projectId}/codingAgent`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear codingAgent chat history from DB:', err);
    }
    dispatch(clearHistory());
  }, [projectId, dispatch]);

  const deleteMessages = useCallback(async (messageIds) => {
    if (!messageIds) return;
    const idsArray = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean);
    if (idsArray.length === 0) return;

    const idsSet = new Set(idsArray.map(id => String(id)));

    try {
      await authenticatedFetch('/api/ai/chats/message/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsArray, agentType: 'codingAgent' }),
      });
    } catch (err) {
      console.error('Failed to soft delete chat messages:', err);
    }

    const updated = messagesRef.current.filter(m => !idsSet.has(String(m._id)) && !idsSet.has(String(m.id)));
    dispatch(setMessages(updated));
  }, [dispatch]);

  const deleteMessage = useCallback(async (messageId) => {
    return deleteMessages([messageId]);
  }, [deleteMessages]);

  const approvePlan = useCallback(async () => {
    if (!sandboxId || !projectId) return;
    dispatch(setPlanReview(null));
    dispatch(setStreaming(true));
    if (activeSocketRef.current?.connected) {
      activeSocketRef.current.emit('agent:plan_approve', { projectId, sandboxId });
    }
    try {
      await authenticatedFetch('/api/ai/code-agent/plan-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sandboxId }),
      });
    } catch (err) {
      console.error('[CodingAgent] Failed to approve plan:', err);
    }
  }, [projectId, sandboxId, dispatch]);

  const rejectPlan = useCallback(async (feedback = '') => {
    if (!sandboxId || !projectId) return;
    dispatch(setPlanReview(null));
    dispatch(setStreaming(true));
    if (activeSocketRef.current?.connected) {
      activeSocketRef.current.emit('agent:plan_reject', { projectId, sandboxId, feedback });
    }
    try {
      await authenticatedFetch('/api/ai/code-agent/plan-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sandboxId, feedback }),
      });
    } catch (err) {
      console.error('[CodingAgent] Failed to reject plan:', err);
    }
  }, [projectId, sandboxId, dispatch]);

  return {
    messages,
    isStreaming,
    isHistoryLoading,
    error,
    planReview,
    sendMessage,
    stopAgent,
    approvePlan,
    rejectPlan,
    clearChatHistory,
    deleteMessage,
    deleteMessages,
  };
};
