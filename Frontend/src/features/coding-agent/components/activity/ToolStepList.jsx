import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ToolStepRow from './ToolStepRow';
import './ToolStepList.scss';

/** Every tool call of a turn, folded to one line by default. */
export default function ToolStepList({ steps, onOpenFile }) {
  const [isOpen, setIsOpen] = useState(false);
  const failedCount = steps.filter((step) => step.status === 'error').length;

  return (
    <div className={`orion-tool-list ${isOpen ? 'orion-tool-list--open' : ''}`}>
      <button
        type="button"
        className="orion-tool-list__toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
        {failedCount > 0 && <span className="orion-tool-list__failed">{failedCount} failed</span>}
        <ChevronDown size={12} className="orion-tool-list__chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <ul className="orion-tool-list__rows">
          {steps.map((step) => <ToolStepRow key={step.id} step={step} onOpenFile={onOpenFile} />)}
        </ul>
      )}
    </div>
  );
}
