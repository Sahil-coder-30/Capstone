import { createSlice } from '@reduxjs/toolkit';

const sandboxSlice = createSlice({
  name: 'sandbox',
  initialState: {
    projectId: '',        // The active project ID associated with this state
    sandboxId: '',
    // status: 'idle' | 'starting' | 'warming' | 'running' | 'error'
    status: 'idle',
    previewUrl: '',
    agentUrl: '',
    warmingMessage: '',   // human-readable warming progress label
    warmingAttempt: 0,    // how many ping attempts made so far
    error: null,
  },
  reducers: {
    initializeSandboxForProject(state, action) {
      const projectId = action.payload;
      state.projectId = projectId || '';
      state.sandboxId = '';
      state.status = 'idle';
      state.previewUrl = '';
      state.agentUrl = '';
      state.error = null;
      state.warmingMessage = '';
      state.warmingAttempt = 0;
    },
    setSandboxDetails(state, action) {
      const { projectId, sandboxId, previewUrl, agentUrl } = action.payload;
      const activeProjId = projectId || state.projectId;
      
      state.sandboxId = sandboxId;
      state.previewUrl = previewUrl;
      state.agentUrl = agentUrl;
      state.status = 'running';
      state.error = null;

      if (activeProjId) {
        state.projectId = activeProjId;
      }
    },
    setStatus(state, action) {
      state.status = action.payload;
    },
    setWarmingProgress(state, action) {
      state.status = 'warming';
      state.warmingMessage = action.payload.message ?? state.warmingMessage;
      state.warmingAttempt = action.payload.attempt ?? state.warmingAttempt;
    },
    setError(state, action) {
      state.error = action.payload;
      state.status = 'error';
      state.warmingMessage = '';
      state.warmingAttempt = 0;
    },
    clearSandbox(state, action) {
      const targetProjectId = action.payload || state.projectId;
      if (state.projectId === targetProjectId) {
        state.sandboxId = '';
        state.previewUrl = '';
        state.agentUrl = '';
        state.status = 'idle';
        state.error = null;
        state.warmingMessage = '';
        state.warmingAttempt = 0;
      }
    },
  },
});

export const {
  initializeSandboxForProject,
  setSandboxDetails,
  setStatus,
  setWarmingProgress,
  setError,
  clearSandbox,
} = sandboxSlice.actions;
export default sandboxSlice.reducer;
