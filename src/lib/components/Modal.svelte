<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { X } from '@lucide/svelte';
  import { lockModalScroll } from './modal-scroll-lock';
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  let {
    open,
    title,
    description = '',
    onclose,
    attentionSignal = 0,
    wide = false,
    dismissible = true,
    upper = false,
    fixedViewport = false,
    children
  } = $props();
  let dialog = $state<HTMLDivElement>();
  let attentionActive = $state(false);
  let attentionRunning = false;
  let attentionFrame: number | null = null;
  let attentionTimer: ReturnType<typeof setTimeout> | null = null;

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  function clearAttentionSchedule() {
    if (attentionFrame !== null) cancelAnimationFrame(attentionFrame);
    if (attentionTimer !== null) clearTimeout(attentionTimer);
    attentionFrame = null;
    attentionTimer = null;
  }

  function activateAttention() {
    attentionRunning = true;
    attentionActive = true;
    attentionTimer = setTimeout(() => {
      attentionTimer = null;
      attentionRunning = false;
      attentionActive = false;
    }, 420);
  }

  onDestroy(clearAttentionSchedule);

  $effect(() => {
    const signal = attentionSignal;
    if (!open || !signal) return;
    clearAttentionSchedule();
    if (!attentionRunning) {
      activateAttention();
      return;
    }
    attentionRunning = false;
    attentionActive = false;
    const restart = () => {
      attentionFrame = null;
      activateAttention();
    };
    if (typeof requestAnimationFrame === 'undefined') {
      attentionTimer = setTimeout(restart, 0);
    } else {
      attentionFrame = requestAnimationFrame(restart);
    }
  });

  $effect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScrollLock = lockModalScroll(document);
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
    if (dismissible && event.key === 'Escape') {
      event.preventDefault();
      onclose();
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
    class:modal-layer-upper={upper}
    use:portal
    role="presentation"
    onclick={(e) => dismissible && e.target === e.currentTarget && onclose()}
  >
    <div
      bind:this={dialog}
      class="modal"
      class:modal-wide={wide}
      class:modal-fixed-viewport={fixedViewport}
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
        <button
          disabled={!dismissible}
          class="icon-button"
          aria-label={translate($locale, 'Close')}
          onclick={() => {
            if (dismissible) onclose?.();
          }}><X size={18} /></button
        >
      </header>
      <div class="modal-body">{@render children?.()}</div>
    </div>
  </div>
{/if}

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.modal-layer):where(.modal-layer) {
    position: fixed;
    inset: 0;
    height: 100dvh;
    box-sizing: border-box;
    z-index: 100;
    overflow: hidden;
    overscroll-behavior: contain;
    background: rgba(0, 0, 0, 0.76);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: clamp(48px, 5vh, 60px) 18px 18px;
  }
  :global(.modal-layer.modal-layer-upper):where(.modal-layer) {
    padding-top: clamp(48px, 5vh, 60px);
  }
  :global(.modal):where(.modal) {
    width: min(480px, 100%);
    max-height: min(720px, 100%);
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-panel);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }
  :global(.modal.modal-wide):where(.modal) {
    width: min(760px, 100%);
  }
  :global(.modal.modal-fixed-viewport):where(.modal) {
    height: min(720px, 100%);
  }
  :global(.modal.modal-fixed-viewport):where(.modal) :global(.modal-body) {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    scrollbar-gutter: auto;
  }
  :global(.modal.modal-fixed-viewport):where(.modal) :global(.hardware-inline-error) {
    flex: none;
    margin-top: 0;
  }
  :global(.modal:focus-visible):where(.modal) {
    outline: none;
  }
  :global(.modal.modal-attention):where(.modal) {
    animation: modal-attention 360ms ease-out;
  }
  :global(.modal-header):where(.modal-header) {
    padding: 20px 20px 16px;
    display: flex;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid var(--border);
  }
  :global(.modal-header):where(.modal-header) :global(h2) {
    font-size: 16px;
    margin: 0;
  }
  :global(.modal-header):where(.modal-header) :global(p) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
    margin: 6px 0 0;
  }
  :global(.icon-button):where(.icon-button) {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  :global(.icon-button:hover):where(.icon-button) {
    color: var(--text);
    background: var(--surface-hover);
  }
  :global(.icon-button:focus-visible):where(.icon-button) {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  :global(.modal-body):where(.modal-body) {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.modal.modal-attention):where(.modal) {
      animation: none !important;
      outline: 2px solid var(--focus);
      outline-offset: -2px;
    }
  }

  @media (max-width: 760px) {
    :global(.modal-layer):where(.modal-layer) {
      position: fixed;
      inset: 0;
      height: auto;
      min-height: 0;
      align-items: flex-end;
      padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
    }
    :global(.modal-layer.modal-layer-upper):where(.modal-layer) {
      align-items: flex-end;
      padding-top: max(10px, env(safe-area-inset-top));
    }
    :global(.modal-layer.modal-layer-upper):where(.modal-layer) :global(.modal) {
      max-height: calc(100dvh - max(20px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
    }
    :global(.modal):where(.modal) {
      width: 100%;
      max-height: calc(100dvh - max(20px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
      border-radius: var(--radius-panel);
    }
    :global(.modal-header):where(.modal-header) {
      padding: 17px 16px 13px;
    }
    :global(.modal-body):where(.modal-body) {
      padding: 16px;
    }
  }
</style>
