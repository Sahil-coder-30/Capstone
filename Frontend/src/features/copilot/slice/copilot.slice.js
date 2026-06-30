import { createSlice } from '@reduxjs/toolkit';

const WELCOME_MSG = {
  id: 'copilot-welcome',
  role: 'assistant',
  text: "Hi! I'm Clio, your coding co-pilot. I have access to the file currently open in your editor. Ask me any questions, request code reviews, or ask for fixes — I'll help you right here!",
  toolLogs: [],
  status: 'completed',
  timestamp: new Date().toISOString(),
};

const copilotSlice = createSlice({
  name: 'copilot',
  initialState: {
    messages: [WELCOME_MSG],
    isOpen: false,
    isStreaming: false,
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
    },
    updateLastMessage(state, action) {
      if (state.messages.length > 0) {
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          const { text, toolLogs, status, error } = action.payload;
          if (text !== undefined) lastMsg.text = text;
          if (toolLogs !== undefined) lastMsg.toolLogs = toolLogs;
          if (status !== undefined) lastMsg.status = status;
          if (error !== undefined) lastMsg.error = error;
        }
      }
    },
    setStreaming(state, action) {
      state.isStreaming = action.payload;
    },
    setOpen(state, action) {
      state.isOpen = action.payload;
    },
    toggleOpen(state) {
      state.isOpen = !state.isOpen;
    },
    setMessages(state, action) {
      state.messages = action.payload;
    },
    clearHistory(state) {
      state.messages = [WELCOME_MSG];
      state.isStreaming = false;
    },
  },
});

export const {
  addMessage,
  updateLastMessage,
  setStreaming,
  setOpen,
  toggleOpen,
  setMessages,
  clearHistory,
} = copilotSlice.actions;

export default copilotSlice.reducer;
