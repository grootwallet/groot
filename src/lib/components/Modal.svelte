<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { X } from '@lucide/svelte';
  import { lockModalScroll, modalDocumentTop } from './modal-scroll-lock';
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  let {
    open,
    title,
    description = '',
    onclose,
    attentionSignal = 0,
    dismissible = true,
    children
  } = $props();
  let dialog = $state<HTMLDivElement>();
  let documentTop = $state(-32);
  let attentionActive = $state(false);
  let attentionFrame: number | null = null;
  let attentionTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (attentionFrame !== null) cancelAnimationFrame(attentionFrame);
    if (attentionTimer !== null) clearTimeout(attentionTimer);
  });

  function showAttention() {
    if (!open || typeof requestAnimationFrame === 'undefined') return;
    if (attentionFrame !== null) cancelAnimationFrame(attentionFrame);
    if (attentionTimer !== null) clearTimeout(attentionTimer);
    attentionActive = false;
    attentionFrame = requestAnimationFrame(() => {
      attentionFrame = null;
      attentionActive = true;
      attentionTimer = setTimeout(() => {
        attentionTimer = null;
        attentionActive = false;
      }, 420);
    });
  }

  function requestClose() {
    if (dismissible) {
      onclose();
      return;
    }
    showAttention();
  }

  $effect(() => {
    const signal = attentionSignal;
    if (!signal) return;
    showAttention();
  });

  $effect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    documentTop = modalDocumentTop(document, window.scrollY - 32);
    const releaseScrollLock = lockModalScroll(document, documentTop);
    queueMicrotask(() => {
      const first = dialog?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (first ?? dialog)?.focus();
    });
    return () => {
      releaseScrollLock();
      previousFocus?.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ];
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0],
      last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <div
    class="modal-layer"
    style:--modal-document-top={`${documentTop}px`}
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && requestClose()}
  >
    <div
      bind:this={dialog}
      class="modal"
      class:modal-attention={attentionActive}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      onkeydown={handleKeydown}
      transition:fly={{ y: 8, duration: 180 }}
    >
      <header class="modal-header">
        <div>
          <h2>{title}</h2>
          {#if description}<p>{description}</p>{/if}
        </div>
        <button class="icon-button" aria-label={translate($locale, 'Close')} onclick={requestClose}
          ><X size={18} /></button
        >
      </header>
      <div class="modal-body">{@render children?.()}</div>
    </div>
  </div>
{/if}
