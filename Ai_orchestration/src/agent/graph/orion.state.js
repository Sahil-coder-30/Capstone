// orion.state.js
// The shared state every Orion node reads and updates.

import { Annotation } from "@langchain/langgraph";

/** Limits that keep a run bounded. */
export const LIMITS = {
  maxPlanSteps: 8,
  maxFilesPerStep: 5,
  maxPlanRevisions: 2,   // automatic re-plans after the critic finds problems
  maxStepAttempts: 2,    // a failed step gets one more try
  maxFixAttempts: 3,     // debugger passes
};

// Last write wins.
const value = (initial) => Annotation({ reducer: (_prev, next) => next, default: () => initial });

// Appends; null resets.
const list = () =>
  Annotation({
    reducer: (prev, next) => (next === null ? [] : [...prev, ...(Array.isArray(next) ? next : [next])]),
    default: () => [],
  });

// Union of strings; null resets.
const set = () =>
  Annotation({
    reducer: (prev, next) => (next === null ? [] : [...new Set([...prev, ...(next || [])])]),
    default: () => [],
  });

export const OrionState = Annotation.Root({
  // Input
  task: value(""),
  messages: value([]),           // earlier chat turns, read-only context
  autoApprovePlan: value(false),

  // Router
  intent: value("coding"),       // general | coding
  taskSubType: value(null),      // new_feature | bug_fix | refactor

  // Planning
  existingFiles: value([]),
  planAnalysis: value(""),
  plan: value(null),
  planError: value(null),
  planWarnings: value([]),
  planRevisions: value(0),
  criticPass: value(false),
  criticFeedback: value(""),
  planApproved: value(false),
  planFeedback: value(""),

  // Coding
  currentStep: value(0),
  stepReports: list(),
  filesTouched: set(),

  // Verification and fixing
  testResults: value(null),
  buildLog: value(null),
  flaggedFiles: value([]),
  review: value(null),
  attemptedFixes: list(),
  retryCount: value(0),
  escalated: value(false),
  escalationReason: value(""),

  // Output
  finalAnswer: value(""),
  outcome: value(null),          // answered | complete | partial | failed
  currentSituation: value("Starting."),
});
