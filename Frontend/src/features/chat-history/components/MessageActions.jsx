import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import './MessageActions.scss';

function ActionButton({ label, icon: Icon, onClick, danger = false }) {
  return (
    <button
      type="button"
      className={`message-actions__button${danger ? ' message-actions__button--danger' : ''}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon size={12} />
    </button>
  );
}

/**
 * Small toolbar under a message, shown on hover and on keyboard focus.
 * Each action shows only when it has a handler (`copyText` for Copy).
 * Delete asks for confirmation first.
 */
export default function MessageActions({ copyText, onEdit, onRetry, onDelete, align = 'start' }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('[MessageActions] Copy failed:', err);
    }
  };

  if (confirming) {
    return (
      <div className={`message-actions message-actions--${align} message-actions--open`} role="group" aria-label="Confirm delete">
        <span className="message-actions__confirm">Delete this message?</span>
        <button type="button" className="message-actions__yes" onClick={() => { setConfirming(false); onDelete(); }}>Delete</button>
        <button type="button" className="message-actions__no" onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    );
  }

  return (
    <div className={`message-actions message-actions--${align}`} role="toolbar" aria-label="Message actions">
      {copyText && <ActionButton label={copied ? 'Copied' : 'Copy'} icon={copied ? Check : Copy} onClick={copy} />}
      {onEdit && <ActionButton label="Edit" icon={Pencil} onClick={onEdit} />}
      {onRetry && <ActionButton label="Retry" icon={RotateCcw} onClick={onRetry} />}
      {onDelete && <ActionButton label="Delete" icon={Trash2} onClick={() => setConfirming(true)} danger />}
    </div>
  );
}
