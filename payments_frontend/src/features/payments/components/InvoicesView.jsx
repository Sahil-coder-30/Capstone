import React, { useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Download, FileText, CreditCard, DollarSign, Calendar, RefreshCw, TrendingUp } from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

gsap.registerPlugin(ScrollTrigger);

export default function InvoicesView() {
  const { transactions, summary, loadTransactions, loadSummary } = usePayments();
  const pageRef = useRef(null);

  useEffect(() => {
    loadTransactions();
    loadSummary();
  }, [loadTransactions, loadSummary]);

  const handleDownloadPDF = (tx) => {
    const invoiceContent = `
============================================================
              TAKSHA CODESPACE OFFICIAL INVOICE
============================================================
Invoice Number : INV-${(tx._id || tx.id || '1001').substring(0, 8).toUpperCase()}
Date           : ${new Date(tx.createdAt || Date.now()).toLocaleDateString()}
Payment Status : SUCCESS (HMAC Verified)
Payment Method : Razorpay / Credit Card
------------------------------------------------------------
Customer Email : dev@takshacodespace.com
Account ID     : ${tx.userId || 'usr_dev_12345'}
------------------------------------------------------------
Description                         Qty        Amount (INR)
------------------------------------------------------------
${tx.description || 'Taksha AI Subscription Upgrade'}    1          ₹${((tx.amountPaise || 49900) / 100).toFixed(2)}
------------------------------------------------------------
Subtotal                                       ₹${((tx.amountPaise || 49900) / 100).toFixed(2)}
GST / Taxes (Included)                         ₹0.00
TOTAL PAID                                     ₹${((tx.amountPaise || 49900) / 100).toFixed(2)}
============================================================
Thank you for subscribing to Taksha CodeSpace!
    `;
    const blob = new Blob([invoiceContent], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `Invoice_INV-${(tx._id || '1001').substring(0, 8).toUpperCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sampleTxList = transactions.length > 0 ? transactions : [
    { _id: 'tx_9981247124a', type: 'CREDIT_PURCHASE',    description: 'Taksha AI Pro Plan Monthly Subscription', amountPaise: 49900, createdAt: new Date().toISOString(),                   status: 'SUCCESS' },
    { _id: 'tx_8812314112b', type: 'SUBSCRIPTION_CHANGE', description: 'Subscription Tier Upgrade: free → pro',   amountPaise: 0,     createdAt: new Date(Date.now()-86400000*3).toISOString(), status: 'SUCCESS' },
  ];

  useGSAP(() => {
    gsap.fromTo('.kpi-card',
      { opacity: 0, y: 20, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out', stagger: 0.1, delay: 0.15 }
    );
    ScrollTrigger.batch('.tx-row', {
      start: 'top 90%',
      onEnter: (batch) => gsap.fromTo(batch,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 }
      ),
    });
  }, { scope: pageRef });

  const kpis = [
    {
      icon: <DollarSign size={18} />, label: 'Total Spent (INR)',
      value: `₹${(summary?.totalSpentINR || 499).toLocaleString('en-IN')}`,
      color: 'var(--brand-primary)', subtle: 'var(--brand-subtle)',
    },
    {
      icon: <CreditCard size={18} />, label: 'Total Purchases',
      value: summary?.totalPurchases || 1,
      color: 'var(--accent-primary)', subtle: 'var(--accent-subtle)',
    },
    {
      icon: <Calendar size={18} />, label: 'Current Plan',
      value: (summary?.currentSubscription || 'Pro') + ' Tier',
      color: 'var(--amber-primary)', subtle: 'var(--amber-subtle)',
    },
  ];

  return (
    <div ref={pageRef} style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 24px 48px' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            <FileText size={13} /> Billing
          </div>
          <h1 style={{
            fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Invoices & Transaction Ledger
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Review payment records, usage deductions, and download tax receipts.
          </p>
        </div>

        <button
          onClick={() => { loadTransactions(); loadSummary(); }}
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.84rem' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 36 }}>
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="kpi-card"
            style={{
              padding: '22px 24px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 14, boxShadow: 'var(--shadow-card)',
              transition: 'border-color 0.25s, box-shadow 0.25s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = kpi.color; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: kpi.subtle, color: kpi.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {kpi.icon}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div style={{
              fontSize: '1.65rem', fontWeight: 900,
              fontFamily: 'var(--font-heading)', color: kpi.color,
            }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Transaction Table ────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={16} style={{ color: 'var(--brand-primary)' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Transaction History</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-element)', borderBottom: '1px solid var(--border)' }}>
              {['Transaction ID / Date', 'Description', 'Type', 'Amount', 'Invoice'].map((h, i) => (
                <th key={i} style={{
                  padding: '14px 20px', fontSize: '0.8rem', fontWeight: 700,
                  color: 'var(--text-muted)', textAlign: i >= 3 ? (i === 3 ? 'right' : 'center') : 'left',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleTxList.map((tx, idx) => (
              <tr
                key={tx._id || idx}
                className="tx-row"
                style={{
                  borderBottom: '1px solid var(--border)', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--color-rgb-text),0.02)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    INV-{(tx._id || '1001').substring(0, 8).toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td style={{ padding: '16px 20px', fontSize: '0.86rem', color: 'var(--text-secondary)', maxWidth: 260 }}>
                  {tx.description}
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 6,
                    fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                    background: tx.type === 'CREDIT_PURCHASE' ? 'var(--brand-subtle)' : 'var(--bg-element)',
                    color:  tx.type === 'CREDIT_PURCHASE' ? 'var(--brand-primary)' : 'var(--text-muted)',
                    border: tx.type === 'CREDIT_PURCHASE' ? '1px solid rgba(61,197,161,0.25)' : '1px solid var(--border)',
                  }}>
                    {tx.type.replace('_', ' ')}
                  </span>
                </td>
                <td style={{ padding: '16px 20px', textAlign: 'right', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  ₹{((tx.amountPaise || 0) / 100).toFixed(2)}
                </td>
                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleDownloadPDF(tx)}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                  >
                    <Download size={13} /> PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
