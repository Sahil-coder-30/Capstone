import { useDispatch, useSelector } from 'react-redux';
import { authenticatedFetch } from '../../../services/apiClient';
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

    // 3. Connect to AI Orchestration service via SSE
    (async () => {
      try {
        const response = await authenticatedFetch('/api/ai/code-agent/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, projectId: sandboxId }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP error ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop();

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

            if (event === 'agent:thinking') {
              assistantText += (typeof payload === 'string' ? payload : rawData);
              dispatch(updateLastMessage({
                text: assistantText,
                toolLogs,
                status: 'running',
              }));
            } else if (event === 'agent:tool_start') {
              const { toolName, input } = payload;
              let inputStr = '';
              if (input) {
                try { inputStr = typeof input === 'string' ? input : JSON.stringify(input); } catch (_) { inputStr = String(input); }
              }
              if (inputStr.length > 150) inputStr = inputStr.substring(0, 150) + '...';
              toolLogs = [...toolLogs, `${toolName}: starting with input (${inputStr})`].filter(Boolean);
              dispatch(updateLastMessage({
                text: assistantText,
                toolLogs,
                status: 'running',
              }));
            } else if (event === 'agent:tool_end') {
              const { toolName, output } = payload;
              let outputStr = '';
              if (output) {
                try {
                  const parsed = typeof output === 'string' ? JSON.parse(output) : output;
                  outputStr = parsed && typeof parsed === 'object' ? (parsed.error || parsed.output || JSON.stringify(parsed)) : String(output);
                } catch (_) { outputStr = String(output); }
              }
              if (outputStr.length > 150) outputStr = outputStr.substring(0, 150) + '...';
              toolLogs = [...toolLogs, `${toolName}: finished (${outputStr})`].filter(Boolean);
              dispatch(updateLastMessage({
                text: assistantText,
                toolLogs,
                status: 'running',
              }));
            } else if (event === 'agent:done' || event === 'agent:stopped') {
              dispatch(updateLastMessage({
                text: assistantText,
                toolLogs,
                status: 'completed',
              }));
              dispatch(setStreaming(false));
              onComplete?.();
            } else if (event === 'agent:error') {
              streamError = payload.message || 'Error running agent';
              dispatch(updateLastMessage({
                text: assistantText,
                toolLogs,
                status: 'error',
                error: streamError,
              }));
              dispatch(setError(streamError));
              dispatch(setStreaming(false));
            }
          }
        }
      } catch (err) {
        console.error('SSE connection error:', err);
        streamError = err.message || 'Failed to connect to the AI Orchestration service';
        dispatch(updateLastMessage({
          text: assistantText,
          toolLogs,
          status: 'error',
          error: streamError,
        }));
        dispatch(setError(streamError));
        dispatch(setStreaming(false));
      }
    })();
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
      const response = await authenticatedFetch('/api/ai/app-agent/invoke', {
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

  const clearChatHistory = async () => {
    if (projectId) {
      try {
        await authenticatedFetch(`/api/ai/chats/${projectId}/codingAgent`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete chat history from DB:', err);
      }
    }
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
