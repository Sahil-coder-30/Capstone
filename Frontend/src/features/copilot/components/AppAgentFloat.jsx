import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import './AppAgentFloat.scss';

export default function AppAgentFloat({ projectId }) {
  const {
    isOpen,
    messages,
    isStreaming,
    sendMessage,
    closeCopilot,
    clearHistory,
  } = useCopilot(projectId);

  const { activeFile } = useEditor();

  const [input, setInput] = useState('');
  const [position, setPosition] = useState({ x: window.innerWidth - 440, y: 100 });
  const [size, setSize] = useState({ width: 380, height: 500 });
  const [isMinimized, setIsMinimized] = useState(false);

  const messagesEndRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, posX: 0, posY: 0 });
  const resizeRef = useRef({ isResizing: false, startWidth: 0, startHeight: 0, startX: 0, startY: 0, direction: '' });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  // ── Drag ──────────────────────────────────────────────────────────────────
  const handleDragStart = (e) => {
    if (e.target.closest('button') || e.target.closest('textarea')) return;
    dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, posX: position.x, posY: position.y };
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(10, Math.min(window.innerWidth - size.width - 10, dragRef.current.posX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - (isMinimized ? 50 : size.height) - 10, dragRef.current.posY + dy));
    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    dragRef.current.isDragging = false;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  // ── Resize ────────────────────────────────────────────────────────────────
  const handleResizeStart = (e, direction) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = { isResizing: true, startX: e.clientX, startY: e.clientY, startWidth: size.width, startHeight: size.height, direction };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!resizeRef.current.isResizing) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    let newWidth = size.width;
    let newHeight = size.height;
    if (resizeRef.current.direction.includes('e')) newWidth = Math.max(300, Math.min(800, resizeRef.current.startWidth + dx));
    if (resizeRef.current.direction.includes('s')) newHeight = Math.max(300, Math.min(800, resizeRef.current.startHeight + dy));
    setSize({ width: newWidth, height: newHeight });
  };

  const handleResizeEnd = () => {
    resizeRef.current.isResizing = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

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

  return (
    <div
      className={`app-agent-float ${isMinimized ? 'minimized' : ''}`}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: isMinimized ? 'auto' : `${size.height}px`,
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
          <button type="button" onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? 'Expand' : 'Minimize'}>
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
                    <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                  ) : msg.status === 'running' ? (
                    <div className="typing-indicator">
                      <span /><span /><span />
                    </div>
                  ) : null}
                </div>
                {msg.toolLogs && msg.toolLogs.length > 0 && (
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

          {/* Resize handles */}
          <div className="resize-handle r-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
          <div className="resize-handle r-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
          <div className="resize-handle r-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}
    </div>
  );
}
