import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listSessionsAPI, renameSessionAPI, trashSessionAPI } from '../service/chatHistory.api';
import {
  removeSession,
  resetAgent,
  setActiveSession,
  setLiveSession,
  setLoading,
  setSessions,
  upsertSession,
} from '../slice/chatHistory.slice';

/**
 * Chat sessions of one agent in one project. Call it once per agent, in the
 * panel that owns the chat (AIChat for Orion, AppAgentFloat for Clio).
 */
export function useChatSessions(agentType, projectId) {
  const dispatch = useDispatch();
  const agent = useSelector((state) => state.chatHistory[agentType]);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    dispatch(resetAgent({ agentType, projectId }));
    listSessionsAPI(agentType, projectId)
      .then((data) => {
        if (cancelled) return;
        dispatch(setSessions({ agentType, sessions: data.sessions, hasMore: data.hasMore, liveSessionId: data.liveSessionId }));
        // Open the chat Orion is working in, else the latest chat.
        dispatch(setActiveSession({ agentType, sessionId: data.liveSessionId || data.sessions[0]?.id || null }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`[ChatHistory] Could not load ${agentType} chats:`, err);
        dispatch(setLoading({ agentType, isLoading: false }));
      });
    return () => { cancelled = true; };
  }, [agentType, projectId, dispatch]);

  const selectSession = useCallback(
    (sessionId) => dispatch(setActiveSession({ agentType, sessionId })),
    [agentType, dispatch],
  );

  const startNewChat = useCallback(() => selectSession(null), [selectSession]);

  /** The server opened a chat for the first message, or a run reported its chat. */
  const adoptSession = useCallback((session) => {
    dispatch(upsertSession({ agentType, session: { lastMessageAt: new Date().toISOString(), ...session } }));
    dispatch(setActiveSession({ agentType, sessionId: session.id }));
  }, [agentType, dispatch]);

  const setLive = useCallback(
    (sessionId) => dispatch(setLiveSession({ agentType, sessionId })),
    [agentType, dispatch],
  );

  const rename = useCallback(async (sessionId, title) => {
    const data = await renameSessionAPI(agentType, sessionId, title);
    dispatch(upsertSession({ agentType, session: data.session }));
  }, [agentType, dispatch]);

  const remove = useCallback(async (sessionId) => {
    await trashSessionAPI(agentType, sessionId);
    dispatch(removeSession({ agentType, sessionId }));
  }, [agentType, dispatch]);

  /** Reloads the first page in place: new titles from the memory agent, and which chat is live. */
  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await listSessionsAPI(agentType, projectId);
      dispatch(setSessions({ agentType, sessions: data.sessions, hasMore: data.hasMore, liveSessionId: data.liveSessionId }));
    } catch (err) {
      console.warn(`[ChatHistory] Could not refresh ${agentType} chats:`, err.message);
    }
  }, [agentType, dispatch, projectId]);

  const loadMore = useCallback(async () => {
    const last = agent.sessions[agent.sessions.length - 1];
    if (!projectId || !last || agent.isLoading) return;
    dispatch(setLoading({ agentType, isLoading: true }));
    try {
      const data = await listSessionsAPI(agentType, projectId, last.lastMessageAt);
      dispatch(setSessions({ agentType, sessions: data.sessions, hasMore: data.hasMore, append: true }));
    } catch (err) {
      console.error(`[ChatHistory] Could not load more ${agentType} chats:`, err);
      dispatch(setLoading({ agentType, isLoading: false }));
    }
  }, [agent.sessions, agent.isLoading, agentType, dispatch, projectId]);

  const activeSession = agent.sessions.find((s) => s.id === agent.activeSessionId) || null;

  return {
    ...agent,
    // Sessions of another project are never shown while the new list loads.
    isReady: agent.projectId === projectId && !(agent.isLoading && agent.sessions.length === 0),
    activeSession,
    selectSession,
    startNewChat,
    adoptSession,
    setLive,
    rename,
    remove,
    refresh,
    loadMore,
  };
}
