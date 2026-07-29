import React from 'react';
import { Check, Sparkles, Zap, Shield, ArrowRight } from 'lucide-react';

export default function PlanCard({ plan, billingCycle, isCurrent, onSelectPlan }) {
  const isYearly = billingCycle === 'yearly';
  const effectivePrice = isYearly
    ? Math.round(plan.priceINR * 0.8)
    : plan.priceINR;

  const isPopular = plan.popular;
  const isMax = plan.tier === 'max';

  return (
    <div
      className={`plan-card-container ${isPopular ? 'popular-plan' : ''} ${isMax ? 'max-plan' : ''}`}
      style={{
        position: 'relative',
        background: isPopular
          ? 'linear-gradient(180deg, var(--bg-overlay) 0%, var(--bg-surface) 100%)'
          : 'var(--bg-surface)',
        border: isPopular
          ? '2px solid var(--brand-primary)'
          : isMax
          ? '2px solid var(--accent-primary)'
          : '1px solid var(--border)',
        borderRadius: '16px',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: isPopular
          ? '0 12px 30px -5px rgba(16, 185, 129, 0.18)'
          : isMax
          ? '0 12px 30px -5px rgba(59, 130, 246, 0.18)'
          : 'var(--shadow-card)',
      }}
    >
      {/* Top Badge */}
      {plan.badge && (
        <div
          style={{
            position: 'absolute',
            top: '-12px',
            right: '24px',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '0.72rem',
            fontWeight: '700',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: isPopular
              ? 'linear-gradient(135deg, #10B981, #059669)'
              : isMax
              ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)'
              : 'var(--bg-element)',
            color: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {plan.badge}
        </div>
      )}

      <div>
        {/* Card Header */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            {plan.tier === 'free' && <Zap size={20} style={{ color: 'var(--text-muted)' }} />}
            {plan.tier === 'pro' && <Sparkles size={20} style={{ color: 'var(--brand-primary)' }} />}
            {plan.tier === 'max' && <Shield size={20} style={{ color: 'var(--accent-primary)' }} />}
            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
              {plan.label}
            </h3>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', minHeight: '42px', lineHeight: '1.4' }}>
            {plan.description}
          </p>
        </div>

        {/* Price Display */}
        <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '2.4rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
              ₹{effectivePrice}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ month</span>
          </div>
          {isYearly && plan.priceINR > 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--brand-primary)', marginTop: '4px', fontWeight: '600' }}>
              Billed annually (save ₹{plan.priceINR * 12 - effectivePrice * 12}/yr)
            </p>
          )}
        </div>

        {/* Plan Highlights Checklist */}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
          {plan.highlights.map((feat, idx) => (
            <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: isPopular
                    ? 'var(--brand-subtle)'
                    : isMax
                    ? 'var(--accent-subtle)'
                    : 'var(--bg-element)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <Check
                  size={12}
                  style={{
                    color: isPopular
                      ? 'var(--brand-primary)'
                      : isMax
                      ? 'var(--accent-primary)'
                      : 'var(--text-muted)',
                  }}
                />
              </div>
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA Button */}
      <div>
        {isCurrent ? (
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: '600',
              fontSize: '0.9rem',
              background: 'var(--bg-element)',
              color: 'var(--brand-primary)',
              border: '1px solid var(--border)',
            }}
          >
            ✓ Current Active Plan
          </div>
        ) : (
          <button
            onClick={() => onSelectPlan(plan.id)}
            className={isPopular ? 'btn-primary' : 'btn-secondary'}
            style={{
              width: '100%',
              padding: '12px',
              justifyContent: 'center',
              fontSize: '0.92rem',
            }}
          >
            <span>{plan.priceINR === 0 ? 'Downgrade to Free' : `Upgrade to ${plan.label}`}</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
