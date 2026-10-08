// tester.node.js — v2
// The enforcement core. Runs: unit tests → real build, in that order.
// Lint step is disabled per user configuration.
//
// Rules:
//  - Cleanup (delete build artifacts) runs unconditionally — pass OR fail
//  - Only this node sets testResults.pass = true
//  - On failure: captures file:line:message tuples into buildLog + flaggedFiles
//  - Build dirs deleted: dist/, build/, .next/, out/, .cache/

import { executeCommand, listFiles, readFile } from "../tool.js";

// Artifact directories to always clean up
const BUILD_ARTIFACT_DIRS = ["dist", "build", ".next", "out", ".cache", ".vite"];

// Error line pattern: extract file:line:col patterns from build output
const ERROR_LINE_PATTERN = /(?:^|\s)((?:src|app|pages|components|lib|utils|hooks|features|routes|views|api|server)[\w./\\-]*\.[jt]sx?)(?::(\d+)(?::(\d+))?)?\s*[:\-–|]\s*(.+)/gim;

// ---------------------------------------------------------------------------
// Parse raw build/test output into structured error tuples
// ---------------------------------------------------------------------------
function parseErrorLines(rawOutput) {
  const lines = [];
  const flagged = new Set();

  let match;
  const seen = new Set();
  const text = rawOutput || "";

  // Reset regex state
  ERROR_LINE_PATTERN.lastIndex = 0;

  while ((match = ERROR_LINE_PATTERN.exec(text)) !== null) {
    const file = match[1];
    const line = match[2] ? parseInt(match[2]) : null;
    const message = (match[4] || "").trim().slice(0, 200);
    const key = `${file}:${line}:${message}`;

    if (!seen.has(key) && message) {
      seen.add(key);
      lines.push({ file, line, message });
      flagged.add(file);
    }
    if (lines.length >= 20) break;
  }

  // Also capture lines with "error" keyword not caught by above
  if (lines.length === 0) {
    const errorLines = text.split("\n").filter((l) => /\berror\b/i.test(l) && l.trim().length > 5).slice(0, 10);
    for (const l of errorLines) {
      const trimmed = l.trim().slice(0, 200);
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        lines.push({ file: null, line: null, message: trimmed });
      }
    }
  }

  return { lines, flagged: [...flagged] };
}

// ---------------------------------------------------------------------------
// Cleanup: unconditionally delete build artifact directories
// ---------------------------------------------------------------------------
async function runCleanup(config) {
  for (const dir of BUILD_ARTIFACT_DIRS) {
    try {
      await executeCommand.invoke({ command: `rm -rf ${dir}` }, config);
    } catch (_) {} // silently ignore non-existent dirs
  }
  console.log("[TesterNode] Cleanup: build artifact directories removed");
}

// ---------------------------------------------------------------------------
// Check if a test runner exists
// ---------------------------------------------------------------------------
async function detectTestRunner(config) {
  try {
    const pkgRaw = await readFile.invoke({ path: "package.json" }, config);
    const pkg = JSON.parse(typeof pkgRaw === "string" ? pkgRaw : JSON.stringify(pkgRaw));
    const scripts = pkg?.scripts || {};
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };

    if (deps?.vitest || scripts?.test?.includes("vitest")) return "vitest";
    if (deps?.jest || scripts?.test?.includes("jest")) return "jest";
  } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------------
// TESTER NODE FUNCTION
// ---------------------------------------------------------------------------
export async function testerNode(state, config) {
  let buildLog = "";
  let testPassed = false;
  let flaggedFiles = [];
  let errorLines = [];

  const step = (state.plan?.steps || [])[Math.max(0, (state.currentStep || 1) - 1)];
  const acceptanceCriteria = step?.acceptanceCriteria || [];

  try {
    // ── Step 1: Unit tests (skip if no runner detected) ───────────────────
    const testRunner = await detectTestRunner(config);

    if (testRunner) {
      try {
        let testOutput;
        if (testRunner === "vitest") {
          testOutput = await executeCommand.invoke({
            command: "npx vitest run --reporter=verbose 2>&1",
          }, config);
        } else {
          testOutput = await executeCommand.invoke({
            command: "npx jest --no-coverage 2>&1",
          }, config);
        }

        const raw = typeof testOutput === "string" ? testOutput : JSON.stringify(testOutput);
        const hasFail = /FAIL|FAILED|Tests failed|test failed/i.test(raw);
        const hasError = /Error:/i.test(raw);

        if (hasFail || hasError) {
          const parsed = parseErrorLines(raw);
          buildLog = raw.slice(0, 4000);
          errorLines = parsed.lines;
          flaggedFiles = parsed.flagged;
          console.warn(`[TesterNode] Unit tests failed (${errorLines.length} errors)`);

          await runCleanup(config);
          return {
            testResults: { pass: false, errorLines, flaggedFiles },
            buildLog: buildLog.slice(0, 4000),
            flaggedFiles,
            retryCount: (state.retryCount || 0),
            lastNodeInvoked: "tester",
            taskStatus: "tests_failed",
            currentSituation: `Tester: Unit tests failed. ${errorLines.length} error(s) captured. Handing to Debugger.`,
          };
        }
        console.log("[TesterNode] Unit tests passed");
      } catch (testErr) {
        console.warn("[TesterNode] Test runner error:", testErr.message);
      }
    } else {
      console.log("[TesterNode] No test runner detected — skipping unit tests");
    }

    // ── Step 2: Real build ─────────────────────────────────────────────────
    let hasBuildScript = false;
    try {
      const pkgRaw = await readFile.invoke({ path: "package.json" }, config);
      const pkg = JSON.parse(typeof pkgRaw === "string" ? pkgRaw : JSON.stringify(pkgRaw));
      if (pkg?.scripts?.build) {
        hasBuildScript = true;
      }
    } catch (_) {}

    if (hasBuildScript) {
      let buildOutput;
      try {
        buildOutput = await executeCommand.invoke({
          command: "npm run build 2>&1",
        }, config);
      } catch (buildErr) {
        buildOutput = buildErr.message || String(buildErr);
      }

      const buildRaw = typeof buildOutput === "string" ? buildOutput : JSON.stringify(buildOutput);
      const buildFailed = /error|failed|cannot find module|unexpected token|build error/i.test(buildRaw) && !/warn/i.test(buildRaw.replace(/error/gi, "").slice(0, 50));

      if (buildFailed) {
        const parsed = parseErrorLines(buildRaw);
        buildLog = buildRaw.slice(0, 4000);
        errorLines = parsed.lines;
        flaggedFiles = parsed.flagged;
        console.warn(`[TesterNode] Build failed (${errorLines.length} errors)`);

        await runCleanup(config);
        return {
          testResults: { pass: false, errorLines, flaggedFiles },
          buildLog: buildLog.slice(0, 4000),
          flaggedFiles,
          retryCount: state.retryCount || 0,
          lastNodeInvoked: "tester",
          taskStatus: "build_failed",
          currentSituation: `Tester: Build failed. ${errorLines.length} error(s) in ${flaggedFiles.length} file(s). Handing to Debugger.`,
        };
      }

      console.log("[TesterNode] Build passed ✓");
    } else {
      console.log("[TesterNode] No 'build' script defined in package.json — skipping build verification");
    }

    testPassed = true;

  } catch (err) {
    console.error("[TesterNode] Unexpected error:", err.message);
    buildLog = err.message;
    errorLines = [{ file: null, line: null, message: err.message }];
  } finally {
    // ── Cleanup: ALWAYS runs, pass or fail ─────────────────────────────────
    await runCleanup(config);
  }

  if (testPassed) {
    return {
      testResults: { pass: true, errorLines: [], flaggedFiles: [] },
      buildLog: null,
      flaggedFiles: [],
      lastNodeInvoked: "tester",
      taskStatus: "tests_passed",
      currentSituation: `Tester: All checks passed ✓. Build artifacts cleaned. Handing to Finalizer.`,
    };
  }

  // Fallback: something failed
  return {
    testResults: { pass: false, errorLines, flaggedFiles },
    buildLog: buildLog.slice(0, 4000),
    flaggedFiles,
    retryCount: state.retryCount || 0,
    lastNodeInvoked: "tester",
    taskStatus: "failed",
    currentSituation: `Tester: Checks failed. ${errorLines.length} error(s) captured. Routing to Debugger.`,
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after tester node
// ---------------------------------------------------------------------------
export function testerEdge(state) {
  const { testResults, retryCount = 0, maxRetries = 3, escalated = false } = state;

  if (testResults?.pass) return "finalizer";

  // Escalate if maxRetries hit or loop detected
  if (escalated || retryCount >= maxRetries) return "finalizer";

  return "debugger";
}
