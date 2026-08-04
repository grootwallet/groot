<script lang="ts">
  import { X } from '@lucide/svelte';
  let { open, title, description = '', onclose, children } = $props();
  let dialog = $state<HTMLDivElement>();

  $effect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => {
      const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      (first ?? dialog)?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
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
    <div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={handleKeydown}>
      <header class="modal-header">
        <div><h2>{title}</h2>{#if description}<p>{description}</p>{/if}</div>
        <button class="icon-button" aria-label="Close" onclick={onclose}><X size={18} /></button>
      </header>
      <div class="modal-body">{@render children?.()}</div>
    </div>
  </div>
{/if}
