<script lang="ts">
  import { Check } from '@lucide/svelte';

  let { current } = $props<{ current: 1 | 2 | 3 }>();
  const steps = ['Intent', 'Amount & fee', 'Review & sign'];
</script>

<nav class="send-progress" aria-label="Payment progress">
  <ol>
    {#each steps as label, index}
      {@const number = index + 1}
      <li
        class:active={current === number}
        class:complete={current > number}
        aria-current={current === number ? 'step' : undefined}
      >
        <span
          >{#if current > number}<Check size={12} strokeWidth={2.5} />{:else}{number}{/if}</span
        >
        <strong>{label}</strong>
      </li>
    {/each}
  </ol>
</nav>
