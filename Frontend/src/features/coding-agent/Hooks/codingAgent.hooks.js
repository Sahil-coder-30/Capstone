import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import {
  addMessage,
  updateLastMessage,
  setStreaming,
  setError,
  setMessages,
  clearHistory,
} from '../slice/codingAgent.slice';

/**
 * useCodingAgent — hook for the left-panel Coding Agent.
 * Uses Socket.io to stream through the pipeline agent at /api/ai/socket.io.
 * Completely isolated from the Co-pilot / App Agent feature.
 */
export const useCodingAgent = (projectId) => {
  const dispatch = useDispatch();
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const { messages, isStreaming, error } = useSelector((state) => state.codingAgent);
  const { sandboxId } = useSelector((state) => state.sandbox);
  const { syncAllFilesToCache } = useEditor();

  const sendMessage = useCallback((text, onComplete) => {
    if (!text.trim() || !sandboxId || !projectId) return;

    // 1. Add user message
    dispatch(addMessage({ role: 'user', text }));

    // 2. Add placeholder assistant message
    dispatch(addMessage({
      role: 'assistant',
      text: '',
      toolLogs: [],
      status: 'running',
    }));

    dispatch(setStreaming(true));
    dispatch(setError(null));

    let assistantText = '';
    let toolLogs = [];

    // 3. Connect to Socket.io orchestration service
    const socketUrl = `${window.location.protocol}//${window.location.hostname}`;
    const socket = io(socketUrl, {
      path: '/api/ai/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('[CodingAgent] Socket.io connected to AI orchestrator');
      socket.emit('agent:invoke', { message: text, projectId, sandboxId });
    });

    // 4. Stream LLM tokens
    socket.on('agent:thinking', (token) => {
      assistantText += token;
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'running' }));
    });

    // 5. Tool start
    socket.on('agent:tool_start', ({ toolName, input }) => {
      let inputStr = '';
      if (input) {
        try {
          inputStr = typeof input === 'string' ? input : JSON.stringify(input);
        } catch (_) {
          inputStr = String(input);
        }
      }
      if (inputStr.length > 150) inputStr = inputStr.substring(0, 150) + '...';
      toolLogs = [...toolLogs, `${toolName}: starting with input (${inputStr})`].filter(Boolean);
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'running' }));
    });

    // 6. Tool end
    socket.on('agent:tool_end', ({ toolName, output }) => {
      let outputStr = '';
      if (output) {
        try {
          const parsed = typeof output === 'string' ? JSON.parse(output) : output;
          if (parsed && typeof parsed === 'object') {
            outputStr = parsed.error || parsed.output || JSON.stringify(parsed);
          } else {
            outputStr = String(output);
          }
        } catch (_) {
          outputStr = String(output);
        }
      }
      if (outputStr.length > 150) outputStr = outputStr.substring(0, 150) + '...';
      toolLogs = [...toolLogs, `${toolName}: finished (${outputStr})`].filter(Boolean);
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'running' }));

      // Sync files if the tool was a file write/modify or execution tool
      if (['create_file', 'update_file', 'patch_file', 'delete_file', 'execute_command'].includes(toolName)) {
        syncAllFilesToCache(sandboxId);
      }
    });

    // 7. Stream done
    socket.on('agent:done', () => {
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'completed' }));
      dispatch(setStreaming(false));
      socket.disconnect();
      syncAllFilesToCache(sandboxId);
      onComplete?.();
    });

    // 8. Stream error
    socket.on('agent:error', ({ message }) => {
      const errMsg = message || 'Error running agent';
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'error', error: errMsg }));
      dispatch(setError(errMsg));
      dispatch(setStreaming(false));
      socket.disconnect();
    });

    // 9. Connection error
    socket.on('connect_error', (err) => {
      console.error('[CodingAgent] Socket.io connection error:', err);
      const errMsg = 'Failed to connect to the AI Orchestration service';
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'error', error: errMsg }));
      dispatch(setError(errMsg));
      dispatch(setStreaming(false));
      socket.disconnect();
    });
  }, [projectId, sandboxId, dispatch, syncAllFilesToCache]);

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
        const response = await fetch(`/api/ai/chats/${projectId}/codingAgent`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok') {
            if (data.messages && data.messages.length > 0) {
              const mapped = data.messages.map(m => ({
                id: m._id || Math.random().toString(36).substring(7),
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
      await fetch(`/api/ai/chats/${projectId}/codingAgent`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear codingAgent chat history from DB:', err);
    }
    dispatch(clearHistory());
  }, [projectId, dispatch]);

  return {
    messages,
    isStreaming,
    isHistoryLoading,
    error,
    sendMessage,
    clearChatHistory,
  };
};
