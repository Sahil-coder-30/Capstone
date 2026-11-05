// logs.js
// Dev server output for /api/agent/vite-runtime-errors.
// The template container runs `npm run dev 2>&1 | tee -a /sandbox-logs/vite.log`
// (set in Sandbox/server/src/kubernetes/pod.js), so the agent reads a shared
// file instead of calling the Kubernetes API.

import fs from "fs";

export const VITE_LOG_FILE = process.env.VITE_LOG_FILE || "/sandbox-logs/vite.log";

const TAIL_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KEEP_BYTES = 1024 * 1024;

/** Keeps the log file small: above 5 MB only the last 1 MB is kept. tee -a keeps appending at the new end. */
async function trimIfLarge(file, size) {
  if (size <= MAX_FILE_BYTES) return;
  const handle = await fs.promises.open(file, "r");
  try {
    const buffer = Buffer.alloc(KEEP_BYTES);
    await handle.read(buffer, 0, KEEP_BYTES, size - KEEP_BYTES);
    await fs.promises.writeFile(file, buffer);
  } finally {
    await handle.close();
  }
}

/** Last `lines` lines of the dev server log. Throws ENOENT before Vite wrote anything. */
export async function readViteLogTail(lines = 50, file = VITE_LOG_FILE) {
  const { size } = await fs.promises.stat(file);
  const start = Math.max(0, size - TAIL_BYTES);
  const handle = await fs.promises.open(file, "r");
  let text;
  try {
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    text = buffer.toString("utf8");
  } finally {
    await handle.close();
  }
  await trimIfLarge(file, size).catch(() => {});
  const all = text.split("\n");
  if (start > 0) all.shift(); // first line may be cut in half
  return all.slice(-lines - 1).join("\n").replace(/\n$/, "");
}
