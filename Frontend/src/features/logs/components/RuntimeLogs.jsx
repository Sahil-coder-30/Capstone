import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLogs } from '../Hooks/logs.hooks';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { RefreshCw, Play, AlertTriangle, ShieldAlert, Check } from 'lucide-react';

export default function RuntimeLogs() {
  const { sandboxId, status } = useSandbox();
  const { runtimeLogs, isLoading, error, fetchViteLogs, clearViteLogs } = useLogs();
  
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filterText, setFilterText] = useState('');
  const intervalRef = useRef(null);

  const handleRefresh = () => {
    if (sandboxId) {
      fetchViteLogs(sandboxId).catch(() => {});
    }
  };

  useEffect(() => {
    if (status === 'running' && sandboxId) {
      // First load
      handleRefresh();
    } else {
      clearViteLogs();
    }
  }, [sandboxId, status]);

  // Handle auto-refresh interval
  useEffect(() => {
    if (autoRefresh && status === 'running' && sandboxId) {
      intervalRef.current = setInterval(() => {
        handleRefresh();
      }, 5000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, sandboxId, status]);

  // Memoized — only re-computes when runtimeLogs or filterText change
  const filteredLogs = useMemo(() => {
    if (!runtimeLogs) return '';
    if (!filterText) return runtimeLogs;
    return runtimeLogs
      .split('\n')
      .filter(line => line.toLowerCase().includes(filterText.toLowerCase()))
      .join('\n');
  }, [runtimeLogs, filterText]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-panel)' }}>
      {/* Header toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '40px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={14} color="var(--warning)" />
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-main)' }}>
            Vite Runtime Logs & Errors
          </span>
        </div>

        {status === 'running' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Auto refresh checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{
                  cursor: 'pointer',
                  accentColor: 'var(--primary)',
                }}
              />
              Auto-poll (5s)
            </label>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              title="Refresh logs"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-element)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <RefreshCw size={14} className={isLoading ? 'spinner' : ''} />
            </button>
          </div>
        )}
      </div>

      {/* Filter search bar */}
      {status === 'running' && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-main)' }}>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs (e.g. error, warn, success)..."
            style={{
              width: '100%',
              background: 'var(--bg-element)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: 'var(--text-main)',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* Log output screen */}
      <div style={{ flex: 1, padding: '12px', overflow: 'auto', position: 'relative' }}>
        {status !== 'running' ? (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-panel)',
          }}>
            <ShieldAlert size={28} color="var(--text-dark)" />
            <span style={{ fontSize: '13px', color: 'var(--text-dark)', marginTop: '8px' }}>
              Launch the sandbox to fetch runtime pod errors
            </span>
          </div>
        ) : (
          <pre style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#cbd5e1',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {filteredLogs ? (
              filteredLogs
            ) : runtimeLogs ? (
              <span style={{ color: 'var(--text-dark)', fontStyle: 'italic' }}>No log lines matched the search filter</span>
            ) : (
              <span style={{ color: 'var(--text-dark)', fontStyle: 'italic' }}>No log streams fetched yet</span>
            )}
          </pre>
        )}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderTop: '1px solid rgba(239, 68, 68, 0.2)',
          fontSize: '11px',
          color: 'var(--error)',
        }}>
          Warning: {error}
        </div>
      )}
    </div>
  );
}
