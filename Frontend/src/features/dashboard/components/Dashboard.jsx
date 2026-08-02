import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getCachedProjects, setCachedProjects, upsertCachedProject } from '../../editor/service/dbService';
import { authenticatedFetch } from '../../../services/apiClient';
import {
  Cpu, Plus, Loader2, Folder, AlertTriangle, LogOut,
  Code, Play, RefreshCw, X, Square, Trash2, MoreVertical,
  Zap, Clock, CheckCircle, XCircle, Activity, Settings, Search,
  Sparkles, BookOpen, Layers, Terminal, History, Keyboard, HelpCircle,
  ChevronLeft, ChevronRight, Mic, Paperclip,
  Moon, Sun, User, CreditCard, Crown, Zap as ZapIcon
} from 'lucide-react';
import './Dashboard.scss';
import BrandLogo, { TakshaIcon } from '../../../components/BrandLogo';
import AmbientOrbs from '../../../components/AmbientOrbs';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useDashboard } from '../Hooks/dashboard.hooks';
import { useSettings } from '../../settings/Hooks/settings.hooks';

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


// ─── Dashboard Ambient Orbs & Stars Background (Space Engine) ─────────────────
function DashboardStars() {
  return <AmbientOrbs opacity={0.95} showMeteors={false} />;
}


// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ 
  activeTab = 'playground', 
  setActiveTab = () => {},
  onSelectProject, 
  onNavigateSettings,
  onLogout,
  onNavigatePayments,
}) {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const subscription = useSelector((state) => state.settings?.credit?.subscription || 'free');
  const { loadCredit } = useSettings();
  const { listProjects, createProject } = useDashboard();
  const { startSandbox, terminateSandbox, deleteProject, warmingMessage } = useSandbox();

  const userPhoto = user?.photo;
  const userName = user?.name || 'Developer';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // AI Prompt Inputs
  const [promptInput, setPromptInput] = useState('');

  // Recents tab search & filter states
  const [recentsSearch, setRecentsSearch] = useState('');
  const [recentsFilter, setRecentsFilter] = useState('all'); // 'all' | 'live' | 'offline'

  // Computed active and filtered projects
  const activeProjects = projects.filter(p => p.status === 'live' || p.status === 'building');
  const filteredRecentProjects = projects.filter(p => {
    const matchesSearch = !recentsSearch || p.title?.toLowerCase().includes(recentsSearch.toLowerCase()) || p.sandboxId?.toLowerCase().includes(recentsSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (recentsFilter === 'live') return p.status === 'live' || p.status === 'building';
    if (recentsFilter === 'offline') return p.status === 'down' || p.status === 'not_started';
    return true;
  });


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

  // Profile flyout menu
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const [isDarkTheme, setIsDarkTheme] = useState(() => localStorage.getItem('theme') !== 'light');

  // Sidebar hover state with 2-second disappearance timer on mouse exit
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const sidebarHoverTimerRef = useRef(null);

  const handleSidebarMouseEnter = () => {
    if (sidebarHoverTimerRef.current) {
      clearTimeout(sidebarHoverTimerRef.current);
      sidebarHoverTimerRef.current = null;
    }
    setIsSidebarHovered(true);
  };

  const handleSidebarMouseLeave = () => {
    if (sidebarHoverTimerRef.current) {
      clearTimeout(sidebarHoverTimerRef.current);
    }
    sidebarHoverTimerRef.current = setTimeout(() => {
      setIsSidebarHovered(false);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (sidebarHoverTimerRef.current) {
        clearTimeout(sidebarHoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const isLight = localStorage.getItem('theme') === 'light';
    if (isLight) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileMenuOpen]);

  const handleToggleTheme = () => {
    const nextIsLight = isDarkTheme; // if currently dark, switch to light
    if (nextIsLight) {
      document.documentElement.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    }
    setIsDarkTheme(!isDarkTheme);
  };

  const handleLogout = () => {
    setProfileMenuOpen(false);
    if (onLogout) onLogout();
  };

  const handleUpgrade = () => {
    setProfileMenuOpen(false);
    if (onNavigatePayments) onNavigatePayments();
  };

  const handleNavigateSettings = () => {
    setProfileMenuOpen(false);
    if (onNavigateSettings) onNavigateSettings();
  };

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
      const data = await listProjects();
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

  useEffect(() => { 
    fetchProjects();
    // Fetch subscription/credit data so the sidebar tier ring shows correctly
    loadCredit();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const response = await createProject(titleToCreate);
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
      const responseTitle = await authenticatedFetch('/api/ai/app-agent/title', {
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
      const responseProj = await createProject(title);
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

        {/* Cosmic star field — dynamic, hardware-accelerated star canvas background */}
        <DashboardStars />
      </div>

      {/* 1. Left Navigation Sidebar */}
      <aside 
        className={`dashboard__sidebar ${isSidebarCollapsed ? 'dashboard__sidebar--collapsed' : ''} ${isResizingSidebar ? 'is-resizing' : ''}`}
        style={{ width: isSidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {/* Border-floating collapse/expand toggle button */}
        <button 
          onClick={toggleSidebarCollapse} 
          className={`sidebar-toggle-btn ${isSidebarHovered ? 'is-visible' : ''}`}
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <ChevronLeft size={14} className="sidebar-toggle-icon" />
        </button>

        <div>
          {/* Header Workspace Selector */}
          <div className="dashboard__sidebar-header">
            <div className="sidebar-logo-wrapper">
              <BrandLogo height={18} variant={localStorage.getItem('theme') === 'light' ? 'light' : 'dark'} />
            </div>
          </div>

          {/* Navigation Links */}
          <div className="dashboard__sidebar-nav">
            <div 
              onClick={() => setActiveTab('playground')}
              className={`dashboard__sidebar-item ${activeTab === 'playground' ? 'dashboard__sidebar-item--active' : ''}`}
              title={isSidebarCollapsed ? "Playground" : undefined}
            >
              <Terminal size={14} style={{ flexShrink: 0 }} />
              <span className="sidebar-label">Playground</span>
            </div>

            <div 
              onClick={() => { setPromptInput(''); setActiveTab('playground'); }}
              className="dashboard__sidebar-item"
              title={isSidebarCollapsed ? "New App" : undefined}
            >
              <Plus size={14} style={{ flexShrink: 0 }} />
              <span className="sidebar-label">New App</span>
            </div>

            <div 
              onClick={() => setActiveTab('recents')}
              className={`dashboard__sidebar-item ${activeTab === 'recents' ? 'dashboard__sidebar-item--active' : ''}`}
              title={isSidebarCollapsed ? "Recents" : undefined}
            >
              <Clock size={14} style={{ flexShrink: 0 }} />
              <span className="sidebar-label">Recents</span>
              {activeProjects.length > 0 && (
                <span className="sidebar-badge-count" title={`${activeProjects.length} active sandbox${activeProjects.length > 1 ? 'es' : ''}`}>
                  {activeProjects.length}
                </span>
              )}
            </div>

            <div 
              onClick={() => setActiveTab('my-apps')}
              className={`dashboard__sidebar-item ${activeTab === 'my-apps' ? 'dashboard__sidebar-item--active' : ''}`}
              title={isSidebarCollapsed ? "My Apps" : undefined}
            >
              <Layers size={14} style={{ flexShrink: 0 }} />
              <span className="sidebar-label">My Apps</span>
            </div>
          </div>

          {/* Quick Active & Recent Projects List inside Sidebar for Faster Access */}
          {!isSidebarCollapsed && (
            <div className="dashboard__sidebar-recents-section">
              <div className="dashboard__sidebar-recents-header">
                <span className="dashboard__sidebar-recents-title">ACTIVE & RECENTS</span>
                <span className="dashboard__sidebar-recents-count">{projects.length}</span>
              </div>
              <div className="dashboard__sidebar-recents-list">
                {projects.length === 0 ? (
                  <div className="dashboard__sidebar-recents-empty">No projects created</div>
                ) : (
                  projects.slice(0, 6).map((proj) => (
                    <div
                      key={proj._id}
                      onClick={() => onSelectProject(proj._id, proj.title)}
                      className={`dashboard__sidebar-recent-item ${proj.status === 'live' ? 'is-live' : ''}`}
                      title={`Open ${proj.title}`}
                    >
                      <span className={`recent-status-dot recent-status-dot--${proj.status}`} />
                      <span className="recent-project-title">{proj.title}</span>
                      <ChevronRight size={12} className="recent-project-arrow" />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User profile / Settings footer */}
        <div className="dashboard__sidebar-footer" ref={profileMenuRef}>
          {/* Profile flyout menu */}
          {profileMenuOpen && (
            <div className="sidebar-profile-flyout">
              {/* Header: avatar + name + email */}
              <div className="sidebar-profile-flyout__header">
                <div className={`dashboard__sidebar-avatar-ring dashboard__sidebar-avatar-ring--${subscription}`} style={{ width: 38, height: 38 }}>
                  {userPhoto
                    ? <img src={userPhoto} alt={userName} className="dashboard__sidebar-avatar" style={{ width: 32, height: 32 }} />
                    : <div className="dashboard__sidebar-initials" style={{ width: 32, height: 32, fontSize: 13 }}>{userInitials}</div>
                  }
                </div>
                <div className="sidebar-profile-flyout__user-info">
                  <span className="sidebar-profile-flyout__name">{userName}</span>
                  <span className="sidebar-profile-flyout__email">{user?.email || ''}</span>
                </div>
              </div>

              <div className="sidebar-profile-flyout__divider" />

              {/* Menu items */}
              <button className="sidebar-profile-flyout__item" onClick={handleNavigateSettings}>
                <User size={15} />
                <span>My Profile</span>
              </button>

              <button className="sidebar-profile-flyout__item" onClick={handleNavigateSettings}>
                <Settings size={15} />
                <span>Settings</span>
              </button>

              {/* Prominent Upgrade CTA Button */}
              <button
                className="sidebar-profile-flyout__item sidebar-profile-flyout__item--upgrade"
                onClick={handleUpgrade}
              >
                <Crown size={15} />
                <span>{subscription === 'max' ? 'Manage Plan' : subscription === 'pro' ? 'Upgrade to Max' : 'Upgrade to Pro'}</span>
                <span className="sidebar-profile-flyout__upgrade-badge">
                  <Zap size={10} />
                  <span>{subscription === 'max' ? 'MAX' : 'PRO'}</span>
                </span>
              </button>

              <button className="sidebar-profile-flyout__item" onClick={handleUpgrade}>
                <CreditCard size={15} />
                <span>Billing & Plans</span>
              </button>

              <button className="sidebar-profile-flyout__item" onClick={handleToggleTheme}>
                {isDarkTheme ? <Sun size={15} /> : <Moon size={15} />}
                <span>{isDarkTheme ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              <div className="sidebar-profile-flyout__divider" />

              <button className="sidebar-profile-flyout__item sidebar-profile-flyout__item--logout" onClick={handleLogout}>
                <LogOut size={15} />
                <span>Logout</span>
              </button>
            </div>
          )}

          {/* Clickable profile bar trigger */}
          <button
            className={`dashboard__sidebar-profile-bar dashboard__sidebar-profile-bar--clickable ${profileMenuOpen ? 'is-open' : ''}`}
            onClick={() => setProfileMenuOpen(v => !v)}
            title="Account menu"
          >
            <div className="dashboard__sidebar-profile-details">
              <div className={`dashboard__sidebar-avatar-ring dashboard__sidebar-avatar-ring--${subscription}`}>
                {userPhoto
                  ? <img src={userPhoto} alt={userName} className="dashboard__sidebar-avatar" />
                  : <div className="dashboard__sidebar-initials">{userInitials}</div>
                }
              </div>
              <div className="dashboard__sidebar-user-meta sidebar-label">
                <span className="dashboard__sidebar-username">{userName}</span>
                <span className={`dashboard__sidebar-tier-badge dashboard__sidebar-tier-badge--${subscription}`}>
                  {subscription === 'free' ? 'Free' : subscription === 'pro' ? 'Pro' : 'Max'}
                </span>
              </div>
            </div>
            <ChevronRight size={14} className={`sidebar-profile-chevron sidebar-label ${profileMenuOpen ? 'is-open' : ''}`} />
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
                          <button type="button" className="icon-btn dashboard__playground-action-btn" title="Voice Input">
                            <Mic size={14} />
                          </button>
                          <button type="button" className="icon-btn dashboard__playground-action-btn" title="Attach Design Spec">
                            <Paperclip size={14} />
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
        ) : activeTab === 'recents' ? (
          /* Dedicated Recents & Active Workspaces View */
          <section className="dashboard__projects-panel dashboard__recents-panel">
            {/* Header section with actions */}
            <div className="dashboard__projects-panel-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={20} color="var(--primary)" />
                  <h2 className="dashboard__projects-panel-title">Recents</h2>
                </div>
                <p className="dashboard__projects-panel-subtitle">
                  Fast access to your active sandbox environments and recently updated workspaces.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="icon-btn"
                  onClick={() => fetchProjects()}
                  title="Refresh active lists"
                  style={{ padding: '8px' }}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => { setPromptInput(''); setActiveTab('playground'); }}
                  className="dashboard__projects-panel-create-btn dashboard__projects-panel-create-btn--active"
                >
                  <Plus size={14} />
                  New App
                </button>
              </div>
            </div>

            {/* Search & Filter Toolbar for Recents */}
            <div className="dashboard__recents-toolbar">
              <div className="dashboard__recents-search-box">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search active or recent projects..."
                  value={recentsSearch}
                  onChange={(e) => setRecentsSearch(e.target.value)}
                  className="dashboard__recents-search-input"
                />
                {recentsSearch && (
                  <button className="search-clear-btn" onClick={() => setRecentsSearch('')}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="dashboard__recents-filter-pills">
                <button
                  className={`filter-pill ${recentsFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setRecentsFilter('all')}
                >
                  All ({projects.length})
                </button>
                <button
                  className={`filter-pill ${recentsFilter === 'live' ? 'active' : ''}`}
                  onClick={() => setRecentsFilter('live')}
                >
                  <span className="pill-dot live" />
                  Active ({activeProjects.length})
                </button>
                <button
                  className={`filter-pill ${recentsFilter === 'offline' ? 'active' : ''}`}
                  onClick={() => setRecentsFilter('offline')}
                >
                  Offline ({projects.length - activeProjects.length})
                </button>
              </div>
            </div>

            {/* Active Projects Spotlight (if live projects exist) */}
            {activeProjects.length > 0 && recentsFilter !== 'offline' && !recentsSearch && (
              <div className="dashboard__active-spotlight">
                <div className="dashboard__active-spotlight-header">
                  <div className="active-badge-pulse">
                    <span className="pulse-dot" />
                    <span className="badge-text">ACTIVE NOW ({activeProjects.length})</span>
                  </div>
                  <span className="spotlight-hint">Running container instances with instant codespace access</span>
                </div>

                <div className="dashboard__active-spotlight-grid">
                  {activeProjects.map((proj) => (
                    <div key={proj._id} className="active-spotlight-card">
                      <div className="active-spotlight-card__header">
                        <div className="active-spotlight-card__title-box">
                          <div className="status-indicator-ring">
                            <span className="indicator-core" />
                          </div>
                          <div>
                            <h4 className="card-title">{proj.title}</h4>
                            <span className="card-sub">ID: {proj.sandboxId?.substring(0, 10)}…</span>
                          </div>
                        </div>
                        <StatusBadge status={proj.status} />
                      </div>

                      <div className="active-spotlight-card__actions">
                        <button
                          className="btn-open-active"
                          onClick={() => onSelectProject(proj._id, proj.title)}
                        >
                          <Play size={13} fill="currentColor" />
                          Open Workspace
                        </button>
                        <button
                          className="btn-stop-active"
                          onClick={() => handleStop(proj._id)}
                          title="Stop sandbox container"
                        >
                          <Square size={13} />
                          Stop
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* List and Grid display */}
            {loading ? (
              <div className="dashboard__projects-panel-loader-box">
                <Loader2 size={32} className="animate-spin text-slate-400" />
                <p className="dashboard__projects-panel-loader-text">Loading environments…</p>
              </div>
            ) : filteredRecentProjects.length === 0 ? (
              <div className="dashboard__projects-panel-empty-box">
                <Clock size={28} color="var(--primary)" style={{ marginBottom: '16px' }} />
                <h3 className="dashboard__projects-panel-empty-title">
                  {recentsSearch ? 'No matching projects found' : 'No Recent Projects'}
                </h3>
                <p className="dashboard__projects-panel-empty-desc">
                  {recentsSearch ? 'Try clearing your search query or changing filters.' : 'Use the Playground tab to build an app and see active projects here.'}
                </p>
              </div>
            ) : (
              <div className="dashboard__projects-panel-grid">
                {filteredRecentProjects.map((project, i) => (
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

