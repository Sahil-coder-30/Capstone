import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, CreditCard, Lock, CheckCircle2, AlertCircle, ArrowLeft, Loader2, Cpu, Check } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

export default function CheckoutModal() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { selectedPlanId, billingCycle, changeSubscription, initiateCheckout } = usePayments();
  const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'success' | 'failed'
  const [errorMsg, setErrorMsg] = useState(null);

  const currentPlanId = planId || selectedPlanId || 'pro_regular';

  const planInfo = {
    free: {
      label: 'Taksha AI Free',
      price: 0,
      tier: 'free',
      features: ['20 daily credits per provider', '50,000 daily token cap', '0.5 vCPU + 512MB Sandbox']
    },
    pro_regular: {
      label: 'Taksha AI Pro',
      price: billingCycle === 'yearly' ? 399 : 499,
      tier: 'pro',
      features: ['4x higher AI usage limits', '5,000,000 tokens monthly cap', '2.0 vCPU + 2GB Sandbox', 'Coding, App and Copilot Agents']
    },
    max_regular: {
      label: 'Taksha AI Max',
      price: billingCycle === 'yearly' ? 799 : 999,
      tier: 'max',
      features: ['20x higher limits than Pro', 'Truly Unlimited Tokens', '4.0 vCPU + 4GB Sandbox', 'Flagship AI models & priority queue']
    },
  }[currentPlanId] || {
    label: 'Taksha AI Pro',
    price: 499,
    tier: 'pro',
    features: ['4x higher limits', '5M tokens monthly cap', '2.0 vCPU Sandbox']
  };

  const handleRazorpayPayment = async () => {
    setStatus('processing');
    setErrorMsg(null);

    try {
      // 1. Get session token & order from backend
      const sessionData = await initiateCheckout(currentPlanId, billingCycle);

      // Check if Razorpay SDK is loaded in window
      if (window.Razorpay && sessionData?.order?.id) {
        const options = {
          key: process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_fake_key_12345',
          amount: sessionData.order.amount,
          currency: 'INR',
          name: 'Taksha CodeSpace',
          description: `Subscription Upgrade: ${planInfo.label}`,
          order_id: sessionData.order.id,
          handler: async function (response) {
            // Payment completed successfully via Razorpay SDK
            await changeSubscription(planInfo.tier);
            setStatus('success');
          },
          prefill: {
            name: 'Developer User',
            email: 'dev@takshacodespace.com',
          },
          theme: {
            color: '#10B981',
          },
          modal: {
            ondismiss: function () {
              setStatus('idle');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Direct simulation fallback for local development without Razorpay keys
        setTimeout(async () => {
          await changeSubscription(planInfo.tier);
          setStatus('success');
        }, 1500);
      }
    } catch (err) {
      console.error('[CheckoutModal] Checkout error:', err);
      setStatus('failed');
      setErrorMsg(err.message || 'Payment initiation failed. Please try again.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', fontFamily: 'var(--font-sans)' }}>
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.88rem',
          color: 'var(--text-muted)',
          marginBottom: '24px',
          fontWeight: '600',
          transition: 'color 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <ArrowLeft size={16} /> Back to Plans
      </button>

      {status === 'success' ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-card)',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <CheckCircle2 size={64} style={{ color: 'var(--brand-primary)', margin: '0 auto 20px' }} />
          <h2 style={{ fontSize: '1.8rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Upgrade Completed Successfully!
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '32px', lineHeight: '1.6' }}>
            Your account has been upgraded to <strong>{planInfo.label}</strong>. Your updated container vCPU/RAM resources and daily token buckets are now active.
          </p>

          <button onClick={() => navigate('/status')} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            View Subscription Status
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
          {/* Left Column: Plan Information Summary */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(59, 130, 246, 0.03) 100%)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'var(--brand-subtle)',
                color: 'var(--brand-primary)',
                padding: '4px 10px',
                borderRadius: '12px',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                Selected Tier
              </span>
              <h2 style={{ fontSize: '2rem', fontWeight: '900', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', margin: '12px 0 8px' }}>
                {planInfo.label}
              </h2>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '28px', lineHeight: '1.5' }}>
                You are subscribing to the {planInfo.label} workspace sandbox.
              </p>

              <h4 style={{ fontSize: '0.88rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: '16px' }}>
                Included Benefits
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {planInfo.features.map((feat, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--brand-subtle)', display: 'flex', alignItems: 'center', justifyItems: 'center', flexShrink: 0 }}>
                      <Check size={12} style={{ color: 'var(--brand-primary)', margin: 'auto' }} />
                    </div>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Lock size={20} style={{ color: 'var(--brand-primary)' }} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Secure Merchant Link:</strong> Your details are protected using 256-bit encryption. Handled securely by Razorpay.
              </div>
            </div>
          </div>

          {/* Right Column: Checkout Breakdown & Pay */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
                  Invoice Detail
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--brand-primary)', fontWeight: '700' }}>
                  <ShieldCheck size={15} /> SSL Secure
                </div>
              </div>

              {/* Order Ledger */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{planInfo.label} ({billingCycle})</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>₹{planInfo.price}.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>GST / Platform Service Fee</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Included</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Billing Cycle</span>
                  <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{billingCycle}</span>
                </div>

                <div style={{
                  borderTop: '1px dashed var(--border)',
                  paddingTop: '18px',
                  marginTop: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.15rem',
                  fontWeight: '800',
                  color: 'var(--text-primary)'
                }}>
                  <span>Amount Payable</span>
                  <span style={{ color: 'var(--brand-primary)' }}>₹{planInfo.price}.00</span>
                </div>
              </div>

              {errorMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#EF4444', fontSize: '0.85rem', marginBottom: '20px' }}>
                  <AlertCircle size={16} /> {errorMsg}
                </div>
              )}
            </div>

            <div>
              <button
                onClick={handleRazorpayPayment}
                disabled={status === 'processing'}
                className="btn-primary"
                style={{ width: '100%', padding: '14px', justifyContent: 'center', fontSize: '1rem', cursor: 'pointer' }}
              >
                {status === 'processing' ? (
                  <>
                    <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Processing Order...</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    <span>Pay ₹{planInfo.price} via Razorpay</span>
                  </>
                )}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '16px', lineHeight: '1.4' }}>
                By finalizing this payment, you authorize immediate plan provisioning. Upgrades take effect instantly. Cancel online anytime.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
