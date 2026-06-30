import { useState, useEffect, useRef, useCallback } from 'react';
import { useCopilot } from '../Hooks/copilot.hooks';
import { useEditor } from '../../editor/Hooks/editor.hooks';
import {
  X,
  Sparkles,
  Send,
  Maximize2,
  Minimize2,
  Trash2,
  FileText,
  AlertCircle,
  Code,
  Brain,
  ChevronDown,
} from 'lucide-react';
import { parseMarkdownToReact } from '../../../components/Markdown';
import './AppAgentFloat.scss';

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_W = 300;
const MAX_W = 900;
const MIN_H = 280;
const MAX_H = 900;
const EDGE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseThinkingAndResponse = (text) => {
  if (!text) return { thinking: '', response: '' };
  const thinkStart = text.indexOf('<think>');
  if (thinkStart === -1) return { thinking: '', response: text };
  const thinkEnd = text.indexOf('</think>', thinkStart);
  if (thinkEnd === -1) return { thinking: text.slice(thinkStart + 7), response: '' };
  return {
    thinking: text.slice(thinkStart + 7, thinkEnd),
    response: text.slice(thinkEnd + 8),
  };
};

// ─── ThinkingBlock ────────────────────────────────────────────────────────────
function ThinkingBlock({ text, isStreaming }) {
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => { if (isStreaming && text) setIsOpen(true); }, [isStreaming, text]);
  if (!text) return null;
  return (
    <div className={`copilot-thinking ${isStreaming ? 'streaming' : ''}`}>
      <button type="button" className="copilot-thinking-toggle" onClick={() => setIsOpen((o) => !o)}>
        <span className="copilot-thinking-status">
          <Brain className={`copilot-thinking-brain ${isStreaming ? 'pulse' : ''}`} size={14} />
          <span>{isStreaming ? 'Thinking…' : 'Thought process'}</span>
        </span>
        <ChevronDown className={`copilot-thinking-chevron ${isOpen ? 'open' : ''}`} size={13} />
      </button>
      {isOpen && <div className="copilot-thinking-details">{text}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AppAgentFloat({ projectId }) {
  const { activeFile } = useEditor();
  const fileClean = activeFile && activeFile !== 'none' ? activeFile.replace(/^\/+/, '') : '';
  const combinedId = fileClean ? `${projectId}:${fileClean}` : projectId;

  const { isOpen, messages, isStreaming, sendMessage, closeCopilot, clearHistory } = useCopilot(combinedId);

  const [input, setInput] = useState('');
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null);
  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  const [isMinimized, setIsMinimized] = useState(false);

  // All geometry lives here — zero React state changes per pixel during drag/resize
  const geoRef = useRef({
    x: window.innerWidth - 440,
    y: 100,
    width: 380,
    height: 500,
  });

  // Interaction state (null = idle)
  const dragRef   = useRef(null);
  const resizeRef = useRef(null);

  const containerRef   = useRef(null);
  const messagesEndRef = useRef(null);

  // Keep isMinimized readable inside stable callbacks without stale closure
  const isMinimizedRef = useRef(isMinimized);
  useEffect(() => { isMinimizedRef.current = isMinimized; }, [isMinimized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Apply geoRef → DOM (no React re-render needed)
  const applyGeometry = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { x, y, width, height } = geoRef.current;
    el.style.left   = `${x}px`;
    el.style.top    = `${y}px`;
    el.style.width  = `${width}px`;
    el.style.height = isMinimizedRef.current ? '' : `${height}px`;
  }, []);

  // Initial position on mount
  useEffect(() => { applyGeometry(); }, []); // eslint-disable-line

  // Re-apply when minimise toggles
  useEffect(() => { applyGeometry(); }, [isMinimized, applyGeometry]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDragMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { startX, startY, originX, originY } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const w  = geoRef.current.width;
    const h  = isMinimizedRef.current ? 48 : geoRef.current.height;
    geoRef.current.x = Math.max(EDGE, Math.min(window.innerWidth  - w - EDGE, originX + dx));
    geoRef.current.y = Math.max(EDGE, Math.min(window.innerHeight - h - EDGE, originY + dy));
    const el = containerRef.current;
    if (el) {
      el.style.left = `${geoRef.current.x}px`;
      el.style.top  = `${geoRef.current.y}px`;
    }
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragEnd);
    containerRef.current?.classList.remove('is-dragging');
  }, [onDragMove]);

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('textarea')) return;
    e.preventDefault();
    dragRef.current = {
      startX:  e.clientX,
      startY:  e.clientY,
      originX: geoRef.current.x,
      originY: geoRef.current.y,
    };
    containerRef.current?.classList.add('is-dragging');
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
  }, [onDragMove, onDragEnd]);

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResizeMove = useCallback((e) => {
    if (!resizeRef.current) return;
    const { startX, startY, originW, originH, originX, originY, dir } = resizeRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let { width, height, x, y } = geoRef.current;

    if (dir.includes('e')) {
      width = Math.max(MIN_W, Math.min(MAX_W, originW + dx));
    }
    if (dir.includes('w')) {
      const newW = Math.max(MIN_W, Math.min(MAX_W, originW - dx));
      x = originX + (originW - newW);
      width = newW;
    }
    if (dir.includes('s')) {
      height = Math.max(MIN_H, Math.min(MAX_H, originH + dy));
    }
    if (dir.includes('n')) {
      const newH = Math.max(MIN_H, Math.min(MAX_H, originH - dy));
      y = originY + (originH - newH);
      height = newH;
    }

    geoRef.current = { x, y, width, height };
    applyGeometry();
  }, [applyGeometry]);

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup',   onResizeEnd);
    containerRef.current?.classList.remove('is-resizing');
  }, [onResizeMove]);

  const handleResizeStart = useCallback((e, dir) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      startX:  e.clientX,
      startY:  e.clientY,
      originW: geoRef.current.width,
      originH: geoRef.current.height,
      originX: geoRef.current.x,
      originY: geoRef.current.y,
      dir,
    };
    containerRef.current?.classList.add('is-resizing');
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup',   onResizeEnd);
  }, [onResizeMove, onResizeEnd]);

  // Guaranteed cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup',   onDragEnd);
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup',   onResizeEnd);
    };
  }, [onDragMove, onDragEnd, onResizeMove, onResizeEnd]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const query = input;
    setInput('');
    sendMessage(query, activeFile);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`app-agent-float ${isMinimized ? 'minimized' : ''}`}
      style={{
        position: 'fixed',
        left:   `${geoRef.current.x}px`,
        top:    `${geoRef.current.y}px`,
        width:  `${geoRef.current.width}px`,
        height: isMinimized ? undefined : `${geoRef.current.height}px`,
        zIndex: 9999,
      }}
    >
      {/* Header */}
      <div className="app-agent-header" onMouseDown={handleDragStart}>
        <div className="header-title">
          <Sparkles size={14} className="glow-icon" />
          <span>Clio Co-Pilot</span>
        </div>
        <div className="header-controls">
          <button type="button" onClick={() => setIsMinimized((m) => !m)} title={isMinimized ? 'Expand' : 'Minimize'}>
            {isMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
          <button type="button" onClick={closeCopilot} title="Close Co-pilot">
            <X size={12} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Context bar */}
          <div className="context-bar">
            <FileText size={12} />
            <span className="context-label" title={activeFile || 'No file open'}>
              Active File: <strong>{activeFile ? activeFile.split('/').pop() : 'None'}</strong>
            </span>
            {!activeFile && (
              <span className="context-warning">
                <AlertCircle size={10} /> Open a file to context-sync
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="messages-container">
            {messages.map((msg, index) => (
              <div key={msg.id || index} className={`message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                <div className="message-content">
                  {msg.text ? (
                    msg.role === 'user' ? (
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.text}</p>
                    ) : (
                      (() => {
                        const { thinking, response } = parseThinkingAndResponse(msg.text);
                        return (
                          <>
                            <ThinkingBlock text={thinking} isStreaming={msg.status === 'running'} />
                            {response.trim() ? (
                              parseMarkdownToReact(response, { copiedCodeIdx, copyToClipboard })
                            ) : msg.status === 'running' && !thinking ? (
                              <div className="typing-indicator"><span /><span /><span /></div>
                            ) : null}
                          </>
                        );
                      })()
                    )
                  ) : msg.status === 'running' ? (
                    <div className="typing-indicator"><span /><span /><span /></div>
                  ) : null}
                </div>
                {msg.toolLogs?.length > 0 && (
                  <div className="tool-logs">
                    {msg.toolLogs.map((log, lIdx) => (
                      <div key={lIdx} className="tool-log-item">
                        <Code size={10} />
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer */}
          <form className="footer-form" onSubmit={handleSubmit}>
            <button type="button" className="clear-btn" onClick={clearHistory} title="Clear History">
              <Trash2 size={13} />
            </button>
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeFile ? `Ask about ${activeFile.split('/').pop()}…` : 'Open a file to start…'}
              disabled={isStreaming}
              rows={1}
            />
            <button type="submit" className="send-btn" disabled={!input.trim() || isStreaming}>
              <Send size={13} />
            </button>
          </form>

          {/* 8-direction resize handles */}
          <div className="resize-handle r-n"  onMouseDown={(e) => handleResizeStart(e, 'n')}  />
          <div className="resize-handle r-s"  onMouseDown={(e) => handleResizeStart(e, 's')}  />
          <div className="resize-handle r-e"  onMouseDown={(e) => handleResizeStart(e, 'e')}  />
          <div className="resize-handle r-w"  onMouseDown={(e) => handleResizeStart(e, 'w')}  />
          <div className="resize-handle r-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="resize-handle r-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <div className="resize-handle r-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
          <div className="resize-handle r-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
        </>
      )}
    </div>
  );
}
