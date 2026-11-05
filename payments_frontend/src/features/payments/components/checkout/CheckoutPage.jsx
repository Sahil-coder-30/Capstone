import { Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ArrowUpCircle, CalendarPlus, ListOrdered, Zap } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import KeyValues from '../ui/KeyValues';
import Steps from './Steps';
import PlanPicker from './PlanPicker';
import OrderSummary from './OrderSummary';
import CheckoutSuccess from './CheckoutSuccess';
import useAccount from '../../Hooks/useAccount';
import useRazorpayCheckout from '../../Hooks/useRazorpayCheckout';
import { usePayments } from '../../Hooks/payments.hooks';
import { planById, previewPurchase } from '../../utils/plans';
import { capitalize, formatDate } from '../../utils/format';
import './CheckoutPage.scss';

const EFFECT = {
  start: { icon: Zap, title: 'Starts right away', text: 'You have no paid plan, so this one begins as soon as the payment goes through.' },
  extend: { icon: CalendarPlus, title: 'Adds 30 days to your plan', text: 'You already have this plan. The new days are added to the end of it.' },
  upgrade: { icon: ArrowUpCircle, title: 'Upgrades you right away', text: null },
  queue: { icon: ListOrdered, title: 'Waits in your queue', text: 'This plan is lower than your current one, so it starts when your current plan and anything queued before it ends.' },
};

const STEP_BY_STATUS = { creating: 2, open: 2, verifying: 2, success: 3 };

export default function CheckoutPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { user } = useOutletContext();
  const { subscription } = usePayments();
  const { tier } = useAccount();
  const checkout = useRazorpayCheckout();

  const plan = planById(planId);
  if (!plan || plan.priceINR === 0) return <Navigate to="/plans" replace />;

  if (checkout.status === 'success') return <CheckoutSuccess receipt={checkout.receipt} />;

  const preview = previewPurchase(plan, subscription);
  const effect = EFFECT[preview.kind];
  const step = STEP_BY_STATUS[checkout.status] ?? 1;

  return (
    <div className="checkout">
      <Button variant="ghost" size="sm" icon={ArrowLeft} to="/plans" className="checkout__back">All plans</Button>
      <PageHeader title="Checkout" description="Review your plan and pay securely with Razorpay." />
      <Steps current={step} />

      <div className="checkout__grid">
        <div className="checkout__main">
          <Panel title="Plan" description="You can switch before paying">
            <PlanPicker
              value={plan.id}
              currentTier={tier}
              disabled={checkout.busy}
              onChange={(id) => { checkout.reset(); navigate(`/checkout/${id}`, { replace: true }); }}
            />
          </Panel>

          <Panel title="What happens after you pay">
            <div className="checkout__effect">
              <span className="checkout__effect-icon"><effect.icon size={18} aria-hidden="true" /></span>
              <div>
                <strong>{effect.title}</strong>
                <p>
                  {effect.text || `Taksha AI ${plan.name} starts now. The ${preview.carriedDays} days left on your ${capitalize(preview.carriedTier)} plan wait in the queue and continue after this plan ends.`}
                </p>
              </div>
            </div>
            <KeyValues items={[
              ['New plan starts', formatDate(preview.startsAt)],
              ['New plan ends', formatDate(preview.endsAt)],
              ['Renews automatically', 'No'],
            ]}
            />
          </Panel>

          <Panel title="Billing details" description="Your receipt and invoice go to this account">
            <KeyValues items={[
              ['Name', user?.name || '—'],
              ['Email', user?.email || '—'],
              ['Currency', 'Indian rupee (INR)'],
            ]}
            />
            <p className="checkout__hint">
              <CalendarClock size={14} aria-hidden="true" /> Every paid plan gives you 30 days from its start date.
            </p>
          </Panel>
        </div>

        <OrderSummary
          plan={plan}
          preview={preview}
          status={checkout.status}
          error={checkout.error}
          busy={checkout.busy}
          onPay={() => checkout.pay({ plan, user })}
          onRetry={checkout.reset}
        />
      </div>
    </div>
  );
}
