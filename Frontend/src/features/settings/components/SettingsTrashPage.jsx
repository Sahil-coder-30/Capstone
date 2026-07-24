import React, { useState, useEffect } from 'react';
import { 
  Trash2, RotateCcw, Loader2, Folder, MessageSquare, AlertTriangle, 
  Code, Bot, User, Clock, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { 
  listTrashProjectsAPI, 
  restoreProjectAPI, 
  permanentlyDeleteProjectAPI,
  getTrashChatsAPI,
  restoreChatMessageAPI,
  permanentlyDeleteChatMessageAPI
} from '../../sandbox/service/sandbox.api';

export default function SettingsTrashPage({ onProjectRestored }) {
  const [activeTab, setActiveTab] = useState('projects'); // 'projects' | 'chats'
  const [trashProjects, setTrashProjects] = useState([]);
  const [trashChats, setTrashChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // id of item currently processing
  const [confirmModal, setConfirmModal] = useState(null); // { type: 'project'|'chat', id, title, agentType }

  const fetchTrashItems = async () => {
    setLoading(true);
    try {
      const [projRes, chatRes] = await Promise.allSettled([
        listTrashProjectsAPI(),
        getTrashChatsAPI()
      ]);

      if (projRes.status === 'fulfilled' && projRes.value?.projects) {
        setTrashProjects(projRes.value.projects);
      }
      if (chatRes.status === 'fulfilled' && chatRes.value?.trashMessages) {
        setTrashChats(chatRes.value.trashMessages);
      }
    } catch (err) {
      console.error('Failed to load trash items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrashItems();
  }, []);

  const handleRestoreProject = async (projectId) => {
    setActionLoading(`restore_proj_${projectId}`);
    try {
      await restoreProjectAPI(projectId);
      setTrashProjects(prev => prev.filter(p => p._id !== projectId));
      if (onProjectRestored) onProjectRestored();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to restore project');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDeleteProject = async (projectId) => {
    setActionLoading(`del_proj_${projectId}`);
    try {
      await permanentlyDeleteProjectAPI(projectId);
      setTrashProjects(prev => prev.filter(p => p._id !== projectId));
      setConfirmModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to permanently delete project');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreChat = async (messageId, agentType) => {
    setActionLoading(`restore_chat_${messageId}`);
    try {
      await restoreChatMessageAPI(messageId, agentType);
      setTrashChats(prev => prev.filter(c => (c._id || c.id) !== messageId));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to restore chat message');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDeleteChat = async (messageId, agentType) => {
    setActionLoading(`del_chat_${messageId}`);
    try {
      await permanentlyDeleteChatMessageAPI(messageId, agentType);
      setTrashChats(prev => prev.filter(c => (c._id || c.id) !== messageId));
      setConfirmModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete chat message');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Trash2 size={24} color="var(--primary)" />
          Trash & Recovery
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', margin: 0 }}>
          Manage soft-deleted projects and AI chat reports. Items can be restored back to active state or permanently deleted.
        </p>
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('projects')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px',
            border: 'none', backgroundColor: activeTab === 'projects' ? 'var(--bg-element)' : 'transparent',
            color: activeTab === 'projects' ? 'var(--text-primary)' : 'var(--text-dark)',
            fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <Folder size={14} color={activeTab === 'projects' ? 'var(--primary)' : 'currentColor'} />
          Deleted Projects ({trashProjects.length})
        </button>

        <button
          onClick={() => setActiveTab('chats')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px',
            border: 'none', backgroundColor: activeTab === 'chats' ? 'var(--bg-element)' : 'transparent',
            color: activeTab === 'chats' ? 'var(--text-primary)' : 'var(--text-dark)',
            fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <MessageSquare size={14} color={activeTab === 'chats' ? 'var(--primary)' : 'currentColor'} />
          Deleted Chats & Reports ({trashChats.length})
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px', color: 'var(--text-muted)' }}>
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
          <span>Loading items from trash…</span>
        </div>
      ) : activeTab === 'projects' ? (
        /* Deleted Projects View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trashProjects.length === 0 ? (
            <div style={{
              backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
              padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)'
            }}>
              <CheckCircle2 size={32} color="var(--success)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-primary)' }}>No deleted projects in trash</h3>
              <p style={{ margin: 0, fontSize: '12.5px' }}>Projects you soft-delete will appear here for recovery.</p>
            </div>
          ) : (
            trashProjects.map(project => (
              <div 
                key={project._id}
                style={{
                  backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
                  padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'var(--bg-element)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)'
                  }}>
                    <Code size={20} />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {project.title}
                    </h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Sandbox ID: {project.sandboxId?.substring(0, 8)}…</span>
                      <span>•</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> Deleted {project.deletedAt ? new Date(project.deletedAt).toLocaleDateString() : 'Recently'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => handleRestoreProject(project._id)}
                    disabled={actionLoading === `restore_proj_${project._id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid var(--primary)', backgroundColor: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary)',
                      fontWeight: '700', fontSize: '12.5px', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    {actionLoading === `restore_proj_${project._id}` ? (
                      <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                    ) : (
                      <RotateCcw size={13} />
                    )}
                    Restore
                  </button>

                  <button
                    onClick={() => setConfirmModal({ type: 'project', id: project._id, title: project.title })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid var(--border)', backgroundColor: 'transparent', color: '#ef4444',
                      fontWeight: '700', fontSize: '12.5px', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <Trash2 size={13} />
                    Delete Permanently
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Deleted Chats View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trashChats.length === 0 ? (
            <div style={{
              backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
              padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)'
            }}>
              <CheckCircle2 size={32} color="var(--success)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-primary)' }}>No deleted chats in trash</h3>
              <p style={{ margin: 0, fontSize: '12.5px' }}>Chat messages and generated reports soft-deleted from Taksha or Clio will appear here.</p>
            </div>
          ) : (
            trashChats.map(chat => {
              const msgId = chat._id || chat.id;
              const isAssistant = chat.role === 'assistant';
              const agentLabel = chat.agentType === 'copilot' ? 'Clio Copilot' : 'Taksha AI Agent';

              return (
                <div 
                  key={msgId}
                  style={{
                    backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
                    padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: '800', padding: '3px 8px', borderRadius: '4px',
                        backgroundColor: 'var(--bg-element)', color: 'var(--primary)', textTransform: 'uppercase'
                      }}>
                        {agentLabel}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>•</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Project: {chat.projectId || 'Workspace'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => handleRestoreChat(msgId, chat.agentType)}
                        disabled={actionLoading === `restore_chat_${msgId}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px',
                          border: '1px solid var(--primary)', backgroundColor: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary)',
                          fontWeight: '700', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        {actionLoading === `restore_chat_${msgId}` ? (
                          <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                        ) : (
                          <RotateCcw size={12} />
                        )}
                        Restore Chat
                      </button>

                      <button
                        onClick={() => setConfirmModal({ type: 'chat', id: msgId, title: 'Chat message / report', agentType: chat.agentType })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px',
                          border: '1px solid var(--border)', backgroundColor: 'transparent', color: '#ef4444',
                          fontWeight: '700', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div style={{
                    backgroundColor: 'var(--bg-canvas)', padding: '12px 14px', borderRadius: '8px',
                    fontSize: '13px', color: 'var(--text-primary)', border: '1px solid var(--border)',
                    maxHeight: '120px', overflowY: 'auto', lineHeight: 1.5, fontFamily: 'var(--font-sans)'
                  }}>
                    <strong style={{ color: isAssistant ? 'var(--primary)' : 'var(--text-dark)', marginRight: '6px' }}>
                      {isAssistant ? 'AI Report:' : 'User Prompt:'}
                    </strong>
                    {chat.content || chat.text || '(Empty content)'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Confirmation Modal for Permanent Delete */}
      {confirmModal && (
        <div 
          onClick={() => setConfirmModal(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px',
              padding: '28px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444'
              }}>
                <ShieldAlert size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                Confirm Permanent Delete
              </h3>
            </div>

            <p style={{ margin: '0 0 24px', fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>"{confirmModal.title}"</strong>? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                  backgroundColor: 'transparent', color: 'var(--text-dark)', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmModal.type === 'project') {
                    handlePermanentDeleteProject(confirmModal.id);
                  } else {
                    handlePermanentDeleteChat(confirmModal.id, confirmModal.agentType);
                  }
                }}
                disabled={Boolean(actionLoading)}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                {actionLoading ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Permanent Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
