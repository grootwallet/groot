<script lang="ts">
  import { MoreHorizontal } from '@lucide/svelte';

  let {
    label = 'More actions',
    expanded = false,
    size = 'default',
    element = $bindable<HTMLButtonElement | null>(null),
    onclick
  }: {
    label?: string;
    expanded?: boolean;
    size?: 'default' | 'large';
    element?: HTMLButtonElement | null;
    onclick: (event: MouseEvent) => void;
  } = $props();
</script>

<button bind:this={element} type="button" class="overflow-menu-trigger" class:large={size === 'large'} aria-label={label} aria-haspopup="menu" aria-expanded={expanded} {onclick}>
  <MoreHorizontal size={18}/>
</button>

<style>
  .overflow-menu-trigger { width: 38px; height: 38px; padding: 0; display: grid; place-items: center; border: 1px solid var(--border-strong); border-radius: 8px; color: var(--muted); background: var(--surface-control); cursor: pointer; }
  .overflow-menu-trigger.large { width: 46px; height: 46px; }
  .overflow-menu-trigger:hover,.overflow-menu-trigger[aria-expanded='true'] { color: var(--text); background: var(--surface-hover); }
  .overflow-menu-trigger:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
