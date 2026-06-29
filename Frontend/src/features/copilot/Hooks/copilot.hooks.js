import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import {
  addMessage,
  updateLastMessage,
  setStreaming,
  setOpen,
  toggleOpen,
  setMessages,
  clearHistory,
} from '../slice/copilot.slice';

/**
 * useCopilot — hook for the floating Clio Co-pilot.
 * Uses fetch SSE to /api/ai/app-agent/invoke.
 * Completely isolated from the Coding Agent feature.
 */
export const useCopilot = (projectId) => {
  const dispatch = useDispatch();
  const { messages, isOpen, isStreaming } = useSelector((state) => state.copilot);
  const { sandboxId, status: sandboxStatus } = useSelector((state) => state.sandbox);
  const { tabContents } = useSelector((state) => state.editor);
  const { syncAllFilesToCache } = useEditor();

  const sendMessage = async (text, activeFile, onComplete) => {
    if (!text.trim()) return;

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

    let assistantText = '';
    let toolLogs = [];

    try {
      const response = await fetch('/api/ai/app-agent/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: text,
          projectId,
          sandboxId,
          workspacePath: `/workspace/${sandboxId || 'default'}`,
          agentStatus: sandboxStatus || 'idle',
          activeFile: activeFile || '',
          activeFileContent: activeFile ? (tabContents[activeFile] ?? '') : '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep incomplete chunk

        for (const block of lines) {
          if (!block.trim()) continue;

          // Parse the SSE block line by line
          // SSE spec: each line starts with "field: value"
          // A single block can have "event:", "data:" (potentially multi-line with repeated "data:" prefixes),
          // or a bare "data:" value may span lines as per the spec.
          const blockLines = block.split('\n');
          let event = 'message';
          const dataLines = [];

          for (const bl of blockLines) {
            if (bl.startsWith('event:')) {
              event = bl.slice('event:'.length).trim();
            } else if (bl.startsWith('data:')) {
              dataLines.push(bl.slice('data:'.length).trimStart());
            } else if (bl.startsWith(': ')) {
              // SSE comment (heartbeat) — skip
            }
          }

          // Join multiple data: lines with newline (SSE spec §9.2.6)
          const dataStr = dataLines.join('\n').trim();

          if (event === 'error') {
            const errObj = JSON.parse(dataStr);
            throw new Error(errObj.message || 'Error from Clio co-pilot');
          } else if (event === 'final') {
            assistantText = dataStr;
            dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'completed' }));
          } else if (event === 'done') {
            // stream ended signal — handled below
          } else if (dataStr) {
            // Tool activity or token stream
            const isToolLog =
              dataStr.startsWith('readFile:') ||
              dataStr.startsWith('updateFile:') ||
              dataStr.startsWith('read_file:') ||
              dataStr.startsWith('update_file:');

            if (isToolLog) {
              toolLogs = [...toolLogs, dataStr].filter(Boolean);
              dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'running' }));
            } else {
              assistantText += dataStr;
              dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'running' }));
            }
          }
        }

      }

      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'completed' }));
      dispatch(setStreaming(false));
      syncAllFilesToCache(sandboxId);
      onComplete?.();
    } catch (err) {
      console.error('[Copilot] invoke failed:', err);
      const errMsg = err.message || 'Failed to get a response from Clio';
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'error', error: errMsg }));
      dispatch(setStreaming(false));
    }
  };

  // Auto-load chat history from MongoDB when projectId changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!projectId) {
        dispatch(clearHistory());
        return;
      }
      try {
        const response = await fetch(`/api/ai/chats/${projectId}/copilot`);
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
        console.error('Failed to load copilot chat history:', err);
      }
    };

    loadChatHistory();
  }, [projectId, dispatch]);

  const clearHistoryAction = async () => {
    if (!projectId) return;
    try {
      await fetch(`/api/ai/chats/${projectId}/copilot`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear copilot chat history from DB:', err);
    }
    dispatch(clearHistory());
  };

  return {
    messages,
    isOpen,
    isStreaming,
    sendMessage,
    toggleCopilot: () => dispatch(toggleOpen()),
    openCopilot: () => dispatch(setOpen(true)),
    closeCopilot: () => dispatch(setOpen(false)),
    clearHistory: clearHistoryAction,
  };
};
