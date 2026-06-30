import React, { useState, useEffect } from 'react';
import { 
  User, CreditCard, Sliders, Shield, ArrowLeft, Terminal, Layers
} from 'lucide-react';
import { useSettings } from '../Hooks/settings.hooks';
import SettingsProfilePage from './SettingsProfilePage';
import SettingsBillingPage from './SettingsBillingPage';
import SettingsAppearancePage from './SettingsAppearancePage';
import SettingsSecurityPage from './SettingsSecurityPage';

export default function SettingsPage({ 
  user, 
  userName, 
  userInitials, 
  userPhoto, 
  projectsCount, 
  onSyncLimits, 
  onLogout,
  onBackToDashboard 
}) {
  const [activeSubTab, setActiveSubTab] = useState('profile');
  
  const { 
    profile, 
    preferences, 
    credit,
    apiKeys, 
    loadSettings, 
    loadCredit,
    updateProfile, 
    updatePreferences, 
    generateApiKey, 
    deleteApiKey 
  } = useSettings();

  // Load settings and credits on mount
  useEffect(() => {
    loadSettings();
    loadCredit();
  }, [loadSettings, loadCredit]);

  return (
    <div className="settings-layout" style={{ display: 'flex', width: '100%', height: '100vh', color: 'var(--text-primary)', backgroundColor: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      {/* 1. Settings Left Sidebar */}
      <aside style={{ 
        width: '260px', 
        borderRight: '1px solid var(--border)', 
        backgroundColor: 'var(--bg-surface)', 
        padding: '24px 16px', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between', 
        flexShrink: 0 
      }}>
        <div>
          {/* Back button */}
          <button 
            onClick={() => onBackToDashboard('playground')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', border: 'none',
              backgroundColor: 'rgba(255,255,255,0.02)', color: 'var(--text-dark)', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              marginBottom: '28px', width: '100%', transition: 'all 0.2s', border: '1px solid var(--border)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'var(--bg-element)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-dark)';
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
            }}
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>

          <h2 style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px 8px' }}>
            System Settings
          </h2>
          
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button 
              onClick={() => setActiveSubTab('profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none',
                backgroundColor: activeSubTab === 'profile' ? 'var(--bg-element)' : 'transparent',
                color: activeSubTab === 'profile' ? 'var(--text-primary)' : 'var(--text-dark)',
                fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s'
              }}
              onMouseEnter={e => { if (activeSubTab !== 'profile') e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (activeSubTab !== 'profile') e.currentTarget.style.color = 'var(--text-dark)'; }}
            >
              <User size={15} style={{ color: activeSubTab === 'profile' ? 'var(--primary)' : 'inherit' }} />
              Profile Account
            </button>
            
            <button 
              onClick={() => setActiveSubTab('editor')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none',
                backgroundColor: activeSubTab === 'editor' ? 'var(--bg-element)' : 'transparent',
                color: activeSubTab === 'editor' ? 'var(--text-primary)' : 'var(--text-dark)',
                fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s'
              }}
              onMouseEnter={e => { if (activeSubTab !== 'editor') e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (activeSubTab !== 'editor') e.currentTarget.style.color = 'var(--text-dark)'; }}
            >
              <Sliders size={15} style={{ color: activeSubTab === 'editor' ? 'var(--primary)' : 'inherit' }} />
              Editor & Copilot
            </button>
            
            <button 
              onClick={() => setActiveSubTab('limits')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none',
                backgroundColor: activeSubTab === 'limits' ? 'var(--bg-element)' : 'transparent',
                color: activeSubTab === 'limits' ? 'var(--text-primary)' : 'var(--text-dark)',
                fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s'
              }}
              onMouseEnter={e => { if (activeSubTab !== 'limits') e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (activeSubTab !== 'limits') e.currentTarget.style.color = 'var(--text-dark)'; }}
            >
              <CreditCard size={15} style={{ color: activeSubTab === 'limits' ? 'var(--primary)' : 'inherit' }} />
              Billing & Limits
            </button>
            
            <button 
              onClick={() => setActiveSubTab('security')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none',
                backgroundColor: activeSubTab === 'security' ? 'var(--bg-element)' : 'transparent',
                color: activeSubTab === 'security' ? 'var(--text-primary)' : 'var(--text-dark)',
                fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s'
              }}
              onMouseEnter={e => { if (activeSubTab !== 'security') e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (activeSubTab !== 'security') e.currentTarget.style.color = 'var(--text-dark)'; }}
            >
              <Shield size={15} style={{ color: activeSubTab === 'security' ? 'var(--primary)' : 'inherit' }} />
              API & Security
            </button>
          </nav>
        </div>

        {/* Navigation redirects back to dashboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button 
            onClick={() => onBackToDashboard('playground')}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none',
              backgroundColor: 'transparent', color: 'var(--text-dark)', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dark)'}
          >
            <Terminal size={14} style={{ marginRight: '2px' }} />
            Playground
          </button>
          <button 
            onClick={() => onBackToDashboard('my-apps')}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none',
              backgroundColor: 'transparent', color: 'var(--text-dark)', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dark)'}
          >
            <Layers size={14} style={{ marginRight: '2px' }} />
            My Apps
          </button>
        </div>
      </aside>

      {/* 2. Main content viewport */}
      <section style={{ flex: 1, padding: '48px 64px', overflowY: 'auto', backgroundColor: 'var(--bg-canvas)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Render sub-pages */}
          {activeSubTab === 'profile' && (
            <SettingsProfilePage 
              user={user}
              userName={userName}
              userInitials={userInitials}
              userPhoto={userPhoto}
              profile={profile}
              onUpdateProfile={updateProfile}
              onLogout={onLogout}
            />
          )}

          {activeSubTab === 'limits' && (
            <SettingsBillingPage 
              projectsCount={projectsCount}
              onSyncLimits={onSyncLimits}
              credit={credit}
              onRefreshCredit={loadCredit}
            />
          )}

          {activeSubTab === 'editor' && (
            <SettingsAppearancePage 
              preferences={preferences}
              onUpdatePreferences={updatePreferences}
            />
          )}

          {activeSubTab === 'security' && (
            <SettingsSecurityPage 
              apiKeys={apiKeys}
              onGenerateApiKey={generateApiKey}
              onDeleteApiKey={deleteApiKey}
              preferences={preferences}
              onUpdatePreferences={updatePreferences}
            />
          )}
        </div>
      </section>
    </div>
  );
}
