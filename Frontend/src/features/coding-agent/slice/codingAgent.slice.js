import { createSlice } from '@reduxjs/toolkit';

// ─── Debounced localStorage save ──────────────────────────────────────────────
// Streaming dispatches updateLastMessage on EVERY token — saving to localStorage
// on each token blocks the main thread. Debounce so we only write after the
// stream goes quiet for 600 ms (or immediately on addMessage / setMessages).
const _saveTimers = {};
const saveMessages = (key, messages, immediate = false) => {
  if (immediate) {
    clearTimeout(_saveTimers[key]);
    delete _saveTimers[key];
    try { localStorage.setItem(key, JSON.stringify(messages)); } catch { /* quota */ }
    return;
  }
  clearTimeout(_saveTimers[key]);
  _saveTimers[key] = setTimeout(() => {
    try { localStorage.setItem(key, JSON.stringify(messages)); } catch { /* quota */ }
    delete _saveTimers[key];
  }, 600);
};

const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  text: 'Welcome to CodeSpace! I am your AI coding assistant. Launch a sandbox environment and ask me to build, edit, or debug React application features. I can view files, edit code, run terminal commands, and inspect runtime errors inside the sandbox in real-time.',
  toolLogs: [],
  status: 'completed',
  timestamp: new Date().toISOString(),
};

const getStorageKey = (projectId) => {
  return projectId ? `codingAgent_messages_${projectId}` : 'codingAgent_messages';
};

const codingAgentSlice = createSlice({
  name: 'codingAgent',
  initialState: {
    activeProjectId: null,
    messages: [WELCOME_MSG],
    isStreaming: false,
    error: null,
    planReview: null,  // { plan, taskSubType, interruptId } — set when graph pauses for review
  },
  reducers: {
    loadMessagesForProject(state, action) {
      const projectId = action.payload;
      state.activeProjectId = projectId || null;
      const key = getStorageKey(projectId);
      try {
        const saved = localStorage.getItem(key);
        state.messages = saved ? JSON.parse(saved) : [WELCOME_MSG];
      } catch (e) {
        state.messages = [WELCOME_MSG];
      }
      state.isStreaming = false;
      state.error = null;
    },
    addMessage(state, action) {
      state.messages.push({
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        toolLogs: [],
        text: '',
        ...action.payload,
      });
      // Immediate save — a new message is a structural change, not a stream tick
      saveMessages(getStorageKey(state.activeProjectId), state.messages, true);
    },
    updateLastMessage(state, action) {
      if (state.messages.length > 0) {
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          const { text, toolLogs, status, error, streamState } = action.payload;
          if (text !== undefined) lastMsg.text = text;
          if (toolLogs !== undefined) lastMsg.toolLogs = toolLogs;
          if (status !== undefined) lastMsg.status = status;
          if (error !== undefined) lastMsg.error = error;
          if (streamState !== undefined) lastMsg.streamState = streamState;
        }
      }
      // Debounced — streaming tokens fire this hundreds of times; only flush after quiet period
      saveMessages(getStorageKey(state.activeProjectId), state.messages, false);
    },
    updateMessageId(state, action) {
      const { role, realId } = action.payload || {};
      if (!realId) return;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === role) {
          state.messages[i]._id = realId;
          state.messages[i].id = realId;
          break;
        }
      }
      saveMessages(getStorageKey(state.activeProjectId), state.messages, true);
    },
    setStreaming(state, action) {
      state.isStreaming = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setMessages(state, action) {
      state.messages = action.payload;
      // Immediate save — setMessages is a bulk structural update, not a stream tick
      saveMessages(getStorageKey(state.activeProjectId), state.messages, true);
    },
    clearHistory(state) {
      state.messages = [WELCOME_MSG];
      state.isStreaming = false;
      state.error = null;
      state.planReview = null;
      const key = getStorageKey(state.activeProjectId);
      localStorage.removeItem(key);
    },
    setPlanReview(state, action) {
      // action.payload: { plan, taskSubType, interruptId } | null
      state.planReview = action.payload;
    },
  },
});

export const {
  loadMessagesForProject,
  addMessage,
  updateLastMessage,
  updateMessageId,
  setStreaming,
  setError,
  setMessages,
  clearHistory,
  setPlanReview,
} = codingAgentSlice.actions;

export default codingAgentSlice.reducer;
