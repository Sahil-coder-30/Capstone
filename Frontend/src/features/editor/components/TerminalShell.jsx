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

    const computedStyle = getComputedStyle(document.documentElement);
    const bgPanel = computedStyle.getPropertyValue('--bg-panel').trim() || '#131622';
    const textMain = computedStyle.getPropertyValue('--text-primary').trim() || '#FFFFFF';
    const brandPrimary = computedStyle.getPropertyValue('--brand-primary').trim() || '#10B981';
    const textDark = computedStyle.getPropertyValue('--text-dark').trim() || '#94A3B8';

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: bgPanel,
        foreground: textMain,
        cursor: brandPrimary,
        cursorAccent: bgPanel,
        selectionBackground: 'rgba(59, 130, 246, 0.2)',
        black:        '#0A0B0F',
        red:          '#EF4444',
        green:        brandPrimary,
        yellow:       '#F59E0B',
        blue:         '#3B82F6',
        magenta:      '#c084fc',
        cyan:         '#3DC5A1',
        white:        textMain,
        brightBlack:  textDark,
        brightGreen:  '#34D399',
        brightYellow: '#FDD598',
        brightBlue:   '#60A5FA',
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

    term.writeln('\x1b[1;35m⚡ CodeSpace Interactive Shell\x1b[0m');
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

    const themeObserver = new MutationObserver(() => {
      if (xtermInstance.current) {
        const style = getComputedStyle(document.documentElement);
        const bg = style.getPropertyValue('--bg-panel').trim();
        const fg = style.getPropertyValue('--text-primary').trim();
        const brand = style.getPropertyValue('--brand-primary').trim();
        const darkText = style.getPropertyValue('--text-dark').trim();
        xtermInstance.current.options.theme = {
          background: bg,
          foreground: fg,
          cursor: brand,
          cursorAccent: bg,
          selectionBackground: 'rgba(59, 130, 246, 0.2)',
          black: '#0A0B0F',
          red: '#EF4444',
          green: brand,
          yellow: '#F59E0B',
          blue: '#3B82F6',
          magenta: '#c084fc',
          cyan: '#3DC5A1',
          white: fg,
          brightBlack: darkText,
          brightGreen: '#34D399',
          brightYellow: '#FDD598',
          brightBlue: '#60A5FA',
        };
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      themeObserver.disconnect();
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
      overflow: 'hidden',
    }}>
      {/* Terminal Sub-Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '40px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
        userSelect: 'none',
        flexShrink: 0,
      }}>
        {/* Left: Terminal Shell label */}
        <div style={{
          fontSize: '12px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-main)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: '500'
        }}>
          <TerminalIcon size={14} color="var(--primary)" />
          <span>sh (Interactive Terminal)</span>
        </div>

        {/* Right: Reconnect and Status */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {status === 'running' && (
            <>
              {/* Reconnect button */}
              <button
                onClick={handleReconnect}
                title="Reconnect Terminal"
                style={{
                  background: 'none',
                  border: 'none',
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
                  e.currentTarget.style.backgroundColor = 'var(--bg-element)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                <RefreshCw size={13} />
              </button>

              {/* Status Indicator */}
              <div style={{
                fontSize: '10px',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--brand-subtle)',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
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
        backgroundColor: 'var(--bg-panel)',
        padding: '12px'
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
