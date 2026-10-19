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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.build-identity):where(.build-identity) {
    display: grid;
    justify-items: center;
    min-height: 38px;
  }
  :global(.build-identity):where(.build-identity) :global(button) {
    min-height: 38px;
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-2);
    font: inherit;
    font-size: var(--font-size-meta);
    line-height: 1.35;
    text-align: center;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  :global(.build-identity):where(.build-identity) :global(button:hover) {
    color: var(--text);
    background: var(--surface-hover);
  }
  :global(.build-identity):where(.build-identity) :global(button:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  :global(.build-identity):where(.build-identity) :global(button:disabled) {
    cursor: wait;
    opacity: 0.7;
  }
  :global(.build-copy-status):where(.build-copy-status) {
    min-height: 12px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.35;
  }
</style>
