import './IconButton.scss';

/** Square icon button. `label` is the tooltip and the accessible name. */
export default function IconButton({ label, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`orion-icon-button ${className}`.trim()}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
