import './Table.scss';

/**
 * Data table with a sticky-looking header band and hairline rows.
 * columns: [{ key, label, align, hideBelow: 'sm' | 'md' }]
 * Rows are passed as children (<tr> elements) so each page owns its cells.
 */
export default function Table({ columns, children, onRowsClickable = false, caption }) {
  return (
    <div className="table-wrap">
      <table className={`table${onRowsClickable ? ' table--clickable' : ''}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.align === 'right' ? 'is-right' : ''} ${c.hideBelow ? `hide-${c.hideBelow}` : ''}`}
                scope="col"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
