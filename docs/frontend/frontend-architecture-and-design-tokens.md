# Feature-Based Hook-Driven Frontend Architecture & Design Token System

This document outlines the architectural guidelines, conventions, design token patterns, and light/dark theme configurations used in this application. It serves as a master blueprint for building clean, scalable, maintainable, and high-performance React applications.

---

## 1. Directory & File Structure

The project strictly follows a **Feature-Based Domain Isolation** pattern. Every major domain (e.g., `auth`, `editor`, `sandbox`, `coding-agent`, `copilot`, `settings`, `payments`, `dashboard`, `logs`) is self-contained under `src/features/`.

```text
src/
├── components/                 # Shared application-wide UI components (BrandLogo, Layout, EntryLoader, etc.)
├── features/                   # Feature-based domain modules
│   └── [feature_name]/         # e.g., auth, sandbox, editor, settings, payments
│       ├── components/         # Feature React UI components & co-located component SCSS
│       │   ├── [Component].jsx
│       │   └── [Component].scss
│       ├── Hooks/              # Custom React hooks encapsulating business logic & dispatches
│       │   └── [feature_name].hooks.js
│       ├── service/            # Axios API instances & raw network service functions
│       │   └── [feature_name].api.js
│       └── slice/              # Redux Toolkit synchronous state slices (NO async thunks)
│           └── [feature_name].slice.js
├── services/                   # Shared real-time / global services (Socket instances, global helpers)
├── styles/                     # Design Tokens & Core System Styles
│   ├── index.scss              # CSS custom properties, theme classes, resets, global animation utilities
│   └── tokens.scss             # SCSS token mappings to CSS variables, mixins, spacing scale
├── App.jsx                     # Core application orchestrator, theme boot & parameter sync
├── App.scss                    # Main app structural styling
└── store.js                    # Centralized Redux store configuring feature slices
```

---

## 2. The 4-Layer Architecture for Scaling

To ensure maximum maintainability, predictability, and separation of concerns, every feature is split into 4 distinct execution layers:

```
┌─────────────────────────────────────────────────────────┐
│                    Components Layer                     │
│    (UI Rendering, User Interactions, Selector Hooks)    │
└───────────────────────────┬─────────────────────────────┘
                            │ Calls hook functions / reads state
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Custom Hooks Layer                    │
│   (Business Logic, IndexedDB Cache, Async Flow Control) │
└─────────────┬─────────────────────────────┬─────────────┘
              │ Calls API                   │ Dispatches synchronous state
              ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────┐
│       Service Layer       │   │    Redux Slice Layer    │
│  (Axios / HTTP Calls)     │   │   (Sync Redux Mutators) │
└───────────────────────────┘   └─────────────────────────┘
```

### Layer 1: Service Layer (`service/[feature].api.js`)
* **Responsibility**: Pure HTTP API communication via Axios.
* **Rules**:
  * Define and export pure `async` functions executing HTTP requests (`api.get`, `api.post`, `api.put`, `api.delete`).
  * **Zero Redux Dependencies**: Do NOT reference `dispatch` or Redux `state` inside services.
  * Handles raw response data returning `response.data` and handles standard network error propagation.

* **Code Example**:
  ```javascript
  import axios from 'axios';

  const api = axios.create({ baseURL: '/api/settings', withCredentials: true });

  export const updatePreferencesAPI = async (preferencesData) => {
    const response = await api.put('/preferences', preferencesData);
    return response.data;
  };
  ```

---

### Layer 2: Redux Slice Layer (`slice/[feature].slice.js`)
* **Responsibility**: Storing UI state and providing synchronous, deterministic state assignment.
* **Rules**:
  * **NO `createAsyncThunk`**: Avoid handling async side-effects in Redux slices.
  * Define ONLY pure synchronous reducers (e.g., `setSettings`, `setProfile`, `setPreferences`, `setSettingsLoading`, `setSettingsError`).
  * Represent raw, immutably managed state structures with clear fallback defaults.

* **Code Example**:
  ```javascript
  import { createSlice } from '@reduxjs/toolkit';

  const initialState = {
    preferences: { theme: 'dark', editor: { fontSize: '14px', autoSave: true } },
    loading: false,
    error: null
  };

  const settingsSlice = createSlice({
    name: 'settings',
    initialState,
    reducers: {
      setPreferences(state, action) {
        state.preferences = { ...state.preferences, ...action.payload };
      },
      setSettingsLoading(state, action) {
        state.loading = action.payload;
      },
      setSettingsError(state, action) {
        state.error = action.payload;
        state.loading = false;
      }
    }
  });

  export const { setPreferences, setSettingsLoading, setSettingsError } = settingsSlice.actions;
  export default settingsSlice.reducer;
  ```

---

### Layer 3: Custom Hooks Layer (`Hooks/[feature].hooks.js`)
* **Responsibility**: Orchestrating business logic, state mutations, error catching, and local/offline persistence (e.g., IndexedDB via `dbService`).
* **Rules**:
  * Encapsulate complex operations within `useCallback` hooks.
  * Execute API calls from the Service Layer inside `try-catch-finally` blocks.
  * Dispatch synchronous slice actions (`setSettingsLoading`, `setPreferences`, `setSettingsError`).
  * Handle offline caching / IndexedDB sync (e.g. `setCachedPreferences`) for seamless offline resilience.
  * Expose state and memoized action functions to UI components.

* **Code Example**:
  ```javascript
  import { useCallback } from 'react';
  import { useDispatch, useSelector } from 'react-redux';
  import { updatePreferencesAPI } from '../service/settings.api';
  import { setPreferences, setSettingsLoading, setSettingsError } from '../slice/settings.slice';
  import { setCachedPreferences } from '../../editor/service/dbService';

  export const useSettings = () => {
    const dispatch = useDispatch();
    const state = useSelector((reduxState) => reduxState.settings);

    const updatePreferences = useCallback(async (preferencesData) => {
      try {
        dispatch(setSettingsLoading(true));
        const data = await updatePreferencesAPI(preferencesData);
        const updated = data.preferences ?? preferencesData;
        
        // Synchronize offline cache (IndexedDB) and Redux state simultaneously
        await setCachedPreferences(updated);
        dispatch(setPreferences(updated));
        return updated;
      } catch (err) {
        dispatch(setSettingsError(err.message));
        throw err;
      } finally {
        dispatch(setSettingsLoading(false));
      }
    }, [dispatch]);

    return {
      ...state,
      updatePreferences
    };
  };
  ```

---

### Layer 4: Components Layer (`components/`)
* **Responsibility**: Rendering UI, capturing user events, and consuming feature custom hooks.
* **Rules**:
  * **NEVER call API services directly** from component code.
  * **NEVER dispatch slice mutators directly** for asynchronous workflows.
  * Read state via feature custom hooks or `useSelector`.
  * Trigger actions exclusively via functions provided by custom feature hooks.

* **Code Example**:
  ```javascript
  import React from 'react';
  import { useSettings } from '../Hooks/settings.hooks';

  export default function SettingsAppearancePage() {
    const { preferences, updatePreferences } = useSettings();

    const handleThemeChange = (newTheme) => {
      updatePreferences({ ...preferences, theme: newTheme });
    };

    return (
      <button onClick={() => handleThemeChange('light')}>
        Switch to Light Theme
      </button>
    );
  }
  ```

---

## 3. Key Architectural Files & Implementation Specifications

To ensure AI agents can regenerate the exact high-fidelity UI layout, state engine, and theme tokens, the key files carrying architectural responsibility are defined below:

### 3.1 `src/components/Layout.jsx` — Resizable IDE Grid Shell & Drag Physics
* **Purpose**: Provides a VS Code / Google AI Studio style draggable shell containing left, center-top, center-bottom, and right panels with snap-to-close physics.
* **Key Implementation Pattern**:
  ```javascript
  import React, { useState, useEffect, useRef } from 'react';
  import { MessageSquare, Terminal, ChevronRight, ChevronUp } from 'lucide-react';

  export default function Layout({ 
    activityBar, leftPanel, centerWorkspace, centerTerminal, rightPanel,
    isLeftOpen = true, isRightOpen = true, isBottomOpen = true,
    onToggleLeft, onToggleBottom 
  }) {
    const [leftWidth, setLeftWidth] = useState(380);
    const [bottomHeight, setBottomHeight] = useState(250);
    const [resizingSide, setResizingSide] = useState(null); // 'left' | 'right' | 'bottom' | null

    const isResizingLeft = useRef(false);
    const isResizingBottom = useRef(false);

    // Mouse drag resize handler using requestAnimationFrame
    useEffect(() => {
      let animationFrameId = null;

      const handleMouseMove = (e) => {
        if (isResizingLeft.current) {
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(() => {
            const newWidth = Math.max(120, Math.min(window.innerWidth - 48, e.clientX - 48));
            setLeftWidth(newWidth);
          });
        } else if (isResizingBottom.current) {
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(() => {
            const newHeight = Math.max(80, Math.min(480, window.innerHeight - e.clientY - 24));
            setBottomHeight(newHeight);
          });
        }
      };

      const handleMouseUp = () => {
        // Snap-to-close checks on release
        if (isResizingLeft.current && leftWidth < 180 && onToggleLeft) onToggleLeft(false);
        if (isResizingBottom.current && bottomHeight < 120 && onToggleBottom) onToggleBottom(false);

        isResizingLeft.current = false;
        isResizingBottom.current = false;
        setResizingSide(null);
        document.body.classList.remove('is-resizing', 'is-resizing-col', 'is-resizing-row');
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      };
    }, [leftWidth, bottomHeight, onToggleLeft, onToggleBottom]);

    return (
      <div className="main-content">
        {activityBar}
        {isLeftOpen ? (
          <div className="panel left-panel" style={{ width: `${leftWidth}px`, flexShrink: 0 }}>{leftPanel}</div>
        ) : (
          <div className="collapsed-panel-bar left-collapsed-bar" onClick={() => onToggleLeft(true)}>
            <MessageSquare size={13} />
            <span className="collapsed-label">Chat</span>
            <ChevronRight size={10} />
          </div>
        )}

        {isLeftOpen && (
          <div className={`resizer vertical-resizer ${resizingSide === 'left' ? 'active' : ''}`} 
               onMouseDown={(e) => { e.preventDefault(); isResizingLeft.current = true; setResizingSide('left'); document.body.classList.add('is-resizing', 'is-resizing-col'); }} />
        )}

        <div className="center-panel">
          <div className="center-workspace">{centerWorkspace}</div>
          {isBottomOpen && (
            <div className="center-terminal-area" style={{ height: `${bottomHeight}px`, flexShrink: 0 }}>{centerTerminal}</div>
          )}
        </div>
      </div>
    );
  }
  ```

---

### 3.2 `src/App.jsx` — Application Orchestrator, Theme Boot & Deep Linking
* **Purpose**: Bootstraps theme configurations before initial render, manages active application views (`dashboard`, `settings`, `playground`), and syncs query params to browser history.
* **Key Implementation Pattern**:
  ```javascript
  import { useState, useEffect } from 'react';
  import Layout from './components/Layout';
  import SettingsPage from './features/settings/components/SettingsPage';
  import Dashboard from './features/dashboard/components/Dashboard';

  export default function App() {
    const initialParams = new URLSearchParams(window.location.search);
    const [activeRoute, setActiveRoute] = useState(initialParams.get('route') || 'dashboard');

    // Theme initialization on boot before paint
    useEffect(() => {
      const isLight = localStorage.getItem('theme') === 'light';
      if (isLight) {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
    }, []);

    // Sync active route to browser URL search params
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      params.set('route', activeRoute);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }, [activeRoute]);

    return (
      <div className="app-container">
        {activeRoute === 'settings' ? (
          <SettingsPage />
        ) : (
          <Layout centerWorkspace={<Dashboard />} />
        )}
      </div>
    );
  }
  ```

---

### 3.3 `src/store.js` — Centralized Redux Store Configuration
* **Purpose**: Combines all domain feature slices into a single centralized Redux store using `@reduxjs/toolkit`.
* **Key Implementation Pattern**:
  ```javascript
  import { configureStore } from '@reduxjs/toolkit';
  import sandboxReducer from './features/sandbox/slice/sandbox.slice';
  import editorReducer from './features/editor/slice/editor.slice';
  import codingAgentReducer from './features/coding-agent/slice/codingAgent.slice';
  import copilotReducer from './features/copilot/slice/copilot.slice';
  import logsReducer from './features/logs/slice/logs.slice';
  import authReducer from './features/auth/slice/auth.slice';
  import settingsReducer from './features/settings/slice/settings.slice';
  import paymentsReducer from './features/payments/slice/payments.slice';
  import dashboardReducer from './features/dashboard/slice/dashboard.slice';

  export const store = configureStore({
    reducer: {
      sandbox: sandboxReducer,
      editor: editorReducer,
      codingAgent: codingAgentReducer,
      copilot: copilotReducer,
      logs: logsReducer,
      auth: authReducer,
      settings: settingsReducer,
      payments: paymentsReducer,
      dashboard: dashboardReducer,
    },
  });
  ```

---

### 3.4 `src/features/editor/service/dbService.js` — Offline Dexie.js Persistence
* **Purpose**: Manages IndexedDB read/write operations for file caching, user preferences, and project copies.
* **Key Implementation Pattern**:
  ```javascript
  import { Dexie } from 'dexie';

  export const db = new Dexie('CodeSpaceDB');
  db.version(1).stores({
    fileCache: '[sandboxId+file], sandboxId, file, updatedAt',
    projects: 'id, title, updatedAt',
    preferences: 'id, data, updatedAt'
  });

  export const getCachedPreferences = async () => {
    try {
      const record = await db.preferences.get('userPreferences');
      return record?.data ?? null;
    } catch (e) {
      return null;
    }
  };

  export const setCachedPreferences = async (preferences) => {
    try {
      await db.preferences.put({ id: 'userPreferences', data: preferences, updatedAt: Date.now() });
    } catch (e) {
      console.error('[dbService] setCachedPreferences error:', e);
    }
  };
  ```

---

## 4. Styling Architecture & Design Token System

The application utilizes a **Dual-Token Architecture** combining CSS Custom Properties (`:root`) with local SCSS mappings (`tokens.scss`). This setup provides runtime dynamic theme switching without sacrificing SCSS nesting or mixin capabilities.

### 4.1 Design System Tokens (`src/styles/tokens.scss`)

#### Spacing Scale (8px Grid Standard)
```scss
$space-1:   4px;
$space-2:   8px;
$space-3:   12px;
$space-4:   16px;
$space-5:   20px;
$space-6:   24px;   // Standard component padding
$space-8:   32px;
$space-10:  40px;
$space-12:  48px;
$space-16:  64px;
```

#### SCSS Local Variable Mappings to CSS Custom Properties
```scss
$color-bg:            var(--bg-canvas);
$color-bg-sidebar:    var(--bg-surface);
$color-bg-panel:      var(--bg-overlay);
$color-bg-element:    var(--bg-element);
$color-bg-active:     var(--bg-active);
$color-border:        var(--border);
$color-border-strong: var(--border-strong);
$color-border-glow:   var(--border-glow);

$color-primary:       var(--brand-primary);
$color-primary-hover: var(--brand-hover);
$color-primary-glow:  var(--brand-subtle);
$color-accent:        var(--accent-primary);
$color-accent-hover:  var(--accent-hover);

$color-text:          var(--text-primary);
$color-text-muted:    var(--text-secondary);
$color-text-dark:     var(--text-dark);

$font-sans:           var(--font-sans);
$font-heading:        var(--font-heading);
$font-mono:           var(--font-mono);

// RGB opacity helper variables for dynamic alpha calculations
$color-rgb-text:      var(--color-rgb-text);
$color-bg-card:       rgba(var(--color-rgb-text), 0.03);
$color-bg-card-hover: rgba(var(--color-rgb-text), 0.06);
```

#### Layout Mixins & UI Patterns (`tokens.scss`)
```scss
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@mixin respond-to($bp) {
  @if $bp == 'mobile' {
    @media (max-width: 768px) { @content; }
  } @else if $bp == 'tablet' {
    @media (max-width: 1024px) { @content; }
  }
}

// Monochromatic High-Fidelity Container Card
@mixin card {
  background: var(--bg-surface);
  border: 1px solid $color-border;
  border-radius: 12px;
  padding: $space-6;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);

  &:hover {
    background: var(--bg-overlay);
    border-color: $color-border-strong;
    transform: translateY(-2px);
  }
}

// Shimmer Skeleton Loader
@mixin skeleton {
  background: linear-gradient(90deg, $color-bg-card 25%, var(--bg-element) 50%, $color-bg-card 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 6px;
}
```

---

## 5. Light and Dark Mode Configuration System

Theme management relies on class-scoped CSS Custom Properties defined in `src/styles/index.scss` and initialized in `App.jsx`.

### 5.1 Theme Tokens (`src/styles/index.scss`)

```scss
/* ─── Default Onyx/Obsidian Dark Theme ───────────────────────────── */
:root {
  /* Surface System */
  --bg-canvas:  #07080B;
  --bg-surface: #0E1017;
  --bg-overlay: #161929;
  --bg-element: #202438;
  --bg-active:  rgba(255, 255, 255, 0.08);

  /* Border System */
  --border:        #252A40;
  --border-strong: #353A56;
  --border-glow:   rgba(59, 130, 246, 0.15);

  /* Brand & Accent */
  --brand-primary: #10B981; /* Emerald */
  --brand-hover:   #34D399;
  --brand-subtle:  rgba(16, 185, 129, 0.1);

  --accent-primary: #3B82F6; /* Azure Blue */
  --accent-hover:   #60A5FA;
  --accent-subtle:  rgba(59, 130, 246, 0.1);

  /* Typography Hierarchy (WCAG AAA/AA Compliant) */
  --text-primary:   #FFFFFF;
  --text-secondary: #E2E8F0;
  --text-muted:     #94A3B8;
  --text-disabled:  #475569;

  --color-rgb-text: 255, 255, 255;
}

/* ─── 5-Layer Surface Codespace Light Theme ─────────────────────── */
:root.light-theme {
  --surface-canvas:  #ffffff;
  --surface-chrome:  #f4f4f6;
  --surface-sunken:  #f1f5f9;
  --surface-overlay: #ffffff;

  --bg-canvas:  var(--surface-canvas);
  --bg-surface: var(--surface-canvas);
  --bg-sidebar: var(--surface-chrome);
  --bg-overlay: var(--surface-overlay);
  --bg-element: var(--surface-sunken);
  --bg-active:  rgba(5, 150, 105, 0.1);

  --border-subtle:      #e4e4e7;
  --border:             #d0d7de;
  --border-strong:      #8c8c94;
  --border-glow:        rgba(5, 150, 105, 0.2);

  --brand-primary: #059669;
  --brand-hover:   #047857;
  --brand-subtle:  rgba(5, 150, 105, 0.1);

  --accent-primary: #0969da;
  --accent-hover:   #0850b8;
  --accent-subtle:  rgba(9, 105, 218, 0.1);

  --text-primary:   #1a1a1e; /* 17.4:1 contrast on white canvas */
  --text-secondary: #57606a; /* 6.4:1 contrast */
  --text-muted:     #6e7781; /* 4.55:1 contrast */
  --text-disabled:  #afb8c1;

  --color-rgb-text: 26, 26, 30;
}
```

### 5.2 Theme Switcher Component (`SettingsAppearancePage.jsx`)
```javascript
export default function SettingsAppearancePage({ preferences, onUpdatePreferences }) {
  const handleThemeChange = (themeVal) => {
    onUpdatePreferences({ ...preferences, theme: themeVal });

    if (themeVal === 'light') {
      document.documentElement.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    }
  };

  return (
    <div className="theme-options">
      <div onClick={() => handleThemeChange('dark')} className="theme-card dark">Dark Mode</div>
      <div onClick={() => handleThemeChange('light')} className="theme-card light">Light Mode</div>
    </div>
  );
}
```

---

## 6. Shared Component & UI System Library

1. **Co-located Component Styling**: Feature-specific styles (`Dashboard.scss`, `CodeEditor.scss`, `AIChat.scss`) are placed alongside React components inside `features/[feature]/components/`.
2. **Standardized Action Controls (`index.scss`)**:
   - `.btn-primary`: Gradient accent button with hover elevation and active press effect.
   - `.btn-secondary`: Surface-tinted border button.
   - `.btn-danger`: Error-tinted action button.
3. **Glassmorphism Backdrops & Card Animations**:
   - `.modal-backdrop`: `backdrop-filter: blur(4px)` with fade-in animation.
   - `.modal-card`: `slideInCard` keyframe entry with subtle top border highlight.
   - `.card-live-shimmer`: Animated sweeping linear gradient.
4. **Reduced Motion Accessibility**:
   - Mandatory `@media (prefers-reduced-motion: reduce)` block in `index.scss` dampening all transitions and keyframe animations for accessible user experiences.
