import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { useSandbox } from '../../sandbox/Hooks/sandbox.hooks';
import { useEditor } from './editor.hooks';
import { readFileAPI } from '../service/editor.api';
import { applyWorkspaceFileEvent, syncCachedContents } from '../slice/editor.slice';
import {
  applyCachedFileListEvent,
  setCachedFile,
  deleteCachedFile,
  deleteCachedPath,
} from '../service/dbService';

export function useWorkspaceSync() {
  const dispatch = useDispatch();
  const { sandboxId, status } = useSandbox();
  const {
    openTabs,
    closeFileTab
  } = useEditor();

  const sandboxIdRef = useRef(sandboxId);
  const openTabsRef = useRef(openTabs);
  const closeFileTabRef = useRef(closeFileTab);
  const contentRefreshesRef = useRef(new Map());
  
  useEffect(() => {
    sandboxIdRef.current = sandboxId;
  }, [sandboxId]);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

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

    const refreshOpenFile = async (currentSandboxId, filePath) => {
      const refreshKey = `${currentSandboxId}:${filePath}`;
      if (contentRefreshesRef.current.has(refreshKey)) {
        return contentRefreshesRef.current.get(refreshKey);
      }

      const refresh = (async () => {
        try {
          const readData = await readFileAPI(currentSandboxId, filePath);
          if (readData.status === 'ok') {
            const fileData = readData.files?.[0];
            if (fileData && !fileData.error) {
              const content = fileData.content ?? '';

              await setCachedFile(currentSandboxId, filePath, content);
              dispatch(syncCachedContents({ [filePath]: content }));
            }
          }
        } catch (err) {
          console.error(`[WorkspaceSync] Failed to reload changed file ${filePath}:`, err);
        } finally {
          contentRefreshesRef.current.delete(refreshKey);
        }
      })();

      contentRefreshesRef.current.set(refreshKey, refresh);
      return refresh;
    };

    socket.on('workspace-change', async (data) => {
      console.log('[WorkspaceSync] File change detected in sandbox:', data);
      
      const currentSandboxId = sandboxIdRef.current;
      if (!currentSandboxId) return;

      const filePath = data.path;
      if (!filePath) return;

      dispatch(applyWorkspaceFileEvent(data));
      await applyCachedFileListEvent(currentSandboxId, data.event, filePath);

      // Handle file deletion
      if (data.event === 'unlink' || data.event === 'unlinkDir') {
        const deletedPaths = data.event === 'unlinkDir'
          ? openTabsRef.current.filter((tab) => tab === filePath || tab.startsWith(`${filePath}/`))
          : [filePath];

        // If the deleted file is currently open in tabs, close it
        deletedPaths.forEach((deletedPath) => {
          if (openTabsRef.current.includes(deletedPath)) {
            console.log(`[WorkspaceSync] Closing tab for deleted file: ${deletedPath}`);
            closeFileTabRef.current(deletedPath);
          }
        });

        // Remove from IndexedDB cache
        await deleteCachedPath(currentSandboxId, filePath);
      }

      // Handle file modifications
      if (data.event === 'change') {
        const isOpen = openTabsRef.current.includes(filePath);

        if (isOpen) {
          await refreshOpenFile(currentSandboxId, filePath);
        } else {
          // If the file is NOT open, just invalidate it in the IndexedDB cache so it will be fetched fresh when opened
          await deleteCachedFile(currentSandboxId, filePath);
        }
      }

      if (data.event === 'add') {
        await deleteCachedFile(currentSandboxId, filePath);
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
