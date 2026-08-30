<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import { initLocale } from '$lib/i18n';
  import { initDiscreetMode } from '$lib/privacy';
  import { onMount } from 'svelte';
  let { children } = $props();
  onMount(() => {
    initLocale();
    initDiscreetMode();
  });
</script>

<svelte:head>
  <title>Groot</title>
  <meta name="application-name" content="Groot" />
  <meta name="apple-mobile-web-app-title" content="Groot" />
</svelte:head>

<AppShell>{@render children()}</AppShell>
