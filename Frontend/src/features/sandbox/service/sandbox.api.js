import axios from 'axios';

/**
 * All requests use RELATIVE paths so the Vite dev server proxy
 * (and the Ingress in production) handles routing to the backend.
 */

export const startSandboxAPI = async () => {
  const response = await axios.post('/api/sandbox/start');
  return response.data;
};

export const checkSandboxHealthAPI = async (sandboxId) => {
  const response = await axios.get(`/api/sandbox/health/${sandboxId}`);
  return response.data;
};

export const stopSandboxAPI = async (sandboxId) => {
  const response = await axios.delete(`/api/sandbox/${sandboxId}`);
  return response.data;
};

/**
 * Ping the preview URL to check if the sandbox container is fully up.
 *
 * The preview runs on a subdomain like http://<sandboxId>.preview.localhost
 * which is a different origin → direct fetch would be blocked by CORS.
 *
 * Instead we route through the Vite proxy at /api/preview-ping which:
 *   1. Reads the X-Preview-Host header to know the target host
 *   2. Forwards the request and returns the upstream status code
 *
 * Returns true if the preview responded with a non-5xx status (i.e. it's up),
 * false if the container is still starting / proxy still returning 502/503/504.
 */
export const pingPreviewURL = async (previewUrl) => {
  try {
    const host = previewUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const res = await fetch('/api/preview-ping', {
      method: 'GET',
      headers: {
        'x-preview-host': host,
      },
      // Don't follow redirects — a redirect means the app IS up
      redirect: 'manual',
    });
    // 502/503/504 = ingress/proxy error = container not yet ready
    // 200, 301, 302, 404 = something responded = container is up
    return res.status !== 502 && res.status !== 503 && res.status !== 504 && res.status !== 0;
  } catch {
    return false;
  }
};
