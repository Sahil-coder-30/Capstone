import React, { useEffect, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useEditor } from '../Hooks/editor.hooks';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useCopilot } from '../../copilot/Hooks/copilot.hooks';
import { 
  Save, 
  RefreshCw, 
  Code, 
  Check, 
  X, 
  ChevronRight, 
  Sparkles, 
  AlignLeft, 
  Eye, 
  ZoomIn, 
  ZoomOut,
  Settings,
  HelpCircle,
  Cloud
} from 'lucide-react';
import FileIcon from '../../../components/FileIcon';

function getLanguage(filename) {
  if (!filename) return 'javascript';
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    html: 'html', css: 'css', scss: 'scss',
    json: 'json', md: 'markdown',
    yml: 'yaml', yaml: 'yaml',
    sh: 'shell', dockerfile: 'dockerfile',
    py: 'python', go: 'go', rs: 'rust',
  };
  const bare = filename.split('/').pop().toLowerCase();
  if (bare === 'dockerfile') return 'dockerfile';
  return map[ext] || 'plaintext';
}

export default function CodeEditor() {
  const { sandboxId } = useSandbox();
  const {
    activeFile,
    activeFileContent,
    isLoading,
    isSaving,
    isSyncing,
    lastSyncTime,
    isModified,
    openTabs,
    autosaveEnabled,
    editorSettings,
    getFileModifiedStatus,
    fetchFileContent,
    saveFileContent,
    updateEditorContent,
    selectActiveFile,
    closeFileTab,
    toggleAutosave,
    updateSettings,
  } = useEditor();

  const { isOpen: isAppAgentOpen, toggleCopilot: toggleAppAgent } = useCopilot();

  const [justSaved, setJustSaved] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [relativeSyncTime, setRelativeSyncTime] = useState('');

  useEffect(() => {
    if (!lastSyncTime) {
      setRelativeSyncTime('');
      return;
    }

    const updateTime = () => {
      const diffMs = Date.now() - lastSyncTime;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);

      if (diffSec < 15) {
        setRelativeSyncTime('just now');
      } else if (diffSec < 60) {
        setRelativeSyncTime(`${diffSec}s ago`);
      } else {
        setRelativeSyncTime(`${diffMin}m ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 10000); // update every 10s
    return () => clearInterval(interval);
  }, [lastSyncTime]);
  
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const settingsMenuRef = useRef(null);

  // Stable save handler via ref so Monaco's keybind never captures a stale closure
  const saveHandlerRef = useRef(null);
  saveHandlerRef.current = async (fileToSave = null) => {
    const targetFile = fileToSave || activeFile;
    if (!sandboxId || !targetFile) return;
    try {
      const success = await saveFileContent(sandboxId, targetFile);
      if (success && targetFile === activeFile) {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  // Debounced Autosave Effect
  useEffect(() => {
    if (!autosaveEnabled || !isModified || !activeFile || !sandboxId) return;

    const timer = setTimeout(() => {
      saveHandlerRef.current?.(activeFile);
    }, 2000); // 2-second debounce

    return () => clearTimeout(timer);
  }, [activeFileContent, activeFile, autosaveEnabled, isModified, sandboxId]);

  const handleEditorWillMount = (monaco) => {
    monaco.editor.defineTheme('codespace-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6E7781', fontStyle: 'italic' },
        { token: 'string', foreground: '116329' },
        { token: 'keyword', foreground: 'CF222E', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: 'CF222E', fontStyle: 'bold' },
        { token: 'number', foreground: '0550AE' },
        { token: 'type', foreground: '953800' },
        { token: 'function', foreground: '6639BA' },
        { token: 'identifier', foreground: '1A1A1E' },
        { token: 'delimiter', foreground: '57606A' },
        { token: 'operator', foreground: '1A1A1E' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1A1A1E',
        'editor.lineHighlightBackground': '#F4F4F6',
        'editor.selectionBackground': '#0969DA29',
        'editor.findMatchHighlightBackground': '#9A670025',
        'editorLineNumber.foreground': '#6E7781',
        'editorLineNumber.activeForeground': '#1A1A1E',
        'editorCursor.foreground': '#4F46E5',
        'editorGutter.background': '#FFFFFF',
        'editorIndentGuide.background': '#E4E4E7',
        'editorIndentGuide.activeBackground': '#8C8C94'
      }
    });
  };

  const [editorTheme, setEditorTheme] = useState(
    document.documentElement.classList.contains('light-theme') ? 'codespace-light' : 'vs-dark'
  );

  useEffect(() => {
    const updateTheme = () => {
      const isLight = document.documentElement.classList.contains('light-theme');
      setEditorTheme(isLight ? 'codespace-light' : 'vs-dark');
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Click outside listener to close settings menu
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReload = useCallback(() => {
    if (!sandboxId || !activeFile) return;
    fetchFileContent(sandboxId, activeFile, true);
  }, [sandboxId, activeFile, fetchFileContent]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Cmd+S / Ctrl+S
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveHandlerRef.current?.();
    });
  };

  const handleFormat = () => {
    if (editorRef.current) {
      editorRef.current.trigger('editor-format', 'editor.action.formatDocument');
    }
  };

  if (!activeFile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '32px',
        textAlign: 'center',
        backgroundColor: 'var(--bg-panel)',
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.01)',
          padding: '24px',
          borderRadius: '50%',
          border: '1px solid var(--border)',
          marginBottom: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        }}>
          <Code size={40} color="var(--text-dark)" />
        </div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', margin: '0 0 8px 0', color: 'var(--text-main)', fontWeight: '600' }}>
          No File Open
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px', lineHeight: '1.6', margin: 0 }}>
          Select a file from the explorer, or ask the AI assistant to create and open one for you.
        </p>
      </div>
    );
  }

  // Parse path to render breadcrumbs
  const pathParts = activeFile.split('/');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-panel)' }}>
      {/* Premium Tab Bar */}
      <div className="editor-tabs-container">
        {openTabs.map((tabFile) => {
          const isActive = tabFile === activeFile;
          const isTabModified = getFileModifiedStatus(tabFile);
          const parts = tabFile.split('/');
          const filename = parts[parts.length - 1];

          return (
            <div
              key={tabFile}
              className={`editor-tab ${isActive ? 'active' : ''}`}
              onClick={() => selectActiveFile(tabFile)}
              title={tabFile}
            >
              <FileIcon filename={tabFile} size={14} style={{ flexShrink: 0 }} />
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: isActive ? '500' : '400',
              }}>
                {filename}
              </span>
              
              {/* Unsaved indicator or Close button */}
              {isTabModified ? (
                <span style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#fbbf24',
                  borderRadius: '50%',
                  flexShrink: 0,
                  margin: '0 4px',
                }} />
              ) : null}
              
              <button
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFileTab(tabFile);
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Editor Header Bar (Toolbar & Breadcrumbs) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '42px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
        flexShrink: 0,
      }}>
        {/* Left: Breadcrumbs path */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
          {pathParts.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 && <ChevronRight size={11} color="var(--text-dark)" style={{ flexShrink: 0 }} />}
              <span style={{
                fontSize: '12px',
                color: index === pathParts.length - 1 ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: index === pathParts.length - 1 ? '500' : '400',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {part}
              </span>
            </React.Fragment>
          ))}
          {isModified && (
            <span
              title="Unsaved changes"
              style={{
                width: '7px',
                height: '7px',
                backgroundColor: '#fbbf24',
                borderRadius: '50%',
                flexShrink: 0,
                marginLeft: '8px',
              }}
            />
          )}
        </div>

        {/* Right: Controls toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Cache Sync Status Indicator */}
          {lastSyncTime && (
            <div 
              title={isSyncing ? "Syncing files with container..." : `Last synced with container: ${new Date(lastSyncTime).toLocaleTimeString()}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: isSyncing ? 'rgba(99, 102, 241, 0.08)' : 'rgba(234, 88, 12, 0.08)',
                border: `1px solid ${isSyncing ? 'rgba(99, 102, 241, 0.15)' : 'rgba(234, 88, 12, 0.15)'}`,
                color: isSyncing ? 'var(--primary)' : 'var(--success)',
                fontSize: '11px',
                fontWeight: '500',
                transition: 'all 0.3s ease',
                marginRight: '6px',
              }}
            >
              <Cloud 
                size={12} 
                style={{ 
                  animation: isSyncing ? 'pulse-p 1.5s ease-in-out infinite' : 'none',
                }} 
              />
              <span>{isSyncing ? 'Syncing...' : `Synced ${relativeSyncTime}`}</span>
            </div>
          )}

          {/* Status Display */}
          <span style={{ fontSize: '11px', color: 'var(--text-dark)', fontFamily: 'var(--font-sans)', marginRight: '4px' }}>
            {isSaving ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> Saving...
              </span>
            ) : justSaved ? (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={11} /> Saved
              </span>
            ) : autosaveEnabled ? (
              <span style={{ opacity: 0.6 }}>Autosave on</span>
            ) : null}
          </span>

          {/* Action buttons */}
          <button
            onClick={handleFormat}
            title="Format Code"
            className="editor-toolbar-btn"
          >
            <AlignLeft size={14} />
          </button>

          <button
            onClick={toggleAppAgent}
            title="Ask App Agent (Clio)"
            className={`editor-toolbar-btn ${isAppAgentOpen ? 'active' : ''}`}
            style={{ color: isAppAgentOpen ? 'var(--primary)' : 'inherit' }}
          >
            <Sparkles size={14} />
          </button>

          <button
            onClick={handleReload}
            disabled={isLoading || isSaving}
            title="Reload from sandbox"
            className="editor-toolbar-btn"
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          <button
            onClick={() => saveHandlerRef.current?.()}
            disabled={!isModified || isSaving}
            style={{
              background: isModified ? 'var(--primary)' : 'var(--bg-element)',
              border: '1px solid var(--border)',
              color: isModified ? 'var(--bg-main)' : 'var(--text-dark)',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: isModified ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isModified ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <Save size={12} />
            Save
          </button>

          <div style={{ height: '16px', width: '1px', backgroundColor: 'var(--border)', margin: '0 4px' }} />

          {/* Settings trigger */}
          <div style={{ position: 'relative' }} ref={settingsMenuRef}>
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Editor Settings"
              className={`editor-toolbar-btn ${showSettingsMenu ? 'active' : ''}`}
            >
              <Settings size={14} />
            </button>

            {showSettingsMenu && (
              <div style={{
                position: 'absolute',
                top: '32px',
                right: 0,
                width: '200px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                zIndex: 100,
              }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                  Editor Settings
                </div>
                
                {/* Autosave toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Autosave</span>
                  <label className="editor-switch">
                    <input 
                      type="checkbox" 
                      checked={autosaveEnabled} 
                      onChange={(e) => toggleAutosave(e.target.checked)} 
                    />
                    <span className="editor-slider" />
                  </label>
                </div>

                {/* Minimap toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Minimap</span>
                  <button 
                    onClick={() => updateSettings({ minimap: !editorSettings.minimap })}
                    className={`editor-toolbar-btn ${editorSettings.minimap ? 'active' : ''}`}
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    {editorSettings.minimap ? 'Shown' : 'Hidden'}
                  </button>
                </div>

                {/* Word Wrap toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Word Wrap</span>
                  <button 
                    onClick={() => updateSettings({ wordWrap: !editorSettings.wordWrap })}
                    className={`editor-toolbar-btn ${editorSettings.wordWrap ? 'active' : ''}`}
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    {editorSettings.wordWrap ? 'Wrap' : 'Truncate'}
                  </button>
                </div>

                {/* Font Size controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Font Size ({editorSettings.fontSize}px)</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => updateSettings({ fontSize: Math.max(10, editorSettings.fontSize - 1.5) })}
                      className="editor-toolbar-btn"
                      style={{ padding: '3px' }}
                    >
                      <ZoomOut size={12} />
                    </button>
                    <button 
                      onClick={() => updateSettings({ fontSize: Math.min(24, editorSettings.fontSize + 1.5) })}
                      className="editor-toolbar-btn"
                      style={{ padding: '3px' }}
                    >
                      <ZoomIn size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'var(--bg-panel)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
            backdropFilter: 'blur(4px)',
            opacity: 0.9,
          }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
          </div>
        )}
        <Editor
          height="100%"
          language={getLanguage(activeFile)}
          theme={editorTheme}
          value={activeFileContent}
          onChange={(val) => updateEditorContent(val ?? '')}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: editorSettings.minimap },
            fontSize: editorSettings.fontSize,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'gutter',
            wordWrap: editorSettings.wordWrap ? 'on' : 'off',
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
            lineNumbersMinChars: 3,
            padding: { top: 12 },
          }}
        />
      </div>
    </div>
  );
}
