import './Meter.scss';

/** Thin progress bar. tone: brand | neutral | warn | bad */
export default function Meter({ value, max, tone = 'brand', label, size = 'md' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`meter meter--${size}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={`meter__fill meter__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
