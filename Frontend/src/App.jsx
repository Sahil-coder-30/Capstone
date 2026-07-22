import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import './App.scss';
import SandboxHeader from './features/sandbox/components/SandboxHeader';
import AIChat from './features/coding-agent/components/AIChat';
import AppAgentFloat from './features/copilot/components/AppAgentFloat';
import FileExplorer from './features/editor/components/FileExplorer';
import CodeEditor from './features/editor/components/CodeEditor';
import TerminalShell from './features/editor/components/TerminalShell';
import RuntimeLogs from './features/logs/components/RuntimeLogs';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import { TakshaIcon, TakshaAnimatedLogo } from './components/BrandLogo';
import { loginSuccess, loginFailure, logoutThunk } from './features/auth/slice/auth.slice';
import { fetchMeAPI } from './features/auth/service/auth.api';
import SettingsPage from './features/settings/pages/SettingsPage';
import { useSandbox } from './features/sandbox/Hooks/sandbox.hooks';
import { useEditor } from './features/editor/Hooks/editor.hooks';
import { useWorkspaceSync } from './features/editor/Hooks/useWorkspaceSync';
import {
  FolderTree, Play, AlertTriangle,
  ExternalLink, RefreshCw, Eye, Loader2, Code2, Terminal, X, Cpu, Check, Info,
  Zap, BookOpen, GitBranch, Plug, ChevronRight
} from 'lucide-react';

// ─────────────────────────────────────────────
// Redesigned Google-style loading carousel shown
// in the preview panel while sandbox container is booting.
// ─────────────────────────────────────────────
function PreviewWarmingScreen({ message }) {
  const [tipIndex, setTipIndex] = useState(0);

  const tips = [
    {
      title: "Use Custom Instructions",
      description: "Save custom instructions to define app styles, frameworks, or other preferences to ensure the agent builds exactly what you have in mind.",
      icon: <BookOpen size={18} color="var(--primary)" />
    },
    {
      title: "Real-time Hot Reload",
      description: "Watch your application update in real time. Any React component or style changes are immediately compiled and reflected in the preview.",
      icon: <Zap size={18} color="var(--primary)" />
    },
    {
      title: "Collapsible Terminal Shell",
      description: "Run test suites, execute shell scripts, and verify compiler outputs using the integrated terminal panel at the bottom.",
      icon: <Terminal size={18} color="var(--primary)" />
    },
    {
      title: "Bidirectional Syncing",
      description: "Files edited by the AI agent are instantly synced with your editor. You can take over coding or refine edits at any moment.",
      icon: <RefreshCw size={18} color="var(--primary)" />
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const activeTip = tips[tipIndex];

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      padding: '24px',
      textAlign: 'center',
      fontFamily: 'var(--font-sans)',
      userSelect: 'none',
      zIndex: 10
    }}>
      {/* Title */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 6px' }}>Generating application</h2>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>Enjoy these tips while you wait</p>
      </div>

      {/* Rotating Tip Card */}
      <div style={{
        width: '100%',
        maxWidth: '380px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease-in-out'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--bg-element)' }}>{activeTip.icon}</span>
          {/* Pulsing loading dots */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-muted)', animation: 'spin 1.2s infinite' }} />
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-dark)', animation: 'spin 1.2s infinite 0.2s' }} />
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--border-strong)', animation: 'spin 1.2s infinite 0.4s' }} />
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--border)', animation: 'spin 1.2s infinite 0.6s' }} />
          </div>
        </div>
        <h3 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{activeTip.title}</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>{activeTip.description}</p>
      </div>

      {/* Status Log */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Loader2 size={13} className="animate-spin text-slate-400" />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {message || 'Provisioning sandbox container…'}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
export default function App() {
  const { sandboxId, previewUrl, status, warmingMessage, warmingAttempt, loadSandboxStatus, startSandbox } = useSandbox();
  const { fetchFilesList } = useEditor();

  // Initialize real-time workspace file synchronization
  useWorkspaceSync();

  const dispatch = useDispatch();
  const { isAuthenticated, loading, user } = useSelector((state) => state.auth);
  const [currentRoute, setCurrentRoute] = useState('landing'); // 'landing' | 'login'

  // Parse initial route from URL search params
  const initialParams = new URLSearchParams(window.location.search);
  const [activeRoute, setActiveRoute] = useState(initialParams.get('route') || 'dashboard'); // 'dashboard' | 'settings'
  const [dashboardTab, setDashboardTab] = useState(initialParams.get('tab') || 'playground');
  const [currentProjectId, setCurrentProjectId] = useState(initialParams.get('project') || null);
  const [currentProjectTitle, setCurrentProjectTitle] = useState(initialParams.get('title') || '');

  // Initialize theme on boot
  useEffect(() => {
    const isLight = localStorage.getItem('theme') === 'light';
    if (isLight) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  // Sync state to URL search params
  useEffect(() => {
    if (!isAuthenticated) return;

    const currentParams = new URLSearchParams(window.location.search);
    const urlProject = currentParams.get('project');
    const urlTitle = currentParams.get('title') || '';
    const urlRoute = currentParams.get('route') || 'dashboard';
    const urlTab = currentParams.get('tab') || 'playground';

    const isMatched =
      urlProject === currentProjectId &&
      urlTitle === currentProjectTitle &&
      urlRoute === activeRoute &&
      urlTab === dashboardTab;

    if (!isMatched) {
      const newParams = new URLSearchParams();
      if (currentProjectId) {
        newParams.set('project', currentProjectId);
        if (currentProjectTitle) {
          newParams.set('title', currentProjectTitle);
        }
      } else if (activeRoute === 'settings') {
        newParams.set('route', 'settings');
      } else {
        newParams.set('tab', dashboardTab);
      }

      const search = newParams.toString();
      const newUrl = `${window.location.pathname}${search ? '?' + search : ''}`;
      window.history.pushState(null, '', newUrl);
    }
  }, [currentProjectId, currentProjectTitle, activeRoute, dashboardTab, isAuthenticated]);

  // Listen to popstate event (browser back/forward) to update state
  useEffect(() => {
    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const project = currentParams.get('project');
      const title = currentParams.get('title') || '';
      const route = currentParams.get('route') || 'dashboard';
      const tab = currentParams.get('tab') || 'playground';

      setCurrentProjectId(project);
      setCurrentProjectTitle(title);
      setActiveRoute(route);
      setDashboardTab(tab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Session verification on mount
  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await fetchMeAPI();
        if (response.status === 'success' && response.user) {
          dispatch(loginSuccess({ user: response.user }));
        } else {
          dispatch(loginFailure('Invalid session response'));
        }
      } catch (err) {
        dispatch(loginFailure(err.response?.data?.message || err.message || 'Unauthorized'));
      }
    };

    verifySession();
  }, [dispatch]);

  // ─── Sandbox lifecycle: load real status then auto-start if needed ───────────
  // This is the ONLY effect that drives sandbox state. It:
  //   1. If sandbox is already running for THIS project (e.g. just started by
  //      the Dashboard playground flow), skip the status check entirely to
  //      avoid disrupting the active initialPrompt auto-send.
  //   2. Otherwise, calls loadSandboxStatus → backend reconciles with K8s
  //   3. If real status is 'idle', auto-starts the sandbox
  const sandboxProjectId = useSelector((state) => state.sandbox.projectId);
  const sandboxStatus    = useSelector((state) => state.sandbox.status);

  useEffect(() => {
    if (!currentProjectId) return;

    // Sandbox is already live (or booting) for this specific project —
    // trust the existing Redux state. loadSandboxStatus would flash 'starting'
    // and break the initialPrompt auto-send from AIChat.
    const alreadyActive = (
      sandboxProjectId === currentProjectId &&
      (sandboxStatus === 'running' || sandboxStatus === 'starting' || sandboxStatus === 'warming')
    );
    if (alreadyActive) return;

    let cancelled = false;

    const run = async () => {
      const realStatus = await loadSandboxStatus(currentProjectId);

      // realStatus is what K8s actually says right now.
      // Only start if the pod is genuinely not running.
      if (!cancelled && (realStatus === 'idle' || realStatus === 'down')) {
        startSandbox(currentProjectId).catch(() => {
          // Error already dispatched to Redux by startSandbox — no need to rethrow
        });
      }
    };

    run();

    return () => { cancelled = true; };
  // sandboxProjectId and sandboxStatus are read at effect invocation time.
  // We intentionally only re-run on projectId change, not on every status change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);


  // Default tab is 'preview' to show progress loader, toggle between 'preview' | 'editor'
  const [workspaceTab, setWorkspaceTab] = useState('preview');
  const [bottomTab, setBottomTab] = useState('terminal');
  const [iframeKey, setIframeKey] = useState(0);

  // Panel visibility
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false); // default closed for clean layout

  const isWarming  = status === 'warming';
  const isRunning  = status === 'running';
  const isStarting = status === 'starting';

  // Initial sync for real-time file cache sync when sandbox starts running
  useEffect(() => {
    if (status === 'running' && sandboxId) {
      fetchFilesList(sandboxId);
    }
  }, [sandboxId, status, fetchFilesList]);

  // Sync on visiting the editor tab
  useEffect(() => {
    if (workspaceTab === 'editor' && status === 'running' && sandboxId) {
      fetchFilesList(sandboxId);
    }
  }, [workspaceTab, sandboxId, status, fetchFilesList]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (isCmdOrCtrl && key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setIsExplorerOpen((prev) => !prev);
      }

      if (isCmdOrCtrl && e.shiftKey && key === 'b') {
        e.preventDefault();
        setIsChatOpen((prev) => !prev);
      }

      if (isCmdOrCtrl && key === 'j' && !e.shiftKey) {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }

      if (isCmdOrCtrl && e.shiftKey && key === 't') {
        e.preventDefault();
        setWorkspaceTab((prev) => (prev === 'editor' ? 'preview' : 'editor'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="auth-loader">
        {/* Background ambient elements */}
        <div className="auth-loader__ambient-orb auth-loader__ambient-orb--1" />
        <div className="auth-loader__ambient-orb auth-loader__ambient-orb--2" />
        <div className="auth-loader__ambient-grid" />

        <div className="auth-loader__content">
          <div className="auth-loader__logo-container" style={{ marginBottom: '1.5rem' }}>
            <TakshaAnimatedLogo maxWidth="340px" autoPlay={true} interactive={true} />
          </div>
          <div className="auth-loader__meta">
            <div className="auth-loader__status-container">
              <span className="auth-loader__status-dot" />
              <p className="auth-loader__text">Authenticating session…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (currentRoute === 'login') {
      return <Login onBackToHome={() => setCurrentRoute('landing')} />;
    }
    return <LandingPage onNavigateToLogin={() => setCurrentRoute('login')} />;
  }

  const statusBar = (
    <div className="status-bar">
      <div className="status-bar-section">
        <div className="status-bar-item" title="Git Branch">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
            <GitBranch size={12} /> <span>main*</span>
          </span>
        </div>
        <div className="status-bar-item" title="Sandbox Status">
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
          <div className="status-bar-item">
            <span style={{ color: 'var(--text-muted)' }}>Port: 5173</span>
          </div>
        )}
        <div className="status-bar-item">
          <span>JavaScript JSX</span>
        </div>
        <div className="status-bar-item" style={{ color: 'var(--primary)' }}>
          <span>CodeSpace IDE v1.0</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {currentProjectId ? (
        <div className="app-container animate-fade-in">
          <SandboxHeader 
            isExplorerOpen={isExplorerOpen}
            setIsExplorerOpen={setIsExplorerOpen}
            isChatOpen={isChatOpen}
            setIsChatOpen={setIsChatOpen}
            isTerminalOpen={isTerminalOpen}
            setIsTerminalOpen={setIsTerminalOpen}
            workspaceTab={workspaceTab}
            setWorkspaceTab={setWorkspaceTab}
            projectId={currentProjectId}
            projectTitle={currentProjectTitle}
            onBackToDashboard={() => {
              setCurrentProjectId(null);
              setCurrentProjectTitle('');
              setDashboardTab('my-apps');
            }}
            onNavigateSettings={() => {
              setCurrentProjectId(null);
              setCurrentProjectTitle('');
              setActiveRoute('settings');
            }}
          />

          <Layout
            activityBar={null} // No activity bar matching screenshots
            isLeftOpen={isChatOpen} // Left panel hosts Chat
            isRightOpen={false} // Right panel collapses
            isBottomOpen={isTerminalOpen}
            onToggleLeft={(forceState) => {
              if (typeof forceState === 'boolean') {
                setIsChatOpen(forceState);
              } else {
                setIsChatOpen(prev => !prev);
              }
            }}
            onToggleBottom={(forceState) => {
              if (typeof forceState === 'boolean') {
                setIsTerminalOpen(forceState);
              } else {
                setIsTerminalOpen(prev => !prev);
              }
            }}
            leftPanel={
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <AIChat projectId={currentProjectId} onCloseChat={() => setIsChatOpen(false)} />
                </div>
              </div>
            }
            centerWorkspace={
              <>
                {/* Preview / Code toggles at top of main workspace */}
                <div className="tab-bar">
                  <button
                    className={`tab-btn ${workspaceTab === 'preview' ? 'active' : ''}`}
                    onClick={() => setWorkspaceTab('preview')}
                  >
                    <Eye size={12} color={workspaceTab === 'preview' ? 'var(--primary)' : 'var(--text-dark)'} />
                    <span>Preview</span>
                  </button>
                  <button
                    className={`tab-btn ${workspaceTab === 'editor' ? 'active' : ''}`}
                    onClick={() => setWorkspaceTab('editor')}
                  >
                    <Code2 size={12} color={workspaceTab === 'editor' ? 'var(--primary)' : 'var(--text-dark)'} />
                    <span>Code</span>
                  </button>
                </div>

                <div className="workspace-content">
                  {workspaceTab === 'editor' ? (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
                      {/* Left: Collapsible File Explorer inside Code workspace */}
                      {isExplorerOpen ? (
                        <div style={{
                          width: '250px',
                          borderRight: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: 'var(--bg-sidebar)',
                          flexShrink: 0
                        }}>
                          <div className="panel-header">
                            <div className="panel-title">
                              <FolderTree size={12} color="var(--primary)" />
                              <span>Explorer</span>
                            </div>
                            <button 
                              onClick={() => setIsExplorerOpen(false)}
                              title="Collapse Explorer"
                              style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <FileExplorer />
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="collapsed-panel-bar vertical-collapsed-bar collapsed-explorer-bar"
                          onClick={() => setIsExplorerOpen(true)}
                          title="Click to expand File Explorer"
                        >
                          <div className="collapsed-handle-icon">
                            <FolderTree size={13} />
                          </div>
                          <div className="collapsed-label">Explorer</div>
                          <div className="collapsed-chevron">
                            <ChevronRight size={10} />
                          </div>
                        </div>
                      )}
                      
                      {/* Right: Code Editor */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <CodeEditor />
                      </div>
                    </div>
                  ) : (
                    /* Preview Pane */
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      
                      {/* Browser address bar */}
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

                        {isRunning && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              onClick={() => setIframeKey((k) => k + 1)}
                              title="Reload preview"
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px', borderRadius: '4px', display: 'flex' }}
                            >
                              <RefreshCw size={13} />
                            </button>
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open in new tab"
                              style={{ color: 'var(--text-muted)', padding: '5px', display: 'flex', borderRadius: '4px' }}
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

                      {/* Viewport content */}
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
                            <p style={{ fontSize: '14px', color: 'var(--text-dark)', margin: '0 0 16px', lineHeight: 1.5 }}>
                              Launch a sandbox to see your app here
                            </p>
                            <button
                              onClick={() => startSandbox(currentProjectId)}
                              style={{
                                padding: '8px 16px',
                                background: 'linear-gradient(135deg, #0D8A6A 0%, #0B7359 100%)',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#fff',
                                fontWeight: '600',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 12px rgba(13,138,106,0.3)',
                              }}
                              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-0.5px)'}
                              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                            >
                              <Play size={14} fill="currentColor" />
                              Start Sandbox
                            </button>
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
                              Allocating sandbox container…
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
                    <button
                      className={`tab-btn ${bottomTab === 'problems' ? 'active' : ''}`}
                      onClick={() => setBottomTab('problems')}
                    >
                      <Info size={12} color={bottomTab === 'problems' ? 'var(--primary)' : 'var(--text-dark)'} />
                      <span>Problems</span>
                    </button>

                    <button
                      className={`tab-btn ${bottomTab === 'logs' ? 'active' : ''}`}
                      onClick={() => setBottomTab('logs')}
                    >
                      <AlertTriangle size={12} color={bottomTab === 'logs' ? 'var(--primary)' : 'var(--text-dark)'} />
                      <span>Output</span>
                    </button>

                    <button
                      className={`tab-btn ${bottomTab === 'terminal' ? 'active' : ''}`}
                      onClick={() => setBottomTab('terminal')}
                    >
                      <Terminal size={12} color={bottomTab === 'terminal' ? 'var(--primary)' : 'var(--text-dark)'} />
                      <span>Terminal</span>
                    </button>

                    <button
                      className={`tab-btn ${bottomTab === 'ports' ? 'active' : ''}`}
                      onClick={() => setBottomTab('ports')}
                    >
                      <Plug size={12} color={bottomTab === 'ports' ? 'var(--primary)' : 'var(--text-dark)'} />
                      <span>Ports</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setIsTerminalOpen(false)}
                    title="Collapse Terminal"
                    style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
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
            rightPanel={null} // Collapsed right side
          />
          {statusBar}
        </div>
      ) : activeRoute === 'settings' ? (
        <SettingsPage 
          user={user}
          userName={user?.name || 'Developer'}
          userInitials={(user?.name || 'Developer').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
          userPhoto={user?.photo}
          projectsCount={2}
          onSyncLimits={() => alert('Synced sandbox limits.')}
          onLogout={() => {
            dispatch(logoutThunk());
            window.history.pushState(null, '', window.location.pathname);
          }}
          onBackToDashboard={(tab) => {
            setDashboardTab(tab);
            setActiveRoute('dashboard');
          }}
        />
      ) : (
        <Dashboard
          activeTab={dashboardTab}
          setActiveTab={setDashboardTab}
          onSelectProject={(id, title) => {
            setCurrentProjectId(id);
            setCurrentProjectTitle(title);
          }}
          onNavigateSettings={() => setActiveRoute('settings')}
        />
      )}
      {currentProjectId && <AppAgentFloat projectId={currentProjectId} />}
    </>
  );
}
