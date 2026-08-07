<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import { initLocale } from '$lib/i18n';
  import { onMount } from 'svelte';
  let { children } = $props();
  onMount(() => {
    initLocale();
    const saved = localStorage.getItem('satchel-theme');
    document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  });
</script>

<AppShell>{@render children()}</AppShell>
