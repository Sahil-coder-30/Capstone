import { useCallback, useState } from 'react';
import { apiErrorMessage, createOrderAPI, verifyPaymentAPI } from '../service/payments.api';
import { usePayments } from './payments.hooks';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadScript() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    let script = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', () => resolve(true), { once: true });
    script.addEventListener('error', () => resolve(false), { once: true });
  });
}

/**
 * Razorpay checkout flow:
 *   idle -> creating (order) -> open (Razorpay modal) -> verifying (server) -> success
 * Any step can end in `failed`; closing the modal returns to `cancelled`.
 */
export default function useRazorpayCheckout() {
  const { refreshAfterPayment } = usePayments();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const fail = (msg) => { setError(msg); setStatus('failed'); };

  const pay = useCallback(async ({ plan, user }) => {
    setError(null);
    setStatus('creating');

    const ready = await loadScript();
    if (!ready || !window.Razorpay) {
      fail('Could not load Razorpay. Check your connection and try again.');
      return;
    }

    let order;
    try {
      order = await createOrderAPI(plan.id);
    } catch (err) {
      fail(apiErrorMessage(err, 'Could not start the payment.'));
      return;
    }
    if (!order?.orderId || !order?.keyId) {
      fail('The payment server did not return an order. Please try again.');
      return;
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Taksha CodeSpace',
      description: `${order.package?.label || `Taksha AI ${plan.name}`} · 30 days`,
      prefill: { name: user?.name || '', email: user?.email || '' },
      theme: { color: '#EA580C' },
      modal: { ondismiss: () => setStatus((s) => (s === 'open' ? 'cancelled' : s)) },
      handler: async (res) => {
        setStatus('verifying');
        try {
          const verified = await verifyPaymentAPI({
            paymentId: res.razorpay_payment_id,
            orderId: res.razorpay_order_id,
            signature: res.razorpay_signature,
          });
          setReceipt({
            plan,
            amountPaise: order.amount,
            paymentId: res.razorpay_payment_id,
            orderId: res.razorpay_order_id,
            message: verified?.message,
            testMode: String(order.keyId).startsWith('rzp_test'),
          });
          await refreshAfterPayment();
          setStatus('success');
        } catch (err) {
          fail(`${apiErrorMessage(err, 'We could not confirm the payment.')} If money was taken, your plan is applied automatically once Razorpay confirms the payment.`);
        }
      },
    });
    rzp.on('payment.failed', (res) => fail(res?.error?.description || 'The payment failed. You were not charged.'));
    setStatus('open');
    rzp.open();
  }, [refreshAfterPayment]);

  const reset = useCallback(() => { setStatus('idle'); setError(null); }, []);

  return { status, error, receipt, pay, reset, busy: ['creating', 'open', 'verifying'].includes(status) };
}
