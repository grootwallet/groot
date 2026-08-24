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
