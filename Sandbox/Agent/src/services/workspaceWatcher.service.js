// workspaceWatcher.service.js
// Watches the workspace with chokidar and reports each change as a relative path.

import chokidar from "chokidar";
import { WORKING_DIR, stripWorkspace } from "../workspace/paths.js";

/** Calls onChange({ event, path }) for every file event. Returns the watcher. */
export function watchWorkspace(onChange) {
  const watcher = chokidar.watch(WORKING_DIR, {
    ignored: [
      (filePath) => filePath.includes("node_modules") || filePath.includes(".git") || /(^|[\/\\])\../.test(filePath),
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100,
    },
  });

  watcher.on("all", (event, filePath) => {
    const relativePath = stripWorkspace(filePath);
    console.log(`[Chokidar] File event: ${event} on ${relativePath}`);
    onChange({ event, path: relativePath });
  });

  return watcher;
}
