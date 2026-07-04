import { createSlice } from '@reduxjs/toolkit';

const editorSlice = createSlice({
  name: 'editor',
  initialState: {
    files: [],
    activeFile: '',
    activeFileContent: '',
    originalContent: '',
    openTabs: [],
    tabContents: {},
    tabOriginalContents: {},
    autosaveEnabled: true,
    editorSettings: {
      wordWrap: false,
      minimap: false,
      fontSize: 13.5,
    },
    isLoading: false,
    isSaving: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
  },
  reducers: {
    setFiles(state, action) {
      state.files = action.payload;
    },
    applyWorkspaceFileEvent(state, action) {
      const { event, path } = action.payload || {};
      if (!path) return;

      if (event === 'add') {
        if (!state.files.includes(path)) {
          state.files.push(path);
          state.files.sort((a, b) => a.localeCompare(b));
        }
        return;
      }

      if (event === 'unlink') {
        state.files = state.files.filter((file) => file !== path);
        return;
      }

      if (event === 'unlinkDir') {
        const prefix = `${path}/`;
        state.files = state.files.filter((file) => file !== path && !file.startsWith(prefix));
      }
    },
    setActiveFile(state, action) {
      state.activeFile = action.payload;
      if (action.payload) {
        state.activeFileContent = state.tabContents[action.payload] ?? '';
        state.originalContent = state.tabOriginalContents[action.payload] ?? '';
      } else {
        state.activeFileContent = '';
        state.originalContent = '';
      }
    },
    setActiveFileContent(state, action) {
      state.activeFileContent = action.payload;
      if (state.activeFile) {
        state.tabContents[state.activeFile] = action.payload;
      }
    },
    setOriginalContent(state, action) {
      state.originalContent = action.payload;
      if (state.activeFile) {
        state.tabOriginalContents[state.activeFile] = action.payload;
      }
    },
    openTab(state, action) {
      const { file, content } = action.payload;
      if (!state.openTabs.includes(file)) {
        state.openTabs.push(file);
      }
      if (state.tabContents[file] === undefined) {
        state.tabContents[file] = content;
        state.tabOriginalContents[file] = content;
      }
      state.activeFile = file;
      state.activeFileContent = state.tabContents[file];
      state.originalContent = state.tabOriginalContents[file];
    },
    closeTab(state, action) {
      const file = action.payload;
      state.openTabs = state.openTabs.filter((t) => t !== file);
      delete state.tabContents[file];
      delete state.tabOriginalContents[file];
      
      if (state.activeFile === file) {
        const nextActive = state.openTabs[state.openTabs.length - 1] || '';
        state.activeFile = nextActive;
        if (nextActive) {
          state.activeFileContent = state.tabContents[nextActive] ?? '';
          state.originalContent = state.tabOriginalContents[nextActive] ?? '';
        } else {
          state.activeFileContent = '';
          state.originalContent = '';
        }
      }
    },
    updateTabContent(state, action) {
      const { file, content } = action.payload;
      state.tabContents[file] = content;
      if (state.activeFile === file) {
        state.activeFileContent = content;
      }
    },
    setTabOriginalContent(state, action) {
      const { file, content } = action.payload;
      state.tabOriginalContents[file] = content;
      if (state.activeFile === file) {
        state.originalContent = content;
      }
    },
    setAutosaveEnabled(state, action) {
      state.autosaveEnabled = action.payload;
    },
    updateEditorSettings(state, action) {
      state.editorSettings = {
        ...state.editorSettings,
        ...action.payload,
      };
    },
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
    setSaving(state, action) {
      state.isSaving = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setSyncing(state, action) {
      state.isSyncing = action.payload;
    },
    setLastSyncTime(state, action) {
      state.lastSyncTime = action.payload;
    },
    syncCachedContents(state, action) {
      const filesMap = action.payload;
      state.openTabs.forEach((file) => {
        const newContent = filesMap[file];
        if (newContent !== undefined) {
          const isTabModified = state.tabContents[file] !== state.tabOriginalContents[file];
          if (!isTabModified) {
            state.tabContents[file] = newContent;
            state.tabOriginalContents[file] = newContent;
            if (state.activeFile === file) {
              state.activeFileContent = newContent;
              state.originalContent = newContent;
            }
          } else {
            state.tabOriginalContents[file] = newContent;
            if (state.activeFile === file) {
              state.originalContent = newContent;
            }
          }
        }
      });
    },
  },
});

export const {
  setFiles,
  applyWorkspaceFileEvent,
  setActiveFile,
  setActiveFileContent,
  setOriginalContent,
  openTab,
  closeTab,
  updateTabContent,
  setTabOriginalContent,
  setAutosaveEnabled,
  updateEditorSettings,
  setLoading,
  setSaving,
  setError,
  setSyncing,
  setLastSyncTime,
  syncCachedContents,
} = editorSlice.actions;

export default editorSlice.reducer;
