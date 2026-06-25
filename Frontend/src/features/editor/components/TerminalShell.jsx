import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io } from 'socket.io-client';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { Terminal as TerminalIcon, AlertCircle, RefreshCw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export default function TerminalShell() {
  const { sandboxId, status } = useSandbox();

  // ─── Refs (never cause stale closures) ───────────────────────────────────
  const terminalRef    = useRef(null);   // DOM mount point
  const xtermInstance  = useRef(null);   // xterm Terminal instance
  const socketRef      = useRef(null);   // socket.io socket
  const fitAddonRef    = useRef(null);   // FitAddon instance

  /**
   * Keep a ref copy of sandboxId so every callback always reads the
   * CURRENT value without needing to be recreated via useCallback deps.
   * This is the canonical fix for stale-closure bugs with useCallback.
   */
  const sandboxIdRef = useRef(sandboxId);
  useEffect(() => {
    sandboxIdRef.current = sandboxId;
  }, [sandboxId]);

  // ─── Cleanup ─────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (xtermInstance.current) {
      xtermInstance.current.dispose();
      xtermInstance.current = null;
    }
    fitAddonRef.current = null;
  }, []); // stable — no deps needed

  // ─── Socket connection ────────────────────────────────────────────────────
  /**
   * Reads sandboxId from the ref (always current) instead of from the
   * closure — this means the function never needs to be re-created and
   * is always safe to call from any event handler or button click.
   *
   * Route: io('/', { path: '/api/terminal-proxy/socket.io' })
   *   Browser → localhost:5173/api/terminal-proxy/socket.io?sandboxId=…
   *   Vite proxy strips /api/terminal-proxy → /socket.io?sandboxId=…
   *   Routes to http://<sandboxId>.agent.localhost (same as agent REST API)
   */
  const connectSocket = useCallback((term) => {
    const id = sandboxIdRef.current;

    if (!id || id === 'undefined') {
      term.writeln('\x1b[1;31m✖ Cannot connect: sandbox ID is not available yet.\x1b[0m');
      return;
    }

    // Disconnect any existing socket before creating a new one
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io('/', {
      path: '/api/terminal-proxy/socket.io',
      query: { sandboxId: id },
      /**
       * Use socket.io's DEFAULT transport strategy:
       *   1. HTTP long-polling  — establishes the session (works through ANY proxy)
       *   2. WebSocket upgrade  — switches to WS once the session is confirmed
       *
       * ❌ transports: ['websocket'] — skips the polling handshake entirely.
       *    If the nginx ingress / router doesn't handle the WS upgrade on the
       *    very first request, socket.io throws "websocket error" with no fallback.
       *
       * ✅ Default (polling + upgrade) — polling always succeeds, then the
       *    upgrade to WS happens automatically once the proxies are confirmed
       *    to support it.
       */
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 2500,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      term.writeln('\x1b[1;32m✓ Connected to sandbox terminal\x1b[0m\r\n');
      term.focus();
      socket.emit('terminal-resize', { cols: term.cols, rows: term.rows });
    });

    socket.on('terminal-output', (data) => term.write(data));

    socket.on('disconnect', (reason) => {
      term.writeln(`\r\n\x1b[1;33m⚠ Disconnected (${reason})\x1b[0m`);
    });

    socket.on('connect_error', (err) => {
      term.writeln(`\r\n\x1b[1;31m✖ Connection error: ${err.message}\x1b[0m`);
    });

    socket.on('reconnect', () => {
      term.writeln('\x1b[1;32m↻ Reconnected\x1b[0m\r\n');
    });

    term.onData((data) => {
      if (socket.connected) socket.emit('terminal-input', data);
    });

    term.onResize(({ cols, rows }) => {
      if (socket.connected) socket.emit('terminal-resize', { cols, rows });
    });
  }, []); // ← stable: reads sandboxId via ref, never re-created

  // ─── Mount / unmount terminal ─────────────────────────────────────────────
  useEffect(() => {
    const id = sandboxIdRef.current;

    if (status !== 'running' || !id || id === 'undefined' || !terminalRef.current) {
      cleanup();
      return;
    }

    // Terminal already exists for this sandbox — nothing to do
    if (xtermInstance.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#0e1017', // Match var(--bg-panel)
        foreground: '#f8fafc', // Match var(--text-main)
        cursor: '#818cf8',     // Match var(--primary)
        cursorAccent: '#0e1017',
        selectionBackground: 'rgba(129, 140, 248, 0.15)',
        black:        '#06070a',
        red:          '#f43f5e',
        green:        '#10b981',
        yellow:       '#fbbf24',
        blue:         '#60a5fa',
        magenta:      '#c084fc',
        cyan:         '#22d3ee',
        white:        '#f8fafc',
        brightBlack:  '#222533',
        brightGreen:  '#34d399',
        brightYellow: '#fde68a',
        brightBlue:   '#93c5fd',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    setTimeout(() => {
      if (terminalRef.current) {
        const { clientWidth, clientHeight } = terminalRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          fitAddon.fit();
        }
      }
    }, 50);

    xtermInstance.current = term;
    fitAddonRef.current   = fitAddon;

    term.writeln('\x1b[1;35m⚡ Antigravity Interactive Shell\x1b[0m');
    term.writeln('Connecting to sandbox container...\r\n');

    connectSocket(term);

    const handleResize = () => {
      if (!terminalRef.current) return;
      const { clientWidth, clientHeight } = terminalRef.current;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      try {
        fitAddon.fit();
      } catch (err) {
        console.warn('Fit error:', err);
      }
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      cleanup();
    };
  }, [sandboxId, status, cleanup, connectSocket]);
  //          ↑ sandboxId here re-triggers if the sandbox changes,
  //            but connectSocket/cleanup are stable so no extra runs

  // ─── Manual reconnect button ──────────────────────────────────────────────
  const handleReconnect = useCallback(() => {
    const term = xtermInstance.current;
    if (!term) return;
    term.writeln('\r\n\x1b[1;33m↻ Reconnecting...\x1b[0m');
    connectSocket(term); // always uses current sandboxId via ref
  }, [connectSocket]); // connectSocket is stable, so this is too

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
    }}>
      {/* Terminal Window Header (macOS style) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#111113',
        borderBottom: '1px solid var(--border)',
        userSelect: 'none',
        flexShrink: 0,
      }}>
        {/* macOS Style Window dots */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
        </div>

        {/* Central Terminal Info */}
        <div style={{
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <TerminalIcon size={12} color="var(--text-dark)" />
          <span>sh — terminal-session</span>
        </div>

        {/* Reconnect / Status */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status === 'running' && (
            <>
              <button
                onClick={handleReconnect}
                title="Reconnect Terminal"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-active)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                <RefreshCw size={11} />
              </button>
              <div style={{
                fontSize: '10px',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(16, 185, 129, 0.06)',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                fontWeight: '500',
              }}>
                <span style={{
                  width: '5px',
                  height: '5px',
                  backgroundColor: 'var(--success)',
                  borderRadius: '50%',
                  boxShadow: '0 0 6px var(--success)'
                }} />
                <span>online</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Terminal Viewport */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#0c0c0e',
        padding: '10px 12px'
      }}>
        {status !== 'running' ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '24px', textAlign: 'center',
            backgroundColor: 'var(--bg-panel)',
          }}>
            <AlertCircle size={28} color="var(--text-dark)" />
            <span style={{ fontSize: '13px', color: 'var(--text-dark)', marginTop: '8px' }}>
              Launch a sandbox to open an interactive terminal
            </span>
          </div>
        ) : (
          <div ref={terminalRef} style={{ height: '100%', width: '100%' }} />
        )}
      </div>
    </div>
  );
}
