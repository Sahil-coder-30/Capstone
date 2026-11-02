import { useCallback, useMemo, useRef } from 'react';
import { useSandbox } from '../../../sandbox/Hooks/sandbox.hooks';
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

/**
 * Orion panel shell. It wires hooks to components and holds no UI logic.
 * useCodingAgent must be called only here: it owns the SSE stream, and a second
 * call would open a second stream.
 */
export default function AIChat({ projectId, onCloseChat }) {
  const panelRef = useRef(null);
  const composerRef = useRef(null);

  const { sandboxId, status } = useSandbox();
  const {
    messages, isStreaming, isHistoryLoading, error, planReview,
    approvePlan, rejectPlan, sendMessage, stopAgent, clearChatHistory, deleteMessages,
  } = useCodingAgent(projectId);

  const runs = useMemo(() => buildRuns(messages), [messages]);
  const { scrollRef, resetScroll } = useAutoScroll(messages, isStreaming);
  const selection = useRunSelection(runs, deleteMessages);
  const { files, openFile, readFile, refreshAfterRun } = useAgentWorkspace({
    projectId,
    sandboxId,
    status,
    isHistoryLoading,
    sendMessage,
    clearChatHistory,
    onSessionReset: resetScroll,
  });

  const handleSend = useCallback((text, attachments) => {
    resetScroll();
    sendMessage(text, attachments, refreshAfterRun);
  }, [resetScroll, sendMessage, refreshAfterRun]);

  const handlePickPrompt = useCallback((prompt) => composerRef.current?.setDraft(prompt), []);

  // Errors outside a turn, such as a failed plan approval, would otherwise never show.
  const turnError = runs[runs.length - 1]?.assistant?.error;
  const panelError = error && error !== turnError ? error : null;

  const isOffline = status !== 'running';
  const showEmptyState = !isHistoryLoading && isEmptyChat(runs);

  return (
    <div className="orion-panel" ref={panelRef}>
      <ChatHeader state={getPanelState({ isOffline, isStreaming, planReview })} selection={selection} onClose={onCloseChat} />

      <MessageList
        runs={runs}
        scrollRef={scrollRef}
        empty={showEmptyState ? <EmptyState onPickPrompt={handlePickPrompt} showPrompts={!isOffline} /> : null}
        isStreaming={isStreaming}
        planReview={planReview}
        selection={selection}
        onOpenFile={openFile}
      />

      {panelError && (
        <div className="orion-panel__notice">
          <Notice variant="error">{panelError}</Notice>
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
      />
    </div>
  );
}
