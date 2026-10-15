import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3177', changeOrigin: true } },
  },
  preview: { host: '127.0.0.1', port: 4177, strictPort: true },
});
