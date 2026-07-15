/**
 * dbService.js — Centralized IndexedDB operations using the Dexie `db` singleton.
 *
 * Provides all read, write, update, and delete operations for:
 *   • fileCache  — per-sandbox file content cache
 *   • projects   — offline copy of the user's project list
 *   • preferences — offline copy of the user's app preferences
 *
 * ALL exports are plain async functions (not React hooks) so they can be
 * called from hooks, thunks, service workers, and plain JS logic alike.
 */
import { db } from './db';

const normalizeProjectForCache = (project) => {
  if (!project || typeof project !== 'object') return null;
  const id = project.id || project._id || project.projectId;
  if (!id) return null;
  return {
    ...project,
    id,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE CACHE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single file's content from cache.
 * @returns {string|null} file content or null if not cached
 */
export const getCachedFile = async (sandboxId, filePath) => {
  if (!sandboxId || !filePath) return null;

  try {
    const record = await db.fileCache.get({ sandboxId, file: filePath });
    return record?.content ?? null;
  } catch (e) {
    console.error('[dbService] getCachedFile error:', e);
    return null;
  }
};

/**
 * Set (upsert) a single file's content in cache.
 */
export const setCachedFile = async (sandboxId, filePath, content) => {
  if (!sandboxId || !filePath) {
    console.warn('[dbService] setCachedFile skipped: missing sandboxId or filePath', { sandboxId, filePath });
    return;
  }

  try {
    await db.fileCache.put({ sandboxId, file: filePath, content, updatedAt: Date.now() });
  } catch (e) {
    console.error('[dbService] setCachedFile error:', e);
  }
};

/**
 * Delete a single file's content from cache (e.g. when the file is deleted or invalidated).
 */
export const deleteCachedFile = async (sandboxId, filePath) => {
  if (!sandboxId || !filePath) return;

  try {
    await db.fileCache.delete([sandboxId, filePath]);
  } catch (e) {
    console.error('[dbService] deleteCachedFile error:', e);
  }
};

/**
 * Delete a file or directory path from the content cache.
 */
export const deleteCachedPath = async (sandboxId, filePath) => {
  if (!sandboxId || !filePath) return;

  try {
    const prefix = `${filePath}/`;
    await db.fileCache
      .where('sandboxId')
      .equals(sandboxId)
      .filter((record) => record.file === filePath || record.file.startsWith(prefix))
      .delete();
  } catch (e) {
    console.error('[dbService] deleteCachedPath error:', e);
  }
};

/**
 * Get the cached file tree for a sandbox.
 * @returns {string[]|null} cached file paths or null when no cache exists
 */
export const getCachedFileList = async (sandboxId) => {
  if (!sandboxId) return null;

  try {
    const record = await db.fileLists.get(sandboxId);
    return Array.isArray(record?.files) ? record.files : null;
  } catch (e) {
    console.error('[dbService] getCachedFileList error:', e);
    return null;
  }
};

/**
 * Replace the cached file tree for a sandbox.
 */
export const setCachedFileList = async (sandboxId, files = []) => {
  if (!sandboxId) {
    console.warn('[dbService] setCachedFileList skipped: missing sandboxId');
    return files;
  }

  try {
    const uniqueFiles = [...new Set(files)].sort((a, b) => a.localeCompare(b));
    await db.fileLists.put({ sandboxId, files: uniqueFiles, updatedAt: Date.now() });
    return uniqueFiles;
  } catch (e) {
    console.error('[dbService] setCachedFileList error:', e);
    return files;
  }
};

/**
 * Apply a watcher event to the cached file tree.
 */
export const applyCachedFileListEvent = async (sandboxId, event, filePath) => {
  if (!sandboxId || !filePath) return null;

  try {
    return await db.transaction('rw', db.fileLists, async () => {
      const record = await db.fileLists.get(sandboxId);
      let files = Array.isArray(record?.files) ? [...record.files] : [];

      if (event === 'add') {
        if (!files.includes(filePath)) {
          files.push(filePath);
        }
      } else if (event === 'unlink') {
        files = files.filter((file) => file !== filePath);
      } else if (event === 'unlinkDir') {
        const prefix = `${filePath}/`;
        files = files.filter((file) => file !== filePath && !file.startsWith(prefix));
      } else {
        return files;
      }

      files = [...new Set(files)].sort((a, b) => a.localeCompare(b));
      await db.fileLists.put({ sandboxId, files, updatedAt: Date.now() });
      return files;
    });
  } catch (e) {
    console.error('[dbService] applyCachedFileListEvent error:', e);
    return null;
  }
};

/**
 * Bulk-replace all cached files for a sandbox in a single transaction.
 * Clears stale entries first, then writes new ones.
 * @param {string} sandboxId
 * @param {{ file: string, content: string }[]} filesList
 */
export const bulkSetCachedFiles = async (sandboxId, filesList) => {
  if (!sandboxId || !Array.isArray(filesList)) return;

  try {
    const now = Date.now();
    const records = filesList
      .filter(({ file }) => Boolean(file))
      .map(({ file, content }) => ({
        sandboxId,
        file,
        content,
        updatedAt: now,
      }));
    await db.transaction('rw', db.fileCache, async () => {
      await db.fileCache.where('sandboxId').equals(sandboxId).delete();
      if (records.length > 0) {
        await db.fileCache.bulkPut(records);
      }
    });
  } catch (e) {
    console.error('[dbService] bulkSetCachedFiles error:', e);
  }
};

/**
 * Delete ALL cached files for a sandbox — called when the sandbox/project is deleted.
 */
export const clearCachedFilesForSandbox = async (sandboxId) => {
  if (!sandboxId) return;

  try {
    await db.transaction('rw', db.fileCache, db.fileLists, async () => {
      await db.fileCache.where('sandboxId').equals(sandboxId).delete();
      await db.fileLists.delete(sandboxId);
    });
    console.log(`[dbService] Cleared all file cache for sandbox: ${sandboxId}`);
  } catch (e) {
    console.error('[dbService] clearCachedFilesForSandbox error:', e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all cached projects (used offline when network is unavailable).
 * @returns {Array} list of projects or []
 */
export const getCachedProjects = async () => {
  try {
    return await db.projects.toArray();
  } catch (e) {
    console.error('[dbService] getCachedProjects error:', e);
    return [];
  }
};

/**
 * Bulk-replace the entire projects list in cache.
 * Called after a successful listProjectsAPI() response.
 * @param {Array} projects — full project list from backend
 */
export const setCachedProjects = async (projects) => {
  const normalizedProjects = Array.isArray(projects)
    ? projects.map(normalizeProjectForCache).filter(Boolean)
    : [];

  try {
    await db.transaction('rw', db.projects, async () => {
      await db.projects.clear();
      if (normalizedProjects.length > 0) {
        await db.projects.bulkPut(normalizedProjects);
      }
    });
    console.log(`[dbService] Cached ${normalizedProjects.length} projects in IndexedDB`);
  } catch (e) {
    console.error('[dbService] setCachedProjects error:', e);
  }
};

/**
 * Delete a single project from the cache (called on project delete).
 * @param {string} projectId
 */
export const deleteCachedProject = async (projectId) => {
  if (!projectId) return;

  try {
    await db.projects.delete(projectId);
    console.log(`[dbService] Deleted project from cache: ${projectId}`);
  } catch (e) {
    console.error('[dbService] deleteCachedProject error:', e);
  }
};

/**
 * Update the status of a cached project in IndexedDB.
 * @param {string} projectId
 * @param {string} status
 */
export const updateCachedProjectStatus = async (projectId, status) => {
  if (!projectId) return;

  try {
    const project = await db.projects.get(projectId);
    if (project) {
      project.status = status;
      await db.projects.put(project);
      console.log(`[dbService] Updated project status in cache: ${projectId} -> ${status}`);
    }
  } catch (e) {
    console.error('[dbService] updateCachedProjectStatus error:', e);
  }
};

/**
 * Add or update a single project in the cache (called after project creation).
 * @param {object} project
 */
export const upsertCachedProject = async (project) => {
  const normalizedProject = normalizeProjectForCache(project);
  if (!normalizedProject) {
    console.warn('[dbService] upsertCachedProject skipped: missing project id', project);
    return;
  }

  try {
    await db.projects.put(normalizedProject);
  } catch (e) {
    console.error('[dbService] upsertCachedProject error:', e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCES OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

const PREFS_KEY = 'user_prefs';

/**
 * Get the cached user preferences (used when offline or before backend responds).
 * @returns {object|null} preferences object or null
 */
export const getCachedPreferences = async () => {
  try {
    const record = await db.preferences.get(PREFS_KEY);
    return record?.data ?? null;
  } catch (e) {
    console.error('[dbService] getCachedPreferences error:', e);
    return null;
  }
};

/**
 * Save user preferences to IndexedDB cache.
 * @param {object} preferencesData
 */
export const setCachedPreferences = async (preferencesData) => {
  try {
    await db.preferences.put({ key: PREFS_KEY, data: preferencesData, updatedAt: Date.now() });
    console.log('[dbService] User preferences cached in IndexedDB');
  } catch (e) {
    console.error('[dbService] setCachedPreferences error:', e);
  }
};

/**
 * Delete all cached preferences (called on logout or account deletion).
 */
export const clearCachedPreferences = async () => {
  try {
    await db.preferences.delete(PREFS_KEY);
    console.log('[dbService] Cleared cached preferences');
  } catch (e) {
    console.error('[dbService] clearCachedPreferences error:', e);
  }
};

/**
 * Clear ALL IndexedDB data for a user session.
 * Call on logout to ensure no stale data persists.
 */
export const clearAllCaches = async () => {
  try {
    await db.transaction('rw', db.fileCache, db.fileLists, db.projects, db.preferences, async () => {
      await db.fileCache.clear();
      await db.fileLists.clear();
      await db.projects.clear();
      await db.preferences.clear();
    });
    console.log('[dbService] All IndexedDB caches cleared');
  } catch (e) {
    console.error('[dbService] clearAllCaches error:', e);
  }
};
