<script lang="ts">
  import { CheckCircle2 } from '@lucide/svelte';
  import Tooltip from './Tooltip.svelte';

  const explanation =
    'This exact address was shown on and matched by a saved hardware signer. The verification applies only to this address.';
</script>

<Tooltip text={explanation}>
  <button
    type="button"
    class="hardware-verification-status"
    aria-label={`Verified on hardware. ${explanation}`}
  >
    <CheckCircle2 size={14} />
    Verified on hardware
  </button>
</Tooltip>
