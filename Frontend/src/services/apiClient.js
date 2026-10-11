import axios from 'axios';

// Ensure withCredentials is set globally for all axios requests
axios.defaults.withCredentials = true;

// ── In-Memory Token Storage (XSS-Safe) ───────────────────────────────────────
let _accessToken = null;

export const setAccessToken = (token) => {
  _accessToken = token;
};
export const clearAccessToken = () => {
  _accessToken = null;
};
export const getAccessToken = () => _accessToken;

/**
 * Standardized FaultKit Client Error Class
 * Represents normalized errors conforming to the FaultKit OpenAPI schema:
 * { success: false, error: { code, message, details, requestId }, requestId }
 */
export class FaultKitClientError extends Error {
  constructor({ code, message, details, requestId, status }) {
    super(message || 'An error occurred');
    this.name = 'FaultKitClientError';
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details || null;
    this.requestId = requestId || null;
    this.status = status || 500;
    this.isFaultKit = true;
  }
}

/**
 * Helper to parse and normalize Fetch/Response errors into FaultKitClientError.
 * Triggers Loki support tracing and emits global 'faultkit:error' CustomEvent.
 */
export const parseFaultKitResponse = async (response) => {
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  const errorData = data?.error;
  const headerRequestId = response.headers?.get?.('x-request-id') || data?.requestId || null;

  const code =
    errorData?.code ||
    data?.code ||
    (response.status === 401
      ? 'UNAUTHORIZED'
      : response.status === 402
      ? 'INSUFFICIENT_CREDITS'
      : response.status === 429
      ? 'RATE_LIMIT_EXCEEDED'
      : 'UNKNOWN_ERROR');

  const message =
    errorData?.message ||
    data?.message ||
    `HTTP error ${response.status}: ${response.statusText}`;

  const details = errorData?.details || data?.details || null;
  const requestId = errorData?.requestId || headerRequestId;

  const faultError = new FaultKitClientError({
    code,
    message,
    details,
    requestId,
    status: response.status,
  });

  // Support Reference Tracing
  if (requestId) {
    console.error(`[FaultKit] Support Reference ID: ${requestId} (Code: ${code})`);
  }

  // Global Event Dispatch for UI Toasts & Modals
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('faultkit:error', {
        detail: {
          code,
          message,
          details,
          requestId,
          status: response.status,
        },
      })
    );
  }

  return faultError;
};

/**
 * Helper to perform native fetch requests with Authorization token and credentials attached.
 * Automatically injects correlation ID ('x-request-id') header for distributed tracing.
 */
export const authenticatedFetch = (url, options = {}) => {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}) };

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!headers['x-request-id'] && !headers['X-Request-Id']) {
    headers['x-request-id'] =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
};

/**
 * Custom Axios instance configured for automatic cookie passing, correlation tracking, and token refresh.
 */
export const apiClient = axios.create({
  withCredentials: true,
  timeout: 8000,
});

// ── Request Interceptor: Inject Access Token & Correlation ID ────────────────
apiClient.interceptors.request.use(
  (config) => {
    if (_accessToken) {
      config.headers.Authorization = `Bearer ${_accessToken}`;
    }
    if (!config.headers['x-request-id'] && !config.headers['X-Request-Id']) {
      config.headers['x-request-id'] =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
 * Response Interceptor:
 * 1. Automatically handles 401 token refresh queue.
 * 2. Parses and enriches errors via FaultKit OpenAPI Contract (Recipe 7).
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';

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
        const refreshRes = await axios.post('/api/auth/refresh', {}, { withCredentials: true, timeout: 6000 });
        const newToken = refreshRes.data?.accessToken;
        setAccessToken(newToken);
        processQueue(null, newToken);

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAccessToken();
        localStorage.removeItem('auth_token');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── FaultKit OpenAPI Error Parsing (Recipe 7) ───────────────────────────
    // Contract: { success: false, error: { code, message, details, requestId }, requestId }
    const errorData = error?.response?.data?.error;
    const responseData = error?.response?.data;
    const statusCode = error?.response?.status;
    const headerRequestId = error?.response?.headers?.['x-request-id'] || responseData?.requestId;

    if (errorData) {
      error.code = errorData.code || 'UNKNOWN_ERROR';
      error.message = errorData.message || 'An error occurred';
      error.details = errorData.details || null;
      error.requestId = errorData.requestId || headerRequestId || null;
      error.status = statusCode;

      // Auth Session Expiry Redirection
      if (errorData.code === 'UNAUTHORIZED' || errorData.code === 'TOKEN_EXPIRED') {
        clearAccessToken();
        localStorage.removeItem('auth_token');
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          console.warn('[FaultKit] Session expired or unauthorized, redirecting to login');
        }
      }

      // Observability & Support Tracing
      if (error.requestId) {
        console.error(`[FaultKit] Support Reference ID: ${error.requestId} (Code: ${error.code})`);
      }

      // Global Event Dispatch for UI Toasts & Banners
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('faultkit:error', {
            detail: {
              code: error.code,
              message: error.message,
              details: error.details,
              requestId: error.requestId,
              status: statusCode,
            },
          })
        );
      }
    } else {
      error.code = error.code || 'NETWORK_ERROR';
      error.message = responseData?.message || error.message || 'Network or connection error. Please try again.';
      error.details = null;
      error.requestId = headerRequestId || null;
      error.status = statusCode;
    }

    return Promise.reject(error);
  }
);

export default apiClient;
