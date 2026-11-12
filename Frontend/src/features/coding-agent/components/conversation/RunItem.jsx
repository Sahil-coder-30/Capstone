import { memo } from 'react';
import { Check } from 'lucide-react';
import MessageActions from '../../../chat-history/components/MessageActions';
import AssistantTurn from './AssistantTurn';
import UserMessage from './UserMessage';
import './RunItem.scss';

/**
 * One task and its reply. Memoized so a streaming token re-renders only the live run:
 * immer keeps older message objects identical, so their props do not change.
 * Delete removes the whole run (task and reply). Actions are off while a run is live.
 */
function RunItem({
  id, goal, timestamp, assistant, turnState, canSelect, isSelected, onToggleSelect, onOpenFile,
  showActions, onEdit, onRetry, onDelete,
}) {
  const classes = ['orion-run', canSelect && 'orion-run--selectable', isSelected && 'orion-run--selected'];
  const isLive = turnState === 'live' || turnState === 'paused';
  const withActions = showActions && !isLive;
  const ids = [id, assistant?.id].filter(Boolean);
  const deleteRun = onDelete && goal !== null ? () => onDelete(ids) : null;

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
        {goal !== null && (
          <div className="has-message-actions">
            <UserMessage text={goal} timestamp={timestamp} />
            {withActions && (
              <MessageActions
                align="end"
                copyText={goal}
                onEdit={onEdit ? () => onEdit(goal) : null}
                onDelete={deleteRun}
              />
            )}
          </div>
        )}
        {assistant && (
          <div className="has-message-actions">
            <AssistantTurn assistant={assistant} turnState={turnState} onOpenFile={onOpenFile} />
            {withActions && (
              <MessageActions
                copyText={assistant.text || assistant.error || ''}
                onRetry={onRetry && goal !== null ? () => onRetry(goal) : null}
                onDelete={deleteRun}
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(RunItem);
