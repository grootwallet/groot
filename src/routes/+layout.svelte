<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import { page } from '$app/state';
  import { initLocale } from '$lib/i18n';
  import { initDiscreetMode } from '$lib/privacy';
  import { onMount } from 'svelte';
  let { children } = $props();
  let marketingRoute = $derived(page.url.pathname === '/marketing' || page.url.pathname.startsWith('/marketing/'));
  onMount(() => {
    if (!marketingRoute) {
      initLocale();
      initDiscreetMode();
      const saved = localStorage.getItem('satchel-theme');
      document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    }
  });
</script>

{#if marketingRoute}
  {@render children()}
{:else}
  <AppShell>{@render children()}</AppShell>
{/if}
