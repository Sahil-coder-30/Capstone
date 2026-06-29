import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { 
  addMessage, 
  updateLastMessage, 
  setStreaming, 
  setError, 
  clearHistory,
  setAppAgentOpen,
  toggleAppAgentOpen,
  addAppAgentMessage,
  updateLastAppAgentMessage,
  setAppAgentStreaming,
  clearAppAgentHistory
} from '../slice/chat.slice';

export const useChat = () => {
  const dispatch = useDispatch();
  const { messages, isStreaming, error, isAppAgentOpen, appAgentMessages, isAppAgentStreaming } = useSelector((state) => state.chat);
  const { sandboxId, status: sandboxStatus } = useSelector((state) => state.sandbox);
  const { tabContents } = useSelector((state) => state.editor);

  const sendMessage = (text, onComplete) => {
    if (!text.trim() || !sandboxId) return;

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
    let streamError = null;

    // 3. Connect to the WebSocket orchestration service via Socket.io
    const socketUrl = `${window.location.protocol}//${window.location.hostname}`;
    const socket = io(socketUrl, {
      path: '/api/ai/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Socket.io connected to AI orchestrator');
      // Emit trigger event
      socket.emit('agent:invoke', { message: text, projectId: sandboxId });
    });

    // 4. Stream LLM thinking/tokens
    socket.on('agent:thinking', (token) => {
      assistantText += token;
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'running',
      }));
    });

    // 5. Stream Tool execution starts
    socket.on('agent:tool_start', ({ toolName, input }) => {
      let inputStr = '';
      if (input) {
        try {
          inputStr = typeof input === 'string' ? input : JSON.stringify(input);
        } catch (_) {
          inputStr = String(input);
        }
      }
      if (inputStr.length > 150) {
        inputStr = inputStr.substring(0, 150) + '...';
      }
      toolLogs = [...toolLogs, `${toolName}: starting with input (${inputStr})`].filter(Boolean);
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'running',
      }));
    });

    // 6. Stream Tool execution outputs/finishes
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
      if (outputStr.length > 150) {
        outputStr = outputStr.substring(0, 150) + '...';
      }
      toolLogs = [...toolLogs, `${toolName}: finished (${outputStr})`].filter(Boolean);
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'running',
      }));
    });

    // 7. Stream finished successfully
    socket.on('agent:done', () => {
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'completed',
      }));
      dispatch(setStreaming(false));
      socket.disconnect();
      onComplete?.();
    });

    // 8. Stream failed with error
    socket.on('agent:error', ({ message }) => {
      streamError = message || 'Error running agent';
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'error',
        error: streamError,
      }));
      dispatch(setError(streamError));
      dispatch(setStreaming(false));
      socket.disconnect();
    });

    // 9. Connection errors
    socket.on('connect_error', (err) => {
      console.error('Socket.io connection error:', err);
      streamError = 'Failed to connect to the AI Orchestration service';
      dispatch(updateLastMessage({
        text: assistantText,
        toolLogs,
        status: 'error',
        error: streamError,
      }));
      dispatch(setError(streamError));
      dispatch(setStreaming(false));
      socket.disconnect();
    });
  };

  const sendAppAgentMessage = async (text, activeFile, onComplete) => {
    if (!text.trim()) return;

    // 1. Add user message
    dispatch(addAppAgentMessage({ role: 'user', text }));

    // 2. Add placeholder assistant message
    dispatch(addAppAgentMessage({
      role: 'assistant',
      text: '',
      toolLogs: [],
      status: 'running',
    }));

    dispatch(setAppAgentStreaming(true));
    dispatch(setError(null));

    let assistantText = '';
    let toolLogs = [];

    try {
      const response = await fetch('/api/ai/app-agent/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: text,
          sessionId: sandboxId,
          workspacePath: `/workspace/${sandboxId || "default"}`,
          agentStatus: sandboxStatus || 'idle',
          activeFile: activeFile || '',
          activeFileContent: activeFile ? (tabContents[activeFile] ?? '') : '',
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep unfinished line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          // SSE format: event: <event>\ndata: <data>
          const dataMatch = line.match(/^data:\s*(.+)$/m);
          const eventMatch = line.match(/^event:\s*(.+)$/m);

          const event = eventMatch ? eventMatch[1].trim() : 'message';
          const dataStr = dataMatch ? dataMatch[1].trim() : '';

          if (event === 'error') {
            const errObj = JSON.parse(dataStr);
            throw new Error(errObj.message || 'Error running Clio assistant');
          } else if (event === 'done') {
            // End of stream signal
          } else if (event === 'final') {
            assistantText = dataStr;
            dispatch(updateLastAppAgentMessage({
              text: assistantText,
              toolLogs,
              status: 'completed',
            }));
          } else {
            // Default event: check if it is tool log
            if (dataStr) {
              if (dataStr.startsWith('readFile:') || dataStr.startsWith('updateFile:') || dataStr.startsWith('read_file:') || dataStr.startsWith('update_file:')) {
                toolLogs = [...toolLogs, dataStr].filter(Boolean);
                dispatch(updateLastAppAgentMessage({
                  text: assistantText,
                  toolLogs,
                  status: 'running',
                }));
              } else {
                // Regular token stream
                assistantText += dataStr;
                dispatch(updateLastAppAgentMessage({
                  text: assistantText,
                  toolLogs,
                  status: 'running',
                }));
              }
            }
          }
        }
      }

      dispatch(updateLastAppAgentMessage({
        text: assistantText,
        toolLogs,
        status: 'completed',
      }));
      dispatch(setAppAgentStreaming(false));
      onComplete?.();
    } catch (err) {
      console.error('Clio invoke failed:', err);
      const errMsg = err.message || 'Failed to get response from Clio';
      dispatch(updateLastAppAgentMessage({
        text: assistantText,
        toolLogs,
        status: 'error',
        error: errMsg,
      }));
      dispatch(setError(errMsg));
      dispatch(setAppAgentStreaming(false));
    }
  };

  const clearChatHistory = () => {
    dispatch(clearHistory());
  };

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    sendAppAgentMessage,
    clearChatHistory,
    // App Agent Specific Exports
    isAppAgentOpen,
    appAgentMessages,
    isAppAgentStreaming,
    clearAppAgentHistory: () => dispatch(clearAppAgentHistory()),
    toggleAppAgent: () => dispatch(toggleAppAgentOpen()),
    setAppAgentOpen: (isOpen) => dispatch(setAppAgentOpen(isOpen)),
  };
};
// Trigger reload comment to reconnect socket direct connection
