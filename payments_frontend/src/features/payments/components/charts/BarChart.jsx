import { useEffect, useRef, useState } from 'react';
import { formatCompact } from '../../utils/format';
import './BarChart.scss';

/** Clean 1 / 2 / 2.5 / 5 x 10^n step, with the axis top just above the max. */
function niceScale(max, ticks = 4) {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  return { top: Math.ceil(max / step) * step, step };
}

/** Rect with only the top corners rounded (the data end); the base sits on the baseline. */
function topRounded(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Vertical bar chart. One series = plain bars; several = stacked with a 2px
 * surface gap between segments. Hover shows a tooltip; a hidden table carries
 * the same data for screen readers.
 *
 * data:    [{ id, ...values }]
 * series:  [{ key, label, className }]   className sets the fill color
 * xLabel:  (row) => string               axis + tooltip title
 * tooltip: (row) => [[label, value], ...] rows shown on hover
 */
export default function BarChart({
  data, series, xLabel, tooltip, height = 260, yFormat = formatCompact, labelEvery, ariaLabel,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = data.map((d) => series.reduce((a, s) => a + (Number(d[s.key]) || 0), 0));
  const { top, step } = niceScale(Math.max(0, ...totals));
  const pad = { top: 10, right: 4, bottom: 24, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(36, slot - 2));
  const y = (v) => pad.top + innerH - (v / top) * innerH;
  const every = labelEvery || Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 64))));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const isEmpty = totals.every((t) => t === 0);
  const hovered = hover != null ? data[hover] : null;

  return (
    <div className="chart" ref={wrapRef}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart__baseline' : 'chart__grid'} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart__tick">{yFormat(t)}</text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2;
          let acc = 0;
          const segs = series.map((s, si) => {
            const v = Number(d[s.key]) || 0;
            const y0 = y(acc);
            acc += v;
            const y1 = y(acc);
            const isTop = si === series.length - 1 || series.slice(si + 1).every((n) => !(Number(d[n.key]) > 0));
            // 2px gap between stacked segments.
            const h = Math.max(0, y0 - y1 - (si > 0 && v > 0 ? 2 : 0));
            return v > 0 ? (
              isTop
                ? <path key={s.key} d={topRounded(x, y1, barW, h, 4)} className={`chart__bar ${s.className || ''}`} />
                : <rect key={s.key} x={x} y={y1} width={barW} height={h} className={`chart__bar ${s.className || ''}`} />
            ) : null;
          });
          return (
            <g key={d.id} className={hover != null && hover !== i ? 'is-dim' : ''}>
              {segs}
              {i % every === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="chart__tick">{xLabel(d)}</text>
              )}
              <rect
                x={pad.left + i * slot} y={pad.top} width={slot} height={innerH}
                fill="transparent" onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>

      {isEmpty && <div className="chart__empty">No data in this period yet.</div>}

      {hovered && (
        <div
          className="chart__tooltip"
          style={{
            left: Math.min(width - 180, Math.max(0, pad.left + hover * slot + slot / 2 - 90)),
            top: Math.max(0, y(totals[hover]) - 24 - 22 * tooltip(hovered).length),
          }}
        >
          <div className="chart__tooltip-date">{xLabel(hovered, true)}</div>
          {tooltip(hovered).map(([k, v, swatch]) => (
            <div className="chart__tooltip-row" key={k}>
              <span>{swatch && <i className={`swatch ${swatch}`} />}{k}</span><strong>{v}</strong>
            </div>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead><tr><th>Label</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id}><td>{xLabel(d, true)}</td>{series.map((s) => <td key={s.key}>{d[s.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
