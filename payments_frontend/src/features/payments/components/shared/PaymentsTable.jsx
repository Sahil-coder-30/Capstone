import { Download } from 'lucide-react';
import Table from '../ui/Table';
import { StatusPill } from '../ui/Badge';
import { describeTx, txAmount, txStatus } from '../../utils/stats';
import { formatDate, formatINR } from '../../utils/format';
import './PaymentsTable.scss';

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'desc', label: 'Description' },
  { key: 'invoice', label: 'Invoice', hideBelow: 'md' },
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Amount', align: 'right' },
];

/** Payment rows. onOpen(tx) makes rows clickable; onDownload(tx) adds a receipt button. */
export default function PaymentsTable({ transactions, onOpen, onDownload }) {
  const columns = onDownload ? [...COLUMNS, { key: 'dl', label: <span className="sr-only">Receipt</span>, align: 'right' }] : COLUMNS;
  return (
    <Table columns={columns} onRowsClickable={Boolean(onOpen)} caption="Payments">
      {transactions.map((t) => {
        const status = txStatus(t);
        return (
          <tr
            key={t.id || t._id}
            onClick={onOpen ? () => onOpen(t) : undefined}
            onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(t); } : undefined}
            tabIndex={onOpen ? 0 : undefined}
          >
            <td className="cell-dim">{formatDate(t.createdAt)}</td>
            <td>
              <span className="cell-main">{describeTx(t)}</span>
              <span className="cell-sub mono">{t.razorpay?.paymentId || t.razorpay?.orderId || '—'}</span>
            </td>
            <td className="cell-mono hide-md">{t.invoiceNumber || '—'}</td>
            <td><StatusPill status={status} /></td>
            <td className="cell-num">{formatINR(txAmount(t))}</td>
            {onDownload && (
              <td className="cell-num">
                {status === 'paid' && (
                  <button
                    type="button"
                    className="paytable__dl"
                    aria-label={`Download receipt ${t.invoiceNumber || ''}`}
                    onClick={(e) => { e.stopPropagation(); onDownload(t); }}
                  >
                    <Download size={14} />
                  </button>
                )}
              </td>
            )}
          </tr>
        );
      })}
    </Table>
  );
}
