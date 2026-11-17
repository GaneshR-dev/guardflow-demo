/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// FastAPI serves the build at /next until all screens move from the old app.
export default defineConfig({
  base: '/next/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // The old app is proxied too, so it shares the saved session (localStorage) with /next.
  // Set GUARDIAN_API to use an API on another port.
  server: {
    proxy: Object.fromEntries(
      ['/api', '/app', '/attendance-app.css', '/attendance-app.js'].map((p) => [
        p,
        process.env.GUARDIAN_API || 'http://127.0.0.1:8000',
      ]),
    ),
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
