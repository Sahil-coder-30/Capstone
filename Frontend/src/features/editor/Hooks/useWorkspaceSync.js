import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useEditor } from './editor.hooks';
import { readFileAPI } from '../service/editor.api';
import { syncCachedContents } from '../slice/editor.slice';

export function useWorkspaceSync() {
  const dispatch = useDispatch();
  const { sandboxId, status } = useSandbox();
  const {
    fetchFilesList,
    activeFile,
    getFileModifiedStatus,
    openTabs,
    closeFileTab
  } = useEditor();

  const activeFileRef = useRef(activeFile);
  const sandboxIdRef = useRef(sandboxId);
  const openTabsRef = useRef(openTabs);
  const getFileModifiedStatusRef = useRef(getFileModifiedStatus);
  const fetchFilesListRef = useRef(fetchFilesList);
  const closeFileTabRef = useRef(closeFileTab);
  
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    sandboxIdRef.current = sandboxId;
  }, [sandboxId]);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    getFileModifiedStatusRef.current = getFileModifiedStatus;
  }, [getFileModifiedStatus]);

  useEffect(() => {
    fetchFilesListRef.current = fetchFilesList;
  }, [fetchFilesList]);

  useEffect(() => {
    closeFileTabRef.current = closeFileTab;
  }, [closeFileTab]);

  useEffect(() => {
    if (status !== 'running' || !sandboxId) return;

    console.log(`[WorkspaceSync] Initializing file sync connection for sandbox: ${sandboxId}`);
    
    const socket = io('/', {
      path: '/api/terminal-proxy/socket.io',
      query: { sandboxId },
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('[WorkspaceSync] Connected to sandbox file watch channel.');
    });

    socket.on('workspace-change', async (data) => {
      console.log('[WorkspaceSync] File change detected in sandbox:', data);
      
      const currentSandboxId = sandboxIdRef.current;
      if (!currentSandboxId) return;

      // 1. Refresh the file explorer tree
      try {
        await fetchFilesListRef.current(currentSandboxId);
      } catch (err) {
        console.error('[WorkspaceSync] Failed to refresh files list:', err);
      }

      const filePath = data.path;
      if (!filePath) return;

      // 2. Handle file deletion (unlink)
      if (data.event === 'unlink') {
        // If the deleted file is currently open in tabs, close it
        if (openTabsRef.current.includes(filePath)) {
          console.log(`[WorkspaceSync] Closing tab for deleted file: ${filePath}`);
          closeFileTabRef.current(filePath);
        }

        // Remove from localStorage cache
        const cachedData = localStorage.getItem(`editor_cache_${currentSandboxId}`);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (parsed.files && parsed.files[filePath] !== undefined) {
              delete parsed.files[filePath];
              localStorage.setItem(`editor_cache_${currentSandboxId}`, JSON.stringify(parsed));
            }
          } catch (e) {
            console.error('[WorkspaceSync] Error removing deleted file from cache:', e);
          }
        }
      }

      // 3. Handle file modifications (change)
      if (data.event === 'change') {
        const isOpen = openTabsRef.current.includes(filePath);

        if (isOpen) {
          // If the file is open, fetch its new content from sandbox and sync it
          try {
            const readData = await readFileAPI(currentSandboxId, filePath);
            if (readData.status === 'ok') {
              const fileData = readData.files?.[0];
              if (fileData && !fileData.error) {
                const content = fileData.content ?? '';

                // Update single file in localStorage cache
                const cachedData = localStorage.getItem(`editor_cache_${currentSandboxId}`);
                if (cachedData) {
                  try {
                    const parsed = JSON.parse(cachedData);
                    parsed.files = parsed.files || {};
                    parsed.files[filePath] = content;
                    localStorage.setItem(`editor_cache_${currentSandboxId}`, JSON.stringify(parsed));
                  } catch (e) {
                    console.error('[WorkspaceSync] Error updating cache on file change:', e);
                  }
                }

                // Sync the content in Redux
                dispatch(syncCachedContents({ [filePath]: content }));
              }
            }
          } catch (err) {
            console.error(`[WorkspaceSync] Failed to reload changed file ${filePath}:`, err);
          }
        } else {
          // If the file is NOT open, just invalidate it in the localStorage cache so it will be fetched fresh when opened
          const cachedData = localStorage.getItem(`editor_cache_${currentSandboxId}`);
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData);
              if (parsed.files && parsed.files[filePath] !== undefined) {
                delete parsed.files[filePath];
                localStorage.setItem(`editor_cache_${currentSandboxId}`, JSON.stringify(parsed));
              }
            } catch (e) {
              console.error('[WorkspaceSync] Error invalidating changed file in cache:', e);
            }
          }
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[WorkspaceSync] Disconnected from workspace sync:', reason);
    });

    return () => {
      console.log('[WorkspaceSync] Tearing down workspace sync socket connection');
      socket.disconnect();
    };
  }, [sandboxId, status, dispatch]);
}
