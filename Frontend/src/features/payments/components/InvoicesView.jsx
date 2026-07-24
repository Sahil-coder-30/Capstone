import React, { useState } from 'react';
import { Download, FileText, CheckCircle2, Clock, Filter } from 'lucide-react';

export default function InvoicesView({ transactions, summary }) {
  const [filter, setFilter] = useState('all');

  const filtered = transactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.type === filter;
  });

  const formatINR = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem 5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Billing & Invoices</h2>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>
            View your complete payment audit trail, subscription charges, and token usage history.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              background: filter === 'all' ? 'rgba(99,102,241,0.2)' : 'none',
              border: filter === 'all' ? '1px solid #6366f1' : 'none',
              color: filter === 'all' ? '#818cf8' : '#94a3b8',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            All
          </button>
          <button
            onClick={() => setFilter('CREDIT_PURCHASE')}
            style={{
              background: filter === 'CREDIT_PURCHASE' ? 'rgba(99,102,241,0.2)' : 'none',
              border: filter === 'CREDIT_PURCHASE' ? '1px solid #6366f1' : 'none',
              color: filter === 'CREDIT_PURCHASE' ? '#818cf8' : '#94a3b8',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Payments
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: uppercase }}>Total Spent</span>
          <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, margin: '4px 0 0' }}>{formatINR(summary?.totalSpentINR)}</h3>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: uppercase }}>Active Subscription</span>
          <h3 style={{ color: '#818cf8', fontSize: '1.5rem', fontWeight: 800, margin: '4px 0 0', textTransform: 'capitalize' }}>
            {summary?.currentSubscription || 'Free'}
          </h3>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: uppercase }}>Tokens Consumed</span>
          <h3 style={{ color: '#34d399', fontSize: '1.5rem', fontWeight: 800, margin: '4px 0 0' }}>
            {Number(summary?.totalTokensConsumed || 0).toLocaleString()}
          </h3>
        </div>
      </div>

      {/* Transactions Table */}
      <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
            <FileText size={36} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>No invoice or transaction records found.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(2,6,23,0.4)', color: '#94a3b8', fontSize: '0.75rem', textTransform: uppercase }}>
                <th style={{ padding: '12px 20px' }}>Date</th>
                <th style={{ padding: '12px 20px' }}>Description</th>
                <th style={{ padding: '12px 20px' }}>Type</th>
                <th style={{ padding: '12px 20px' }}>Amount</th>
                <th style={{ padding: '12px 20px' }}>Status</th>
                <th style={{ padding: '12px 20px', textAlign: 'right' }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>
                    {new Date(tx.createdAt || Date.now()).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#fff', fontWeight: 600 }}>{tx.description || 'Subscription Invoice'}</td>
                  <td style={{ padding: '14px 20px', color: '#94a3b8' }}>{tx.type}</td>
                  <td style={{ padding: '14px 20px', color: '#fff', fontWeight: 700 }}>{formatINR(tx.amountINR)}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34d399', fontSize: '0.75rem', fontWeight: 600 }}>
                      <CheckCircle2 size={12} />
                      <span>Completed</span>
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                      <Download size={14} />
                      <span>PDF</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
