import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';

// Ensure predictable IP resolution without hanging on macOS loopback interfaces
dns.setDefaultResultOrder('verbatim');

// https://vite.dev/config/
export default defineConfig({
  // In production this app is served at /payments/* by CloudFront.
  // Setting base ensures all JS/CSS/image asset URLs are prefixed with /payments/.
  base: '/payments/',
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'react-redux',
      '@reduxjs/toolkit',
      'axios',
      'lucide-react',
      'gsap',
      '@gsap/react',
      'lenis',
      'motion',
      'ogl',
    ],
  },
  server: {
    warmup: {
      clientFiles: ['./src/main.jsx', './src/App.jsx'],
    },
    host: 'localhost',
    port: 5174,
    strictPort: true,
    // During local dev, also serve under /payments so routes match production
    // Visit: http://localhost:5174/payments/
    proxy: {
      // All /api/* traffic goes to the local ingress/nginx on port 80.
      // The ingress config (mirrors Kubernetes) routes:
      //   /api/auth     → Auth service pod
      //   /api/payments → Payments service pod (:5002)
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

