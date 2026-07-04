import { RefreshCw, Cpu, Database, CheckCircle2, Coins, ArrowUpRight, Sparkles } from 'lucide-react';

export default function SettingsBillingPage({ 
  projectsCount = 2, 
  onSyncLimits, 
  credit = { credits: 20, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  onRefreshCredit,
  onUpdateSubscription
}) {
  const creditsRemaining = credit?.credits !== undefined ? credit.credits : 20;
  const subscription = credit?.subscription || 'free';
  const providerCredits = credit?.providerCredits || [];
  const unbilledCents = credit?.billing?.unbilledCents || 0;
  const lifetimeCents = credit?.billing?.lifetimeCents || 0;
  const centsPer1kTokens = credit?.billingRate?.centsPer1kTokens || 0;
  const promptTokens = credit?.promptTokens || 0;
  const completionTokens = credit?.completionTokens || 0;
  const totalTokens = credit?.totalTokens || 0;

  // Percentage of remaining credits (max 20 credits for Free Tier)
  const creditPercentage = Math.min(100, Math.max(0, (creditsRemaining / 20) * 100));
  const formatCurrency = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
  const planLabel = subscription.charAt(0).toUpperCase() + subscription.slice(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: 'var(--font-sans)', paddingBottom: '32px' }}>
      
      {/* 1. Credit & Token Usage Balance Card */}
      <div style={{ 
        background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)', 
        backgroundColor: 'var(--bg-surface)', 
        padding: '28px', 
        borderRadius: '12px', 
        border: '1px solid var(--border-strong)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
        position: 'relative'
      }}>
        {/* Sparkle Glow */}
        <div style={{ 
          position: 'absolute', top: '10px', right: '10px', 
          opacity: 0.15, pointerEvents: 'none' 
        }}>
          <Sparkles size={100} color="var(--primary)" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Coins size={16} color="var(--primary)" /> AI Credits & Token Usage
          </h3>
          <button 
            onClick={onRefreshCredit}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', 
              color: 'var(--text-dark)', backgroundColor: 'rgba(255,255,255,0.02)', padding: '5px 10px', 
              borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' 
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'var(--bg-element)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-dark)';
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
            }}
          >
            <RefreshCw size={11} /> Refresh Credits
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {['free', 'pro', 'max'].map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => onUpdateSubscription?.(tier).then?.(() => onRefreshCredit?.())}
              style={{
                border: `1px solid ${subscription === tier ? 'var(--primary)' : 'var(--border)'}`,
                background: subscription === tier ? 'var(--brand-subtle)' : 'var(--bg-canvas)',
                color: subscription === tier ? 'var(--primary)' : 'var(--text-muted)',
                borderRadius: '7px',
                padding: '7px 12px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase'
              }}
            >
              {tier}
            </button>
          ))}
          <span style={{ alignSelf: 'center', fontSize: '12px', color: 'var(--text-dark)' }}>
            Current plan: <strong style={{ color: 'var(--text-primary)' }}>{planLabel}</strong>
          </span>
        </div>

        {/* Credit Gauge and Summary */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Visual Progress Bar */}
          <div style={{ flex: '1 1 250px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: '700', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>REMAINING AI CREDITS</span>
              <span style={{ color: 'var(--primary)', fontWeight: '800' }}>
                {creditsRemaining.toFixed(2)} / 20.00 Credits
              </span>
            </div>
            
            <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--bg-canvas)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div 
                style={{ 
                  width: `${creditPercentage}%`, height: '100%',
                  background: 'linear-gradient(90deg, #10B981, #059669)',
                  borderRadius: '6px',
                  boxShadow: '0 0 10px rgba(16,185,129,0.3)',
                  transition: 'width 0.5s ease-out'
                }} 
              />
            </div>
            
            <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '10px', margin: '10px 0 0', lineHeight: '1.5' }}>
              Free users receive 20 credits for each model company. Sub-models from the same company share that company bucket. Pro and Max usage is metered for billing and is not blocked by credit limits.
            </p>
          </div>

          {/* Credits Summary Badge */}
          <div style={{ 
            background: 'var(--bg-canvas)', border: '1px solid var(--border)', 
            borderRadius: '10px', padding: '16px 20px', display: 'flex', flexDirection: 'column', 
            justifyContent: 'center', alignItems: 'center', minWidth: '160px', height: '90px'
          }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your Balance</span>
            <h2 style={{ fontSize: '26px', fontWeight: '900', color: 'var(--primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
              {creditsRemaining.toFixed(2)}
            </h2>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Credits Left</span>
          </div>
        </div>

        {providerCredits.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
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
                  <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-dark)' }}>
                    {(bucket.totalTokens || 0).toLocaleString()} tokens · {bucket.requestCount || 0} calls
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detailed Token Breakdown Cards */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
          {/* Prompt Tokens */}
          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Prompt Tokens</span>
            <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 0' }}>{promptTokens.toLocaleString()}</h4>
          </div>

          {/* Completion Tokens */}
          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Completion Tokens</span>
            <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 0' }}>{completionTokens.toLocaleString()}</h4>
          </div>

          {/* Total Tokens */}
          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Total Tokens</span>
              <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--primary)', margin: '4px 0 0' }}>{totalTokens.toLocaleString()}</h4>
            </div>
            <ArrowUpRight size={16} style={{ color: 'var(--text-dark)' }} />
          </div>
          <div style={{ flex: '1 1 180px', background: 'var(--bg-canvas)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase' }}>Unbilled Usage</span>
            <h4 style={{ fontSize: '16px', fontWeight: '800', color: subscription === 'free' ? 'var(--text-muted)' : 'var(--primary)', margin: '4px 0 0' }}>{formatCurrency(unbilledCents)}</h4>
            <span style={{ fontSize: '10px', color: 'var(--text-dark)' }}>{centsPer1kTokens}¢ / 1k tokens · lifetime {formatCurrency(lifetimeCents)}</span>
          </div>
        </div>
      </div>

      {/* 2. Sandbox Quotas & Resources Status Card */}
      <div style={{ 
        background: 'var(--bg-surface)', 
        padding: '28px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#fff', margin: 0, borderBottom: '1px solid var(--border)', paddingBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={16} color="var(--primary)" /> Active Sandbox Quotas
        </h3>
        
        {/* Capacity Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>SANDBOX CONTAINERS</span>
            <span style={{ color: 'var(--primary)' }}>{projectsCount} / 5 Active Environments</span>
          </div>
          
          <div style={{ width: '100%', height: '10px', backgroundColor: 'var(--bg-canvas)', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div 
              style={{ 
                width: `${(projectsCount / 5) * 100}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--brand-primary), var(--accent-primary))',
                borderRadius: '5px',
                transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 0 8px var(--primary-glow)'
              }} 
            />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-dark)', marginTop: '8px', margin: '8px 0 0', lineHeight: '1.5' }}>
            You have active sandbox environments currently provisioned. Free development tier plans are limited to a maximum of 5 simultaneous environments.
          </p>
        </div>

        {/* Resources Metrics */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
          {/* CPU Card */}
          <div style={{ flex: '1 1 200px', background: 'var(--bg-canvas)', padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '8px', backgroundColor: 'var(--bg-element)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <Cpu size={18} color="var(--primary)" />
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CPU Allocation</span>
              <h4 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '2px 0 0' }}>0.5 / 2.0 vCPU</h4>
            </div>
          </div>

          {/* RAM Card */}
          <div style={{ flex: '1 1 200px', background: 'var(--bg-canvas)', padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '8px', backgroundColor: 'var(--bg-element)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <Database size={18} color="var(--accent)" />
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Memory Allocated</span>
              <h4 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '2px 0 0' }}>512 MB / 2 GB</h4>
            </div>
          </div>
        </div>

        <button 
          onClick={onSyncLimits}
          className="btn-secondary" 
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px', marginTop: '4px' }}
        >
          <RefreshCw size={13} /> Sync Sandbox Resources
        </button>
      </div>

      {/* 3. Developer Pro Card */}
      <div style={{ 
        background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(59,130,246,0.04) 100%)',
        backgroundColor: 'var(--bg-surface)',
        padding: '36px', 
        borderRadius: '12px', 
        border: '1px solid var(--border-strong)', 
        textAlign: 'center', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        gap: '20px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Glow Element */}
        <div style={{ 
          position: 'absolute', top: '-120px', width: '240px', height: '240px', 
          background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)', 
          filter: 'blur(30px)', pointerEvents: 'none' 
        }} />

        <span style={{ 
          fontSize: '9.5px', fontWeight: '800', color: 'var(--primary)', 
          background: 'var(--brand-subtle)', padding: '4px 12px', borderRadius: '20px', 
          border: '1px solid var(--primary-glow)', letterSpacing: '0.08em', zIndex: 1 
        }}>
          UPGRADE PLANS
        </span>

        <div style={{ zIndex: 1 }}>
          <h3 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Upgrade to Developer Pro</h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-dark)', marginTop: '8px', margin: '8px 0 0', maxWidth: '520px', lineHeight: '1.6' }}>
            Unlock unlimited sandbox environments, customized deployment ports, dedicated vCPUs, and 24/7 background compilation runtimes.
          </p>
        </div>

        {/* Feature Checkmarks List */}
        <div style={{ 
          display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start', 
          textAlign: 'left', background: 'var(--bg-canvas)', padding: '18px 24px', 
          borderRadius: '10px', border: '1px solid var(--border)', width: '100%', maxWidth: '440px', zIndex: 1 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={14} color="var(--primary)" />
            <span>Unlimited running Sandbox project environments</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={14} color="var(--primary)" />
            <span>4.0 vCPU + 4 GB Memory per Sandbox environment</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={14} color="var(--primary)" />
            <span>Custom ports exposed directly to DNS routes</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={14} color="var(--primary)" />
            <span>Faster Mistral / Gemini AI agent orchestration</span>
          </div>
        </div>

        <button 
          onClick={() => onUpdateSubscription?.('pro').then?.(() => onRefreshCredit?.())} 
          className="btn-primary"
          style={{ padding: '12px 28px', fontSize: '14px', fontWeight: '700', marginTop: '8px', zIndex: 1 }}
        >
          {subscription === 'pro' ? 'Pro Active' : 'Upgrade to Pro'}
        </button>
      </div>

    </div>
  );
}
