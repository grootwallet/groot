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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.setup-progress):where(.setup-progress) {
    margin: 24px 0 2px;
  }
  :global(.setup-progress-context):where(.setup-progress-context) {
    display: block;
    margin-bottom: 13px;
    color: var(--fr-red);
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  :global(.setup-progress):where(.setup-progress) :global(ol) {
    position: relative;
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  :global(.setup-progress):where(.setup-progress) :global(ol::before) {
    content: '';
    position: absolute;
    z-index: 0;
    top: 14px;
    left: 15%;
    right: 15%;
    height: 2px;
    background: var(--border);
  }
  :global(.setup-progress):where(.setup-progress) :global(li) {
    position: relative;
    z-index: 1;
    display: grid;
    justify-items: center;
    gap: 7px;
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    font-weight: 600;
  }
  :global(.setup-progress-number):where(.setup-progress-number) {
    width: 29px;
    height: 29px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 50%;
    font-size: var(--font-size-meta);
  }
  :global(.setup-progress):where(.setup-progress) :global(li.complete) {
    color: var(--muted);
  }
  :global(.setup-progress):where(.setup-progress) :global(li.complete::after) {
    content: '';
    position: absolute;
    z-index: -1;
    top: 14px;
    left: 50%;
    width: 100%;
    height: 2px;
    background: var(--step-complete-border);
  }
  :global(.setup-progress):where(.setup-progress) :global(li.complete:last-child::after) {
    display: none;
  }
  :global(.setup-progress):where(.setup-progress) :global(li.complete .setup-progress-number) {
    color: var(--step-complete-fg);
    background: var(--step-complete-bg);
    border-color: var(--step-complete-border);
  }
  :global(.setup-progress):where(.setup-progress) :global(li.current) {
    color: var(--text);
  }
  :global(.setup-progress):where(.setup-progress) :global(li.current .setup-progress-number) {
    color: var(--link);
    border-color: var(--fr-blue);
    box-shadow: 0 0 0 4px var(--fr-blue-soft);
  }

  @media (max-width: 760px) {
    :global(.setup-progress-label):where(.setup-progress-label) {
      font-size: var(--font-size-meta);
    }
  }
</style>
