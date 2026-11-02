import { memo } from 'react';
import { Check } from 'lucide-react';
import AssistantTurn from './AssistantTurn';
import UserMessage from './UserMessage';
import './RunItem.scss';

/**
 * One task and its reply. Memoized so a streaming token re-renders only the live run:
 * immer keeps older message objects identical, so their props do not change.
 */
function RunItem({ id, goal, timestamp, assistant, turnState, canSelect, isSelected, onToggleSelect, onOpenFile }) {
  const classes = ['orion-run', canSelect && 'orion-run--selectable', isSelected && 'orion-run--selected'];

  return (
    <article className={classes.filter(Boolean).join(' ')} onClick={canSelect ? () => onToggleSelect(id) : undefined}>
      {canSelect && (
        <button
          type="button"
          className="orion-run__checkbox"
          role="checkbox"
          aria-checked={isSelected}
          aria-label="Select this task"
        >
          {isSelected && <Check size={10} strokeWidth={3} />}
        </button>
      )}
      <div className="orion-run__body">
        {goal !== null && <UserMessage text={goal} timestamp={timestamp} />}
        {assistant && <AssistantTurn assistant={assistant} turnState={turnState} onOpenFile={onOpenFile} />}
      </div>
    </article>
  );
}

export default memo(RunItem);
