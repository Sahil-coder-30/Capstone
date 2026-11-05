import { CheckCircle2, LayoutDashboard, Receipt } from 'lucide-react';
import Button from '../ui/Button';
import KeyValues from '../ui/KeyValues';
import { Tag } from '../ui/Badge';
import useAccount from '../../Hooks/useAccount';
import { formatDate, formatINR } from '../../utils/format';
import './CheckoutSuccess.scss';

/** Receipt shown after the server confirmed the payment. */
export default function CheckoutSuccess({ receipt }) {
  const { activeSlot, plan: activePlan } = useAccount();
  return (
    <div className="success">
      <div className="success__icon"><CheckCircle2 size={28} /></div>
      <h1 className="success__title">Payment successful</h1>
      <p className="success__text">
        Taksha AI {receipt.plan.name} is on your account. A receipt has been sent to your email.
      </p>

      <div className="success__receipt">
        <KeyValues items={[
          ['Plan bought', `Taksha AI ${receipt.plan.name} · 30 days`],
          ['Amount paid', formatINR(receipt.amountPaise / 100)],
          ['Active plan now', activePlan.name],
          activeSlot && ['Active until', formatDate(activeSlot.validUntil)],
          ['Payment ID', <span className="mono" key="p">{receipt.paymentId}</span>],
          ['Order ID', <span className="mono" key="o">{receipt.orderId}</span>],
        ]}
        />
        {receipt.testMode && <div className="success__test"><Tag tone="warn">Test mode payment</Tag></div>}
      </div>

      <div className="success__actions">
        <Button variant="primary" to="/" icon={LayoutDashboard}>Go to dashboard</Button>
        <Button to="/invoices" icon={Receipt}>View invoice</Button>
      </div>
    </div>
  );
}
