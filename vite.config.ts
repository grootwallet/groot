import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __GROOT_NATIVE_UI__: JSON.stringify(Boolean(process.env.TAURI_ENV_PLATFORM))
  },
  envPrefix: ['VITE_', 'PUBLIC_'],
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  test: { include: ['src/**/*.test.ts'], exclude: ['e2e/**'] }
});
