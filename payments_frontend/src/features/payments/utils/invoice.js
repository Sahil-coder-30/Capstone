// Printable invoice and CSV export, built on the client from transaction data.

import { describeTx, txAmount, txStatus } from './stats';
import { formatDate, formatINR } from './format';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function invoiceFields(tx, user) {
  return {
    number: tx.invoiceNumber || tx.metadata?.invoiceNumber || '—',
    date: formatDate(tx.createdAt),
    status: txStatus(tx),
    item: describeTx(tx),
    amount: formatINR(txAmount(tx)),
    validFrom: tx.metadata?.slotValidFrom ? formatDate(tx.metadata.slotValidFrom) : null,
    validUntil: tx.metadata?.slotValidUntil ? formatDate(tx.metadata.slotValidUntil) : null,
    paymentId: tx.razorpay?.paymentId || '—',
    orderId: tx.razorpay?.orderId || '—',
    customer: user?.name || user?.email || '—',
    email: user?.email || '—',
  };
}

/** Opens a print-ready invoice in a new window; the browser's dialog can save it as PDF. */
export function printInvoice(tx, user) {
  const f = invoiceFields(tx, user);
  const w = window.open('', '_blank', 'width=820,height=960');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(f.number)}</title>
<style>
  *{box-sizing:border-box;margin:0}body{font:14px/1.5 Inter,-apple-system,Segoe UI,sans-serif;color:#101828;padding:48px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  h1{font-size:22px;letter-spacing:-.02em}.muted{color:#667085;font-size:13px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
  .label{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#667085;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}th,td{padding:12px 0;text-align:left;border-bottom:1px solid #E4E7EC}
  th{font-size:12px;color:#667085;font-weight:500}.r{text-align:right}
  .total td{font-weight:600;font-size:16px;border-bottom:0}.badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;background:#ECFDF3;color:#15803D}
  footer{margin-top:48px;font-size:12px;color:#667085}
</style></head><body>
  <div class="top"><div><h1>Taksha CodeSpace</h1><div class="muted">AI coding workspace</div></div>
  <div style="text-align:right"><h1>Invoice</h1><div class="muted">${esc(f.number)}</div></div></div>
  <div class="grid">
    <div><div class="label">Billed to</div><div>${esc(f.customer)}</div><div class="muted">${esc(f.email)}</div></div>
    <div><div class="label">Invoice date</div><div>${esc(f.date)}</div><div class="label" style="margin-top:12px">Status</div>
    <span class="badge">${f.status === 'paid' ? 'Paid' : esc(f.status)}</span></div>
  </div>
  <table><thead><tr><th>Description</th><th>Period</th><th class="r">Amount</th></tr></thead><tbody>
    <tr><td>${esc(f.item)}</td><td>${f.validFrom ? `${esc(f.validFrom)} – ${esc(f.validUntil)}` : '30 days'}</td><td class="r">${esc(f.amount)}</td></tr>
    <tr><td colspan="2" class="muted">Taxes</td><td class="r muted">Included</td></tr>
    <tr class="total"><td colspan="2">Total paid</td><td class="r">${esc(f.amount)}</td></tr>
  </tbody></table>
  <div class="grid"><div><div class="label">Payment ID</div><div>${esc(f.paymentId)}</div></div>
  <div><div class="label">Order ID</div><div>${esc(f.orderId)}</div></div></div>
  <footer>Paid through Razorpay. Thank you for using Taksha CodeSpace.</footer>
  <script>window.onload=function(){window.print()}</script>
</body></html>`);
  w.document.close();
  return true;
}

/** Downloads the given transactions as a CSV file. */
export function exportCsv(transactions, filename = 'taksha-payments.csv') {
  const head = ['Date', 'Invoice', 'Description', 'Status', 'Amount (INR)', 'Payment ID', 'Order ID'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = transactions.map((t) => [
    new Date(t.createdAt).toISOString(),
    t.invoiceNumber || '',
    describeTx(t),
    txStatus(t),
    txAmount(t).toFixed(2),
    t.razorpay?.paymentId || '',
    t.razorpay?.orderId || '',
  ]);
  const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
