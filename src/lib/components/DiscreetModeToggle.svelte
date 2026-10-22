<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { discreetMode, setDiscreetMode } from '$lib/privacy';
</script>

<button
  type="button"
  class="discreet-mode-toggle"
  class:active={$discreetMode}
  aria-label={translate($locale, $discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts')}
  aria-pressed={$discreetMode}
  title={translate($locale, $discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts')}
  onclick={() => setDiscreetMode(!$discreetMode)}
>
  {#if $discreetMode}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
</button>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.discreet-mode-toggle):where(.discreet-mode-toggle) {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-control);
    cursor: pointer;
  }
  :global(.discreet-mode-toggle:hover):where(.discreet-mode-toggle),
  :global(.discreet-mode-toggle:focus-visible):where(.discreet-mode-toggle) {
    color: var(--text);
    background: var(--surface-hover);
    outline: 0;
  }
  :global(.discreet-mode-toggle:focus-visible):where(.discreet-mode-toggle) {
    box-shadow: 0 0 0 2px var(--focus);
  }
  :global(.discreet-mode-toggle.active):where(.discreet-mode-toggle) {
    color: var(--on-blue);
    border-color: var(--fr-blue);
    background: var(--fr-blue);
  }
</style>
