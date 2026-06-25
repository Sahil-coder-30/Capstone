import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { addMessage, updateLastMessage, setStreaming, setError, clearHistory } from '../slice/chat.slice';

export const useChat = () => {
  const dispatch = useDispatch();
  const { messages, isStreaming, error } = useSelector((state) => state.chat);
  const { sandboxId } = useSelector((state) => state.sandbox);

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

  const clearChatHistory = () => {
    dispatch(clearHistory());
  };

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearChatHistory,
  };
};
// Trigger reload comment to reconnect socket direct connection
