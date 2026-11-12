import { createSlice } from '@reduxjs/toolkit';

// Chat sessions per agent. Orion and Clio never share state.
const emptyAgent = () => ({
  projectId: null,
  sessions: [],
  hasMore: false,
  activeSessionId: null, // null = a new chat that has no messages yet
  liveSessionId: null,   // the chat an Orion run is working in
  isLoading: false,
});

const byRecent = (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt);

const chatHistorySlice = createSlice({
  name: 'chatHistory',
  initialState: { codingAgent: emptyAgent(), copilot: emptyAgent() },
  reducers: {
    resetAgent(state, { payload: { agentType, projectId } }) {
      state[agentType] = { ...emptyAgent(), projectId, isLoading: true };
    },
    setSessions(state, { payload: { agentType, sessions, hasMore, liveSessionId, append } }) {
      const agent = state[agentType];
      agent.sessions = append ? [...agent.sessions, ...sessions] : sessions;
      agent.hasMore = hasMore;
      if (liveSessionId !== undefined) agent.liveSessionId = liveSessionId;
      agent.isLoading = false;
    },
    setLoading(state, { payload: { agentType, isLoading } }) {
      state[agentType].isLoading = isLoading;
    },
    setActiveSession(state, { payload: { agentType, sessionId } }) {
      state[agentType].activeSessionId = sessionId;
    },
    setLiveSession(state, { payload: { agentType, sessionId } }) {
      state[agentType].liveSessionId = sessionId;
    },
    /** Adds or updates a session and keeps the list newest first. */
    upsertSession(state, { payload: { agentType, session } }) {
      const agent = state[agentType];
      const index = agent.sessions.findIndex((s) => s.id === session.id);
      if (index === -1) agent.sessions.unshift(session);
      else agent.sessions[index] = { ...agent.sessions[index], ...session };
      agent.sessions.sort(byRecent);
    },
    removeSession(state, { payload: { agentType, sessionId } }) {
      const agent = state[agentType];
      agent.sessions = agent.sessions.filter((s) => s.id !== sessionId);
      if (agent.activeSessionId === sessionId) agent.activeSessionId = null;
    },
  },
});

export const {
  resetAgent,
  setSessions,
  setLoading,
  setActiveSession,
  setLiveSession,
  upsertSession,
  removeSession,
} = chatHistorySlice.actions;

export default chatHistorySlice.reducer;
