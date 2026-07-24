import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';

export default function PlanCard({ plan, billingCycle, isCurrent, onSelectPlan }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayPrice = () => {
    if (plan.priceINR === 0) return 0;
    const price = billingCycle === 'yearly' ? Math.round(plan.priceINR * 0.8) : plan.priceINR;
    return price.toLocaleString('en-IN');
  };

  // SVG Animated Checkmark Component
  const AnimatedCheckmark = () => (
    <svg className="plan-benefit-icon-svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" stroke="var(--brand-primary)" strokeWidth="1.5" className="circle-bg" />
      <path
        d="M5.5 9.5L7.5 11.5L12.5 6.5"
        stroke="var(--brand-hover)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-path"
      />
    </svg>
  );

  // Categorized benefits for the drawer based on plan tier
  const getDrawerCategories = () => {
    if (plan.id === 'free') {
      return [
        {
          title: 'Boost productivity',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          ),
          items: [
            '20 daily AI credits per provider across Coding Agent & Copilot',
            '50,000 daily token cap for quick experiments & script generation',
          ]
        },
        {
          title: 'Unleash creativity',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ),
          items: [
            'Standard UI component scaffolding & basic layout generation',
          ]
        },
        {
          title: 'Code faster',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          ),
          items: [
            '0.5 vCPU + 512 MB RAM isolated sandbox container',
            'Browser-based live web preview & terminal shell',
          ]
        },
        {
          title: 'And more',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
          items: [
            'Community Support forum & public docs access',
          ]
        }
      ];
    } else if (plan.tier === 'pro') {
      return [
        {
          title: 'Boost productivity',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          ),
          items: [
            '4x higher usage limits in Taksha AI Coding Agent & Copilot',
            '5,000,000 tokens/month with zero daily throttles',
            'Multi-file refactoring & intelligent agentic code execution',
          ]
        },
        {
          title: 'Unleash creativity',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ),
          items: [
            'Full-stack app builder with instant component screenshot rendering',
            'Automated UI theme styling with Tailwind & SCSS tokens',
          ]
        },
        {
          title: 'Study & Research',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          ),
          items: [
            'Deep repository context indexing & multi-file symbol navigation',
            'Automated documentation generator for complex architectures',
          ]
        },
        {
          title: 'Code faster',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          ),
          items: [
            'High performance 2.0 vCPU + 2 GB RAM dedicated container',
            'Priority queue execution for fast build & run commands',
            '$10/month cloud dev credits for serverless testing',
          ]
        },
        {
          title: 'And more',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
          items: [
            'Priority Email & Discord support from engineering leads',
            'Family & team workspace sharing up to 5 members',
          ]
        }
      ];
    } else {
      // Max / Ultra tier
      return [
        {
          title: 'Boost productivity',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          ),
          items: [
            'Up to 20x higher usage limits in Taksha AI Agents than Pro',
            'Truly Unlimited Tokens with access to flagship LLM models',
            'Deep Think reasoning mode & multi-agent swarm orchestration',
          ]
        },
        {
          title: 'Unleash creativity',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ),
          items: [
            'Interactive real-time web application generation & live preview',
            'Unlimited visual snapshot generations & UI layout iterations',
          ]
        },
        {
          title: 'Study & Research',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          ),
          items: [
            'Deep Research agent for full codebase analysis & security audits',
            'Create multi-page technical specification reports in seconds',
          ]
        },
        {
          title: 'Code faster',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          ),
          items: [
            'Ultra high-performance 4.0 vCPU + 4 GB RAM container allocation',
            'VIP priority worker queue execution (0s latency startup)',
            '$40/month in cloud credits for developer deployments',
          ]
        },
        {
          title: 'And more',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
          items: [
            'Dedicated 24/7 technical manager & custom SLA guarantees',
            'Team sharing with up to 10 workspace seats included',
          ]
        }
      ];
    }
  };

  const drawerCategories = getDrawerCategories();

  return (
    <div className={`google-plan-card ${plan.popular ? 'popular' : ''}`}>
      {/* Card Header & Eyebrow Badge */}
      <div className="plan-card-top">
        {plan.badge ? (
          <div className={`plan-eyebrow ${plan.popular ? 'popular-eyebrow' : ''}`}>
            {plan.badge}
          </div>
        ) : (
          <div className="plan-eyebrow default-eyebrow">
            {plan.id === 'free' ? 'Get Started' : 'Taksha Tier'}
          </div>
        )}

        <h3 className="plan-card-title">{plan.label}</h3>

        <div className="plan-card-price-row">
          {plan.priceINR === 0 ? (
            <span className="price-amount">Free</span>
          ) : (
            <>
              <span className="price-currency">₹</span>
              <span className="price-amount">{displayPrice()}</span>
              <span className="price-period">/mo</span>
            </>
          )}
        </div>

        <div className="plan-card-specs-pill">
          {plan.id === 'free' && '0.5 vCPU • 512 MB RAM'}
          {plan.tier === 'pro' && '2.0 vCPU • 2 GB RAM Isolated'}
          {plan.tier === 'max' && '4.0 vCPU • 4 GB RAM Dedicated'}
        </div>

        <p className="plan-card-subtitle">{plan.description}</p>
      </div>

      {/* Main Checklist Benefits */}
      <div className="plan-benefits-summary">
        <div className="summary-title">Includes:</div>
        <ul className="summary-list">
          {plan.highlights.map((feat, idx) => (
            <li key={idx} className="summary-item">
              <AnimatedCheckmark />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Primary CTA Action Button */}
      <div className="plan-card-action">
        <button
          className={`btn-plan-cta ${plan.popular ? 'cta-primary' : 'cta-secondary'}`}
          onClick={() => onSelectPlan(plan.id)}
          disabled={isCurrent}
        >
          <span>{isCurrent ? 'Current Subscription' : plan.priceINR === 0 ? 'Get Started Free' : `Get ${plan.label.replace('Taksha AI ', '')}`}</span>
          {!isCurrent && (
            <span className="btn-icon">
              <ArrowRight size={16} />
            </span>
          )}
        </button>
      </div>

      {/* Collapsible Benefits Drawer Toggle */}
      <div className="plan-drawer-wrapper">
        <button
          className={`btn-drawer-toggle ${isExpanded ? 'expanded' : ''}`}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <span>{isExpanded ? 'Hide plan benefits' : 'View plan benefits'}</span>
          <svg className="toggle-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="8" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1" />
            <path
              d={isExpanded ? "M5 9H13" : "M5 9H13M9 5V13"}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              className="morph-path"
            />
          </svg>
        </button>

        {/* Expanded Drawer Content */}
        {isExpanded && (
          <div className="drawer-content-box animate-fadeIn">
            {drawerCategories.map((cat, cIdx) => (
              <div key={cIdx} className="drawer-category-group">
                <div className="category-header">
                  <span className="category-icon">{cat.icon}</span>
                  <span className="category-title">{cat.title}</span>
                </div>
                <ul className="category-items">
                  {cat.items.map((item, iIdx) => (
                    <li key={iIdx} className="category-item">
                      <span className="bullet-dot">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
