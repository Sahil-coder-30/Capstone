import './EmptyState.scss';

export default function EmptyState({ icon: Icon, title, children, action, compact = false }) {
  return (
    <div className={`empty${compact ? ' empty--compact' : ''}`}>
      {Icon && <div className="empty__icon"><Icon size={18} aria-hidden="true" /></div>}
      {title && <strong className="empty__title">{title}</strong>}
      {children && <p className="empty__text">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
