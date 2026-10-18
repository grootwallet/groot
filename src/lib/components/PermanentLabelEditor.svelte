<script lang="ts">
  import { X } from '@lucide/svelte';
  import FieldCounter from './FieldCounter.svelte';
  import Tooltip from './Tooltip.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import type { LabelSuggestion } from '$lib/types';
  import {
    addPermanentLabelSuggestion,
    applyPermanentLabelKey,
    updatePermanentLabelDraft,
    type LabelDraftEditKind,
    type LabelDraftState
  } from '$lib/wallet/label-suggestions';

  let {
    id,
    title,
    placeholder,
    hint = '',
    showCounter = true,
    discreet = false,
    suggestions,
    labels = $bindable<string[]>(),
    value = $bindable<string>(),
    onedit = () => {}
  } = $props<{
    id: string;
    title: string;
    placeholder: string;
    hint?: string;
    showCounter?: boolean;
    discreet?: boolean;
    suggestions: LabelSuggestion[];
    labels: string[];
    value: string;
    onedit?: (kind: LabelDraftEditKind) => void;
  }>();

  let armedIndex = $state<number | null>(null);

  function currentState(): LabelDraftState {
    return { labels, input: value, armedIndex };
  }

  function apply(next: LabelDraftState) {
    labels = next.labels;
    value = next.input;
    armedIndex = next.armedIndex;
  }

  function update(nextValue: string): string {
    apply(updatePermanentLabelDraft(currentState(), nextValue));
    onedit('input');
    return value;
  }

  function keydown(event: KeyboardEvent) {
    const result = applyPermanentLabelKey(currentState(), event.key, event.shiftKey);
    if (result.preventDefault) event.preventDefault();
    apply(result.state);
    if (result.editKind) onedit(result.editKind);
  }

  function useSuggestion(suggestion: string) {
    apply(addPermanentLabelSuggestion(currentState(), suggestion));
    onedit('suggestion');
  }
</script>

<div class="field">
  <label for={id}>{title}</label>
  <div class="label-token-field" aria-label={translate($locale, 'Selected labels')}>
    {#each labels as selected, index}<span
        class="label-token"
        class:label-token-armed={index === armedIndex}
        ><span class="label-token-text">{selected}</span><button
          type="button"
          aria-label={translate($locale, 'Remove {label}', { label: selected })}
          onclick={() => {
            labels = labels.filter((item: string) => item !== selected);
            armedIndex = null;
          }}><X size={11} /></button
        ></span
      >{/each}<input
      {id}
      aria-label={title}
      {value}
      oninput={(event) => (event.currentTarget.value = update(event.currentTarget.value))}
      onkeydown={keydown}
      placeholder={labels.length ? '' : placeholder}
      maxlength="48"
    />
  </div>
  {#if showCounter}<FieldCounter {value} max={48} {hint} />{/if}
</div>
{#if !discreet}<div class="label-suggestions">
    {#each suggestions as suggestion}<Tooltip
        text={suggestion.text}
        truncatedSelector=".label-suggestion-text"
        positionSelector="button"
        ><button
          type="button"
          aria-label={translate($locale, 'Reuse {label}', { label: suggestion.text })}
          onclick={() => useSuggestion(suggestion.text)}
          ><span class="label-suggestion-text">{suggestion.text}</span></button
        ></Tooltip
      >{/each}
  </div>{/if}

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.label-suggestion-text):where(.label-suggestion-text) {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.label-token-field):where(.label-token-field) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 40px;
    padding: 5px 8px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }
  :global(.label-token-field:focus-within):where(.label-token-field) {
    border-color: var(--border-strong);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--link) 18%, transparent);
  }
  :global(.label-token):where(.label-token) {
    position: relative;
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 28px;
    padding: 3px 9px;
    color: var(--text);
    font-size: var(--font-size-meta);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--surface-icon);
    transition:
      border-color 100ms ease,
      background 100ms ease;
  }
  :global(.label-token-text):where(.label-token-text) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.label-token-armed):where(.label-token-armed) {
    border-color: var(--focus);
    background: color-mix(in srgb, var(--focus) 10%, var(--surface-icon));
  }
  :global(.label-token):where(.label-token) :global(button) {
    position: absolute;
    top: -5px;
    right: -5px;
    display: flex;
    width: 16px;
    height: 16px;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 0;
    color: var(--text);
    border: 1px solid var(--control-border);
    border-radius: 50%;
    background: var(--surface-control);
    box-shadow: 0 1px 3px rgba(20, 24, 31, 0.18);
    opacity: 0;
    transition: opacity 100ms ease;
  }
  :global(.label-token):where(.label-token) :global(button svg) {
    display: block;
    width: 11px;
    height: 11px;
  }
  :global(.label-token:hover):where(.label-token) :global(button),
  :global(.label-token:focus-within):where(.label-token) :global(button) {
    opacity: 1;
  }
  :global(.label-token):where(.label-token) :global(button:hover),
  :global(.label-token):where(.label-token) :global(button:focus-visible) {
    color: white;
    border-color: var(--danger);
    background: var(--danger);
  }
  @media (hover: none) {
    :global(.label-token):where(.label-token) :global(button) {
      opacity: 0.82;
    }
  }
</style>
