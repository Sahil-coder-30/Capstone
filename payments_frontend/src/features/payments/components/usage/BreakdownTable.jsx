import Table from '../ui/Table';
import EmptyState from '../ui/EmptyState';
import { formatCompact, formatNumber } from '../../utils/format';
import './BreakdownTable.scss';

/**
 * Rows of { id, label, requests, tokens } with share of total tokens and
 * average tokens per request.
 */
export default function BreakdownTable({ rows, firstLabel, emptyText }) {
  if (!rows.length) return <EmptyState compact>{emptyText}</EmptyState>;
  const total = rows.reduce((a, r) => a + r.tokens, 0) || 1;
  return (
    <Table
      caption={firstLabel}
      columns={[
        { key: 'label', label: firstLabel },
        { key: 'req', label: 'Requests', align: 'right' },
        { key: 'tok', label: 'Tokens', align: 'right' },
        { key: 'avg', label: 'Avg / request', align: 'right', hideBelow: 'narrow' },
        { key: 'share', label: 'Share', align: 'right' },
      ]}
    >
      {rows.map((r) => {
        const share = Math.round((r.tokens / total) * 100);
        return (
          <tr key={r.id}>
            <td><span className="cell-main breakdown__label" title={r.label}>{r.label}</span></td>
            <td className="cell-num">{formatNumber(r.requests)}</td>
            <td className="cell-num">{formatCompact(r.tokens)}</td>
            <td className="cell-num hide-narrow">{formatNumber(Math.round(r.tokens / Math.max(1, r.requests)))}</td>
            <td className="cell-num">
              <span className="breakdown__share">
                <span className="breakdown__share-bar"><span style={{ width: `${share}%` }} /></span>
                {share}%
              </span>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
