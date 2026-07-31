import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import {
  ShieldCheck, CreditCard, Lock, CheckCircle2, AlertCircle,
  ArrowLeft, Loader2, Check, Sparkles, ArrowRight
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

export default function CheckoutModal() {
  const { planId }  = useParams();
  const navigate    = useNavigate();
  const { selectedPlanId, billingCycle, changeSubscription, initiateCheckout } = usePayments();

  const [status, setStatus]     = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);

  const pageRef      = useRef(null);
  const successRef   = useRef(null);
  const currentPlanId = planId || selectedPlanId || 'pro_regular';

  // ── Plan lookup ──────────────────────────────────────────────────────────
  const planInfo = {
    free:        { label: 'Taksha AI Free',  price: 0,                                     tier: 'free', features: ['20 daily credits per provider', '50,000 daily token cap', '0.5 vCPU + 512MB Sandbox'] },
    pro_regular: { label: 'Taksha AI Pro',   price: billingCycle === 'yearly' ? 399 : 499, tier: 'pro',  features: ['4x higher AI usage limits', '5,000,000 tokens monthly cap', '2.0 vCPU + 2GB Sandbox', 'Coding, App and Copilot Agents'] },
    max_regular: { label: 'Taksha AI Max',   price: billingCycle === 'yearly' ? 799 : 999, tier: 'max',  features: ['20x higher limits than Pro', 'Truly Unlimited Tokens', '4.0 vCPU + 4GB Sandbox', 'Flagship AI models & priority queue'] },
  }[currentPlanId] || { label: 'Taksha AI Pro', price: 499, tier: 'pro', features: [] };

  const isMax = planInfo.tier === 'max';
  const accentColor  = isMax ? 'var(--accent-primary)' : 'var(--brand-primary)';
  const accentShadow = isMax ? 'var(--shadow-blue)'    : 'var(--shadow-green)';

  // ── GSAP entrance ────────────────────────────────────────────────────────
  useGSAP(() => {
    gsap.fromTo('.checkout-col',
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out', stagger: 0.12, delay: 0.1 }
    );
  }, { scope: pageRef });

  // Success animation
  useEffect(() => {
    if (status === 'success' && successRef.current) {
      gsap.fromTo(successRef.current,
        { opacity: 0, scale: 0.92 },
        { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.4)' }
      );
      // Confetti dots
      const colors = ['#3DC5A1','#1B6EF3','#F59E0B','#A78BFA'];
      for (let i = 0; i < 24; i++) {
        const dot = document.createElement('div');
        dot.style.cssText = `
          position:fixed; width:8px; height:8px; border-radius:50%;
          background:${colors[i % colors.length]};
          left:${Math.random()*100}vw; top:30vh; z-index:9999; pointer-events:none;
        `;
        document.body.appendChild(dot);
        gsap.to(dot, {
          y: Math.random() * 300 + 100,
          x: (Math.random() - 0.5) * 200,
          opacity: 0, duration: 1.2 + Math.random() * 0.8,
          ease: 'power2.out', delay: Math.random() * 0.4,
          onComplete: () => dot.remove(),
        });
      }
    }
  }, [status]);

  // ── Razorpay handler — untouched logic ───────────────────────────────────
  const handleRazorpayPayment = async () => {
    setStatus('processing');
    setErrorMsg(null);

    try {
      const sessionData = await initiateCheckout(currentPlanId, billingCycle);

      if (window.Razorpay && sessionData?.order?.id) {
        const options = {
          key: process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_fake_key_12345',
          amount: sessionData.order.amount,
          currency: 'INR',
          name: 'Taksha CodeSpace',
          description: `Subscription Upgrade: ${planInfo.label}`,
          order_id: sessionData.order.id,
          handler: async function (response) {
            await changeSubscription(planInfo.tier);
            setStatus('success');
          },
          prefill: { name: 'Developer User', email: 'dev@takshacodespace.com' },
          theme: { color: '#3DC5A1' },
          modal: { ondismiss: () => setStatus('idle') },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
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

  // ── Success state ─────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px' }}>
        <div
          ref={successRef}
          style={{
            padding: '52px 44px', textAlign: 'center',
            background: 'var(--bg-surface)', border: '1px solid var(--border-glow)',
            borderRadius: 22, boxShadow: 'var(--shadow-green)',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Glow behind icon */}
          <div style={{
            position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
            width: 200, height: 120,
            background: 'radial-gradient(ellipse, rgba(61,197,161,0.18) 0%, transparent 70%)',
          }} />

          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
            background: 'var(--brand-subtle)', border: '1.5px solid var(--brand-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={36} style={{ color: 'var(--brand-primary)' }} />
          </div>

          <h2 style={{
            fontSize: '1.8rem', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            marginBottom: 12, letterSpacing: '-0.02em'
          }}>
            Upgrade Complete!
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.65 }}>
            Your account has been upgraded to <strong style={{ color: accentColor }}>{planInfo.label}</strong>.
            Your container resources and token quotas are now active.
          </p>

          {/* Receipt card */}
          <div style={{
            background: 'var(--bg-element)', borderRadius: 12, padding: '16px 20px',
            marginBottom: 28, textAlign: 'left',
            fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
            border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>// subscription receipt</div>
            <div style={{ color: 'var(--brand-primary)' }}>plan: <span style={{ color: 'var(--text-secondary)' }}>"{planInfo.label}"</span></div>
            <div style={{ color: 'var(--brand-primary)' }}>tier: <span style={{ color: 'var(--text-secondary)' }}>"{planInfo.tier}"</span></div>
            <div style={{ color: 'var(--brand-primary)' }}>billing: <span style={{ color: 'var(--text-secondary)' }}>"{billingCycle}"</span></div>
            <div style={{ color: 'var(--brand-primary)' }}>status: <span style={{ color: '#3DC5A1' }}>"ACTIVE"</span></div>
          </div>

          <button onClick={() => navigate('/status')} className="btn-primary" style={{ width: '100%', padding: 13, justifyContent: 'center' }}>
            View Subscription Dashboard <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Checkout form ─────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} style={{ maxWidth: 1000, margin: '40px auto', padding: '0 24px' }}>
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)',
          marginBottom: 28, transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <ArrowLeft size={16} /> Back to Plans
      </button>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 28 }}>

        {/* ── Left: Plan summary ──────────────────────────────────────── */}
        <div
          className="checkout-col"
          style={{
            background: `linear-gradient(135deg, rgba(${isMax ? '27,110,243' : '61,197,161'},0.08) 0%, rgba(14, 18, 30, 0.65) 100%)`,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: `1px solid ${accentColor}33`,
            borderRadius: 18, padding: '32px 30px',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            boxShadow: accentShadow, opacity: 0,
          }}
        >
          <div>
            <span style={{
              fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.06em', background: isMax ? 'var(--accent-subtle)' : 'var(--brand-subtle)',
              color: accentColor, padding: '4px 12px', borderRadius: 20,
              border: `1px solid ${accentColor}33`
            }}>
              Selected Tier
            </span>

            <h2 style={{
              fontSize: '2rem', fontWeight: 900, fontFamily: 'var(--font-heading)',
              color: 'var(--text-primary)', margin: '14px 0 8px', letterSpacing: '-0.025em'
            }}>
              {planInfo.label}
            </h2>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.55 }}>
              You are subscribing to the {planInfo.label} workspace sandbox.
            </p>

            <p style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 14 }}>
              Included Benefits
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {planInfo.features.map((feat, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: isMax ? 'var(--accent-subtle)' : 'var(--brand-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={12} style={{ color: accentColor }} />
                  </div>
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Lock size={18} style={{ color: accentColor, flexShrink: 0 }} />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>256-bit SSL secured.</strong> Your payment is processed safely via Razorpay.
            </p>
          </div>
        </div>

        {/* ── Right: Invoice + Pay ─────────────────────────────────────── */}
        <div
          className="checkout-col"
          style={{
            background: 'rgba(14, 18, 30, 0.65)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 18, padding: '32px 30px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            opacity: 0,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
                Invoice Detail
              </h3>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: accentColor }}>
                <ShieldCheck size={14} /> SSL Secure
              </span>
            </div>

            {/* Ledger */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{planInfo.label} ({billingCycle})</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>₹{planInfo.price}.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.87rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>GST / Platform Service Fee</span>
                <span style={{ color: 'var(--text-muted)' }}>Included</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.87rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Billing Cycle</span>
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{billingCycle}</span>
              </div>
              <div style={{
                borderTop: '1px dashed var(--border)', paddingTop: 16, marginTop: 4,
                display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800,
              }}>
                <span style={{ color: 'var(--text-primary)' }}>Amount Payable</span>
                <span style={{ color: accentColor }}>₹{planInfo.price}.00</span>
              </div>
            </div>

            {errorMsg && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                background: 'var(--red-subtle)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, color: 'var(--red-primary)', fontSize: '0.84rem', marginBottom: 18,
              }}>
                <AlertCircle size={16} /> {errorMsg}
              </div>
            )}
          </div>

          <div>
            <button
              onClick={handleRazorpayPayment}
              disabled={status === 'processing'}
              className={isMax ? 'btn-accent' : 'btn-primary'}
              style={{ width: '100%', padding: '14px', justifyContent: 'center', fontSize: '0.98rem' }}
            >
              {status === 'processing' ? (
                <><Loader2 size={18} className="animate-spin" /><span>Processing…</span></>
              ) : (
                <><CreditCard size={18} /><span>Pay ₹{planInfo.price} via Razorpay</span></>
              )}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.5 }}>
              By completing this payment you authorize immediate plan provisioning. Cancel anytime.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
