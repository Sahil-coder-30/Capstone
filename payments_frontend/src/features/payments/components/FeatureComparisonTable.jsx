import React from 'react';
import { Check, Minus } from 'lucide-react';

export default function FeatureComparisonTable() {
  const categories = [
    {
      name: 'AI Model Quotas & Token Limits',
      features: [
        { title: 'Daily Token Bucket Cap', free: '50,000 / day', pro: 'Uncapped', max: 'Truly Unlimited' },
        { title: 'Monthly Token Quota', free: '1,500,000', pro: '5,000,000', max: 'Unlimited (No Throttle)' },
        { title: 'Provider Credits (Gemini, Mistral, OpenAI)', free: '20 per company', pro: 'Metered Billed', max: 'Uncapped Priority' },
        { title: 'Context Window Extension', free: 'Standard (8K)', pro: 'Expanded (32K)', max: 'Full Context (128K+)' },
      ],
    },
    {
      name: 'Cloud Sandbox Infrastructure',
      features: [
        { title: 'Container Hardware Specs', free: '0.5 vCPU, 512MB RAM', pro: '2.0 vCPU, 2GB RAM', max: '4.0 vCPU, 4GB RAM' },
        { title: 'Persistent SSD Storage', free: '1 GB Storage', pro: '10 GB High-Speed SSD', max: '50 GB Dedicated NVMe' },
        { title: 'Parallel Execution Threads', free: '1 Task', pro: '3 Tasks', max: '10 Tasks' },
        { title: 'Isolated Sub-second Execution', free: true, pro: true, max: true },
      ],
    },
    {
      name: 'AI Agent Architectures',
      features: [
        { title: 'Taksha Coding Agent', free: true, pro: true, max: true },
        { title: 'Inline Copilot Autocomplete', free: true, pro: true, max: true },
        { title: 'Taksha App Agent (Full Stack)', free: false, pro: true, max: true },
        { title: 'Autonomous Multi-Agent Orchestrator', free: false, pro: false, max: true },
      ],
    },
    {
      name: 'Support & Security SLA',
      features: [
        { title: 'HMAC Webhook Verified Billing', free: true, pro: true, max: true },
        { title: 'Itemized Invoice Downloads (PDF)', free: true, pro: true, max: true },
        { title: 'Support Response SLA', free: 'Community', pro: '< 12 Hours Priority', max: '< 1 Hour Dedicated Tech Manager' },
      ],
    },
  ];

  const renderVal = (val) => {
    if (val === true) return <Check size={18} style={{ color: 'var(--brand-primary)', margin: '0 auto' }} />;
    if (val === false) return <Minus size={18} style={{ color: 'var(--text-disabled)', margin: '0 auto' }} />;
    return <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>{val}</span>;
  };

  return (
    <section style={{ margin: '60px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Detailed Feature Comparison Matrix
        </h2>
        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>
          Compare container hardware, LLM model access, and token limits across all Taksha AI plans.
        </p>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-element)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '18px 24px', fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', width: '40%' }}>
                Features & Capabilities
              </th>
              <th style={{ padding: '18px 20px', fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'center', width: '20%' }}>
                Taksha Free
              </th>
              <th style={{ padding: '18px 20px', fontSize: '0.9rem', fontWeight: '700', color: 'var(--brand-primary)', textAlign: 'center', width: '20%' }}>
                Taksha Pro (₹499)
              </th>
              <th style={{ padding: '18px 20px', fontSize: '0.9rem', fontWeight: '700', color: 'var(--accent-primary)', textAlign: 'center', width: '20%' }}>
                Taksha Max (₹999)
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, cIdx) => (
              <React.Fragment key={cIdx}>
                <tr style={{ background: 'rgba(var(--color-rgb-text), 0.02)', borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={4} style={{ padding: '12px 24px', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    {cat.name}
                  </td>
                </tr>
                {cat.features.map((feat, fIdx) => (
                  <tr key={fIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 24px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      {feat.title}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {renderVal(feat.free)}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-primary)' }}>
                      {renderVal(feat.pro)}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-primary)' }}>
                      {renderVal(feat.max)}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
