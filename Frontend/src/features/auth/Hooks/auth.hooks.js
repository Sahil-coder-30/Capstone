import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMeAPI, logoutAPI } from '../service/auth.api';
import { loginSuccess, loginFailure, logout as logoutAction, setLoading } from '../slice/auth.slice';
import { clearAccessToken } from '../../../services/apiClient';

export const useAuth = () => {
  const dispatch = useDispatch();
  const authState = useSelector((state) => state.auth);

  /**
   * verifySession — Called once on app boot by a protected route or layout component.
   *
   * Flow:
   *  1. Calls GET /api/auth/getMe with no access token (memory is empty on fresh load).
   *  2. Backend returns 401 (no Authorization header).
   *  3. apiClient response interceptor catches the 401.
   *  4. Interceptor fires POST /api/auth/refresh — browser auto-sends the httpOnly cookie.
   *  5. Auth service validates the refresh token → returns a new accessToken in JSON.
   *  6. Interceptor stores the new token in memory and retries GET /api/auth/getMe.
   *  7. /getMe succeeds → loginSuccess dispatched → user is authenticated.
   *
   *  If refresh token is dead/expired:
   *  → Auth service returns 401 on /refresh
   *  → Interceptor propagates the error (refresh endpoint is excluded from retry)
   *  → catch block here dispatches loginFailure → app shows login screen
   */
  const verifySession = useCallback(async () => {
    try {
      dispatch(setLoading(true));

      // Directly call /getMe. The apiClient interceptor transparently handles:
      //   - 401 on /getMe → fire /refresh (cookie sent automatically) → retry /getMe
      //   - If /refresh also fails → error propagates to catch block below
      const response = await fetchMeAPI();

      if (response.status === 'success' && response.user) {
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
    }
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
