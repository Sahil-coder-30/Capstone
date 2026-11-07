import { useDispatch, useSelector } from 'react-redux';
import { fetchViteLogsAPI } from '../service/logs.api';
import { setLogs, setLoading, setError, clearLogs } from '../slice/logs.slice';

export const useLogs = () => {
  const dispatch = useDispatch();
  const { runtimeLogs, isLoading, error } = useSelector((state) => state.logs);

  const fetchViteLogs = async (sandboxId) => {
    if (!sandboxId) return;
    try {
      dispatch(setLoading(true));
      const data = await fetchViteLogsAPI(sandboxId);
      if (data.success) {
        dispatch(setLogs(data.logs || 'No logs available'));
        return data.logs;
      } else {
        throw new Error(data.error || 'Failed to fetch logs');
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Error fetching Vite logs';
      dispatch(setError(errMsg));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };

  const clearViteLogs = () => {
    dispatch(clearLogs());
  };

  return {
    runtimeLogs,
    isLoading,
    error,
    fetchViteLogs,
    clearViteLogs,
  };
};
