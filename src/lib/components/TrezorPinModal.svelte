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
  import { walletService } from '$lib/wallet';
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
  let cancellationRequested = $state(false);
  let cancellationBusy = $state(false);
  let attentionSignal = $state(0);

  $effect(() => {
    if (!open || (!challengeReady && !busy)) cancellationRequested = false;
  });

  function requestClose() {
    if (challengeReady || busy) {
      cancellationRequested = true;
      attentionSignal += 1;
      return;
    }
    onclose();
  }

  async function confirmDeviceCancellation() {
    if (cancellationBusy) return;
    cancellationBusy = true;
    try {
      await walletService.cancelHardwareOperations();
    } catch {
      // The device-side cancellation is authoritative; still clear the local flow.
    } finally {
      cancellationBusy = false;
      cancellationRequested = false;
      onclose();
    }
  }
</script>

<Modal
  {open}
  title={translate($locale, 'Unlock {brand}', { brand })}
  onclose={requestClose}
  {attentionSignal}
>
  <div class="pin-matrix-flow">
    <div class="hardware-readiness">
      <LockKeyhole size={18} />
      <span>
        <strong>{translate($locale, 'Match locations, not numbers')}</strong>
        <small
          >{translate(
            $locale,
            'For each PIN digit on Trezor, tap the blank cell in the same location.'
          )}</small
        >
      </span>
    </div>
    {#if cancellationRequested}
      <HardwareActionPrompt
        title={translate($locale, 'Cancel on Trezor')}
        detail={translate($locale, 'Cancel the PIN request on Trezor before closing this dialog.')}
        label={translate($locale, 'Trezor cancellation required')}
      />
      <div class="pin-matrix-actions">
        <Button
          variant="secondary"
          disabled={cancellationBusy}
          onclick={() => (cancellationRequested = false)}
          >{translate($locale, 'Continue PIN entry')}</Button
        >
        <Button disabled={cancellationBusy} onclick={confirmDeviceCancellation}
          >{translate($locale, 'I canceled on Trezor')}</Button
        >
      </div>
    {:else if error}
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
