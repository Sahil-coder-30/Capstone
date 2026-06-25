import { createSlice } from '@reduxjs/toolkit';

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    messages: JSON.parse(localStorage.getItem('chat_messages')) || [
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Welcome to Antigravity Codespace! I am your AI coding assistant. Launch a sandbox environment and ask me to build, edit, or debug React application features. I can view files, edit code, run terminal commands, and inspect runtime errors inside the sandbox in real-time.',
        toolLogs: [],
        status: 'completed',
        timestamp: new Date().toISOString(),
      }
    ],
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
      localStorage.setItem('chat_messages', JSON.stringify(state.messages));
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
      localStorage.setItem('chat_messages', JSON.stringify(state.messages));
    },
    setStreaming(state, action) {
      state.isStreaming = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    clearHistory(state) {
      state.messages = [
        {
          id: 'welcome',
          role: 'assistant',
          text: 'Welcome to Antigravity Codespace! I am your AI coding assistant. Launch a sandbox environment and ask me to build, edit, or debug React application features. I can view files, edit code, run terminal commands, and inspect runtime errors inside the sandbox in real-time.',
          toolLogs: [],
          status: 'completed',
          timestamp: new Date().toISOString(),
        }
      ];
      state.isStreaming = false;
      state.error = null;
      localStorage.removeItem('chat_messages');
    }
  },
});

export const { addMessage, updateLastMessage, setStreaming, setError, clearHistory } = chatSlice.actions;
export default chatSlice.reducer;
