// tester.node.js
// Deterministic verification. No LLM call.
//   1. Unit tests, only when package.json has a test script using vitest/jest.
//   2. Production build ("npm run build") when a build script exists.
// Pass/fail comes from the command's exit status, not from regex guessing.
//
// Vite builds are written to node_modules/.orion-build-check and removed
// afterwards, so the user's own dist/ or build/ folders are never touched.

import { runSandboxCommand, readSandboxFiles, logToRun } from "../sandboxClient.js";
import { normalizePath } from "../guards.js";
import { truncate } from "../agentUtils.js";

const BUILD_CHECK_DIR = "node_modules/.orion-build-check";
const FILE_REF = /(?:\/workspace\/)?((?:[\w@.-]+\/)*[\w@.-]+\.(?:jsx?|tsx?|mjs|cjs|css|scss|sass|less|json|html|vue|svelte))(?::(\d+))?/g;

const combinedOutput = (result) =>
  [result.stdout, result.stderr, result.error].filter(Boolean).join("\n").trim();

/** Keeps the start and end of long logs, where build tools print errors. */
const trimLog = (text) =>
  text.length <= 5_000 ? text : `${text.slice(0, 3_000)}\n...[trimmed]...\n${text.slice(-2_000)}`;

const parseErrors = (output) => {
  const errorLines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /error|failed|cannot|could not|unexpected|not found|is not defined|does not provide/i.test(l))
    .filter((l) => !/^\s*at\s/.test(l))
    .slice(0, 15);

  const flagged = new Set();
  for (const match of output.matchAll(FILE_REF)) {
    const file = normalizePath(match[1]);
    if (!file || file.startsWith("node_modules/") || file.includes("/node_modules/")) continue;
    if (file === "package.json" || file === "package-lock.json") continue;
    flagged.add(file);
  }
  return { errorLines, flaggedFiles: [...flagged].slice(0, 10) };
};

const runLogged = async (config, command, label) => {
  logToRun(config, `executeCommand: start - command: "${label}"`);
  const result = await runSandboxCommand(config, command);
  logToRun(
    config,
    result.ok
      ? `executeCommand: success - "${label}" passed`
      : `executeCommand: error - "${label}" failed${result.timedOut ? " (timed out)" : ""}`,
  );
  return result;
};

const failure = (state, stage, result) => {
  const output = combinedOutput(result);
  const { errorLines, flaggedFiles } = parseErrors(output);
  return {
    testResults: {
      pass: false,
      stage,
      timedOut: result.timedOut,
      errorLines,
      summary: result.timedOut
        ? `${stage === "tests" ? "Unit tests" : "Build"} timed out.`
        : `${stage === "tests" ? "Unit tests" : "Build"} failed with ${errorLines.length || "unknown"} error line(s).`,
    },
    buildLog: trimLog(output),
    flaggedFiles,
    lastNodeInvoked: "tester",
    taskStatus: stage === "tests" ? "tests_failed" : "build_failed",
    currentSituation: `Tester: ${stage === "tests" ? "unit tests" : "build"} failed${flaggedFiles.length ? ` in ${flaggedFiles.slice(0, 3).join(", ")}` : ""}.`,
  };
};

export async function testerNode(state, config) {
  const { files } = await readSandboxFiles(config, ["package.json"]);
  const pkgRaw = files.get("package.json");

  let pkg = null;
  try {
    pkg = pkgRaw ? JSON.parse(pkgRaw) : null;
  } catch (err) {
    // A broken package.json is itself a failure the debugger should fix.
    return {
      testResults: {
        pass: false,
        stage: "build",
        errorLines: [`package.json is not valid JSON: ${err.message}`],
        summary: "package.json is not valid JSON.",
      },
      buildLog: `package.json parse error: ${err.message}`,
      flaggedFiles: ["package.json"],
      lastNodeInvoked: "tester",
      taskStatus: "build_failed",
      currentSituation: "Tester: package.json is not valid JSON.",
    };
  }

  if (!pkg) {
    return {
      testResults: { pass: true, stage: "skipped", errorLines: [], summary: "No package.json, nothing to build." },
      buildLog: null,
      flaggedFiles: [],
      lastNodeInvoked: "tester",
      taskStatus: "tests_skipped",
      currentSituation: "Tester: no package.json found, skipped build verification.",
    };
  }

  const scripts = pkg.scripts || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const checks = [];

  // ── 1. Unit tests ────────────────────────────────────────────────────────
  const testScript = String(scripts.test || "");
  const runner = deps.vitest || /vitest/.test(testScript) ? "vitest" : deps.jest || /jest/.test(testScript) ? "jest" : null;
  if (runner && testScript) {
    const command = runner === "vitest"
      ? "npx vitest run --passWithNoTests 2>&1"
      : "npx jest --ci --passWithNoTests 2>&1";
    const result = await runLogged(config, command, runner === "vitest" ? "vitest run" : "jest --ci");
    if (!result.ok) return failure(state, "tests", result);
    checks.push("unit tests passed");
  }

  // ── 2. Production build ──────────────────────────────────────────────────
  const buildScript = String(scripts.build || "");
  if (buildScript) {
    const endsWithViteBuild = /vite\s+build[^&|;]*$/.test(buildScript);
    const command = endsWithViteBuild
      ? `npm run build -- --outDir ${BUILD_CHECK_DIR} --emptyOutDir 2>&1`
      : "npm run build 2>&1";
    const result = await runLogged(config, command, "npm run build");
    if (endsWithViteBuild) await runSandboxCommand(config, `rm -rf ${BUILD_CHECK_DIR}`, { timeoutMs: 30_000 });
    if (!result.ok) return failure(state, "build", result);
    checks.push("production build passed");
  }

  const summary = checks.length
    ? checks.join(", ")
    : "No test or build script in package.json, nothing to run.";

  return {
    testResults: { pass: true, stage: checks.length ? "build" : "skipped", errorLines: [], summary: truncate(summary, 200) },
    buildLog: null,
    flaggedFiles: [],
    lastNodeInvoked: "tester",
    taskStatus: checks.length ? "tests_passed" : "tests_skipped",
    currentSituation: `Tester: ${summary}.`,
  };
}

export function testerEdge(state) {
  if (state.testResults?.pass) return "reviewer";
  if ((state.retryCount || 0) >= (state.maxRetries || 3)) return "finalizer";
  return "debugger";
}
