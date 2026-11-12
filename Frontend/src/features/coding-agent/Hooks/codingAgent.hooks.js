import { useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authenticatedFetch, parseFaultKitResponse } from '../../../services/apiClient';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import { readAgentStream } from '../service/agentStream';
import { getSessionMessagesAPI, toChatMessage, trashMessagesAPI } from '../../chat-history/service/chatHistory.api';
import {
  addMessage,
  updateLastMessage,
  updateMessageId,
  setStreaming,
  setError,
  setMessages,
  showSession,
  setShownSession,
  clearHistory,
  setPlanReview,
} from '../slice/codingAgent.slice';

const MAX_THINKING_CHARS = 40_000;
const MAX_TOOL_LOGS = 400;
const MAX_RECONNECTS = 5;
const TERMINAL_EVENTS = new Set(['agent:done', 'agent:stopped', 'agent:error']);

const createActivityEntry = ({ kind, title, detail, status = 'running' }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  kind,
  title,
  detail,
  status,
  timestamp: new Date().toISOString(),
});

const createStreamState = (title = 'Preparing Orion', detail = 'Opening realtime stream') => {
  const entry = createActivityEntry({ kind: 'queued', title, detail });
  return {
    phase: 'queued',
    title,
    detail,
    status: 'running',
    events: [entry],
    updatedAt: entry.timestamp,
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
  if (toolName === 'read_file') return `Reading ${preview}`;
  if (toolName === 'create_file') return `Creating ${preview}`;
  if (toolName === 'update_file') return `Updating ${preview}`;
  if (toolName === 'patch_file') return `Patching ${preview}`;
  if (toolName === 'execute_command') return `Running ${preview}`;
  if (toolName === 'search_code') return `Searching ${preview}`;
  return preview;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Per-run view model kept outside Redux so token-level events can be
 * batched into one Redux update per animation frame.
 */
const createRunView = () => ({
  segments: new Map(),   // answer segments by model run id (retractable)
  finalText: null,       // authoritative answer from agent:final
  thinking: '',
  toolLogs: [],
  steps: [],
  streamState: createStreamState(),
  status: 'running',
  error: undefined,
  lastEventId: null,
  terminal: false,
  awaitingReview: false,
  flushScheduled: false,
});

const messageTextOf = (view) => view.finalText ?? [...view.segments.values()].join('');

/**
 * useCodingAgent — hook for the left-panel Coding Agent (Orion).
 * Streams the agent over SSE from /api/ai/code-agent/*. A run keeps going
 * on the server if the page reloads; on mount the hook re-attaches to it.
 *
 * Shows one chat session at a time (`sessionId`, null for a new chat).
 * `onSession` hears about the chat the server opened for a first message,
 * `onLiveChange` about the chat a run is working in (null when it ends).
 */
export const useCodingAgent = (projectId, { sessionId = null, sessionsReady = true, onSession, onLiveChange } = {}) => {
  const dispatch = useDispatch();
  const { messages, isStreaming, error, planReview, shownSessionId } = useSelector((state) => state.codingAgent);
  // Loading = the open chat is not the one on screen yet.
  const isHistoryLoading = Boolean(projectId) && (!sessionsReady || (sessionId !== null && shownSessionId !== sessionId));
  const { sandboxId } = useSelector((state) => state.sandbox);
  const { fetchFilesList } = useEditor();

  const messagesRef = useRef(messages);
  const viewRef = useRef(null);
  const streamAbortRef = useRef(null);
  const onCompleteRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  // The chat a stream started from this tab writes into (null until the server names a new chat).
  const streamTargetRef = useRef(undefined);
  const callbacksRef = useRef({ onSession, onLiveChange });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    callbacksRef.current = { onSession, onLiveChange };
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  const flushNow = useCallback((view) => {
    view.flushScheduled = false;
    if (viewRef.current !== view) return;
    dispatch(updateLastMessage({
      text: messageTextOf(view),
      thinking: view.thinking,
      toolLogs: view.toolLogs,
      steps: view.steps,
      status: view.status,
      streamState: view.streamState,
      ...(view.error !== undefined && { error: view.error }),
    }));
  }, [dispatch]);

  const scheduleFlush = useCallback((view) => {
    if (view.flushScheduled) return;
    view.flushScheduled = true;
    const raf = typeof window !== 'undefined' && window.requestAnimationFrame;
    if (raf) raf(() => flushNow(view));
    else setTimeout(() => flushNow(view), 16);
  }, [flushNow]);

  const pushActivity = (view, entry) => {
    const activity = createActivityEntry(entry);
    view.streamState = {
      phase: activity.kind,
      title: activity.title,
      detail: activity.detail,
      status: activity.status,
      events: [...(view.streamState?.events || []), activity].slice(-6),
      updatedAt: activity.timestamp,
    };
  };

  const pushToolLog = (view, line) => {
    if (!line) return;
    view.toolLogs = [...view.toolLogs, line].slice(-MAX_TOOL_LOGS);
  };

  // ── Event handling ────────────────────────────────────────────────────────

  const handleEvent = useCallback((view, { id, event, data }) => {
    if (Number.isFinite(id)) view.lastEventId = id;
    const payload = data && typeof data === 'object' ? data : {};

    switch (event) {
      case 'agent:snapshot': {
        view.thinking = payload.thinking || '';
        view.segments = new Map(payload.message ? [['snapshot', payload.message]] : []);
        view.toolLogs = payload.toolLogs || [];
        view.steps = payload.steps || [];
        if (payload.lastStatus) {
          pushActivity(view, {
            kind: payload.lastStatus.phase || 'status',
            title: payload.lastStatus.title || 'Working',
            detail: payload.lastStatus.detail || '',
            status: payload.lastStatus.status || 'running',
          });
        }
        if (payload.planReview) {
          view.awaitingReview = true;
          dispatch(setPlanReview(payload.planReview));
          dispatch(setStreaming(false));
        }
        if (payload.status === 'finished') {
          // Reconnected after the run ended and its events were trimmed.
          view.terminal = true;
          view.status = 'completed';
          view.finalText = payload.message || messageTextOf(view);
          flushNow(view);
          dispatch(setStreaming(false));
          return;
        }
        break;
      }

      case 'agent:msg_created':
        if (payload.role && payload.id) {
          dispatch(updateMessageId({ role: payload.role, realId: payload.id }));
        }
        break;

      case 'agent:session':
        if (payload.sessionId) {
          streamTargetRef.current = payload.sessionId;
          dispatch(setShownSession(payload.sessionId)); // this stream's messages are already on screen
          callbacksRef.current.onSession?.({ id: payload.sessionId, title: payload.title });
          callbacksRef.current.onLiveChange?.(payload.sessionId);
        }
        return;

      case 'agent:model': {
        const label = payload.label || payload.modelId || 'Orion model';
        pushToolLog(view, `model: using ${label}`);
        pushActivity(view, { kind: 'model', title: 'Model selected', detail: label });
        break;
      }

      case 'agent:status':
        pushActivity(view, {
          kind: payload.phase || 'status',
          title: payload.title || 'Working',
          detail: payload.detail || '',
          status: payload.status || 'running',
        });
        break;

      case 'agent:thinking': {
        const text = typeof data === 'string' ? data : payload.text;
        if (!text) return;
        const next = view.thinking + text;
        view.thinking = next.length > MAX_THINKING_CHARS ? next.slice(-MAX_THINKING_CHARS) : next;
        break;
      }

      case 'agent:message':
        if (!payload.text) return;
        view.segments.set(payload.segment, (view.segments.get(payload.segment) || '') + payload.text);
        break;

      case 'agent:message_retract':
        view.segments.delete(payload.segment);
        break;

      case 'agent:final':
        view.finalText = payload.text || messageTextOf(view);
        break;

      case 'agent:tool_log':
        pushToolLog(view, payload.message || `${payload.toolName || 'tool'}: ${payload.level || 'info'}`);
        break;

      case 'agent:tool_start':
        pushActivity(view, {
          kind: 'tool',
          title: payload.toolName || 'Tool',
          detail: summarizeToolInput(payload.toolName, payload.input),
        });
        break;

      case 'agent:tool_end':
        pushActivity(view, {
          kind: 'tool',
          title: `${payload.toolName || 'Tool'} ${payload.ok ? 'done' : 'failed'}`,
          detail: stringifyPreview(payload.output, 130),
          status: payload.ok ? 'success' : 'error',
        });
        break;

      case 'agent:steps':
        view.steps = payload.steps || [];
        break;

      case 'agent:step':
        view.steps = view.steps.map((s) => (s.id === payload.stepId ? { ...s, status: payload.status, summary: payload.summary } : s));
        break;

      case 'agent:plan_review':
        view.awaitingReview = true;
        view.steps = (payload.plan?.steps || []).map((s) => ({ id: s.id, title: s.title, status: s.status || 'pending' }));
        dispatch(setPlanReview(payload));
        dispatch(setStreaming(false));
        pushActivity(view, {
          kind: 'plan_review',
          title: 'Plan review required',
          detail: `${payload.plan?.totalSteps || 0} steps proposed`,
          status: 'paused',
        });
        break;

      case 'agent:done':
        view.terminal = true;
        view.status = 'completed';
        pushActivity(view, {
          kind: 'done',
          title: payload.outcome === 'failed' ? 'Could not complete' : payload.outcome === 'partial' ? 'Partly done' : 'Run complete',
          detail: 'Workspace sync requested',
          status: payload.outcome === 'failed' ? 'error' : 'success',
        });
        break;

      case 'agent:stopped':
        view.terminal = true;
        view.status = 'completed';
        if (payload.text) view.finalText = payload.text;
        pushActivity(view, { kind: 'stopped', title: 'Stopped', detail: payload.message || 'Orion stopped the task', status: 'success' });
        break;

      case 'agent:error': {
        view.terminal = true;
        view.status = 'error';
        const errMsg = payload.message || 'Error running agent';
        view.error = errMsg;
        pushActivity(view, {
          kind: 'error',
          title: 'Agent error',
          detail: payload.code ? `${errMsg} (${payload.code})` : errMsg,
          status: 'error',
        });
        dispatch(setError(errMsg));
        break;
      }

      default:
        return;
    }

    scheduleFlush(view);

    if (TERMINAL_EVENTS.has(event)) {
      flushNow(view);
      // Only a stream that owned a run frees it; a refused start (run busy elsewhere) does not.
      if (streamTargetRef.current) callbacksRef.current.onLiveChange?.(null);
      streamTargetRef.current = undefined;
      dispatch(setPlanReview(null));
      dispatch(setStreaming(false));
      if (event !== 'agent:error' && sandboxId) fetchFilesList(sandboxId, { forceNetwork: true });
      onCompleteRef.current?.();
      onCompleteRef.current = null;
    }
  }, [dispatch, fetchFilesList, flushNow, sandboxId, scheduleFlush]);

  /**
   * Consumes a stream response, then keeps reconnecting with Last-Event-ID
   * until the run reaches a terminal event or the run is gone.
   */
  const followRun = useCallback(async (view, firstResponse, abort) => {
    let response = firstResponse;
    let reconnects = 0;

    while (!abort.signal.aborted) {
      if (response) {
        await readAgentStream(response, (frame) => handleEvent(view, frame), abort.signal);
        if (view.terminal || abort.signal.aborted) return;
        reconnects = 0;
      }

      if (reconnects >= MAX_RECONNECTS) break;
      await sleep(Math.min(1000 * 2 ** reconnects, 8000));
      reconnects += 1;
      if (abort.signal.aborted) return;

      try {
        const query = new URLSearchParams();
        if (streamTargetRef.current) query.set('sessionId', streamTargetRef.current);
        if (view.lastEventId != null) query.set('lastEventId', view.lastEventId);
        const res = await authenticatedFetch(`/api/ai/code-agent/stream/${projectId}?${query}`, {
          headers: view.lastEventId != null ? { 'Last-Event-ID': String(view.lastEventId) } : {},
          signal: abort.signal,
        });
        if (res.status === 204) {
          // The run finished and was cleaned up while we were disconnected.
          view.terminal = true;
          view.status = 'completed';
          pushActivity(view, { kind: 'done', title: 'Run finished', detail: 'Reload the chat to see the final report', status: 'success' });
          flushNow(view);
          dispatch(setStreaming(false));
          return;
        }
        response = res.ok ? res : null;
      } catch (err) {
        if (abort.signal.aborted) return;
        response = null;
        console.warn('[CodingAgent] Reconnect failed:', err.message);
      }
    }

    if (!view.terminal && !abort.signal.aborted) {
      view.status = 'error';
      view.error = 'Lost the connection to Orion. The task may still be running; reopen the chat to reconnect.';
      pushActivity(view, { kind: 'error', title: 'Connection lost', detail: view.error, status: 'error' });
      flushNow(view);
      dispatch(setError(view.error));
      dispatch(setStreaming(false));
    }
  }, [dispatch, flushNow, handleEvent, projectId]);

  // The recovery effect reads the latest followRun through a ref so a
  // re-render never tears down an open stream.
  const followRunRef = useRef(followRun);
  useEffect(() => {
    followRunRef.current = followRun;
  }, [followRun]);

  const beginStream = () => {
    streamAbortRef.current?.abort();
    const abort = new AbortController();
    streamAbortRef.current = abort;
    return abort;
  };

  // ── Send a task ───────────────────────────────────────────────────────────

  /** `options.newChat` sends to a new chat even if one is open (the dashboard's first prompt). */
  const sendMessage = useCallback((text, attachments, onComplete, options = {}) => {
    if (!text.trim() || !sandboxId || !projectId) return;

    let actualAttachments = attachments;
    let actualOnComplete = onComplete;
    if (typeof attachments === 'function') {
      actualOnComplete = attachments;
      actualAttachments = [];
    }

    const targetSessionId = options.newChat ? null : sessionIdRef.current;
    const view = createRunView();
    viewRef.current = view;
    onCompleteRef.current = actualOnComplete || null;
    streamTargetRef.current = targetSessionId;
    if (options.newChat) dispatch(clearHistory());

    dispatch(addMessage({ role: 'user', text }));
    dispatch(addMessage({
      role: 'assistant',
      text: '',
      thinking: '',
      toolLogs: [],
      steps: [],
      status: 'running',
      streamState: view.streamState,
    }));
    dispatch(setStreaming(true));
    dispatch(setError(null));
    dispatch(setPlanReview(null));

    const abort = beginStream();

    (async () => {
      try {
        const response = await authenticatedFetch('/api/ai/code-agent/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            projectId,
            sandboxId,
            ...(targetSessionId && { sessionId: targetSessionId }),
            attachments: actualAttachments,
          }),
          signal: abort.signal,
        });

        if (!response.ok) {
          throw await parseFaultKitResponse(response);
        }

        await followRun(view, response, abort);
      } catch (err) {
        if (abort.signal.aborted) return;
        console.error('[CodingAgent] SSE connection error:', err);
        const errMsg = err.message || 'Failed to connect to the AI Orchestration service';
        handleEvent(view, { id: null, event: 'agent:error', data: { message: errMsg, code: err.code } });
      }
    })();
  }, [projectId, sandboxId, dispatch, followRun, handleEvent]);

  // ── Re-attach to a run that is still active on the server ─────────────────

  useEffect(() => {
    if (!projectId || !sandboxId || !sessionId || isHistoryLoading) return undefined;
    if (streamAbortRef.current && !streamAbortRef.current.signal.aborted) return undefined;

    const abort = beginStream();

    (async () => {
      try {
        // 204 unless a run is working in this chat.
        const res = await authenticatedFetch(`/api/ai/code-agent/stream/${projectId}?sessionId=${sessionId}`, { signal: abort.signal });
        if (res.status !== 200 || abort.signal.aborted) return;

        const view = createRunView();
        view.streamState = createStreamState('Reconnected', 'Recovered an active Orion task');
        viewRef.current = view;
        streamTargetRef.current = sessionId;
        callbacksRef.current.onLiveChange?.(sessionId);

        const current = messagesRef.current || [];
        const last = current[current.length - 1];
        if (!(last?.role === 'assistant' && last?.status === 'running')) {
          dispatch(addMessage({
            role: 'assistant',
            text: '',
            thinking: '',
            toolLogs: [],
            steps: [],
            status: 'running',
            streamState: view.streamState,
          }));
        }
        dispatch(setStreaming(true));
        dispatch(setError(null));

        await followRunRef.current(view, res, abort);
      } catch (err) {
        if (!abort.signal.aborted) console.warn('[CodingAgent] Could not recover active run:', err.message);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sandboxId, sessionId, isHistoryLoading]);

  // Close any open stream when the panel unmounts. The run keeps going.
  useEffect(() => () => streamAbortRef.current?.abort(), []);

  // ── Run controls ──────────────────────────────────────────────────────────

  const postControl = useCallback(async (path, body = {}) => {
    const response = await authenticatedFetch(`/api/ai/code-agent/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sandboxId, ...body }),
    });
    if (!response.ok) throw await parseFaultKitResponse(response);
    return response;
  }, [projectId, sandboxId]);

  const stopAgent = useCallback(async () => {
    if (!projectId) return;
    try {
      await postControl('stop');
    } catch (err) {
      console.error('[CodingAgent] Failed to send stop request:', err);
    }
  }, [projectId, postControl]);

  const approvePlan = useCallback(async () => {
    if (!sandboxId || !projectId) return;
    dispatch(setPlanReview(null));
    dispatch(setStreaming(true));
    if (viewRef.current) viewRef.current.awaitingReview = false;
    try {
      await postControl('plan-approve');
    } catch (err) {
      console.error('[CodingAgent] Failed to approve plan:', err);
      dispatch(setError(err.message || 'Failed to approve the plan'));
      dispatch(setStreaming(false));
    }
  }, [projectId, sandboxId, dispatch, postControl]);

  const rejectPlan = useCallback(async (feedback = '') => {
    if (!sandboxId || !projectId) return;
    dispatch(setPlanReview(null));
    dispatch(setStreaming(true));
    if (viewRef.current) viewRef.current.awaitingReview = false;
    try {
      await postControl('plan-reject', { feedback });
    } catch (err) {
      console.error('[CodingAgent] Failed to reject plan:', err);
      dispatch(setError(err.message || 'Failed to send plan feedback'));
      dispatch(setStreaming(false));
    }
  }, [projectId, sandboxId, dispatch, postControl]);

  // ── Chat history ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId) {
      dispatch(clearHistory());
      return undefined;
    }
    if (!sessionsReady) return undefined;
    // The chat a stream from this tab is writing into is already on screen.
    const isStreamOpen = streamAbortRef.current && !streamAbortRef.current.signal.aborted;
    if (isStreamOpen && streamTargetRef.current === sessionId) return undefined;

    // Leaving a chat closes only this tab's stream. A run keeps going on the server.
    streamAbortRef.current?.abort();
    streamTargetRef.current = undefined;
    viewRef.current = null;
    dispatch(setStreaming(false));
    dispatch(setPlanReview(null));
    dispatch(setError(null));

    if (!sessionId) {
      dispatch(clearHistory());
      return undefined;
    }

    dispatch(clearHistory()); // also marks the open chat as not loaded yet
    let cancelled = false;
    getSessionMessagesAPI('codingAgent', sessionId)
      .then((data) => {
        if (!cancelled) dispatch(showSession({ sessionId, messages: data.messages.map(toChatMessage) }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[CodingAgent] Could not load the chat:', err);
        dispatch(showSession({ sessionId, messages: [] }));
        dispatch(setError(err.message || 'Could not load this chat.'));
      });
    return () => { cancelled = true; };
  }, [projectId, sessionId, sessionsReady, dispatch]);

  /** Moves messages to the trash. The UI drops them only after the server agreed. */
  const deleteMessages = useCallback(async (messageIds) => {
    const idsArray = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean).map(String);
    if (idsArray.length === 0) return;
    try {
      await trashMessagesAPI('codingAgent', idsArray);
      const idsSet = new Set(idsArray);
      dispatch(setMessages(messagesRef.current.filter((m) => !idsSet.has(String(m._id)) && !idsSet.has(String(m.id)))));
    } catch (err) {
      console.error('[CodingAgent] Could not delete messages:', err);
      dispatch(setError(err.message || 'Could not delete the message. Try again.'));
    }
  }, [dispatch]);

  const deleteMessage = useCallback(async (messageId) => {
    return deleteMessages([messageId]);
  }, [deleteMessages]);

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
    deleteMessage,
    deleteMessages,
  };
};
