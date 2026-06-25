import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    cors: {
      origin: /^https?:\/\/(?:.+\.)?localhost(?::\d+)?$/
    },
    proxy: {
      // 1. Agent Proxy (file operations)
      '/api/agent-proxy': {
        target: 'http://localhost',
        changeOrigin: true,
        router: (req) => {
          const sandboxId = req.headers['x-sandbox-id'];
          return sandboxId ? `http://${sandboxId}.agent.localhost` : 'http://localhost';
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const sandboxId = req.headers['x-sandbox-id'];
            if (sandboxId) {
              proxyReq.setHeader('host', `${sandboxId}.agent.localhost`);
            }
          });
          proxy.on('proxyReqWs', (proxyReq, req) => {
            const sandboxId = req.headers['x-sandbox-id'];
            if (sandboxId) {
              proxyReq.setHeader('host', `${sandboxId}.agent.localhost`);
            }
          });
        },
        rewrite: (path) => path.replace(/^\/api\/agent-proxy/, '')
      },

      // 2. Preview Ping
      '/api/preview-ping': {
        target: 'http://localhost',
        changeOrigin: true,
        router: (req) => {
          const host = req.headers['x-preview-host'];
          return host ? `http://${host}` : 'http://localhost';
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers['x-preview-host'];
            if (host) {
              proxyReq.setHeader('host', host);
            }
          });
        },
        rewrite: () => '/'
      },

      // 3. Terminal Proxy (socket.io and logs stream)
      '/api/terminal-proxy': {
        target: 'http://localhost',
        changeOrigin: true,
        ws: true,
        router: (req) => {
          const url = new URL(req.url || '', 'http://localhost');
          const sandboxId = url.searchParams.get('sandboxId');
          return sandboxId ? `http://${sandboxId}.agent.localhost` : 'http://localhost';
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const url = new URL(req.url || '', 'http://localhost');
            const sandboxId = url.searchParams.get('sandboxId');
            if (sandboxId) {
              proxyReq.setHeader('host', `${sandboxId}.agent.localhost`);
            }
          });
          proxy.on('proxyReqWs', (proxyReq, req) => {
            const url = new URL(req.url || '', 'http://localhost');
            const sandboxId = url.searchParams.get('sandboxId');
            if (sandboxId) {
              proxyReq.setHeader('host', `${sandboxId}.agent.localhost`);
            }
          });
        },
        rewrite: (path) => path.replace(/^\/api\/terminal-proxy/, '')
      },

      // 4. General orchestration API
      '^/api/(?!agent-proxy|preview-ping|terminal-proxy)(?:/.*)?': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    }
  }
})
