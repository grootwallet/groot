<script lang="ts">
  import { Languages } from '@lucide/svelte';
  import { locale, localeOptions, setLocale, t, type Locale } from '$lib/i18n';
  let { labelled = false } = $props<{ labelled?: boolean }>();
</script>

<div class:labelled class="language-control">
  {#if labelled}
    <span class="language-control-copy">
      <span class="setting-icon"><Languages size={18} /></span>
      <span
        ><strong>{t('language', $locale)}</strong><small>{t('languageDescription', $locale)}</small
        ></span
      >
    </span>
  {/if}
  <div class="language-toggle" role="group" aria-label={t('language', $locale)}>
    {#each localeOptions as option}
      <button
        type="button"
        class:active={$locale === option.value}
        aria-pressed={$locale === option.value}
        title={option.label}
        onclick={() => setLocale(option.value as Locale)}>{option.shortLabel}</button
      >
    {/each}
  </div>
</div>

<style>
  .language-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
  }
  .language-control.labelled {
    width: 100%;
  }
  .language-control-copy {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .language-control-copy > span:last-child {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .language-control-copy strong,
  .language-control-copy small {
    display: block;
  }
  .language-control-copy small {
    color: var(--muted);
  }
  .language-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  .language-toggle button {
    min-width: 32px;
    height: 30px;
    padding: 0 7px;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: var(--font-size-meta);
    font-weight: 700;
    cursor: pointer;
  }
  .language-toggle button:hover,
  .language-toggle button:focus-visible {
    color: var(--text);
    background: var(--surface-hover);
    outline: 0;
  }
  .language-toggle button:focus-visible {
    box-shadow: 0 0 0 2px var(--fr-blue);
  }
  .language-toggle button.active {
    color: var(--on-blue);
    background: var(--fr-blue);
  }

  @media (max-width: 540px) {
    .language-control.labelled {
      gap: 10px;
    }
    .language-control-copy {
      gap: 10px;
    }
    .language-toggle button {
      min-width: 29px;
      padding-inline: 5px;
    }
  }
</style>
