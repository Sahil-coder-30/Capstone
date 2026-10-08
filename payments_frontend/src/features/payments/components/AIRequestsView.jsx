import React, { useEffect, useState, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Terminal, Search, Filter, RefreshCw, Bot, Sparkles,
  Clock, Database, Code, CheckCircle2, ChevronRight, X, ExternalLink
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

gsap.registerPlugin(ScrollTrigger);

export default function AIRequestsView() {
  const { usageEvents, loadUsageEvents, isLoading } = usePayments();
  const pageRef = useRef(null);

  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [page, setPage] = useState(1);
  const [activeInspectorEvent, setActiveInspectorEvent] = useState(null);

  useEffect(() => {
    loadUsageEvents({
      page,
      limit: 25,
      company: selectedCompany,
      agentType: selectedAgent,
      search: search.trim() || undefined,
    });
  }, [loadUsageEvents, page, selectedCompany, selectedAgent, search]);

  const eventsList = usageEvents?.events?.length > 0 ? usageEvents.events : [
    {
      _id: 'evt_sample_01',
      createdAt: new Date().toISOString(),
      company: 'google',
      modelId: 'gemini-1.5-pro',
      agentType: 'codingAgent',
      promptTokens: 1420,
      completionTokens: 380,
      totalTokens: 1800,
      creditsDeducted: 1.8,
      requestId: 'req_8492019a',
      chatId: '66bf48291a0f49129031ba01',
    },
    {
      _id: 'evt_sample_02',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      company: 'mistral',
      modelId: 'mistral-large-latest',
      agentType: 'copilot',
      promptTokens: 820,
      completionTokens: 140,
      totalTokens: 960,
      creditsDeducted: 1.0,
      requestId: 'req_8492019b',
      chatId: '66bf48291a0f49129031ba02',
    },
    {
      _id: 'evt_sample_03',
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      company: 'openai',
      modelId: 'gpt-4o',
      agentType: 'appAgent',
      promptTokens: 3200,
      completionTokens: 940,
      totalTokens: 4140,
      creditsDeducted: 4.1,
      requestId: 'req_8492019c',
      chatId: '66bf48291a0f49129031ba03',
    },
  ];

  useGSAP(() => {
    gsap.fromTo('.request-row',
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out', stagger: 0.04 }
    );
  }, { scope: pageRef, dependencies: [eventsList] });

  const getCompanyColor = (company) => {
    switch (company?.toLowerCase()) {
      case 'google': return '#3DC5A1';
      case 'openai': return '#10B981';
      case 'mistral': return '#1B6EF3';
      case 'cohere': return '#F59E0B';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div ref={pageRef} style={{ maxWidth: 1180, margin: '0 auto', padding: '100px 24px 64px' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 6 }}>
            <Terminal size={13} /> Granular Audit Trail
          </div>
          <h1 style={{
            fontSize: 'clamp(1.4rem, 2.5vw, 1.95rem)', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            AI Request & Interaction Log Explorer
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Inspect every single LLM synthesis request, prompt token breakdown, and provider deduction with millisecond timestamps.
          </p>
        </div>

        <button
          onClick={() => loadUsageEvents({ page, limit: 25, company: selectedCompany, agentType: selectedAgent, search })}
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.84rem' }}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh Logs
        </button>
      </div>

      {/* ── Filters & Search Toolbar ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '16px 20px', marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 14, boxShadow: 'var(--shadow-card)',
      }}>
        {/* Search input */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by Request ID or Model..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '9px 14px 9px 36px',
              borderRadius: 8, background: 'var(--bg-element)',
              border: '1px solid var(--border)', color: 'var(--text-primary)',
              fontSize: '0.84rem', outline: 'none',
            }}
          />
        </div>

        {/* Filter dropdowns */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Provider:</span>
            <select
              value={selectedCompany}
              onChange={(e) => { setSelectedCompany(e.target.value); setPage(1); }}
              style={{
                padding: '7px 12px', borderRadius: 8, background: 'var(--bg-element)',
                border: '1px solid var(--border)', color: 'var(--text-primary)',
                fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="all">All Providers</option>
              <option value="google">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="mistral">Mistral</option>
              <option value="cohere">Cohere</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Agent:</span>
            <select
              value={selectedAgent}
              onChange={(e) => { setSelectedAgent(e.target.value); setPage(1); }}
              style={{
                padding: '7px 12px', borderRadius: 8, background: 'var(--bg-element)',
                border: '1px solid var(--border)', color: 'var(--text-primary)',
                fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="all">All Agents</option>
              <option value="codingAgent">Coding Agent</option>
              <option value="appAgent">App Agent</option>
              <option value="copilot">Copilot</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Table Container ──────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-card)',
        marginBottom: 24,
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 780 }}>
            <thead>
              <tr style={{ background: 'var(--bg-element)', borderBottom: '1px solid var(--border)' }}>
                {['Timestamp / Request ID', 'AI Provider', 'Model', 'Agent Architecture', 'Tokens (Prompt / Compl)', 'Total Tokens', 'Inspect'].map((h, i) => (
                  <th key={i} style={{
                    padding: '13px 18px', fontSize: '0.78rem', fontWeight: 700,
                    color: 'var(--text-muted)', textAlign: i === 5 ? 'right' : i === 6 ? 'center' : 'left',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventsList.map((evt, idx) => {
                const compColor = getCompanyColor(evt.company);

                return (
                  <tr
                    key={evt._id || idx}
                    className="request-row"
                    style={{
                      borderBottom: '1px solid var(--border)', transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--color-rgb-text),0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {evt.requestId || `req_${(evt._id || 'unknown').slice(-8)}`}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(evt.createdAt).toLocaleString()}
                      </div>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 800,
                        textTransform: 'uppercase', background: `${compColor}15`, color: compColor,
                        border: `1px solid ${compColor}33`,
                      }}>
                        {evt.company}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {evt.modelId || 'default-model'}
                    </td>

                    <td style={{ padding: '14px 18px', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {evt.agentType ? evt.agentType.replace(/([A-Z])/g, ' $1') : 'General Agent'}
                    </td>

                    <td style={{ padding: '14px 18px', fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(evt.promptTokens || 0).toLocaleString()} / {(evt.completionTokens || 0).toLocaleString()}
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'right', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {(evt.totalTokens || 0).toLocaleString()}
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <button
                        onClick={() => setActiveInspectorEvent(evt)}
                        className="btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        Inspect <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.8rem', color: 'var(--text-muted)',
        }}>
          <span>Showing page {usageEvents?.page || page} of {usageEvents?.totalPages || 1}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.78rem', opacity: page <= 1 ? 0.5 : 1 }}
            >
              Previous
            </button>
            <button
              disabled={page >= (usageEvents?.totalPages || 1)}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.78rem', opacity: page >= (usageEvents?.totalPages || 1) ? 0.5 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── Request Inspector Drawer Modal ───────────────────────────────── */}
      {activeInspectorEvent && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)', zIndex: 9999,
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={() => setActiveInspectorEvent(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: 540, height: '100%',
              background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
              padding: '32px 28px', display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-card)', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Terminal size={18} style={{ color: 'var(--brand-primary)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Request Telemetry Inspector
                </h3>
              </div>
              <button
                onClick={() => setActiveInspectorEvent(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-element)', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Request ID</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  {activeInspectorEvent.requestId || activeInspectorEvent._id}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--bg-element)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>AI Provider</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize', marginTop: 3 }}>
                    {activeInspectorEvent.company}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-element)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Model ID</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                    {activeInspectorEvent.modelId || 'N/A'}
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-element)', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                  Token Consumption Details
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Prompt Tokens:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{(activeInspectorEvent.promptTokens || 0).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Completion Tokens:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{(activeInspectorEvent.completionTokens || 0).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '8px 0 2px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total Tokens:</span>
                  <strong style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                    {(activeInspectorEvent.totalTokens || 0).toLocaleString()}
                  </strong>
                </div>
              </div>

              <div style={{ background: 'var(--bg-element)', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Chat Session Ref</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  {activeInspectorEvent.chatId || 'Stateless Single-Prompt Interaction'}
                </div>
              </div>

              {/* JSON Viewer */}
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
                  Raw Telemetry Payload:
                </div>
                <pre style={{
                  background: '#0D1117', color: '#58A6FF',
                  padding: 16, borderRadius: 10, fontSize: '0.76rem',
                  overflowX: 'auto', border: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)', lineHeight: 1.5,
                }}>
                  {JSON.stringify(activeInspectorEvent, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
