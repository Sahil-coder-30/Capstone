import axios from 'axios';

// Ensure withCredentials is set globally for all axios requests
axios.defaults.withCredentials = true;

// ── In-Memory Token Storage (XSS-Safe) ───────────────────────────────────────
let _accessToken = null;

export const setAccessToken  = (token) => { _accessToken = token; };
export const clearAccessToken = ()      => { _accessToken = null;  };
export const getAccessToken  = ()       => _accessToken;

/**
 * Helper to perform native fetch requests with Authorization token and credentials attached.
 */
export const authenticatedFetch = (url, options = {}) => {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
};

/**
 * Custom Axios instance configured for automatic cookie passing and token refresh.
 */
export const apiClient = axios.create({
  withCredentials: true,
});

// ── Request Interceptor: Inject Access Token ──────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    if (_accessToken) {
      config.headers.Authorization = `Bearer ${_accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

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
    const originalRequest = error?.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';

    // Only exclude endpoints that must NEVER be retried with a refreshed token:
    //   /refresh  — would cause infinite loop
    //   /google   — OAuth flow, not a token-protected endpoint
    //   /logout   — already invalidating the session, no point retrying
    // NOTE: /getMe is intentionally NOT excluded — a 401 on /getMe means
    // the access token is missing/expired. The interceptor will transparently
    // refresh it via the httpOnly cookie and retry /getMe automatically.
    const isAuthEndpoint =
      url.includes('/api/auth/refresh') ||
      url.includes('/api/auth/google') ||
      url.includes('/api/auth/logout');

    if (
      error?.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const newToken = refreshRes.data?.accessToken;
        setAccessToken(newToken);
        processQueue(null, newToken);

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAccessToken();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
