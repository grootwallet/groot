import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
    ...(sourceDateEpoch ? { version: { name: sourceDateEpoch } } : {})
  }
};
