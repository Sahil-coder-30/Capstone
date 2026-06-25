import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../Hooks/chat.hooks';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import { 
  Send, Sparkles, ChevronDown, ChevronRight, Check, Copy, Trash2, Cpu, 
  FileText, Code, Terminal, CheckCircle2, AlertCircle, Loader2, Play, 
  X, ListTodo, Activity, RefreshCw, Layers, FileCode, ArrowRight
} from 'lucide-react';

export default function AIChat() {
  const { sandboxId, status } = useSandbox();
  const { messages, isStreaming, sendMessage, clearChatHistory } = useChat();
  const { fetchFilesList, activeFile, isModified, fetchFileContent } = useEditor();

  const [input, setInput] = useState('');
  const [expandedRuns, setExpandedRuns] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null);
  const [selectedModel, setSelectedModel] = useState('Gemini 3.5 Flash (High)');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  
  const scrollContainerRef = useRef(null);
  const lastScrollHeightRef = useRef(0);
  // Track previous sandboxId to detect session changes
  const prevSandboxIdRef = useRef(sandboxId);

  // Bug 3: Auto-clear history when the sandbox session changes (new sandbox spun up)
  useEffect(() => {
    const prev = prevSandboxIdRef.current;
    // Both must be non-empty and different — this means the sandbox was replaced
    if (prev && sandboxId && prev !== sandboxId) {
      clearChatHistory();
      setExpandedRuns({});
      setExpandedLogs({});
      lastScrollHeightRef.current = 0;
    }
    prevSandboxIdRef.current = sandboxId;
  }, [sandboxId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart auto-scroll to bottom of chat
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const prevHeight = lastScrollHeightRef.current;
    const isShrunk = container.scrollHeight < prevHeight;
    // wasAtBottom checks if scroll position was at the bottom of the previous content size
    const wasAtBottom = !prevHeight || isShrunk || (prevHeight - container.scrollTop - container.clientHeight <= 100);

    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
    
    lastScrollHeightRef.current = container.scrollHeight;
  }, [messages, isStreaming]);

  // Group messages into individual task runs
  const getTaskRuns = () => {
    const runs = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        const assistantMsg = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null;
        runs.push({
          id: msg.id,
          goal: msg.text,
          timestamp: msg.timestamp,
          assistant: assistantMsg,
        });
        if (assistantMsg) {
          i++; // skip assistant msg in next loop
        }
      } else {
        // Welcome message or assistant message without user trigger
        runs.push({
          id: msg.id,
          goal: null,
          timestamp: msg.timestamp,
          assistant: msg,
        });
      }
    }
    return runs;
  };

  const runs = getTaskRuns();

  // Expand the active (last) run by default
  useEffect(() => {
    if (runs.length > 0) {
      const lastRun = runs[runs.length - 1];
      setExpandedRuns(prev => {
        // Only set default if not already initialized
        if (prev[lastRun.id] === undefined) {
          return { ...prev, [lastRun.id]: true };
        }
        return prev;
      });
    }
  }, [runs.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || status !== 'running') return;
    
    const query = input;
    setInput('');
    
    // Reset scroll height ref to force auto-scroll on submit
    lastScrollHeightRef.current = 0;
    
    sendMessage(query, () => {
      if (sandboxId) {
        fetchFilesList(sandboxId);
        
        // Auto-reload the active file if it hasn't been modified locally
        if (activeFile && !isModified) {
          fetchFileContent(sandboxId, activeFile, true);
        }
      }
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleRun = (runId) => {
    setExpandedRuns(prev => ({ ...prev, [runId]: !prev[runId] }));
  };

  const toggleLogs = (runId) => {
    setExpandedLogs(prev => ({ ...prev, [runId]: !prev[runId] }));
  };

  // Bug 4: Wrap clearChatHistory to also reset local expanded state
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

  // Helper to extract file modifications from agent logs
  const getModifiedFiles = (logs) => {
    if (!logs) return [];
    const filesMap = new Map(); // path -> type ('create' | 'update')
    
    logs.forEach(log => {
      const isCreate = log.startsWith('createFile:');
      const isUpdate = log.startsWith('updateFile:') || log.startsWith('patchFile:');
      
      const cleanLog = log.replace(/\\"/g, '"');
      
      if (isCreate) {
        try {
          const match = cleanLog.match(/"file"\s*:\s*"([^"]+)"/g);
          if (match) {
            match.forEach(m => {
              const file = m.match(/"file"\s*:\s*"([^"]+)"/)[1];
              if (file && !file.includes('todo.md')) {
                filesMap.set(file, 'create');
              }
            });
          }
        } catch (e) {
          const match = cleanLog.match(/"file"\s*:\s*"([^"]+)"/);
          if (match && match[1] && !match[1].includes('todo.md')) {
            filesMap.set(match[1], 'create');
          }
        }
      } else if (isUpdate) {
        try {
          const match = cleanLog.match(/"file"\s*:\s*"([^"]+)"/g) || cleanLog.match(/filePath:\s*"([^"]+)"/g) || cleanLog.match(/file:\s*"([^"]+)"/g);
          if (match) {
            match.forEach(m => {
              const fileMatch = m.match(/"file"\s*:\s*"([^"]+)"/) || m.match(/filePath:\s*"([^"]+)"/) || m.match(/file:\s*"([^"]+)"/);
              if (fileMatch && fileMatch[1] && !fileMatch[1].includes('todo.md')) {
                filesMap.set(fileMatch[1], 'update');
              }
            });
          }
        } catch (e) {
          const match = cleanLog.match(/"file"\s*:\s*"([^"]+)"/) || cleanLog.match(/filePath:\s*"([^"]+)"/) || cleanLog.match(/file:\s*"([^"]+)"/);
          if (match && match[1] && !match[1].includes('todo.md')) {
            filesMap.set(match[1], 'update');
          }
        }
      }
    });
    
    return Array.from(filesMap.entries()).map(([path, type]) => ({ path, type }));
  };

  // Helper to resolve high-level checklist steps from logs
  const getWorkflowPhases = (assistantMsg) => {
    if (!assistantMsg) return [];
    const logs = assistantMsg.toolLogs || [];
    const isRunning = assistantMsg.status === 'running';
    const isCompleted = assistantMsg.status === 'completed';
    const isError = assistantMsg.status === 'error';

    const hasCalled = (toolPrefix, matchStr = null) => {
      return logs.some(log => {
        const startsWithPrefix = log.toLowerCase().startsWith(toolPrefix.toLowerCase());
        if (matchStr) {
          return startsWithPrefix && log.toLowerCase().includes(matchStr.toLowerCase());
        }
        return startsWithPrefix;
      });
    };

    const phases = [
      {
        id: 'explore',
        name: 'Understand & Explore Workspace',
        description: 'Analyzing directory structure and package configs.',
        status: 'pending',
      },
      {
        id: 'plan',
        name: 'Draft Implementation Plan',
        description: 'Writing step-by-step todo list to todo.md.',
        status: 'pending',
      },
      {
        id: 'install',
        name: 'Install Dependencies',
        description: 'Adding npm packages if required.',
        status: 'pending',
        optional: true,
      },
      {
        id: 'build',
        name: 'Incremental Implementation',
        description: 'Creating/updating codebase components and styles.',
        status: 'pending',
      },
      {
        id: 'verify',
        name: 'Verify & Debug Compiler',
        description: 'Checking Vite output for runtime errors.',
        status: 'pending',
      },
      {
        id: 'cleanup',
        name: 'Finalize & Report',
        description: 'Cleaning up todo.md and completing the run.',
        status: 'pending',
      }
    ];

    // Phase 1: Explore
    if (hasCalled('listFiles') || hasCalled('readFile', 'package.json')) {
      const nextPhase = hasCalled('createFile', 'todo.md') || hasCalled('updateFile', 'todo.md') || hasCalled('createFile') || hasCalled('updateFile') || hasCalled('patchFile');
      phases[0].status = nextPhase ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (isRunning && logs.length === 0) {
      phases[0].status = 'running';
    } else if (logs.length > 0) {
      phases[0].status = 'completed';
    }

    // Phase 2: Plan
    const hasTodo = hasCalled('createFile', 'todo.md') || hasCalled('updateFile', 'todo.md') || hasCalled('patchFile', 'todo.md');
    if (hasTodo) {
      const buildStarted = logs.some(log => {
        return (log.startsWith('createFile') || log.startsWith('updateFile') || log.startsWith('patchFile')) && !log.includes('todo.md');
      });
      phases[1].status = buildStarted ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (phases[0].status === 'completed' && isRunning) {
      phases[1].status = 'running';
    } else if (isCompleted) {
      phases[1].status = 'completed';
    }

    // Phase 3: Install
    const hasInstall = hasCalled('executeCommand', 'npm install') || hasCalled('executeCommand', 'install');
    if (hasInstall) {
      const installDone = logs.some(log => log.includes('executeCommand: success') && (log.includes('npm install') || log.includes('install')));
      phases[2].status = installDone ? 'completed' : (isRunning ? 'running' : 'completed');
    } else {
      const buildStarted = logs.some(log => {
        return (log.startsWith('createFile') || log.startsWith('updateFile') || log.startsWith('patchFile')) && !log.includes('todo.md');
      });
      if (buildStarted || hasCalled('getViteRuntimeErrors') || isCompleted) {
        phases[2].status = 'completed'; // skipped automatically
      }
    }

    // Phase 4: Build
    const buildLogs = logs.filter(log => {
      return (log.startsWith('createFile') || log.startsWith('updateFile') || log.startsWith('patchFile')) && !log.includes('todo.md');
    });
    if (buildLogs.length > 0) {
      const verifyStarted = hasCalled('getViteRuntimeErrors');
      phases[3].status = verifyStarted ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (phases[1].status === 'completed' && isRunning) {
      phases[3].status = 'running';
    } else if (isCompleted) {
      phases[3].status = 'completed';
    }

    // Phase 5: Verify
    const verifyStarted = hasCalled('getViteRuntimeErrors');
    if (verifyStarted) {
      const cleanupStarted = isCompleted || logs.some(log => log.startsWith('executeCommand') && log.includes('rm todo.md'));
      phases[4].status = cleanupStarted ? 'completed' : (isRunning ? 'running' : 'completed');
    } else if (phases[3].status === 'completed' && isRunning) {
      phases[4].status = 'running';
    } else if (isCompleted) {
      phases[4].status = 'completed';
    }

    // Phase 6: Cleanup
    if (isCompleted) {
      phases[5].status = 'completed';
    } else if (phases[4].status === 'completed' && isRunning) {
      phases[5].status = 'running';
    }

    if (isError) {
      phases.forEach(p => {
        if (p.status === 'running') p.status = 'error';
      });
    }

    return phases;
  };

  // Helper to convert raw log to parsed timeline event
  const parseToolLogToEvent = (log, index) => {
    const isStart = log.includes(': start') || log.includes('attempt 1');
    const isSuccess = log.includes(': success') || log.includes('success -') || log.includes('patched successfully') || log.includes('success (on retry)');
    const isError = log.includes(': error') || log.includes('failed');

    let title = '';
    let description = '';
    let type = 'info';

    const cleanLog = log.replace(/\\"/g, '"');

    if (log.startsWith('listFiles')) {
      title = 'Scanning Directory';
      description = isStart ? 'Listing project workspace structure.' : (isSuccess ? 'Successfully mapped workspace structure.' : 'Failed to map workspace structure.');
      type = 'read';
    } else if (log.startsWith('readFile')) {
      title = 'Reading File';
      const fileMatch = cleanLog.match(/files:\s*\[\s*"([^"]+)"\s*\]/) || cleanLog.match(/files:\s*([^,\s]+)/);
      const files = fileMatch ? fileMatch[1] : 'workspace files';
      description = isStart ? `Reading file content: ${files}` : (isSuccess ? `Read content of ${files} successfully.` : `Failed to read file ${files}.`);
      type = 'read';
    } else if (log.startsWith('createFile')) {
      title = 'Creating File';
      const fileMatch = cleanLog.match(/"file"\s*:\s*"([^"]+)"/);
      const file = fileMatch ? fileMatch[1] : 'new file';
      description = isStart ? `Writing new file: ${file}` : (isSuccess ? `Successfully created ${file}.` : `Failed to create file ${file}.`);
      type = 'write';
    } else if (log.startsWith('updateFile')) {
      title = 'Updating File';
      const fileMatch = cleanLog.match(/"file"\s*:\s*"([^"]+)"/);
      const file = fileMatch ? fileMatch[1] : 'file';
      description = isStart ? `Rewriting file content: ${file}` : (isSuccess ? `Successfully updated ${file}.` : `Failed to update file ${file}.`);
      type = 'write';
    } else if (log.startsWith('patchFile')) {
      title = 'Patching File';
      const fileMatch = cleanLog.match(/file(?:Path)?":?\s*"([^"]+)"/i) || cleanLog.match(/filePath:\s*"([^"]+)"/i) || cleanLog.match(/file:\s*"([^"]+)"/i);
      const file = fileMatch ? fileMatch[1] : 'file';
      description = isStart 
        ? `Applying targeted edits to ${file}` 
        : (isSuccess ? `Patched ${file} successfully.` : `Failed to patch ${file}.`);
      type = 'write';
    } else if (log.startsWith('executeCommand')) {
      title = 'Running Command';
      const cmdMatch = cleanLog.match(/command:\s*"([^"]+)"/);
      const cmd = cmdMatch ? cmdMatch[1] : 'command';
      description = isStart ? `Executing shell command: "${cmd}"` : (isSuccess ? `Command execution complete.` : `Command failed to run.`);
      type = 'cmd';
    } else if (log.startsWith('getViteRuntimeErrors')) {
      title = 'Auditing Compiler';
      description = isStart ? 'Checking Vite runtime output for compilation errors.' : (isSuccess ? 'No runtime compiler errors detected.' : 'Checked compiler logs.');
      type = 'verify';
    } else {
      const parts = log.split(':');
      title = parts[0] || 'Agent Action';
      description = parts.slice(1).join(':').trim();
    }

    let status = 'pending';
    if (isSuccess) status = 'success';
    else if (isError) status = 'error';
    else if (isStart) status = 'running';

    return {
      title,
      description,
      type,
      status,
      timestamp: new Date().toLocaleTimeString(),
    };
  };

  // Helper to format inline bold (**text**) and code (`text`) inside markdown paragraphs
  const formatInline = (line) => {
    if (!line) return '';
    const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} style={{ color: '#fff', fontWeight: '700' }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={pIdx} style={{
            background: 'var(--bg-active)',
            border: '1px solid var(--border)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11.5px',
            color: 'var(--primary)',
          }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  // Custom markdown renderer
  const renderMarkdown = (text) => {
    if (!text) return null;
    
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const firstLine = lines[0].replace('```', '').trim();
        const code = lines.slice(1, -1).join('\n');
        
        return (
          <div key={index} style={{
            margin: '12px 0',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              backgroundColor: 'var(--bg-panel)',
              borderBottom: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              <span>{firstLine || 'code'}</span>
              <button
                onClick={() => copyToClipboard(code, index)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                }}
              >
                {copiedCodeIdx === index ? (
                  <>
                    <Check size={11} color="var(--success)" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: '12px',
              backgroundColor: 'var(--bg-main)',
              overflowX: 'auto',
              fontSize: '12px',
              lineHeight: '1.5',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-main)',
            }}>
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      const lines = part.split('\n');
      return lines.map((line, lIdx) => {
        const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
        if (isBullet) {
          const content = line.trim().substring(2);
          return (
            <li key={lIdx} style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px', marginLeft: '16px', lineHeight: '1.6' }}>
              {formatInline(content)}
            </li>
          );
        }

        if (line.startsWith('# ')) {
          return <h1 key={lIdx} style={{ fontSize: '18px', fontFamily: 'var(--font-heading)', margin: '16px 0 8px 0', color: '#fff', fontWeight: '700' }}>{line.substring(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={lIdx} style={{ fontSize: '15px', fontFamily: 'var(--font-heading)', margin: '14px 0 6px 0', color: '#fff', fontWeight: '600' }}>{line.substring(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={lIdx} style={{ fontSize: '13px', fontFamily: 'var(--font-heading)', margin: '12px 0 4px 0', color: '#fff', fontWeight: '600' }}>{line.substring(4)}</h3>;
        }

        return (
          <p key={lIdx} style={{
            fontSize: '13px',
            color: 'var(--text-main)',
            margin: '0 0 8px 0',
            lineHeight: '1.6',
            minHeight: line.trim() ? 'auto' : '8px',
          }}>
            {formatInline(line)}
          </p>
        );
      });
    });
  };

  const getRunStatusColor = (assistant) => {
    if (!assistant) return 'var(--text-dark)';
    if (assistant.status === 'running') return 'var(--primary)';
    if (assistant.status === 'completed') return 'var(--success)';
    if (assistant.status === 'error') return 'var(--error)';
    return 'var(--text-muted)';
  };

  return (
    // Bug 1: minHeight:0 on the root and scroll container is critical for flex scroll to work
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', backgroundColor: 'var(--bg-sidebar)' }}>
      {/* Redesigned Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: '38px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
        overflow: 'hidden',
      }}>
        {/* Model Selector dropdown */}
        {/* Bug 2: minWidth:0 prevents this from forcing the header to overflow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative', minWidth: 0, overflow: 'hidden' }}>
          <button
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-element)',
              maxWidth: '160px',
              overflow: 'hidden',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedModel.split(' ')[0]}</span>
            <ChevronDown size={10} color="var(--text-muted)" />
          </button>

          {isModelDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '28px',
              left: 0,
              backgroundColor: 'var(--bg-element)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 100,
              width: '190px',
              maxWidth: 'calc(100vw - 40px)',
              display: 'flex',
              flexDirection: 'column',
              padding: '4px',
            }}>
              {['Gemini 3.5 Flash (High)', 'Mistral Devstral (Default)', 'Claude 3.5 Sonnet'].map((model) => (
                <div
                  key={model}
                  onClick={() => {
                    setSelectedModel(model);
                    setIsModelDropdownOpen(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    color: selectedModel === model ? 'var(--primary)' : 'var(--text-muted)',
                    backgroundColor: selectedModel === model ? 'var(--bg-active)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedModel !== model) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedModel !== model) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {model}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workspace state stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {isStreaming ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(129, 140, 248, 0.08)',
              border: '1px solid rgba(129, 140, 248, 0.2)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              color: 'var(--primary)',
              fontWeight: '600',
            }}>
              <span className="spinner" style={{ width: '8px', height: '8px', borderWidth: '1px', borderTopColor: 'var(--primary)' }} />
              BUSY
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              color: 'var(--success)',
              fontWeight: '600',
            }}>
              <span style={{ width: '4px', height: '4px', backgroundColor: 'var(--success)', borderRadius: '50%' }} />
              READY
            </div>
          )}

          <button
            onClick={handleClearHistory}
            title="Clear Workspace History"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dark)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--error)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="chat-scroll-container"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {runs.length === 0 ? (
          /* Redesigned Welcome Panel */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '100%',
            padding: '16px 8px',
            animation: 'fadeIn 0.4s ease-out',
            flexShrink: 0,
          }}>
            <div style={{ textAlign: 'left', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  background: 'rgba(129, 140, 248, 0.1)',
                  padding: '6px',
                  borderRadius: '8px',
                  border: '1px solid rgba(129, 140, 248, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Cpu size={16} color="var(--primary)" />
                </div>
                <div>
                  <h2 style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: 'var(--text-main)' }}>Antigravity Coding Agent</h2>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>v1.0.0-orch</span>
                </div>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '8px 0 0 0', lineHeight: '1.5' }}>
                An autonomous development agent running on the Capstone orchestrator loop. Instruct the agent to inspect components, write code, run shell tasks, or debug compilation failures.
              </p>
            </div>

            {/* Quick-Start Coding Objectives matching user's templates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-dark)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Start Objectives
              </span>
              {[
                { 
                  category: "BUG FIX", 
                  color: "var(--error)", 
                  title: "Fix Terminal Input Lag & UI Bug", 
                  prompt: "Fix the styling and typing breakdown bug in the TerminalShell component where keyboard input gets interrupted and the cursor moves away." 
                },
                { 
                  category: "FEATURE", 
                  color: "var(--primary)", 
                  title: "Cache Editor Files locally", 
                  prompt: "Implement file caching in local storage when visiting the code editor, refetch data on editor navigation, update cache on file changes, and poll the backend every 5 minutes." 
                },
                { 
                  category: "DOCUMENTATION", 
                  color: "var(--warning)", 
                  title: "Document Agent Flow & Tools", 
                  prompt: "Add details about the recent architectural changes and agent tool configurations to flow.md." 
                }
              ].map((task, idx) => (
                <div
                  key={idx}
                  onClick={() => setInput(task.prompt)}
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow = '0 0 10px var(--border-glow)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ 
                      fontSize: '9px', 
                      fontWeight: '800', 
                      color: task.color, 
                      letterSpacing: '0.05em',
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      border: '1px solid var(--border)'
                    }}>
                      {task.category}
                    </span>
                    <ArrowRight size={10} color="var(--text-dark)" />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '3px' }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.prompt}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Redesigned Job Tickets (Task Runs List) */
          runs.map((run) => {
            const isWelcome = run.goal === null;
            const isExpanded = expandedRuns[run.id];
            const assistant = run.assistant;
            const phases = assistant ? getWorkflowPhases(assistant) : [];
            const modifiedFiles = assistant ? getModifiedFiles(assistant.toolLogs) : [];
            const parsedEvents = assistant ? assistant.toolLogs.map((log, lIdx) => parseToolLogToEvent(log, lIdx)) : [];

            return (
              <div 
                key={run.id}
                className={`task-run-card ${isExpanded ? 'expanded' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flexShrink: 0,
                }}
              >
                {/* Header of the Task Run (collapsible) */}
                <div 
                  onClick={() => toggleRun(run.id)}
                  className="task-run-card-header"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: isExpanded ? 'rgba(255,255,255,0.015)' : 'var(--bg-panel)',
                    borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    {/* Status Pill */}
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: getRunStatusColor(assistant),
                      flexShrink: 0,
                    }} />
                    
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: 'var(--text-main)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                    }}>
                      {isWelcome ? 'System Workspace Initialized' : `Task: ${run.goal}`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-dark)', fontFamily: 'var(--font-mono)' }}>
                      {run.timestamp ? new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    {isExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded Run Workspace View — Bug 2: minWidth:0 prevents text overflow */}
                {isExpanded && (
                  <div 
                    style={{ 
                      padding: '12px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px', 
                      minWidth: 0, 
                    }}
                  >
                    
                    {/* 1. Active Goal Description */}
                    {!isWelcome && (
                      <div style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-element)',
                        borderRadius: '6px',
                        borderLeft: '3px solid var(--primary)',
                        minWidth: 0,
                        overflow: 'hidden',
                      }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', display: 'block', marginBottom: '3px', letterSpacing: '0.02em' }}>
                          OBJECTIVE
                        </span>
                        <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-main)', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {run.goal}
                        </p>
                      </div>
                    )}

                    {/* 2. Stepper Checklist (Only for actual tasks) */}
                    {assistant && !isWelcome && (
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--text-dark)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                          Agent Execution Phases
                        </span>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          padding: '10px',
                          backgroundColor: 'var(--bg-main)',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                        }}>
                          {phases.map((phase) => {
                            const isRun = phase.status === 'running';
                            const isDone = phase.status === 'completed';
                            const isErr = phase.status === 'error';
                            
                            return (
                              <div key={phase.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isDone ? (
                                    <CheckCircle2 size={13} color="var(--success)" />
                                  ) : isRun ? (
                                    <Loader2 size={13} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
                                  ) : isErr ? (
                                    <AlertCircle size={13} color="var(--error)" />
                                  ) : (
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2.5px solid var(--border)', margin: '1.5px' }} />
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ 
                                    fontSize: '11.5px', 
                                    fontWeight: '600', 
                                    color: isRun ? 'var(--primary)' : (isDone ? 'var(--text-main)' : 'var(--text-dark)')
                                  }}>
                                    {phase.name}
                                  </div>
                                  {isRun && (
                                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px', lineHeight: '1.3' }}>
                                      {phase.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3. Workspace Changes Section */}
                    {modifiedFiles.length > 0 && (
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-dark)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                          Workspace Modifications ({modifiedFiles.length})
                        </span>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          minWidth: 0,
                        }}>
                          {modifiedFiles.map((file, fIdx) => (
                            <div 
                              key={fIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 8px',
                                backgroundColor: 'var(--bg-main)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <FileCode size={11} color="var(--primary)" />
                              <span style={{ color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{file.path.split('/').pop()}</span>
                              <span style={{ 
                                fontSize: '8px', 
                                fontWeight: '700', 
                                color: file.type === 'create' ? 'var(--success)' : 'var(--warning)',
                                background: 'rgba(255,255,255,0.02)',
                                padding: '1px 3px',
                                borderRadius: '2px',
                              }}>
                                {file.type === 'create' ? 'NEW' : 'UPDATED'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Collapsible Detailed Activity Log */}
                    {assistant && parsedEvents.length > 0 && (
                      <div>
                        <div 
                          onClick={() => toggleLogs(run.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: 'var(--primary)',
                            userSelect: 'none',
                            fontWeight: '600',
                          }}
                        >
                          {expandedLogs[run.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <Activity size={11} />
                          <span>Detailed Tool Invocations ({parsedEvents.length})</span>
                        </div>

                        {expandedLogs[run.id] && (
                          <div 
                            style={{
                              marginTop: '6px',
                              padding: '8px 10px',
                              backgroundColor: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            {parsedEvents.map((ev, evIdx) => {
                              const isEvRun = ev.status === 'running';
                              const isEvDone = ev.status === 'success';
                              const isEvErr = ev.status === 'error';
                              
                              return (
                                <div key={evIdx} style={{ display: 'flex', gap: '8px', fontSize: '10.5px' }}>
                                  <div style={{ marginTop: '2px' }}>
                                    {isEvDone ? (
                                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--success)' }} />
                                    ) : isEvRun ? (
                                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)', animation: 'pulse-p 1s infinite' }} />
                                    ) : isEvErr ? (
                                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--error)' }} />
                                    ) : (
                                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-dark)' }} />
                                    )}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{ev.title}</span>
                                      <span style={{ color: 'var(--text-dark)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{ev.timestamp}</span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px', marginTop: '1px' }}>
                                      {ev.description}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Agent Output Report */}
                    {assistant && (
                      <div 
                        style={{
                          padding: '10px 12px',
                          backgroundColor: 'rgba(14, 16, 23, 0.4)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ 
                          fontSize: '10px', 
                          color: 'var(--primary)', 
                          fontWeight: '700', 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.05em', 
                          display: 'block', 
                          marginBottom: '8px',
                          position: 'sticky',
                          top: '-10px',
                          backgroundColor: 'var(--bg-panel)',
                          zIndex: 1,
                          paddingTop: '10px',
                          paddingBottom: '6px',
                          margin: '-10px -12px 8px -12px',
                          paddingLeft: '12px',
                          paddingRight: '12px',
                          borderBottom: '1px solid rgba(255,255,255,0.03)'
                        }}>
                          Agent Report
                        </span>
                        
                        {assistant.text ? (
                          renderMarkdown(assistant.text)
                        ) : (
                          assistant.status === 'running' && !assistant.error && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '4px 0' }}>
                              <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
                              <span>Thinking & applying modifications...</span>
                            </div>
                          )
                        )}

                        {assistant.error && (
                          <div style={{
                            marginTop: '8px',
                            padding: '6px 10px',
                            backgroundColor: 'rgba(244, 63, 94, 0.05)',
                            border: '1px solid rgba(244, 63, 94, 0.15)',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: 'var(--error)',
                            fontWeight: '500',
                          }}>
                            Error: {assistant.error}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Streaming/connecting overlay */}
        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-muted)',
            fontSize: '12px',
            flexShrink: 0,
          }}>
            <Loader2 size={13} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Establishing orchestrator RPC stream...</span>
          </div>
        )}
        
        {/* Chat End Marker */}
      </div>

      {/* Input / Command Console — Bug 2: flexShrink:0 prevents the input from being squashed */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
        flexShrink: 0,
        minWidth: 0,
      }}>
        {status !== 'running' ? (
          <div style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--text-dark)',
            padding: '8px',
            backgroundColor: 'var(--bg-main)',
            borderRadius: '6px',
            border: '1px dashed var(--border)',
          }}>
            Launch the sandbox coding environment to interact with the agent.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', position: 'relative', minWidth: 0 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter instructions for the Coding Agent..."
              disabled={isStreaming}
              rows={2}
              className="chat-textarea"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="glow-hover"
              style={{
                position: 'absolute',
                right: '8px',
                bottom: '8px',
                background: input.trim() ? 'var(--primary)' : 'var(--bg-active)',
                border: 'none',
                color: input.trim() ? 'var(--bg-main)' : 'var(--text-dark)',
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (isStreaming || !input.trim()) ? 'not-allowed' : 'pointer',
                boxShadow: input.trim() ? '0 2px 8px var(--primary-glow)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <Send size={12} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
