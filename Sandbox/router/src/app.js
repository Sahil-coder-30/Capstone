import express from 'express';
import morgan from 'morgan';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { refreshTTL } from './config/redis.js';

const app = express();
app.use(morgan('combined'));

app.get("/api/router/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        message: "Sandbox API is working fine"
    });
});

app.get("/api/router/ready", (req, res) => {
    res.status(200).json({
        status: "ready",
        message: "Sandbox API is ready to accept traffic"
    });
});

// The sandbox id is taken from the Host header and becomes part of the proxy
// target hostname. Restrict it to a single DNS label so values such as
// "x@10.0.0.5" or "x:8080" cannot point the proxy at another internal host.
const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const parseSandboxHost = (host) => {
    if (!host) return null;
    const [sandboxId, targetHost] = host.toLowerCase().split('.');
    if (!SANDBOX_ID_PATTERN.test(sandboxId || '')) return null;
    if (targetHost !== 'agent' && targetHost !== 'preview') return null;
    return { sandboxId, targetHost };
};

// Caches for HTTP proxies (ws: false to prevent auto upgrade subscription)
const httpProxies = {};
const httpAgentProxies = {};

// Caches for WebSocket proxies (ws: true, but not mounted as express middleware, so no auto subscription)
const wsProxies = {};
const wsAgentProxies = {};

const getHttpProxy = (sandboxId) => {
    if (!httpProxies[sandboxId]) {
        httpProxies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}`,
            changeOrigin: true,
            ws: false
        });
    }
    return httpProxies[sandboxId];
};

const getHttpAgentProxy = (sandboxId) => {
    if (!httpAgentProxies[sandboxId]) {
        httpAgentProxies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}:3000`,
            changeOrigin: true,
            ws: false
        });
    }
    return httpAgentProxies[sandboxId];
};

const getWsProxy = (sandboxId) => {
    if (!wsProxies[sandboxId]) {
        wsProxies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}`,
            changeOrigin: true,
            ws: true,
            on: {
                error: (err, req, res) => {
                    console.error(`[Router Preview WS Error] sandboxId: ${sandboxId}, url: ${req?.url}, err:`, err);
                },
                proxyReqWs: (proxyReq, req, socket, options) => {
                    console.log(`[Router Preview WS Upgrade] sandboxId: ${sandboxId}, url: ${req?.url}`);
                },
                open: (proxySocket) => {
                    console.log(`[Router Preview WS Connected] sandboxId: ${sandboxId}`);
                },
                close: (res, socket, head) => {
                    console.log(`[Router Preview WS Closed] sandboxId: ${sandboxId}`);
                }
            }
        });
    }
    return wsProxies[sandboxId];
};

const getWsAgentProxy = (sandboxId) => {
    if (!wsAgentProxies[sandboxId]) {
        wsAgentProxies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}:3000`,
            changeOrigin: true,
            ws: true,
            on: {
                error: (err, req, res) => {
                    console.error(`[Router Agent WS Error] sandboxId: ${sandboxId}, url: ${req?.url}, err:`, err);
                },
                proxyReqWs: (proxyReq, req, socket, options) => {
                    console.log(`[Router Agent WS Upgrade] sandboxId: ${sandboxId}, url: ${req?.url}`);
                },
                open: (proxySocket) => {
                    console.log(`[Router Agent WS Connected] sandboxId: ${sandboxId}`);
                },
                close: (res, socket, head) => {
                    console.log(`[Router Agent WS Closed] sandboxId: ${sandboxId}`);
                }
            }
        });
    }
    return wsAgentProxies[sandboxId];
};

app.use(async (req, res, next) => {
    const host = req.headers.host;

    if (!host) {
        return res.status(400).json({ status: "error", message: "Missing host header" });
    }

    const parsed = parseSandboxHost(host);
    if (!parsed) {
        return next();
    }
    const { sandboxId, targetHost } = parsed;

    await refreshTTL(sandboxId);

    if (targetHost === 'agent') {
        return getHttpAgentProxy(sandboxId)(req, res, next);
    } else if (targetHost === 'preview') {
        return getHttpProxy(sandboxId)(req, res, next);
    }

    next();
});

// Create the raw HTTP server so we can hook into the 'upgrade' event.
const server = http.createServer(app);

server.on('upgrade', async (req, socket, head) => {
    const host = req.headers.host;
    console.log(`[Router Upgrade] Host: ${host}, URL: ${req.url}`);

    if (!host) {
        console.log('[Router Upgrade] Missing host header');
        socket.destroy();
        return;
    }

    const parsed = parseSandboxHost(host);
    if (!parsed) {
        console.log('[Router Upgrade] Rejected invalid sandbox host');
        socket.destroy();
        return;
    }
    const { sandboxId, targetHost } = parsed;
    await refreshTTL(sandboxId);
    console.log(`[Router Upgrade] sandboxId: ${sandboxId}, targetHost: ${targetHost}`);

    let proxy;
    if (targetHost === 'agent') {
        proxy = getWsAgentProxy(sandboxId);
    } else if (targetHost === 'preview') {
        proxy = getWsProxy(sandboxId);
    }

    if (proxy) {
        console.log(`[Router Upgrade] Forwarding upgrade to proxy. targetHost: ${targetHost}, proxy.upgrade exists: ${typeof proxy.upgrade === 'function'}`);
        if (typeof proxy.upgrade === 'function') {
            proxy.upgrade(req, socket, head);
        } else {
            console.log('[Router Upgrade] proxy.upgrade is not a function');
            socket.destroy();
        }
    } else {
        console.log('[Router Upgrade] No proxy found for targetHost:', targetHost);
        socket.destroy();
    }
});


export default server;