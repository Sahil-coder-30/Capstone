import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dns from 'node:dns'

// Ensure predictable IP resolution without hanging on macOS loopback interfaces
dns.setDefaultResultOrder('verbatim')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-redux',
      '@reduxjs/toolkit',
      'axios',
      'gsap',
      '@gsap/react',
      '@monaco-editor/react',
      '@xterm/xterm',
      '@xterm/addon-fit',
      'socket.io-client',
      'dexie',
      'lucide-react'
    ]
  },

  build: {
    target: 'esnext',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
              return 'vendor-monaco';
            }
            if (id.includes('@xterm')) {
              return 'vendor-terminal';
            }
            if (id.includes('gsap') || id.includes('@gsap')) {
              return 'vendor-gsap';
            }
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
            if (id.includes('socket.io-client')) {
              return 'vendor-socket';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('react') || id.includes('redux')) {
              return 'vendor-react-core';
            }
            return 'vendor-misc';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },

  server: {
    warmup: {
      clientFiles: ['./src/main.jsx', './src/App.jsx']
    },
    host: 'localhost',
    port: 5173,
    strictPort: true,
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
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    }
  }
})
