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
