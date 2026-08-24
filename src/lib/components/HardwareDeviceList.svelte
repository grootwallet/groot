<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Cpu, RefreshCw } from '@lucide/svelte';
  import type { HardwareDevice } from '$lib/wallet';
  import { hardwareDeviceDisplayName, type SavedHardwareSignerName } from '$lib/hardware/discovery';
  import Button from './Button.svelte';

  let {
    devices,
    emptyMessage,
    onselect,
    onrescan,
    disabled = false,
    showRescan = false,
    detailedStatus = false,
    savedSigners = []
  }: {
    devices: HardwareDevice[];
    emptyMessage: string;
    onselect: (device: HardwareDevice) => void | Promise<void>;
    onrescan: () => void | Promise<void>;
    disabled?: boolean;
    showRescan?: boolean;
    detailedStatus?: boolean;
    savedSigners?: readonly SavedHardwareSignerName[];
  } = $props();

  function detail(device: HardwareDevice) {
    return detailedStatus && device.fingerprint
      ? translate($locale, 'Fingerprint {fingerprint} · {message}', {
          fingerprint: device.fingerprint,
          message: translate($locale, device.message)
        })
      : (device.fingerprint ?? device.message);
  }

  function status(device: HardwareDevice) {
    if (device.status === 'ready') return 'Ready';
    if (device.status === 'detected') return 'Detected';
    if (device.action === 'unlock') return 'Unlock & continue';
    if (device.action === 'confirm_empty_passphrase') return 'Choose wallet';
    return 'Attention';
  }
</script>

{#if !devices.length}
  <div class="device-scan">
    <strong>{translate($locale, 'No device found')}</strong>
    <span>{emptyMessage}</span>
    <Button variant="secondary" onclick={onrescan}>{translate($locale, 'Scan again')}</Button>
  </div>
{:else}
  <div class="source-list" class:hardware-device-list={detailedStatus}>
    {#each devices as device (device.id)}
      <button onclick={() => onselect(device)} {disabled}>
        <Cpu size={18} />
        <span
          ><strong>{hardwareDeviceDisplayName(device, savedSigners)}</strong><small
            >{translate($locale, detail(device))}</small
          ></span
        >
        {#if detailedStatus}<em class:ready={device.status === 'ready'}
            >{translate($locale, status(device))}</em
          >{/if}
      </button>
    {/each}
    {#if showRescan}
      <button class="hardware-rescan" onclick={onrescan} {disabled}>
        <RefreshCw size={16} />
        <span
          ><strong>{translate($locale, 'Rescan devices')}</strong><small
            >{translate($locale, 'Refresh after connecting or unlocking another signer.')}</small
          ></span
        >
      </button>
    {/if}
  </div>
{/if}
