import { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import './PlanStepItem.scss';

const getAction = (step) => (step.action || 'modify').toLowerCase();

/** One proposed step. The row opens to show what it will do and how it is checked. */
function PlanStepItem({ step, number, isOpen, onToggle, onOpenFile }) {
  const risk = (step.riskLevel || 'medium').toLowerCase();

  return (
    <li className={`orion-plan-step ${isOpen ? 'orion-plan-step--open' : ''}`}>
      <button type="button" className="orion-plan-step__row" onClick={() => onToggle(step.id)} aria-expanded={isOpen}>
        <span className="orion-plan-step__number">{number}</span>
        <span className="orion-plan-step__title">{step.title}</span>
        <span className="orion-plan-step__action">{getAction(step)}</span>
        <span className={`orion-plan-step__risk orion-plan-step__risk--${risk}`} title={`${risk} risk`} />
        <ChevronDown size={12} className="orion-plan-step__chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="orion-plan-step__details">
          {step.description && <p className="orion-plan-step__description">{step.description}</p>}

          {step.activeFiles?.length > 0 && (
            <div className="orion-plan-step__files">
              {step.activeFiles.map((file) => (
                <button key={file} type="button" className="orion-plan-step__file" onClick={() => onOpenFile(file)}>
                  {file}
                </button>
              ))}
            </div>
          )}

          {step.acceptanceCriteria?.length > 0 && (
            <ul className="orion-plan-step__criteria">
              {step.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default memo(PlanStepItem);
