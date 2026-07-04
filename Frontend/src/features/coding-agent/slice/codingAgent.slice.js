import { createSlice } from '@reduxjs/toolkit';

const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  text: 'Welcome to CodeSpace! I am your AI coding assistant. Launch a sandbox environment and ask me to build, edit, or debug React application features. I can view files, edit code, run terminal commands, and inspect runtime errors inside the sandbox in real-time.',
  toolLogs: [],
  status: 'completed',
  timestamp: new Date().toISOString(),
};

const codingAgentSlice = createSlice({
  name: 'codingAgent',
  initialState: {
    messages: JSON.parse(localStorage.getItem('codingAgent_messages')) || [WELCOME_MSG],
    isStreaming: false,
    error: null,
  },
  reducers: {
    addMessage(state, action) {
      state.messages.push({
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        toolLogs: [],
        text: '',
        ...action.payload,
      });
      localStorage.setItem('codingAgent_messages', JSON.stringify(state.messages));
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
      localStorage.setItem('codingAgent_messages', JSON.stringify(state.messages));
    },
    setStreaming(state, action) {
      state.isStreaming = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setMessages(state, action) {
      state.messages = action.payload;
      localStorage.setItem('codingAgent_messages', JSON.stringify(state.messages));
    },
    clearHistory(state) {
      state.messages = [WELCOME_MSG];
      state.isStreaming = false;
      state.error = null;
      localStorage.removeItem('codingAgent_messages');
    },
  },
});

export const {
  addMessage,
  updateLastMessage,
  setStreaming,
  setError,
  setMessages,
  clearHistory,
} = codingAgentSlice.actions;

export default codingAgentSlice.reducer;
