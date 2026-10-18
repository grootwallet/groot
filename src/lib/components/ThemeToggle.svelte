<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Moon, Sun } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { applyTheme, currentTheme, type Theme } from '$lib/theme';

  let theme = $state<Theme>('dark');

  onMount(() => {
    theme = currentTheme();
  });

  function setTheme(next: Theme) {
    theme = next;
    applyTheme(next);
  }
</script>

<div class="shell-theme-toggle" aria-label={translate($locale, 'Color theme')}>
  <button
    type="button"
    class:active={theme === 'light'}
    aria-label={translate($locale, 'Use light mode')}
    aria-pressed={theme === 'light'}
    onclick={() => setTheme('light')}><Sun size={14} /></button
  >
  <button
    type="button"
    class:active={theme === 'dark'}
    aria-label={translate($locale, 'Use dark mode')}
    aria-pressed={theme === 'dark'}
    onclick={() => setTheme('dark')}><Moon size={14} /></button
  >
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.shell-theme-toggle):where(.shell-theme-toggle) {
    width: fit-content;
    display: flex;
    gap: 2px;
    padding: 3px;
    margin-inline: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.shell-theme-toggle):where(.shell-theme-toggle) :global(button) {
    width: 28px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 5px;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
  }
  :global(.shell-theme-toggle):where(.shell-theme-toggle) :global(button:hover) {
    color: var(--text);
    background: var(--surface-hover);
  }
  :global(.shell-theme-toggle):where(.shell-theme-toggle) :global(button.active) {
    color: var(--on-blue);
    background: var(--fr-blue);
  }
</style>
