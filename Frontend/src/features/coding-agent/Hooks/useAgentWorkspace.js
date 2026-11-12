import { useCallback, useEffect, useRef } from 'react';
import { useEditor } from '../../editor/Hooks/editor.hooks';

const normalizePath = (path) => path.replace(/^\.\//, '').replace(/^\/workspace\//, '');

/** Connects the panel to the sandbox and editor around each run. */
export function useAgentWorkspace({
  projectId,
  sandboxId,
  status,
  isHistoryLoading,
  sendMessage,
}) {
  const { files, fetchFilesList, activeFile, isModified, fetchFileContent } = useEditor();

  // A run can last minutes, so read the editor state when it ends, not when it starts.
  const editorStateRef = useRef({ activeFile, isModified });
  useEffect(() => {
    editorStateRef.current = { activeFile, isModified };
  }, [activeFile, isModified]);

  const refreshAfterRun = useCallback(() => {
    if (!sandboxId) return;
    fetchFilesList(sandboxId);
    const editor = editorStateRef.current;
    if (editor.activeFile && !editor.isModified) fetchFileContent(sandboxId, editor.activeFile, true);
  }, [sandboxId, fetchFilesList, fetchFileContent]);

  const openFile = useCallback((path) => {
    if (sandboxId) fetchFileContent(sandboxId, normalizePath(path));
  }, [sandboxId, fetchFileContent]);

  const readFile = useCallback(async (path) => {
    if (!sandboxId) return '';
    try {
      return (await fetchFileContent(sandboxId, path)) || '';
    } catch (err) {
      console.error('Failed to read file content for attachment:', err);
      return '';
    }
  }, [sandboxId, fetchFileContent]);

  // The dashboard hands over a first prompt through session storage. It always starts a new chat.
  useEffect(() => {
    if (!projectId || status !== 'running' || isHistoryLoading) return;
    const key = `initialPrompt_${projectId}`;
    const initialPrompt = sessionStorage.getItem(key);
    if (!initialPrompt) return;
    sessionStorage.removeItem(key);
    sendMessage(initialPrompt, [], refreshAfterRun, { newChat: true });
  }, [projectId, status, isHistoryLoading, sendMessage, refreshAfterRun]);

  useEffect(() => {
    if (status === 'running' && sandboxId) fetchFilesList(sandboxId);
  }, [status, sandboxId, fetchFilesList]);

  return { files, openFile, readFile, refreshAfterRun };
}
