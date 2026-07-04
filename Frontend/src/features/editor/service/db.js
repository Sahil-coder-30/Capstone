import Dexie from 'dexie';

// Single source-of-truth for the editor's IndexedDB database.
// The fileCache table stores the file content keyed by [sandboxId, file].
// The compound primary key [sandboxId+file] allows:
//   - Fast single-file lookups: db.fileCache.get({ sandboxId, file })
//   - Fast whole-sandbox deletions: db.fileCache.where('sandboxId').equals(sandboxId).delete()
export const db = new Dexie('EditorCacheDB');

db.version(1).stores({
  // [sandboxId+file] = compound primary key (no separate ++id needed)
  // sandboxId = secondary index for querying all files for a given sandbox
  fileCache: '[sandboxId+file], sandboxId',
});

db.version(2).stores({
  fileCache: '[sandboxId+file], sandboxId',
  // Store user projects: id = primary key
  projects: 'id',
  // Store user preferences: key = primary key (e.g. 'user_prefs')
  preferences: 'key',
});

db.version(3).stores({
  fileCache: '[sandboxId+file], sandboxId',
  projects: 'id',
  preferences: 'key',
  // Per-sandbox file tree cache for the editor explorer.
  fileLists: 'sandboxId, updatedAt',
});

db.version(4).stores({
  fileCache: '[sandboxId+file], sandboxId',
  projects: 'id',
  preferences: 'key',
  fileLists: 'sandboxId, updatedAt',
});
