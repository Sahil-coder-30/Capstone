import { useMemo, useState } from 'react';
import { CalendarDays, CloudOff, Coins, Gauge, Hash, Activity, TrendingUp, RefreshCw } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Segmented from '../ui/Segmented';
import EmptyState from '../ui/EmptyState';
import Table from '../ui/Table';
import Pagination from '../ui/Pagination';
import { Kpi, KpiGrid, Delta } from '../ui/Kpi';
import { KpiSkeleton, PanelSkeleton, TableSkeleton } from '../ui/Skeleton';
import BarChart from '../charts/BarChart';
import TokenLimitPanel from './TokenLimitPanel';
import BreakdownTable from './BreakdownTable';
import RequestSizePanel from './RequestSizePanel';
import { usePayments } from '../../Hooks/payments.hooks';
import { useQueries } from '../../Hooks/payments.queries';
import { useLastValue } from '../../Hooks/common.hooks';
import { agentLabel, fillTimeline, groupEvents, halfDelta, peakDay, sum } from '../../utils/stats';
import { capitalize, formatCompact, formatDate, formatNumber, formatShortDate, shortModel } from '../../utils/format';
import './UsagePage.scss';

const RANGES = [7, 30, 90].map((d) => ({ id: d, label: `${d} days` }));
const PAGE = 10;

export default function UsagePage() {
  const { analyticsFor, usageSample } = usePayments();
  const [range, setRange] = useState(30);
  const [page, setPage] = useState(1);

  const main = useQueries([`analytics:${range}`]);
  const sample = useQueries(['sample']);
  // While another range loads, keep the last one on screen instead of skeletons.
  const usageAnalytics = useLastValue(analyticsFor(range));

  const days = useMemo(() => fillTimeline(usageAnalytics?.timeline || [], range), [usageAnalytics, range]);
  const totals = usageAnalytics?.totals || {};
  const peak = peakDay(days, 'tokens');
  const activeDays = days.filter((d) => d.requests > 0).length;
  const usedDays = useMemo(() => [...days].reverse().filter((d) => d.requests > 0 || d.tokens > 0), [days]);
  const pageRows = usedDays.slice((page - 1) * PAGE, page * PAGE);

  const agents = (usageAnalytics?.byAgent || []).map((a) => ({
    id: a.agentType, label: agentLabel(a.agentType), requests: a.requestCount || 0, tokens: a.totalTokens || 0,
  }));
  const providers = (usageAnalytics?.byProvider || []).map((p) => ({
    id: p.company, label: capitalize(p.company), requests: p.requestCount || 0, tokens: p.totalTokens || 0,
  }));
  const models = groupEvents(usageSample.events, 'modelId', shortModel)
    .map((m) => ({ id: m.id, label: m.label, requests: m.requests, tokens: m.tokens }));

  const changeRange = (r) => { setRange(r); setPage(1); };

  return (
    <div className="usage">
      <PageHeader
        title="Usage analytics"
        description="How much AI you used, when, and through which agents and models."
        actions={(
          <>
            <Segmented label="Time range" options={RANGES} value={range} onChange={changeRange} />
            <Button variant="ghost" icon={RefreshCw} loading={main.pending || sample.pending} onClick={() => { main.reload(); sample.reload(); }} aria-label="Refresh" />
          </>
        )}
      />

      {main.error && !usageAnalytics ? (
        <Panel>
          <EmptyState icon={CloudOff} title="Could not load usage data" action={<Button variant="primary" icon={RefreshCw} onClick={main.reload}>Try again</Button>}>
            The payments service did not respond. Your usage is still being recorded.
          </EmptyState>
        </Panel>
      ) : !usageAnalytics ? (
        <>
          <KpiSkeleton count={6} cols={6} />
          <div className="grid grid--2-1"><PanelSkeleton height={300} /><PanelSkeleton variant="list" /></div>
        </>
      ) : (
        <>
          <KpiGrid cols={6}>
            <Kpi icon={Hash} label="Tokens" value={formatCompact(totals.totalTokens)} foot={<Delta value={halfDelta(days, 'tokens')} suffix="vs first half" />} />
            <Kpi icon={Activity} label="Requests" value={formatNumber(totals.totalRequests)} foot={<Delta value={halfDelta(days, 'requests')} suffix="vs first half" />} />
            <Kpi icon={Coins} label="Credits used" value={formatNumber(totals.totalCreditsDeducted)} foot={`${formatNumber(Math.round((totals.totalCreditsDeducted || 0) / range))} per day`} />
            <Kpi icon={Gauge} label="Tokens per day" value={formatCompact(sum(days, 'tokens') / range)} foot="Daily average" />
            <Kpi icon={TrendingUp} label="Peak day" value={peak ? formatCompact(peak.tokens) : '—'} foot={peak ? formatDate(peak.date) : 'No usage yet'} />
            <Kpi icon={CalendarDays} label="Active days" value={activeDays} unit={`/ ${range}`} foot={`${Math.round((activeDays / range) * 100)}% of days`} />
          </KpiGrid>

          <div className="grid grid--2-1">
            <Panel
              title="Tokens per day"
              description="Prompt (input) and completion (output) tokens"
              action={(
                <div className="chart-legend">
                  <span><i className="swatch series-1" /> Prompt</span>
                  <span><i className="swatch series-2" /> Completion</span>
                </div>
              )}
            >
              <BarChart
                data={days.map((d) => ({ ...d, id: d.date }))}
                series={[
                  { key: 'prompt', label: 'Prompt', className: 'series-1' },
                  { key: 'completion', label: 'Completion', className: 'series-2' },
                ]}
                xLabel={(d) => formatShortDate(d.date)}
                tooltip={(d) => [
                  ['Prompt', formatNumber(d.prompt), 'series-1'],
                  ['Completion', formatNumber(d.completion), 'series-2'],
                  ['Requests', formatNumber(d.requests)],
                  ['Credits', formatNumber(d.credits)],
                ]}
                height={300}
                ariaLabel="Prompt and completion tokens per day"
              />
            </Panel>
            <TokenLimitPanel days={days} />
          </div>

          <div className="grid grid--2">
            <Panel title="By agent" description={`Last ${range} days`} flush>
              <BreakdownTable rows={agents} firstLabel="Agent" emptyText="No agent usage in this period." />
            </Panel>
            <Panel title="By model" description={`Last ${formatNumber(usageSample.events.length)} requests`} flush>
              {sample.loading ? <TableSkeleton rows={4} cols={4} /> : (
                <BreakdownTable rows={models} firstLabel="Model" emptyText="No model usage yet." />
              )}
            </Panel>
          </div>

          <div className="grid grid--2-1">
            <Panel title="Daily breakdown" description="Days with AI usage, newest first" flush>
              {usedDays.length === 0 ? (
                <p className="usage__empty">No usage in this period.</p>
              ) : (
                <>
                  <Table
                    caption="Daily usage"
                    columns={[
                      { key: 'd', label: 'Date' },
                      { key: 'r', label: 'Requests', align: 'right' },
                      { key: 'p', label: 'Prompt', align: 'right', hideBelow: 'sm' },
                      { key: 'c', label: 'Completion', align: 'right', hideBelow: 'sm' },
                      { key: 't', label: 'Total tokens', align: 'right' },
                      { key: 'cr', label: 'Credits', align: 'right' },
                    ]}
                  >
                    {pageRows.map((d) => (
                      <tr key={d.date}>
                        <td className="cell-dim">{formatDate(d.date)}</td>
                        <td className="cell-num">{formatNumber(d.requests)}</td>
                        <td className="cell-num hide-sm">{formatNumber(d.prompt)}</td>
                        <td className="cell-num hide-sm">{formatNumber(d.completion)}</td>
                        <td className="cell-num">{formatNumber(d.tokens)}</td>
                        <td className="cell-num">{formatNumber(d.credits)}</td>
                      </tr>
                    ))}
                  </Table>
                  <Pagination page={page} totalPages={Math.ceil(usedDays.length / PAGE)} total={usedDays.length} pageSize={PAGE} onChange={setPage} />
                </>
              )}
            </Panel>
            <div className="usage__stack">
              <Panel title="By provider" description={`Last ${range} days`} flush>
                <BreakdownTable rows={providers} firstLabel="Provider" emptyText="No provider usage in this period." />
              </Panel>
              <RequestSizePanel events={usageSample.events} loading={sample.loading} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
