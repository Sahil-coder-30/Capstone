#!/usr/bin/env node
// One rule for agents in this repo:
//   Nothing outside the project folder (denied), except temp folders and
//   this project's Claude Code memory folder.
// Everything else, deletes included, runs without a prompt.

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ALLOWED_PATHS = ["/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr", "/dev/tty"];
const TEMP_DIR = /^\/(private\/)?tmp(\/|$)/;

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cwd = input.cwd || projectDir;

// Claude Code's memory folder for this project, e.g.
// ~/.claude/projects/-Users-home-Desktop-Capstone/memory
const MEMORY_DIR = path.join(os.homedir(), ".claude", "projects", projectDir.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
const isMemoryPath = (p) => {
  const abs = path.resolve(cwd, p.replace(/^~(?=\/|$)/, os.homedir()));
  return abs === MEMORY_DIR || abs.startsWith(MEMORY_DIR + path.sep);
};

const decide = (permissionDecision, permissionDecisionReason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason },
  }));
  process.exit(0);
};

const isOutside = (target) => {
  const clean = target.replace(/^["']|["']$/g, "");
  if (ALLOWED_PATHS.includes(clean) || TEMP_DIR.test(clean) || isMemoryPath(clean)) return false;
  if (clean === "~" || clean.startsWith("~/") || /^\$\{?HOME\}?/.test(clean)) return true;
  const rel = path.relative(projectDir, path.resolve(cwd, clean));
  return rel.startsWith("..") || path.isAbsolute(rel);
};

const looksLikePath = (t) =>
  t.startsWith("/") || t.startsWith("~") || /^\$\{?HOME\}?/.test(t) ||
  t === ".." || t.startsWith("../") || t.includes("/../");

const tool = input.tool_name || "";
const toolInput = input.tool_input || {};

if (tool === "Bash") {
  const command = String(toolInput.command || "");
  if (isOutside(cwd)) decide("deny", `Commands must run inside ${projectDir}`);
  const tokens = command.split(/[\s;&|()<>'"`=]+/).filter(Boolean);
  const outside = tokens.find((t) => looksLikePath(t) && !t.startsWith("//") && isOutside(t));
  if (outside) decide("deny", `"${outside}" is outside ${projectDir}`);
} else {
  const target = toolInput.file_path || toolInput.path || toolInput.notebook_path;
  if (target && isOutside(String(target))) decide("deny", `"${target}" is outside ${projectDir}`);
}

process.exit(0);
