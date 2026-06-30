import React, { useState, useRef, useEffect } from 'react';
import { useSandbox } from '../Hooks/sandbox.hooks';
import {
  Play, RotateCw, Copy, Check, LogOut, Cpu,
  FolderTree, Terminal, Sparkles, Eye, Code2,
  Square, Trash2, ChevronDown, Loader2, Share2, Settings, ExternalLink
} from 'lucide-react';

export default function SandboxHeader({
  isExplorerOpen, setIsExplorerOpen,
  isChatOpen, setIsChatOpen,
  isTerminalOpen, setIsTerminalOpen,
  workspaceTab, setWorkspaceTab,
  projectId, projectTitle, onBackToDashboard,
  onNavigateSettings
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
  const [stopLoading, setStopLoading] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!statusMenuOpen) return;
    const handler = (e) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusMenuOpen]);

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const handleStop = async () => {
    setStatusMenuOpen(false);
    setStopLoading(true);
    await terminateSandbox(projectId);
    setStopLoading(false);
  };

  const handleStart = async () => {
    setStatusMenuOpen(false);
    await startSandbox(projectId);
  };

  const isRunning = status === 'running';
  const isStarting = status === 'starting' || status === 'warming' || status === 'building';

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: '48px',
      borderBottom: '1px solid var(--border)',
      background: '#05070a',
      position: 'relative',
      zIndex: 50,
      flexShrink: 0,
      fontFamily: 'var(--font-sans)'
    }}>
      {/* Left: Back to start + Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onBackToDashboard && (
          <button
            onClick={onBackToDashboard}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              color: '#cbd5e1',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-element)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            ← Back to start
          </button>
        )}

        {/* Panel Toggles */}
        <div style={{ display: 'flex', gap: '4px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '12px' }}>
          {[
            { icon: Sparkles, active: isChatOpen, toggle: () => setIsChatOpen(v => !v), title: 'Toggle AI Chat (Cmd+Shift+B)' },
            { icon: FolderTree, active: isExplorerOpen, toggle: () => setIsExplorerOpen(v => !v), title: 'Toggle Explorer (Cmd+B)' },
            { icon: Terminal, active: isTerminalOpen, toggle: () => setIsTerminalOpen(v => !v), title: 'Toggle Terminal (Cmd+J)' }
          ].map(({ icon: Icon, active, toggle, title }) => (
            <button
              key={title}
              onClick={toggle}
              title={title}
              style={{
                background: active ? 'var(--primary-glow)' : 'none',
                border: 'none',
                borderRadius: '4px',
                color: active ? 'var(--primary)' : 'var(--text-dark)',
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if(!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={e => { if(!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>

      {/* Center: Project Title / Workspace Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h1 style={{
          fontSize: '13px',
          fontWeight: '700',
          color: '#fff',
          letterSpacing: '-0.01em',
          margin: 0
        }}>
          {projectTitle || 'Untitled Workspace'}
        </h1>
      </div>

      {/* Right: Remix, Share, Publish, settings gear, and container status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        
        {/* Direct Start/Stop action aligned with status */}
        {!isRunning && !isStarting ? (
          <button
            onClick={handleStart}
            style={{
              background: 'linear-gradient(135deg, #0D8A6A 0%, #0B7359 100%)',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '11.5px',
              fontWeight: '600',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(13,138,106,0.25)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-0.5px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            <Play size={11} fill="currentColor" />
            <span>Start Sandbox</span>
          </button>
        ) : isRunning ? (
          <button
            onClick={handleStop}
            disabled={stopLoading}
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '11.5px',
              fontWeight: '600',
              color: 'var(--error)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'}
          >
            {stopLoading ? (
              <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <Square size={11} />
            )}
            <span>Stop Sandbox</span>
          </button>
        ) : (
          <button
            disabled
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '11.5px',
              fontWeight: '600',
              color: '#6B6E82',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'not-allowed',
            }}
          >
             <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
             <span>Starting...</span>
          </button>
        )}

        {/* Sandbox container status dropdown */}
        <div style={{ position: 'relative' }} ref={statusMenuRef}>
          <button
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              color: isRunning ? 'var(--success)' : isStarting ? '#eab308' : 'var(--text-dark)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600'
            }}
          >
            <span style={{
              width: '5px', height: '5px', borderRadius: '50%',
              backgroundColor: isRunning ? 'var(--success)' : isStarting ? '#eab308' : 'var(--text-dark)',
              boxShadow: isRunning ? '0 0 6px var(--success)' : 'none',
              animation: isStarting ? 'pulse-g 1.5s infinite' : 'none'
            }} />
            <span>{isRunning ? 'Sandbox Live' : isStarting ? 'Provisioning...' : 'Sandbox Offline'}</span>
            <ChevronDown size={10} color="var(--text-dark)" />
          </button>

          {statusMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '28px',
              right: 0,
              backgroundColor: 'var(--bg-element)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 100,
              width: '180px',
              display: 'flex',
              flexDirection: 'column',
              padding: '4px'
            }}>
              {!isRunning && (
                <button
                  onClick={handleStart}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                    fontSize: '11px', color: '#cbd5e1', background: 'none', border: 'none',
                    textAlign: 'left', cursor: 'pointer', borderRadius: '4px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Play size={12} fill="currentColor" />
                  <span>Start Sandbox</span>
                </button>
              )}
              {isRunning && (
                <button
                  onClick={handleStop}
                  disabled={stopLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                    fontSize: '11px', color: 'var(--error)', background: 'none', border: 'none',
                    textAlign: 'left', cursor: 'pointer', borderRadius: '4px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Square size={12} />
                  <span>Stop Sandbox</span>
                </button>
              )}
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                    fontSize: '11px', color: '#cbd5e1', textDecoration: 'none', borderRadius: '4px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <ExternalLink size={12} />
                  <span>Preview Tab</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <button
          onClick={() => alert("Project Cloned!")}
          style={{
            background: 'none', border: 'none', color: '#cbd5e1', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
            padding: '5px 10px', borderRadius: '4px'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Remix
        </button>

        <button
          onClick={() => {
            if (previewUrl) {
              handleCopy(previewUrl, 'share');
              alert("Preview link copied to clipboard!");
            } else {
              alert("Sandbox is offline. Start it to share.");
            }
          }}
          style={{
            background: 'none', border: 'none', color: '#cbd5e1', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
            padding: '5px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Share2 size={11} />
          <span>{copiedText === 'share' ? 'Copied' : 'Share'}</span>
        </button>

        <button
          onClick={() => alert("Application Published!")}
          style={{
            background: 'var(--primary)', border: 'none', color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
            padding: '5px 12px', borderRadius: '6px', boxShadow: '0 2px 8px var(--primary-glow)'
          }}
        >
          Publish
        </button>

        <button onClick={onNavigateSettings} className="icon-btn" style={{ padding: '6px' }} title="Settings">
          <Settings size={13} />
        </button>
      </div>

    </header>
  );
}
