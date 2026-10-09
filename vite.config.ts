import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// BASE_PATH lets the static build live under a subpath, e.g. /Tracel/ on GitHub Pages.
const base = process.env.BASE_PATH ? `/${process.env.BASE_PATH.replace(/^\/|\/$/g, '')}/`.replace('//', '/') : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['web-tree-sitter'],
  },
});
