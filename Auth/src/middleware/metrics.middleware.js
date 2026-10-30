import { httpRequestDuration, httpRequestsTotal } from "../observability/metrics.js";


export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const elapsedNanoseconds =
      process.hrtime.bigint() - start;

    const durationSeconds =
      Number(elapsedNanoseconds) / 1e9;

    // Use the matched route template, never the raw URL.
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : "unmatched";

    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });

  next();
}