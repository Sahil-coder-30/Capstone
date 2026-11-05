import { formatCompact } from '../../utils/format';
import './SplitBar.scss';

/**
 * Two-part share bar with a legend that carries the numbers.
 * parts: [{ label, value }, { label, value }]
 */
export default function SplitBar({ parts, format = formatCompact }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  const first = pct(parts[0].value);

  return (
    <div className="splitbar">
      <div
        className="splitbar__bar"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${pct(p.value)}%`).join(', ')}
      >
        <div className="splitbar__seg series-1" style={{ width: `${first}%` }} />
        <div className="splitbar__seg series-2" style={{ width: `${100 - first}%` }} />
      </div>
      <ul className="splitbar__legend">
        {parts.map((p, i) => (
          <li key={p.label}>
            <span className={`swatch series-${i + 1}`} />
            <span className="splitbar__name">{p.label}</span>
            <span className="splitbar__pct">{i === 0 ? first : 100 - first}%</span>
            <span className="splitbar__val">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
