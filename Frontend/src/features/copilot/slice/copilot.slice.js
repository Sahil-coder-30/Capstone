import { createSlice } from '@reduxjs/toolkit';

// Messages of the Clio chat that is open. Chats live in chat sessions
// (features/chat-history); the server is the source of truth.

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
    shownSessionId: null, // the chat whose messages are on screen (null = a new chat)
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
    /** Shows a saved chat. An empty chat shows the welcome message. */
    showSession(state, { payload: { sessionId, messages } }) {
      state.shownSessionId = sessionId;
      state.messages = messages.length > 0 ? messages : [WELCOME_MSG];
    },
    /** The server named the new chat that is already on screen. */
    setShownSession(state, action) {
      state.shownSessionId = action.payload;
    },
    clearHistory(state) {
      state.shownSessionId = null;
      state.messages = [WELCOME_MSG];
      state.isStreaming = false;
    },
    resetCopilot(state) {
      state.shownSessionId = null;
      state.messages = [WELCOME_MSG];
      state.isOpen = false;
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
  showSession,
  setShownSession,
  clearHistory,
  resetCopilot,
} = copilotSlice.actions;

export default copilotSlice.reducer;
