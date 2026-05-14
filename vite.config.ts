import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3500', changeOrigin: true },
      '/admin': { target: 'http://localhost:3500', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3500', ws: true },
      '/bridge': { target: 'http://localhost:3500', changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
