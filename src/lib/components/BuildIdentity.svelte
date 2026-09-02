<script lang="ts">
  import { onMount } from 'svelte';
  import { copyText } from '$lib/clipboard';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { walletService } from '$lib/wallet';
  import type { RuntimePlatform } from '$lib/wallet/contracts';

  let {
    runtime,
    placement = 'sidebar'
  }: {
    runtime?: RuntimePlatform | null;
    placement?: 'sidebar' | 'onboarding' | 'settings';
  } = $props();

  let loadedRuntime = $state<RuntimePlatform | null>(null);
  let copyState = $state<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  let resolvedRuntime = $derived(runtime ?? loadedRuntime);
  let identity = $derived(
    resolvedRuntime
      ? translate($locale, 'Groot v{version} · {commit}', {
          version: resolvedRuntime.version,
          commit: shortCommit(resolvedRuntime.commit)
        })
      : ''
  );

  function shortCommit(commit: string) {
    return commit === 'unknown'
      ? commit
      : `${commit.slice(0, 8)}${commit.endsWith('-dirty') ? '-dirty' : ''}`;
  }

  onMount(async () => {
    if (runtime !== undefined) return;
    try {
      loadedRuntime = await walletService.runtimePlatform();
    } catch {
      loadedRuntime = null;
    }
  });

  async function copyIdentity() {
    if (!identity || copyState === 'copying') return;
    copyState = 'copying';
    try {
      await copyText(identity, 'build-information');
      copyState = 'copied';
      toast({ title: translate($locale, 'Build information copied'), tone: 'success' });
      setTimeout(() => {
        if (copyState === 'copied') copyState = 'idle';
      }, 1_500);
    } catch {
      copyState = 'failed';
      toast({
        title: translate($locale, 'Copy failed'),
        description: translate($locale, 'Try again'),
        tone: 'danger'
      });
    }
  }
</script>

{#if resolvedRuntime}<div class="build-identity build-identity-{placement}">
    <button
      type="button"
      aria-label={translate($locale, 'Copy build information')}
      disabled={copyState === 'copying'}
      onclick={copyIdentity}>{identity}</button
    >
    <span class="build-copy-status" role="status">
      {#if copyState === 'copying'}
        {translate($locale, 'Copying…')}
      {:else if copyState === 'copied'}
        {translate($locale, 'Copied')}
      {:else if copyState === 'failed'}
        {translate($locale, 'Copy failed')} · {translate($locale, 'Try again')}
      {/if}
    </span>
  </div>{/if}
