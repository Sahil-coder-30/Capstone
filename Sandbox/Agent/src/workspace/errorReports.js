// errorReports.js
// Input handling for the open /api/agent/report-error route. The preview app
// posts browser errors there without a token, so the input is untrusted:
// fields are capped and stripped of control characters (an escape sequence
// must never reach the owner's terminal), and the route is rate limited.

const MAX_PER_MINUTE = 30;
const MAX_FIELD = 2000;

/** Keeps newlines, drops every other control character, caps the length. */
export const cleanReportField = (value) =>
  String(value ?? "").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "").slice(0, MAX_FIELD);

export function cleanErrorReport(body = {}) {
  return {
    type: cleanReportField(body.type).slice(0, 20) || "error",
    message: cleanReportField(body.message),
    source: cleanReportField(body.source),
    line: Number(body.line) || 0,
    col: Number(body.col) || 0,
    stack: cleanReportField(body.stack),
  };
}

/** Fixed one-minute window for the whole sandbox. Returns true when over the limit. */
export function createReportLimiter(maxPerMinute = MAX_PER_MINUTE, now = () => Date.now()) {
  let window = { start: 0, count: 0 };
  return () => {
    const t = now();
    if (t - window.start > 60_000) window = { start: t, count: 0 };
    window.count += 1;
    return window.count > maxPerMinute;
  };
}
