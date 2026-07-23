import { createSlice } from '@reduxjs/toolkit';

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
      const key = getStorageKey(state.activeProjectId);
      localStorage.setItem(key, JSON.stringify(state.messages));
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
      const key = getStorageKey(state.activeProjectId);
      localStorage.setItem(key, JSON.stringify(state.messages));
    },
    setStreaming(state, action) {
      state.isStreaming = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setMessages(state, action) {
      state.messages = action.payload;
      const key = getStorageKey(state.activeProjectId);
      localStorage.setItem(key, JSON.stringify(state.messages));
    },
    clearHistory(state) {
      state.messages = [WELCOME_MSG];
      state.isStreaming = false;
      state.error = null;
      const key = getStorageKey(state.activeProjectId);
      localStorage.removeItem(key);
    },
  },
});

export const {
  loadMessagesForProject,
  addMessage,
  updateLastMessage,
  setStreaming,
  setError,
  setMessages,
  clearHistory,
} = codingAgentSlice.actions;

export default codingAgentSlice.reducer;
