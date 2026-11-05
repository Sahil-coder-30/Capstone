// sandboxAuth.js
// Credentials for calling a user's sandbox sidecar.
//
// The sidecar only accepts the sandbox owner's token. A user's access token
// expires after 15 minutes, but an Orion run can last an hour, so at the
// start of a run (and again when the user approves a plan) the AI service
// trades the user's token for a 2-hour sandbox token from Auth. That token
// works only for this user and this sandbox.
//
// Tokens live in memory, keyed by a credential key that the graph config
// carries (`configurable.credentialKey`). They are never put in graph state.

import axios from "axios";

const AUTH_SERVICE_URL = () => process.env.AUTH_SERVICE_URL?.trim() || "http://auth-service";

const credentials = new Map(); // credentialKey -> { token, sandboxId, expiresAt }

const codedError = (code, message) => Object.assign(new Error(message), { code });

/** Gets a sandbox token for the user and stores it under `credentialKey`. */
export async function issueSandboxCredential(credentialKey, { userToken, sandboxId }) {
  let res;
  try {
    res = await axios.post(
      `${AUTH_SERVICE_URL()}/api/auth/sandbox-token`,
      { sandboxId },
      { headers: { Authorization: `Bearer ${userToken}` }, timeout: 5_000 },
    );
  } catch (err) {
    const status = err.response?.status;
    throw codedError(
      "SANDBOX_AUTH_FAILED",
      status === 401 ? "Your session expired. Sign in again." : `Could not get sandbox access: ${err.message}`,
    );
  }
  const { token, expiresIn } = res.data || {};
  if (!token) throw codedError("SANDBOX_AUTH_FAILED", "Auth returned no sandbox token.");
  credentials.set(credentialKey, { token, sandboxId, expiresAt: Date.now() + (expiresIn || 0) * 1000 });
}

export const releaseSandboxCredential = (credentialKey) => credentials.delete(credentialKey);

/** The sandbox token for this graph call, or null. */
export function sandboxTokenFor(config) {
  const entry = credentials.get(config?.configurable?.credentialKey);
  if (!entry || entry.sandboxId !== config?.configurable?.sandboxId || entry.expiresAt <= Date.now()) return null;
  return entry.token;
}

/** Test hook. */
export const setSandboxCredentialForTesting = (credentialKey, sandboxId, token = "test-token") =>
  credentials.set(credentialKey, { token, sandboxId, expiresAt: Date.now() + 3_600_000 });
