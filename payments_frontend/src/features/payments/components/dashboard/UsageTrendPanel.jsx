import { useState } from 'react';
import Panel from '../ui/Panel';
import Segmented from '../ui/Segmented';
import BarChart from '../charts/BarChart';
import { peakDay, sum } from '../../utils/stats';
import { formatNumber, formatShortDate } from '../../utils/format';
import './UsageTrendPanel.scss';

const METRICS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'requests', label: 'Requests' },
  { id: 'credits', label: 'Credits' },
];

/** Daily usage bars with a metric switch and three summary numbers. */
export default function UsageTrendPanel({ days }) {
  const [metric, setMetric] = useState('tokens');
  const total = sum(days, metric);
  const peak = peakDay(days, metric);

  return (
    <Panel
      title="Usage trend"
      description={`Daily ${metric} across all agents`}
      action={<Segmented label="Metric" options={METRICS} value={metric} onChange={setMetric} />}
      className="trend"
    >
      <div className="trend__stats">
        <div><span>Total</span><strong>{formatNumber(total)}</strong></div>
        <div><span>Daily average</span><strong>{formatNumber(Math.round(total / Math.max(1, days.length)))}</strong></div>
        <div><span>Peak day</span><strong>{peak ? `${formatNumber(peak[metric])} · ${formatShortDate(peak.date)}` : '—'}</strong></div>
      </div>
      <BarChart
        data={days.map((d) => ({ ...d, id: d.date }))}
        series={[{ key: metric, label: METRICS.find((m) => m.id === metric).label, className: 'series-1' }]}
        xLabel={(d) => formatShortDate(d.date)}
        tooltip={(d) => [
          ['Tokens', formatNumber(d.tokens)],
          ['Requests', formatNumber(d.requests)],
          ['Credits', formatNumber(d.credits)],
        ]}
        height={280}
        ariaLabel={`Daily ${metric}`}
      />
    </Panel>
  );
}
