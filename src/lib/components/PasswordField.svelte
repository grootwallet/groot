<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';

  let {
    value = $bindable(),
    label,
    inputLabel = label,
    placeholder = '',
    autocomplete = 'current-password',
    hint = '',
    error = '',
    tooltip = '',
    disabled = false,
    oninput = () => {},
    onkeydown = undefined
  } = $props<{
    value: string;
    label: string;
    inputLabel?: string;
    placeholder?: string;
    autocomplete?: string;
    hint?: string;
    error?: string;
    tooltip?: string;
    disabled?: boolean;
    oninput?: () => void;
    onkeydown?: (event: KeyboardEvent) => void;
  }>();

  let revealed = $state(false);
</script>

<label class="field password-field">
  <span class="field-label"
    >{label}{#if tooltip}<InsightTip text={tooltip} />{/if}</span
  >
  <span class="password-control">
    <input
      aria-label={inputLabel}
      type={revealed ? 'text' : 'password'}
      bind:value
      {placeholder}
      {autocomplete}
      {disabled}
      oninput={() => oninput()}
      {onkeydown}
    />
    <button
      type="button"
      aria-label={translate($locale, revealed ? 'Hide {label}' : 'Show {label}', {
        label: translate($locale, inputLabel)
      })}
      {disabled}
      onclick={() => (revealed = !revealed)}
    >
      {#if revealed}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
    </button>
  </span>
  {#if error}<em>{error}</em>{:else if hint}<small>{hint}</small>{/if}
</label>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.password-control):where(.password-control) {
    position: relative;
    display: block;
  }
  .password-control :global(input) {
    padding-right: 43px;
  }
  :global(.password-control):where(.password-control) :global(input::-webkit-caps-lock-indicator) {
    /* WebKit stretches this replaced SVG to the input's inner height by default. */
    width: 17px;
    height: 17px;
    max-width: 17px;
    max-height: 17px;
    align-self: center;
    flex: none;
  }
  :global(.password-control):where(.password-control) :global(button) {
    position: absolute;
    top: 50%;
    right: 7px;
    width: 32px;
    height: 32px;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
  }
  :global(.password-control):where(.password-control) :global(button:hover) {
    color: var(--text);
    background: var(--surface-icon);
  }
  :global(.password-control):where(.password-control) :global(button:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
</style>
