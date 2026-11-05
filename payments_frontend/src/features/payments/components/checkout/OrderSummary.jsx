import { Lock, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { formatDate, formatINR } from '../../utils/format';
import './OrderSummary.scss';

const METHODS = ['UPI', 'Cards', 'Net banking', 'Wallets'];

const PAY_LABEL = {
  creating: 'Starting payment…',
  open: 'Complete payment in Razorpay…',
  verifying: 'Confirming payment…',
};

/** Sticky order card with the total and the pay button. */
export default function OrderSummary({ plan, preview, status, error, busy, onPay, onRetry }) {
  return (
    <aside className="order">
      <h2 className="order__title">Order summary</h2>

      <div className="order__line">
        <div>
          <strong>Taksha AI {plan.name}</strong>
          <span>30 days · {formatDate(preview.startsAt)} – {formatDate(preview.endsAt)}</span>
        </div>
        <span>{formatINR(plan.priceINR)}</span>
      </div>

      <dl className="order__rows">
        <div><dt>Subtotal</dt><dd>{formatINR(plan.priceINR)}</dd></div>
        <div><dt>Taxes</dt><dd>Included</dd></div>
        <div className="order__total"><dt>Total due today</dt><dd>{formatINR(plan.priceINR)}</dd></div>
      </dl>

      {status === 'failed' && (
        <Alert tone="bad" title="Payment not completed" action={<Button size="sm" onClick={onRetry}>Dismiss</Button>}>
          {error}
        </Alert>
      )}
      {status === 'cancelled' && (
        <Alert tone="info" title="Payment cancelled">You closed the payment window. You were not charged.</Alert>
      )}

      <Button variant="primary" size="lg" block loading={busy} icon={busy ? null : Lock} onClick={onPay} disabled={busy}>
        {PAY_LABEL[status] || `Pay ${formatINR(plan.priceINR)}`}
      </Button>

      <div className="order__methods" aria-label="Accepted payment methods">
        {METHODS.map((m) => <span key={m}>{m}</span>)}
      </div>

      <p className="order__secure">
        <ShieldCheck size={14} aria-hidden="true" />
        Payments are processed securely by Razorpay. Taksha never sees your card or bank details.
      </p>
    </aside>
  );
}
