import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  // In production this app is served at /payments/* by CloudFront.
  // Setting base ensures all JS/CSS/image asset URLs are prefixed with /payments/.
  base: '/payments/',
  plugins: [react()],
  server: {
    port: 5174,
    // During local dev, also serve under /payments so routes match production
    // Visit: http://localhost:5174/payments/
    proxy: {
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
      },
      '/internal': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
