import { useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CloudOff, Receipt, RefreshCw } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Segmented from '../ui/Segmented';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import KeyValues from '../ui/KeyValues';
import { KpiSkeleton, ListSkeleton, PanelSkeleton, TableSkeleton } from '../ui/Skeleton';
import BarChart from '../charts/BarChart';
import BarList from '../charts/BarList';
import SplitBar from '../charts/SplitBar';
import SubscriptionCard from '../shared/SubscriptionCard';
import CreditWindowCard from '../shared/CreditWindowCard';
import PaymentsTable from '../shared/PaymentsTable';
import DashboardKpis from './DashboardKpis';
import UsageTrendPanel from './UsageTrendPanel';
import ActivityList from './ActivityList';
import { usePayments } from '../../Hooks/payments.hooks';
import useLoad, { useNow } from '../../Hooks/useLoad';
import {
  agentLabel, byHour, byWeekday, fillTimeline, groupEvents, halfDelta, paymentStats, spendByMonth,
} from '../../utils/stats';
import {
  capitalize, formatCompact, formatDate, formatINR, formatNumber, formatPercent, formatRelative, greeting, shortModel,
} from '../../utils/format';
import './DashboardPage.scss';

const RANGES = [7, 30, 90].map((d) => ({ id: d, label: `${d}D` }));

function DashboardSkeleton() {
  return (
    <>
      <KpiSkeleton count={8} cols={4} />
      <div className="grid grid--2-1"><PanelSkeleton height={300} /><PanelSkeleton variant="list" rows={4} /></div>
      <div className="grid grid--3"><PanelSkeleton variant="list" /><PanelSkeleton variant="list" /><PanelSkeleton variant="list" /></div>
      <div className="grid grid--3"><PanelSkeleton height={180} /><PanelSkeleton height={180} /><PanelSkeleton height={180} /></div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useOutletContext();
  const {
    usageAnalytics, dashboardOverview, paymentHistory, usageSample, summary,
    loadDashboardOverview, loadUsageAnalytics, loadPaymentHistory, loadUsageSample, loadSummary,
  } = usePayments();
  const [range, setRange] = useState(30);
  const now = useNow();

  // Overview carries 30 days of analytics; other ranges replace it after.
  const loadCore = useCallback(async () => {
    const overview = await loadDashboardOverview();
    if (range !== 30) await loadUsageAnalytics(range);
    return overview;
  }, [range, loadDashboardOverview, loadUsageAnalytics]);
  const loadExtra = useCallback(
    () => Promise.all([loadPaymentHistory(), loadUsageSample(), loadSummary()]).then(([h]) => h),
    [loadPaymentHistory, loadUsageSample, loadSummary],
  );
  const core = useLoad(loadCore);
  const extra = useLoad(loadExtra);
  const refresh = () => { core.reload(); extra.reload(); };

  const days = useMemo(() => fillTimeline(usageAnalytics?.timeline || [], range), [usageAnalytics, range]);
  const totals = usageAnalytics?.totals || {};
  const deltas = { tokens: halfDelta(days, 'tokens'), requests: halfDelta(days, 'requests') };
  const txs = paymentHistory.transactions;
  const spend = useMemo(() => paymentStats(txs), [txs]);
  const events = usageSample.events;
  const models = useMemo(() => groupEvents(events, 'modelId', shortModel).slice(0, 5), [events]);
  const projects = useMemo(
    () => groupEvents(events, 'projectId', (id) => (id && id !== 'unknown' ? `Project ${String(id).slice(0, 8)}` : 'No project')).slice(0, 5),
    [events],
  );
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="dash">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={`Your plan, AI credits, usage and spending for the last ${range} days.`}
        actions={(
          <>
            <Segmented label="Time range" options={RANGES} value={range} onChange={setRange} />
            <Button variant="ghost" icon={RefreshCw} onClick={refresh} loading={core.refreshing || extra.refreshing}>
              {core.updatedAt && !core.error ? `Updated ${formatRelative(core.updatedAt, now)}` : 'Refresh'}
            </Button>
            <Button variant="primary" to="/plans" iconRight={ArrowUpRight}>Upgrade</Button>
          </>
        )}
      />

      {core.error && !dashboardOverview && (
        <Panel>
          <EmptyState
            icon={CloudOff}
            title="We could not load your billing data"
            action={<Button variant="primary" icon={RefreshCw} onClick={refresh}>Try again</Button>}
          >
            The payments service did not respond. Your plan and credits are safe; this only affects what this page can show.
          </EmptyState>
        </Panel>
      )}

      {core.error && dashboardOverview && (
        <div className="dash__alert">
          <Alert tone="warn" title="Could not load your latest data" action={<Button size="sm" onClick={refresh}>Try again</Button>}>
            The numbers below may be out of date.
          </Alert>
        </div>
      )}

      {core.error && !dashboardOverview ? null : core.loading ? <DashboardSkeleton /> : (
        <>
          <DashboardKpis range={range} totals={totals} days={days} deltas={deltas} spend={spend} />

          <div className="grid grid--2-1">
            <UsageTrendPanel days={days} />
            <CreditWindowCard />
          </div>

          <div className="grid grid--3">
            <SubscriptionCard />
            <Panel title="Usage by agent" description={`Tokens · last ${range} days`}>
              <BarList
                items={(usageAnalytics?.byAgent || []).map((a) => ({
                  id: a.agentType, label: agentLabel(a.agentType), value: a.totalTokens || 0, meta: `${formatNumber(a.requestCount)} req`,
                }))}
                emptyText="No agent usage in this period."
              />
            </Panel>
            <Panel title="Token mix" description="Input sent vs output generated">
              <div className="dash__mix">
                <SplitBar parts={[
                  { label: 'Prompt', value: Number(totals.promptTokens) || 0 },
                  { label: 'Completion', value: Number(totals.completionTokens) || 0 },
                ]}
                />
                <KeyValues items={[
                  ['Requests', formatNumber(totals.totalRequests)],
                  ['Credits used', formatNumber(totals.totalCreditsDeducted)],
                  ['Providers', (usageAnalytics?.byProvider || []).map((p) => capitalize(p.company)).join(', ') || '—'],
                ]}
                />
              </div>
            </Panel>
          </div>

          <h2 className="section-title">Patterns</h2>
          <div className="grid grid--3">
            {extra.loading ? <PanelSkeleton height={190} /> : (
              <Panel title="Spending by month" description="Paid amount, last 6 months">
                <BarChart
                  data={spendByMonth(txs).map((m) => ({ ...m, id: m.key }))}
                  series={[{ key: 'value', label: 'Paid', className: 'series-1' }]}
                  xLabel={(m) => m.label}
                  yFormat={(v) => `₹${formatCompact(v)}`}
                  tooltip={(m) => [['Paid', formatINR(m.value)], ['Payments', m.count]]}
                  height={200}
                  ariaLabel="Spending by month"
                />
              </Panel>
            )}
            {extra.loading ? <PanelSkeleton height={190} /> : (
              <Panel title="Activity by hour" description={`Requests by local hour · last ${formatNumber(events.length)} requests`}>
                <BarChart
                  data={byHour(events).map((h) => ({ ...h, id: h.label }))}
                  series={[{ key: 'value', label: 'Requests', className: 'series-1' }]}
                  xLabel={(h, full) => (full ? `${h.label}:00 – ${h.label}:59` : `${h.label}h`)}
                  tooltip={(h) => [['Requests', formatNumber(h.value)]]}
                  labelEvery={6}
                  height={200}
                  ariaLabel="Requests by hour of day"
                />
              </Panel>
            )}
            <Panel title="Activity by weekday" description={`Requests · last ${range} days`}>
              <BarChart
                data={byWeekday(days, 'requests').map((w) => ({ ...w, id: w.label }))}
                series={[{ key: 'value', label: 'Requests', className: 'series-1' }]}
                xLabel={(w) => w.label}
                tooltip={(w) => [['Requests', formatNumber(w.value)]]}
                labelEvery={1}
                height={200}
                ariaLabel="Requests by weekday"
              />
            </Panel>
          </div>

          <div className="grid grid--3">
            <Panel title="Top models" description={`Tokens · last ${formatNumber(events.length)} requests`}>
              {extra.loading ? <ListSkeleton rows={3} /> : (
                <BarList items={models.map((m) => ({ id: m.id, label: m.label, value: m.tokens, meta: `${m.requests} req` }))} emptyText="No model usage yet." />
              )}
            </Panel>
            <Panel title="Top projects" description={`Tokens · last ${formatNumber(events.length)} requests`}>
              {extra.loading ? <ListSkeleton rows={3} /> : (
                <BarList items={projects.map((p) => ({ id: p.id, label: p.label, value: p.tokens, meta: `${p.requests} req` }))} emptyText="No project usage yet." />
              )}
            </Panel>
            <Panel title="Account totals" description="Since you joined">
              <KeyValues items={[
                ['Lifetime tokens', formatNumber(summary?.totalTokensConsumed)],
                ['Lifetime AI requests', formatNumber(summary?.totalAIRequests)],
                ['Lifetime spend', formatINR(summary?.totalSpentINR ?? spend.totalPaid)],
                ['Payment success rate', formatPercent(spend.successRate)],
                ['Average payment', spend.paidCount ? formatINR(spend.average) : '—'],
                ['First payment', spend.firstPaidAt ? formatDate(spend.firstPaidAt) : '—'],
                ['Last payment', spend.lastPaidAt ? formatDate(spend.lastPaidAt) : '—'],
              ]}
              />
            </Panel>
          </div>

          <div className="grid grid--2-1">
            <Panel
              title="Recent payments"
              action={<Button size="sm" variant="ghost" to="/invoices" iconRight={ArrowRight}>All invoices</Button>}
              flush
            >
              {extra.loading ? <TableSkeleton rows={4} /> :txs.length === 0 ? (
                <EmptyState icon={Receipt} title="No payments yet" action={<Button size="sm" to="/plans">See plans</Button>}>
                  Your receipts appear here after your first purchase.
                </EmptyState>
              ) : <PaymentsTable transactions={txs.slice(0, 5)} />}
            </Panel>
            <Panel title="Recent AI activity" action={<Button size="sm" variant="ghost" to="/requests" iconRight={ArrowRight}>All requests</Button>}>
              <ActivityList events={(dashboardOverview?.recentEvents || []).slice(0, 5)} now={now} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
