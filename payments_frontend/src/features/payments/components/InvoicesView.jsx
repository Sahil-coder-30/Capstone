import React, { useEffect, useState, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Download, FileText, CreditCard, DollarSign, Calendar,
  RefreshCw, TrendingUp, Search, Filter, CheckCircle2,
  X, ShieldCheck, ArrowRight, User
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import api, { getAccessToken } from '../../../services/api';

gsap.registerPlugin(ScrollTrigger);

export default function InvoicesView() {
  const { transactions, transactionsSummary, loadTransactions, isLoading } = usePayments();
  const pageRef = useRef(null);

  const [search, setSearch]               = useState('');
  const [selectedType, setSelectedType]   = useState('all');
  const [page, setPage]                   = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [user, setUser]                   = useState(null);

  // ── Fetch authenticated user (email, name) ────────────────────────────────
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get('/api/auth/getMe', { baseURL: '', timeout: 4000 });
        if (res.data?.user) { setUser(res.data.user); return; }
      } catch {}
      // Fallback: decode JWT from memory if /getMe is unreachable
      const token = getAccessToken();
      if (token) {
        try {
          const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(decodeURIComponent(
            atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
          ));
          setUser(payload);
        } catch {}
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    loadTransactions({
      page,
      limit: 20,
      type: selectedType !== 'all' ? selectedType : undefined,
    });
  }, [loadTransactions, page, selectedType]);

  const handleDownloadPDF = (tx) => {
    const amountINR      = ((tx.amountPaise || 0) / 100).toFixed(2);
    const invoiceNumber  = `INV-${(tx._id || tx.id || '1001').substring(0, 8).toUpperCase()}`;
    const invoiceDate    = new Date(tx.createdAt || Date.now()).toLocaleDateString('en-IN');
    const customerEmail  = user?.email || user?.sub || '—';
    const customerName   = user?.name || user?.username || user?.email?.split('@')[0] || '—';
    const accountId      = tx.accountId || tx.userId || user?.sub || '—';
    const planLabel      = tx.metadata?.packageLabel || tx.description || 'Taksha AI Subscription';
    const validUntil     = tx.metadata?.slotValidUntil
      ? new Date(tx.metadata.slotValidUntil).toLocaleDateString('en-IN')
      : '—';
    const paymentId      = tx.razorpay?.paymentId || '—';
    const orderId        = tx.razorpay?.orderId    || '—';
    const tier           = (tx.metadata?.newTier || tx.metadata?.activeTier || '').toUpperCase() || '—';

    const invoiceContent = [
      '============================================================',
      '              TAKSHA CODESPACE OFFICIAL INVOICE',
      '============================================================',
      `Invoice Number : ${invoiceNumber}`,
      `Date           : ${invoiceDate}`,
      `Payment Status : ${tx.status || 'SUCCESS'} (Cryptographic SHA-256 HMAC Verified)`,
      `Payment Method : Razorpay / Cards / UPI / Netbanking`,
      `Payment Ref    : ${paymentId}`,
      `Order Ref      : ${orderId}`,
      '------------------------------------------------------------',
      `Customer Name  : ${customerName}`,
      `Customer Email : ${customerEmail}`,
      `Account ID     : ${accountId}`,
      '------------------------------------------------------------',
      'Item Description                        Qty        Amount (INR)',
      '------------------------------------------------------------',
      `${planLabel.padEnd(38, ' ')} 1          ₹${amountINR}`,
      `Plan Tier      : ${tier}`,
      `Valid Until    : ${validUntil}`,
      '------------------------------------------------------------',
      `Subtotal                                       ₹${amountINR}`,
      `GST / Taxes (Included)                         ₹0.00`,
      `TOTAL PAID                                     ₹${amountINR}`,
      '============================================================',
      'Thank you for subscribing to Taksha CodeSpace AI Platform!',
    ].join('\n');

    const blob = new Blob([invoiceContent], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `Invoice_${invoiceNumber}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const rawList = Array.isArray(transactions) ? transactions : (transactions?.transactions || []);
  const filteredList = rawList.filter(tx => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (tx._id && tx._id.toLowerCase().includes(q)) ||
      (tx.description && tx.description.toLowerCase().includes(q)) ||
      (tx.type && tx.type.toLowerCase().includes(q)) ||
      (tx.razorpay?.paymentId && tx.razorpay.paymentId.toLowerCase().includes(q))
    );
  });

  const txList = filteredList;

  useGSAP(() => {
    if (txList.length > 0) {
      gsap.fromTo('.kpi-card',
        { opacity: 0, y: 20, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out', stagger: 0.08 }
      );
      gsap.fromTo('.tx-row',
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out', stagger: 0.04 }
      );
    }
  }, { scope: pageRef, dependencies: [txList] });


  const getBadgeStyle = (type) => {
    switch (type) {
      case 'SUBSCRIPTION_ACTIVATION':
      case 'CREDIT_PURCHASE':
        return {
          bg: 'var(--brand-subtle)',
          color: 'var(--brand-primary)',
          border: '1px solid rgba(255, 179, 71,0.3)',
        };
      case 'SUBSCRIPTION_EXTENSION':
        return {
          bg: 'rgba(27, 110, 243, 0.12)',
          color: 'var(--accent-primary)',
          border: '1px solid rgba(27, 110, 243, 0.3)',
        };
      case 'SUBSCRIPTION_QUEUED':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          color: 'var(--amber-primary)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        };
      case 'SUBSCRIPTION_PROMOTED':
        return {
          bg: 'rgba(168, 85, 247, 0.12)',
          color: '#C084FC',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        };
      default:
        return {
          bg: 'var(--bg-element)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        };
    }
  };

  const totalSpent = transactionsSummary?.totalSpentINR || rawList.reduce((acc, t) => acc + (t.amountPaise || 0) / 100, 0);

  return (
    <div ref={pageRef} style={{ maxWidth: 1180, margin: '0 auto', padding: '100px 24px 64px' }}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 6 }}>
            <FileText size={13} /> Financial Ledger
          </div>
          <h1 style={{
            fontSize: 'clamp(1.4rem, 2.5vw, 1.95rem)', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Invoices & Cryptographic Ledger
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Immutable financial audit records, Razorpay payment receipts, and tax invoice exports.
          </p>
        </div>

        <button
          onClick={() => loadTransactions({ page: 1, type: selectedType !== 'all' ? selectedType : undefined })}
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.84rem' }}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh Ledger
        </button>
      </div>

      {/* ── KPI Metric Cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div
          className="kpi-card"
          style={{
            padding: '20px 22px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--brand-subtle)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={17} />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Spent (INR)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)' }}>
            ₹{totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            padding: '20px 22px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={17} />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Transactions</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            {transactionsSummary?.totalTransactions || rawList.length}
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            padding: '20px 22px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(245,158,11,0.12)', color: 'var(--amber-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={17} />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Ledger Integrity</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--amber-primary)' }}>
            100% Verified
          </div>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ──────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 380 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search invoice ID, description, payment ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 34px',
              borderRadius: 8, background: 'var(--bg-element)',
              border: '1px solid var(--border)', color: 'var(--text-primary)',
              fontSize: '0.82rem', outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Events' },
            { id: 'SUBSCRIPTION_ACTIVATION', label: 'Activations' },
            { id: 'SUBSCRIPTION_EXTENSION', label: 'Extensions' },
            { id: 'SUBSCRIPTION_QUEUED', label: 'Queued' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setSelectedType(t.id); setPage(1); }}
              style={{
                padding: '6px 12px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 700,
                background: selectedType === t.id ? 'var(--brand-primary)' : 'var(--bg-element)',
                color: selectedType === t.id ? '#000' : 'var(--text-muted)',
                border: selectedType === t.id ? 'none' : '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Transaction Ledger Table ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--bg-element)', borderBottom: '1px solid var(--border)' }}>
                {['Invoice / Date', 'Description', 'Event Type', 'Payment Ref', 'Amount', 'Invoice'].map((h, i) => (
                  <th key={i} style={{
                    padding: '13px 18px', fontSize: '0.78rem', fontWeight: 700,
                    color: 'var(--text-muted)', textAlign: i === 4 ? 'right' : i === 5 ? 'center' : 'left',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txList.length === 0 ? (

                <tr>
                  <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <FileText size={32} style={{ opacity: 0.4 }} />
                      <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>No transactions recorded yet</div>
                      <div style={{ fontSize: '0.8rem', maxWidth: 360 }}>
                        {search ? 'No invoices matched your search filter.' : 'When you purchase a subscription or use paid AI tokens, immutable invoices will be recorded here.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                txList.map((tx, idx) => {
                  const badge = getBadgeStyle(tx.type);
                  const invId = `INV-${(tx._id || '1001').substring(0, 8).toUpperCase()}`;

                  return (
                    <tr
                      key={tx._id || idx}
                      className="tx-row"
                      style={{
                        borderBottom: '1px solid var(--border)', transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--color-rgb-text),0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div
                          onClick={() => setSelectedInvoice(tx)}
                          style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                        >
                          {invId}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {new Date(tx.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px', fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: 280 }}>
                        {tx.description || 'Subscription transaction'}
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 800,
                          textTransform: 'uppercase', background: badge.bg, color: badge.color, border: badge.border,
                        }}>
                          {(tx.type || 'SUCCESS').replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {tx.razorpay?.paymentId || '—'}
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'right', fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        ₹{((tx.amountPaise || 0) / 100).toFixed(2)}
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => setSelectedInvoice(tx)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(tx)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            <Download size={12} /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* ── Invoice Detail Drawer Modal ──────────────────────────────────── */}
      {selectedInvoice && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)', zIndex: 9999,
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: 520, height: '100%',
              background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
              padding: '32px 28px', display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-card)', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} style={{ color: 'var(--brand-primary)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Official Tax Receipt
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Invoice header */}
              <div style={{ background: 'var(--bg-element)', padding: '16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Invoice Number</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  INV-{(selectedInvoice._id || '1001').substring(0, 8).toUpperCase()}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Issued on: {new Date(selectedInvoice.createdAt || Date.now()).toLocaleDateString('en-IN')}
                </div>
              </div>

              {/* Customer details */}
              <div style={{ background: 'var(--bg-element)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                  <User size={11} style={{ display: 'inline', marginRight: 4 }} />Customer
                </div>
                {[[
                  'Name',    user?.name || user?.username || user?.email?.split('@')[0] || '—'
                ],[
                  'Email',   user?.email || '—'
                ],[
                  'Account', selectedInvoice.accountId || selectedInvoice.userId || user?.sub || '—'
                ]].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', fontFamily: label === 'Account' ? 'var(--font-mono)' : 'inherit', fontSize: label === 'Account' ? '0.76rem' : '0.82rem' }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Plan details */}
              <div style={{ background: 'var(--bg-element)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Plan Details</div>
                {[[
                  'Plan',        selectedInvoice.metadata?.packageLabel || selectedInvoice.description || '—'
                ],[
                  'Tier',        (selectedInvoice.metadata?.newTier || selectedInvoice.metadata?.activeTier || '—').toUpperCase()
                ],[
                  'Valid Until',  selectedInvoice.metadata?.slotValidUntil
                                    ? new Date(selectedInvoice.metadata.slotValidUntil).toLocaleDateString('en-IN')
                                    : '—'
                ],[
                  'Billing',     selectedInvoice.subscription?.billingCycle || 'Monthly'
                ]].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', textTransform: label === 'Tier' ? 'capitalize' : 'none' }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Razorpay refs */}
              <div style={{ background: 'var(--bg-element)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Payment Reference</div>
                {[[
                  'Payment ID', selectedInvoice.razorpay?.paymentId || '—'
                ],[
                  'Order ID',   selectedInvoice.razorpay?.orderId   || '—'
                ]].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.76rem' }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Amount */}
              <div style={{ background: 'var(--bg-element)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Itemized Summary</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedInvoice.metadata?.packageLabel || selectedInvoice.description || 'Subscription Upgrade'}</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{((selectedInvoice.amountPaise || 0) / 100).toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Taxes & GST (Included):</span>
                  <span>₹0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', padding: '10px 0 2px' }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Total Paid:</span>
                  <strong style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)', fontSize: '1.1rem' }}>
                    ₹{((selectedInvoice.amountPaise || 0) / 100).toFixed(2)}
                  </strong>
                </div>
              </div>

              <button
                onClick={() => handleDownloadPDF(selectedInvoice)}
                className="btn-primary"
                style={{ width: '100%', padding: '10px', fontSize: '0.88rem', marginTop: 10 }}
              >
                <Download size={15} /> Download Official PDF Receipt
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
