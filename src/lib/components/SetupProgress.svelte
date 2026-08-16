<script lang="ts">
  import { Check } from '@lucide/svelte';

  type Props = {
    steps: string[];
    current: number;
    label?: string;
    context?: string;
  };

  let { steps, current, label = 'Setup progress', context = '' }: Props = $props();
</script>

<nav class="setup-progress" aria-label={label}>
  {#if context}<span class="setup-progress-context">{context}</span>{/if}
  <ol style:grid-template-columns={`repeat(${steps.length}, minmax(0, 1fr))`}>
    {#each steps as step, index}
      <li
        class:complete={index + 1 < current}
        class:current={index + 1 === current}
        aria-current={index + 1 === current ? 'step' : undefined}
      >
        <span class="setup-progress-number" aria-hidden="true"
          >{#if index + 1 < current}<Check size={14} />{:else}{index + 1}{/if}</span
        >
        <span class="setup-progress-label">{step}</span>
      </li>
    {/each}
  </ol>
</nav>
