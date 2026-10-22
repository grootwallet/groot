<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Check } from '@lucide/svelte';

  let { current } = $props<{ current: 1 | 2 | 3 }>();
  const steps = ['Intent', 'Amount & fee', 'Review & sign'];
</script>

<nav class="send-progress" aria-label={translate($locale, 'Payment progress')}>
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
        <strong>{translate($locale, label)}</strong>
      </li>
    {/each}
  </ol>
</nav>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.send-progress):where(.send-progress) {
    margin: -8px 0 16px;
  }
  :global(.send-progress):where(.send-progress) :global(ol) {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  :global(.send-progress):where(.send-progress) :global(ol::before) {
    content: '';
    position: absolute;
    z-index: 0;
    top: 13px;
    left: 16.666%;
    right: 16.666%;
    height: 1px;
    background: var(--border);
  }
  :global(.send-progress):where(.send-progress) :global(li) {
    position: relative;
    z-index: 1;
    display: grid;
    justify-items: center;
    gap: 6px;
    color: var(--muted-2);
  }
  :global(.send-progress):where(.send-progress) :global(li > span) {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--muted-2);
    background: var(--bg);
    font-size: var(--font-size-meta);
    transition:
      color 0.18s ease,
      border-color 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s ease;
  }
  :global(.send-progress):where(.send-progress) :global(li strong) {
    font-size: var(--font-size-meta);
    font-weight: 600;
  }
  :global(.send-progress):where(.send-progress) :global(li.active) {
    color: var(--text);
  }
  :global(.send-progress):where(.send-progress) :global(li.active > span) {
    color: var(--on-blue);
    border-color: var(--fr-blue);
    background: var(--fr-blue);
    box-shadow: 0 0 0 4px var(--fr-blue-soft);
  }
  :global(.send-progress):where(.send-progress) :global(li.complete) {
    color: var(--muted);
  }
  :global(.send-progress):where(.send-progress) :global(li.complete > span) {
    color: var(--step-complete-fg);
    border-color: var(--step-complete-border);
    background: var(--step-complete-bg);
  }

  @media (max-width: 760px) {
    :global(.send-progress):where(.send-progress) {
      margin-top: -4px;
    }
    :global(.send-progress):where(.send-progress) :global(li strong) {
      font-size: var(--font-size-meta);
    }
  }
</style>
