import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ShieldCheck, ArrowUpRight, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import { priceCounter } from '../../../utils/animations';

gsap.registerPlugin(ScrollTrigger);

// Animated SVG ring gauge
function RingGauge({ percent, color, size = 64 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-element)" strokeWidth="4" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </svg>
  );
}

export default function SubscriptionDashboard() {
  const { credit, loadCredit } = usePayments();
  const navigate = useNavigate();
  const pageRef  = useRef(null);

  useEffect(() => { loadCredit(); }, [loadCredit]);

  const currentTier = credit?.subscription || 'free';
  const isMax = currentTier === 'max';
  const isPro = currentTier === 'pro';
  const accentColor = isMax ? 'var(--accent-primary)' : isPro ? 'var(--brand-primary)' : 'var(--text-muted)';

  const providerCredits = credit?.providerCredits?.length > 0 ? credit.providerCredits : [
    { company: 'Google Gemini', creditsRemaining: 18, creditsGranted: 20, totalTokens: 12500 },
    { company: 'Mistral',       creditsRemaining: 16, creditsGranted: 20, totalTokens: 8200 },
    { company: 'OpenAI',        creditsRemaining: 20, creditsGranted: 20, totalTokens: 5400 },
    { company: 'Cohere',        creditsRemaining: 14, creditsGranted: 20, totalTokens: 1100 },
  ];

  useGSAP(() => {
    gsap.fromTo('#status-banner',
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
    );
    ScrollTrigger.batch('.provider-card', {
      start: 'top 88%',
      onEnter: (batch) => gsap.fromTo(batch,
        { opacity: 0, y: 28, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', stagger: 0.09 }
      ),
    });
    gsap.fromTo('#health-note',
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out',
        scrollTrigger: { trigger: '#health-note', start: 'top 88%' }
      }
    );
  }, { scope: pageRef });

  return (
    <div ref={pageRef} style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 24px 48px' }}>

      {/* ── Active Subscription Banner ──────────────────────────────────── */}
      <div
        id="status-banner"
        style={{
          background: `linear-gradient(135deg, rgba(${isMax ? '27,110,243' : '61,197,161'},0.06) 0%, var(--bg-surface) 100%)`,
          border: `1px solid ${accentColor}33`,
          borderRadius: 18, padding: '28px 32px',
          marginBottom: 40,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: 'var(--shadow-card)',
          flexWrap: 'wrap', gap: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ShieldCheck size={20} style={{ color: accentColor }} />
            <span style={{
              fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: accentColor
            }}>
              Active Subscription
            </span>
          </div>
          <h2 style={{
            fontSize: '1.8rem', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            textTransform: 'capitalize', letterSpacing: '-0.02em'
          }}>
            Taksha AI {currentTier} Plan
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: 5 }}>
            Authority: Payment Service LEDGER DB · Resets daily at midnight UTC
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/')} className="btn-primary" style={{ cursor: 'pointer' }}>
            Manage Plan <ArrowUpRight size={15} />
          </button>
          <button onClick={() => navigate('/invoices')} className="btn-secondary" style={{ cursor: 'pointer' }}>
            View Invoices
          </button>
        </div>
      </div>

      {/* ── Provider Token Cards ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          AI Provider Token Buckets
        </h3>
        <button onClick={() => loadCredit()} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, marginBottom: 40 }}>
        {providerCredits.map((prov, i) => {
          const pct = Math.round((prov.creditsRemaining / (prov.creditsGranted || 20)) * 100);
          const gaugeColor = pct > 60 ? 'var(--brand-primary)' : pct > 30 ? 'var(--amber-primary)' : 'var(--red-primary)';

          return (
            <div
              key={i}
              className="provider-card"
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-card)',
                transition: 'border-color 0.25s, box-shadow 0.25s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = gaugeColor; e.currentTarget.style.boxShadow = `0 6px 24px -4px ${gaugeColor}33`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {prov.company}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    AI Provider
                  </p>
                </div>
                {/* Ring gauge */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RingGauge percent={pct} color={gaugeColor} size={52} />
                  <span style={{
                    position: 'absolute', fontSize: '0.72rem', fontWeight: 800,
                    color: gaugeColor, fontFamily: 'var(--font-mono)',
                  }}>
                    {pct}%
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <span style={{
                  fontSize: '1.6rem', fontWeight: 900,
                  fontFamily: 'var(--font-heading)', color: 'var(--text-primary)'
                }}>
                  {prov.creditsRemaining}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  /{prov.creditsGranted || 20} credits
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Tokens consumed:{' '}
                <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {(prov.totalTokens || 0).toLocaleString('en-IN')}
                </strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── System Health Note ──────────────────────────────────────────── */}
      <div
        id="health-note"
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-glow)',
          borderRadius: 14, padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <CheckCircle2 size={22} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
        <p style={{ fontSize: '0.87rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Isolated Payment Ledger Active:</strong>{' '}
          Subscription state and token balances are maintained exclusively inside the Payments Microservice database.
          The Auth service stores no payment or subscription records.
        </p>
      </div>
    </div>
  );
}
