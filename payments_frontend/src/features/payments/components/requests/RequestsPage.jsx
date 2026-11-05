import { useCallback, useState } from 'react';
import { CloudOff, ScrollText, RefreshCw } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Table from '../ui/Table';
import Pagination from '../ui/Pagination';
import EmptyState from '../ui/EmptyState';
import Alert from '../ui/Alert';
import { SearchInput, Select } from '../ui/Field';
import { TableSkeleton } from '../ui/Skeleton';
import RequestDrawer from './RequestDrawer';
import { usePayments } from '../../Hooks/payments.hooks';
import useLoad, { useDebounced } from '../../Hooks/useLoad';
import { AGENT_LABELS, agentLabel } from '../../utils/stats';
import { formatDateTime, formatNumber, shortModel } from '../../utils/format';
import './RequestsPage.scss';

const PAGE_SIZE = 20;
const AGENTS = [{ id: 'all', label: 'All agents' }, ...Object.entries(AGENT_LABELS).map(([id, label]) => ({ id, label }))];
const PERIODS = [
  { id: 'all', label: 'All time', ms: null },
  { id: '1d', label: 'Last 24 hours', ms: 864e5 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 864e5 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 864e5 },
];

export default function RequestsPage() {
  const { usageEvents, loadUsageEvents } = usePayments();
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState('all');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const q = useDebounced(search.trim(), 350);

  const load = useCallback(() => {
    const ms = PERIODS.find((p) => p.id === period)?.ms;
    return loadUsageEvents({
      page,
      limit: PAGE_SIZE,
      agentType: agent,
      search: q || undefined,
      startDate: ms ? new Date(Date.now() - ms).toISOString() : '',
    });
  }, [page, agent, period, q, loadUsageEvents]);
  const state = useLoad(load);

  const events = usageEvents?.events || [];
  const filtered = agent !== 'all' || period !== 'all' || q;
  const onFilter = (setter) => (v) => { setter(v); setPage(1); };

  return (
    <div className="requests">
      <PageHeader
        title="AI requests"
        description="Every AI call made from your workspace, with tokens and credits charged."
        actions={<Button variant="ghost" icon={RefreshCw} loading={state.refreshing} onClick={state.reload}>Refresh</Button>}
      />

      {state.error && events.length > 0 && (
        <div className="requests__alert"><Alert tone="warn" title="Could not refresh requests">Showing the last list we loaded.</Alert></div>
      )}

      <Panel
        title={state.loading ? 'Requests' : `${formatNumber(usageEvents?.total || 0)} ${filtered ? 'matching ' : ''}requests`}
        action={(
          <div className="requests__filters">
            <SearchInput value={search} onChange={onFilter(setSearch)} placeholder="Search request ID or model" />
            <Select label="Agent" value={agent} onChange={onFilter(setAgent)} options={AGENTS} />
            <Select label="Period" value={period} onChange={onFilter(setPeriod)} options={PERIODS} />
          </div>
        )}
        flush
      >
        {state.loading ? <TableSkeleton rows={8} cols={6} /> : state.error && events.length === 0 ? (
          <EmptyState icon={CloudOff} title="Could not load requests" action={<Button size="sm" icon={RefreshCw} onClick={state.reload}>Try again</Button>}>
            The payments service did not respond.
          </EmptyState>
        ) : events.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? 'No requests match these filters' : 'No AI requests yet'}
            action={filtered && <Button size="sm" onClick={() => { setSearch(''); setAgent('all'); setPeriod('all'); setPage(1); }}>Clear filters</Button>}
          >
            {filtered ? 'Try a wider period or another agent.' : 'Requests from the coding agent and Copilot show up here.'}
          </EmptyState>
        ) : (
          <div className={state.refreshing ? 'requests__table is-busy' : 'requests__table'}>
            <Table
              caption="AI requests"
              onRowsClickable
              columns={[
                { key: 'time', label: 'Time' },
                { key: 'agent', label: 'Agent' },
                { key: 'model', label: 'Model', hideBelow: 'md' },
                { key: 'in', label: 'Prompt', align: 'right', hideBelow: 'md' },
                { key: 'out', label: 'Completion', align: 'right', hideBelow: 'md' },
                { key: 'tot', label: 'Tokens', align: 'right' },
                { key: 'cr', label: 'Credits', align: 'right' },
              ]}
            >
              {events.map((e) => (
                <tr key={e.id || e._id} tabIndex={0} onClick={() => setOpen(e)} onKeyDown={(k) => { if (k.key === 'Enter') setOpen(e); }}>
                  <td className="cell-dim">{formatDateTime(e.createdAt)}</td>
                  <td><span className="cell-main">{agentLabel(e.agentType)}</span></td>
                  <td className="cell-mono hide-md">{shortModel(e.modelId)}</td>
                  <td className="cell-num hide-md">{formatNumber(e.promptTokens)}</td>
                  <td className="cell-num hide-md">{formatNumber(e.completionTokens)}</td>
                  <td className="cell-num">{formatNumber(e.totalTokens)}</td>
                  <td className="cell-num">{formatNumber(e.creditsDeducted)}</td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={usageEvents?.page || page}
              totalPages={usageEvents?.totalPages || 1}
              total={usageEvents?.total || 0}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </div>
        )}
      </Panel>

      <RequestDrawer event={open} onClose={() => setOpen(null)} />
    </div>
  );
}
