<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import { page } from '$app/state';
  import { initLocale } from '$lib/i18n';
  import { initDiscreetMode } from '$lib/privacy';
  import { onMount } from 'svelte';
  let { children } = $props();
  let marketingRoute = $derived(page.url.pathname === '/marketing' || page.url.pathname.startsWith('/marketing/'));
  let documentTitle = $derived(
    page.url.pathname === '/marketing' ? 'Groot · Hold your own' :
    page.url.pathname === '/marketing/security' ? 'Security model · Groot' :
    page.url.pathname === '/marketing/status' ? 'Development status · Groot' :
    page.url.pathname === '/marketing/docs' ? 'Documentation · Groot' :
    page.url.pathname === '/marketing/wordmark' ? 'Name study · Internal brand work' : 'Groot'
  );
  onMount(() => {
    if (!marketingRoute) {
      initLocale();
      initDiscreetMode();
      const saved = localStorage.getItem('groot-theme');
      document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    }
  });
</script>

<svelte:head>
  <title>{documentTitle}</title>
  <meta name="application-name" content="Groot" />
  <meta name="apple-mobile-web-app-title" content="Groot" />
</svelte:head>

{#if marketingRoute}
  {@render children()}
{:else}
  <AppShell>{@render children()}</AppShell>
{/if}
