import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:2567' } }, build: { rollupOptions: { output: { manualChunks: (id) => id.includes('/phaser/') ? 'phaser' : undefined } } } });
