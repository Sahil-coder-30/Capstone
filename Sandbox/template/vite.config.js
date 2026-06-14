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
              fetch('/api/agent/report-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'console',
                  message: args.map(function(a) {
                    return typeof a === 'object' ? JSON.stringify(a) : String(a)
                  }).join(' ')
                })
              }).catch(function() {})
              originalConsoleError.apply(console, args)
            }
          </script>
        </head>`)
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: false,
    watch: {
      usePolling: true,
      interval: 300,
      atomic: true,
      ignored: ['!**/node_modules/**'],
    }
  }
});