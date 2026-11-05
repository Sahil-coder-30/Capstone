// invokeRoute.js
// Runs a REST handler in-process for an MCP tool call. The handlers only read
// req.query / req.body and only answer with res.status(n).json(body), so a
// small stand-in for req and res is enough. REST and MCP share one code path.

const HANDLER_TIMEOUT_MS = 150_000;

/** @returns {Promise<{ status: number, body: any }>} */
export function invokeRoute(handler, { query = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const timer = setTimeout(() => reject(new Error("The sandbox operation timed out.")), HANDLER_TIMEOUT_MS);
    const res = {
      status(code) {
        status = code;
        return res;
      },
      json(data) {
        clearTimeout(timer);
        resolve({ status, body: data });
        return res;
      },
    };
    Promise.resolve()
      .then(() => handler({ query, body, headers: {} }, res))
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
