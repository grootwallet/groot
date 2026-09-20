<script lang="ts">
  import InsightTip from '$lib/components/InsightTip.svelte';
  import { TriangleAlert } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let {
    title = '',
    body = '',
    tone = 'warning',
    insightText = '',
    insightLabel = '',
    role,
    ariaLive,
    element = 'div',
    credentialSpacing = false,
    icon = false,
    class: className = '',
    children
  } = $props<{
    title?: string;
    body?: string;
    tone?: 'warning' | 'danger';
    insightText?: string;
    insightLabel?: string;
    role?: 'alert' | 'note' | 'status';
    ariaLive?: 'assertive' | 'off' | 'polite';
    element?: 'aside' | 'div';
    credentialSpacing?: boolean;
    icon?: boolean;
    class?: string;
    children?: Snippet;
  }>();

  let classes = $derived(
    [
      'warning-notice',
      title || body ? 'structured' : '',
      tone === 'danger' ? 'danger' : '',
      credentialSpacing ? 'credential-spacing' : '',
      icon ? 'has-icon' : '',
      className
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<svelte:element this={element} class={classes} {role} aria-live={ariaLive}>
  {#if icon}<TriangleAlert class="warning-notice-icon" size={17} />{/if}
  {#if title || body || icon}
    <div class="warning-notice-content">
      {#if title}
        <div class="warning-notice-title">
          <strong>{title}</strong>
          {#if insightText}<InsightTip text={insightText} label={insightLabel} />{/if}
        </div>
      {/if}
      {#if body}<span class="warning-notice-body">{body}</span>{/if}
      {@render children?.()}
    </div>
  {:else}
    {@render children?.()}
  {/if}
</svelte:element>

<style>
  .warning-notice {
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--radius-control);
    padding: 12px 14px;
    color: var(--warning-text);
    background: var(--accent-soft);
    font-size: var(--font-size-meta);
    line-height: 1.55;
  }
  .structured {
    display: grid;
    gap: 4px;
  }
  .warning-notice-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .warning-notice-body {
    display: block;
  }
  .has-icon {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
  }
  .warning-notice-icon {
    margin-top: 2px;
  }
  .warning-notice-content {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .danger {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 20px;
    border-color: rgba(239, 100, 100, 0.25);
    color: var(--danger);
    background: rgba(239, 100, 100, 0.06);
  }
  .credential-spacing {
    margin-bottom: 24px;
  }
</style>
