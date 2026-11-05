import './PageHeader.scss';

export default function PageHeader({ title, description, actions, children }) {
  return (
    <header className="pagehead">
      <div className="pagehead__text">
        <h1 className="pagehead__title">{title}</h1>
        {description && <p className="pagehead__desc">{description}</p>}
      </div>
      {actions && <div className="pagehead__actions">{actions}</div>}
      {children}
    </header>
  );
}
