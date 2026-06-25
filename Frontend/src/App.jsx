import React, { useState, useEffect } from 'react';
import './App.css';
import SandboxHeader from './features/sandbox/components/SandboxHeader';
import AIChat from './features/chat/components/AIChat';
import FileExplorer from './features/editor/components/FileExplorer';
import CodeEditor from './features/editor/components/CodeEditor';
import TerminalShell from './features/editor/components/TerminalShell';
import RuntimeLogs from './features/logs/components/RuntimeLogs';
import Layout from './components/Layout';
import { useSandbox } from './features/sandbox/Hooks/sandbox.hooks';
import { useEditor } from './features/editor/Hooks/editor.hooks';
import {
  Sparkles, FolderTree, Play, AlertTriangle,
  ExternalLink, RefreshCw, Eye, Loader2, Code2, Terminal, X, Cpu, Check, Info, Activity
} from 'lucide-react';

// ─────────────────────────────────────────────
// Warming / Loading overlay shown in the preview
// panel while the sandbox container is booting.
// ─────────────────────────────────────────────
function PreviewWarmingScreen({ message, attempt }) {
  const MAX_DOTS = 20;
  const filled = Math.min(attempt, MAX_DOTS);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      padding: '32px',
      textAlign: 'center',
    }}>
      {/* Spinning ring */}
      <div style={{ position: 'relative', width: '64px', height: '64px' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid var(--bg-active)',
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: 'var(--primary)',
          animation: 'spin 0.9s linear infinite',
        }} />
        {/* Inner glow dot */}
        <div style={{
          position: 'absolute',
          inset: '18px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
          animation: 'pulse-p 2s ease-in-out infinite',
        }} />
      </div>

      {/* Message */}
      <div style={{ maxWidth: '260px' }}>
        <p style={{
          fontSize: '15px',
          fontWeight: '600',
          color: 'var(--text-main)',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-heading)',
        }}>
          Sandbox Warming Up
        </p>
        <p style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: '1.5',
          minHeight: '40px',
          transition: 'all 0.3s ease',
        }}>
          {message || 'Provisioning sandbox container…'}
        </p>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '200px' }}>
        {Array.from({ length: MAX_DOTS }).map((_, i) => (
          <div
            key={i}
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: i < filled ? 'var(--primary)' : 'var(--bg-active)',
              boxShadow: i < filled ? '0 0 4px var(--primary-glow)' : 'none',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* ETA hint */}
      <p style={{
        fontSize: '11px',
        color: 'var(--text-dark)',
        margin: 0,
        fontFamily: 'var(--font-mono)',
      }}>
        ~{Math.max(0, 40 - attempt * 2)}s remaining
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
export default function App() {
  const { sandboxId, previewUrl, status, warmingMessage, warmingAttempt } = useSandbox();
  const { syncAllFilesToCache } = useEditor();

  const [workspaceTab, setWorkspaceTab] = useState('editor'); // 'editor' | 'preview'
  const [bottomTab, setBottomTab] = useState('terminal');       // 'terminal' | 'logs'
  const [iframeKey, setIframeKey] = useState(0);

  // Panel Open/Close visibility states
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const isWarming  = status === 'warming';
  const isRunning  = status === 'running';
  const isStarting = status === 'starting';

  // 5-minute polling loop for file cache sync
  useEffect(() => {
    if (status === 'running' && sandboxId) {
      // Perform initial sync
      syncAllFilesToCache(sandboxId);

      const interval = setInterval(() => {
        syncAllFilesToCache(sandboxId);
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [sandboxId, status, syncAllFilesToCache]);

  // Sync on visiting the editor tab (nav switch)
  useEffect(() => {
    if (workspaceTab === 'editor' && status === 'running' && sandboxId) {
      syncAllFilesToCache(sandboxId);
    }
  }, [workspaceTab, sandboxId, status, syncAllFilesToCache]);

  // Global Keyboard Shortcuts (hotkeys) Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // 1. Cmd/Ctrl + B -> Toggle Explorer
      if (isCmdOrCtrl && key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setIsExplorerOpen((prev) => !prev);
      }

      // 2. Cmd/Ctrl + Shift + B -> Toggle AI Agent Chat
      if (isCmdOrCtrl && e.shiftKey && key === 'b') {
        e.preventDefault();
        setIsChatOpen((prev) => !prev);
      }

      // 3. Cmd/Ctrl + J -> Toggle Bottom Terminal panel
      if (isCmdOrCtrl && key === 'j' && !e.shiftKey) {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }

      // 4. Cmd/Ctrl + Shift + T -> Toggle Center Editor / Preview
      if (isCmdOrCtrl && e.shiftKey && key === 't') {
        e.preventDefault();
        setWorkspaceTab((prev) => (prev === 'editor' ? 'preview' : 'editor'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activityBar = (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {/* Folder / Explorer toggle */}
        <div 
          className={`activity-bar-item ${isExplorerOpen ? 'active' : ''}`}
          onClick={() => setIsExplorerOpen(!isExplorerOpen)}
          title="Explorer (Cmd+B)"
        >
          {isExplorerOpen && <div className="activity-bar-item-indicator" />}
          <FolderTree size={20} />
        </div>

        {/* Coding Agent toggle */}
        <div 
          className={`activity-bar-item ${isChatOpen ? 'active' : ''}`}
          onClick={() => setIsChatOpen(!isChatOpen)}
          title="Coding Agent (Cmd+Shift+B)"
        >
          {isChatOpen && <div className="activity-bar-item-indicator" />}
          <Cpu size={20} />
        </div>
      </div>
      <div className="activity-bar-bottom">
        {/* System status toggle */}
        <div 
          className="activity-bar-item" 
          title="System Status"
        >
          <Activity size={20} />
        </div>
      </div>
    </div>
  );

  const statusBar = (
    <div className="status-bar">
      <div className="status-bar-section">
        <div className="status-bar-item" title="Git Branch">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
            🌿 <span>main*</span>
          </span>
        </div>
        
        {/* Sandbox status indicator */}
        <div className="status-bar-item" title="Sandbox Lifecycle Status">
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isRunning ? 'var(--success)' : (isWarming || isStarting) ? 'var(--warning)' : 'var(--text-dark)',
            boxShadow: isRunning ? '0 0 6px var(--success-glow)' : 'none',
            animation: (isWarming || isStarting) ? 'pulse-g 1.5s infinite' : 'none',
          }} />
          <span style={{ color: isRunning ? 'var(--success)' : 'var(--text-muted)' }}>
            {isRunning ? 'Sandbox Active' : (isWarming || isStarting) ? 'Booting Container...' : 'Sandbox Offline'}
          </span>
        </div>
      </div>

      <div className="status-bar-section">
        {isRunning && previewUrl && (
          <div className="status-bar-item" title="Vite Port">
            <span style={{ color: 'var(--text-muted)' }}>Port: 5173</span>
          </div>
        )}
        <div className="status-bar-item" title="Active Language">
          <span>JavaScript JSX</span>
        </div>
        <div className="status-bar-item" title="Platform Information" style={{ color: 'var(--primary)' }}>
          <span>Antigravity IDE v1.0</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <SandboxHeader 
        isExplorerOpen={isExplorerOpen}
        setIsExplorerOpen={setIsExplorerOpen}
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        isTerminalOpen={isTerminalOpen}
        setIsTerminalOpen={setIsTerminalOpen}
        workspaceTab={workspaceTab}
        setWorkspaceTab={setWorkspaceTab}
      />

      <Layout
        activityBar={activityBar}
        isLeftOpen={isExplorerOpen}
        isRightOpen={isChatOpen}
        isBottomOpen={isTerminalOpen}
        leftPanel={
          <>
            <div className="panel-header">
              <div className="panel-title">
                <FolderTree size={12} color="var(--primary)" />
                <span>Explorer</span>
              </div>
              <button 
                onClick={() => setIsExplorerOpen(false)}
                title="Collapse Explorer"
                style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
              >
                <X size={13} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FileExplorer />
            </div>
          </>
        }
        centerWorkspace={
          <>
            <div className="tab-bar">
              <button
                className={`tab-btn ${workspaceTab === 'editor' ? 'active' : ''}`}
                onClick={() => setWorkspaceTab('editor')}
              >
                <Code2 size={12} color={workspaceTab === 'editor' ? 'var(--primary)' : 'var(--text-dark)'} />
                <span>Code Editor</span>
              </button>
              <button
                className={`tab-btn ${workspaceTab === 'preview' ? 'active' : ''}`}
                onClick={() => setWorkspaceTab('preview')}
              >
                <Eye size={12} color={workspaceTab === 'preview' ? 'var(--primary)' : 'var(--text-dark)'} />
                <span>App Preview</span>
              </button>
            </div>

            <div className="workspace-content">
              {workspaceTab === 'editor' ? (
                <CodeEditor />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* Browser-style address bar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    height: '36px',
                    borderBottom: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-main)',
                    gap: '8px',
                    flexShrink: 0,
                  }}>
                    {/* Status dot */}
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isRunning
                        ? 'var(--success)'
                        : isWarming || isStarting
                          ? '#f59e0b'
                          : 'var(--text-dark)',
                      boxShadow: isRunning ? '0 0 6px var(--success-glow)' : 'none',
                      flexShrink: 0,
                      animation: (isWarming || isStarting) ? 'pulse-g 1.5s infinite' : 'none',
                    }} />

                    {/* URL display */}
                    <div style={{
                      flex: 1,
                      backgroundColor: 'var(--bg-element)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      color: isRunning ? 'var(--text-muted)' : 'var(--text-dark)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {isRunning || isWarming ? (previewUrl || 'Resolving…') : 'about:blank'}
                    </div>

                    {/* Action buttons */}
                    {isRunning && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={() => setIframeKey((k) => k + 1)}
                          title="Reload preview"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px', borderRadius: '4px', display: 'flex' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-element)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <RefreshCw size={13} />
                        </button>
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in new tab"
                          style={{ color: 'var(--text-muted)', padding: '5px', display: 'flex', borderRadius: '4px' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-element)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    )}

                    {(isStarting || isWarming) && (
                      <Loader2
                        size={14}
                        color="#f59e0b"
                        style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                      />
                    )}
                  </div>

                  {/* Preview viewport */}
                  <div style={{ flex: 1, position: 'relative', backgroundColor: 'var(--bg-panel)' }}>
                    {!isRunning && !isWarming && !isStarting && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          padding: '20px',
                          borderRadius: '50%',
                          background: 'rgba(99,102,241,0.06)',
                          border: '1px solid rgba(99,102,241,0.1)',
                          marginBottom: '16px',
                        }}>
                          <Play size={28} color="var(--text-dark)" />
                        </div>
                        <p style={{ fontSize: '14px', color: 'var(--text-dark)', margin: 0, lineHeight: 1.5 }}>
                          Launch a sandbox to see your app here
                        </p>
                      </div>
                    )}

                    {isStarting && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        backgroundColor: 'var(--bg-panel)',
                      }}>
                        <Loader2 size={36} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                          Allocating sandbox…
                        </p>
                      </div>
                    )}

                    {isWarming && (
                      <PreviewWarmingScreen
                        message={warmingMessage}
                        attempt={warmingAttempt}
                      />
                    )}

                    {isRunning && (
                      <iframe
                        key={iframeKey}
                        src={previewUrl}
                        title="Application Preview"
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          display: 'block',
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        }
        centerTerminal={
          <>
            <div className="tab-bar" style={{ justifyContent: 'space-between', paddingRight: '12px' }}>
              <div style={{ display: 'flex', gap: '2px', height: '100%' }}>
                {/* Problems tab */}
                <button
                  className={`tab-btn ${bottomTab === 'problems' ? 'active' : ''}`}
                  onClick={() => setBottomTab('problems')}
                >
                  <Info size={12} color={bottomTab === 'problems' ? 'var(--primary)' : 'var(--text-dark)'} />
                  <span>Problems</span>
                </button>

                {/* Output (Runtime Logs) tab */}
                <button
                  className={`tab-btn ${bottomTab === 'logs' ? 'active' : ''}`}
                  onClick={() => setBottomTab('logs')}
                >
                  <AlertTriangle size={12} color={bottomTab === 'logs' ? 'var(--primary)' : 'var(--text-dark)'} />
                  <span>Output</span>
                </button>

                {/* Terminal Shell tab */}
                <button
                  className={`tab-btn ${bottomTab === 'terminal' ? 'active' : ''}`}
                  onClick={() => setBottomTab('terminal')}
                >
                  <Terminal size={12} color={bottomTab === 'terminal' ? 'var(--primary)' : 'var(--text-dark)'} />
                  <span>Terminal</span>
                </button>

                {/* Ports tab */}
                <button
                  className={`tab-btn ${bottomTab === 'ports' ? 'active' : ''}`}
                  onClick={() => setBottomTab('ports')}
                >
                  <span style={{ fontSize: '11px' }}>🔌</span>
                  <span>Ports</span>
                </button>
              </div>
              <button
                onClick={() => setIsTerminalOpen(false)}
                title="Collapse Terminal"
                style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
              >
                <X size={13} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
              {bottomTab === 'terminal' && <TerminalShell />}
              {bottomTab === 'logs' && <RuntimeLogs />}
              {bottomTab === 'problems' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dark)', backgroundColor: 'var(--bg-panel)' }}>
                  <Check size={20} color="var(--success)" style={{ marginBottom: '6px' }} />
                  <span style={{ fontSize: '12px' }}>No problems have been detected in the workspace.</span>
                </div>
              )}
              {bottomTab === 'ports' && (
                <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px', height: '100%', overflowY: 'auto', backgroundColor: 'var(--bg-panel)', fontFamily: 'var(--font-mono)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dark)', fontSize: '10px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '6px 8px' }}>Port</th>
                        <th style={{ padding: '6px 8px' }}>Protocol</th>
                        <th style={{ padding: '6px 8px' }}>Address</th>
                        <th style={{ padding: '6px 8px' }}>Service</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>5173</td>
                        <td style={{ padding: '6px 8px' }}>HTTP / WS</td>
                        <td style={{ padding: '6px 8px' }}>localhost:5173</td>
                        <td style={{ padding: '6px 8px', color: 'var(--success)' }}>Vite Frontend dev server</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>3000</td>
                        <td style={{ padding: '6px 8px' }}>HTTP</td>
                        <td style={{ padding: '6px 8px' }}>localhost:3000</td>
                        <td style={{ padding: '6px 8px', color: 'var(--success)' }}>Agent File API Server</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        }
        rightPanel={
          <>
            <div className="panel-header">
              <div className="panel-title">
                <Cpu size={12} color="var(--primary)" />
                <span>Coding Agent</span>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                title="Collapse Coding Agent"
                style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
              >
                <X size={13} />
              </button>
            </div>
            {/* CRITICAL: display:flex + flexDirection:column is required so AIChat's height:100% resolves correctly */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <AIChat />
            </div>
          </>
        }
      />
      {statusBar}
    </div>
  );
}
