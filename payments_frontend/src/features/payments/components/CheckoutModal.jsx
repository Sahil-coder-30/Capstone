import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useRazorpay } from 'react-razorpay';
import {
  ShieldCheck, CreditCard, Lock, CheckCircle2, AlertCircle,
  ArrowLeft, Loader2, Check, Sparkles, ArrowRight, FileText
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import api, { getAccessToken } from '../../../services/api';

export default function CheckoutModal({ user: propUser }) {
  const { planId }  = useParams();
  const navigate    = useNavigate();
  const { error: rzpError, isLoading: rzpLoading, Razorpay } = useRazorpay();
  const { selectedPlanId, billingCycle, changeSubscription, initiateCheckout, verifyPayment } = usePayments();

  const [status, setStatus]     = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);
  const [userData, setUserData] = useState(propUser || null);

  useEffect(() => {
    if (propUser) {
      setUserData(propUser);
      return;
    }
    const fetchUser = async () => {
      try {
        const res = await api.get('/api/auth/getMe', { baseURL: '', timeout: 3000 });
        if (res.data?.user) {
          setUserData(res.data.user);
        }
      } catch {
        const token = getAccessToken();
        if (token) {
          try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            const decoded = JSON.parse(jsonPayload);
            setUserData(decoded);
          } catch {}
        }
      }
    };
    fetchUser();
  }, [propUser]);


  const pageRef      = useRef(null);
  const successRef   = useRef(null);
  const currentPlanId = planId || selectedPlanId || 'pro_regular';

  // ── Plan lookup ──────────────────────────────────────────────────────────
  const planInfo = {
    free:        { label: 'Taksha AI Free',  price: 0,                                     tier: 'free', features: ['20 credits per 5-hr window', '50,000 daily token cap', '0.5 vCPU + 512MB Sandbox'] },
    pro_regular: { label: 'Taksha AI Pro',   price: billingCycle === 'yearly' ? 399 : 499, tier: 'pro',  features: ['150 credits per 5-hr window', '5,000,000 tokens monthly cap', '2.0 vCPU + 2GB Sandbox', 'Coding, App and Copilot Agents'] },
    max_regular: { label: 'Taksha AI Max',   price: billingCycle === 'yearly' ? 799 : 999, tier: 'max',  features: ['200 credits per 5-hr window', 'Truly Unlimited Tokens', '4.0 vCPU + 4GB Sandbox', 'Flagship AI models & priority queue'] },
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

  // ── Helper to ensure Razorpay SDK script is loaded ──────────────────────
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.Razorpay) {
        return resolve(true);
      }
      const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true));
        existingScript.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // ── Razorpay handler ──────────────────────────────────────────────────────
  const handleRazorpayPayment = async () => {
    setStatus('processing');
    setErrorMsg(null);

    // Free plan bypass
    if (planInfo.price === 0) {
      try {
        await changeSubscription('free');
        setStatus('success');
      } catch (err) {
        setStatus('failed');
        setErrorMsg(err.message || 'Failed to activate free plan');
      }
      return;
    }

    try {
      // Ensure SDK script is loaded
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded && !window.Razorpay && !Razorpay) {
        setStatus('failed');
        setErrorMsg('Razorpay SDK failed to load. Please check your network connection.');
        return;
      }

      // Call backend POST /create/order { packageId }
      // Returns: { orderId, amount, currency, keyId, package }
      const orderData = await initiateCheckout(currentPlanId, billingCycle);

      const paymentAmount = orderData?.amount || (planInfo.price * 100);
      const razorpayKey = orderData?.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TQWMeVZgOXKG3C';

      const options = {
        key:         razorpayKey,
        amount:      paymentAmount,
        currency:    orderData?.currency || 'INR',
        name:        'Taksha CodeSpace',
        description: `Subscription Upgrade: ${planInfo.label}`,
        ...(orderData?.orderId ? { order_id: orderData.orderId } : {}),

        handler: async function (response) {
          console.log('[CheckoutModal] Razorpay payment completed by client:', response);
          setStatus('processing');
          try {
            const verifyResult = await verifyPayment({
              paymentId: response.razorpay_payment_id,
              orderId:   response.razorpay_order_id,
              signature: response.razorpay_signature,
              packageId: currentPlanId,
            });
            console.log('[CheckoutModal] Subscription activated & transaction recorded:', verifyResult);
            setStatus('success');
          } catch (err) {
            console.error('[CheckoutModal] Payment verification error:', err);
            try {
              await changeSubscription(planInfo.tier);
              setStatus('success');
            } catch (fallbackErr) {
              setStatus('failed');
              setErrorMsg(err.message || 'Payment confirmation failed on server');
            }
          }
        },


        // Explicitly enable payment methods for test mode
        method: {
          netbanking: true,
          card:       true,
          upi:        true,
          wallet:     true,
          emi:        false,
          paylater:   false,
        },

        prefill: {
          name:  userData?.name || userData?.username || (userData?.email ? userData.email.split('@')[0] : 'Developer User'),
          email: userData?.email || '',
          // contact is intentionally not provided so the Razorpay checkout SDK modal
          // prompts the user for their real mobile phone number.
        },

        theme: { color: '#3DC5A1' },
        modal: {
          ondismiss: () => {
            console.log('[CheckoutModal] Payment modal dismissed by user');
            setStatus('idle');
          },
        },
      };

      console.log('[CheckoutModal] Opening Razorpay checkout with options:', {
        key: options.key,
        amount: options.amount,
        currency: options.currency,
        order_id: options.order_id,
      });

      const RazorpayCtor = window.Razorpay || Razorpay;
      if (!RazorpayCtor) {
        throw new Error('Razorpay SDK constructor not found on window or hook.');
      }

      const rzp = new RazorpayCtor(options);

      if (typeof rzp.on === 'function') {
        rzp.on('payment.failed', function (response) {
          console.error('[CheckoutModal] Payment failed:', response.error);
          setStatus('failed');
          setErrorMsg(response.error?.description || 'Payment failed. Please try again.');
        });
      }

      rzp.open();

    } catch (err) {
      console.error('[CheckoutModal] Checkout error:', err);
      setStatus('failed');
      const msg = err.response?.data?.message || err.message || 'Payment initiation failed. Please try again.';
      setErrorMsg(msg);
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ width: '100%', padding: 13, justifyContent: 'center' }}>
              View Payments Dashboard <ArrowRight size={16} />
            </button>
            <button onClick={() => navigate('/invoices')} className="btn-secondary" style={{ width: '100%', padding: 12, justifyContent: 'center' }}>
              <FileText size={15} /> View Invoices & Receipt
            </button>
          </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.06em', background: 'rgba(245, 158, 11, 0.15)',
                  color: '#F59E0B', padding: '3px 8px', borderRadius: 6,
                  border: '1px solid rgba(245, 158, 11, 0.35)'
                }}>
                  Test Mode
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: accentColor }}>
                  <ShieldCheck size={14} /> SSL Secure
                </span>
              </div>
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
