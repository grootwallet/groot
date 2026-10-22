<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { CheckCircle2 } from '@lucide/svelte';
  import Tooltip from './Tooltip.svelte';

  const explanation =
    'This exact address was shown on and matched by a saved hardware signer. The verification applies only to this address.';
</script>

<Tooltip text={translate($locale, explanation)}>
  <button
    type="button"
    class="hardware-verification-status"
    aria-label={translate($locale, 'Verified on hardware. {explanation}', {
      explanation: translate($locale, explanation)
    })}
  >
    <CheckCircle2 size={14} />
    {translate($locale, 'Verified on hardware')}
  </button>
</Tooltip>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.hardware-verification-status):where(.hardware-verification-status) {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 2px 4px;
    border: 0;
    border-radius: 6px;
    color: var(--success);
    background: transparent;
    font-size: var(--font-size-meta);
    cursor: help;
  }
  :global(.hardware-verification-status:hover):where(.hardware-verification-status) {
    background: color-mix(in srgb, var(--success) 8%, transparent);
  }
  :global(.hardware-verification-status:focus-visible):where(.hardware-verification-status) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    :global(.hardware-verification-status):where(.hardware-verification-status) {
      min-height: 44px;
      padding-inline: 8px;
      cursor: pointer;
    }
  }
</style>
