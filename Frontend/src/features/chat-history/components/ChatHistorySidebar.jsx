import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Search, SquarePen, Trash2, X } from 'lucide-react';
import './ChatHistorySidebar.scss';

const DAY = 24 * 60 * 60 * 1000;

const groupOf = (date, now) => {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const time = new Date(date).getTime();
  if (time >= startOfToday) return 'Today';
  if (time >= startOfToday - DAY) return 'Yesterday';
  if (time >= startOfToday - 7 * DAY) return 'Previous 7 days';
  return 'Older';
};

const timeLabel = (date) => {
  const d = new Date(date);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

function SessionItem({ session, isActive, isLive, onSelect, onRename, onDelete }) {
  const [mode, setMode] = useState('view'); // view | rename | confirm
  const [draft, setDraft] = useState(session.title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setMode('view');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submitRename = (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title || title === session.title) return setMode('view');
    return run(() => onRename(session.id, title));
  };

  if (mode === 'rename') {
    return (
      <li className="chat-history__item chat-history__item--editing">
        <form className="chat-history__rename" onSubmit={submitRename}>
          <input
            autoFocus
            className="chat-history__rename-input"
            aria-label="Chat name"
            value={draft}
            maxLength={80}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setDraft(session.title);
                setMode('view');
              }
            }}
          />
          <button type="submit" className="chat-history__icon" aria-label="Save name" disabled={busy}><Check size={13} /></button>
          <button type="button" className="chat-history__icon" aria-label="Cancel rename" onClick={() => setMode('view')}><X size={13} /></button>
        </form>
        {error && <p className="chat-history__error" role="alert">{error}</p>}
      </li>
    );
  }

  if (mode === 'confirm') {
    return (
      <li className="chat-history__item chat-history__item--confirm">
        <span className="chat-history__confirm-text">Delete “{session.title}”?</span>
        <button type="button" className="chat-history__confirm-yes" disabled={busy} onClick={() => run(() => onDelete(session.id))}>Delete</button>
        <button type="button" className="chat-history__confirm-no" onClick={() => setMode('view')}>Cancel</button>
        {error && <p className="chat-history__error" role="alert">{error}</p>}
      </li>
    );
  }

  return (
    <li className={`chat-history__item${isActive ? ' chat-history__item--active' : ''}`}>
      <button
        type="button"
        className="chat-history__open"
        aria-current={isActive ? 'true' : undefined}
        onClick={() => onSelect(session.id)}
      >
        {isLive && <span className="chat-history__live" title="Orion is working here" aria-label="Working" />}
        <span className="chat-history__title">{session.title}</span>
        <time className="chat-history__time">{timeLabel(session.lastMessageAt)}</time>
      </button>
      <span className="chat-history__actions">
        <button type="button" className="chat-history__icon" aria-label={`Rename ${session.title}`} onClick={() => { setDraft(session.title); setMode('rename'); }}>
          <Pencil size={12} />
        </button>
        <button
          type="button"
          className="chat-history__icon chat-history__icon--danger"
          aria-label={`Delete ${session.title}`}
          disabled={isLive}
          title={isLive ? 'Stop Orion before deleting this chat' : undefined}
          onClick={() => setMode('confirm')}
        >
          <Trash2 size={12} />
        </button>
      </span>
    </li>
  );
}

/**
 * Past chats of one agent: new chat, search, chats grouped by day, rename
 * and delete. Shown as an overlay inside the chat panel.
 */
export default function ChatHistorySidebar({
  sessions, activeSessionId, liveSessionId, hasMore, isLoading,
  onSelect, onNewChat, onRename, onDelete, onLoadMore, onClose,
}) {
  const [query, setQuery] = useState('');
  const [now] = useState(() => Date.now()); // the sidebar mounts fresh each time it opens
  const rootRef = useRef(null);

  useEffect(() => {
    rootRef.current?.querySelector('.chat-history__search-input')?.focus();
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map();
    for (const session of sessions) {
      if (q && !session.title.toLowerCase().includes(q)) continue;
      const group = groupOf(session.lastMessageAt, now);
      if (!out.has(group)) out.set(group, []);
      out.get(group).push(session);
    }
    return [...out.entries()];
  }, [sessions, query, now]);

  return (
    <div className="chat-history" role="dialog" aria-label="Chat history" ref={rootRef} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <button type="button" className="chat-history__backdrop" aria-label="Close chat history" tabIndex={-1} onClick={onClose} />
      <nav className="chat-history__panel">
        <header className="chat-history__header">
          <h2 className="chat-history__heading">Chats</h2>
          <button type="button" className="chat-history__icon" aria-label="Close chat history" onClick={onClose}><X size={14} /></button>
        </header>

        <button type="button" className="chat-history__new" onClick={onNewChat}>
          <SquarePen size={13} />
          New chat
        </button>

        <label className="chat-history__search">
          <Search size={12} aria-hidden="true" />
          <input
            className="chat-history__search-input"
            type="search"
            placeholder="Search chats"
            aria-label="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="chat-history__list">
          {groups.map(([group, items]) => (
            <section key={group} className="chat-history__group">
              <h3 className="chat-history__group-title">{group}</h3>
              <ul>
                {items.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    isLive={session.id === liveSessionId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </section>
          ))}

          {!isLoading && groups.length === 0 && (
            <p className="chat-history__empty">{query ? 'No chats match your search.' : 'No chats yet.'}</p>
          )}
          {isLoading && <p className="chat-history__empty">Loading chats…</p>}
          {hasMore && !isLoading && !query && (
            <button type="button" className="chat-history__more" onClick={onLoadMore}>Load older chats</button>
          )}
        </div>
      </nav>
    </div>
  );
}
