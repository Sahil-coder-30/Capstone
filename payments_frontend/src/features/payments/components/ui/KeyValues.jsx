import './KeyValues.scss';

/** Label / value rows with hairlines. items: [[label, value], ...]; falsy items are skipped. */
export default function KeyValues({ items, dense = false }) {
  return (
    <dl className={`kv${dense ? ' kv--dense' : ''}`}>
      {items.filter(Boolean).map(([k, v]) => (
        <div className="kv__row" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
