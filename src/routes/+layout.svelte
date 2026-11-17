<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import { beforeNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { initLocale } from '$lib/i18n';
  import { initDiscreetMode } from '$lib/privacy';
  import { onMount } from 'svelte';
  let { children } = $props();
  const sandboxSite = __GROOT_MARKETPLACE_SANDBOX_SITE__;
  if (sandboxSite) {
    beforeNavigate((navigation) => {
      if (
        navigation.to &&
        ![
          '/marketplace',
          '/marketplace/',
          '/marketplace/backend',
          '/marketplace/backend/'
        ].includes(navigation.to.url.pathname)
      )
        navigation.cancel();
    });
  }
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

{#if sandboxSite}
  <main class="sandbox-site">{@render children()}</main>
  {#if !/^\/marketplace\/backend\/?$/.test(page.url.pathname)}<ToastHost />{/if}
{:else}
  <AppShell>{@render children()}</AppShell>
{/if}

<style>
  .sandbox-site {
    max-width: 800px;
    margin: 0 auto;
    padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
</style>
