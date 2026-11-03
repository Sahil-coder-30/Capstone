// toolResult.js
// Every tool returns a JSON string. Failures always carry `"error": true`
// so the model and toolActivity.js can never mistake them for success.

const MAX_RESULT_CHARS = 24_000;

export const toolError = (message, extra = {}) => JSON.stringify({ error: true, message, ...extra });

export const toolOk = (data) => {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return JSON.stringify({
    truncated: true,
    note: `Result was ${text.length} chars and was cut to ${MAX_RESULT_CHARS}. Ask for less (fewer files, a narrower search).`,
    partial: text.slice(0, MAX_RESULT_CHARS),
  });
};

/** Converts a sandbox client result into a tool result string. */
export const fromSandbox = (res, failureMessage) =>
  res.ok ? toolOk(res.data) : toolError(`${failureMessage}: ${res.error}`);
