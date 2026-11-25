import express from 'express';
import morgan from 'morgan';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { redis, refreshTTL } from './config/redis.js';
import { createMcpGateway } from './mcpGateway.js';
import { createInternalMcpProxy } from './internalMcpProxy.js';
import {
    SESSION_PATH,
    SHARE_PATH,
    SHARE_MAX_TTL_SECONDS,
    createAccessTokenVerifier,
    createOwnerLookup,
    createSandboxEdgeAuth,
} from './sandboxEdgeAuth.js';

const app = express();
// Never log the single-use preview ticket (/__taksha/session?ticket=...) or a
// share-link token (/__taksha/share?t=...): either one opens the sandbox.
morgan.token('url', (req) => String(req.originalUrl || req.url).replace(/([?&](?:ticket|t)=)[^&]*/g, '$1***'));
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

// External MCP agents: POST /api/mcp/<sandboxId> with an MCP token.
// Registered before the host-based proxy so it is never shadowed.
app.all("/api/mcp/:sandboxId", createMcpGateway({ redis, refreshTTL }));

// Taksha's own services (the AI service): POST /internal/sandboxes/<id>/mcp.
// Refreshes the sandbox idle TTL on every agent tool call. Not in the ingress
// paths; needs INTERNAL_SERVICE_TOKEN and refuses sandbox hosts.
app.all("/internal/sandboxes/:sandboxId/mcp", createInternalMcpProxy({ refreshTTL }));

// Owner-only access to *.agent and *.preview (see sandboxEdgeAuth.js). Every
// request and WebSocket upgrade is checked before it is proxied or refreshes
// the sandbox idle TTL.
const edgeAuth = createSandboxEdgeAuth({
    verifyAccessToken: createAccessTokenVerifier({
        jwksUri: process.env.AUTH_JWKS_URI || 'http://auth-service/.well-known/jwks.json',
    }),
    ownerOf: createOwnerLookup({
        sandboxApiUrl: process.env.SANDBOX_SERVICE_URL || 'http://sandbox-service',
        internalToken: process.env.INTERNAL_SERVICE_TOKEN || '',
    }),
    secret: process.env.SANDBOX_SESSION_SECRET || '',
    allowedOrigins: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    claimTicket: async (jti) => (await redis.set(`sbx-ticket:${jti}`, '1', 'EX', 120, 'NX')) === 'OK',
    // A revoked share link stays revoked for longer than any link can live.
    shareRevoked: async (sid) => (await redis.exists(`sbx-share-rev:${sid}`)) === 1,
    revokeShare: async (sid) => { await redis.set(`sbx-share-rev:${sid}`, '1', 'EX', SHARE_MAX_TTL_SECONDS + 3600); },
});

// Only the preview app's own Vite proxy (inside the pod, localhost:3000) may
// post browser errors; the public agent host never serves this route.
const POD_ONLY_AGENT_PATHS = new Set(['/api/agent/report-error']);

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
    const proxyFor = targetHost === 'agent' ? getHttpAgentProxy : getHttpProxy;

    if (req.path === SESSION_PATH) {
        return edgeAuth.sessionRoute(req, res, sandboxId);
    }
    // Share links open the preview app only; on the agent host this door does
    // not exist.
    if (req.path === SHARE_PATH) {
        if (targetHost !== 'preview') {
            return res.status(404).json({ status: 'error', message: 'Not found' });
        }
        return edgeAuth.shareRoute(req, res, sandboxId);
    }
    // CORS preflights carry no credentials; the sidecar answers them. They do
    // not keep the sandbox alive.
    if (req.method === 'OPTIONS') {
        return proxyFor(sandboxId)(req, res, next);
    }
    if (targetHost === 'agent' && POD_ONLY_AGENT_PATHS.has(req.path)) {
        return res.status(404).json({ status: 'error', message: 'Not found' });
    }

    let auth;
    try {
        auth = await edgeAuth.authenticate(req, sandboxId, { allowShare: targetHost === 'preview' });
    } catch (err) {
        return edgeAuth.deny(res, err);
    }

    // A share-link viewer must not be able to hold somebody's sandbox open:
    // only the owner's own traffic refreshes the idle TTL.
    if (auth.via !== 'share') {
        await refreshTTL(sandboxId);
    }

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
    let auth;
    try {
        // The preview app's HMR socket also runs for a share-link viewer.
        auth = await edgeAuth.authenticate(req, sandboxId, { allowShare: targetHost === 'preview' });
    } catch (err) {
        console.log(`[Router Upgrade] Denied ${sandboxId}: ${err.status || 503} ${err.message}`);
        return edgeAuth.denyUpgrade(socket, err);
    }
    if (auth.via !== 'share') {
        await refreshTTL(sandboxId);
    }
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