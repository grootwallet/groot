<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Cpu, RefreshCw } from '@lucide/svelte';
  import type { HardwareDevice } from '$lib/wallet';
  import {
    hardwareDeviceDisplayName,
    hardwareWalletMembership,
    hardwareWalletMembershipLabel,
    type SavedHardwareSignerName
  } from '$lib/hardware/discovery';
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
    if (device.action === 'prompt_pin') return '';
    return detailedStatus && device.fingerprint
      ? translate($locale, 'Fingerprint {fingerprint} · {message}', {
          fingerprint: device.fingerprint,
          message: translate($locale, device.message)
        })
      : (device.fingerprint ?? device.message);
  }

  function status(device: HardwareDevice) {
    if (device.action === 'prompt_pin') return 'Locked';
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
  <div
    class="source-list"
    class:hardware-device-list={detailedStatus ||
      devices.some((device) => device.action === 'prompt_pin')}
  >
    {#each devices as device (device.id)}
      {@const deviceDetail = detail(device)}
      {@const membership = hardwareWalletMembership(
        device,
        savedSigners.map((signer) => signer.fingerprint)
      )}
      <button
        onclick={() => onselect(device)}
        disabled={disabled || (savedSigners.length > 0 && membership === 'unrelated')}
      >
        <Cpu size={18} />
        <span
          ><strong>{hardwareDeviceDisplayName(device, savedSigners)}</strong
          >{#if savedSigners.length && hardwareWalletMembershipLabel(membership)}<small
              >{translate($locale, hardwareWalletMembershipLabel(membership))}</small
            >{/if}{#if deviceDetail}<small>{translate($locale, deviceDetail)}</small>{/if}</span
        >
        {#if detailedStatus || device.action === 'prompt_pin'}<em
            class:ready={device.status === 'ready'}>{translate($locale, status(device))}</em
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
