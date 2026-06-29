import { createSlice } from '@reduxjs/toolkit';

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    messages: JSON.parse(localStorage.getItem('chat_messages')) || [
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Welcome to CodeSpace! I am your AI coding assistant. Launch a sandbox environment and ask me to build, edit, or debug React application features. I can view files, edit code, run terminal commands, and inspect runtime errors inside the sandbox in real-time.',
        toolLogs: [],
        status: 'completed',
        timestamp: new Date().toISOString(),
      }
    ],
    isStreaming: false,
    error: null,
    // App Agent Specific State
    isAppAgentOpen: false,
    appAgentMessages: JSON.parse(localStorage.getItem('app_agent_messages')) || [
      {
        id: 'clio-welcome',
        role: 'assistant',
        text: "Hi! I'm Clio, your coding co-pilot. I have access to the file currently open in your editor. Ask me any questions, request code reviews, or ask for fixes for this file, and I will help you right here!",
        toolLogs: [],
        status: 'completed',
        timestamp: new Date().toISOString(),
      }
    ],
    isAppAgentStreaming: false,
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
          text: 'Welcome to CodeSpace! I am your AI coding assistant. Launch a sandbox environment and ask me to build, edit, or debug React application features. I can view files, edit code, run terminal commands, and inspect runtime errors inside the sandbox in real-time.',
          toolLogs: [],
          status: 'completed',
          timestamp: new Date().toISOString(),
        }
      ];
      state.isStreaming = false;
      state.error = null;
      localStorage.removeItem('chat_messages');
    },
    // App Agent reducers
    setAppAgentOpen(state, action) {
      state.isAppAgentOpen = action.payload;
    },
    toggleAppAgentOpen(state) {
      state.isAppAgentOpen = !state.isAppAgentOpen;
    },
    addAppAgentMessage(state, action) {
      state.appAgentMessages.push({
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        toolLogs: [],
        text: '',
        ...action.payload,
      });
      localStorage.setItem('app_agent_messages', JSON.stringify(state.appAgentMessages));
    },
    updateLastAppAgentMessage(state, action) {
      if (state.appAgentMessages.length > 0) {
        const lastMsg = state.appAgentMessages[state.appAgentMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          const { text, toolLogs, status, error } = action.payload;
          if (text !== undefined) lastMsg.text = text;
          if (toolLogs !== undefined) lastMsg.toolLogs = toolLogs;
          if (status !== undefined) lastMsg.status = status;
          if (error !== undefined) lastMsg.error = error;
        }
      }
      localStorage.setItem('app_agent_messages', JSON.stringify(state.appAgentMessages));
    },
    setAppAgentStreaming(state, action) {
      state.isAppAgentStreaming = action.payload;
    },
    clearAppAgentHistory(state) {
      state.appAgentMessages = [
        {
          id: 'clio-welcome',
          role: 'assistant',
          text: "Hi! I'm Clio, your coding co-pilot. I have access to the file currently open in your editor. Ask me any questions, request code reviews, or ask for fixes for this file, and I will help you right here!",
          toolLogs: [],
          status: 'completed',
          timestamp: new Date().toISOString(),
        }
      ];
      state.isAppAgentStreaming = false;
      localStorage.removeItem('app_agent_messages');
    }
  },
});

export const { 
  addMessage, 
  updateLastMessage, 
  setStreaming, 
  setError, 
  clearHistory,
  setAppAgentOpen,
  toggleAppAgentOpen,
  addAppAgentMessage,
  updateLastAppAgentMessage,
  setAppAgentStreaming,
  clearAppAgentHistory
} = chatSlice.actions;
export default chatSlice.reducer;
