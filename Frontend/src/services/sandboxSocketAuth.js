import { getAccessToken, refreshAccessToken } from './apiClient';

/**
 * socket.io `auth` option for sandbox sockets (terminal, file sync).
 * A function, so every reconnect sends the current access token.
 */
export const sandboxSocketAuth = (cb) => cb({ token: getAccessToken() });

/**
 * Call from `connect_error`. When the sidecar refused the token, refresh it
 * once and reconnect (socket.io does not retry middleware rejections itself).
 * Returns true when a retry was started.
 */
export const retryWithFreshToken = (socket, err) => {
  if (err?.message !== 'unauthorized' || socket.__tokenRetried) return false;
  socket.__tokenRetried = true;
  refreshAccessToken()
    .then(() => socket.connect())
    .catch(() => {});
  return true;
};

/** Call from `connect`: allow one refresh again after a good connection. */
export const resetTokenRetry = (socket) => {
  socket.__tokenRetried = false;
};
