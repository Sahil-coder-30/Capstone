// Turns the raw tool log lines from the agent into one row per tool call.
// Log formats come from Ai_orchestration/src/agent/tool.js and tester.node.js.

const WRITE_KINDS = { createFile: 'create', updateFile: 'update', patchFile: 'update', deleteFile: 'delete' };

const TOOLS = {
  listFiles: { active: 'Scanning', done: 'Scanned', target: () => ['project files'] },
  readFile: { active: 'Reading', done: 'Read', target: (body) => filesFrom(body, 'files'), isFile: true },
  createFile: { active: 'Creating', done: 'Created', target: (body) => filesFrom(body, 'files'), isFile: true },
  updateFile: { active: 'Updating', done: 'Updated', target: (body) => filesFrom(body, 'updates'), isFile: true },
  patchFile: { active: 'Editing', done: 'Edited', target: (body) => quoted(body, /file: "([^"]+)"/), isFile: true },
  deleteFile: { active: 'Deleting', done: 'Deleted', target: (body) => filesFrom(body, 'files'), isFile: true },
  executeCommand: { active: 'Running', done: 'Ran', target: (body) => quoted(body, /command: "(.*?)"(?:, subDir:|$)/) },
  getViteRuntimeErrors: { active: 'Checking', done: 'Checked', target: () => ['Vite errors'] },
  searchCode: { active: 'Searching', done: 'Searched', target: (body) => quoted(body, /pattern: (.*?), isRegex:/) },
  searchInternet: { active: 'Searching', done: 'Searched', target: (body) => quoted(body, /query: "(.*)"$/) },
};

const quoted = (body, pattern) => {
  const match = pattern.exec(body);
  return match?.[1] ? [match[1]] : [];
};

/** Reads file paths out of `files: [...]` or `updates: [...]`, even when the JSON was cut short. */
const filesFrom = (body, field) => {
  const start = body.indexOf(`${field}: `);
  if (start === -1) return [];
  const json = body.slice(start + field.length + 2);
  try {
    const parsed = JSON.parse(json);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item) => (typeof item === 'string' ? item : item?.file)).filter(Boolean);
  } catch {
    const inObjects = [...json.matchAll(/"file"\s*:\s*"([^"\\]+)"/g)].map((m) => m[1]);
    if (inObjects.length) return inObjects;
    return [...json.matchAll(/"([^"\\]+)"/g)].map((m) => m[1]);
  }
};

const classify = (tool, body) => {
  if (tool === 'patchFile') {
    if (/^attempt 1 - /.test(body)) return 'start';
    if (/^(attempt 1|auto-rewrite) success/.test(body)) return 'success';
    if (/^attempt 1 failed|^auto-rewrite (with|\()/.test(body)) return 'progress';
    return 'error';
  }
  if (/^start\b/.test(body)) return 'start';
  if (/^success\b/.test(body)) return 'success';
  if (/^error\b/.test(body)) return 'error';
  return 'progress';
};

const createStep = (id, tool, targets, status) => ({
  id,
  tool,
  targets,
  status,
  verb: { active: TOOLS[tool]?.active || tool, done: TOOLS[tool]?.done || tool },
  isFile: Boolean(TOOLS[tool]?.isFile),
});

/**
 * Pairs each tool's start line with its result line, oldest open call first.
 * `live` false means the run is over, so a call with no result is `info`, not running.
 */
export function buildToolSteps(logs, { live = false } = {}) {
  const steps = [];
  (logs || []).forEach((log, index) => {
    const colon = log.indexOf(':');
    if (colon === -1) return;
    const tool = log.slice(0, colon).trim();
    if (tool === 'model') return;
    const body = log.slice(colon + 1).trim();
    const kind = classify(tool, body);
    const targetsOf = () => TOOLS[tool]?.target(body) || [];

    if (kind === 'start') {
      steps.push(createStep(index, tool, targetsOf(), 'running'));
      return;
    }
    if (kind === 'progress') return;

    const open = steps.find((step) => step.tool === tool && step.status === 'running');
    if (open) open.status = kind;
    else steps.push(createStep(index, tool, targetsOf(), kind));
  });

  if (live) return steps;
  return steps.map((step) => (step.status === 'running' ? { ...step, status: 'info' } : step));
}

/** Files really written by the run. A failed write is not a change. */
export function getChangedFiles(steps) {
  const files = new Map();
  (steps || []).forEach((step) => {
    const type = WRITE_KINDS[step.tool];
    if (!type || step.status !== 'success') return;
    step.targets.forEach((path) => {
      const wasCreated = files.get(path) === 'create';
      if (type === 'delete' && wasCreated) files.delete(path);
      else if (type === 'delete' || !wasCreated) files.set(path, type);
    });
  });
  return [...files.entries()]
    .filter(([path]) => !path.includes('todo.md'))
    .map(([path, type]) => ({ path, type }));
}

export const getStepVerb = (step) => {
  if (step.status === 'running') return step.verb.active;
  return step.status === 'error' ? 'Failed' : step.verb.done;
};

export const formatTargets = (targets = []) => {
  if (targets.length <= 1) return targets[0] || '';
  return `${targets[0]} +${targets.length - 1}`;
};
