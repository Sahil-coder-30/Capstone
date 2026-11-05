import './Skeleton.scss';

/** Shimmer block. Sizes accept any CSS length. */
export function Skeleton({ w = '100%', h = 12, r = 6, style }) {
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function KpiSkeleton({ count = 4, cols }) {
  return (
    <div className={`skel-kpis skel-kpis--${cols || count}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="skel-kpis__tile" key={i}>
          <Skeleton w="48%" h={11} />
          <Skeleton w="62%" h={24} />
          <Skeleton w="78%" h={10} />
        </div>
      ))}
    </div>
  );
}

const BAR_HEIGHTS = [42, 58, 35, 70, 52, 80, 46, 64, 38, 72, 55, 66, 44, 76, 50, 60, 36, 68, 48, 74];

/** Panel placeholder: a chart (default), a list of rows, or a table. */
export function PanelSkeleton({ variant = 'chart', height = 240, rows = 5 }) {
  return (
    <section className="skel-panel" aria-busy="true" aria-label="Loading">
      <div className="skel-panel__head">
        <Skeleton w={140} h={13} />
        <Skeleton w={220} h={10} />
      </div>
      {variant === 'chart' && (
        <div className="skel-panel__chart" style={{ height }}>
          {BAR_HEIGHTS.map((h, i) => <Skeleton key={i} h={`${h}%`} r={3} />)}
        </div>
      )}
      {variant === 'list' && (
        <div className="skel-panel__list">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i}>
              <div className="skel-panel__row">
                <Skeleton w={`${40 - (i % 3) * 6}%`} h={10} />
                <Skeleton w="14%" h={10} />
              </div>
              <Skeleton h={7} />
            </div>
          ))}
        </div>
      )}
      {variant === 'table' && <TableSkeleton rows={rows} />}
    </section>
  );
}

/** Bar-list placeholder without a card, for use inside an existing Panel. */
export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="skel-panel__list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <div className="skel-panel__row">
            <Skeleton w={`${44 - (i % 3) * 7}%`} h={10} />
            <Skeleton w="14%" h={10} />
          </div>
          <Skeleton h={7} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="skel-table" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div className="skel-table__row" key={r} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} w={`${50 + (((r + 1) * (c + 2) * 17) % 45)}%`} h={10} />
          ))}
        </div>
      ))}
    </div>
  );
}
