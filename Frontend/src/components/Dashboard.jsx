import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listProjectsAPI, createProjectAPI } from '../features/sandbox/service/sandbox.api';
import { stopSandboxAPI, deleteProjectAPI } from '../features/sandbox/service/sandbox.api';
import { getCachedProjects, setCachedProjects, upsertCachedProject } from '../features/editor/service/dbService';
import { fetchCreditThunk } from '../features/settings/slice/settings.slice';
import {
  Cpu, Plus, Loader2, Folder, AlertTriangle, LogOut,
  Code, Play, RefreshCw, X, Square, Trash2, MoreVertical,
  Zap, Clock, CheckCircle, XCircle, Activity, Settings, Search,
  Sparkles, BookOpen, Layers, Terminal, History, Keyboard, HelpCircle,
  ChevronLeft, ChevronRight, Mic, Paperclip
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


// ─── Dashboard Stars Background (Cosmic Space Engine) ─────────────────────────
// ─── Dashboard Stars Background (Realistic Night Sky Engine) ───────────────────
function DashboardStars() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const isLightMode = document.documentElement.classList.contains('light-theme');

    // Color palette of realistic night sky stars
    const STAR_TINTS_DARK = [
      'rgba(255, 255, 255,',
      'rgba(248, 250, 252,',
      'rgba(241, 245, 249,',
      'rgba(226, 232, 240,',
      'rgba(224, 242, 254,'
    ];

    // Light mode cosmic starlight pinpoints (sapphire, emerald, violet, deep slate)
    const STAR_TINTS_LIGHT = [
      'rgba(9, 105, 218,',     // Electric Sapphire
      'rgba(5, 150, 105,',     // Emerald Starlight
      'rgba(124, 58, 237,',    // Deep Nebula Violet
      'rgba(15, 23, 42,',      // Cosmic Slate
      'rgba(37, 99, 235,'      // Azure Starlight
    ];

    const STAR_TINTS = isLightMode ? STAR_TINTS_LIGHT : STAR_TINTS_DARK;

    // Perfectly balanced night sky star field (165 micro & accent stars)
    const starCount = 165;
    const stars = Array.from({ length: starCount }, () => {
      const isMicro = Math.random() > 0.20;
      const size = isMicro ? Math.random() * 0.6 + 0.3 : Math.random() * 0.6 + 0.9;
      
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        size,
        baseAlpha: isMicro ? Math.random() * 0.35 + 0.18 : Math.random() * 0.35 + 0.35,
        colorPrefix: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)],
        twinkleSpeed: Math.random() * 0.025 + 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
        vx: (Math.random() * 0.15 + 0.05) * (Math.random() > 0.5 ? 1 : -1),
        vy: (Math.random() * 0.12 + 0.04) * (Math.random() > 0.5 ? 1 : -1),
        depth: size / 1.5
      };
    });

    // Falling Stars (Meteors) System - Rare & Subtle
    const meteors = [];
    const createMeteor = () => {
      const startX = Math.random() * (w * 1.2) - w * 0.1;
      const startY = Math.random() * (h * 0.4) - h * 0.2;
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2;
      const speed = Math.random() * 8 + 10;
      const length = Math.random() * 80 + 50;

      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length,
        size: Math.random() * 0.6 + 0.8,
        life: 0,
        maxLife: Math.random() * 30 + 25
      });
    };

    let meteorTimer = 0;
    let mouseX = w / 2;
    let mouseY = h / 2;
    let targetMouseX = w / 2;
    let targetMouseY = h / 2;

    const handleMouseMove = (e) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationId;

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      const currentlyLight = document.documentElement.classList.contains('light-theme');

      // Smooth mouse interpolation for subtle parallax depth
      mouseX += (targetMouseX - mouseX) * 0.03;
      mouseY += (targetMouseY - mouseY) * 0.03;

      const parallaxX = mouseX - w / 2;
      const parallaxY = mouseY - h / 2;

      // ── 1. Render & Update Micro Sky Stars ──────────────────────────
      stars.forEach((star) => {
        star.x += star.vx;
        star.y += star.vy;

        if (star.x < 0) star.x = w;
        if (star.x > w) star.x = 0;
        if (star.y < 0) star.y = h;
        if (star.y > h) star.y = 0;

        const renderX = (star.x + parallaxX * 0.015 * star.depth + w) % w;
        const renderY = (star.y + parallaxY * 0.015 * star.depth + h) % h;

        star.twinklePhase += star.twinkleSpeed;
        const currentAlpha = Math.min(0.75, Math.max(0.12, star.baseAlpha + Math.sin(star.twinklePhase) * 0.28));

        ctx.fillStyle = `${star.colorPrefix}${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(renderX, renderY, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── 2. Render & Update Falling Stars (Meteors) ─────────────────
      meteorTimer++;
      if (meteorTimer > 280 && Math.random() < 0.02) {
        createMeteor();
        meteorTimer = 0;
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life++;

        const progress = m.life / m.maxLife;
        const alpha = Math.sin(progress * Math.PI) * 0.75;

        const headX = m.x;
        const headY = m.y;
        const tailX = m.x - (m.vx / Math.hypot(m.vx, m.vy)) * m.length;
        const tailY = m.y - (m.vy / Math.hypot(m.vx, m.vy)) * m.length;

        const meteorGrad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        if (currentlyLight) {
          meteorGrad.addColorStop(0, 'rgba(9, 105, 218, 0)');
          meteorGrad.addColorStop(0.7, 'rgba(5, 150, 105, 0.35)');
          meteorGrad.addColorStop(1, 'rgba(124, 58, 237, 0.85)');
        } else {
          meteorGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          meteorGrad.addColorStop(0.7, 'rgba(224, 242, 254, 0.25)');
          meteorGrad.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
        }

        ctx.strokeStyle = meteorGrad;
        ctx.lineWidth = m.size;
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ctx.fillStyle = currentlyLight ? '#0969DA' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(headX, headY, m.size * 1.1, 0, Math.PI * 2);
        ctx.fill();

        if (m.life >= m.maxLife) {
          meteors.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1.0;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 3,
        opacity: 0.95,
        willChange: 'transform',
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden'
      }}
    />
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
  const subscription = useSelector((state) => state.settings?.credit?.subscription || 'free');
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

  useEffect(() => { 
    fetchProjects();
    // Fetch subscription/credit data so the sidebar tier ring shows correctly
    dispatch(fetchCreditThunk());
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

        {/* Cosmic star field — dynamic, hardware-accelerated star canvas background */}
        <DashboardStars />
      </div>

      {/* 1. Left Navigation Sidebar */}
      <aside 
        className={`dashboard__sidebar ${isSidebarCollapsed ? 'dashboard__sidebar--collapsed' : ''} ${isResizingSidebar ? 'is-resizing' : ''}`}
        style={{ width: isSidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
      >
        {/* Border-floating collapse/expand toggle button */}
        <button 
          onClick={toggleSidebarCollapse} 
          className="sidebar-toggle-btn"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <ChevronLeft size={10} className="sidebar-toggle-icon" />
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
        <div className="dashboard__sidebar-footer">
          <div className="dashboard__sidebar-profile-bar">
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
          </div>

          <button 
            onClick={onNavigateSettings} 
            className={`dashboard__sidebar-item ${activeTab === 'settings' ? 'dashboard__sidebar-item--active' : ''}`}
            title={isSidebarCollapsed ? "Settings" : undefined}
            style={{ 
              width: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: '8px',
              padding: isSidebarCollapsed ? '9px 12px' : '9px 12px',
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid transparent',
              fontSize: '13.5px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
          >
            <Settings size={16} style={{ flexShrink: 0 }} />
            <span className="sidebar-label">Settings</span>
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

