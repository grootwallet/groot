<script lang="ts">
  import './marketing.css';
  let { children } = $props();
</script>

<svelte:head>
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
  <meta property="og:type" content="website" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable site summary" />
  <link rel="preload" href="/fonts/source-sans-3.052R.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
  <link rel="preload" href="/fonts/source-serif-4.005R.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
</svelte:head>

{@render children()}
