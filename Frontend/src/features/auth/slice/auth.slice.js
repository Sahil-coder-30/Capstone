import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { logoutAPI } from '../service/auth.api';

// ─── Async logout thunk ────────────────────────────────────────────────────────
// Calls the backend to blacklist the JWT in Redis and clear the httpOnly cookie,
// then clears Redux state regardless of whether the API call succeeds (the user
// is logged out locally even if the network request fails).
export const logoutThunk = createAsyncThunk('auth/logoutThunk', async (_, { dispatch }) => {
  try {
    await logoutAPI();
  } catch {
    // Swallow network/API errors — always clear local state
  } finally {
    dispatch(logout());
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: false,
    loading: true,
    error: null,
  },
  reducers: {
    loginSuccess(state, action) {
      state.user = action.payload.user || null;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
    },
    loginFailure(state, action) {
      state.user = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = action.payload;
    },
    logout(state) {
      state.user = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = null;
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
  },
});

export const { loginSuccess, loginFailure, logout, setLoading } = authSlice.actions;
export default authSlice.reducer;
