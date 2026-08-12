<script lang="ts">
  let { value, max, hint = '' }: { value: string; max: number; hint?: string } = $props();
</script>

<small class="field-counter">{#if hint}{hint} · {/if}{value.length}/{max}</small>
