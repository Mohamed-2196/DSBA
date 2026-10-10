import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The app is served from the same origin as the API: in development Vite proxies /api to the backend,
// in production a reverse proxy does (see compose.yaml and docs/backend/DEPLOYMENT.md).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000';
  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: api } },
    },
    preview: { port: 4173, proxy: { '/api': { target: api } } },
  };
});
