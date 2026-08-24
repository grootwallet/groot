<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { AlertTriangle, Delete, LockKeyhole } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import {
    hardwareBrand,
    TREZOR_PIN_CELLS,
    TREZOR_PIN_MAX_POSITIONS,
    trezorPinGridAvailable,
    trezorPinError
  } from '$lib/hardware/trezor-pin';
  import type { HardwareDevice, WalletErrorCode } from '$lib/wallet/contracts';

  let {
    open,
    busy,
    challengeReady,
    positions,
    device,
    errorCode = '',
    error = '',
    onappend,
    ondelete,
    onclear,
    onsubmit,
    onretry,
    onclose
  }: {
    open: boolean;
    busy: boolean;
    challengeReady: boolean;
    positions: string;
    device: HardwareDevice | null;
    errorCode?: WalletErrorCode | '';
    error?: string;
    onappend: (position: string) => void;
    ondelete: () => void;
    onclear: () => void;
    onsubmit: () => void;
    onretry: () => void;
    onclose: () => void;
  } = $props();

  const brand = $derived(hardwareBrand(device));
  const errorPresentation = $derived(trezorPinError(errorCode, error));
  const gridAvailable = $derived(trezorPinGridAvailable(challengeReady, busy, error));
</script>

<Modal
  {open}
  title={translate($locale, 'Unlock {brand}', { brand })}
  description={translate(
    $locale,
    'Use the shuffled matrix shown only on your device. Groot receives positions, never your PIN digits.'
  )}
  {onclose}
>
  <div class="pin-matrix-flow">
    <div class="hardware-readiness">
      <LockKeyhole size={18} />
      <span>
        <strong>{translate($locale, 'Match locations, not numbers')}</strong>
        <small
          >{translate(
            $locale,
            'Find each PIN digit on the Trezor screen, then tap the blank Groot cell in the same\n          location. Never enter recovery words or a hardware passphrase here.'
          )}</small
        >
      </span>
    </div>
    {#if error}
      <div class="pin-error-card" role="alert" aria-live="assertive">
        <AlertTriangle size={18} />
        <span
          ><strong>{errorPresentation.title}</strong><small>{errorPresentation.detail}</small></span
        >
      </div>
      <Button class="full" variant="secondary" onclick={onretry}
        >{translate($locale, 'Ask Trezor for a fresh layout')}</Button
      >
    {:else if busy}
      <HardwareActionPrompt
        title={translate($locale, 'Waiting for Trezor')}
        detail={translate(
          $locale,
          'Keep it connected while the device checks the selected PIN positions.'
        )}
        label={translate($locale, 'Trezor unlock in progress')}
      />
    {:else if gridAvailable}
      {#if positions}
        <output
          aria-label={translate($locale, '{count} PIN positions selected', {
            count: positions.length
          })}>{'•'.repeat(positions.length)}</output
        >
      {/if}
      <div class="pin-grid-heading">
        <strong>{translate($locale, 'Blank position grid')}</strong>
        <small
          >{translate(
            $locale,
            'The shuffled digits appear only on Trezor. This grid deliberately stays blank—even when\n          Trezor generates a fresh layout.'
          )}</small
        >
      </div>
      <div class="pin-matrix" aria-label={translate($locale, 'Blind PIN position grid')}>
        {#each TREZOR_PIN_CELLS as cell}
          <button
            type="button"
            aria-label={cell.label}
            disabled={positions.length >= TREZOR_PIN_MAX_POSITIONS}
            onclick={() => onappend(cell.value)}><span aria-hidden="true"></span></button
          >
        {/each}
      </div>
      <div class="pin-matrix-actions">
        <Button variant="secondary" disabled={!positions} onclick={ondelete}
          ><Delete size={15} />{translate($locale, 'Delete last')}</Button
        >
        <Button variant="secondary" disabled={!positions} onclick={onclear}
          >{translate($locale, 'Clear')}</Button
        >
      </div>
      <Button class="full" disabled={!positions || !challengeReady} onclick={onsubmit}
        >{translate($locale, 'Unlock')} {brand}</Button
      >
    {/if}
  </div>
</Modal>
