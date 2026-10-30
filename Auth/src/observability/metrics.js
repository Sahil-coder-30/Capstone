import client from "prom-client";

const register = new client.Registry();

register.setDefaultLabels({
    service: "auth",
});

client.collectDefaultMetrics({
    register,
    prefix: "taksha_",
});

const httpRequestsTotal = new client.Counter({
    name: "taksha_http_requests_total",
    help: "Total HTTP requests received by the Auth service",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
});

const httpRequestDuration = new client.Histogram({
    name: "taksha_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [
        0.01,
        0.025,
        0.05,
        0.1,
        0.25,
        0.5,
        1,
        2.5,
        5,
    ],
    registers: [register],
});


export {
    register,
    httpRequestDuration,
    httpRequestsTotal
};