import { useCallback, useEffect, useState } from 'react';

/** Focus inside the editor or terminal must not trigger the panel shortcut. */
const isFocusOutsidePanel = (panel) => {
  const active = document.activeElement;
  return Boolean(active) && active !== document.body && !panel?.contains(active);
};

/** Approve and request-changes flow for the plan review card. */
export function usePlanReview({ approvePlan, rejectPlan, panelRef }) {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openFeedback = useCallback(() => setIsFeedbackOpen(true), []);
  const closeFeedback = useCallback(() => setIsFeedbackOpen(false), []);

  const submit = useCallback(async (action) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await action();
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting]);

  const approve = useCallback(() => submit(approvePlan), [submit, approvePlan]);

  const submitFeedback = useCallback(() => {
    const text = feedback.trim();
    if (!text) return undefined;
    return submit(() => rejectPlan(text));
  }, [feedback, submit, rejectPlan]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (isFocusOutsidePanel(panelRef.current)) return;
        e.preventDefault();
        if (isFeedbackOpen) submitFeedback();
        else approve();
      } else if (e.key === 'Escape' && isFeedbackOpen) {
        setIsFeedbackOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [approve, isFeedbackOpen, panelRef, submitFeedback]);

  return {
    isFeedbackOpen,
    feedback,
    setFeedback,
    isSubmitting,
    openFeedback,
    closeFeedback,
    approve,
    submitFeedback,
  };
}
