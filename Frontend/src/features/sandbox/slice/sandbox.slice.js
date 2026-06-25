import { createSlice } from '@reduxjs/toolkit';

const sandboxSlice = createSlice({
  name: 'sandbox',
  initialState: {
    sandboxId: localStorage.getItem('sandboxId') || '',
    // status: 'idle' | 'starting' | 'warming' | 'running' | 'error'
    status: localStorage.getItem('sandboxId') ? 'running' : 'idle',
    previewUrl: localStorage.getItem('previewUrl') || '',
    agentUrl: localStorage.getItem('agentUrl') || '',
    warmingMessage: '',   // human-readable warming progress label
    warmingAttempt: 0,    // how many ping attempts made so far
    error: null,
  },
  reducers: {
    setSandboxDetails(state, action) {
      const { sandboxId, previewUrl, agentUrl } = action.payload;
      state.sandboxId = sandboxId;
      state.previewUrl = previewUrl;
      state.agentUrl = agentUrl;
      state.status = 'running';
      state.error = null;
      localStorage.setItem('sandboxId', sandboxId);
      localStorage.setItem('previewUrl', previewUrl || '');
      localStorage.setItem('agentUrl', agentUrl || '');
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
    clearSandbox(state) {
      if (state.sandboxId) {
        localStorage.removeItem(`editor_cache_${state.sandboxId}`);
      }
      state.sandboxId = '';
      state.previewUrl = '';
      state.agentUrl = '';
      state.status = 'idle';
      state.error = null;
      state.warmingMessage = '';
      state.warmingAttempt = 0;
      localStorage.removeItem('sandboxId');
      localStorage.removeItem('previewUrl');
      localStorage.removeItem('agentUrl');
    },
  },
});

export const { setSandboxDetails, setStatus, setWarmingProgress, setError, clearSandbox } = sandboxSlice.actions;
export default sandboxSlice.reducer;
