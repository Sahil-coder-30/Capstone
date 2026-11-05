import './Panel.scss';

/** Card surface with an optional header row (title, description, action). */
export default function Panel({ title, description, action, children, className = '', flush = false, id }) {
  return (
    <section className={`panel${flush ? ' panel--flush' : ''} ${className}`} id={id}>
      {(title || action) && (
        <header className="panel__head">
          <div className="panel__heading">
            {title && <h2 className="panel__title">{title}</h2>}
            {description && <p className="panel__desc">{description}</p>}
          </div>
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}
