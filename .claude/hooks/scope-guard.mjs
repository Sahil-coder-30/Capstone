#!/usr/bin/env node
// Two rules for agents in this repo:
//   1. Nothing outside the project folder (denied).
//   2. Deleting files asks the developer first. Everything else runs freely.

import { readFileSync } from "node:fs";
import path from "node:path";

const ALLOWED_PATHS = ["/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr", "/dev/tty"];
const FILE_DELETE = /(^|[\s;&|(])(rm|rmdir|unlink|shred|trash)(\s|$)|\bfind\b[^|;&]*\s-delete\b|\bfind\b[^|;&]*-exec\s+rm\b|\b(unlinkSync|rmSync|rmdirSync|fs\.rm|fs\.unlink|fs\.rmdir|shutil\.rmtree|os\.remove|os\.unlink)\b/;

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cwd = input.cwd || projectDir;

const decide = (permissionDecision, permissionDecisionReason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason },
  }));
  process.exit(0);
};

const isOutside = (target) => {
  const clean = target.replace(/^["']|["']$/g, "");
  if (ALLOWED_PATHS.includes(clean)) return false;
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
  if (FILE_DELETE.test(command)) decide("ask", "This command deletes files");
} else {
  const target = toolInput.file_path || toolInput.path || toolInput.notebook_path;
  if (target && isOutside(String(target))) decide("deny", `"${target}" is outside ${projectDir}`);
}

process.exit(0);
