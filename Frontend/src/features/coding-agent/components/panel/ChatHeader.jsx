import { CheckSquare2, History, SquarePen, Trash2, X } from 'lucide-react';
import IconButton from '../shared/IconButton';
import './ChatHeader.scss';

const STATE_LABELS = { ready: 'Ready', working: 'Working', waiting: 'Waiting for you', offline: 'Offline' };

/**
 * Chat history toggle, the open chat's title, run state and chat actions.
 * Turns into a toolbar in select mode. `onNewChat` is null while the open chat is already new.
 */
export default function ChatHeader({ state, title, selection, onToggleHistory, onNewChat, onClose }) {
  if (selection.isActive) {
    const { selectedIds, allSelected } = selection;
    return (
      <header className="orion-header">
        <span className="orion-header__count">{selectedIds.size} selected</span>
        <button type="button" className="orion-header__link" onClick={selection.toggleAll}>
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <div className="orion-header__actions">
          <IconButton
            label={`Delete ${selectedIds.size} selected`}
            className="orion-header__delete"
            onClick={selection.deleteSelected}
            disabled={selectedIds.size === 0}
          >
            <Trash2 size={13} />
          </IconButton>
          <IconButton label="Cancel selection" onClick={selection.toggleMode}>
            <X size={14} />
          </IconButton>
        </div>
      </header>
    );
  }

  return (
    <header className="orion-header">
      <IconButton label="Chat history" onClick={onToggleHistory}>
        <History size={14} />
      </IconButton>
      <h1 className="orion-header__title" title={title}>
        <span className="orion-header__brand">Orion</span>
        <span className="orion-header__chat">{title}</span>
      </h1>
      <span className={`orion-header__state orion-header__state--${state}`}>
        <span className="orion-header__dot" aria-hidden="true" />
        {STATE_LABELS[state]}
      </span>
      <div className="orion-header__actions">
        <IconButton label="New chat" onClick={onNewChat || undefined} disabled={!onNewChat}>
          <SquarePen size={14} />
        </IconButton>
        {selection.selectableCount > 0 && (
          <IconButton label="Select chats to delete" onClick={selection.toggleMode}>
            <CheckSquare2 size={14} />
          </IconButton>
        )}
        {onClose && (
          <IconButton label="Close Orion" onClick={onClose}>
            <X size={14} />
          </IconButton>
        )}
      </div>
    </header>
  );
}
