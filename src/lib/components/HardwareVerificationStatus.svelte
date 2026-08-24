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
