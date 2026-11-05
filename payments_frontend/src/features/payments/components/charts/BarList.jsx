import { formatCompact } from '../../utils/format';
import './BarList.scss';

/**
 * Ranked horizontal bars for one measure (single hue). Values and labels stay
 * in text colors; the bar carries magnitude only.
 * items: [{ id, label, value, meta }]
 */
export default function BarList({ items, format = formatCompact, emptyText = 'No data yet.' }) {
  if (!items.length) return <p className="barlist__empty">{emptyText}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="barlist">
      {items.map((i) => (
        <li key={i.id}>
          <div className="barlist__row">
            <span className="barlist__name" title={i.label}>{i.label}</span>
            <span className="barlist__value">
              {i.meta && <span className="barlist__meta">{i.meta}</span>}
              {format(i.value)}
            </span>
          </div>
          <div className="barlist__track">
            <div className="barlist__fill" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
