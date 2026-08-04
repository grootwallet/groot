<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';

  let {
    value = $bindable(),
    label,
    inputLabel = label,
    placeholder = '',
    autocomplete = 'current-password',
    hint = '',
    error = '',
    oninput = () => {}
  } = $props<{
    value: string;
    label: string;
    inputLabel?: string;
    placeholder?: string;
    autocomplete?: string;
    hint?: string;
    error?: string;
    oninput?: () => void;
  }>();

  let revealed = $state(false);
</script>

<label class="field password-field">
  <span>{label}</span>
  <span class="password-control">
    <input aria-label={inputLabel} type={revealed ? 'text' : 'password'} bind:value {placeholder} {autocomplete} oninput={() => oninput()} />
    <button type="button" aria-label={revealed ? `Hide ${inputLabel}` : `Show ${inputLabel}`} onclick={() => revealed = !revealed}>
      {#if revealed}<EyeOff size={16}/>{:else}<Eye size={16}/>{/if}
    </button>
  </span>
  {#if error}<em>{error}</em>{:else if hint}<small>{hint}</small>{/if}
</label>
