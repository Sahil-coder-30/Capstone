import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'error-reporter',
      transformIndexHtml(html) {
        return html.replace('</head>', `
          <script>
            // Runtime JS errors
            window.onerror = function(msg, src, line, col, err) {
              fetch('/api/agent/report-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'runtime',
                  message: msg,
                  source: src,
                  line: line,
                  col: col,
                  stack: err ? err.stack : null
                })
              }).catch(function() {})
            }

            // Unhandled promise rejections
            window.onunhandledrejection = function(event) {
              fetch('/api/agent/report-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'promise',
                  message: event.reason ? event.reason.message : String(event.reason),
                  stack: event.reason ? event.reason.stack : null
                })
              }).catch(function() {})
            }

            // Console errors
            var originalConsoleError = console.error
            console.error = function() {
              var args = Array.prototype.slice.call(arguments)
              var stack = null;
              try { throw new Error(); } catch(e) { stack = e.stack; }
              // Remove the first few lines of the stack trace belonging to this handler
              if (stack) {
                var lines = stack.split('\\n');
                if (lines.length > 2) {
                  stack = lines.slice(2).join('\\n');
                }
              }
              fetch('/api/agent/report-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'console',
                  message: args.map(function(a) {
                    return typeof a === 'object' ? JSON.stringify(a) : String(a)
                  }).join(' '),
                  stack: stack
                })
              }).catch(function() {})
              originalConsoleError.apply(console, args)
            }
          </script>
        </head>`)
      }
    },
    {
      name: 'watch-package-json',
      configureServer(server) {
        server.watcher.add(`${server.config.root}/package.json`);
        server.watcher.add(`${server.config.root}/package-lock.json`);
        server.watcher.on('change', (file) => {
          if (file.endsWith('package.json') || file.endsWith('package-lock.json')) {
            console.log('package.json or package-lock.json changed. Restarting dev server to reflect new dependencies...');
            server.restart();
          }
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    hmr: {
      clientPort: 80,
    },
    watch: {
      usePolling: true,
      interval: 300,
      ignored: ['node_modules'],
    },
    proxy: {
      '/api/agent': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/terminal-proxy': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      }
    }
  }
});