import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
const kitOutDir = process.env.GROOT_SVELTE_KIT_OUT_DIR;
const sandboxOutput =
  process.env.GROOT_MARKETPLACE_SANDBOX_BUILD === '1' && !process.env.TAURI_ENV_PLATFORM;

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
      ...(sandboxOutput
        ? {
            pages: 'outputs/marketplace-backend/staging-site',
            assets: 'outputs/marketplace-backend/staging-site'
          }
        : {})
    }),
    ...(kitOutDir ? { outDir: kitOutDir } : {}),
    ...(sourceDateEpoch ? { version: { name: sourceDateEpoch } } : {})
  }
};
