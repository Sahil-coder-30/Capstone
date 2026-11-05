import './Segmented.scss';

/** Small toggle group. options: [{ id, label }] */
export default function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`seg__btn${value === o.id ? ' is-active' : ''}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <o.icon size={13} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
