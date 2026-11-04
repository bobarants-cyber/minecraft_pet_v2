import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'chrome130',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
});
