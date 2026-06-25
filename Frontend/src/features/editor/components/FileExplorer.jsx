import React, { useState, useEffect } from 'react';
import { useEditor } from '../Hooks/editor.hooks';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { Folder, ChevronDown, ChevronRight, Plus, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import FileIcon from '../../../components/FileIcon';

export default function FileExplorer() {
  const { sandboxId, status } = useSandbox();
  const {
    files,
    activeFile,
    isLoading,
    error,
    fetchFilesList,
    fetchFileContent,
    createNewFile,
    deleteExistingFile,
    clearEditorError,
  } = useEditor();

  const [openDirs, setOpenDirs] = useState({});
  const [hoveredPath, setHoveredPath] = useState(null);

  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  useEffect(() => {
    if (status === 'running' && sandboxId) {
      fetchFilesList(sandboxId);
    }
  }, [sandboxId, status]);

  // Auto-expand parent directories of the active file
  useEffect(() => {
    if (!activeFile) return;
    const parts = activeFile.split('/');
    if (parts.length <= 1) return;

    const parents = {};
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = parts.slice(0, i + 1).join('/');
      parents[parentPath] = true;
    }

    setOpenDirs((prev) => ({
      ...prev,
      ...parents
    }));
  }, [activeFile]);

  const toggleDir = (dirPath) => {
    setOpenDirs((prev) => ({ ...prev, [dirPath]: !prev[dirPath] }));
  };

  const handleFileClick = (filePath) => {
    if (!sandboxId) return;
    fetchFileContent(sandboxId, filePath);
  };

  const handleCreateFile = async (e) => {
    e.preventDefault();
    if (!newFileName.trim() || !sandboxId) return;
    try {
      await createNewFile(sandboxId, newFileName.trim(), '');
      setNewFileName('');
      setShowNewFileInput(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Build tree from flat list of file paths
  const buildTree = (paths) => {
    const root = { name: 'root', isDir: true, children: {} };
    for (const path of paths) {
      if (!path) continue;
      const parts = path.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            isDir: !isLast,
            children: isLast ? null : {},
          };
        }
        current = current.children[part];
      }
    }

    const sortChildren = (children) =>
      Object.values(children).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

    return sortChildren(root.children);
  };

  const fileTree = buildTree(files);

  const renderTree = (nodes, depth = 0) => {
    return nodes.map((node) => {
      const isDir = node.isDir;
      const isOpen = openDirs[node.path] !== false && depth === 0 ? true : openDirs[node.path] || false;
      const isActive = activeFile === node.path;

      if (isDir) {
        const sortedChildren = node.children
          ? Object.values(node.children).sort((a, b) => {
              if (a.isDir && !b.isDir) return -1;
              if (!a.isDir && b.isDir) return 1;
              return a.name.localeCompare(b.name);
            })
          : [];

        return (
          <div key={node.path} style={{ position: 'relative' }}>
            <div
              onClick={() => toggleDir(node.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: `5px 8px 5px ${depth * 12 + 8}px`,
                cursor: 'pointer',
                fontSize: '12.5px',
                color: 'var(--text-main)',
                borderRadius: '4px',
                userSelect: 'none',
                gap: '6px',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-element)';
                setHoveredPath(node.path);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                setHoveredPath(null);
              }}
            >
              <span style={{ color: 'var(--text-dark)', display: 'flex' }}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <span style={{ color: 'var(--primary)', opacity: 0.8, display: 'flex' }}>
                <Folder size={13} fill="var(--primary)" style={{ opacity: 0.6 }} />
              </span>
              <span style={{ fontWeight: '500' }}>{node.name}</span>
              {hoveredPath === node.path && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete directory "${node.name}" and all its contents?`)) {
                      deleteExistingFile(sandboxId, node.path);
                    }
                  }}
                  title={`Delete Directory ${node.name}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    padding: '2px',
                    borderRadius: '3px',
                    display: 'flex',
                    marginLeft: 'auto',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            
            {/* Guide line for nested items */}
            {isOpen && sortedChildren.length > 0 && (
              <div style={{
                position: 'absolute',
                left: `${depth * 12 + 14}px`,
                top: '22px',
                bottom: '4px',
                width: '1px',
                backgroundColor: 'var(--border)',
                pointerEvents: 'none',
              }} />
            )}

            {isOpen && sortedChildren.length > 0 && renderTree(sortedChildren, depth + 1)}
          </div>
        );
      } else {
        return (
          <div
            key={node.path}
            onClick={() => handleFileClick(node.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: `5px 8px 5px ${depth * 12 + 20}px`,
              cursor: 'pointer',
              fontSize: '12.5px',
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              backgroundColor: isActive ? 'rgba(129, 140, 248, 0.08)' : 'transparent',
              borderLeft: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
              borderRadius: '0 4px 4px 0',
              gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-element)';
              setHoveredPath(node.path);
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              setHoveredPath(null);
            }}
          >
            <span style={{ color: isActive ? 'var(--primary)' : 'var(--text-dark)', display: 'flex', flexShrink: 0 }}>
              <FileIcon filename={node.name} size={13} />
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: isActive ? '600' : '400',
              }}
            >
              {node.name}
            </span>
            {hoveredPath === node.path && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to delete file "${node.name}"?`)) {
                    deleteExistingFile(sandboxId, node.path);
                  }
                }}
                title={`Delete File ${node.name}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--error)',
                  cursor: 'pointer',
                  padding: '2px',
                  borderRadius: '3px',
                  display: 'flex',
                  marginLeft: 'auto',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Explorer Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-dark)', letterSpacing: '0.05em' }}>
          Workspace Files
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => sandboxId && fetchFilesList(sandboxId)}
            disabled={status !== 'running' || isLoading}
            title="Refresh Files"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: status === 'running' ? 'pointer' : 'not-allowed',
              opacity: status === 'running' ? 1 : 0.4,
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
            onMouseEnter={(e) => status === 'running' && (e.currentTarget.style.backgroundColor = 'var(--bg-element)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={() => status === 'running' && setShowNewFileInput(!showNewFileInput)}
            disabled={status !== 'running'}
            title="Create File"
            style={{
              background: showNewFileInput ? 'var(--bg-active)' : 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: status === 'running' ? 'pointer' : 'not-allowed',
              opacity: status === 'running' ? 1 : 0.4,
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
            onMouseEnter={(e) => status === 'running' && (e.currentTarget.style.backgroundColor = 'var(--bg-element)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = showNewFileInput ? 'var(--bg-active)' : 'transparent')}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* New File Input */}
      {showNewFileInput && (
        <form
          onSubmit={handleCreateFile}
          style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px' }}
        >
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="src/components/Button.jsx"
            autoFocus
            onKeyDown={(e) => e.key === 'Escape' && setShowNewFileInput(false)}
            style={{
              flex: 1,
              background: 'var(--bg-element)',
              border: '1px solid var(--primary)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: 'var(--text-main)',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: 'var(--primary)',
              border: 'none',
              color: 'var(--bg-main)',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            Create
          </button>
        </form>
      )}

      {/* Tree Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {status !== 'running' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center' }}>
            <AlertCircle size={28} color="var(--text-dark)" />
            <span style={{ fontSize: '13px', color: 'var(--text-dark)', marginTop: '8px' }}>
              Launch a sandbox to explore workspace files
            </span>
          </div>
        ) : files.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center' }}>
            {isLoading ? (
              <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
            ) : (
              <span style={{ fontSize: '13px', color: 'var(--text-dark)' }}>No files found in workspace</span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {renderTree(fileTree)}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderTop: '1px solid rgba(239, 68, 68, 0.2)',
          fontSize: '12px',
          color: 'var(--error)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}>
          <span style={{ flex: 1, wordBreak: 'break-all' }}>{error}</span>
          <button
            onClick={clearEditorError}
            style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
