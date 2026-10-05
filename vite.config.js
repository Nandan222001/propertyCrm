import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev/preview server.
 *
 * The SPA always calls a *relative* `/api/v1` URL; in development this proxy
 * forwards it to the FastAPI process, so the browser never needs to reach
 * localhost directly (preview hosts, containers and CI all behave the same).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false, // never ship source maps that leak server internals
    chunkSizeWarningLimit: 900,
  },
});
