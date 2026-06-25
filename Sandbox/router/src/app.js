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

const proxyies = {};
const agentProxyies = {};

const getProxyies = (sandboxId) => {
    if (!proxyies[sandboxId]) {
        proxyies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}`,
            changeOrigin: false,
            ws: false,
        });
    }
    return proxyies[sandboxId];
};

const getAgentProxy = (sandboxId) => {
    if (!agentProxyies[sandboxId]) {
        agentProxyies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}:3000`,
            changeOrigin: true,
            ws: false,
        });
    }
    return agentProxyies[sandboxId];
};

app.use(async (req, res, next) => {
    const host = req.headers.host;

    if (!host) {
        return res.status(400).json({ status: "error", message: "Missing host header" });
    }

    const sandboxId = host.split('.')[0];
    const targetHost = host.split('.')[1];

    await refreshTTL(sandboxId);

    if (targetHost === 'agent') {
        return getAgentProxy(sandboxId)(req, res, next);
    } else if (targetHost === 'preview') {
        return getProxyies(sandboxId)(req, res, next);
    }

    next();
});

// Create the raw HTTP server so we can hook into the 'upgrade' event.
// Express's app.listen() does this internally too, but we need a direct
// reference to attach the WebSocket upgrade handler ourselves, since
// upgrade events never pass through Express's middleware chain.
const server = http.createServer(app);

server.on('upgrade', async (req, socket, head) => {
    const host = req.headers.host;
    console.log(`[Router Upgrade] Host: ${host}, URL: ${req.url}`);

    if (!host) {
        console.log('[Router Upgrade] Missing host header');
        socket.destroy();
        return;
    }

    const sandboxId = host.split('.')[0];
    const targetHost = host.split('.')[1];
    await refreshTTL(sandboxId);
    console.log(`[Router Upgrade] sandboxId: ${sandboxId}, targetHost: ${targetHost}`);

    let proxy;
    if (targetHost === 'agent') {
        proxy = getAgentProxy(sandboxId);
    } else if (targetHost === 'preview') {
        proxy = getProxyies(sandboxId);
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