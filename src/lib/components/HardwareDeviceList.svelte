<script lang="ts">
  import { Cpu, RefreshCw } from '@lucide/svelte';
  import type { HardwareDevice } from '$lib/wallet';
  import Button from './Button.svelte';

  let {
    devices,
    emptyMessage,
    onselect,
    onrescan,
    disabled = false,
    showRescan = false,
    detailedStatus = false
  }: {
    devices: HardwareDevice[];
    emptyMessage: string;
    onselect: (device: HardwareDevice) => void | Promise<void>;
    onrescan: () => void | Promise<void>;
    disabled?: boolean;
    showRescan?: boolean;
    detailedStatus?: boolean;
  } = $props();

  function detail(device: HardwareDevice) {
    return detailedStatus && device.fingerprint
      ? `Fingerprint ${device.fingerprint} · ${device.message}`
      : device.fingerprint ?? device.message;
  }

  function status(device: HardwareDevice) {
    if (device.status === 'ready') return 'Ready';
    if (device.status === 'detected') return 'Detected';
    if (device.action === 'confirm_empty_passphrase') return 'Choose wallet';
    return 'Attention';
  }
</script>

{#if !devices.length}
  <div class="device-scan">
    <strong>No device found</strong>
    <span>{emptyMessage}</span>
    <Button variant="secondary" onclick={onrescan}>Scan again</Button>
  </div>
{:else}
  <div class="source-list" class:hardware-device-list={detailedStatus}>
    {#each devices as device (device.id)}
      <button onclick={() => onselect(device)} {disabled}>
        <Cpu size={18}/>
        <span><strong>{device.label}</strong><small>{detail(device)}</small></span>
        {#if detailedStatus}<em class:ready={device.status === 'ready'}>{status(device)}</em>{/if}
      </button>
    {/each}
    {#if showRescan}
      <button class="hardware-rescan" onclick={onrescan} {disabled}>
        <RefreshCw size={16}/>
        <span><strong>Rescan devices</strong><small>Refresh after connecting or unlocking another signer.</small></span>
      </button>
    {/if}
  </div>
{/if}
