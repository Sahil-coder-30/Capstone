import React, { useState, useEffect } from 'react';
import { 
  SlidersHorizontal, Moon, Sun, Monitor, Check, 
  Sparkles, Cpu, Eye, ToggleLeft, ToggleRight, FileCode
} from 'lucide-react';

export default function SettingsAppearancePage({ preferences, onUpdatePreferences }) {
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('14px');
  const [tabSize, setTabSize] = useState('2');
  const [autoSave, setAutoSave] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);


  const [autoSuggest, setAutoSuggest] = useState(true);
  const [interactiveMode, setInteractiveMode] = useState('detailed');

  // Sync state with preferences loaded from Redux
  useEffect(() => {
    if (preferences) {
      if (preferences.theme) setTheme(preferences.theme);
      if (preferences.editor) {
        if (preferences.editor.fontSize) setFontSize(preferences.editor.fontSize);
        if (preferences.editor.tabSize) setTabSize(preferences.editor.tabSize);
        if (preferences.editor.autoSave !== undefined) setAutoSave(preferences.editor.autoSave);
        if (preferences.editor.minimap !== undefined) setMinimap(preferences.editor.minimap);
        if (preferences.editor.wordWrap !== undefined) setWordWrap(preferences.editor.wordWrap);
      }
      if (preferences.copilot) {

        if (preferences.copilot.autoSuggest !== undefined) setAutoSuggest(preferences.copilot.autoSuggest);
        if (preferences.copilot.interactiveMode) setInteractiveMode(preferences.copilot.interactiveMode);
      }
    }
  }, [preferences]);

  const handleThemeChange = (themeVal) => {
    setTheme(themeVal);
    onUpdatePreferences({ ...preferences, theme: themeVal });
    
    // Apply visual class for themes
    if (themeVal === 'light') {
      document.documentElement.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    }
  };

  const handleEditorChange = (key, val) => {
    onUpdatePreferences({
      ...preferences,
      editor: {
        ...preferences?.editor,
        [key]: val
      }
    });
  };

  const handleCopilotChange = (key, val) => {
    onUpdatePreferences({
      ...preferences,
      copilot: {
        ...preferences?.copilot,
        [key]: val
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: 'var(--font-sans)', paddingBottom: '32px' }}>
      
      {/* 1. Theme Configuration Card */}
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
          Workspace Theme
        </h3>
        
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {/* Dark Card */}
          <div 
            onClick={() => handleThemeChange('dark')}
            style={{ 
              flex: '1 1 200px', padding: '20px', borderRadius: '12px', 
              border: `2px solid ${theme === 'dark' ? 'var(--primary)' : 'var(--border)'}`, 
              background: '#0E1017', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px',
              boxShadow: theme === 'dark' ? '0 0 12px var(--primary-glow)' : 'none', transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Moon size={14} style={{ color: 'var(--primary)' }} /> Dark Mode
              </span>
              {theme === 'dark' && <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={10} color="#000" /></div>}
            </div>
            <div style={{ height: '40px', background: '#07080B', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', padding: '6px', display: 'flex', gap: '4px' }}>
              <div style={{ width: '20px', background: '#0E1017', borderRadius: '3px' }} />
              <div style={{ flex: 1, background: '#131622', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Light Card */}
          <div 
            onClick={() => handleThemeChange('light')}
            style={{ 
              flex: '1 1 200px', padding: '20px', borderRadius: '12px', 
              border: `2px solid ${theme === 'light' ? 'var(--primary)' : 'var(--border)'}`, 
              background: '#ffffff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px',
              boxShadow: theme === 'light' ? '0 0 12px var(--primary-glow)' : 'none', transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sun size={14} style={{ color: '#f59e0b' }} /> Light Mode
              </span>
              {theme === 'light' && <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={10} color="#000" /></div>}
            </div>
            <div style={{ height: '40px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '6px', display: 'flex', gap: '4px' }}>
              <div style={{ width: '20px', background: '#ffffff', borderRadius: '3px', border: '1px solid #e2e8f0' }} />
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '3px' }} />
            </div>
          </div>

          {/* System Card */}
          <div 
            onClick={() => handleThemeChange('system')}
            style={{ 
              flex: '1 1 200px', padding: '20px', borderRadius: '12px', 
              border: `2px solid ${theme === 'system' ? 'var(--primary)' : 'var(--border)'}`, 
              background: 'linear-gradient(135deg, #0E1017 50%, #ffffff 50%)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px',
              boxShadow: theme === 'system' ? '0 0 12px var(--primary-glow)' : 'none', transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '6px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Monitor size={14} style={{ color: '#3b82f6' }} /> System Default
              </span>
              {theme === 'system' && <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={10} color="#000" /></div>}
            </div>
            <div style={{ height: '40px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }} />
          </div>
        </div>
      </div>

      {/* 2. Editor Preferences Card */}
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
          <SlidersHorizontal size={16} color="var(--primary)" /> Editor Configurations
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Font size */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Font Size</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Font size of the active codespace editor and terminal.</p>
            </div>
            <select 
              value={fontSize} 
              onChange={(e) => { setFontSize(e.target.value); handleEditorChange('fontSize', e.target.value); }}
              style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}
            >
              <option value="12px">12px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
              <option value="18px">18px</option>
            </select>
          </div>

          {/* Tab spacing */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Tab Spacing</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Number of spaces inserted when pressing TAB.</p>
            </div>
            <select 
              value={tabSize} 
              onChange={(e) => { setTabSize(e.target.value); handleEditorChange('tabSize', e.target.value); }}
              style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}
            >
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="8">8 spaces</option>
            </select>
          </div>

          {/* Minimap toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Code Minimap</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Show mini layout scroll view on the right side of Monaco editor.</p>
            </div>
            <button 
              onClick={() => { setMinimap(!minimap); handleEditorChange('minimap', !minimap); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {minimap ? <ToggleRight size={38} color="var(--primary)" /> : <ToggleLeft size={38} color="var(--text-dark)" />}
            </button>
          </div>

          {/* Word wrap */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Word Wrap</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Force long code lines to wrap inside the editor viewport.</p>
            </div>
            <button 
              onClick={() => { setWordWrap(!wordWrap); handleEditorChange('wordWrap', !wordWrap); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {wordWrap ? <ToggleRight size={38} color="var(--primary)" /> : <ToggleLeft size={38} color="var(--text-dark)" />}
            </button>
          </div>

          {/* Auto-save */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Auto-save Changes</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Automatically compile and save changes every 5 seconds.</p>
            </div>
            <button 
              onClick={() => { setAutoSave(!autoSave); handleEditorChange('autoSave', !autoSave); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {autoSave ? <ToggleRight size={38} color="var(--primary)" /> : <ToggleLeft size={38} color="var(--text-dark)" />}
            </button>
          </div>
        </div>
      </div>

      {/* 3. AI Copilot Preferences Card */}
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
          <Sparkles size={16} color="var(--primary)" /> AI Copilot Preferences
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>


          {/* Auto Suggestion */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Inline Code Suggestions</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Show ghost-text code completions while typing.</p>
            </div>
            <button 
              onClick={() => { setAutoSuggest(!autoSuggest); handleCopilotChange('autoSuggest', !autoSuggest); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {autoSuggest ? <ToggleRight size={38} color="var(--primary)" /> : <ToggleLeft size={38} color="var(--text-dark)" />}
            </button>
          </div>

          {/* Interactive Mode style */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>AI Explanation Style</h4>
              <p style={{ fontSize: '11.5px', color: 'var(--text-dark)', marginTop: '2px', margin: '2px 0 0' }}>Verbosity preference of the coding agent response chats.</p>
            </div>
            <select 
              value={interactiveMode} 
              onChange={(e) => { setInteractiveMode(e.target.value); handleCopilotChange('interactiveMode', e.target.value); }}
              style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}
            >
              <option value="detailed">Detailed & Educational</option>
              <option value="concise">Concise & Direct</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
