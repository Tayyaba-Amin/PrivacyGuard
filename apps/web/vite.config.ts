import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `VITE_*` values are inlined into the client bundle and are therefore PUBLIC.
// Only ever put non-secret values here, such as the API origin.
const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
      },
    },
  },
});