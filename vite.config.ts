import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __GROOT_NATIVE_UI__: JSON.stringify(Boolean(process.env.TAURI_ENV_PLATFORM))
  },
  envPrefix: ['VITE_', 'PUBLIC_'],
  server: {
    // A physical phone needs the LAN address while desktop camera access needs a
    // secure loopback origin. Bind both and advertise the LAN host only for HMR.
    host: tauriDevHost ? '0.0.0.0' : '127.0.0.1',
    port: 5188,
    strictPort: true,
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: 5188 } : undefined
  },
  test: { include: ['src/**/*.test.ts'], exclude: ['e2e/**'] }
});
