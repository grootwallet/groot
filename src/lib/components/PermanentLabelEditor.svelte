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
  <FieldCounter {value} max={48} {hint} />
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
