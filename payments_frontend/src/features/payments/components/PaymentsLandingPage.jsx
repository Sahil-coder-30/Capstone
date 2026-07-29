import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Globe, ArrowRight, ShieldCheck, Cpu, Zap, CreditCard, ChevronDown } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import PlanCard from './PlanCard';
import FeatureComparisonTable from './FeatureComparisonTable';
import PlanDetailModal from './PlanDetailModal';

export default function PaymentsLandingPage({ user }) {
  const {
    credit,
    billingCycle,
    detailPlanId,
    loadCredit,
    loadPackages,
    selectPlan,
    selectBillingCycle,
  } = usePayments();
  const navigate = useNavigate();

  useEffect(() => {
    loadCredit();
    loadPackages();
  }, [loadCredit, loadPackages]);

  // Strictly 3 Taksha AI Subscription Plans
  const defaultPackages = [
    {
      id: 'free',
      label: 'Taksha AI Free',
      tier: 'free',
      priceINR: 0,
      badge: 'Get Started',
      description: 'Essential sandbox and AI model credits for developers getting started.',
      highlights: [
        '20 AI credits per provider daily',
        '50,000 daily token limit',
        '0.5 vCPU + 512 MB RAM container',
        'Coding Agent + Copilot',
        'Community Forum support',
      ],
    },
    {
      id: 'pro_regular',
      label: 'Taksha AI Pro',
      tier: 'pro',
      pricingModel: 'regular',
      priceINR: 499,
      badge: 'Most Popular',
      popular: true,
      description: 'Full AI power with high-performance isolated sandbox containers.',
      highlights: [
        '4x higher usage limits in Taksha AI',
        '5,000,000 tokens per month cap',
        '2.0 vCPU + 2 GB RAM dedicated container',
        'Coding Agent + Copilot + App Agent',
        'Priority Email & Discord support',
      ],
    },
    {
      id: 'max_regular',
      label: 'Taksha AI Max',
      tier: 'max',
      pricingModel: 'regular',
      priceINR: 999,
      badge: 'Flagship Tier',
      description: 'Uncapped tokens, flagship LLMs, and priority worker execution queue.',
      highlights: [
        'Up to 20x higher usage limits than Pro',
        'Truly Unlimited Tokens with zero throttling',
        '4.0 vCPU + 4 GB RAM container allocation',
        'All Agents + Flagship LLM models',
        'Dedicated 24/7 technical manager',
      ],
    },
  ];

  const packageList = defaultPackages;
  const currentSubscription = credit?.subscription || 'free';

  const handleCheckoutTrigger = (planId) => {
    selectPlan(planId);
    navigate(`/checkout/${planId}`);
  };

  const faqs = [
    {
      q: 'Can I change my plan or cancel anytime?',
      a: 'Yes! You can upgrade, downgrade, or cancel your subscription at any time. Plan upgrades take effect instantly.',
    },
    {
      q: 'What happens when I run out of daily tokens on the Free tier?',
      a: 'Your daily token cap resets automatically every 24 hours. Upgrading to Taksha AI Pro or Max gives you monthly or truly unlimited token quotas.',
    },
    {
      q: 'Are sandbox containers dedicated and secure?',
      a: 'Yes! Pro and Max plans feature isolated, dedicated vCPU and RAM containers with high-speed persistent SSD workspace storage.',
    },
    {
      q: 'Where is my subscription status stored?',
      a: 'Your subscription tier and token balances are stored exclusively inside the Payments Microservice database. The Auth service only handles token verification.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 20px' }}>
        {detailPlanId && <PlanDetailModal />}

        {/* Hero Section */}
        <section style={{ textAlign: 'center', marginBottom: '50px' }}>
          <div
            className="animate-fadeIn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '20px',
              background: 'var(--brand-subtle)',
              color: 'var(--brand-primary)',
              fontSize: '0.82rem',
              fontWeight: '600',
              marginBottom: '20px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <Sparkles size={14} />
            <span>Supercharge your code with Taksha AI</span>
          </div>

          <h1
            style={{
              fontSize: '3.2rem',
              fontWeight: '900',
              fontFamily: 'var(--font-heading)',
              color: 'var(--text-primary)',
              lineHeight: '1.15',
              marginBottom: '20px',
              letterSpacing: '-0.03em',
            }}
          >
            Power your coding workflow with a <br />
            <span style={{
              background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--accent-primary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Taksha AI Plan
            </span>
          </h1>

          <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '680px', margin: '0 auto 36px', lineHeight: '1.6' }}>
            Access our most advanced AI coding agents, high-performance vCPU sandboxes, and enterprise token quotas built for modern software engineers.
          </p>

          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <Globe size={15} />
              <span>Region: India (INR ₹)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-surface)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <button
                onClick={() => selectBillingCycle('monthly')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '7px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: billingCycle === 'monthly' ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: billingCycle === 'monthly' ? 'var(--bg-element)' : 'transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                Monthly
              </button>
              <button
                onClick={() => selectBillingCycle('yearly')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '7px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: billingCycle === 'yearly' ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: billingCycle === 'yearly' ? 'var(--bg-element)' : 'transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                Annual Billing
              </button>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--brand-primary)', background: 'var(--brand-subtle)', padding: '2px 8px', borderRadius: '10px', marginRight: '4px' }}>
                Save 20%
              </span>
            </div>
          </div>
        </section>

        {/* 3-Plan Cards Grid */}
        <section style={{ marginBottom: '80px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', alignItems: 'stretch' }}>
            {packageList.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                billingCycle={billingCycle}
                isCurrent={currentSubscription === plan.tier}
                onSelectPlan={handleCheckoutTrigger}
              />
            ))}
          </div>
        </section>

        {/* Feature Comparison Matrix */}
        <section style={{ marginBottom: '80px' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Compare Plan Capabilities
            </h2>
            <p style={{ fontSize: '0.98rem', color: 'var(--text-muted)' }}>
              Choose the level of speed, compute sandbox capacity, and tokens needed for your development.
            </p>
          </div>
          <FeatureComparisonTable />
        </section>

        {/* FAQ Accordion */}
        <section style={{ margin: '80px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Frequently Asked Questions
            </h2>
            <p style={{ fontSize: '0.98rem', color: 'var(--text-muted)' }}>
              Everything you need to know about Taksha AI plans, sandbox billing, and token limits.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
            {faqs.map((faq, idx) => (
              <div key={idx} style={{ padding: '24px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', transition: 'border-color 0.2s', ':hover': { borderColor: 'var(--border-strong)' } }}>
                <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>{faq.q}</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
