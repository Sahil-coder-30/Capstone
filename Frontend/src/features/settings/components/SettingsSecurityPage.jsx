import React, { useState, useEffect } from 'react';
import { Key, Copy, Plus, Trash2, Mail, ShieldAlert, ToggleLeft, ToggleRight, Check } from 'lucide-react';

export default function SettingsSecurityPage({ 
  apiKeys = [], 
  onGenerateApiKey, 
  onDeleteApiKey,
  preferences,
  onUpdatePreferences
}) {
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  const [emailLogins, setEmailLogins] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  // Sync state with preferences
  useEffect(() => {
    if (preferences && preferences.notifications) {
      if (preferences.notifications.emailLogins !== undefined) {
        setEmailLogins(preferences.notifications.emailLogins);
      }
      if (preferences.notifications.securityAlerts !== undefined) {
        setSecurityAlerts(preferences.notifications.securityAlerts);
      }
    }
  }, [preferences]);

  const handleAddApiKey = (e) => {
    e.preventDefault();
    if (!newKeyName) return;
    onGenerateApiKey(newKeyName)
      .then(() => {
        alert('API key successfully generated.');
        setNewKeyName('');
      })
      .catch((err) => alert(err || 'Failed to generate key.'));
  };

  const handleDeleteKey = (id) => {
    if (confirm('Are you sure you want to delete this API key? This will immediately revoke all access.')) {
      onDeleteApiKey(id)
        .then(() => alert('API key successfully deleted.'))
        .catch((err) => alert(err || 'Failed to delete key.'));
    }
  };

  const handleCopyKey = (keyText, id) => {
    navigator.clipboard.writeText(keyText)
      .then(() => {
        setCopiedKeyId(id);
        setTimeout(() => setCopiedKeyId(null), 2000);
      });
  };

  const handleNotificationChange = (key, val) => {
    if (key === 'emailLogins') setEmailLogins(val);
    if (key === 'securityAlerts') setSecurityAlerts(val);

    onUpdatePreferences({
      ...preferences,
      notifications: {
        ...preferences?.notifications,
        [key]: val
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: 'var(--font-sans)', paddingBottom: '32px' }}>
      
      {/* 1. API Keys Management Card */}
      <div style={{ 
        background: 'var(--bg-surface)', 
        padding: '28px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          Workspace API Access Keys
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark)', margin: 0, lineHeight: '1.6' }}>
          Use these API keys to authenticate command integrations and programmatically sync codespace sandbox containers with CLI engines.
        </p>

        {/* API Key list table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {apiKeys.length === 0 ? (
            <div style={{ 
              background: 'var(--bg-canvas)', border: '1px dashed var(--border)', 
              padding: '28px', borderRadius: '10px', textAlign: 'center', color: 'var(--text-dark)', fontSize: '13px' 
            }}>
              No active API keys found. Generate one below to get started.
            </div>
          ) : (
            apiKeys.map(key => (
              <div key={key.id} style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                background: 'var(--bg-canvas)', padding: '14px 18px', borderRadius: '10px', 
                border: '1px solid var(--border)', gap: '16px', flexWrap: 'wrap'
              }}>
                <div>
                  <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{key.name}</h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-dark)', marginTop: '2px', display: 'block' }}>Created: {key.created}</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                  <code style={{ 
                    fontSize: '12.5px', color: 'var(--primary)', backgroundColor: 'var(--brand-subtle)', 
                    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' 
                  }}>
                    {key.prefix}
                  </code>
                  <button 
                    onClick={() => handleCopyKey(key.prefix, key.id)} 
                    className="icon-btn" 
                    title="Copy Key" 
                    style={{ padding: '8px', position: 'relative' }}
                  >
                    {copiedKeyId === key.id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  </button>
                  <button 
                    onClick={() => handleDeleteKey(key.id)} 
                    className="icon-btn" 
                    title="Delete Key" 
                    style={{ padding: '8px', color: 'var(--error)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Generate New Key Form */}
        <form onSubmit={handleAddApiKey} style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '8px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="API Key Name (e.g. CI pipeline secret)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            style={{ 
              flex: '1 1 280px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', 
              backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s' 
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', padding: '10px 20px' }}>
            <Plus size={14} /> Generate API Key
          </button>
        </form>
      </div>

      {/* 2. Security Notification Preferences Card */}
      <div style={{ 
        background: 'var(--bg-surface)', 
        padding: '28px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <Mail size={16} color="var(--primary)" /> Security Notification Settings
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email Logins Alert */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Email Login Alerts</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Receive email logs on successful login activities.</p>
            </div>
            <button 
              onClick={() => handleNotificationChange('emailLogins', !emailLogins)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {emailLogins ? <ToggleRight size={38} color="var(--primary)" /> : <ToggleLeft size={38} color="var(--text-dark)" />}
            </button>
          </div>

          {/* Security Alerts */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Critical Security Alerts</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Receive alerts on password updates, key revocation, and system changes.</p>
            </div>
            <button 
              onClick={() => handleNotificationChange('securityAlerts', !securityAlerts)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {securityAlerts ? <ToggleRight size={38} color="var(--primary)" /> : <ToggleLeft size={38} color="var(--text-dark)" />}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Secrets Environment Variables Card */}
      <div style={{ 
        background: 'var(--bg-surface)', 
        padding: '28px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={16} color="var(--primary)" /> System Environment Secrets
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark)', margin: 0, lineHeight: '1.6' }}>
          Environment variables configured here are automatically injected into all running sandbox terminals when provisioned.
        </p>
        <div style={{ background: 'var(--bg-canvas)', border: '1px dashed var(--border)', padding: '28px', borderRadius: '10px', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-dark)', margin: '0 0 12px' }}>
            System environment variable updates are configured through the terminal command bar.
          </p>
          <button onClick={() => alert('Feature coming soon in Sandbox provisioning release.')} className="btn-secondary" style={{ fontSize: '12.5px', padding: '8px 16px' }}>
            Configure System Variables
          </button>
        </div>
      </div>

    </div>
  );
}
