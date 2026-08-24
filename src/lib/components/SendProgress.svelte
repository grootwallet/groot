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
        <strong>{label}</strong>
      </li>
    {/each}
  </ol>
</nav>
