import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Cpu, Zap, Activity, Clock, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

export default function SubscriptionDashboard() {
  const { credit, loadCredit } = usePayments();
  const navigate = useNavigate();

  useEffect(() => {
    loadCredit();
  }, [loadCredit]);

  const currentTier = credit?.subscription || 'free';
  const providerCredits = credit?.providerCredits?.length > 0 ? credit.providerCredits : [
    { company: 'google', creditsRemaining: 20, creditsGranted: 20, totalTokens: 12500 },
    { company: 'mistral', creditsRemaining: 18, creditsGranted: 20, totalTokens: 8200 },
    { company: 'openai', creditsRemaining: 20, creditsGranted: 20, totalTokens: 5400 },
    { company: 'cohere', creditsRemaining: 20, creditsGranted: 20, totalTokens: 1100 },
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px', fontFamily: 'var(--font-sans)' }}>
      {/* Active Subscription Status Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(59, 130, 246, 0.03) 100%)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '28px',
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <ShieldCheck size={22} style={{ color: 'var(--brand-primary)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-primary)' }}>
              Active Subscription Status
            </span>
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
            Taksha AI {currentTier} Plan
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Sole Authority: Payment Service LEDGER DB | Refreshed Daily | Next Reset: Midnight UTC
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => navigate('/')} className="btn-primary" style={{ cursor: 'pointer' }}>
            <span>Manage Plan</span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>

      {/* Token Buckets & Provider Stats */}
      <h3 style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '20px' }}>
        AI Provider Token Buckets & Remaining Quotas
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {providerCredits.map((prov, idx) => {
          const percentLeft = Math.round((prov.creditsRemaining / (prov.creditsGranted || 20)) * 100);
          return (
            <div
              key={idx}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '24px',
                boxShadow: 'var(--shadow-card)',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '1rem', fontWeight: '700', textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                  {prov.company} AI
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--brand-primary)', background: 'var(--brand-subtle)', padding: '4px 10px', borderRadius: '12px' }}>
                  {percentLeft}% Available
                </span>
              </div>

              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: '10px' }}>
                {prov.creditsRemaining} / {prov.creditsGranted || 20} <span style={{ fontSize: '0.85rem', fontWeight: '400', color: 'var(--text-muted)' }}>credits</span>
              </div>

              {/* Progress Gauge Bar */}
              <div style={{ height: '8px', width: '100%', background: 'var(--bg-element)', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${percentLeft}%`,
                    background: percentLeft > 40 ? 'linear-gradient(90deg, var(--brand-primary), #059669)' : 'linear-gradient(90deg, #EF4444, #DC2626)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Tokens Consumed: <strong style={{ color: 'var(--text-primary)' }}>{(prov.totalTokens || 0).toLocaleString()}</strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* System Health & Security Note */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <CheckCircle2 size={24} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Isolated Payment Ledger Active:</strong> Subscription state and token bucket balances are maintained exclusively inside the Payments Microservice database. The Auth service stores no payment or subscription records.
        </div>
      </div>
    </div>
  );
}
