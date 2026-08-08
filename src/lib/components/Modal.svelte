<script lang="ts">
  import { X } from '@lucide/svelte';
  import { lockModalScroll } from './modal-scroll-lock';
  import { fly } from 'svelte/transition';
  let { open, title, description = '', preserveTop = false, onclose, children } = $props();
  let dialog = $state<HTMLDivElement>();

  function anchorInitialTop(node: HTMLDivElement, enabled: boolean) {
    if (!enabled) return;
    const layer = node.parentElement;
    if (!layer) return;
    const paddingTop = Number.parseFloat(getComputedStyle(layer).paddingTop) || 0;
    const centeredTop = Math.max(0, node.offsetTop - paddingTop);
    const initialTop = window.innerWidth <= 760 ? 0 : centeredTop;
    layer.style.alignItems = 'flex-start';
    node.style.marginTop = `${initialTop}px`;
    return {
      destroy() {
        layer.style.removeProperty('align-items');
        node.style.removeProperty('margin-top');
      }
    };
  }

  $effect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScrollLock = lockModalScroll(document);
    queueMicrotask(() => {
      const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      (first ?? dialog)?.focus();
    });
    return () => {
      releaseScrollLock();
      previousFocus?.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onclose(); return; }
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0], last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
</script>

{#if open}
  <div class="modal-layer" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={handleKeydown} use:anchorInitialTop={preserveTop} transition:fly={{ y: 8, duration: 180 }}>
      <header class="modal-header">
        <div><h2>{title}</h2>{#if description}<p>{description}</p>{/if}</div>
        <button class="icon-button" aria-label="Close" onclick={onclose}><X size={18} /></button>
      </header>
      <div class="modal-body">{@render children?.()}</div>
    </div>
  </div>
{/if}
