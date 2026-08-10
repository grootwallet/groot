<script lang="ts">
  import { AlertTriangle, Delete, LockKeyhole } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { hardwareBrand, TREZOR_PIN_CELLS, TREZOR_PIN_MAX_POSITIONS, trezorPinError } from '$lib/hardware/trezor-pin';
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
</script>

<Modal
  {open}
  title="Unlock {brand}"
  description="Use the shuffled matrix shown only on your device. Groot receives positions, never your PIN digits."
  {onclose}
>
  <div class="pin-matrix-flow">
    <div class="hardware-readiness">
      <LockKeyhole size={18}/>
      <span>
        <strong>Match locations, not numbers</strong>
        <small>Find each PIN digit on the Trezor screen, then tap the blank Groot cell in the same location. Never enter recovery words or a hardware passphrase here.</small>
      </span>
    </div>
    {#if positions}
      <output aria-label={`${positions.length} PIN positions selected`}>{'•'.repeat(positions.length)}</output>
    {/if}
    <div class="pin-grid-heading">
      <strong>Blank position grid</strong>
      <small>The shuffled digits appear only on Trezor. This grid deliberately stays blank—even when Trezor generates a fresh layout.</small>
    </div>
    <div class="pin-matrix" aria-label="Blind PIN position grid">
      {#each TREZOR_PIN_CELLS as cell}
        <button
          type="button"
          aria-label={cell.label}
          disabled={busy || !challengeReady || positions.length >= TREZOR_PIN_MAX_POSITIONS}
          onclick={() => onappend(cell.value)}
        ><span aria-hidden="true"></span></button>
      {/each}
    </div>
    <div class="pin-matrix-actions">
      <Button variant="secondary" disabled={!positions || busy} onclick={ondelete}><Delete size={15}/>Delete last</Button>
      <Button variant="secondary" disabled={!positions || busy} onclick={onclear}>Clear</Button>
    </div>
    {#if error}
      <div class="pin-error-card" role="alert" aria-live="assertive">
        <AlertTriangle size={18}/>
        <span><strong>{errorPresentation.title}</strong><small>{errorPresentation.detail}</small></span>
      </div>
      <Button class="full" variant="secondary" onclick={onretry}>Ask Trezor for a fresh layout</Button>
    {:else if busy}
      <HardwareActionPrompt title="Waiting for Trezor" detail="Keep it connected while the device checks the selected PIN positions." label="Trezor unlock in progress"/>
    {:else}
      <Button
        class="full"
        disabled={!positions || !challengeReady}
        onclick={onsubmit}
      >Unlock {brand}</Button>
    {/if}
  </div>
</Modal>
