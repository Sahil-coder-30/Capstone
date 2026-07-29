import React from 'react';
import { X, Cpu, HardDrive, ShieldCheck, Zap, Layers } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

export default function PlanDetailModal() {
  const { detailPlanId, closePlanDetail } = usePayments();

  const planSpecs = {
    free: {
      title: 'Taksha AI Free Tier',
      vCPU: '0.5 vCPU',
      RAM: '512 MB Shared RAM',
      Storage: '1 GB SSD Workspace',
      DailyTokens: '50,000 tokens / day',
      MonthlyTokens: '1,500,000 max',
      Agents: ['Coding Agent', 'Basic Copilot'],
      Models: ['Mistral 7B', 'Gemini Flash'],
      Concurrency: '1 parallel task',
    },
    pro_regular: {
      title: 'Taksha AI Pro Tier',
      vCPU: '2.0 Dedicated vCPU',
      RAM: '2 GB Dedicated RAM',
      Storage: '10 GB Persistent SSD',
      DailyTokens: 'Uncapped Daily',
      MonthlyTokens: '5,000,000 tokens / mo',
      Agents: ['Coding Agent', 'Copilot', 'App Agent', 'Debugger'],
      Models: ['Claude 3.5 Sonnet', 'GPT-4o', 'Gemini 1.5 Pro', 'Mistral Large'],
      Concurrency: '3 parallel tasks',
    },
    max_regular: {
      title: 'Taksha AI Max Tier',
      vCPU: '4.0 Dedicated High-Perf vCPU',
      RAM: '4 GB High-Speed RAM',
      Storage: '50 GB Dedicated NVMe SSD',
      DailyTokens: 'Truly Unlimited',
      MonthlyTokens: 'Unlimited (No Throttling)',
      Agents: ['All Agents + Custom Agent Architectures'],
      Models: ['All Flagship & Custom Fine-tuned LLMs'],
      Concurrency: '10 parallel tasks',
    },
  };

  const currentSpec = planSpecs[detailPlanId] || planSpecs.pro_regular;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="animate-slideUp"
        style={{
          width: '100%',
          maxWidth: '540px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          position: 'relative',
        }}
      >
        <button
          onClick={closePlanDetail}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'var(--bg-element)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <X size={16} />
        </button>

        <h3 style={{ fontSize: '1.3rem', fontWeight: '700', fontFamily: 'var(--font-heading)', marginBottom: '16px', color: 'var(--text-primary)' }}>
          {currentSpec.title} — Detailed Specifications
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={{ padding: '12px', background: 'var(--bg-element)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <Cpu size={14} /> vCPU Compute
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-primary)' }}>{currentSpec.vCPU}</div>
          </div>

          <div style={{ padding: '12px', background: 'var(--bg-element)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <HardDrive size={14} /> RAM Memory
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-primary)' }}>{currentSpec.RAM}</div>
          </div>

          <div style={{ padding: '12px', background: 'var(--bg-element)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <Zap size={14} /> Daily Token Quota
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-primary)' }}>{currentSpec.DailyTokens}</div>
          </div>

          <div style={{ padding: '12px', background: 'var(--bg-element)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <Layers size={14} /> Parallel Tasks
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-primary)' }}>{currentSpec.Concurrency}</div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px' }}>Available LLM Models</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {currentSpec.Models.map((m, idx) => (
              <span key={idx} style={{ padding: '4px 10px', background: 'var(--brand-subtle)', color: 'var(--brand-primary)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '500' }}>
                {m}
              </span>
            ))}
          </div>
        </div>

        <button onClick={closePlanDetail} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
          Close Details
        </button>
      </div>
    </div>
  );
}
