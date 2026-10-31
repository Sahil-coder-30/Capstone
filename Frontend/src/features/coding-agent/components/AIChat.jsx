import { useState, useRef, useEffect, useMemo } from 'react';
import { useCodingAgent } from '../Hooks/codingAgent.hooks';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import {
  Send, ChevronDown, ChevronRight, Check, Trash2, Cpu,
  CheckCircle2, AlertCircle, Loader2,
  X, Activity, FileCode, ArrowRight, Paperclip, Square,
  CheckSquare2, CheckCheck, RotateCcw, Sparkles
} from 'lucide-react';
import { parseMarkdownToReact, formatInline } from '../../../components/Markdown';
import { TakshaIcon } from '../../../components/BrandLogo';
import './AIChat.scss';

// ─── Tool type icon colors ────────────────────────────────────────────────────
const TOOL_TYPE_COLORS = {
  read:   '#a5b4fc',
  write:  '#a78bfa',
  cmd:    '#ff8a4c',
  verify: '#f59e0b',
  info:   'var(--text-muted)',
};

// Plan step status (from the agent) → phase row status used by PhaseIcon.
const STEP_PHASE_STATUS = {
  done: 'completed',
  failed: 'error',
  skipped: 'error',
  in_progress: 'running',
};

/**
 * Live "thinking" panel: the model's reasoning and narration while it works.
 * Open and auto-scrolling while the run is live, collapsed afterwards.
 */
/**
 * Turns the raw thinking stream into readable blocks:
 *  - paragraphs (older runs glued sentences together, e.g. "UI?I'll start")
 *  - "STATUS: done SUMMARY: ..." protocol lines become a status block
 */
function parseThinking(raw) {
  const prepared = String(raw || '')
    .replace(/([?!])(?=[A-Z])/g, '$1\n\n')
    .replace(/\.(?=(?:STATUS:|I'll |I will |Let's |Now |Next |First ))/g, '.\n\n')
    .replace(/(?=STATUS:\s*(?:done|blocked))/gi, '\n\n');

  return prepared
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const status = /^STATUS:\s*(done|blocked)\s*\|?\s*(?:SUMMARY:\s*([\s\S]*))?$/i.exec(part);
      if (status) {
        return { type: 'status', status: status[1].toLowerCase(), summary: (status[2] || '').trim() };
      }
      return { type: 'text', text: part };
    });
}

function ThinkingBlock({ text, isLive, isOpen, onToggle }) {
  const bodyRef = useRef(null);
  const blocks = useMemo(() => parseThinking(text), [text]);

  useEffect(() => {
    if (isLive && isOpen && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, isLive, isOpen]);

  if (!blocks.length) return null;

  const firstText = blocks.find((b) => b.type === 'text')?.text || '';
  const preview = firstText.replace(/\s+/g, ' ').slice(0, 90);

  return (
    <div className={`ai-chat__reasoning ${isLive ? 'ai-chat__reasoning--live' : ''} ${isOpen ? 'ai-chat__reasoning--open' : ''}`}>
      <button type="button" className="ai-chat__reasoning-toggle" onClick={onToggle} aria-expanded={isOpen}>
        <span className="ai-chat__reasoning-icon">
          <Sparkles size={12} />
        </span>
        <span className="ai-chat__reasoning-label">{isLive ? 'Thinking' : 'Thought process'}</span>
        {isLive && (
          <span className="ai-chat__reasoning-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
        {!isOpen && preview && <span className="ai-chat__reasoning-preview">{preview}</span>}
        <ChevronDown size={13} className="ai-chat__reasoning-chevron" />
      </button>
      {isOpen && (
        <div ref={bodyRef} className="ai-chat__reasoning-body">
          {blocks.map((block, idx) =>
            block.type === 'status' ? (
              <div key={idx} className={`ai-chat__reasoning-status ai-chat__reasoning-status--${block.status}`}>
                <span className="ai-chat__reasoning-status-badge">
                  {block.status === 'done' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  {block.status === 'done' ? 'Done' : 'Blocked'}
                </span>
                {block.summary && <span className="ai-chat__reasoning-status-text">{formatInline(block.summary)}</span>}
              </div>
            ) : (
              <p key={idx} className="ai-chat__reasoning-para">{formatInline(block.text)}</p>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * AIChat — Coding Agent left-panel chat.
 * Uses ONLY useCodingAgent hook (SSE stream from /api/ai/code-agent/*).
 * No references to copilot / app-agent.
 */
export default function AIChat({ projectId, onCloseChat }) {
  const { sandboxId, status } = useSandbox();
  const { messages, isStreaming, isHistoryLoading, planReview, approvePlan, rejectPlan, sendMessage, stopAgent, clearChatHistory, deleteMessage, deleteMessages } = useCodingAgent(projectId);
  const { files, fetchFilesList, activeFile, isModified, fetchFileContent } = useEditor();

  const [input, setInput] = useState('');
  const [expandedRuns, setExpandedRuns] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedThinking, setExpandedThinking] = useState({});
  const [inputFocused, setInputFocused] = useState(false);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null);
  const selectedModel = 'codestral';

  // ─── Multi-select deletion state ────────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRuns, setSelectedRuns] = useState(new Set());

  const scrollContainerRef = useRef(null);
  const lastScrollHeightRef = useRef(0);
  const prevSandboxIdRef = useRef(sandboxId);
  const textareaRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]); // [{ name, path, content }]
  const [fileSuggestions, setFileSuggestions] = useState([]);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionTriggerIdx, setSuggestionTriggerIdx] = useState(-1);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

  // ─── Plan Review UI State ───────────────────────────────────────────────────
  const [isReplanOpen, setIsReplanOpen] = useState(false);
  const [replanFeedback, setReplanFeedback] = useState('');
  const [expandedPlanSteps, setExpandedPlanSteps] = useState({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const suggestionsContainerRef = useRef(null);

  const handleFileClick = (filePath) => {
    if (sandboxId) {
      const normalizedPath = filePath.replace(/^\.\//, '').replace(/^\/workspace\//, '');
      fetchFileContent(sandboxId, normalizedPath);
    }
  };

  const togglePlanStep = (stepId) => {
    setExpandedPlanSteps((prev) => ({
      ...prev,
      [stepId]: prev[stepId] === undefined ? false : !prev[stepId],
    }));
  };

  const handleApprovePlan = async () => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      await approvePlan();
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRejectPlan = async () => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      await rejectPlan(replanFeedback.trim());
      setIsReplanOpen(false);
      setReplanFeedback('');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to approve plan, Escape to cancel replan
  useEffect(() => {
    if (!planReview) {
      setIsReplanOpen(false);
      setReplanFeedback('');
      setIsSubmittingReview(false);
      return;
    }

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleApprovePlan();
      } else if (e.key === 'Escape' && isReplanOpen) {
        setIsReplanOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [planReview, isReplanOpen, replanFeedback, isSubmittingReview]);

  // Auto-scroll active suggestion into view inside the dropdown list
  useEffect(() => {
    if (showSuggestions && suggestionsContainerRef.current) {
      const activeEl = suggestionsContainerRef.current.children[activeSuggestionIdx];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeSuggestionIdx, showSuggestions]);

  // Auto-resize textarea height dynamically based on content
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight + 2}px`;
    }
  }, [input]);

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    setInput(val);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, selectionStart);
    
    // Check if the current word being typed starts with @
    const lastWordMatch = textBeforeCursor.match(/(?:^|\s)(@)([^\s]*)$/);
    if (lastWordMatch) {
      const query = lastWordMatch[2]; // e.g. 'app'
      setSuggestionQuery(query);
      setSuggestionTriggerIdx(selectionStart - lastWordMatch[0].length + (lastWordMatch[0].startsWith(' ') ? 1 : 0));
      
      // Filter flat list of file paths based on query
      if (files && files.length > 0) {
        const filtered = files.filter(f => f.toLowerCase().includes(query.toLowerCase()));
        setFileSuggestions(filtered.slice(0, 8)); // limit to 8 suggestions
        setShowSuggestions(filtered.length > 0);
        setActiveSuggestionIdx(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = async (filePath) => {
    let content = '';
    try {
      if (sandboxId) {
        content = (await fetchFileContent(sandboxId, filePath)) || '';
      }
    } catch (err) {
      console.error("Failed to read file content for attachment:", err);
    }

    if (!attachedFiles.some(f => f.path === filePath)) {
      setAttachedFiles(prev => [...prev, { name: filePath.split('/').pop(), path: filePath, content }]);
    }

    // Replace trigger word in textarea input using the trigger index
    if (suggestionTriggerIdx !== -1) {
      const beforeTrigger = input.slice(0, suggestionTriggerIdx);
      const afterTrigger = input.slice(suggestionTriggerIdx + 1 + suggestionQuery.length);
      setInput(beforeTrigger + afterTrigger);
      setShowSuggestions(false);
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = beforeTrigger.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    }
  };

  // Load initial prompt from session storage and auto-submit once sandbox is running and history is ready
  useEffect(() => {
    if (projectId && status === 'running' && !isHistoryLoading) {
      const initPrompt = sessionStorage.getItem(`initialPrompt_${projectId}`);
      if (initPrompt) {
        sessionStorage.removeItem(`initialPrompt_${projectId}`);
        sendMessage(initPrompt, () => {
          if (sandboxId) {
            fetchFilesList(sandboxId, { forceNetwork: true });
            if (activeFile && !isModified) fetchFileContent(sandboxId, activeFile, true);
          }
        });
      }
    }
  }, [projectId, status, sandboxId, isHistoryLoading, sendMessage, fetchFilesList, activeFile, isModified, fetchFileContent]);

  // Auto-fetch files list when sandbox is active to populate autocomplete suggestions
  useEffect(() => {
    if (status === 'running' && sandboxId) {
      fetchFilesList(sandboxId);
    }
  }, [status, sandboxId, fetchFilesList]);

  // Auto-clear history when sandbox session changes
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

  // Smart auto-scroll and resize observer
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScrollAdjustment = () => {
      const prevHeight = lastScrollHeightRef.current;
      const isShrunk = container.scrollHeight < prevHeight;
      const wasAtBottom = !prevHeight || isShrunk || (prevHeight - container.scrollTop - container.clientHeight <= 100);
      if (wasAtBottom) container.scrollTop = container.scrollHeight;
      lastScrollHeightRef.current = container.scrollHeight;
    };

    handleScrollAdjustment();

    const resizeObserver = new ResizeObserver(() => {
      handleScrollAdjustment();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [messages, isStreaming]);



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

  // Default card expansion calculated dynamically

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    if (status !== 'running') {
      alert('Coding Agent requires a live sandbox. Please start the sandbox first.');
      return;
    }

    const query = input;
    const currentAttachments = [...attachedFiles];
    setInput('');
    setAttachedFiles([]);
    lastScrollHeightRef.current = 0;

    sendMessage(query, currentAttachments, () => {
      if (sandboxId) {
        fetchFilesList(sandboxId);
        if (activeFile && !isModified) fetchFileContent(sandboxId, activeFile, true);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIdx(prev => (prev + 1) % fileSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIdx(prev => (prev - 1 + fileSuggestions.length) % fileSuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectSuggestion(fileSuggestions[activeSuggestionIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const toggleRun = (runId) => setExpandedRuns(prev => {
    const isCurrentlyExpanded = prev[runId] !== undefined ? prev[runId] : (runId === runs[runs.length - 1]?.id);
    return { ...prev, [runId]: !isCurrentlyExpanded };
  });
  const toggleLogs = (runId) => setExpandedLogs(prev => ({ ...prev, [runId]: !prev[runId] }));

  const handleClearHistory = () => {
    clearChatHistory();
    setExpandedRuns({});
    setExpandedLogs({});
    setSelectedRuns(new Set());
    setIsSelectMode(false);
    lastScrollHeightRef.current = 0;
  };

  // ─── Select mode handlers ────────────────────────────────────────────────────
  const handleToggleSelectMode = () => {
    setIsSelectMode(prev => !prev);
    setSelectedRuns(new Set());
  };

  const handleSelectRun = (runId, e) => {
    e.stopPropagation();
    setSelectedRuns(prev => {
      const next = new Set(prev);
      next.has(runId) ? next.delete(runId) : next.add(runId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = runs.filter(r => r.goal !== null).map(r => r.id);
    if (selectedRuns.size === allIds.length) {
      setSelectedRuns(new Set());
    } else {
      setSelectedRuns(new Set(allIds));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRuns.size === 0) return;
    // Collect all message IDs (user msg + paired assistant msg) to delete
    const idsToDelete = [];
    for (const runId of selectedRuns) {
      const run = runs.find(r => r.id === runId);
      if (run) {
        if (run.id) idsToDelete.push(run.id);
        if (run.assistant?.id || run.assistant?._id) {
          idsToDelete.push(run.assistant.id || run.assistant._id);
        }
      }
    }
    if (idsToDelete.length > 0) {
      await deleteMessages(idsToDelete);
    }
    setSelectedRuns(new Set());
    setIsSelectMode(false);
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
          if (match) match.forEach(m => { const f = m.match(/"file"\s*:\s*"([^"]+)"/) ?.[1]; if (f && !f.includes('todo.md')) filesMap.set(f, 'create'); });
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

  // ─── Real plan steps (preferred over log heuristics when available) ────────
  const getPlanPhases = (assistantMsg, isLive) => {
    const steps = assistantMsg?.steps || [];
    const firstPending = steps.findIndex((s) => !s.status || s.status === 'pending');
    return steps.map((step, idx) => ({
      id: `step-${step.id}`,
      name: `Step ${step.id}: ${step.title}`,
      description: step.summary || 'In progress',
      status: STEP_PHASE_STATUS[step.status]
        || (isLive && idx === firstPending && !planReview ? 'running' : 'pending'),
    }));
  };

  // ─── Log event parser ───────────────────────────────────────────────────────
  const parseToolLogToEvent = (log) => {
    const isStart   = log.includes(': start') || log.includes('attempt 1');
    const isSuccess = log.includes(': success') || log.includes('success -') || log.includes('patched successfully') || log.includes('success (on retry)');
    const isError   = log.includes(': error') || log.includes('failed');
    const cleanLog  = log.replace(/\\"/g, '"');
    let title, description, type = 'info';

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
    } else if (log.startsWith('model:')) {
      title = 'Model Selected'; type = 'info';
      description = cleanLog.replace(/^model:\s*/i, '');
    } else {
      const parts = log.split(':'); title = parts[0] || 'Agent Action'; description = parts.slice(1).join(':').trim();
    }

    let status = 'info';
    if (isSuccess) status = 'success';
    else if (isError) status = 'error';
    else if (isStart) status = 'running';

    return { title, description, type, status, timestamp: new Date().toLocaleTimeString() };
  };

  const formatActivityTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getLiveReportEvents = (assistantMsg, parsedToolEvents) => {
    const streamEvents = assistantMsg?.streamState?.events || [];
    if (streamEvents.length > 0) return streamEvents.slice(-4);

    return (parsedToolEvents || []).slice(-4).map((event, index) => ({
      id: `${event.title}-${index}`,
      title: event.title,
      detail: event.description,
      status: event.status,
      timestamp: null,
    }));
  };

  const getCurrentLiveReport = (assistantMsg, parsedToolEvents) => {
    const streamState = assistantMsg?.streamState;
    if (streamState?.title) {
      return {
        title: streamState.title,
        detail: streamState.detail,
        status: streamState.status || 'running',
        phase: streamState.phase || 'working',
      };
    }

    const latestEvent = parsedToolEvents?.[parsedToolEvents.length - 1];
    if (latestEvent) {
      return {
        title: latestEvent.title,
        detail: latestEvent.description,
        status: latestEvent.status,
        phase: latestEvent.type || 'working',
      };
    }

    return {
      title: 'Preparing Orion',
      detail: 'Opening realtime stream',
      status: 'running',
      phase: 'queued',
    };
  };

  const renderLiveReport = (assistantMsg, parsedToolEvents) => {
    const current = getCurrentLiveReport(assistantMsg, parsedToolEvents);
    const events = getLiveReportEvents(assistantMsg, parsedToolEvents);
    const stateClass = current.status === 'error'
      ? 'error'
      : current.status === 'success'
        ? 'success'
        : 'running';

    // Map phase to nice description and visual attributes
    let phaseIcon = <Activity className="ai-chat__thinking-orb-icon" size={14} />;
    let phaseColor = 'var(--brand-primary)';
    let phaseBadgeText = 'RUNNING';

    if (current.phase === 'thinking') {
      phaseIcon = <Cpu className="ai-chat__thinking-orb-icon pulse-animation" size={14} />;
      phaseColor = '#a78bfa'; // Purple/Indigo
      phaseBadgeText = 'THINKING';
    } else if (current.phase === 'rate_limit') {
      phaseIcon = <AlertCircle className="ai-chat__thinking-orb-icon alert-pulse" size={14} />;
      phaseColor = '#f59e0b'; // Amber
      phaseBadgeText = 'RATE LIMIT';
    } else if (stateClass === 'error') {
      phaseIcon = <AlertCircle className="ai-chat__thinking-orb-icon" size={14} />;
      phaseColor = '#f43f5e'; // Red
      phaseBadgeText = 'ERROR';
    } else if (stateClass === 'success') {
      phaseIcon = <CheckCircle2 className="ai-chat__thinking-orb-icon" size={14} />;
      phaseColor = '#22c55e'; // Green
      phaseBadgeText = 'DONE';
    } else if (current.phase === 'tool') {
      phaseIcon = <Loader2 className="ai-chat__thinking-orb-icon spin-animation" size={14} />;
      phaseColor = '#4ade80'; // Mint Green
      phaseBadgeText = 'EXECUTING';
    } else if (current.phase === 'queued') {
      phaseIcon = <Loader2 className="ai-chat__thinking-orb-icon pulse-animation" size={14} />;
      phaseColor = '#a5b4fc'; // Blue
      phaseBadgeText = 'QUEUED';
    }

    // Monospace terminal logs display
    const logs = assistantMsg?.toolLogs || [];
    const latestLogs = logs.slice(-3); // Get last 3 logs to keep it clean

    return (
      <div className={`ai-chat__thinking-panel ai-chat__thinking-panel--${stateClass}`}>
        {/* Glowing aura background elements */}
        <div className="ai-chat__thinking-aura" style={{ '--glow-color': phaseColor }} />
        
        {/* Header containing status indicator & badge */}
        <div className="ai-chat__thinking-header">
          <div className="ai-chat__thinking-indicator">
            <div 
              className={`ai-chat__thinking-orb ai-chat__thinking-orb--${stateClass}`}
              style={{ borderColor: `${phaseColor}33`, boxShadow: `0 0 12px ${phaseColor}44` }}
            >
              <div className="ai-chat__thinking-orb-inner" style={{ background: phaseColor }}>
                {phaseIcon}
              </div>
            </div>
            <div className="ai-chat__thinking-info">
              <div className="ai-chat__thinking-status-text">{current.title}</div>
              {current.detail && (
                <div className="ai-chat__thinking-detail-text">{current.detail}</div>
              )}
            </div>
          </div>
          <span 
            className={`ai-chat__thinking-badge ai-chat__thinking-badge--${stateClass}`}
            style={{ color: phaseColor, borderColor: `${phaseColor}44`, background: `${phaseColor}11` }}
          >
            {phaseBadgeText}
          </span>
        </div>

        {/* Live Terminal Terminal Logs Screen */}
        {latestLogs.length > 0 && (
          <div className="ai-chat__thinking-terminal">
            <div className="ai-chat__thinking-terminal-header">
              <div className="ai-chat__thinking-terminal-buttons">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
              <span className="ai-chat__thinking-terminal-title">orion-execution-console.log</span>
            </div>
            <div className="ai-chat__thinking-terminal-body">
              {latestLogs.map((log, index) => {
                const logType = log.startsWith('model:') 
                  ? 'model' 
                  : log.includes('starting') 
                    ? 'start' 
                    : log.includes('finished') 
                      ? 'end' 
                      : 'info';
                
                return (
                  <div key={index} className={`ai-chat__thinking-terminal-line ai-chat__thinking-terminal-line--${logType}`}>
                    <span className="ai-chat__thinking-terminal-prompt">&gt;</span>
                    <span className="ai-chat__thinking-terminal-text">{log}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline representation of recent events */}
        {events.length > 0 && (
          <div className="ai-chat__thinking-timeline">
            {events.map((event) => {
              const eventStatus = event.status === 'success'
                ? 'success'
                : event.status === 'error'
                  ? 'error'
                  : event.status === 'running'
                    ? 'running'
                    : 'info';
              
              let eventIcon = <Activity size={10} />;
              if (event.kind === 'tool') eventIcon = <FileCode size={10} />;
              else if (event.kind === 'model') eventIcon = <Cpu size={10} />;
              else if (event.kind === 'rate_limit') eventIcon = <AlertCircle size={10} />;
              else if (eventStatus === 'success') eventIcon = <Check size={10} />;
              
              return (
                <div key={event.id || `${event.title}-${event.timestamp}`} className="ai-chat__thinking-timeline-item">
                  <div className={`ai-chat__thinking-timeline-icon-wrapper ai-chat__thinking-timeline-icon-wrapper--${eventStatus}`}>
                    {eventIcon}
                  </div>
                  <div className="ai-chat__thinking-timeline-copy">
                    <span className="ai-chat__thinking-timeline-title">{event.title}</span>
                    {event.detail && (
                      <span className="ai-chat__thinking-timeline-detail">{event.detail}</span>
                    )}
                  </div>
                  {formatActivityTime(event.timestamp) && (
                    <span className="ai-chat__thinking-timeline-time">
                      {formatActivityTime(event.timestamp)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Old inline markdown formatter removed - using new robust parser

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
    if (status === 'completed') return <Check size={10} strokeWidth={3} />;
    if (status === 'running')   return <Loader2 size={10} className="spin-animation" />;
    if (status === 'error')     return <AlertCircle size={10} />;
    return <div className="ai-chat__phases-pending-dot" />;
  };

  // ─── Models list ────────────────────────────────────────────────────────────
  // Removed model selection list. Defaulting to codestral.

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
          <div className="ai-chat__header-brand">
            <Cpu size={12} color="var(--primary)" />
            <span className="ai-chat__header-title">Orion Coding Agent</span>
          </div>
        </div>

        <div className="ai-chat__header-right">
          {isSelectMode ? (
            /* ── Selection toolbar ── */
            <div className="ai-chat__select-toolbar">
              <span className="ai-chat__select-count">
                {selectedRuns.size} selected
              </span>
              <button
                className="ai-chat__select-all-btn"
                onClick={handleSelectAll}
                title={selectedRuns.size === runs.filter(r => r.goal !== null).length ? 'Deselect all' : 'Select all'}
              >
                <CheckCheck size={12} />
                {selectedRuns.size === runs.filter(r => r.goal !== null).length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedRuns.size > 0 && (
                <button
                  className="ai-chat__select-delete-btn"
                  onClick={handleDeleteSelected}
                  title={`Delete ${selectedRuns.size} selected`}
                >
                  <Trash2 size={11} />
                  Delete ({selectedRuns.size})
                </button>
              )}
              <button className="ai-chat__select-cancel-btn" onClick={handleToggleSelectMode} title="Cancel selection">
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              {isStreaming ? (
                <div className="ai-chat__status ai-chat__status--busy">
                  <div className="ai-chat__status-spinner" />
                  <span className="ai-chat__status-text">BUSY</span>
                </div>
              ) : (
                <div className="ai-chat__status ai-chat__status--ready">
                  <div className="ai-chat__status-dot ai-chat__status-dot--ready" />
                  <span className="ai-chat__status-text">READY</span>
                </div>
              )}
              {runs.filter(r => r.goal !== null).length > 0 && (
                <button
                  className="ai-chat__clear-btn"
                  onClick={handleToggleSelectMode}
                  title="Select chats to delete"
                >
                  <CheckSquare2 size={13} />
                </button>
              )}
              {onCloseChat && (
                <button className="ai-chat__close-btn" onClick={onCloseChat} title="Collapse Orion Coding Agent">
                  <X size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Messages Scroll Area ────────────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="ai-chat__scroll">

        {runs.length === 0 ? (
          /* Welcome Panel */
          <div className="ai-chat__welcome">
            <div className="ai-chat__welcome-hero">
              <div className="ai-chat__welcome-brand">
                <TakshaIcon size={36} />
                <div className="ai-chat__welcome-brand-copy">
                  <h2 className="ai-chat__welcome-title">Orion</h2>
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
                { label: 'Read & write project files', color: '#a5b4fc' },
                { label: 'Execute shell commands & scripts', color: '#ff8a4c' },
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
                  prompt: 'Implement file caching in IndexedDB when visiting the code editor, reuse cached data on editor navigation, update cache on file changes.',
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
            const isExpanded = expandedRuns[run.id] !== undefined ? expandedRuns[run.id] : (run.id === runs[runs.length - 1]?.id);
            const assistant = run.assistant;
            const isLiveRun = assistant?.status === 'running';
            const phases = !assistant
              ? []
              : assistant.steps?.length
                ? getPlanPhases(assistant, isLiveRun)
                : getWorkflowPhases(assistant);
            const modifiedFiles = assistant ? getModifiedFiles(assistant.toolLogs) : [];
            const parsedEvents = assistant ? assistant.toolLogs.map((log, i) => parseToolLogToEvent(log, i)) : [];
            const isThisLatestAssistant =
              assistant &&
              (
                messages[messages.length - 1]?.id === assistant.id ||
                messages[messages.length - 2]?.id === assistant.id
              );
            const isGenuinelyRunning =
              assistant?.status === 'running' &&
              !assistant.error &&
              isStreaming &&
              isThisLatestAssistant;
            const showLiveReport =
              assistant &&
              !isWelcome &&
              (
                isGenuinelyRunning ||
                assistant.streamState?.events?.length > 0 ||
                (assistant.status === 'running' && parsedEvents.length > 0)
              );

            const isSelected = selectedRuns.has(run.id);

            return (
              <div
                key={run.id}
                className={[
                  'ai-chat__run-card',
                  isExpanded ? 'ai-chat__run-card--expanded' : '',
                  isSelectMode && !isWelcome ? 'ai-chat__run-card--selectable' : '',
                  isSelected ? 'ai-chat__run-card--selected' : '',
                ].filter(Boolean).join(' ')}
              >
                {/* Card Header */}
                <div
                  className={`ai-chat__run-card__header ${isExpanded ? 'ai-chat__run-card__header--expanded' : ''}`}
                  onClick={() => isSelectMode && !isWelcome ? handleSelectRun(run.id, { stopPropagation: () => {} }) : toggleRun(run.id)}
                >
                  <div className="ai-chat__run-card__summary">
                    {/* Checkbox — only visible in select mode for real task cards */}
                    {isSelectMode && !isWelcome && (
                      <button
                        className={`ai-chat__run-card__checkbox ${isSelected ? 'ai-chat__run-card__checkbox--checked' : ''}`}
                        onClick={(e) => handleSelectRun(run.id, e)}
                        aria-label={isSelected ? 'Deselect' : 'Select'}
                      >
                        {isSelected
                          ? <Check size={9} strokeWidth={3} />
                          : null
                        }
                      </button>
                    )}
                    {!isSelectMode && <div className={`ai-chat__run-card__status-dot ${getStatusDotClass(assistant)}`} />}
                    <span className="ai-chat__run-card__title">
                      {isWelcome ? 'System Workspace Initialized' : `Task: ${run.goal}`}
                    </span>
                  </div>
                  <div className="ai-chat__run-card__meta">
                    <span className="ai-chat__run-card__time">
                      {run.timestamp ? new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    {!isSelectMode && (isExpanded ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />)}
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <div className="ai-chat__run-card__body">

                    {!isWelcome && (
                      <div className="ai-chat__objective">
                        <div className="ai-chat__objective-header">
                          <Activity size={11} className="ai-chat__objective-icon animate-pulse" style={{ color: 'var(--brand-primary)' }} />
                          <span className="ai-chat__objective-label">Active Objective</span>
                        </div>
                        <p className="ai-chat__objective-text">{run.goal}</p>
                      </div>
                    )}

                    {assistant && !isWelcome && (
                      <div className="ai-chat__phases">
                        <span className="ai-chat__phases-label">Execution Phases</span>
                        <div className="ai-chat__phases-grid">
                          {phases.map(phase => (
                            <div key={phase.id} className={`ai-chat__phases-row ai-chat__phases-row--${phase.status}`}>
                              <div className={`ai-chat__phases-icon ai-chat__phases-icon--${phase.status}`}>
                                <PhaseIcon status={phase.status} />
                              </div>
                              <div className="ai-chat__phases-content">
                                <div className="ai-chat__phases-name" style={{
                                  color: phase.status === 'running' ? 'var(--brand-primary)' : phase.status === 'completed' ? 'var(--text-main)' : 'var(--text-dark)'
                                }}>
                                  {phase.name}
                                  {phase.optional && <span className="ai-chat__phases-optional">(optional)</span>}
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

                    {modifiedFiles.length > 0 && (
                      <div className="ai-chat__files">
                        <span className="ai-chat__files-label">Working Files</span>
                        <div className="ai-chat__files-list">
                          {modifiedFiles.map((file, fIdx) => (
                            <div 
                              key={fIdx} 
                              className="ai-chat__files-row ai-chat__files-row--clickable"
                              onClick={() => handleFileClick(file.path)}
                              title={`Open ${file.path} in editor`}
                            >
                              <div className="ai-chat__files-name">
                                <div className="ai-chat__files-check-wrap" style={{ background: file.type === 'create' ? 'rgba(234, 88, 12,0.1)' : 'rgba(139,92,246,0.1)' }}>
                                  {file.type === 'create'
                                    ? <Check size={8} color="#22c55e" strokeWidth={3} />
                                    : <FileCode size={8} color="#a78bfa" />}
                                </div>
                                <span className="ai-chat__files-path-text">{file.path}</span>
                              </div>
                              <div className="ai-chat__files-action">
                                <span className="ai-chat__files-badge" style={{ color: file.type === 'create' ? '#ea580c' : '#a78bfa' }}>
                                  {file.type === 'create' ? 'NEW' : 'MOD'}
                                </span>
                                <ArrowRight size={10} className="ai-chat__files-arrow" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                                <div className="ai-chat__log-event-content">
                                  <div className="ai-chat__log-event-head">
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

                    {assistant && (
                      <div className="ai-chat__report">
                        {showLiveReport && renderLiveReport(assistant, parsedEvents)}

                        <ThinkingBlock
                          text={assistant.thinking}
                          isLive={isGenuinelyRunning}
                          isOpen={expandedThinking[run.id] ?? isGenuinelyRunning}
                          onToggle={() => setExpandedThinking((prev) => ({
                            ...prev,
                            [run.id]: !(prev[run.id] ?? isGenuinelyRunning),
                          }))}
                        />

                        {assistant.text ? (
                          <div className="ai-chat__report-card">
                            <div className="ai-chat__report-card-header">
                              <div className="ai-chat__report-card-title">
                                <Cpu size={13} color="var(--brand-primary)" />
                                <span>Agent Response</span>
                              </div>
                              <span className="ai-chat__report-card-badge">REPORT</span>
                            </div>
                            <div className="ai-chat__report-card-body">
                              {parseMarkdownToReact(assistant.text, { copiedCodeIdx, copyToClipboard })}
                            </div>
                          </div>
                        ) : (() => {
                          if (!showLiveReport && assistant.status === 'running' && !isStreaming) {
                            return (
                              <p className="ai-chat__report-fallback">
                                Task completed.
                              </p>
                            );
                          }
                          return null;
                        })()}

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

        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
          <div className="ai-chat__streaming">
            <div className="ai-chat__streaming-icon" />
            <span>Establishing orchestrator RPC stream…</span>
          </div>
        )}
      </div>

      {/* ─── Plan Review Gate Overlay ───────────────────────────────────────── */}
      {planReview && (
        <div className="ai-chat__plan-review animate-fade-in">
          <div className="ai-chat__plan-review-header">
            <div className="ai-chat__plan-review-title">
              <div className="ai-chat__plan-review-icon-glow">
                <CheckSquare2 size={16} color="var(--brand-primary, #ea580c)" />
              </div>
              <div className="ai-chat__plan-review-heading">
                <div className="ai-chat__plan-review-main-title">
                  <span>Plan Review Required</span>
                  {planReview.taskSubType && (
                    <span className="ai-chat__plan-review-badge">
                      {planReview.taskSubType.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="ai-chat__plan-review-subtitle">
                  Review implementation steps before Orion begins writing code
                </span>
              </div>
            </div>
            <div className="ai-chat__plan-review-meta">
              <span className="ai-chat__plan-review-count">
                {planReview.plan?.totalSteps || (planReview.plan?.steps || []).length} Steps Proposed
              </span>
            </div>
          </div>

          {planReview.plan?.summary && (
            <div className="ai-chat__plan-review-summary">
              <Sparkles size={13} className="ai-chat__plan-review-summary-icon" />
              <span>{planReview.plan.summary}</span>
            </div>
          )}

          {planReview.warnings?.length > 0 && (
            <div className="ai-chat__plan-review-warnings">
              {planReview.warnings.map((warning, wIdx) => (
                <div key={wIdx} className="ai-chat__plan-review-warning">
                  <AlertCircle size={12} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ai-chat__plan-review-steps">
            {(planReview.plan?.steps || []).map((step, idx) => {
              const isExpanded = expandedPlanSteps[step.id] !== false; // Default expanded
              const actionType = (step.action || (step.title?.toLowerCase().includes('create') ? 'create' : 'modify')).toLowerCase();
              const risk = (step.riskLevel || 'medium').toLowerCase();

              return (
                <div key={step.id || idx} className={`ai-chat__plan-step ${isExpanded ? 'ai-chat__plan-step--expanded' : ''}`}>
                  <div
                    className="ai-chat__plan-step-header"
                    onClick={() => togglePlanStep(step.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="ai-chat__plan-step-left">
                      <button type="button" className="ai-chat__plan-step-chevron">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="ai-chat__plan-step-num">Step {step.id || idx + 1}</span>
                      <span className={`ai-chat__plan-step-action ai-chat__plan-step-action--${actionType}`}>
                        {actionType.toUpperCase()}
                      </span>
                      <span className="ai-chat__plan-step-title">{step.title}</span>
                    </div>

                    <span className={`ai-chat__plan-step-risk ai-chat__plan-step-risk--${risk}`}>
                      {risk.toUpperCase()}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="ai-chat__plan-step-body animate-fade-in">
                      {step.description && (
                        <div className="ai-chat__plan-step-desc">{step.description}</div>
                      )}

                      {step.activeFiles?.length > 0 && (
                        <div className="ai-chat__plan-step-files-wrapper">
                          <span className="ai-chat__plan-step-section-label">Target Files:</span>
                          <div className="ai-chat__plan-step-files">
                            {step.activeFiles.map((f) => (
                              <span
                                key={f}
                                className="ai-chat__plan-step-file"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFileClick(f);
                                }}
                                title="Click to view file"
                              >
                                <FileCode size={11} /> {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.acceptanceCriteria?.length > 0 && (
                        <div className="ai-chat__plan-step-criteria-wrapper">
                          <span className="ai-chat__plan-step-section-label">Acceptance Criteria:</span>
                          <ul className="ai-chat__plan-step-criteria">
                            {step.acceptanceCriteria.map((c, cIdx) => (
                              <li key={cIdx}>
                                <CheckCircle2 size={12} className="ai-chat__plan-criteria-icon" />
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Inline Re-plan feedback drawer */}
          {isReplanOpen && (
            <div className="ai-chat__plan-replan-drawer animate-slide-down">
              <div className="ai-chat__plan-replan-header">
                <span className="ai-chat__plan-replan-title">What would you like to change in this plan?</span>
              </div>
              <textarea
                className="ai-chat__plan-replan-textarea"
                placeholder="e.g. Use Tailwind CSS instead of SCSS modules, don't modify Navbar.jsx, add error handling..."
                value={replanFeedback}
                onChange={(e) => setReplanFeedback(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="ai-chat__plan-replan-actions">
                <button
                  type="button"
                  className="ai-chat__plan-replan-cancel-btn"
                  onClick={() => setIsReplanOpen(false)}
                  disabled={isSubmittingReview}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ai-chat__plan-replan-submit-btn"
                  onClick={handleRejectPlan}
                  disabled={isSubmittingReview || !replanFeedback.trim()}
                >
                  {isSubmittingReview ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  <span>Submit Re-plan</span>
                </button>
              </div>
            </div>
          )}

          <div className="ai-chat__plan-review-actions">
            <button
              type="button"
              className="ai-chat__plan-approve-btn"
              onClick={handleApprovePlan}
              disabled={isSubmittingReview}
            >
              {isSubmittingReview ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              <span>Approve & Execute</span>
              <kbd className="ai-chat__plan-kbd">⌘↵</kbd>
            </button>

            {!isReplanOpen && (
              <button
                type="button"
                className="ai-chat__plan-reject-btn"
                onClick={() => setIsReplanOpen(true)}
                disabled={isSubmittingReview}
              >
                <RotateCcw size={14} />
                <span>Request Changes</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Input Footer ────────────────────────────────────────────────────── */}
      <div className="ai-chat__footer">
        {status !== 'running' ? (
          <div className="ai-chat__offline-notice animate-fade-in">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span><strong>Sandbox offline.</strong> Launch the environment to interact with Orion.</span>
          </div>
        ) : (
          <div className="ai-chat__form">
            {attachedFiles.length > 0 && (
              <div className="ai-chat__attachments">
                {attachedFiles.map(file => (
                  <div key={file.path} className="ai-chat__attachment-pill">
                    <FileCode size={11} color="var(--brand-primary)" />
                    <span className="ai-chat__attachment-name" title={file.path}>{file.name}</span>
                    <button
                      type="button"
                      className="ai-chat__attachment-remove"
                      onClick={() => setAttachedFiles(prev => prev.filter(f => f.path !== file.path))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={`ai-chat__input-wrap ${inputFocused && !isStreaming ? 'ai-chat__input-wrap--active' : ''} ${isStreaming ? 'ai-chat__input-wrap--busy' : ''}`}>
              <form onSubmit={handleSubmit} className="ai-chat__input-form">
                {showSuggestions && (
                  <div ref={suggestionsContainerRef} className="ai-chat__suggestions">
                    {fileSuggestions.map((suggestion, idx) => (
                      <div
                        key={suggestion}
                        className={`ai-chat__suggestion-item ${idx === activeSuggestionIdx ? 'ai-chat__suggestion-item--active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(suggestion);
                        }}
                      >
                        <FileCode size={11} color="var(--brand-primary)" />
                        <span className="ai-chat__suggestion-text">
                          {suggestion}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => {
                    setInputFocused(false);
                    // Slight delay to allow clicking suggestions before hiding
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder={isStreaming ? 'Orion is working…' : 'Type @ to attach files…'}
                  disabled={isStreaming}
                  rows={1}
                  className="ai-chat__textarea"
                />
                {isStreaming ? (
                  <button
                    type="button"
                    className="ai-chat__send-btn ai-chat__send-btn--stop"
                    onClick={stopAgent}
                    title="Stop Orion"
                  >
                    <Square size={11} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={`ai-chat__send-btn ${input.trim() ? 'ai-chat__send-btn--active' : 'ai-chat__send-btn--disabled'}`}
                  >
                    <Send size={12} />
                  </button>
                )}
              </form>
            </div>

            <div className="ai-chat__form-footer">
              <div className="ai-chat__footer-controls">
                {/* Attach File Button Context */}
                <div className="ai-chat__footer-menu" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="ai-chat__model-btn"
                    onClick={() => { setIsFilePickerOpen(v => !v); }}
                    title="Attach File Context"
                  >
                    <Paperclip size={10} />
                    <span>Attach File</span>
                  </button>
                  {isFilePickerOpen && (
                    <div className="ai-chat__model-dropdown ai-chat__model-dropdown--upward ai-chat__file-dropdown">
                      <div className="ai-chat__file-dropdown-header">
                        SELECT A FILE TO ATTACH
                      </div>
                      {files && files.length > 0 ? (
                        files.map(f => (
                          <div
                            key={f}
                            className="ai-chat__model-dropdown-item"
                            onClick={() => { handleSelectSuggestion(f); setIsFilePickerOpen(false); }}
                          >
                            <span className="ai-chat__file-dropdown-path">{f}</span>
                          </div>
                        ))
                      ) : (
                        <div className="ai-chat__file-dropdown-empty">
                          No files available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="ai-chat__footer-meta">
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
          </div>
        )}
      </div>
    </div>
  );
}
