import axios from 'axios';

// Ensure withCredentials is set globally for all axios requests
axios.defaults.withCredentials = true;

/**
 * Custom Axios instance configured for automatic cookie passing and token refresh.
 */
export const apiClient = axios.create({
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Intercept 401 Unauthorized responses to automatically issue a token refresh request
 * to /api/auth/refresh and retry the original request.
 *
 * NOTE: /api/auth/getMe and /api/auth/logout are excluded because:
 * - getMe 401 = user simply not logged in (don't try to refresh on initial load)
 * - logout 401 = already invalid, no point retrying
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/api/auth/refresh') ||
      url.includes('/api/auth/google') ||
      url.includes('/api/auth/getMe') ||
      url.includes('/api/auth/logout');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
