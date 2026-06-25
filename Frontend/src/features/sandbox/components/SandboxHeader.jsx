import React from 'react';
import { useSandbox } from '../Hooks/sandbox.hooks';
import { Play, RotateCw, Copy, Check, LogOut, Cpu, FolderTree, Terminal, Sparkles, Eye, Code2 } from 'lucide-react';
import { useState } from 'react';

export default function SandboxHeader({
  isExplorerOpen, setIsExplorerOpen,
  isChatOpen, setIsChatOpen,
  isTerminalOpen, setIsTerminalOpen,
  workspaceTab, setWorkspaceTab
}) {
  const {
    sandboxId,
    status,
    previewUrl,
    error,
    startSandbox,
    terminateSandbox,
  } = useSandbox();

  const [copiedText, setCopiedText] = useState('');

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(''), 2000);
  };

  return (
    <header className="glass" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: '48px',
      borderBottom: '1px solid var(--border)',
      position: 'relative',
      zIndex: 50,
      flexShrink: 0,
      background: 'rgba(6, 7, 10, 0.8)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Brand & Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          background: 'var(--primary)',
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 10px var(--primary-glow)',
          flexShrink: 0,
        }}>
          <Cpu size={14} color="var(--bg-main)" />
        </div>
        <h1 style={{
          fontSize: '14px',
          fontWeight: '700',
          fontFamily: 'var(--font-heading)',
          margin: 0,
          color: 'var(--text-main)',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}>
          Capstone{' '}
          <span style={{
            color: 'var(--text-muted)',
            fontWeight: '400',
          }}>
            Codespace
          </span>
        </h1>

        {/* Header Toggles Toolbar (IDE layout controls) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', borderLeft: '1px solid var(--border)', paddingLeft: '8px', marginLeft: '8px' }}>
          <button
            onClick={() => setIsExplorerOpen(!isExplorerOpen)}
            title="Toggle Explorer (Cmd+B)"
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              color: isExplorerOpen ? 'var(--text-main)' : 'var(--text-dark)',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-element)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FolderTree size={14} />
          </button>

          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            title="Toggle Terminal (Cmd+J)"
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              color: isTerminalOpen ? 'var(--text-main)' : 'var(--text-dark)',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-element)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Terminal size={14} />
          </button>

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            title="Toggle AI Assistant (Cmd+Shift+B)"
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              color: isChatOpen ? 'var(--text-main)' : 'var(--text-dark)',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-element)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Sparkles size={14} />
          </button>

          <button
            onClick={() => setWorkspaceTab(workspaceTab === 'editor' ? 'preview' : 'editor')}
            title="Toggle Editor / Preview (Cmd+Shift+T)"
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--text-dark)',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
          >
            {workspaceTab === 'editor' ? <Eye size={14} /> : <Code2 size={14} />}
          </button>
        </div>
      </div>

      {/* Center: Active sandbox info */}
      {status === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
          {/* Sandbox ID badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            padding: '3px 8px',
            borderRadius: '4px',
            color: 'var(--success)',
          }}>
            <span className="pulse-green" style={{
              width: '6px',
              height: '6px',
              backgroundColor: 'var(--success)',
              borderRadius: '50%',
              display: 'inline-block',
            }} />
            <span style={{ fontWeight: '500', fontFamily: 'var(--font-mono)' }}>
              {sandboxId.substring(0, 8)}
            </span>
            <button
              onClick={() => handleCopy(sandboxId, 'id')}
              title="Copy sandbox ID"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-dark)', marginLeft: '2px' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
            >
              {copiedText === 'id' ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
            </button>
          </div>

          {/* Preview URL */}
          {previewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                background: 'var(--bg-element)',
                border: '1px solid var(--border)',
                padding: '3px 8px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--primary)',
                    textDecoration: 'none',
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: '500',
                  }}
                >
                  {previewUrl.replace('http://', '')}
                </a>
                <button
                  onClick={() => handleCopy(previewUrl, 'preview')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-dark)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
                >
                  {copiedText === 'preview' ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error banner (idle/error state) */}
      {error && status === 'error' && (
        <div style={{
          fontSize: '11px',
          color: 'var(--error)',
          background: 'rgba(244, 63, 94, 0.05)',
          border: '1px solid rgba(244, 63, 94, 0.15)',
          padding: '3px 10px',
          borderRadius: '4px',
          maxWidth: '260px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {error}
        </div>
      )}

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {status === 'running' ? (
          <button
            onClick={terminateSandbox}
            className="glow-hover"
            style={{
              background: 'rgba(244, 63, 94, 0.05)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--error)',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.3)';
            }}
          >
            <LogOut size={13} />
            Stop Sandbox
          </button>
        ) : (
          <button
            onClick={startSandbox}
            disabled={status === 'starting'}
            className="glow-hover pulse-primary"
            style={{
              background: status === 'starting'
                ? 'var(--bg-element)'
                : 'linear-gradient(135deg, var(--accent) 0%, var(--primary) 100%)',
              border: '1px solid var(--border)',
              color: status === 'starting' ? 'var(--text-muted)' : '#ffffff',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: status === 'starting' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: '600',
              boxShadow: status !== 'starting' ? '0 2px 10px var(--primary-glow)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {status === 'starting' ? (
              <>
                <RotateCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                Launching…
              </>
            ) : (
              <>
                <Play size={13} fill="currentColor" />
                Launch Sandbox
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
