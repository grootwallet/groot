<script lang="ts">
  import { FileUp } from '@lucide/svelte';

  type Props = {
    ariaLabel: string;
    accept: string;
    title: string;
    description: string;
    loaded?: boolean;
    onchange: (event: Event) => unknown;
  };

  let {
    ariaLabel,
    accept,
    title,
    description,
    loaded = false,
    onchange
  }: Props = $props();
</script>

<label class:loaded class="transfer-file-picker">
  <FileUp size={18} />
  <span>
    <strong>{title}</strong>
    <small title={description}>{description}</small>
  </span>
  <input aria-label={ariaLabel} type="file" {accept} {onchange} />
</label>

<style>
  .transfer-file-picker {
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 18px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--muted);
    background: var(--surface-inset);
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, background .15s ease;
  }

  .transfer-file-picker:hover,
  .transfer-file-picker:focus-within {
    color: var(--text);
    border-color: var(--border-strong);
    background: var(--surface-control);
  }

  .transfer-file-picker.loaded {
    color: var(--success);
    border-style: solid;
    border-color: color-mix(in srgb, var(--success) 28%, var(--border));
    background: color-mix(in srgb, var(--success) 5%, var(--surface-inset));
  }

  span {
    min-width: 0;
    display: grid;
    gap: 4px;
    text-align: center;
  }

  strong { font-size: 11px; }

  small {
    max-width: min(520px, 70vw);
    overflow: hidden;
    color: var(--text-soft);
    font-size: 9px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  @media (max-width: 560px) {
    .transfer-file-picker { min-height: 72px; padding: 16px 14px; }
  }
</style>
