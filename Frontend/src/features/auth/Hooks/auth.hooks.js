import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMeAPI, logoutAPI } from '../service/auth.api';
import { loginSuccess, loginFailure, logout as logoutAction, setLoading } from '../slice/auth.slice';
import { setAccessToken, clearAccessToken } from '../../../services/apiClient';

let _verifySessionPromise = null;

export const useAuth = () => {
  const dispatch = useDispatch();
  const authState = useSelector((state) => state.auth);

  /**
   * verifySession — Called once on app boot by a protected route or layout component.
   *
   * Flow:
   *  1. Calls GET /api/auth/getMe (with accessToken cookie or Authorization header).
   *  2. If session is valid, /getMe returns user data and accessToken.
   *  3. Stores the accessToken in memory via setAccessToken.
   *  4. If token was missing/expired, apiClient response interceptor handles auto-refresh.
   *  Deduplicated with _verifySessionPromise to prevent StrictMode duplicate calls.
   */
  const verifySession = useCallback(async () => {
    if (_verifySessionPromise) {
      return _verifySessionPromise;
    }

    _verifySessionPromise = (async () => {
      try {
        dispatch(setLoading(true));

        const response = await fetchMeAPI();

        if (response.status === 'success' && response.user) {
          if (response.accessToken) {
            setAccessToken(response.accessToken);
          }
          dispatch(loginSuccess({ user: response.user }));
          return response.user;
        } else {
          dispatch(loginFailure('Invalid session response'));
          return null;
        }
      } catch (err) {
        // Reaches here only when refresh token is dead or missing.
        // User must log in again.
        const msg = err.response?.data?.message || err.message || 'No active session';
        dispatch(loginFailure(msg));
        return null;
      } finally {
        _verifySessionPromise = null;
      }
    })();

    return _verifySessionPromise;
  }, [dispatch]);

  const authLogout = useCallback(async () => {
    try {
      dispatch(setLoading(true));
      await logoutAPI();
    } catch (err) {
      // Swallow error on logout to clear local state regardless
    } finally {
      clearAccessToken();
      dispatch(logoutAction());
    }
  }, [dispatch]);

  return {
    ...authState,
    verifySession,
    authLogout,
  };
};
