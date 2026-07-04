import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listFilesAPI, readFileAPI, updateFileAPI, createFileAPI, deleteFileAPI } from '../service/editor.api';
import {
  getCachedFile,
  setCachedFile,
  deleteCachedPath,
  getCachedFileList,
  setCachedFileList,
} from '../service/dbService';
import {
  setFiles,
  setActiveFile,
  setActiveFileContent,
  openTab,
  closeTab,
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

const inflightFileLists = new Map();
const inflightFileReads = new Map();

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

  const fetchFilesList = useCallback(async (sandboxId, options = {}) => {
    if (!sandboxId) return;
    const forceNetwork = options === true || options.forceNetwork === true;

    if (!forceNetwork) {
      const cachedFiles = await getCachedFileList(sandboxId);
      if (cachedFiles) {
        dispatch(setFiles(cachedFiles));
        return cachedFiles;
      }
    }

    if (inflightFileLists.has(sandboxId)) {
      return inflightFileLists.get(sandboxId);
    }

    const request = (async () => {
      try {
        dispatch(setLoading(true));
        const data = await listFilesAPI(sandboxId);
        if (data.status === 'ok') {
          const nextFiles = await setCachedFileList(sandboxId, data.files || []);
          dispatch(setFiles(nextFiles));
          return nextFiles;
        }
        throw new Error(data.message || 'Failed to list files');
      } catch (err) {
        dispatch(setError(err.message || 'Error fetching file list'));
        throw err;
      } finally {
        dispatch(setLoading(false));
        inflightFileLists.delete(sandboxId);
      }
    })();

    inflightFileLists.set(sandboxId, request);
    return request;
  }, [dispatch]);

  const fetchFileContent = useCallback(async (sandboxId, file, force = false) => {
    if (!sandboxId || !file) return;

    // If already open in a tab and not forced, just switch to it
    if (!force && openTabs.includes(file)) {
      dispatch(setActiveFile(file));
      return tabContents[file];
    }

    // Try to load from IndexedDB cache first
    let cachedContent = null;
    if (!force) {
      cachedContent = await getCachedFile(sandboxId, file);
    }

    if (cachedContent !== null && !force) {
      dispatch(openTab({ file, content: cachedContent }));
      return cachedContent;
    }

    const readKey = `${sandboxId}:${file}`;
    if (!force && inflightFileReads.has(readKey)) {
      return inflightFileReads.get(readKey);
    }

    const request = (async () => {
      try {
        dispatch(setLoading(true));
        const data = await readFileAPI(sandboxId, file);
        if (data.status === 'ok') {
          const fileData = data.files?.[0];
          if (fileData?.error) {
            throw new Error(fileData.error);
          }
          const content = fileData?.content || '';

          // Upsert single file into IndexedDB cache
          await setCachedFile(sandboxId, file, content);

          dispatch(openTab({ file, content }));
          return content;
        }
        throw new Error(data.message || 'Failed to read file');
      } catch (err) {
        dispatch(setError(err.message || `Error reading file ${file}`));
        throw err;
      } finally {
        dispatch(setLoading(false));
        inflightFileReads.delete(readKey);
      }
    })();

    if (!force) {
      inflightFileReads.set(readKey, request);
    }
    return request;
  }, [dispatch, openTabs, tabContents]);

  const syncAllFilesToCache = useCallback(async (sandboxId) => {
    if (!sandboxId) return;
    try {
      dispatch(setSyncing(true));
      const filesList = await fetchFilesList(sandboxId);
      const openFiles = openTabs.filter((file) => filesList?.includes(file));

      if (openFiles.length === 0) {
        dispatch(setLastSyncTime(Date.now()));
        return;
      }

      const readData = await readFileAPI(sandboxId, openFiles.join(','));
      if (readData.status !== 'ok') {
        throw new Error(readData.message || 'Failed to read open files');
      }

      const filesMap = {};
      const cacheWrites = readData.files
        .filter((f) => f.content !== undefined)
        .map(async (f) => {
          filesMap[f.file] = f.content;
          await setCachedFile(sandboxId, f.file, f.content);
        });

      await Promise.all(cacheWrites);
      dispatch(syncCachedContents(filesMap));
      dispatch(setLastSyncTime(Date.now()));
    } catch (err) {
      console.error('Error syncing open files to cache:', err);
    } finally {
      dispatch(setSyncing(false));
    }
  }, [dispatch, fetchFilesList, openTabs]);

  const saveFileContent = useCallback(async (sandboxId, fileToSave = null) => {
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
        await setCachedFile(sandboxId, targetFile, contentToSave);
        dispatch(setTabOriginalContent({ file: targetFile, content: contentToSave }));
        dispatch(syncCachedContents({ [targetFile]: contentToSave }));
        return true;
      }
      throw new Error(data.message || 'Failed to save file');
    } catch (err) {
      dispatch(setError(err.message || `Error saving file ${targetFile}`));
      throw err;
    } finally {
      dispatch(setSaving(false));
    }
  }, [activeFile, activeFileContent, dispatch, tabContents]);

  const createNewFile = useCallback(async (sandboxId, file, content = '') => {
    if (!sandboxId || !file) return;
    try {
      dispatch(setLoading(true));
      const data = await createFileAPI(sandboxId, file, content);
      if (data.status === 'ok') {
        const result = data.results?.[0];
        if (result?.error) {
          throw new Error(result.error);
        }
        await setCachedFile(sandboxId, file, content);
        const nextFiles = await setCachedFileList(sandboxId, [...files, file]);
        dispatch(setFiles(nextFiles));
        dispatch(openTab({ file, content }));
        return true;
      }
      throw new Error(data.message || 'Failed to create file');
    } catch (err) {
      dispatch(setError(err.message || `Error creating file ${file}`));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, files]);

  const deleteExistingFile = useCallback(async (sandboxId, file) => {
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
        await deleteCachedPath(sandboxId, file);
        const prefix = `${file}/`;
        const nextFiles = await setCachedFileList(
          sandboxId,
          files.filter((existingFile) => existingFile !== file && !existingFile.startsWith(prefix))
        );
        dispatch(setFiles(nextFiles));
        return true;
      }
      throw new Error(data.message || 'Failed to delete file');
    } catch (err) {
      dispatch(setError(err.message || `Error deleting file ${file}`));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, files]);

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
