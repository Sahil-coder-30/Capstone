/**
 * Shared Axios Instance — Payments Frontend
 *
 * Security features:
 *  1. Access token stored in JavaScript memory (closure variable) — NEVER localStorage.
 *     If an XSS attack runs `document.cookie` or `localStorage.getItem()`, no token is found.
 *  2. Refresh token lives in HttpOnly cookie — automatically sent by the browser on refresh calls.
 *     JavaScript cannot read it under any circumstances.
 *  3. 401 responses trigger a silent background refresh — users never get kicked out mid-checkout.
 *  4. All payment API requests send: Authorization: Bearer <JWT>
 *
 * Usage:
 *   import api, { setAccessToken } from './api';
 *   setAccessToken(tokenFromLoginResponse);   // Call once after login/redirect
 *   api.post('/create-order', data);          // Token injected automatically
 */
import axios from 'axios';

// ── In-Memory Token Storage (XSS-Safe) ───────────────────────────────────────
// This variable lives in JavaScript module closure memory.
// It is reset on page refresh — but the HttpOnly refresh cookie silently restores it.
let _accessToken = null;

export const setAccessToken  = (token) => { _accessToken = token; };
export const clearAccessToken = ()      => { _accessToken = null;  };
export const getAccessToken  = ()       => _accessToken;



// ── Axios Instance for Payments API ──────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_PAYMENTS_API_URL || '/api/payments',
  withCredentials: true,    // Required: sends HttpOnly refresh cookie on refresh calls
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request Interceptor: Inject Access Token ──────────────────────────────────
// Runs before every outgoing API request.
// Attaches the Bearer token from memory — never from localStorage.
api.interceptors.request.use(
  (config) => {
    if (_accessToken) {
      config.headers.Authorization = `Bearer ${_accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: Silent Token Refresh on 401 ─────────────────────────
// When a 401 Unauthorized response is received:
//  1. The interceptor triggers a background call to Auth service /refresh.
//  2. The browser automatically attaches the HttpOnly refresh cookie.
//  3. Auth validates the refresh token and returns a new short-lived access token.
//  4. The interceptor stores it in memory and retries the original failed request.
//  5. The user never sees a redirect or loses their checkout state.
let _isRefreshing = false;
let _pendingQueue = []; // Queues requests that arrive while refresh is in-flight

const processPendingQueue = (error, token = null) => {
  _pendingQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token);
  });
  _pendingQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const isUnauthorized = error?.response?.status === 401;
    const isRetry        = originalRequest._retry;

    if (isUnauthorized && !isRetry) {
      // If a refresh is already in progress, queue this request
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _pendingQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      _isRefreshing = true;

      try {
        // Call Auth service refresh — HttpOnly cookie is sent automatically
        const refreshRes = await axios.post(
          (import.meta.env.VITE_AUTH_API_URL || '/api/auth') + '/refresh',
          {},
          { withCredentials: true }
        );

        const newToken = refreshRes.data?.accessToken;
        setAccessToken(newToken);
        processPendingQueue(null, newToken);

        // Retry original failed request with new token
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token also expired or revoked → session truly ended
        processPendingQueue(refreshError, null);
        clearAccessToken();

        return Promise.reject(refreshError);
      } finally {
        _isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

