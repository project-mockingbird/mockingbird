import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        // ws:true forwards WebSocket upgrades for /api/spe/sessions/:id/stream
        // (the SPE PowerShell ISE's server-push channel). Without this, the
        // dev server proxies the upgrade request as regular HTTP and the
        // IsePage sits forever in 'connecting...'. The prod image is unaffected
        // because fastify serves the web bundle directly on 3333.
        ws: true,
      },
      '/graphiql': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3333',
        ws: true,
      },
      '/-/media': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
      '/-/jssmedia': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
});
