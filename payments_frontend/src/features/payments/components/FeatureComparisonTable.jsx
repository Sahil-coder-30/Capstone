import React from 'react';
import { Check, Minus } from 'lucide-react';
import ShinyText from '../../../components/reactbits/ShinyText';

const CATEGORIES = [
  {
    name: 'AI Model Quotas & Token Limits',
    features: [
      { title: 'Daily Token Bucket Cap',                     free: '50,000 / day',   pro: 'Uncapped',           max: 'Truly Unlimited' },
      { title: 'Monthly Token Quota',                        free: '1,500,000',       pro: '5,000,000',          max: 'Unlimited (No Throttle)' },
      { title: 'Provider Credits (Gemini, Mistral, OpenAI)', free: '20 per company',  pro: 'Metered Billed',     max: 'Uncapped Priority' },
      { title: 'Context Window Extension',                   free: 'Standard (8K)',   pro: 'Expanded (32K)',     max: 'Full Context (128K+)' },
    ],
  },
  {
    name: 'Cloud Sandbox Infrastructure',
    features: [
      { title: 'Container Hardware Specs',       free: '0.5 vCPU, 512MB',  pro: '2.0 vCPU, 2GB RAM',  max: '4.0 vCPU, 4GB RAM' },
      { title: 'Persistent SSD Storage',         free: '1 GB',              pro: '10 GB High-Speed',    max: '50 GB NVMe' },
      { title: 'Parallel Execution Threads',     free: '1 Task',            pro: '3 Tasks',             max: '10 Tasks' },
      { title: 'Isolated Sub-second Execution',  free: true,                pro: true,                  max: true },
    ],
  },
  {
    name: 'AI Agent Architectures',
    features: [
      { title: 'Taksha Coding Agent',                 free: true,  pro: true,  max: true },
      { title: 'Inline Copilot Autocomplete',         free: true,  pro: true,  max: true },
      { title: 'Taksha App Agent (Full Stack)',        free: false, pro: true,  max: true },
      { title: 'Autonomous Multi-Agent Orchestrator', free: false, pro: false, max: true },
    ],
  },
  {
    name: 'Support & Security SLA',
    features: [
      { title: 'HMAC Webhook Verified Billing', free: true,        pro: true,            max: true },
      { title: 'Itemized Invoice Downloads',    free: true,        pro: true,            max: true },
      { title: 'Support Response SLA',          free: 'Community', pro: '< 12h Priority', max: '< 1h Dedicated' },
    ],
  },
];

const renderVal = (val, color = 'var(--text-secondary)') => {
  if (val === true)  return <Check size={17} style={{ color: 'var(--brand-primary)', margin: '0 auto' }} />;
  if (val === false) return <Minus size={17} style={{ color: 'var(--text-disabled)', margin: '0 auto' }} />;
  if (typeof val === 'string' && (val.includes('Unlimited') || val.includes('Uncapped') || val.includes('Full Context'))) {
    return (
      <ShinyText
        text={val}
        color="#1B6EF3"
        shineColor="#FFFFFF"
        speed={2.5}
        spread={100}
      />
    );
  }
  return <span style={{ fontSize: '0.83rem', fontWeight: 500, color }}>{val}</span>;
};

export default function FeatureComparisonTable() {
  return (
    <div className="compare-table-wrap">
      <table className="compare-table" aria-label="Taksha AI Plan Feature Comparison">
        <thead>
          <tr>
            <th style={{ padding: '18px 24px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', width: '40%', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Features & Capabilities
            </th>
            <th style={{ padding: '18px 20px', fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center', width: '20%' }}>
              Free
            </th>
            <th style={{ padding: '18px 20px', fontSize: '0.9rem', fontWeight: 800, color: 'var(--brand-primary)', textAlign: 'center', width: '20%', background: 'rgba(61,197,161,0.04)' }}>
              Pro
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-primary)', margin: '4px auto 0' }} />
            </th>
            <th style={{ padding: '18px 20px', fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-primary)', textAlign: 'center', width: '20%' }}>
              Max
            </th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat, cIdx) => (
            <React.Fragment key={cIdx}>
              <tr style={{ background: 'rgba(var(--color-rgb-text), 0.015)' }}>
                <td colSpan={4} style={{
                  padding: '11px 24px',
                  fontSize: '0.76rem', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: 'var(--text-muted)',
                  borderTop: cIdx > 0 ? '1px solid var(--border)' : 'none',
                }}>
                  {cat.name}
                </td>
              </tr>
              {cat.features.map((feat, fIdx) => (
                <tr key={fIdx} className="feat-row" style={{ borderTop: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--color-rgb-text),0.02)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 24px', fontSize: '0.87rem', color: 'var(--text-secondary)' }}>
                    {feat.title}
                  </td>
                  <td style={{ padding: '13px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {renderVal(feat.free)}
                  </td>
                  <td style={{ padding: '13px 20px', textAlign: 'center', background: 'rgba(61,197,161,0.02)' }}>
                    {renderVal(feat.pro)}
                  </td>
                  <td style={{ padding: '13px 20px', textAlign: 'center' }}>
                    {renderVal(feat.max)}
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
