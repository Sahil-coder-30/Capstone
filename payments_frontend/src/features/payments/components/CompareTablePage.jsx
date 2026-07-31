import React, { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, Minus, ArrowLeft, ArrowRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const CATEGORIES = [
  {
    name: 'AI Model Quotas & Token Limits',
    features: [
      { title: 'Daily Token Bucket Cap',                      free: '50,000 / day',    pro: 'Uncapped',             max: 'Truly Unlimited' },
      { title: 'Monthly Token Quota',                         free: '1,500,000',        pro: '5,000,000',            max: 'Unlimited (No Throttle)' },
      { title: 'Provider Credits (Gemini, Mistral, OpenAI)',  free: '20 per company',   pro: 'Metered Billed',       max: 'Uncapped Priority' },
      { title: 'Context Window Extension',                    free: 'Standard (8K)',    pro: 'Expanded (32K)',       max: 'Full Context (128K+)' },
    ],
  },
  {
    name: 'Cloud Sandbox Infrastructure',
    features: [
      { title: 'Container Hardware Specs',         free: '0.5 vCPU, 512MB RAM', pro: '2.0 vCPU, 2GB RAM',  max: '4.0 vCPU, 4GB RAM' },
      { title: 'Persistent SSD Storage',           free: '1 GB Storage',         pro: '10 GB High-Speed',    max: '50 GB NVMe' },
      { title: 'Parallel Execution Threads',       free: '1 Task',               pro: '3 Tasks',             max: '10 Tasks' },
      { title: 'Isolated Sub-second Execution',    free: true,                   pro: true,                  max: true },
    ],
  },
  {
    name: 'AI Agent Architectures',
    features: [
      { title: 'Taksha Coding Agent',                  free: true,  pro: true,  max: true },
      { title: 'Inline Copilot Autocomplete',          free: true,  pro: true,  max: true },
      { title: 'Taksha App Agent (Full Stack)',         free: false, pro: true,  max: true },
      { title: 'Autonomous Multi-Agent Orchestrator',  free: false, pro: false, max: true },
    ],
  },
  {
    name: 'Support & Security SLA',
    features: [
      { title: 'HMAC Webhook Verified Billing',  free: true,          pro: true,            max: true },
      { title: 'Itemized Invoice Downloads',     free: true,          pro: true,            max: true },
      { title: 'Support Response SLA',           free: 'Community',   pro: '< 12h Priority', max: '< 1h Dedicated' },
    ],
  },
];

const renderVal = (val, colColor) => {
  if (val === true)  return <Check size={18} style={{ color: 'var(--brand-primary)', margin: '0 auto' }} />;
  if (val === false) return <Minus size={18} style={{ color: 'var(--text-disabled)', margin: '0 auto' }} />;
  return <span style={{ fontSize: '0.84rem', fontWeight: 500, color: colColor || 'var(--text-secondary)' }}>{val}</span>;
};

export default function CompareTablePage() {
  const navigate = useNavigate();
  const pageRef  = useRef(null);

  useGSAP(() => {
    gsap.fromTo('#compare-header',
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
    );
    ScrollTrigger.batch('tr.compare-row', {
      start: 'top 90%',
      onEnter: (batch) => gsap.fromTo(batch,
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.04 }
      ),
    });
  }, { scope: pageRef });

  return (
    <div ref={pageRef} style={{ minHeight: '100vh', background: 'transparent' }}>
      <main style={{ maxWidth: 1140, margin: '0 auto', padding: '100px 24px 60px' }}>

        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)',
            marginBottom: 40, transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <ArrowLeft size={16} /> Back to Plans
        </button>

        <div id="compare-header" style={{ textAlign: 'center', marginBottom: 52 }}>
          <div className="section-label" style={{ justifyContent: 'center', marginBottom: 16 }}>
            Full Feature Breakdown
          </div>
          <h1 className="section-title">Compare Taksha AI Plans</h1>
          <p className="section-subtitle" style={{ margin: '0 auto', maxWidth: 560 }}>
            Every feature, side by side. Pick the plan that matches your compute and token needs.
          </p>
        </div>

        {/* Sticky header table */}
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th style={{ padding: '20px 28px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)', width: '38%', textAlign: 'left' }}>
                  Features & Capabilities
                </th>
                <th style={{ padding: '20px 20px', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center', width: '20%' }}>
                  Taksha Free
                </th>
                <th style={{ padding: '20px 20px', fontSize: '0.92rem', fontWeight: 800, color: 'var(--brand-primary)', textAlign: 'center', width: '21%', background: 'rgba(61,197,161,0.04)' }}>
                  Pro — ₹499/mo
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-primary)', margin: '4px auto 0' }} />
                </th>
                <th style={{ padding: '20px 20px', fontSize: '0.92rem', fontWeight: 800, color: 'var(--accent-primary)', textAlign: 'center', width: '21%' }}>
                  Max — ₹999/mo
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat, cIdx) => (
                <React.Fragment key={cIdx}>
                  <tr style={{ background: 'rgba(var(--color-rgb-text), 0.015)' }}>
                    <td colSpan={4} style={{
                      padding: '12px 28px', fontSize: '0.78rem', fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)',
                      borderTop: cIdx > 0 ? '1px solid var(--border)' : 'none',
                    }}>
                      {cat.name}
                    </td>
                  </tr>
                  {cat.features.map((feat, fIdx) => (
                    <tr key={fIdx} className="compare-row">
                      <td style={{ padding: '14px 28px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                        {feat.title}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {renderVal(feat.free)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center', background: 'rgba(61,197,161,0.02)' }}>
                        {renderVal(feat.pro, 'var(--brand-primary)')}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        {renderVal(feat.max, 'var(--accent-primary)')}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* CTA row below table */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20, marginTop: 32,
        }}>
          {[
            { planId: 'free',        label: 'Get started free', cls: 'btn-secondary', color: 'var(--text-muted)' },
            { planId: 'pro_regular', label: 'Upgrade to Pro → ₹499/mo',  cls: 'btn-primary',   color: 'var(--brand-primary)' },
            { planId: 'max_regular', label: 'Upgrade to Max → ₹999/mo',  cls: 'btn-accent',    color: 'var(--accent-primary)' },
          ].map((cta) => (
            <button
              key={cta.planId}
              className={cta.cls}
              onClick={() => navigate(cta.planId === 'free' ? '/' : `/checkout/${cta.planId}`)}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {cta.label} {cta.planId !== 'free' && <ArrowRight size={15} />}
            </button>
          ))}
        </div>

      </main>
    </div>
  );
}
