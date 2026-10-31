import React from 'react';
import { X, Cpu, Database, Zap, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

export default function PlanDetailModal({ plan, billingCycle, onClose, onCheckout }) {
  if (!plan) return null;

  const displayPrice = () => {
    if (plan.priceINR === 0) return 'Free';
    const finalPrice = billingCycle === 'yearly' ? Math.round(plan.priceINR * 0.8) : plan.priceINR;
    return `₹${finalPrice}/month`;
  };

  const getSpecs = () => {
    switch (plan.tier) {
      case 'max':
        return [
          { label: 'Container Resources', val: '4.0 vCPU + 4GB RAM Dedicated', icon: <Cpu size={20} /> },
          { label: 'AI Token Allowance', val: 'Truly Unlimited / Uncapped', icon: <Zap size={20} /> },
          { label: 'Storage Quotas', val: '50GB Persistent SSD Workspace', icon: <Database size={20} /> },
          { label: 'Priority SLA Queue', val: 'Instant Sub-Second Execution', icon: <ShieldCheck size={20} /> }
        ];
      case 'pro':
        return [
          { label: 'Container Resources', val: '2.0 vCPU + 2GB RAM Isolated', icon: <Cpu size={20} /> },
          { label: 'AI Token Allowance', val: '5,000,000 Tokens / Month', icon: <Zap size={20} /> },
          { label: 'Storage Quotas', val: '20GB High Speed Workspace', icon: <Database size={20} /> },
          { label: 'Priority SLA Queue', val: 'Priority Queue Execution', icon: <ShieldCheck size={20} /> }
        ];
      default:
        return [
          { label: 'Container Resources', val: '0.5 vCPU + 512MB RAM Shared', icon: <Cpu size={20} /> },
          { label: 'AI Token Allowance', val: '50,000 Tokens / Day Cap', icon: <Zap size={20} /> },
          { label: 'Storage Quotas', val: '5GB Workspace Storage', icon: <Database size={20} /> },
          { label: 'Priority SLA Queue', val: 'Standard Community Queue', icon: <ShieldCheck size={20} /> }
        ];
    }
  };

  return (
    <div className="plan-detail-overlay" onClick={onClose}>
      <div className="plan-detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{plan.label} — Detailed Explanation</h2>
            <span style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 600 }}>
              Pricing: {displayPrice()}
            </span>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {plan.bannerImage && (
            <div className="detail-banner-hero">
              <img src={plan.bannerImage} alt={plan.label} />
            </div>
          )}

          <div>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', marginBottom: '0.5rem' }}>Overview & Capabilities</h3>
            <p style={{ color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>
              {plan.description} Built specifically for engineers and development teams requiring high-performance isolated sandboxes, automated AI agent workflows, and seamless cloud execution.
            </p>
          </div>

          <div>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', marginBottom: '1rem' }}>Hardware & Infrastructure Specifications</h3>
            <div className="specs-grid">
              {getSpecs().map((spec, idx) => (
                <div key={idx} className="spec-item">
                  <div className="spec-icon">{spec.icon}</div>
                  <div className="spec-text">
                    <span className="label">{spec.label}</span>
                    <span className="val">{spec.val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', marginBottom: '1rem' }}>Key Features Included</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
              {plan.highlights.map((h, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1', fontSize: '0.875rem' }}>
                  <CheckCircle2 size={16} color="#22c55e" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '1rem' }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close Breakdown
            </button>
            <button
              onClick={() => {
                onClose();
                onCheckout(plan.id);
              }}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                border: 'none',
                color: '#fff',
                padding: '10px 24px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>Select {plan.label}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
