import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import { authenticatedFetch, parseFaultKitResponse } from '../../../services/apiClient';
import { getSessionMessagesAPI, toChatMessage, trashMessagesAPI } from '../../chat-history/service/chatHistory.api';
import {
  addMessage,
  updateLastMessage,
  setStreaming,
  setOpen,
  toggleOpen,
  setMessages,
  showSession,
  setShownSession,
  clearHistory,
} from '../slice/copilot.slice';

const TOOL_LOG_PREFIXES = ['readFile:', 'updateFile:', 'read_file:', 'update_file:'];

/** Splits an SSE block into its event name and data (multi-line data joined with \n). */
const parseSseBlock = (block) => {
  let event = 'message';
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    // SSE spec: drop exactly one space after "data:". Trimming more would eat code indentation.
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
  }
  return { event, data: dataLines.join('\n') };
};

/**
 * useCopilot — hook for the floating Clio co-pilot. Streams /api/ai/app-agent/invoke.
 * Shows one chat session at a time (`sessionId`, null for a new chat).
 * Without a projectId (e.g. the editor's toggle button) it only exposes open/close.
 */
export const useCopilot = (projectId, { sessionId = null, sessionsReady = true, onSession } = {}) => {
  const dispatch = useDispatch();
  const { messages, isOpen, isStreaming, shownSessionId } = useSelector((state) => state.copilot);
  const { sandboxId } = useSelector((state) => state.sandbox);
  const { tabContents } = useSelector((state) => state.editor);
  const { fetchFilesList } = useEditor();
  const isHistoryLoading = Boolean(projectId) && (!sessionsReady || (sessionId !== null && shownSessionId !== sessionId));

  // The open stream of this tab: { abort, target } where target is the chat it writes into.
  const streamRef = useRef(null);
  const latest = useRef({ sessionId, onSession, messages });
  useEffect(() => {
    latest.current = { sessionId, onSession, messages };
  });

  const sendMessage = async (text, activeFile, onComplete) => {
    if (!text.trim() || !projectId) return;

    streamRef.current?.abort.abort();
    const stream = { abort: new AbortController(), target: latest.current.sessionId };
    streamRef.current = stream;

    dispatch(addMessage({ role: 'user', text }));
    dispatch(addMessage({ role: 'assistant', text: '', toolLogs: [], status: 'running' }));
    dispatch(setStreaming(true));

    let assistantText = '';
    let toolLogs = [];

    try {
      const response = await authenticatedFetch('/api/ai/app-agent/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: text,
          projectId,
          sandboxId,
          ...(stream.target && { sessionId: stream.target }),
          activeFile: activeFile || '',
          activeFileContent: activeFile ? (tabContents[activeFile] ?? '') : '',
        }),
        signal: stream.abort.signal,
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
        buffer = blocks.pop(); // keep the incomplete block

        for (const block of blocks) {
          if (!block.trim()) continue;
          const { event, data } = parseSseBlock(block);

          if (event === 'session') {
            const session = JSON.parse(data);
            stream.target = session.id;
            dispatch(setShownSession(session.id)); // this stream's messages are already on screen
            latest.current.onSession?.({ id: session.id, title: session.title, lastMessageAt: session.lastMessageAt });
          } else if (event === 'error') {
            throw new Error(JSON.parse(data).message || 'Error from Clio co-pilot');
          } else if (event === 'final') {
            assistantText = data;
            dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'completed' }));
          } else if (event === 'message' && data) {
            if (TOOL_LOG_PREFIXES.some((prefix) => data.startsWith(prefix))) {
              toolLogs = [...toolLogs, data];
            } else {
              assistantText += data;
            }
            dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'running' }));
          }
        }
      }

      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'completed' }));
      dispatch(setStreaming(false));
      fetchFilesList(sandboxId, { forceNetwork: true });
      onComplete?.();
      // Reload the chat so the new messages carry their saved ids (needed to delete them).
      if (stream.target && streamRef.current === stream) {
        try {
          const data = await getSessionMessagesAPI('copilot', stream.target);
          if (streamRef.current === stream && latest.current.sessionId === stream.target) {
            dispatch(showSession({ sessionId: stream.target, messages: data.messages.map(toChatMessage) }));
          }
        } catch (err) {
          console.warn('[Copilot] Could not refresh the chat:', err.message); // the answer is already on screen
        }
      }
    } catch (err) {
      // Leaving the chat aborts only this tab's stream; Clio still saves its answer.
      if (stream.abort.signal.aborted) return;
      console.error('[Copilot] invoke failed:', err);
      const errMsg = err.message || 'Failed to get a response from Clio';
      dispatch(updateLastMessage({ text: assistantText, toolLogs, status: 'error', error: errMsg }));
      dispatch(setStreaming(false));
    } finally {
      if (streamRef.current === stream) streamRef.current = null;
    }
  };

  // Load the open chat. The chat this tab is streaming into is already on screen.
  useEffect(() => {
    if (!projectId || !sessionsReady) return undefined;
    const stream = streamRef.current;
    if (stream && stream.target === sessionId) return undefined;

    stream?.abort.abort();
    streamRef.current = null;
    dispatch(clearHistory());
    if (!sessionId) return undefined;

    let cancelled = false;
    getSessionMessagesAPI('copilot', sessionId)
      .then((data) => {
        if (!cancelled) dispatch(showSession({ sessionId, messages: data.messages.map(toChatMessage) }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Copilot] Could not load the chat:', err);
        dispatch(showSession({ sessionId, messages: [] }));
      });
    return () => { cancelled = true; };
  }, [projectId, sessionId, sessionsReady, dispatch]);

  // Close this tab's stream when the float unmounts. Clio still finishes on the server.
  useEffect(() => () => streamRef.current?.abort.abort(), []);

  /** Moves messages to the trash. The UI drops them only after the server agreed. */
  const deleteMessages = useCallback(async (ids) => {
    const list = ids.filter(Boolean).map(String);
    if (list.length === 0) return;
    await trashMessagesAPI('copilot', list);
    const drop = new Set(list);
    dispatch(setMessages(latest.current.messages.filter((m) => !drop.has(String(m.id)))));
  }, [dispatch]);

  return {
    messages,
    isOpen,
    isStreaming,
    isHistoryLoading,
    sendMessage,
    deleteMessages,
    toggleCopilot: () => dispatch(toggleOpen()),
    openCopilot: () => dispatch(setOpen(true)),
    closeCopilot: () => dispatch(setOpen(false)),
  };
};
