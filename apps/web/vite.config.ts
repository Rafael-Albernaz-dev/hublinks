import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.HUB_API_PORT ?? '3177';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
  preview: { host: '127.0.0.1', port: 4177, strictPort: true },
});
