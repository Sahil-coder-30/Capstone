import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarCheck, CloudOff, Download, FileText, Receipt, RefreshCw, Wallet, XCircle } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import { Kpi, KpiGrid } from '../ui/Kpi';
import { SearchInput, Select } from '../ui/Field';
import { KpiSkeleton, TableSkeleton } from '../ui/Skeleton';
import PaymentsTable from '../shared/PaymentsTable';
import InvoiceDrawer from './InvoiceDrawer';
import { usePayments } from '../../Hooks/payments.hooks';
import { useQueries } from '../../Hooks/payments.queries';
import { describeTx, paymentStats, txAmount, txStatus } from '../../utils/stats';
import { exportCsv, printInvoice } from '../../utils/invoice';
import { formatDate, formatINR, formatNumber } from '../../utils/format';
import './InvoicesPage.scss';

const PAGE = 10;
const STATUSES = [
  { id: 'all', label: 'All statuses' },
  { id: 'paid', label: 'Paid' },
  { id: 'failed', label: 'Failed' },
  { id: 'pending', label: 'Pending' },
];

export default function InvoicesPage() {
  const { user } = useOutletContext();
  const { paymentHistory } = usePayments();
  const state = useQueries(['history']);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  const all = paymentHistory.transactions;
  const stats = useMemo(() => paymentStats(all), [all]);
  const last = all.find((t) => txStatus(t) === 'paid');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) => (status === 'all' || txStatus(t) === status) && (!q || [
      t.invoiceNumber, describeTx(t), t.razorpay?.paymentId, t.razorpay?.orderId,
    ].some((v) => v && String(v).toLowerCase().includes(q))));
  }, [all, search, status]);
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const filtered = status !== 'all' || search.trim();

  return (
    <div className="invoices">
      <PageHeader
        title="Invoices"
        description="Every payment you made, with invoices you can print or save as PDF."
        actions={(
          <>
            <Button variant="ghost" icon={RefreshCw} loading={state.pending} onClick={state.reload} aria-label="Refresh" />
            <Button icon={Download} disabled={!rows.length} onClick={() => exportCsv(rows)}>Export CSV</Button>
          </>
        )}
      />

      {state.error && all.length > 0 && (
        <div className="invoices__alert"><Alert tone="warn" title="Could not refresh your payments">Showing the last list we loaded.</Alert></div>
      )}

      {state.error && all.length === 0 ? (
        <Panel>
          <EmptyState icon={CloudOff} title="Could not load your payments" action={<Button variant="primary" icon={RefreshCw} onClick={state.reload}>Try again</Button>}>
            The payments service did not respond. Your invoices are safe; try again in a moment.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {state.loading ? <KpiSkeleton count={4} /> : (
            <KpiGrid cols={4}>
              <Kpi icon={Wallet} label="Total paid" value={formatINR(stats.totalPaid)} foot={`Average ${formatINR(stats.average)} per payment`} />
              <Kpi icon={FileText} label="Invoices" value={formatNumber(stats.paidCount)} foot={`${formatNumber(stats.attempts)} payment attempts`} />
              <Kpi icon={XCircle} label="Failed payments" value={formatNumber(stats.failedCount)} foot="You are never charged for these" />
              <Kpi icon={CalendarCheck} label="Last payment" value={last ? formatINR(txAmount(last)) : '—'} foot={last ? formatDate(last.createdAt) : 'No payments yet'} />
            </KpiGrid>
          )}

          <div className="invoices__table">
            <Panel
              title="Payment history"
              description={paymentHistory.total > all.length ? `Showing your latest ${all.length} of ${paymentHistory.total} payments` : null}
              action={(
                <div className="invoices__filters">
                  <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Invoice, plan or payment ID" />
                  <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUSES} />
                </div>
              )}
              flush
            >
              {state.loading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title={filtered ? 'No payments match' : 'No payments yet'}
                  action={filtered
                    ? <Button size="sm" onClick={() => { setSearch(''); setStatus('all'); }}>Clear filters</Button>
                    : <Button size="sm" variant="primary" to="/plans">See plans</Button>}
                >
                  {filtered ? 'Try another search or status.' : 'Invoices appear here after your first purchase.'}
                </EmptyState>
              ) : (
                <>
                  <PaymentsTable transactions={pageRows} onOpen={setOpen} onDownload={(t) => printInvoice(t, user)} />
                  <Pagination page={page} totalPages={Math.ceil(rows.length / PAGE)} total={rows.length} pageSize={PAGE} onChange={setPage} />
                </>
              )}
            </Panel>
          </div>
        </>
      )}

      <InvoiceDrawer tx={open} user={user} onClose={() => setOpen(null)} />
    </div>
  );
}
