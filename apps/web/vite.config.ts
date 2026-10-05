import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@mingpan/core': fileURLToPath(new URL('../../packages/core/src/browser.ts', import.meta.url)) } },
  build: { outDir: 'dist', assetsDir: 'static', sourcemap: false, target: 'es2019', modulePreload: { polyfill: false } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
