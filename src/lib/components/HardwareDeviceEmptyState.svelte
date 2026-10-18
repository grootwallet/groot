<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { AlertTriangle, RefreshCw } from '@lucide/svelte';
  import Button from './Button.svelte';

  let { title, description, onretry } = $props<{
    title: string;
    description: string;
    onretry: () => void | Promise<void>;
  }>();
</script>

<div class="hardware-device-empty" role="status">
  <span class="hardware-device-empty-icon"><AlertTriangle size={18} /></span>
  <span class="hardware-device-empty-copy">
    <strong>{title}</strong>
    <small>{description}</small>
  </span>
  <Button variant="secondary" size="small" onclick={onretry}
    ><RefreshCw size={14} />{translate($locale, 'Scan again')}</Button
  >
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.hardware-device-empty):where(.hardware-device-empty) {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    margin-top: 4px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
    border-radius: var(--radius-control);
    background: var(--accent-soft);
    text-align: left;
  }
  :global(.hardware-device-empty-icon):where(.hardware-device-empty-icon) {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--warning-text);
    background: var(--surface-icon);
  }
  :global(.hardware-device-empty-copy):where(.hardware-device-empty-copy) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  :global(.hardware-device-empty-copy):where(.hardware-device-empty-copy) :global(strong) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.hardware-device-empty-copy):where(.hardware-device-empty-copy) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.hardware-device-empty):where(.hardware-device-empty) :global(.button) {
    align-self: center;
  }

  @media (max-width: 760px) {
    :global(.hardware-device-empty):where(.hardware-device-empty) {
      grid-template-columns: 34px minmax(0, 1fr);
    }
    :global(.hardware-device-empty):where(.hardware-device-empty) :global(.button) {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 44px;
    }
  }
</style>
