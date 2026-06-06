import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: {
      clientPort: 80,     // port the proxy/router is listening on
      protocol: 'ws',     // use 'wss' if your proxy is behind HTTPS
    },
  }
})
