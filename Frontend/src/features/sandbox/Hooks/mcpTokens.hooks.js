import { useCallback, useEffect, useState } from 'react';
import { createMcpTokenAPI, listMcpTokensAPI, revokeMcpTokenAPI } from '../service/sandbox.api';

const messageOf = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

/**
 * MCP tokens of one project, for the "Connect your own agent" panel.
 * `newToken` holds a just-created token: the server shows it only once.
 */
export function useMcpTokens(projectId, { enabled = true } = {}) {
  const [tokens, setTokens] = useState([]);
  const [mcpUrl, setMcpUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newToken, setNewToken] = useState(null);

  const applyList = (data) => {
    setTokens(data.tokens || []);
    setMcpUrl(data.mcpUrl || '');
  };

  // Initial load: state is only set after the request, and not after unmount.
  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;
    listMcpTokensAPI(projectId)
      .then((data) => { if (!cancelled) applyList(data); })
      .catch((err) => { if (!cancelled) setError(messageOf(err, 'Could not load tokens')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, projectId]);

  const refresh = useCallback(async () => {
    try {
      applyList(await listMcpTokensAPI(projectId));
    } catch (err) {
      setError(messageOf(err, 'Could not load tokens'));
    }
  }, [projectId]);

  const create = useCallback(async (input) => {
    setError(null);
    try {
      const data = await createMcpTokenAPI(projectId, input);
      setNewToken({ token: data.token, name: data.record?.name });
      setMcpUrl(data.mcpUrl || mcpUrl);
      await refresh();
      return true;
    } catch (err) {
      setError(messageOf(err, 'Could not create the token'));
      return false;
    }
  }, [projectId, mcpUrl, refresh]);

  const revoke = useCallback(async (tokenId) => {
    setError(null);
    try {
      await revokeMcpTokenAPI(projectId, tokenId);
      setTokens((list) => list.filter((t) => t.id !== tokenId));
    } catch (err) {
      setError(messageOf(err, 'Could not revoke the token'));
    }
  }, [projectId]);

  return { tokens, mcpUrl, loading, error, newToken, clearNewToken: () => setNewToken(null), create, revoke, refresh };
}
