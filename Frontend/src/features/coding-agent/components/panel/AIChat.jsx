import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSandbox } from '../../../sandbox/Hooks/sandbox.hooks';
import { useChatSessions } from '../../../chat-history/Hooks/useChatSessions';
import ChatHistorySidebar from '../../../chat-history/components/ChatHistorySidebar';
import { useCodingAgent } from '../../Hooks/codingAgent.hooks';
import { useAgentWorkspace } from '../../Hooks/useAgentWorkspace';
import { useAutoScroll } from '../../Hooks/useAutoScroll';
import { useRunSelection } from '../../Hooks/useRunSelection';
import { buildRuns, getPanelState, isEmptyChat } from '../../utils/runs.utils';
import Composer from '../composer/Composer';
import MessageList from '../conversation/MessageList';
import PlanReviewCard from '../plan/PlanReviewCard';
import Notice from '../shared/Notice';
import ChatHeader from './ChatHeader';
import EmptyState from './EmptyState';
import './AIChat.scss';

const LIVE_POLL_MS = 10_000;
const TITLE_REFRESH_MS = 5_000; // the memory agent names a new chat a few seconds after a run

/**
 * Orion panel shell. It wires hooks to components and holds no UI logic.
 * useCodingAgent and useChatSessions must be called only here: they own the
 * SSE stream and the chat list, and a second call would duplicate them.
 */
export default function AIChat({ projectId, onCloseChat }) {
  const panelRef = useRef(null);
  const composerRef = useRef(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const { sandboxId, status } = useSandbox();
  const chats = useChatSessions('codingAgent', projectId);
  const { activeSessionId, liveSessionId, refresh, setLive, adoptSession, selectSession, startNewChat } = chats;

  const handleLiveChange = useCallback((sessionId) => {
    setLive(sessionId);
    if (!sessionId) setTimeout(refresh, TITLE_REFRESH_MS);
  }, [setLive, refresh]);

  const {
    messages, isStreaming, isHistoryLoading, error, planReview,
    approvePlan, rejectPlan, sendMessage, stopAgent, deleteMessages,
  } = useCodingAgent(projectId, {
    sessionId: activeSessionId,
    sessionsReady: chats.isReady,
    onSession: adoptSession,
    onLiveChange: handleLiveChange,
  });

  const runs = useMemo(() => buildRuns(messages), [messages]);
  const { scrollRef, resetScroll } = useAutoScroll(messages, isStreaming);
  const selection = useRunSelection(runs, deleteMessages);
  const { files, openFile, readFile, refreshAfterRun } = useAgentWorkspace({
    projectId,
    sandboxId,
    status,
    isHistoryLoading,
    sendMessage,
  });

  // One run per project: while it works in another chat, this one waits.
  const isBusyElsewhere = Boolean(liveSessionId && liveSessionId !== activeSessionId);
  useEffect(() => {
    if (!isBusyElsewhere) return undefined;
    const timer = setInterval(refresh, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [isBusyElsewhere, refresh]);

  const handleSend = useCallback((text, attachments) => {
    resetScroll();
    sendMessage(text, attachments, refreshAfterRun);
  }, [resetScroll, sendMessage, refreshAfterRun]);

  const handlePickPrompt = useCallback((prompt) => composerRef.current?.setDraft(prompt), []);
  const handleRetry = useCallback((goal) => handleSend(goal, []), [handleSend]);
  const handleDeleteRun = useCallback((ids) => deleteMessages(ids), [deleteMessages]);

  const openSession = useCallback((sessionId) => {
    selectSession(sessionId);
    setIsHistoryOpen(false);
    resetScroll();
  }, [selectSession, resetScroll]);

  const handleNewChat = useCallback(() => {
    startNewChat();
    setIsHistoryOpen(false);
    resetScroll();
  }, [startNewChat, resetScroll]);

  // Errors outside a turn, such as a failed plan approval, would otherwise never show.
  const turnError = runs[runs.length - 1]?.assistant?.error;
  const panelError = error && error !== turnError ? error : null;

  const isOffline = status !== 'running';
  const isBusy = isStreaming || Boolean(planReview) || isBusyElsewhere;
  const showEmptyState = !isHistoryLoading && isEmptyChat(runs);

  return (
    <div className="orion-panel" ref={panelRef}>
      <ChatHeader
        state={getPanelState({ isOffline, isStreaming, planReview })}
        title={chats.activeSession?.title || 'New chat'}
        selection={selection}
        onToggleHistory={() => setIsHistoryOpen((open) => !open)}
        onNewChat={activeSessionId ? handleNewChat : null}
        onClose={onCloseChat}
      />

      <MessageList
        runs={runs}
        scrollRef={scrollRef}
        empty={showEmptyState ? <EmptyState onPickPrompt={handlePickPrompt} showPrompts={!isOffline && !isBusyElsewhere} /> : null}
        isStreaming={isStreaming}
        planReview={planReview}
        selection={selection}
        onOpenFile={openFile}
        onEdit={handlePickPrompt}
        onRetry={isOffline || isBusy ? null : handleRetry}
        onDelete={isBusy ? null : handleDeleteRun}
      />

      {panelError && (
        <div className="orion-panel__notice">
          <Notice variant="error">{panelError}</Notice>
        </div>
      )}

      {isBusyElsewhere && (
        <div className="orion-panel__notice">
          <Notice variant="warning">
            Orion is working in another chat.{' '}
            <button type="button" className="orion-panel__link" onClick={() => openSession(liveSessionId)}>Open it</button>
          </Notice>
        </div>
      )}

      {planReview && (
        <PlanReviewCard
          planReview={planReview}
          approvePlan={approvePlan}
          rejectPlan={rejectPlan}
          panelRef={panelRef}
          onOpenFile={openFile}
        />
      )}

      <Composer
        ref={composerRef}
        files={files}
        readFile={readFile}
        onSend={handleSend}
        onStop={stopAgent}
        isStreaming={isStreaming}
        isPaused={Boolean(planReview)}
        isOffline={isOffline}
        isBusyElsewhere={isBusyElsewhere}
      />

      {isHistoryOpen && (
        <ChatHistorySidebar
          sessions={chats.sessions}
          activeSessionId={activeSessionId}
          liveSessionId={liveSessionId}
          hasMore={chats.hasMore}
          isLoading={chats.isLoading}
          onSelect={openSession}
          onNewChat={handleNewChat}
          onRename={chats.rename}
          onDelete={chats.remove}
          onLoadMore={chats.loadMore}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}
    </div>
  );
}
