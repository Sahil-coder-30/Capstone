// Offline tests of the workspace path checks, the shared Vite log file and
// the open report-error route's input cleaning. Uses temp folders.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "taksha-ws-"));
const workspace = path.join(root, "workspace");
const outside = path.join(root, "outside");
fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
fs.mkdirSync(outside);
fs.writeFileSync(path.join(outside, "secret.txt"), "token");
fs.writeFileSync(path.join(workspace, "src", "App.jsx"), "app");
fs.symlinkSync(outside, path.join(workspace, "escape"));
fs.symlinkSync(path.join(workspace, "src"), path.join(workspace, "src-link"));
process.env.WORKSPACE_DIR = workspace;

const { safeResolve, isInsideWorkspace } = await import("../src/workspace/paths.js");
const { readViteLogTail } = await import("../src/workspace/logs.js");
const { cleanErrorReport, createReportLimiter } = await import("../src/workspace/errorReports.js");

test("paths inside the workspace resolve, including new files and inner symlinks", () => {
  assert.equal(safeResolve("src/App.jsx"), path.join(workspace, "src", "App.jsx"));
  assert.equal(safeResolve("/src/App.jsx"), path.join(workspace, "src", "App.jsx"));
  assert.ok(safeResolve("src/new/Deep.jsx"));
  assert.ok(safeResolve("src-link/App.jsx"), "a symlink that stays inside is fine");
});

test("traversal and symlink escapes are denied", () => {
  assert.throws(() => safeResolve("../outside/secret.txt"), /Access denied/);
  assert.throws(() => safeResolve("escape/secret.txt"), /through a symlink/);
  assert.throws(() => safeResolve("escape/new-file.txt"), /through a symlink/, "no writing through a link either");
  assert.equal(isInsideWorkspace(path.join(workspace, "escape")), false);
});

test("a symlink pointing outside can still be deleted itself", () => {
  assert.equal(safeResolve("escape", { followLink: false }), path.join(workspace, "escape"));
});

test("the Vite log tail returns the last lines and trims a huge file", async () => {
  const file = path.join(root, "vite.log");
  fs.writeFileSync(file, Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  const tail = await readViteLogTail(50, file);
  const lines = tail.split("\n");
  assert.equal(lines.at(-1), "line 120");
  assert.ok(lines.length <= 51 && lines.length >= 50);

  fs.writeFileSync(file, "x".repeat(6 * 1024 * 1024) + "\nlast line\n");
  assert.match(await readViteLogTail(5, file), /last line$/);
  assert.ok(fs.statSync(file).size <= 1024 * 1024, "kept only the last 1 MB");

  await assert.rejects(readViteLogTail(5, path.join(root, "missing.log")), { code: "ENOENT" });
});

test("error reports are capped and lose terminal escape sequences", () => {
  const report = cleanErrorReport({
    type: undefined,
    message: "boom \x1b]0;pwned\x07\x1b[2J" + "y".repeat(5000),
    stack: "at a\nat b\r\n",
    line: "12",
  });
  assert.equal(report.type, "error");
  assert.ok(!report.message.includes("\x1b"));
  assert.ok(report.message.length <= 2000);
  assert.equal(report.stack, "at a\nat b\n");
  assert.equal(report.line, 12);
});

test("error reports are rate limited per minute", () => {
  let clock = 0;
  const over = createReportLimiter(3, () => clock);
  assert.deepEqual([over(), over(), over(), over()], [false, false, false, true]);
  clock = 61_000;
  assert.equal(over(), false);
});
