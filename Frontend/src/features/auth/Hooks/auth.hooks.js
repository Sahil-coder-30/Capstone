import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMeAPI, logoutAPI } from '../service/auth.api';
import { loginSuccess, loginFailure, logout as logoutAction, setLoading } from '../slice/auth.slice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const authState = useSelector((state) => state.auth);

  const verifySession = useCallback(async () => {
    try {
      dispatch(setLoading(true));
      const response = await fetchMeAPI();
      if (response.status === 'success' && response.user) {
        dispatch(loginSuccess({ user: response.user }));
        return response.user;
      } else {
        dispatch(loginFailure('Invalid session response'));
        return null;
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Unauthorized';
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
      dispatch(logoutAction());
    }
  }, [dispatch]);

  return {
    ...authState,
    verifySession,
    authLogout,
  };
};
