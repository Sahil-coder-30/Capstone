import { 
  RefreshCw, Cpu, Database, CheckCircle2, Coins, ArrowUpRight, Sparkles, 
  Zap, ArrowRight, ShieldCheck, CreditCard, ChevronRight
} from 'lucide-react';

export default function SettingsBillingPage({ 
  projectsCount = 2, 
  onSyncLimits, 
  credit = { credits: 20, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  onRefreshCredit,
  onNavigatePayments
}) {
  const creditsRemaining = credit?.credits !== undefined ? credit.credits : 20;
  const subscription = credit?.subscription || 'free';
  const providerCredits = credit?.providerCredits || [];
  const unbilledCents = credit?.billing?.unbilledCents || 0;
  const lifetimeCents = credit?.billing?.lifetimeCents || 0;
  const centsPer1kTokens = credit?.billingRate?.centsPer1kTokens || 2;
  const promptTokens = credit?.promptTokens || 0;
  const completionTokens = credit?.completionTokens || 0;
  const totalTokens = credit?.totalTokens || 0;

  const creditPercentage = Math.min(100, Math.max(0, (creditsRemaining / 20) * 100));
  const formatCurrency = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
  const planLabel = subscription.charAt(0).toUpperCase() + subscription.slice(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: 'var(--font-sans)', paddingBottom: '32px' }}>
      
      {/* 1. Subscription & Payments Banner Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(59,130,246,0.06) 100%)', 
        backgroundColor: 'var(--bg-surface)', padding: '28px', borderRadius: '14px', 
        border: '1px solid var(--border-strong)', display: 'flex', justifyContent: 'space-between', 
        alignItems: 'center', flexWrap: 'wrap', gap: '20px', boxShadow: '0 6px 24px rgba(0,0,0,0.15)', position: 'relative'
      }}>
        <div style={{ position: 'absolute', top: '10px', right: '10px', opacity: 0.15, pointerEvents: 'none' }}>
          <Sparkles size={90} color="var(--primary)" />
        </div>

        <div>
          <span style={{ 
            fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em',
            backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '4px 10px', borderRadius: '12px',
            border: '1px solid rgba(16,185,129,0.3)'
          }}>
            Current Plan: {planLabel} Tier
          </span>
          <h2 style={{ fontSize: '22px', fontWeight: '900', color: 'var(--text-primary)', margin: '8px 0 4px', letterSpacing: '-0.02em' }}>
            Account Subscription & Usage Limits
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-dark)', margin: 0, maxWidth: '480px', lineHeight: '1.5' }}>
            You are currently on the <strong>{planLabel}</strong> subscription. Upgrade your tier to unlock higher vCPU sandboxes, multi-agent AI orchestration, and priority execution.
          </p>
        </div>

        <button
          onClick={onNavigatePayments}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px',
            backgroundColor: 'var(--primary)', color: '#000', fontSize: '13.5px', fontWeight: '800',
            border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(16,185,129,0.3)', transition: 'all 0.15s'
          }}
        >
          <Zap size={16} /> Manage Subscription & Plans <ArrowRight size={14} />
        </button>
      </div>

      {/* 2. Credit Balance & Provider Quotas Card */}
      <div style={{ 
        backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', 
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Coins size={16} color="var(--primary)" /> AI Credits & Provider Quotas
          </h3>
          <button 
            onClick={onRefreshCredit}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', 
              color: 'var(--text-dark)', backgroundColor: 'var(--bg-element)', padding: '5px 10px', 
              borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer' 
            }}
          >
            <RefreshCw size={11} /> Refresh Credits
          </button>
        </div>

        {/* Credit Gauge and Summary */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 250px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: '700', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>REMAINING FREE CREDITS</span>
              <span style={{ color: 'var(--primary)', fontWeight: '800' }}>
                {creditsRemaining.toFixed(2)} / 20.00 Credits
              </span>
            </div>
            
            <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--bg-canvas)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div 
                style={{ 
                  width: `${creditPercentage}%`, height: '100%',
                  background: 'linear-gradient(90deg, #10B981, #059669)', borderRadius: '6px',
                  boxShadow: '0 0 10px rgba(16,185,129,0.3)', transition: 'width 0.5s ease-out'
                }} 
              />
            </div>
            
            <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '10px', margin: '10px 0 0', lineHeight: '1.5' }}>
              Free tier accounts receive 20 credits per model provider. Pro & Max plans feature un-capped metered AI processing.
            </p>
          </div>

          <div style={{ 
            background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: '10px', 
            padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', 
            alignItems: 'center', minWidth: '160px', height: '90px'
          }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your Balance</span>
            <h2 style={{ fontSize: '26px', fontWeight: '900', color: 'var(--primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
              {creditsRemaining.toFixed(2)}
            </h2>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Credits Left</span>
          </div>
        </div>

        {/* Provider Credit Buckets Grid */}
        {providerCredits.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            {providerCredits.filter(bucket => bucket.company !== 'unknown').map((bucket) => {
              const remaining = Number(bucket.creditsRemaining || 0);
              const granted = Number(bucket.creditsGranted || 20);
              const pct = granted ? Math.min(100, Math.max(0, (remaining / granted) * 100)) : 0;
              return (
                <div key={bucket.company} style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 900, color: 'var(--text-primary)' }}>{bucket.company}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dark)' }}>{remaining.toFixed(2)} / {granted}</span>
                  </div>
                  <div style={{ height: '7px', background: 'var(--bg-element)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#10B981' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detailed Token Breakdown Cards */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Prompt Tokens</span>
            <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 0' }}>{promptTokens.toLocaleString()}</h4>
          </div>

          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Completion Tokens</span>
            <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 0' }}>{completionTokens.toLocaleString()}</h4>
          </div>

          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Total Tokens</span>
              <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--primary)', margin: '4px 0 0' }}>{totalTokens.toLocaleString()}</h4>
            </div>
            <ArrowUpRight size={16} style={{ color: 'var(--text-dark)' }} />
          </div>
        </div>
      </div>

      {/* 3. Sandbox Quotas & Resources Status Card */}
      <div style={{ 
        backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', 
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, borderBottom: '1px solid var(--border)', paddingBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={16} color="var(--primary)" /> Active Sandbox Containers
        </h3>
        
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>CONTAINERS PROVISIONED</span>
            <span style={{ color: 'var(--primary)' }}>{projectsCount} / 5 Active Environments</span>
          </div>
          
          <div style={{ width: '100%', height: '10px', backgroundColor: 'var(--bg-canvas)', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div 
              style={{ 
                width: `${(projectsCount / 5) * 100}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--brand-primary), var(--accent-primary))',
                borderRadius: '5px'
              }} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', background: 'var(--bg-canvas)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Cpu size={18} color="var(--primary)" />
            <div>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>CPU Allocation</span>
              <h4 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '2px 0 0' }}>0.5 / 2.0 vCPU</h4>
            </div>
          </div>

          <div style={{ flex: '1 1 200px', background: 'var(--bg-canvas)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Database size={18} color="#3B82F6" />
            <div>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Memory Allocated</span>
              <h4 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '2px 0 0' }}>512 MB / 2 GB</h4>
            </div>
          </div>
        </div>

        <button 
          onClick={onSyncLimits}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', backgroundColor: 'var(--bg-element)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <RefreshCw size={13} /> Sync Container Quotas
        </button>
      </div>

    </div>
  );
}
