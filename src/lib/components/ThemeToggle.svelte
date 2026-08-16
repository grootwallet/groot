<script lang="ts">
  import { Moon, Sun } from '@lucide/svelte';
  import { onMount } from 'svelte';

  let theme = $state<'light' | 'dark'>('dark');

  onMount(() => {
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  });

  function setTheme(next: 'light' | 'dark') {
    theme = next;
    document.documentElement.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'light' ? '#f4f1e9' : '#0d1118');
    localStorage.setItem('groot-theme', next);
  }
</script>

<div class="shell-theme-toggle" aria-label="Color theme">
  <button
    type="button"
    class:active={theme === 'light'}
    aria-label="Use light mode"
    aria-pressed={theme === 'light'}
    onclick={() => setTheme('light')}><Sun size={14} /></button
  >
  <button
    type="button"
    class:active={theme === 'dark'}
    aria-label="Use dark mode"
    aria-pressed={theme === 'dark'}
    onclick={() => setTheme('dark')}><Moon size={14} /></button
  >
</div>
