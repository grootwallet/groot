<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { RefreshCw, WifiOff } from '@lucide/svelte';

  let { title, description, onretry } = $props<{
    title: string;
    description: string;
    onretry: () => void | Promise<void>;
  }>();
</script>

<div class="load-failure" role="alert">
  <span><WifiOff size={19} /></span>
  <div><strong>{title}</strong><small>{description}</small></div>
  <button class="button secondary small" type="button" onclick={onretry}
    ><RefreshCw size={14} />{translate($locale, 'Try again')}</button
  >
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.load-failure):where(.load-failure) {
    min-height: 92px;
    padding: 16px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--panel);
  }
  :global(.load-failure):where(.load-failure) > :global(span) {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
  }
  :global(.load-failure):where(.load-failure) > :global(div) {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  :global(.load-failure):where(.load-failure) :global(strong) {
    font-size: 14px;
  }
  :global(.load-failure):where(.load-failure) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    :global(.load-failure):where(.load-failure) {
      grid-template-columns: 38px minmax(0, 1fr);
    }
    :global(.load-failure):where(.load-failure) :global(.button) {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 44px;
    }
  }
</style>
