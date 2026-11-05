import './Kpi.scss';

/** A strip of stat tiles separated by hairlines. */
export function KpiGrid({ children, cols = 4 }) {
  return <div className={`kpis kpis--${cols}`}>{children}</div>;
}

export function Kpi({ label, value, unit, foot, icon: Icon, children }) {
  return (
    <div className="kpi">
      <span className="kpi__label">
        {Icon && <Icon size={14} aria-hidden="true" />}
        {label}
      </span>
      <span className="kpi__value">
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </span>
      {children}
      {foot && <span className="kpi__foot">{foot}</span>}
    </div>
  );
}

/** "▲ 12% vs previous 15 days". Direction is shown by arrow + sign, not color alone. */
export function Delta({ value, suffix }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className="delta">
      <span className={`delta__value ${up ? 'is-up' : 'is-down'}`}>
        {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
      </span>
      {suffix && <span> {suffix}</span>}
    </span>
  );
}
