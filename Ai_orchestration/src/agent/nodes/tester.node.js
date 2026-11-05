// tester.node.js
// Deterministic verification, no model call:
//   1. unit tests, only when package.json has a vitest/jest test script
//   2. production build, when a build script exists
// Pass/fail comes from the command's exit status.
//
// Vite builds go to node_modules/.orion-build-check and are removed after,
// so the user's own dist/ folder is never touched.

import { logToRun, readFiles, runCommand } from "../tools/sandbox.client.js";
import { normalizePath } from "../tools/guards.js";
import { LIMITS } from "../graph/orion.state.js";

const BUILD_CHECK_DIR = "node_modules/.orion-build-check";
const FILE_REF = /(?:\/workspace\/)?((?:[\w@.-]+\/)*[\w@.-]+\.(?:jsx?|tsx?|mjs|cjs|css|scss|sass|less|json|html|vue|svelte))(?::\d+)?/g;
const ERROR_LINE = /error|failed|cannot|could not|unexpected|not found|is not defined|does not provide/i;

const outputOf = (result) => [result.stdout, result.stderr, result.error].filter(Boolean).join("\n").trim();

/** Keeps the start and end of long logs, where build tools print errors. */
const trimLog = (text) => (text.length <= 5_000 ? text : `${text.slice(0, 3_000)}\n...[trimmed]...\n${text.slice(-2_000)}`);

const parseErrors = (output) => {
  const errorLines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => ERROR_LINE.test(l) && !l.startsWith("at "))
    .slice(0, 15);

  const flagged = new Set();
  for (const match of output.matchAll(FILE_REF)) {
    const file = normalizePath(match[1]);
    if (!file || file.includes("node_modules/") || file === "package-lock.json") continue;
    flagged.add(file);
  }
  return { errorLines, flaggedFiles: [...flagged].slice(0, 10) };
};

const runLogged = async (config, command, label) => {
  logToRun(config, `execute_command: start - "${label}"`);
  const result = await runCommand(config, command);
  logToRun(config, `execute_command: ${result.ok ? "success" : "error"} - "${label}"${result.timedOut ? " timed out" : ""}`);
  return result;
};

const failure = (stage, output, { timedOut = false, errorLines, flaggedFiles } = {}) => {
  const parsed = errorLines ? { errorLines, flaggedFiles } : parseErrors(output);
  const label = stage === "tests" ? "Unit tests" : "Build";
  return {
    testResults: {
      pass: false,
      stage,
      errorLines: parsed.errorLines,
      summary: timedOut ? `${label} timed out.` : `${label} failed with ${parsed.errorLines.length || "unknown"} error line(s).`,
    },
    buildLog: trimLog(output),
    flaggedFiles: parsed.flaggedFiles,
    currentSituation: `${label} failed${parsed.flaggedFiles.length ? ` in ${parsed.flaggedFiles.slice(0, 3).join(", ")}` : ""}.`,
  };
};

const passed = (summary, stage) => ({
  testResults: { pass: true, stage, errorLines: [], summary },
  buildLog: null,
  flaggedFiles: [],
  currentSituation: `Checks: ${summary}.`,
});

const testRunner = (pkg) => {
  const script = String(pkg.scripts?.test || "");
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!script) return null;
  if (deps.vitest || script.includes("vitest")) return { command: "npx vitest run --passWithNoTests 2>&1", label: "vitest run" };
  if (deps.jest || script.includes("jest")) return { command: "npx jest --ci --passWithNoTests 2>&1", label: "jest --ci" };
  return null;
};

export async function testerNode(_state, config) {
  const { files, missing } = await readFiles(config, ["package.json"]);
  const raw = files.get("package.json");
  if (!raw) {
    const reason = missing[0]?.error || "no package.json";
    return passed(`no build verification (${reason})`, "skipped");
  }

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (err) {
    const message = `package.json is not valid JSON: ${err.message}`;
    return failure("build", message, { errorLines: [message], flaggedFiles: ["package.json"] });
  }

  const checks = [];

  const runner = testRunner(pkg);
  if (runner) {
    const result = await runLogged(config, runner.command, runner.label);
    if (!result.ok) return failure("tests", outputOf(result), { timedOut: result.timedOut });
    checks.push("unit tests passed");
  }

  const buildScript = String(pkg.scripts?.build || "");
  if (buildScript) {
    const isViteBuild = /vite\s+build[^&|;]*$/.test(buildScript);
    const command = isViteBuild ? `npm run build -- --outDir ${BUILD_CHECK_DIR} --emptyOutDir 2>&1` : "npm run build 2>&1";
    const result = await runLogged(config, command, "npm run build");
    if (isViteBuild) await runCommand(config, `rm -rf ${BUILD_CHECK_DIR}`);
    if (!result.ok) return failure("build", outputOf(result), { timedOut: result.timedOut });
    checks.push("production build passed");
  }

  return checks.length
    ? passed(checks.join(", "), "build")
    : passed("no test or build script in package.json, nothing to run", "skipped");
}

export function testerEdge(state) {
  if (state.testResults?.pass) return "reviewer";
  return state.retryCount >= LIMITS.maxFixAttempts ? "finalizer" : "debugger";
}
