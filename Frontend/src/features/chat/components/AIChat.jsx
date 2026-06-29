import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../Hooks/chat.hooks';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import { 
  Send, Sparkles, ChevronDown, ChevronRight, Check, Copy, Trash2, Cpu, 
  FileText, Code, Terminal, CheckCircle2, AlertCircle, Loader2, Play, 
  X, ListTodo, Activity, RefreshCw, Layers, FileCode, ArrowRight, Zap
} from 'lucide-react';
import './AIChat.scss';
import { TakshaIcon } from '../../../components/BrandLogo';

// ─── Tool type icon colors ────────────────────────────────────────────────────
const TOOL_TYPE_COLORS = {
  read:   '#60a5fa',
  write:  '#a78bfa',
  cmd:    '#34d399',
  verify: '#f59e0b',
  info:   'var(--text-muted)',
};

export default function AIChat({ projectId }) {
  const { sandboxId, status } = useSandbox();
  const { messages, isStreaming, sendMessage, sendAppAgentMessage, clearChatHistory } = useChat();
  const { fetchFilesList, activeFile, isModified, fetchFileContent } = useEditor();

  const [input, setInput] = useState('');
  const [expandedRuns, setExpandedRuns] = useState({});
  const [inputFocused, setInputFocused] = useState(false);

  // Agent selector state
  const [activeAgent, setActiveAgent] = useState('clio'); // Default to Clio Assistant
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);

  // Load initial prompt from session storage if populated by the dashboard
  useEffect(() => {
    if (projectId) {
      const initPrompt = sessionStorage.getItem(`initialPrompt_${projectId}`);
      if (initPrompt) {
        setInput(initPrompt);
        sessionStorage.removeItem(`initialPrompt_${projectId}`);
      }
    }
  }, [projectId]);

  const [expandedLogs, setExpandedLogs] = useState({});
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null);
  const [selectedModel, setSelectedModel] = useState('Gemini 3.5 Flash');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  
  const scrollContainerRef = useRef(null);
  const lastScrollHeightRef = useRef(0);
  const prevSandboxIdRef = useRef(sandboxId);

  // Auto-clear history when the sandbox session changes
  useEffect(() => {
    const prev = prevSandboxIdRef.current;
    if (prev && sandboxId && prev !== sandboxId) {
      clearChatHistory();
      setExpandedRuns({});
      setExpandedLogs({});
      lastScrollHeightRef.current = 0;
    }
    prevSandboxIdRef.current = sandboxId;
  }, [sandboxId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const prevHeight = lastScrollHeightRef.current;
    const isShrunk = container.scrollHeight < prevHeight;
    const wasAtBottom = !prevHeight || isShrunk || (prevHeight - container.scrollTop - container.clientHeight <= 100);
    if (wasAtBottom) container.scrollTop = container.scrollHeight;
    lastScrollHeightRef.current = container.scrollHeight;
  }, [messages, isStreaming]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handler = (e) => setIsModelDropdownOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isModelDropdownOpen]);

  // Close agent dropdown on outside click
  useEffect(() => {
    if (!isAgentDropdownOpen) return;
    const handler = () => setIsAgentDropdownOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isAgentDropdownOpen]);

  // ─── Task run grouper ───────────────────────────────────────────────────────
  const getTaskRuns = () => {
    const runs = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        const assistantMsg = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null;
        runs.push({ id: msg.id, goal: msg.text, timestamp: msg.timestamp, assistant: assistantMsg });
        if (assistantMsg) i++;
      } else {
        runs.push({ id: msg.id, goal: null, timestamp: msg.timestamp, assistant: msg });
      }
    }
    return runs;
  };

  const runs = getTaskRuns();

  // Expand latest run by default
  useEffect(() => {
    if (runs.length > 0) {
      const lastRun = runs[runs.length - 1];
      setExpandedRuns(prev => {
        if (prev[lastRun.id] === undefined) return { ...prev, [lastRun.id]: true };
        return prev;
      });
    }
  }, [runs.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    if (activeAgent === 'pipeline' && status !== 'running') {
      alert("Coding Agent requires a live sandbox. Please start the sandbox first.");
      return;
    }

    const query = input;
    setInput('');
    lastScrollHeightRef.current = 0;

    if (activeAgent === 'clio') {
      sendAppAgentMessage(query, activeFile, () => {
        if (sandboxId) {
          fetchFilesList(sandboxId);
          if (activeFile && !isModified) fetchFileContent(sandboxId, activeFile, true);
        }
      });
    } else {
      sendMessage(query, () => {
        if (sandboxId) {
          fetchFilesList(sandboxId);
          if (activeFile && !isModified) fetchFileContent(sandboxId, activeFile, true);
        }
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const toggleRun = (runId) => setExpandedRuns(prev => ({ ...prev, [runId]: !prev[runId] }));
  const toggleLogs = (runId) => setExpandedLogs(prev => ({ ...prev, [runId]: !prev[runId] }));

  const handleClearHistory = () => {
    clearChatHistory();
    setExpandedRuns({});
    setExpandedLogs({});
    lastScrollHeightRef.current = 0;
  };

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  // ─── File extraction from agent logs ───────────────────────────────────────
  const getModifiedFiles = (logs) => {
    if (!logs) return [];
    const filesMap = new Map();
    logs.forEach(log => {
      const isCreate = log.startsWith('createFile:');
      const isUpdate = log.startsWith('updateFile:') || log.startsWith('patchFile:');
      const cleanLog = log.replace(/\\"/g, '"');
      if (isCreate) {
        try {
          const match = cleanLog.match(/"file"\s*:\s*"([^"]+)"/g);
          if (match) match.forEach(m => { const f = m.match(/"file"\s*:\s*"([^"]+)"/)?.[1]; if (f && !f.includes('todo.md')) filesMap.set(f, 'create'); });
        } catch { const m = cleanLog.match(/"file"\s*:\s*"([^"]+)"/); if (m?.[1] && !m[1].includes('todo.md')) filesMap.set(m[1], 'create'); }
      } else if (isUpdate) {
        try {
          const match = cleanLog.match(/"file"\s*:\s*"([^"]+)"/g) || cleanLog.match(/filePath:\s*"([^"]+)"/g) || cleanLog.match(/file:\s*"([^"]+)"/g);
          if (match) match.forEach(m => { const fm = m.match(/"file"\s*:\s*"([^"]+)"/) || m.match(/filePath:\s*"([^"]+)"/) || m.match(/file:\s*"([^"]+)"/); if (fm?.[1] && !fm[1].includes('todo.md')) filesMap.set(fm[1], 'update'); });
        } catch { const m = cleanLog.match(/"file"\s*:\s*"([^"]+)"/) || cleanLog.match(/filePath:\s*"([^"]+)"/) || cleanLog.match(/file:\s*"([^"]+)"/); if (m?.[1] && !m[1].includes('todo.md')) filesMap.set(m[1], 'update'); }
      }
    });
    return Array.from(filesMap.entries()).map(([path, type]) => ({ path, type }));
  };

  // ─── Phase resolver ─────────────────────────────────────────────────────────
  const getWorkflowPhases = (assistantMsg) => {
    if (!assistantMsg) return [];
    const logs = assistantMsg.toolLogs || [];
    const isRunning = assistantMsg.status === 'running';
    const isCompleted = assistantMsg.status === 'completed';
    const isError = assistantMsg.status === 'error';
    const hasCalled = (p, s = null) => logs.some(log => log.toLowerCase().startsWith(p.toLowerCase()) && (!s || log.toLowerCase().includes(s.toLowerCase())));

    const phases = [
      { id: 'explore', name: 'Explore Workspace', description: 'Analyzing directory structure and configs.', status: 'pending' },
      { id: 'plan',    name: 'Draft Plan',         description: 'Writing implementation steps to todo.md.', status: 'pending' },
      { id: 'install', name: 'Install Packages',   description: 'Adding npm packages if required.',         status: 'pending', optional: true },
      { id: 'build',   name: 'Implement Code',     description: 'Creating and updating codebase files.',   status: 'pending' },
      { id: 'verify',  name: 'Verify Compiler',    description: 'Checking Vite output for errors.',         status: 'pending' },
      { id: 'cleanup', name: 'Finalize Report',    description: 'Completing the run and cleaning up.',      status: 'pending' },
    ];

    if (hasCalled('listFiles') || hasCalled('readFile', 'package.json')) {
      const next = hasCalled('createFile') || hasCalled('updateFile') || hasCalled('patchFile');
      phases[0].status = next ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (isRunning && logs.length === 0) phases[0].status = 'running';
    else if (logs.length > 0) phases[0].status = 'completed';

    const hasTodo = hasCalled('createFile', 'todo.md') || hasCalled('updateFile', 'todo.md') || hasCalled('patchFile', 'todo.md');
    if (hasTodo) {
      const buildStarted = logs.some(l => (l.startsWith('createFile') || l.startsWith('updateFile') || l.startsWith('patchFile')) && !l.includes('todo.md'));
      phases[1].status = buildStarted ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (phases[0].status === 'completed' && isRunning) phases[1].status = 'running';
    else if (isCompleted) phases[1].status = 'completed';

    const hasInstall = hasCalled('executeCommand', 'npm install');
    if (hasInstall) {
      const done = logs.some(l => l.includes('executeCommand: success') && l.includes('npm install'));
      phases[2].status = done ? 'completed' : (isRunning ? 'running' : 'completed');
    } else {
      const buildStarted = logs.some(l => (l.startsWith('createFile') || l.startsWith('updateFile') || l.startsWith('patchFile')) && !l.includes('todo.md'));
      if (buildStarted || hasCalled('getViteRuntimeErrors') || isCompleted) phases[2].status = 'completed';
    }

    const buildLogs = logs.filter(l => (l.startsWith('createFile') || l.startsWith('updateFile') || l.startsWith('patchFile')) && !l.includes('todo.md'));
    if (buildLogs.length > 0) {
      phases[3].status = hasCalled('getViteRuntimeErrors') ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (phases[1].status === 'completed' && isRunning) phases[3].status = 'running';
    else if (isCompleted) phases[3].status = 'completed';

    if (hasCalled('getViteRuntimeErrors')) {
      const cleanupStarted = isCompleted || logs.some(l => l.startsWith('executeCommand') && l.includes('rm todo.md'));
      phases[4].status = cleanupStarted ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (phases[3].status === 'completed' && isRunning) phases[4].status = 'running';
    else if (isCompleted) phases[4].status = 'completed';

    if (isCompleted) phases[5].status = 'completed';
    else if (phases[4].status === 'completed' && isRunning) phases[5].status = 'running';

    if (isError) phases.forEach(p => { if (p.status === 'running') p.status = 'error'; });
    return phases;
  };

  // ─── Log event parser ───────────────────────────────────────────────────────
  const parseToolLogToEvent = (log) => {
    const isStart   = log.includes(': start') || log.includes('attempt 1');
    const isSuccess = log.includes(': success') || log.includes('success -') || log.includes('patched successfully') || log.includes('success (on retry)');
    const isError   = log.includes(': error') || log.includes('failed');
    const cleanLog  = log.replace(/\\"/g, '"');
    let title = '', description = '', type = 'info';

    if (log.startsWith('listFiles')) {
      title = 'Scan Directory'; type = 'read';
      description = isStart ? 'Listing workspace structure.' : isSuccess ? 'Mapped workspace.' : 'Failed scan.';
    } else if (log.startsWith('readFile')) {
      const fm = cleanLog.match(/files:\s*\[\s*"([^"]+)"\s*\]/) || cleanLog.match(/files:\s*([^,\s]+)/);
      title = 'Read File'; type = 'read';
      description = isStart ? `Reading: ${fm?.[1] || 'file'}` : isSuccess ? `Read ${fm?.[1] || 'file'}` : 'Failed read.';
    } else if (log.startsWith('createFile')) {
      const fm = cleanLog.match(/"file"\s*:\s*"([^"]+)"/);
      title = 'Create File'; type = 'write';
      description = isStart ? `Creating: ${fm?.[1] || 'file'}` : isSuccess ? `Created ${fm?.[1] || 'file'}` : 'Create failed.';
    } else if (log.startsWith('updateFile')) {
      const fm = cleanLog.match(/"file"\s*:\s*"([^"]+)"/);
      title = 'Update File'; type = 'write';
      description = isStart ? `Rewriting: ${fm?.[1] || 'file'}` : isSuccess ? `Updated ${fm?.[1] || 'file'}` : 'Update failed.';
    } else if (log.startsWith('patchFile')) {
      const fm = cleanLog.match(/file(?:Path)?":?\s*"([^"]+)"/i);
      title = 'Patch File'; type = 'write';
      description = isStart ? `Patching: ${fm?.[1] || 'file'}` : isSuccess ? `Patched ${fm?.[1] || 'file'}` : 'Patch failed.';
    } else if (log.startsWith('executeCommand')) {
      const cm = cleanLog.match(/command:\s*"([^"]+)"/);
      title = 'Run Command'; type = 'cmd';
      description = isStart ? `$ ${cm?.[1] || 'cmd'}` : isSuccess ? 'Command complete.' : 'Command failed.';
    } else if (log.startsWith('getViteRuntimeErrors')) {
      title = 'Audit Compiler'; type = 'verify';
      description = isStart ? 'Checking Vite output…' : isSuccess ? 'No errors found.' : 'Compiler checked.';
    } else {
      const parts = log.split(':'); title = parts[0] || 'Agent Action'; description = parts.slice(1).join(':').trim();
    }

    let status = 'info';
    if (isSuccess) status = 'success';
    else if (isError) status = 'error';
    else if (isStart) status = 'running';

    return { title, description, type, status, timestamp: new Date().toLocaleTimeString() };
  };

  // ─── Inline markdown formatter ──────────────────────────────────────────────
  const formatInline = (line) => {
    if (!line) return '';
    const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i} style={{ color: '#fff', fontWeight: '700' }}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={i} className="ai-chat__inline-code">{part.slice(1, -1)}</code>;
      return part;
    });
  };

  const renderMarkdown = (text) => {
    if (!text) return null;
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const lang = lines[0].replace('```', '').trim();
        const code = lines.slice(1, -1).join('\n');
        return (
          <div key={index} className="ai-chat__code-block">
            <div className="ai-chat__code-block-header">
              <span className="ai-chat__code-block-lang">{lang || 'code'}</span>
              <button className={`ai-chat__code-block-copy ${copiedCodeIdx === index ? 'ai-chat__code-block-copy--copied' : ''}`} onClick={() => copyToClipboard(code, index)}>
                {copiedCodeIdx === index ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>
            <pre><code>{code}</code></pre>
          </div>
        );
      }
      const lines = part.split('\n');
      return lines.map((line, lIdx) => {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* '))
          return <li key={lIdx} style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px', marginLeft: '16px', lineHeight: '1.6' }}>{formatInline(line.trim().substring(2))}</li>;
        if (line.startsWith('# '))  return <h1 key={lIdx} style={{ fontSize: '18px', fontWeight: '700', margin: '16px 0 8px', color: '#fff' }}>{line.substring(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={lIdx} style={{ fontSize: '15px', fontWeight: '600', margin: '14px 0 6px', color: '#fff' }}>{line.substring(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={lIdx} style={{ fontSize: '13px', fontWeight: '600', margin: '12px 0 4px', color: '#fff' }}>{line.substring(4)}</h3>;
        return <p key={lIdx} style={{ fontSize: '13px', color: 'var(--text-main)', margin: '0 0 8px', lineHeight: '1.6', minHeight: line.trim() ? 'auto' : '8px' }}>{formatInline(line)}</p>;
      });
    });
  };

  // ─── Run status color ───────────────────────────────────────────────────────
  const getStatusDotClass = (assistant) => {
    if (!assistant) return 'ai-chat__run-card__status-dot--default';
    if (assistant.status === 'running')   return 'ai-chat__run-card__status-dot--running';
    if (assistant.status === 'completed') return 'ai-chat__run-card__status-dot--completed';
    if (assistant.status === 'error')     return 'ai-chat__run-card__status-dot--error';
    return 'ai-chat__run-card__status-dot--default';
  };

  // ─── Phase icon renderer ────────────────────────────────────────────────────
  const PhaseIcon = ({ status }) => {
    if (status === 'completed') return <CheckCircle2 size={13} color="#10b981" />;
    if (status === 'running')   return <Loader2 size={13} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />;
    if (status === 'error')     return <AlertCircle size={13} color="#f43f5e" />;
    return <div className="ai-chat__phases-pending-dot" />;
  };

  // ─── Models list ────────────────────────────────────────────────────────────
  const MODELS = [
    { id: 'gemini',   label: 'Gemini 3.5 Flash (High)',  tag: 'Fast',    color: '#60a5fa' },
    { id: 'mistral',  label: 'Mistral Devstral',          tag: 'Default', color: '#34d399' },
    { id: 'claude',   label: 'Claude 3.5 Sonnet',         tag: 'Smart',   color: '#a78bfa' },
  ];

  const charCount = input.length;
  const charClass = charCount > 900 ? 'ai-chat__char-count--danger' : charCount > 600 ? 'ai-chat__char-count--warning' : 'ai-chat__char-count--normal';

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ai-chat">
      {/* Ambient background blobs */}
      <div className="ai-chat__ambient">
        <div className="ai-chat__ambient-blob ai-chat__ambient-blob--plasma" />
        <div className="ai-chat__ambient-blob ai-chat__ambient-blob--teal" />
      </div>

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="ai-chat__header">
        <div className="ai-chat__header-left">
          {/* Agent selector */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              className="ai-chat__model-btn"
              onClick={() => setIsAgentDropdownOpen(v => !v)}
              style={{
                fontSize: '12.5px',
                fontWeight: '700',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <TakshaIcon size={16} />
              </div>
              <span>{activeAgent === 'clio' ? 'Clio (Assistant)' : 'Orion (Coding Agent)'}</span>
              <ChevronDown size={10} color="var(--text-dark)" />
            </button>

            {isAgentDropdownOpen && (
              <div
                className="ai-chat__model-dropdown"
                style={{
                  top: '28px',
                  left: 0,
                  width: '190px',
                  zIndex: 200,
                  backgroundColor: '#161922',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  padding: '4px',
                }}
              >
                <div
                className={`ai-chat__model-dropdown-item ${activeAgent === 'clio' ? 'ai-chat__model-dropdown-item--active' : ''}`}
                onClick={() => { setActiveAgent('clio'); setIsAgentDropdownOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer' }}
              >
                <Sparkles size={11} color="#60a5fa" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, textAlign: 'left' }}>
                  <span style={{ fontWeight: 600, fontSize: '11px', color: '#fff' }}>Clio (Assistant)</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-dark)' }}>Copilot helper for files & info</span>
                  </div>
                </div>
                <div
                  className={`ai-chat__model-dropdown-item ${activeAgent === 'pipeline' ? 'ai-chat__model-dropdown-item--active' : ''}`}
                  onClick={() => { setActiveAgent('pipeline'); setIsAgentDropdownOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  <Cpu size={11} color="#34d399" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, fontSize: '11px', color: '#fff' }}>Orion (Coding Agent)</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-dark)' }}>5-agent code-gen pipeline</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Model selector - show only for Code-Gen Pipeline */}
          {activeAgent === 'pipeline' && (
            <div style={{ position: 'relative', marginLeft: '6px' }} onClick={e => e.stopPropagation()}>
              <button className="ai-chat__model-btn" onClick={() => setIsModelDropdownOpen(v => !v)}>
                <span>{selectedModel}</span>
                <ChevronDown size={9} />
              </button>

              {isModelDropdownOpen && (
                <div className="ai-chat__model-dropdown">
                  {MODELS.map(m => (
                    <div
                      key={m.id}
                      className={`ai-chat__model-dropdown-item ${selectedModel === m.label ? 'ai-chat__model-dropdown-item--active' : ''}`}
                      onClick={() => { setSelectedModel(m.label); setIsModelDropdownOpen(false); }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{m.label}</span>
                      <span style={{ fontSize: '8px', color: m.color, background: `${m.color}18`, padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>{m.tag}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ai-chat__header-right">
          {/* Agent state badge */}
          {isStreaming ? (
            <div className="ai-chat__status ai-chat__status--busy">
              <div className="ai-chat__status-spinner" />
              BUSY
            </div>
          ) : (
            <div className="ai-chat__status ai-chat__status--ready">
              <div className="ai-chat__status-dot ai-chat__status-dot--ready" />
              READY
            </div>
          )}

          {/* Clear history button */}
          <button className="ai-chat__clear-btn" onClick={handleClearHistory} title="Clear chat history">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ─── Messages Scroll Area ────────────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="ai-chat__scroll">

        {runs.length === 0 ? (
          /* Welcome Panel */
          <div className="ai-chat__welcome">
            <div className="ai-chat__welcome-hero">
              <div className="ai-chat__welcome-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TakshaIcon size={36} />
                <div>
                  <h2 className="ai-chat__welcome-title">Taksha Agent</h2>
                  <span className="ai-chat__welcome-version">v1.0.0-orch</span>
                </div>
              </div>
              <p className="ai-chat__welcome-desc">
                An autonomous development agent on the Capstone orchestrator. Instruct it to inspect components, write code, run shell tasks, or debug compilation failures.
              </p>
            </div>

            {/* Capabilities */}
            <div className="ai-chat__welcome-caps">
              <span className="ai-chat__welcome-caps-label">Capabilities</span>
              {[
                { label: 'Read & write project files', color: '#60a5fa' },
                { label: 'Execute shell commands & scripts', color: '#34d399' },
                { label: 'Inspect Vite compiler output', color: '#f59e0b' },
                { label: 'Generate and patch code autonomously', color: '#a78bfa' },
              ].map((cap, i) => (
                <div key={i} className="ai-chat__welcome-cap">
                  <div className="ai-chat__welcome-cap-dot" style={{ background: cap.color }} />
                  {cap.label}
                </div>
              ))}
            </div>

            {/* Quick-start tasks */}
            <span className="ai-chat__welcome-tasks-label">Quick Start</span>
            <div className="ai-chat__welcome-tasks">
              {[
                { 
                  variant: 'bug', category: 'BUG FIX', categoryColor: '#f43f5e', bg: 'rgba(244,63,94,0.06)', border: 'rgba(244,63,94,0.2)',
                  title: 'Fix Terminal Input Lag',
                  prompt: 'Fix the styling and typing breakdown bug in the TerminalShell component where keyboard input gets interrupted and the cursor moves away.',
                },
                { 
                  variant: 'feature', category: 'FEATURE', categoryColor: '#a78bfa', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)',
                  title: 'Cache Editor Files Locally',
                  prompt: 'Implement file caching in local storage when visiting the code editor, refetch data on editor navigation, update cache on file changes.',
                },
                { 
                  variant: 'docs', category: 'DOCS', categoryColor: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',
                  title: 'Document Agent Flow & Tools',
                  prompt: 'Add details about the recent architectural changes and agent tool configurations to flow.md.',
                },
              ].map((task, idx) => (
                <div
                  key={idx}
                  className={`ai-chat__task-card ai-chat__task-card--${task.variant}`}
                  style={{ animationDelay: `${idx * 60}ms` }}
                  onClick={() => setInput(task.prompt)}
                >
                  <div className="ai-chat__task-card-top">
                    <span className="ai-chat__task-card-category" style={{ color: task.categoryColor, background: task.bg, borderColor: task.border }}>
                      {task.category}
                    </span>
                    <ArrowRight size={10} color="var(--text-dark)" />
                  </div>
                  <div className="ai-chat__task-card-title">{task.title}</div>
                  <div className="ai-chat__task-card-preview">{task.prompt}</div>
                </div>
              ))}
            </div>
          </div>

        ) : (
          /* Task Run Cards */
          runs.map((run) => {
            const isWelcome = run.goal === null;
            const isExpanded = expandedRuns[run.id];
            const assistant = run.assistant;
            const phases = assistant ? getWorkflowPhases(assistant) : [];
            const modifiedFiles = assistant ? getModifiedFiles(assistant.toolLogs) : [];
            const parsedEvents = assistant ? assistant.toolLogs.map((log, i) => parseToolLogToEvent(log, i)) : [];

            return (
              <div
                key={run.id}
                className={`ai-chat__run-card ${isExpanded ? 'ai-chat__run-card--expanded' : ''}`}
              >
                {/* Card Header */}
                <div
                  className={`ai-chat__run-card__header ${isExpanded ? 'ai-chat__run-card__header--expanded' : ''}`}
                  onClick={() => toggleRun(run.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <div className={`ai-chat__run-card__status-dot ${getStatusDotClass(assistant)}`} />
                    <span className="ai-chat__run-card__title">
                      {isWelcome ? 'System Workspace Initialized' : `Task: ${run.goal}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                    <span className="ai-chat__run-card__time">
                      {run.timestamp ? new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    {isExpanded ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <div className="ai-chat__run-card__body">

                    {/* 1. Objective block */}
                    {!isWelcome && (
                      <div className="ai-chat__objective">
                        <span className="ai-chat__objective-label">Objective</span>
                        <p className="ai-chat__objective-text">{run.goal}</p>
                      </div>
                    )}

                    {/* 2. Phases stepper */}
                    {assistant && !isWelcome && (
                      <div className="ai-chat__phases">
                        <span className="ai-chat__phases-label">Execution Phases</span>
                        <div className="ai-chat__phases-grid">
                          {phases.map(phase => (
                            <div key={phase.id} className="ai-chat__phases-row">
                              <div className="ai-chat__phases-icon">
                                <PhaseIcon status={phase.status} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="ai-chat__phases-name" style={{
                                  color: phase.status === 'running' ? '#a78bfa' : phase.status === 'completed' ? 'var(--text-main)' : 'var(--text-dark)'
                                }}>
                                  {phase.name}
                                  {phase.optional && <span style={{ marginLeft: 4, fontSize: '9px', color: 'var(--text-dark)' }}>(optional)</span>}
                                </div>
                                {phase.status === 'running' && (
                                  <div className="ai-chat__phases-desc">{phase.description}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Working files */}
                    {modifiedFiles.length > 0 && (
                      <div>
                        <span className="ai-chat__files-label">Working Files</span>
                        <div className="ai-chat__files-list">
                          {modifiedFiles.map((file, fIdx) => (
                            <div key={fIdx} className="ai-chat__files-row">
                              <div className="ai-chat__files-name">
                                <div className="ai-chat__files-check-wrap" style={{ background: file.type === 'create' ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.1)' }}>
                                  {file.type === 'create'
                                    ? <Check size={8} color="#10b981" strokeWidth={3} />
                                    : <FileCode size={8} color="#a78bfa" />}
                                </div>
                                <span>{file.path}</span>
                              </div>
                              <span className="ai-chat__files-badge" style={{ color: file.type === 'create' ? '#10b981' : '#a78bfa' }}>
                                {file.type === 'create' ? 'NEW' : 'MOD'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Detailed tool log (collapsible) */}
                    {assistant && parsedEvents.length > 0 && (
                      <div>
                        <div className="ai-chat__log-toggle" onClick={() => toggleLogs(run.id)}>
                          {expandedLogs[run.id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          <Activity size={11} />
                          <span>Tool Invocations ({parsedEvents.length})</span>
                        </div>

                        {expandedLogs[run.id] && (
                          <div className="ai-chat__log-list">
                            {parsedEvents.map((ev, evIdx) => (
                              <div key={evIdx} className="ai-chat__log-event">
                                <div className={`ai-chat__log-event-dot ai-chat__log-event-dot--${ev.status === 'success' ? 'success' : ev.status === 'running' ? 'running' : ev.status === 'error' ? 'error' : 'info'}`} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="ai-chat__log-event-name" style={{ color: TOOL_TYPE_COLORS[ev.type] || 'var(--text-main)' }}>
                                      {ev.title}
                                    </span>
                                    <span className="ai-chat__log-event-time">{ev.timestamp}</span>
                                  </div>
                                  <div className="ai-chat__log-event-desc">{ev.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Agent Report */}
                    {assistant && (
                      <div className="ai-chat__report">
                        <span className="ai-chat__report-header">Agent Report</span>

                        {assistant.text ? (
                          renderMarkdown(assistant.text)
                        ) : (
                          assistant.status === 'running' && !assistant.error && (
                            <div className="ai-chat__report-thinking">
                              <div className="ai-chat__report-thinking-dots">
                                <div className="ai-chat__report-thinking-dot" />
                                <div className="ai-chat__report-thinking-dot" />
                                <div className="ai-chat__report-thinking-dot" />
                              </div>
                              <span>Thinking & applying modifications…</span>
                            </div>
                          )
                        )}

                        {assistant.error && (
                          <div className="ai-chat__error-block">Error: {assistant.error}</div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Streaming waiting indicator */}
        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
          <div className="ai-chat__streaming">
            <div className="ai-chat__streaming-icon" />
            <span>Establishing orchestrator RPC stream…</span>
          </div>
        )}
      </div>

      {/* ─── Input Footer ────────────────────────────────────────────────────── */}
      <div className="ai-chat__footer">
        {status !== 'running' ? (
          <div className="ai-chat__offline-notice">
            <strong>Sandbox offline.</strong> Launch the environment to interact with Orion.
          </div>
        ) : (
          <div className="ai-chat__form">
            {/* Animated input wrapper */}
            <div className={`ai-chat__input-wrap ${inputFocused && !isStreaming ? 'ai-chat__input-wrap--active' : ''} ${isStreaming ? 'ai-chat__input-wrap--busy' : ''}`}>
              <form onSubmit={handleSubmit} style={{ position: 'relative', minWidth: 0 }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={isStreaming ? 'Orion is working…' : 'Enter instructions for Orion…'}
                  disabled={isStreaming}
                  rows={2}
                  className="ai-chat__textarea"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  className={`ai-chat__send-btn ${input.trim() && !isStreaming ? 'ai-chat__send-btn--active' : 'ai-chat__send-btn--disabled'}`}
                >
                  {isStreaming
                    ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                    : <Send size={12} />
                  }
                </button>
              </form>
            </div>

            {/* Form footer: hint + char count */}
            <div className="ai-chat__form-footer">
              <span className="ai-chat__hint">
                <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> newline
              </span>
              {input.length > 0 && (
                <span className={`ai-chat__char-count ${charClass}`}>
                  {charCount}/1000
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
