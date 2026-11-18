import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
const kitOutDir = process.env.GROOT_SVELTE_KIT_OUT_DIR;

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
    ...(kitOutDir ? { outDir: kitOutDir } : {}),
    ...(sourceDateEpoch ? { version: { name: sourceDateEpoch } } : {})
  }
};
