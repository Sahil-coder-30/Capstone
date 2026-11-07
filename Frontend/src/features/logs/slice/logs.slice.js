import { createSlice } from '@reduxjs/toolkit';

const logsSlice = createSlice({
  name: 'logs',
  initialState: {
    runtimeLogs: '',
    isLoading: false,
    error: null,
  },
  reducers: {
    setLogs(state, action) {
      state.runtimeLogs = action.payload;
    },
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    clearLogs(state) {
      state.runtimeLogs = '';
      state.isLoading = false;
      state.error = null;
    }
  },
});

export const { setLogs, setLoading, setError, clearLogs } = logsSlice.actions;
export default logsSlice.reducer;
