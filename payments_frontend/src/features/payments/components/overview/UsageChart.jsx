import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCompact, formatNumber, formatShortDate } from './format';

const METRIC_LABEL = { tokens: 'Tokens', requests: 'Requests', credits: 'Credits' };

/** Clean 1 / 2 / 2.5 / 5 x 10^n step, with the axis top just above the max. */
function niceScale(max, ticks = 5) {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  return { top: Math.ceil(max / step) * step, step };
}

/** Bar with a 4px rounded top and a square base on the baseline. */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export default function UsageChart({ data, metric, height = 300 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = useMemo(() => data.map((d) => d[metric]), [data, metric]);
  const { top, step } = niceScale(Math.max(0, ...values));

  const pad = { top: 12, right: 4, bottom: 26, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(28, slot - 2)); // 2px surface gap between bars
  const y = (v) => pad.top + innerH - (v / top) * innerH;

  const labelEvery = data.length > 60 ? 15 : data.length > 14 ? 5 : 1;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const hovered = hover != null ? data[hover] : null;
  const isEmpty = values.every((v) => v === 0);

  return (
    <div className="bo-chart" ref={wrapRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Daily ${METRIC_LABEL[metric].toLowerCase()} for the last ${data.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)}
              className={t === 0 ? 'bo-chart__baseline' : 'bo-chart__grid'}
            />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="bo-chart__tick">
              {formatCompact(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const v = d[metric];
          const x = pad.left + i * slot + (slot - barW) / 2;
          const h = innerH - (y(v) - pad.top);
          return (
            <g key={d.date}>
              <path
                d={barPath(x, y(v), barW, h)}
                className={`bo-chart__bar${hover != null && hover !== i ? ' is-dim' : ''}`}
              />
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="bo-chart__tick">
                  {formatShortDate(d.date)}
                </text>
              )}
              {/* Hit target: the full column, wider than the bar. */}
              <rect
                x={pad.left + i * slot} y={pad.top} width={slot} height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>

      {isEmpty && <div className="bo-chart__empty">No usage in this period yet.</div>}

      {hovered && (
        <div
          className="bo-chart__tooltip"
          style={{
            left: Math.min(width - 170, Math.max(0, pad.left + hover * slot + slot / 2 - 85)),
            top: Math.max(0, y(hovered[metric]) - 78),
          }}
        >
          <div className="bo-chart__tooltip-date">{formatShortDate(hovered.date)}</div>
          <div className="bo-chart__tooltip-row">
            <span>Tokens</span><strong>{formatNumber(hovered.tokens)}</strong>
          </div>
          <div className="bo-chart__tooltip-row">
            <span>Requests</span><strong>{formatNumber(hovered.requests)}</strong>
          </div>
          <div className="bo-chart__tooltip-row">
            <span>Credits</span><strong>{formatNumber(hovered.credits)}</strong>
          </div>
        </div>
      )}

      {/* Table view of the same data for screen readers. */}
      <table className="bo-sr-only">
        <caption>Daily usage</caption>
        <thead><tr><th>Date</th><th>Tokens</th><th>Requests</th><th>Credits</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.tokens}</td><td>{d.requests}</td><td>{d.credits}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
