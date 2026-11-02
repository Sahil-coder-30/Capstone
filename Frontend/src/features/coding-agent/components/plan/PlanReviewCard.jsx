import { useCallback, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { usePlanReview } from '../../Hooks/usePlanReview';
import Notice from '../shared/Notice';
import PlanStepItem from './PlanStepItem';
import './PlanReviewCard.scss';

const isMac = /mac/i.test(navigator.platform);
const SHORTCUT = isMac ? '⌘↵' : 'Ctrl+↵';

/** Docked above the composer while the run waits for approval. */
export default function PlanReviewCard({ planReview, approvePlan, rejectPlan, panelRef, onOpenFile }) {
  const review = usePlanReview({ approvePlan, rejectPlan, panelRef });
  const [openStepIds, setOpenStepIds] = useState(() => new Set());

  const toggleStep = useCallback((stepId) => {
    setOpenStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const { plan, warnings, taskSubType } = planReview;
  const steps = plan?.steps || [];

  return (
    <section className="orion-plan-card" aria-label="Plan review">
      <header className="orion-plan-card__header">
        <h2 className="orion-plan-card__title">Review plan</h2>
        <span className="orion-plan-card__meta">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          {taskSubType && ` · ${taskSubType.replace(/_/g, ' ')}`}
        </span>
      </header>

      <div className="orion-plan-card__scroll">
        {plan?.summary && <p className="orion-plan-card__summary">{plan.summary}</p>}
        {warnings?.map((warning) => <Notice key={warning} variant="warning">{warning}</Notice>)}
        <ol className="orion-plan-card__steps">
          {steps.map((step, index) => (
            <PlanStepItem
              key={step.id ?? index}
              step={step}
              number={index + 1}
              isOpen={openStepIds.has(step.id)}
              onToggle={toggleStep}
              onOpenFile={onOpenFile}
            />
          ))}
        </ol>
      </div>

      {review.isFeedbackOpen ? (
        <div className="orion-plan-card__feedback">
          <textarea
            className="orion-plan-card__textarea"
            aria-label="What should change in this plan?"
            placeholder="What should change in this plan?"
            value={review.feedback}
            onChange={(e) => review.setFeedback(e.target.value)}
            rows={2}
            autoFocus
          />
          <div className="orion-plan-card__actions">
            <button
              type="button"
              className="orion-plan-card__primary"
              onClick={review.submitFeedback}
              disabled={review.isSubmitting || !review.feedback.trim()}
            >
              {review.isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Send feedback
              <kbd className="orion-plan-card__kbd">{SHORTCUT}</kbd>
            </button>
            <button
              type="button"
              className="orion-plan-card__ghost"
              onClick={review.closeFeedback}
              disabled={review.isSubmitting}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="orion-plan-card__actions">
          <button
            type="button"
            className="orion-plan-card__primary"
            onClick={review.approve}
            disabled={review.isSubmitting}
          >
            {review.isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Approve
            <kbd className="orion-plan-card__kbd">{SHORTCUT}</kbd>
          </button>
          <button
            type="button"
            className="orion-plan-card__ghost"
            onClick={review.openFeedback}
            disabled={review.isSubmitting}
          >
            Request changes
          </button>
        </div>
      )}
    </section>
  );
}
