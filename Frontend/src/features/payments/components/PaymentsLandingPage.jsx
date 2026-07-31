import React, { useEffect } from 'react';
import { Sparkles, Globe, ArrowRight, ShieldCheck, Cpu, Zap, CreditCard, ChevronDown } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import PlanCard from './PlanCard';
import FeatureComparisonTable from './FeatureComparisonTable';
import CheckoutModal from './CheckoutModal';
import InvoicesView from './InvoicesView';
import { TakshaIcon } from '../../../components/BrandLogo';
import '../styles/payments.scss';

export default function PaymentsLandingPage({ user }) {
  const {
    credit,
    packages,
    transactions,
    summary,
    isLoading,
    selectedPlanId,
    billingCycle,
    activeView,
    loadCredit,
    loadPackages,
    loadTransactions,
    loadSummary,
    loadAnalytics,
    selectPlan,
    selectBillingCycle,
    switchView,
  } = usePayments();

  useEffect(() => {
    loadCredit();
    loadPackages();
  }, [loadCredit, loadPackages]);

  useEffect(() => {
    if (activeView === 'invoices') {
      loadTransactions();
      loadSummary();
      loadAnalytics();
    }
  }, [activeView, loadTransactions, loadSummary, loadAnalytics]);

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
        'Community Forum support'
      ]
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
        'Priority Email & Discord support'
      ]
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
        'Dedicated 24/7 technical manager'
      ]
    }
  ];

  // Filter package list to strictly 3 plans
  const packageList = defaultPackages;
  const currentSubscription = credit?.subscription || 'free';

  const handleCheckoutTrigger = (planId) => {
    selectPlan(planId);
    switchView('checkout');
  };

  const faqs = [
    {
      q: 'Can I change my plan or cancel anytime?',
      a: 'Yes! You can upgrade, downgrade, or cancel your subscription at any time. Plan upgrades take effect instantly and prorate unused time.'
    },
    {
      q: 'What happens when I run out of daily tokens on the Free tier?',
      a: 'Your daily token cap resets automatically every 24 hours. Upgrading to Taksha AI Pro or Max gives you monthly or truly unlimited token quotas without daily throttles.'
    },
    {
      q: 'Are sandbox containers dedicated and secure?',
      a: 'Yes! Pro and Max plans feature isolated, dedicated vCPU and RAM containers with high-speed persistent SSD workspace storage.'
    },
    {
      q: 'How do monthly cloud dev credits work?',
      a: 'Pro plans receive $10/mo and Max plans receive $40/mo in cloud development credits to deploy and test serverless endpoints directly from Taksha CodeSpace.'
    }
  ];

  return (
    <div className="google-payments-container">
      {/* Top Google-style Dark Header */}
      <header className="google-nav-header">
        <div className="nav-brand-group">
          <a href="/" className="nav-brand-logo">
            <TakshaIcon size={24} />
            <span className="brand-title">Taksha CodeSpace</span>
            <span className="brand-badge">Plans & Pricing</span>
          </a>

          <nav className="nav-tab-links">
            <button
              className={`nav-tab ${activeView === 'landing' ? 'active' : ''}`}
              onClick={() => switchView('landing')}
            >
              Overview & Plans
            </button>
            <button
              className={`nav-tab ${activeView === 'invoices' ? 'active' : ''}`}
              onClick={() => switchView('invoices')}
            >
              Invoices & Billing
            </button>
          </nav>
        </div>

        <div className="nav-user-group">
          <div className="user-pill-badge">
            <div className="user-avatar-initial">
              {(user?.name || 'Developer').substring(0, 1).toUpperCase()}
            </div>
            <span className="user-name">{user?.name || 'Developer'}</span>
            <span className="user-sub-tier">({currentSubscription})</span>
          </div>

          <a href="/" className="btn-return-app">
            Return to IDE
          </a>
        </div>
      </header>

      {/* Main View Router */}
      {activeView === 'invoices' ? (
        <InvoicesView transactions={transactions} summary={summary} />
      ) : activeView === 'checkout' ? (
        <CheckoutModal />
      ) : (
        <main className="google-main-content">
          {/* Hero Section with Radial Mesh SVG Background */}
          <section className="google-hero-section">
            {/* Animated Background Mesh Aura */}
            <div className="hero-mesh-bg" />

            <div className="hero-content-wrapper">
              <div className="hero-badge-pill animate-fadeIn">
                <Sparkles size={15} className="sparkle-icon" />
                <span>Supercharge your code with Taksha AI</span>
              </div>

              <h1 className="hero-headline">
                Power your coding workflow with a <br />
                <span className="animated-gradient-text">Taksha AI Plan</span>
              </h1>

              <p className="hero-subtitle">
                Access our most advanced AI coding agents, high-performance vCPU sandboxes, and enterprise token quotas built for modern software engineers.
              </p>

              {/* Region Selector & Billing Toggle Wrapper */}
              <div className="hero-controls-bar">
                <div className="region-selector-pill">
                  <Globe size={15} />
                  <span>Region: India (INR ₹)</span>
                </div>

                <div className="billing-cycle-toggle">
                  <button
                    className={`toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
                    onClick={() => selectBillingCycle('monthly')}
                  >
                    Monthly
                  </button>
                  <button
                    className={`toggle-btn ${billingCycle === 'yearly' ? 'active' : ''}`}
                    onClick={() => selectBillingCycle('yearly')}
                  >
                    Annual Billing
                  </button>
                  <span className="save-discount-tag">Save 20%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Strictly 3 Plan Cards Grid */}
          <section className="google-plans-cards-section">
            <div className="plans-cards-grid">
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

          {/* Feature Matrix Table */}
          <FeatureComparisonTable />

          {/* Frequently Asked Questions */}
          <section className="google-faq-section">
            <div className="section-header text-center">
              <h2 className="section-title">Frequently Asked Questions</h2>
              <p className="section-subtitle">Everything you need to know about Taksha AI plans, sandbox billing, and token limits.</p>
            </div>

            <div className="faq-cards-list">
              {faqs.map((faq, idx) => (
                <div key={idx} className="faq-card">
                  <h4 className="faq-question">{faq.q}</h4>
                  <p className="faq-answer">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
