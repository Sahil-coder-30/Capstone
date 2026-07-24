import React from 'react';

export default function FeatureComparisonTable() {
  const categories = [
    {
      category: 'Productivity & AI Models',
      rows: [
        { feature: 'Supported AI Models', free: 'Gemini 3.1 Flash & Copilot', pro: 'Gemini 3.1 Pro + Claude 3.5 Sonnet', max: 'All Flagship LLMs (Deep Think, GPT-4o, Sonnet, DeepSeek)' },
        { feature: 'Daily & Monthly Token Quotas', free: '50,000 / day cap', pro: '5,000,000 / month cap', max: 'Truly Unlimited (Uncapped)' },
        { feature: 'Agentic Code Execution', free: 'Single-file Copilot', pro: 'Full Coding Agent + App Agent', max: 'Multi-Agent Swarm & Auto Browse' },
        { feature: 'Deep Repository Search', free: 'Basic context search', pro: 'Full repo index & symbols', max: 'Deep Research Agent & security audit' },
      ]
    },
    {
      category: 'Cloud Infrastructure & Sandboxes',
      rows: [
        { feature: 'vCPU Container Allocation', free: '0.5 vCPU Shared', pro: '2.0 vCPU Dedicated', max: '4.0 vCPU High-Performance' },
        { feature: 'Container Memory (RAM)', free: '512 MB', pro: '2 GB Isolated', max: '4 GB Dedicated' },
        { feature: 'Persistent Workspace Storage', free: '5 GB', pro: '20 GB Persistent SSD', max: '50 GB Persistent NVMe' },
        { feature: 'Worker Execution Queue', free: 'Standard Queue', pro: 'Priority Queue', max: 'VIP Zero-Latency Queue' },
      ]
    },
    {
      category: 'Dev Credits & Support',
      rows: [
        { feature: 'Monthly Cloud Dev Credits', free: '—', pro: '$10 / month', max: '$40 / month' },
        { feature: 'Team Workspace Seats', free: '1 Seat', pro: 'Up to 5 Seats', max: 'Up to 10 Seats' },
        { feature: 'Support Level', free: 'Community Forum', pro: 'Priority Email & Discord', max: 'Dedicated 24/7 Support Manager' }
      ]
    }
  ];

  return (
    <section className="google-feature-table-section">
      <div className="section-header text-center">
        <h2 className="section-title">Detailed Feature Matrix</h2>
        <p className="section-subtitle">Comprehensive breakdown of features, AI capabilities, and resource allocations across Taksha AI subscription tiers.</p>
      </div>

      <div className="google-matrix-table-wrapper">
        <table className="google-matrix-table">
          <thead>
            <tr>
              <th className="th-feature">Plan Features</th>
              <th className="th-plan">
                <span className="plan-name">Taksha AI Free</span>
                <span className="plan-price">₹0 / mo</span>
              </th>
              <th className="th-plan plan-pro-col">
                <span className="plan-badge">Popular</span>
                <span className="plan-name">Taksha AI Pro</span>
                <span className="plan-price">₹499 / mo</span>
              </th>
              <th className="th-plan plan-max-col">
                <span className="plan-badge max-badge">Flagship</span>
                <span className="plan-name">Taksha AI Max</span>
                <span className="plan-price">₹999 / mo</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, cIdx) => (
              <React.Fragment key={cIdx}>
                <tr className="category-row">
                  <td colSpan="4" className="category-title-td">{cat.category}</td>
                </tr>
                {cat.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="data-row">
                    <td className="td-feature-name">{row.feature}</td>
                    <td className="td-val-free">{row.free}</td>
                    <td className="td-val-pro">{row.pro}</td>
                    <td className="td-val-max">{row.max}</td>
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
