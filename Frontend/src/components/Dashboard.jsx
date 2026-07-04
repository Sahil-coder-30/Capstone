import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listProjectsAPI, createProjectAPI } from '../features/sandbox/service/sandbox.api';
import { stopSandboxAPI, deleteProjectAPI } from '../features/sandbox/service/sandbox.api';
import { getCachedProjects, setCachedProjects, upsertCachedProject } from '../features/editor/service/dbService';
import {
  Cpu, Plus, Loader2, Folder, AlertTriangle, LogOut,
  Code, Play, RefreshCw, X, Square, Trash2, MoreVertical,
  Zap, Clock, CheckCircle, XCircle, Activity, Settings, Search,
  Sparkles, BookOpen, Layers, Terminal, History, Keyboard, HelpCircle,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import './Dashboard.scss';
import BrandLogo, { TakshaIcon } from './BrandLogo';
import { useSandbox } from '../features/sandbox/Hooks/sandbox.hooks';

// ─── Status config map ────────────────────────────────────────────────────────
const STATUS = {
  live:        { label: 'Live',        className: 'status-badge--live' },
  building:    { label: 'Building',    className: 'status-badge--building' },
  down:        { label: 'Offline',     className: 'status-badge--down' },
  not_started: { label: 'Not Started', className: 'status-badge--not_started' },
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.not_started;
  return (
    <span className={`status-badge ${cfg.className}`}>
      <span className="status-badge__dot" />
      {cfg.label}
    </span>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, description, confirmLabel, danger, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
            style={{ minWidth: '80px' }}
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, index, onOpen, onStop, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const menuRef = useRef(null);
  const isLive = project.status === 'live';
  const canStop = project.status === 'live' || project.status === 'building';

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleStop = async () => {
    setMenuOpen(false);
    setStopping(true);
    await onStop(project._id);
    setStopping(false);
  };

  return (
    <div
      className="project-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {isLive && <div className="card-live-shimmer" />}

      <div className="project-card__header">
        <div className="project-card__details">
          <div className={`project-card__icon-box ${isLive ? 'project-card__icon-box--live' : ''}`}>
            <Code size={16} color={isLive ? '#10b981' : 'var(--primary)'} />
          </div>
          <h3 className="project-card__title">
            {project.title}
          </h3>
        </div>
        <div className="project-card__meta-actions">
          <StatusBadge status={project.status} />
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              className="icon-btn"
              onClick={() => setMenuOpen((v) => !v)}
              title="More options"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="dropdown-menu">
                {canStop && (
                  <button className="dropdown-item" onClick={handleStop} disabled={stopping}>
                    {stopping
                      ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                      : <Square size={12} />}
                    Stop Sandbox
                  </button>
                )}
                <button
                  className="dropdown-item danger"
                  onClick={() => { setMenuOpen(false); onDelete(project._id, project.title); }}
                >
                  <Trash2 size={12} />
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="project-card__meta">
        <div className="project-card__meta-row">
          <span className="project-card__meta-label">SANDBOX ID</span>
          <span className="project-card__meta-value">{project.sandboxId?.substring(0, 8)}…</span>
        </div>
        <div className="project-card__meta-row">
          <span className="project-card__meta-label">CREATED</span>
          <span className="project-card__meta-value">
            {project.createdAt ? new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
          </span>
        </div>
      </div>

      <button
        className="project-card__btn-open"
        onClick={() => onOpen(project._id, project.title)}
      >
        <Play size={12} fill="currentColor" />
        Open Codespace
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ 
  activeTab = 'playground', 
  setActiveTab = () => {},
  onSelectProject, 
  onNavigateSettings 
}) {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { startSandbox, terminateSandbox, deleteProject, warmingMessage } = useSandbox();

  const userPhoto = user?.photo;
  const userName = user?.name || 'Developer';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // AI Prompt Inputs
  const [promptInput, setPromptInput] = useState('');

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea whenever prompt changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [promptInput]);

  // Outstanding animated creation states
  const [allocationStep, setAllocationStep] = useState(0); // 0 = idle prompt, 1 = title synthesis, 2 = workspace init, 3 = sandbox allocation
  const [allocationLogs, setAllocationLogs] = useState([]);
  const [allocationError, setAllocationError] = useState('');

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sidebar resizing and collapsible states
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('dashboardSidebarWidth');
    return saved ? Number(saved) : 240;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('dashboardSidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');

  useEffect(() => {
    const isLight = localStorage.getItem('theme') === 'light';
    if (isLight) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  const startSidebarResize = (e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing', 'is-resizing-col');
  };

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e) => {
      if (e.clientX < 130) {
        setIsSidebarCollapsed(true);
        localStorage.setItem('dashboardSidebarCollapsed', 'true');
      } else {
        setIsSidebarCollapsed(false);
        localStorage.setItem('dashboardSidebarCollapsed', 'false');
        const newWidth = Math.max(180, Math.min(360, e.clientX));
        setSidebarWidth(newWidth);
        localStorage.setItem('dashboardSidebarWidth', String(newWidth));
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.body.classList.remove('is-resizing', 'is-resizing-col');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  const toggleSidebarCollapse = () => {
    const nextVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextVal);
    localStorage.setItem('dashboardSidebarCollapsed', JSON.stringify(nextVal));
  };

  const fetchProjects = async (silent = false) => {
    // --- Offline-first: render from IndexedDB cache immediately ---
    if (!silent) {
      const cached = await getCachedProjects();
      if (cached.length > 0) {
        setProjects(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    setError(null);
    try {
      const data = await listProjectsAPI();
      if (data.status === 'success') {
        const freshProjects = data.projects || [];
        setProjects(freshProjects);
        // Persist to IndexedDB for next offline load
        await setCachedProjects(freshProjects);
      } else {
        setError('Failed to fetch projects');
      }
    } catch (err) {
      // Network failed — already rendered from cache, show a soft warning
      if (!silent) setError(err.response?.data?.message || err.message || 'Error listing projects (cached data shown)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    if (isCreateOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [isCreateOpen]);

  useEffect(() => {
    if (warmingMessage && allocationStep === 3) {
      setAllocationLogs(prev => {
        if (prev[prev.length - 1] === warmingMessage) return prev;
        return [...prev, warmingMessage];
      });
    }
  }, [warmingMessage, allocationStep]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setValidationError('');
    const titleToCreate = newTitle.trim();
    if (!titleToCreate) { setValidationError('Project title is required'); return; }
    if (projects.length >= 5) { setValidationError('You can only create up to 5 projects'); return; }
    setCreateLoading(true);
    try {
      const response = await createProjectAPI(titleToCreate);
      setNewTitle('');
      setIsCreateOpen(false);
      
      // Save prompt input to session storage so workspace chat receives it
      if (promptInput.trim()) {
        sessionStorage.setItem(`initialPrompt_${response.project._id}`, promptInput.trim());
        setPromptInput('');
      }

      onSelectProject(response.project._id, response.project.title);
    } catch (err) {
      setValidationError(err.response?.data?.message || err.message || 'Failed to create project');
    } finally {
      setCreateLoading(false);
    }
  };

  const handlePlaygroundSubmit = async (e) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    if (projects.length >= 5) {
      alert("You have reached the maximum of 5 projects. Please delete one to create a new app.");
      return;
    }

    const originalPrompt = promptInput.trim();
    setAllocationStep(1);
    setAllocationError('');
    setAllocationLogs([
      "Initializing AI pipeline session...",
      "Decomposing prompt parameters..."
    ]);

    let title = `App - ${originalPrompt.substring(0, 16)}`;
    try {
      // Step 1: Synthesize Title via app-agent/title endpoint
      const responseTitle = await fetch('/api/ai/app-agent/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: originalPrompt })
      });

      if (responseTitle.ok) {
        const titleData = await responseTitle.json();
        if (titleData?.title) {
          title = titleData.title;
        }
      }
    } catch (err) {
      console.warn("Failed to generate title, using fallback:", err);
    }

    setAllocationLogs(prev => [
      ...prev,
      `Synthesized project title: "${title}"`,
      "Creating workspace directory..."
    ]);
    setAllocationStep(2);

    // Give a small delay so user sees transition
    await new Promise(r => setTimeout(r, 600));

    try {
      // Step 2: Create Project API
      const responseProj = await createProjectAPI(title);
      const newProjectId = responseProj.project._id;
      const newProjectTitle = responseProj.project.title;
      
      setAllocationLogs(prev => [
        ...prev,
        `Workspace directory created successfully!`,
        `Sandbox ID: ${responseProj.project.sandboxId}`,
        "Requesting sandbox pod boot..."
      ]);
      setAllocationStep(3);

      // Save prompt input to session storage so workspace chat receives it
      sessionStorage.setItem(`initialPrompt_${newProjectId}`, originalPrompt);
      setPromptInput('');

      // Cache new project in IndexedDB so it's available offline immediately
      await upsertCachedProject(responseProj.project);

      // Step 3: Spin up sandbox container and wait for network/preview response
      await startSandbox(newProjectId);

      setAllocationLogs(prev => [
        ...prev,
        "Sandbox container provisioned! Redirecting to workspace..."
      ]);

      // Delay to let user see "provisioned" log
      await new Promise(r => setTimeout(r, 600));

      // Step 4: Redirect to Coding Workspace
      onSelectProject(newProjectId, newProjectTitle);
      setAllocationStep(0);
      setAllocationLogs([]);
    } catch (err) {
      console.error("Failed to create project or sandbox:", err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to create workspace';
      setAllocationError(errMsg);
      setAllocationStep(0);
    }
  };

  // Submit from center prompt
  const handlePromptSubmit = (e) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    
    // Auto-generate project name
    const generatedName = `App - ${promptInput.trim().substring(0, 20)}`;
    setNewTitle(generatedName);
    setIsCreateOpen(true);
  };

  const handleFeelingLucky = () => {
    const luckyPrompts = [
      "A premium 3D metallic swarm scene with orbit controls and customizable metallic parameters using React Three Fiber and GSAP",
      "An interactive developer portfolio with glassmorphic cards, sliding layouts, and terminal-style telemetry displays",
      "A sleek dark-theme SaaS dashboard for monitoring container resources, real-time memory logs, and API health checks",
      "An editor layout mock demonstrating collaborative pair programming with active cursor pointers and websocket updates"
    ];
    const randomPrompt = luckyPrompts[Math.floor(Math.random() * luckyPrompts.length)];
    setPromptInput(randomPrompt);
  };

  const handleStop = async (projectId) => {
    try {
      await terminateSandbox(projectId);
      await fetchProjects(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to stop sandbox');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteProject(deleteTarget.id, deleteTarget.sandboxId);
      setDeleteTarget(null);
      await fetchProjects(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete project');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="dashboard">
      
      {/* Decorative ambient background */}
      <div className="dashboard__ambient-glow">
        <div className="dashboard__ambient-glow--orb dashboard__ambient-glow--orb-1" />
        <div className="dashboard__ambient-glow--orb dashboard__ambient-glow--orb-2" />
        <div className="dashboard__ambient-glow--orb dashboard__ambient-glow--orb-3" />
        <div className="dashboard__ambient-glow--grid" />
        <div className="dashboard__ambient-glow--noise" />

        {/* Cosmic star field — barely visible, spread across the whole dashboard */}
        <div className="dashboard-stars" aria-hidden="true">
          {[
            { top:'3%',  left:'12%', sz:1,   d:0,    t:5.2, f:7.1 },
            { top:'7%',  left:'38%', sz:1.5, d:1.4,  t:6.8, f:9.0 },
            { top:'4%',  left:'65%', sz:1,   d:0.7,  t:4.5, f:8.3 },
            { top:'9%',  left:'85%', sz:1.5, d:2.1,  t:7.2, f:6.5 },
            { top:'14%', left:'22%', sz:1,   d:0.3,  t:5.8, f:10.0 },
            { top:'18%', left:'50%', sz:1,   d:1.9,  t:6.1, f:7.8 },
            { top:'11%', left:'75%', sz:1.5, d:0.5,  t:4.9, f:9.5 },
            { top:'22%', left:'5%',  sz:1,   d:1.1,  t:7.5, f:8.0 },
            { top:'28%', left:'42%', sz:1.5, d:2.6,  t:5.3, f:6.8 },
            { top:'33%', left:'90%', sz:1,   d:0.9,  t:6.4, f:10.5 },
            { top:'38%', left:'18%', sz:1,   d:1.7,  t:4.7, f:7.4 },
            { top:'42%', left:'60%', sz:1.5, d:0.2,  t:8.0, f:9.2 },
            { top:'47%', left:'30%', sz:1,   d:2.8,  t:5.6, f:6.1 },
            { top:'50%', left:'78%', sz:1,   d:1.3,  t:7.0, f:8.7 },
            { top:'55%', left:'8%',  sz:1.5, d:0.6,  t:5.1, f:11.0 },
            { top:'58%', left:'47%', sz:1,   d:1.8,  t:6.6, f:7.3 },
            { top:'63%', left:'70%', sz:1.5, d:0.4,  t:4.8, f:9.8 },
            { top:'67%', left:'25%', sz:1,   d:2.3,  t:7.3, f:8.4 },
            { top:'72%', left:'55%', sz:1.5, d:1.0,  t:5.9, f:6.6 },
            { top:'76%', left:'88%', sz:1,   d:0.8,  t:6.2, f:10.2 },
            { top:'80%', left:'15%', sz:1,   d:2.0,  t:4.6, f:7.9 },
            { top:'84%', left:'40%', sz:1.5, d:1.5,  t:8.1, f:9.4 },
            { top:'88%', left:'68%', sz:1,   d:0.1,  t:5.5, f:8.1 },
            { top:'92%', left:'22%', sz:1.5, d:2.5,  t:6.9, f:7.0 },
            { top:'96%', left:'80%', sz:1,   d:1.2,  t:5.0, f:11.5 },
            { top:'2%',  left:'95%', sz:1.5, d:0.4,  t:7.6, f:6.3 },
            { top:'20%', left:'97%', sz:1,   d:1.6,  t:5.4, f:9.1 },
            { top:'40%', left:'98%', sz:1.5, d:2.4,  t:6.7, f:8.6 },
            { top:'60%', left:'96%', sz:1,   d:0.9,  t:4.3, f:10.8 },
            { top:'75%', left:'1%',  sz:1.5, d:1.8,  t:7.8, f:7.5 },
            { top:'15%', left:'1%',  sz:1,   d:0.3,  t:5.7, f:9.7 },
            { top:'45%', left:'52%', sz:1,   d:2.2,  t:6.3, f:8.9 },
            { top:'30%', left:'33%', sz:1.5, d:1.1,  t:7.4, f:6.4 },
            { top:'68%', left:'82%', sz:1,   d:0.6,  t:5.2, f:10.4 },
            { top:'85%', left:'57%', sz:1.5, d:2.7,  t:6.0, f:7.6 },
          ].map((s, i) => (
            <span
              key={i}
              className="dashboard-star"
              style={{
                top: s.top,
                left: s.left,
                width: `${s.sz}px`,
                height: `${s.sz}px`,
                animationDelay: `${s.d}s, ${s.d + 1}s`,
                animationDuration: `${s.t}s, ${s.f}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* 1. Left Navigation Sidebar */}
      <aside 
        className={`dashboard__sidebar ${isSidebarCollapsed ? 'dashboard__sidebar--collapsed' : ''} ${isResizingSidebar ? 'is-resizing' : ''}`}
        style={{ width: isSidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
      >
        <div>
          {/* Header Workspace Selector */}
          <div className="dashboard__sidebar-header">
            <div 
              className="dashboard__sidebar-brand" 
              style={{ 
                padding: '4px 0', 
                justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
                width: '100%',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {isSidebarCollapsed ? (
                <button 
                  onClick={toggleSidebarCollapse}
                  className="icon-btn sidebar-expand-btn"
                  title="Expand Sidebar"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <TakshaIcon size={24} />
                </button>
              ) : (
                <>
                  <BrandLogo height={24} variant={localStorage.getItem('theme') === 'light' ? 'light' : 'dark'} />
                  <button 
                    onClick={toggleSidebarCollapse} 
                    className="icon-btn sidebar-collapse-btn"
                    title="Collapse Sidebar"
                    style={{ padding: '4px' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="dashboard__sidebar-nav">
            <div 
              onClick={() => setActiveTab('playground')}
              className={`dashboard__sidebar-item ${activeTab === 'playground' ? 'dashboard__sidebar-item--active' : ''}`}
              title={isSidebarCollapsed ? "Playground" : undefined}
            >
              <Terminal size={14} />
              {!isSidebarCollapsed && <span>Playground</span>}
            </div>

            <div 
              onClick={() => { setPromptInput(''); setActiveTab('playground'); }}
              className="dashboard__sidebar-item"
              title={isSidebarCollapsed ? "New App" : undefined}
            >
              <Plus size={14} />
              {!isSidebarCollapsed && <span>New App</span>}
            </div>

            <div 
              onClick={() => setActiveTab('my-apps')}
              className={`dashboard__sidebar-item ${activeTab === 'my-apps' ? 'dashboard__sidebar-item--active' : ''}`}
              title={isSidebarCollapsed ? "My Apps" : undefined}
            >
              <Layers size={14} />
              {!isSidebarCollapsed && <span>My Apps</span>}
            </div>
          </div>
        </div>

        {/* User profile / Settings footer */}
        <div className="dashboard__sidebar-footer">
          <div className="dashboard__sidebar-profile-bar" style={{ justifyContent: isSidebarCollapsed ? 'center' : 'space-between' }}>
            <div className="dashboard__sidebar-profile-details">
              {userPhoto
                ? <img src={userPhoto} alt={userName} className="dashboard__sidebar-avatar" />
                : <div className="dashboard__sidebar-initials">{userInitials}</div>
              }
              {!isSidebarCollapsed && (
                <div className="dashboard__sidebar-user-meta">
                  <span className="dashboard__sidebar-username">{userName}</span>
                  <span className="dashboard__sidebar-tier">Free Tier</span>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && <span className="dashboard__sidebar-pro-badge">PRO</span>}
          </div>

          <button 
            onClick={onNavigateSettings} 
            className={`dashboard__sidebar-settings-btn ${activeTab === 'settings' ? 'dashboard__sidebar-settings-btn--active' : ''}`}
            title={isSidebarCollapsed ? "Settings" : undefined}
            style={{ 
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: '8px',
              padding: isSidebarCollapsed ? '10px' : '10px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              background: activeTab === 'settings' ? 'var(--bg-element)' : 'var(--bg-active)',
              border: '1px solid var(--border)',
              color: activeTab === 'settings' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
          >
            <Settings size={14} style={{ color: activeTab === 'settings' ? 'var(--primary)' : 'inherit' }} />
            {!isSidebarCollapsed && <span>Settings</span>}
          </button>
        </div>

        {/* Sidebar Resizer Drag Handle */}
        <div 
          className={`dashboard__sidebar-resizer ${isResizingSidebar ? 'active' : ''}`}
          onMouseDown={startSidebarResize}
        />
      </aside>

      {/* 2. Main content viewport */}
      <main className="dashboard__main">
        {/* Top Header info */}
        <div className="dashboard__header">
          <div style={{ flex: 1 }} />
          <button
            className="icon-btn"
            onClick={() => fetchProjects()}
            title="Refresh active lists"
            style={{ padding: '7px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {activeTab === 'playground' ? (
          /* Playground View: Centered Prompting with real-time container provisioning animations */
          <section className="dashboard__playground">

            {allocationStep > 0 ? (
              <div className="provisioning-panel">
                <div className="provisioning-panel__shimmer" />
                
                {/* Dual-spinning orbit rings */}
                <div className="provisioning-panel__spinner-container">
                  <div className="provisioning-panel__core-glow" />
                  <div className="provisioning-panel__spinner-outer" />
                  <div className="provisioning-panel__spinner-inner" />
                </div>

                <h2 className="provisioning-panel__title">Assembling Sandbox</h2>
                <p className="provisioning-panel__subtitle">
                  Configuring a virtual sandbox environment on the Capstone orchestrator. Just a few seconds...
                </p>

                {/* Steps */}
                <div className="provisioning-panel__steps">
                  <div className={`provisioning-panel__step ${allocationStep === 1 ? 'provisioning-panel__step--active' : allocationStep > 1 ? 'provisioning-panel__step--completed' : ''}`}>
                    <Sparkles className="step-icon" size={14} />
                    <span className="step-text">Synthesizing project title & features</span>
                  </div>
                  <div className={`provisioning-panel__step ${allocationStep === 2 ? 'provisioning-panel__step--active' : allocationStep > 2 ? 'provisioning-panel__step--completed' : ''}`}>
                    <Layers className="step-icon" size={14} />
                    <span className="step-text">Creating workspace directories</span>
                  </div>
                  <div className={`provisioning-panel__step ${allocationStep === 3 ? 'provisioning-panel__step--active' : allocationStep > 3 ? 'provisioning-panel__step--completed' : ''}`}>
                    <Cpu className="step-icon" size={14} />
                    <span className="step-text">Spinning up sandbox pod</span>
                  </div>
                </div>

                {/* Console Log outputs */}
                <div className="provisioning-panel__console">
                  {allocationLogs.map((log, idx) => (
                    <div key={idx} className="provisioning-panel__console-line">
                      <span>&gt;</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Floating orb layer scoped to playground / input area */}
                <div className="playground-orbs" aria-hidden="true">
                  <div className="playground-orbs__orb playground-orbs__orb--1" />
                  <div className="playground-orbs__orb playground-orbs__orb--2" />
                  <div className="playground-orbs__orb playground-orbs__orb--3" />
                  <div className="playground-orbs__orb playground-orbs__orb--4" />
                </div>

                {/* Star field — twinkling & drifting across the playground */}
                <div className="playground-stars" aria-hidden="true">
                  {[
                    { top: '8%',  left: '6%',  size: 2,   delay: 0,    dur: 2.8, float: 3.2 },
                    { top: '12%', left: '82%', size: 1.5, delay: 0.4,  dur: 2.1, float: 4.1 },
                    { top: '5%',  left: '45%', size: 2.5, delay: 0.9,  dur: 3.5, float: 2.8 },
                    { top: '18%', left: '92%', size: 1,   delay: 1.2,  dur: 1.9, float: 5.0 },
                    { top: '25%', left: '15%', size: 2,   delay: 0.6,  dur: 2.4, float: 3.6 },
                    { top: '30%', left: '88%', size: 1.5, delay: 1.8,  dur: 3.1, float: 4.4 },
                    { top: '72%', left: '4%',  size: 2,   delay: 0.3,  dur: 2.6, float: 3.9 },
                    { top: '80%', left: '78%', size: 1,   delay: 2.1,  dur: 1.8, float: 5.2 },
                    { top: '88%', left: '35%', size: 2.5, delay: 0.7,  dur: 3.3, float: 2.5 },
                    { top: '92%', left: '90%', size: 1.5, delay: 1.5,  dur: 2.0, float: 4.7 },
                    { top: '65%', left: '93%', size: 2,   delay: 0.2,  dur: 2.9, float: 3.3 },
                    { top: '55%', left: '2%',  size: 1,   delay: 1.1,  dur: 2.2, float: 4.8 },
                    { top: '42%', left: '96%', size: 2,   delay: 0.8,  dur: 3.0, float: 3.7 },
                    { top: '35%', left: '3%',  size: 1.5, delay: 1.9,  dur: 1.7, float: 5.5 },
                    { top: '78%', left: '55%', size: 1,   delay: 0.5,  dur: 2.5, float: 4.2 },
                    { top: '3%',  left: '68%', size: 2,   delay: 1.3,  dur: 2.7, float: 3.0 },
                    { top: '95%', left: '12%', size: 1.5, delay: 2.2,  dur: 3.2, float: 4.5 },
                    { top: '15%', left: '58%', size: 1,   delay: 0.1,  dur: 1.6, float: 6.0 },
                    { top: '48%', left: '9%',  size: 2,   delay: 1.6,  dur: 2.3, float: 3.4 },
                    { top: '60%', left: '72%', size: 1.5, delay: 0.95, dur: 2.8, float: 4.0 },
                  ].map((s, i) => (
                    <span
                      key={i}
                      className="playground-star"
                      style={{
                        top: s.top,
                        left: s.left,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        animationDelay: `${s.delay}s, ${s.delay + 0.5}s`,
                        animationDuration: `${s.dur}s, ${s.float}s`,
                      }}
                    />
                  ))}
                </div>

                <div className="dashboard__playground-title-row">
                  <Sparkles size={20} color="var(--primary)" />
                  <h1 className="dashboard__playground-title">
                    Build your ideas with CodeSpace
                  </h1>
                </div>

                <p className="dashboard__playground-subtitle">
                  Spin up a containerized React + Vite workspace dynamically and let the agent implement your details instantly.
                </p>

                {allocationError && (
                  <div style={{
                    color: '#f43f5e',
                    fontSize: '12.5px',
                    background: 'rgba(244,63,94,0.06)',
                    border: '1px solid rgba(244,63,94,0.15)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    maxWidth: '640px',
                    width: '100%',
                    textAlign: 'left'
                  }}>
                    {allocationError}
                  </div>
                )}

                <div className="prompt-card-container">
                  <div className="prompt-card-glow-bg" />
                  <div className={`prompt-card-wrapper${promptInput.length > 0 ? ' is-typing' : ''}`}>
                    <form onSubmit={handlePlaygroundSubmit} className="dashboard__playground-prompt-card">
                      <textarea
                        ref={textareaRef}
                        placeholder="Describe an app and let CodeSpace do the rest..."
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (promptInput.trim()) handlePlaygroundSubmit(e);
                          }
                        }}
                        className="dashboard__playground-textarea"
                      />
                      
                      <div className="dashboard__playground-prompt-footer">
                        <div className="dashboard__playground-actions-left">
                          <button type="button" className="icon-btn" style={{ padding: '6px' }} title="Voice Input">
                            <span style={{ fontSize: '13px' }}>🎤</span>
                          </button>
                          <button type="button" className="icon-btn" style={{ padding: '6px' }} title="Attach Design Spec">
                            <span style={{ fontSize: '13px' }}>📎</span>
                          </button>
                        </div>

                        <div className="dashboard__playground-actions-right">
                          <button
                            type="button"
                            onClick={handleFeelingLucky}
                            className="dashboard__playground-lucky-btn"
                          >
                            <Sparkles size={11} />
                            I'm feeling lucky
                          </button>

                          <button
                            type="submit"
                            disabled={!promptInput.trim()}
                            className={`dashboard__playground-create-btn ${promptInput.trim() ? 'dashboard__playground-create-btn--active' : 'dashboard__playground-create-btn--disabled'}`}
                          >
                            Create App
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>

                <div className="dashboard__playground-chips">
                  {[
                    { label: 'React Dashboard', prompt: 'A highly functional admin dashboard with responsive sidebar charts, tables, and settings tabs using Lucide icons.' },
                    { label: 'Metallic Three.js Scene', prompt: 'A beautiful interactive Three.js element with OrbitControls, custom lighting, and responsive GSAP hover effects.' },
                    { label: 'Pricing Calculator', prompt: 'A sleek pricing grid with monthly/yearly toggles, feature sliders, and dynamic cost calculator fields.' },
                    { label: 'Developer Portfolio', prompt: 'An editorial design portfolio with custom typography, tabbed projects filter, and a telemetry terminal display.' }
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPromptInput(chip.prompt)}
                      className="dashboard__playground-chip"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : (
          /* Dedicated My Apps View */
          <section className="dashboard__projects-panel">
            
            {/* Header section with actions */}
            <div className="dashboard__projects-panel-header">
              <div>
                <h2 className="dashboard__projects-panel-title">My Projects</h2>
                <p className="dashboard__projects-panel-subtitle">
                  Create and manage up to 5 sandbox development environments.
                </p>
              </div>
              
              <button
                onClick={() => { setPromptInput(''); setIsCreateOpen(true); }}
                disabled={projects.length >= 5}
                className={`dashboard__projects-panel-create-btn ${projects.length >= 5 ? 'dashboard__projects-panel-create-btn--disabled' : 'dashboard__projects-panel-create-btn--active'}`}
              >
                <Plus size={14} />
                New Project
              </button>
            </div>

            {/* Project counter status strip */}
            <div className="dashboard__projects-panel-capacity-bar">
              <span>ENVIRONMENTS: <span className="dashboard__projects-panel-capacity-value">{projects.length}</span> / 5</span>
              <div className="dashboard__projects-panel-capacity-indicators">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`dashboard__projects-panel-capacity-indicator ${i < projects.length ? 'dashboard__projects-panel-capacity-indicator--filled' : ''}`}
                  />
                ))}
              </div>
              {projects.length >= 5 && (
                <span className="dashboard__projects-panel-capacity-warning">
                  <AlertTriangle size={11} /> Capacity reached
                </span>
              )}
            </div>

            {/* List and Grid display */}
            {loading ? (
              <div className="dashboard__projects-panel-loader-box">
                <Loader2 size={32} className="animate-spin text-slate-400" />
                <p className="dashboard__projects-panel-loader-text">Loading environments…</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="dashboard__projects-panel-empty-box">
                <Folder size={24} color="var(--primary)" style={{ marginBottom: '16px' }} />
                <h3 className="dashboard__projects-panel-empty-title">No Projects Yet</h3>
                <p className="dashboard__projects-panel-empty-desc">
                  Use the Playground tab to describe what you want to build and spin up a workspace.
                </p>
              </div>
            ) : (
              <div className="dashboard__projects-panel-grid">
                {projects.map((project, i) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    index={i}
                    onOpen={onSelectProject}
                    onStop={handleStop}
                    onDelete={(id, title) => setDeleteTarget({ id, title })}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Error notification banner */}
        {error && (
          <div className="dashboard__error-banner">
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="dashboard__error-close">
              <X size={13} />
            </button>
          </div>
        )}
      </main>

      {/* ─── Create Name Overlay Modal ───────────────────────────────────── */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => { setIsCreateOpen(false); setNewTitle(''); setValidationError(''); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                  Name Your CodeSpace
                </h3>
                <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-dark)' }}>
                  Give a title to initialize your sandbox.
                </p>
              </div>
              <button className="icon-btn" onClick={() => { setIsCreateOpen(false); setNewTitle(''); setValidationError(''); }}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Workspace Name
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="e.g. My Creative App, Vite Sandbox..."
                  value={newTitle}
                  onChange={e => { setNewTitle(e.target.value); setValidationError(''); }}
                  disabled={createLoading}
                  maxLength={50}
                  style={{
                    padding: '10px 12px', borderRadius: '8px',
                    background: 'var(--bg-canvas)', border: `1px solid ${validationError ? '#f43f5e' : 'var(--border)'}`,
                    color: 'var(--text-primary)', fontSize: '14.5px', outline: 'none',
                    transition: 'border-color 0.2s',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onFocus={e => { if (!validationError) e.currentTarget.style.borderColor = 'var(--primary)'; }}
                  onBlur={e => { if (!validationError) e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
                {validationError && (
                  <span style={{ fontSize: '12px', color: '#f43f5e', fontWeight: '600' }}>
                    {validationError}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setIsCreateOpen(false); setNewTitle(''); setValidationError(''); }}
                  disabled={createLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createLoading}
                  style={{ minWidth: '90px' }}
                >
                  {createLoading
                    ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                    : <><Play size={13} fill="currentColor" /> Initialize</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm Modal ────────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Project"
          description={`Are you sure you want to permanently delete "${deleteTarget.title}"? This will also tear down any running sandbox and cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleteLoading}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
