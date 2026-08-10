<script lang="ts">
  import { Cpu } from '@lucide/svelte';
</script>

<div class="hardware-approval-prompt" role="status" aria-live="polite" aria-label="Waiting for hardware approval">
  <span class="hardware-approval-visual" aria-hidden="true"><Cpu size={21}/></span>
  <span class="hardware-approval-copy">
    <strong>Check your hardware device</strong>
    <small>Compare the complete address above, then approve it on the device.</small>
  </span>
  <span class="hardware-approval-dots" aria-hidden="true"><i></i><i></i><i></i></span>
</div>
