import { createSlice } from '@reduxjs/toolkit';

// Messages of the Orion chat that is open. The server is the source of
// truth: chats live in chat sessions (features/chat-history).

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
    shownSessionId: null, // the chat whose messages are on screen (null = a new chat)
    messages: [WELCOME_MSG],
    isStreaming: false,
    error: null,
    planReview: null,  // { plan, taskSubType, warnings, threadId } — set when the graph pauses for review
  },
  reducers: {
    resetCodingAgent(state) {
      state.shownSessionId = null;
      state.messages = [WELCOME_MSG];
      state.isStreaming = false;
      state.error = null;
      state.planReview = null;
    },
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
          const { text, thinking, steps, toolLogs, status, error, streamState } = action.payload;
          if (text !== undefined) lastMsg.text = text;
          if (thinking !== undefined) lastMsg.thinking = thinking;
          if (steps !== undefined) lastMsg.steps = steps;
          if (toolLogs !== undefined) lastMsg.toolLogs = toolLogs;
          if (status !== undefined) lastMsg.status = status;
          if (error !== undefined) lastMsg.error = error;
          if (streamState !== undefined) lastMsg.streamState = streamState;
        }
      }
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
    },
    setStreaming(state, action) {
      state.isStreaming = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
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
      state.error = null;
      state.planReview = null;
    },
    setPlanReview(state, action) {
      // action.payload: { plan, taskSubType, interruptId } | null
      state.planReview = action.payload;
    },
  },
});

export const {
  resetCodingAgent,
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
} = codingAgentSlice.actions;

export default codingAgentSlice.reducer;
