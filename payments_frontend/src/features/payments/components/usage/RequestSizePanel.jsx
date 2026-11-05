import Panel from '../ui/Panel';
import KeyValues from '../ui/KeyValues';
import { ListSkeleton } from '../ui/Skeleton';
import { formatNumber } from '../../utils/format';

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Size of individual requests, from the latest usage events. */
export default function RequestSizePanel({ events, loading }) {
  const totals = events.map((e) => Number(e.totalTokens) || 0);
  const n = Math.max(1, events.length);
  const avg = (key) => Math.round(events.reduce((a, e) => a + (Number(e[key]) || 0), 0) / n);

  return (
    <Panel title="Request size" description={`Tokens per request · last ${formatNumber(events.length)} requests`}>
      {loading ? <ListSkeleton rows={3} /> : (
        <KeyValues items={[
          ['Median request', formatNumber(median(totals))],
          ['Average prompt', formatNumber(avg('promptTokens'))],
          ['Average completion', formatNumber(avg('completionTokens'))],
          ['Largest request', formatNumber(totals.length ? Math.max(...totals) : 0)],
          ['Smallest request', formatNumber(totals.length ? Math.min(...totals) : 0)],
          ['Average credits', formatNumber(avg('creditsDeducted'))],
        ]}
        />
      )}
    </Panel>
  );
}
