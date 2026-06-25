import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listFilesAPI, readFileAPI, updateFileAPI, createFileAPI, deleteFileAPI } from '../service/editor.api';
import {
  setFiles,
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
} from '../slice/editor.slice';

export const useEditor = () => {
  const dispatch = useDispatch();
  const {
    files,
    activeFile,
    activeFileContent,
    originalContent,
    openTabs,
    tabContents,
    tabOriginalContents,
    autosaveEnabled,
    editorSettings,
    isLoading,
    isSaving,
    isSyncing,
    lastSyncTime,
    error,
  } = useSelector((state) => state.editor);

  const fetchFilesList = async (sandboxId) => {
    if (!sandboxId) return;
    try {
      dispatch(setLoading(true));
      const data = await listFilesAPI(sandboxId);
      if (data.status === 'ok') {
        dispatch(setFiles(data.files || []));
        return data.files;
      } else {
        throw new Error(data.message || 'Failed to list files');
      }
    } catch (err) {
      dispatch(setError(err.message || 'Error fetching file list'));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };

  const fetchFileContent = async (sandboxId, file, force = false) => {
    if (!sandboxId || !file) return;

    // If already open in a tab and not forced, just switch to it
    if (!force && openTabs.includes(file)) {
      dispatch(setActiveFile(file));
      return tabContents[file];
    }

    // Try to load from localStorage cache first
    const cachedData = localStorage.getItem(`editor_cache_${sandboxId}`);
    let cachedContent = null;
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (parsed.files && parsed.files[file] !== undefined) {
          cachedContent = parsed.files[file];
        }
      } catch (e) {
        console.error('Error parsing editor cache:', e);
      }
    }

    if (cachedContent !== null && !force) {
      dispatch(openTab({ file, content: cachedContent }));
      return cachedContent;
    }

    try {
      dispatch(setLoading(true));
      const data = await readFileAPI(sandboxId, file);
      if (data.status === 'ok') {
        const fileData = data.files?.[0];
        if (fileData?.error) {
          throw new Error(fileData.error);
        }
        const content = fileData?.content || '';

        // Update single file in localStorage cache
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            parsed.files = parsed.files || {};
            parsed.files[file] = content;
            localStorage.setItem(`editor_cache_${sandboxId}`, JSON.stringify(parsed));
          } catch (e) {
            console.error('Error updating single file cache:', e);
          }
        } else {
          localStorage.setItem(`editor_cache_${sandboxId}`, JSON.stringify({
            files: { [file]: content },
            lastSync: Date.now(),
          }));
        }

        dispatch(openTab({ file, content }));
        return content;
      } else {
        throw new Error(data.message || 'Failed to read file');
      }
    } catch (err) {
      dispatch(setError(err.message || `Error reading file ${file}`));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };

  const saveFileContent = async (sandboxId, fileToSave = null) => {
    const targetFile = fileToSave || activeFile;
    if (!sandboxId || !targetFile) return;

    const contentToSave = tabContents[targetFile] ?? activeFileContent;

    try {
      dispatch(setSaving(true));
      const data = await updateFileAPI(sandboxId, targetFile, contentToSave);
      if (data.status === 'ok') {
        const result = data.results?.[0];
        if (result?.error) {
          throw new Error(result.error);
        }
        dispatch(setTabOriginalContent({ file: targetFile, content: contentToSave }));
        // Sync cache in background
        syncAllFilesToCache(sandboxId);
        return true;
      } else {
        throw new Error(data.message || 'Failed to save file');
      }
    } catch (err) {
      dispatch(setError(err.message || `Error saving file ${targetFile}`));
      throw err;
    } finally {
      dispatch(setSaving(false));
    }
  };

  const createNewFile = async (sandboxId, file, content = '') => {
    if (!sandboxId || !file) return;
    try {
      dispatch(setLoading(true));
      const data = await createFileAPI(sandboxId, file, content);
      if (data.status === 'ok') {
        const result = data.results?.[0];
        if (result?.error) {
          throw new Error(result.error);
        }
        // Refresh file explorer list
        await fetchFilesList(sandboxId);
        // Open the new file in a tab
        dispatch(openTab({ file, content }));
        // Sync cache in background
        syncAllFilesToCache(sandboxId);
        return true;
      } else {
        throw new Error(data.message || 'Failed to create file');
      }
    } catch (err) {
      dispatch(setError(err.message || `Error creating file ${file}`));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };

  const deleteExistingFile = async (sandboxId, file) => {
    if (!sandboxId || !file) return;
    try {
      dispatch(setLoading(true));
      const data = await deleteFileAPI(sandboxId, file);
      if (data.status === 'ok') {
        const result = data.results?.[0];
        if (result?.error) {
          throw new Error(result.error);
        }
        dispatch(closeTab(file));
        const cachedData = localStorage.getItem(`editor_cache_${sandboxId}`);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (parsed.files && parsed.files[file] !== undefined) {
              delete parsed.files[file];
              localStorage.setItem(`editor_cache_${sandboxId}`, JSON.stringify(parsed));
            }
          } catch (e) {
            console.error('Error updating cache on delete:', e);
          }
        }
        await fetchFilesList(sandboxId);
        return true;
      } else {
        throw new Error(data.message || 'Failed to delete file');
      }
    } catch (err) {
      dispatch(setError(err.message || `Error deleting file ${file}`));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };


  const syncAllFilesToCache = useCallback(async (sandboxId) => {
    if (!sandboxId) return;
    try {
      dispatch(setSyncing(true));
      const listData = await listFilesAPI(sandboxId);
      if (listData.status !== 'ok') {
        throw new Error(listData.message || 'Failed to list files');
      }
      const filesList = listData.files || [];
      if (filesList.length === 0) {
        dispatch(setSyncing(false));
        return;
      }

      const filesQuery = filesList.join(',');
      const readData = await readFileAPI(sandboxId, filesQuery);
      if (readData.status !== 'ok') {
        throw new Error(readData.message || 'Failed to read files');
      }

      const filesMap = {};
      readData.files.forEach((f) => {
        if (f.content !== undefined) {
          filesMap[f.file] = f.content;
        }
      });

      const cacheObj = {
        files: filesMap,
        lastSync: Date.now(),
      };
      localStorage.setItem(`editor_cache_${sandboxId}`, JSON.stringify(cacheObj));

      dispatch(syncCachedContents(filesMap));
      dispatch(setLastSyncTime(Date.now()));
    } catch (err) {
      console.error('Error syncing files to cache:', err);
    } finally {
      dispatch(setSyncing(false));
    }
  }, [dispatch]);

  const updateEditorContent = (content) => {
    dispatch(setActiveFileContent(content));
  };

  const selectActiveFile = (file) => {
    dispatch(setActiveFile(file));
  };

  const closeFileTab = (file) => {
    dispatch(closeTab(file));
  };

  const toggleAutosave = (enabled) => {
    dispatch(setAutosaveEnabled(enabled));
  };

  const updateSettings = (settings) => {
    dispatch(updateEditorSettings(settings));
  };

  const clearEditorError = () => {
    dispatch(setError(null));
  };

  const isModified = activeFile ? tabContents[activeFile] !== tabOriginalContents[activeFile] : false;

  const getFileModifiedStatus = (file) => {
    return tabContents[file] !== tabOriginalContents[file];
  };

  return {
    files,
    activeFile,
    activeFileContent,
    originalContent,
    openTabs,
    tabContents,
    tabOriginalContents,
    autosaveEnabled,
    editorSettings,
    isLoading,
    isSaving,
    isSyncing,
    lastSyncTime,
    error,
    isModified,
    getFileModifiedStatus,
    fetchFilesList,
    fetchFileContent,
    saveFileContent,
    createNewFile,
    deleteExistingFile,
    syncAllFilesToCache,
    updateEditorContent,
    selectActiveFile,
    closeFileTab,
    toggleAutosave,
    updateSettings,
    clearEditorError,
  };
};
