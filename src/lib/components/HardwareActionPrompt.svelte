<script lang="ts">
  import { Cpu } from '@lucide/svelte';

  let {
    title,
    detail,
    label = 'Hardware action in progress'
  }: {
    title: string;
    detail: string;
    label?: string;
  } = $props();
</script>

<div class="hardware-action-prompt" role="status" aria-live="polite" aria-label={label}>
  <span class="hardware-action-visual" aria-hidden="true"><Cpu size={21} /></span>
  <span class="hardware-action-copy">
    <strong>{title}</strong>
    <small>{detail}</small>
  </span>
  <span class="hardware-action-dots" aria-hidden="true"><i></i><i></i><i></i></span>
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.hardware-action-prompt):where(.hardware-action-prompt) {
    min-height: 88px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
    padding: 13px 14px;
    border: 1px solid color-mix(in srgb, var(--fr-blue) 32%, var(--border));
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--fr-blue) 6%, var(--surface-control));
  }
  :global(.hardware-action-visual):where(.hardware-action-visual) {
    position: relative;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--link);
    background: var(--fr-blue-soft);
  }
  :global(.hardware-action-visual::after):where(.hardware-action-visual) {
    content: '';
    position: absolute;
    inset: -1px;
    border: 1px solid color-mix(in srgb, var(--fr-blue) 52%, transparent);
    border-radius: inherit;
    animation: hardware-action-pulse 1.5s ease-out infinite;
  }
  :global(.hardware-action-copy):where(.hardware-action-copy) {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  :global(.hardware-action-copy):where(.hardware-action-copy) :global(strong) {
    color: var(--text);
    font-size: var(--font-size-meta);
  }
  :global(.hardware-action-copy):where(.hardware-action-copy) :global(small) {
    max-width: 350px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.hardware-action-dots):where(.hardware-action-dots) {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
  }
  :global(.hardware-action-dots):where(.hardware-action-dots) :global(i) {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--fr-blue);
    animation: hardware-action-dot 1.1s ease-in-out infinite;
  }
  :global(.hardware-action-dots):where(.hardware-action-dots) :global(i:nth-child(2)) {
    animation-delay: 0.16s;
  }
  :global(.hardware-action-dots):where(.hardware-action-dots) :global(i:nth-child(3)) {
    animation-delay: 0.32s;
  }

  @media (max-width: 760px) {
    :global(.hardware-action-prompt):where(.hardware-action-prompt) {
      grid-template-columns: 42px minmax(0, 1fr);
    }
    :global(.hardware-action-dots):where(.hardware-action-dots) {
      grid-column: 2;
      padding: 0;
    }
  }
</style>
