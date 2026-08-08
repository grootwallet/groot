<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';
  import { discreetMode, setDiscreetMode } from '$lib/privacy';
</script>

<button
  type="button"
  class="discreet-mode-toggle"
  class:active={$discreetMode}
  aria-label={$discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts'}
  aria-pressed={$discreetMode}
  title={$discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts'}
  onclick={() => setDiscreetMode(!$discreetMode)}
>
  {#if $discreetMode}<EyeOff size={15}/>{:else}<Eye size={15}/>{/if}
</button>
