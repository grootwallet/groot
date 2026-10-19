<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Check, Clock3 } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let {
    step,
    title,
    description,
    state,
    status = state === 'complete'
      ? 'Complete'
      : state === 'current'
        ? 'Current step'
        : state === 'deferred'
          ? 'Deferred'
          : 'Complete earlier steps first',
    children
  } = $props<{
    step: number;
    title: string;
    description: string;
    state: 'complete' | 'current' | 'upcoming' | 'deferred';
    status?: string;
    children?: Snippet;
  }>();
</script>

<section class="setup-task {state}" aria-current={state === 'current' ? 'step' : undefined}>
  <header>
    <span class="setup-task-marker" aria-hidden="true"
      >{#if state === 'complete'}<Check size={15} />{:else if state === 'deferred'}<Clock3
          size={14}
        />{:else}{step}{/if}</span
    >
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <em
      >{#if state === 'complete'}<Check size={13} />{/if}{status}</em
    >
  </header>
  {#if state === 'complete'}
    <details class="setup-task-complete-details">
      <summary>{translate($locale, 'View completed step')}</summary>
      <div class="setup-task-content">{@render children?.()}</div>
    </details>
  {:else}
    <div class="setup-task-content">{@render children?.()}</div>
  {/if}
</section>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.setup-task):where(.setup-task) {
    display: grid;
    gap: 14px;
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--surface-control);
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      opacity 0.18s ease;
  }
  :global(.setup-task.current):where(.setup-task) {
    border-color: color-mix(in srgb, var(--fr-blue) 68%, var(--border));
    background: color-mix(in srgb, var(--fr-blue) 5%, var(--surface-control));
    box-shadow: 0 0 0 3px var(--fr-blue-soft);
  }
  :global(.setup-task.complete):where(.setup-task) {
    border-color: color-mix(in srgb, var(--success) 28%, var(--border));
    background: color-mix(in srgb, var(--success) 3%, var(--surface-control));
  }
  :global(.setup-task.deferred):where(.setup-task) {
    border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
    background: color-mix(in srgb, var(--accent) 3%, var(--surface-control));
    opacity: 0.8;
  }
  :global(.setup-task.upcoming):where(.setup-task) {
    opacity: 0.58;
  }
  :global(.setup-task):where(.setup-task) > :global(header) {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: start;
    gap: 11px;
  }
  :global(.setup-task-marker):where(.setup-task-marker) {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    color: var(--text-soft);
    background: var(--surface-inset);
    font-size: var(--font-size-meta);
    font-weight: 700;
  }
  :global(.setup-task.complete):where(.setup-task) :global(.setup-task-marker) {
    color: var(--panel);
    border-color: var(--success);
    background: var(--success);
  }
  :global(.setup-task.deferred):where(.setup-task) :global(.setup-task-marker) {
    color: var(--warning-text);
    border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-inset));
  }
  :global(.setup-task.current):where(.setup-task) :global(.setup-task-marker) {
    color: var(--on-blue);
    border-color: var(--fr-blue);
    background: var(--fr-blue);
  }
  :global(.setup-task):where(.setup-task) > :global(header > div) {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  :global(.setup-task):where(.setup-task) :global(h3) {
    margin: 0;
    color: var(--text);
    font-size: 13px;
  }
  :global(.setup-task):where(.setup-task) :global(header p) {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.setup-task):where(.setup-task) :global(header em) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 7px;
    border-radius: 999px;
    color: var(--muted);
    background: var(--surface-icon);
    font-size: var(--font-size-meta);
    font-style: normal;
    font-weight: 700;
    white-space: nowrap;
  }
  :global(.setup-task.complete):where(.setup-task) :global(header em) {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 9%, transparent);
  }
  :global(.setup-task.current):where(.setup-task) :global(header em) {
    color: var(--link);
    background: var(--fr-blue-soft);
  }
  :global(.setup-task.deferred):where(.setup-task) :global(header em) {
    color: var(--warning-text);
    background: color-mix(in srgb, var(--accent) 9%, transparent);
  }
  :global(.setup-task-content):where(.setup-task-content) {
    display: grid;
    gap: 14px;
  }
  :global(.setup-task-content):where(.setup-task-content) > :global(ol) {
    margin: -2px 0 0 41px;
    padding-left: 16px;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    line-height: 1.65;
  }
  :global(.setup-task-complete-details):where(.setup-task-complete-details) {
    margin-left: 41px;
  }
  :global(.setup-task-complete-details):where(.setup-task-complete-details) :global(summary) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.setup-task-complete-details[open]):where(.setup-task-complete-details) :global(summary) {
    margin-bottom: 12px;
  }

  @media (max-width: 760px) {
    :global(.setup-task):where(.setup-task) {
      padding: 14px;
    }
    :global(.setup-task):where(.setup-task) > :global(header) {
      grid-template-columns: 30px minmax(0, 1fr);
    }
    :global(.setup-task):where(.setup-task) :global(header em) {
      grid-column: 2;
      justify-self: start;
    }
    :global(.setup-task-content):where(.setup-task-content) > :global(ol),
    :global(.setup-task-complete-details):where(.setup-task-complete-details) {
      margin-left: 30px;
    }
  }
</style>
