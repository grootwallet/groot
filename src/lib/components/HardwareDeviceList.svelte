<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Cpu, RefreshCw } from '@lucide/svelte';
  import type { HardwareDevice } from '$lib/wallet';
  import {
    hardwareDeviceStateLabel,
    hardwareDeviceDisplayName,
    hardwareWalletMembership,
    type HardwareWalletMembership,
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
    savedSigners = [],
    eligibleFingerprints = [],
    eligibleDeviceTypes = [],
    membershipOverrides = {},
    policyUnverified = () => false,
    deviceDisplayName = (device) => hardwareDeviceDisplayName(device, savedSigners),
    deviceSecondaryLabel = (device) => device.fingerprint ?? '',
    deviceStateLabel = (device, membership) =>
      hardwareDeviceStateLabel(device, membership, policyUnverified(device)),
    deviceDisabled = (_device, membership) => savedSigners.length > 0 && membership === 'unrelated'
  }: {
    devices: HardwareDevice[];
    emptyMessage: string;
    onselect: (device: HardwareDevice) => void | Promise<void>;
    onrescan: () => void | Promise<void>;
    disabled?: boolean;
    showRescan?: boolean;
    detailedStatus?: boolean;
    savedSigners?: readonly SavedHardwareSignerName[];
    eligibleFingerprints?: readonly string[];
    eligibleDeviceTypes?: readonly string[];
    membershipOverrides?: Readonly<Record<string, HardwareWalletMembership>>;
    policyUnverified?: (device: HardwareDevice) => boolean;
    deviceDisplayName?: (device: HardwareDevice) => string;
    deviceSecondaryLabel?: (device: HardwareDevice) => string;
    deviceStateLabel?: (device: HardwareDevice, membership: HardwareWalletMembership) => string;
    deviceDisabled?: (device: HardwareDevice, membership: HardwareWalletMembership) => boolean;
  } = $props();
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
      {@const secondaryLabel = deviceSecondaryLabel(device)}
      {@const membership =
        membershipOverrides[device.id] ??
        (eligibleFingerprints.length || eligibleDeviceTypes.length || savedSigners.length
          ? hardwareWalletMembership(
              device,
              eligibleFingerprints.length
                ? eligibleFingerprints
                : savedSigners.map((signer) => signer.fingerprint),
              eligibleDeviceTypes.length
                ? eligibleDeviceTypes
                : savedSigners
                    .map((signer) => signer.deviceType)
                    .filter((deviceType): deviceType is string => Boolean(deviceType)),
              savedSigners
            )
          : 'candidate')}
      {@const stateLabel = deviceStateLabel(device, membership)}
      <button
        onclick={() => onselect(device)}
        disabled={disabled || deviceDisabled(device, membership)}
      >
        <Cpu size={18} />
        <span
          ><strong>{deviceDisplayName(device)}</strong>{#if secondaryLabel}<small
              >{secondaryLabel}</small
            >{/if}<em
            class:ready={stateLabel === 'Ready'}
            class:attention={stateLabel !== 'Ready' && stateLabel !== 'Already signed'}
            >{translate($locale, stateLabel)}</em
          ></span
        >
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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.hardware-device-list):where(.hardware-device-list) :global(em) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    width: fit-content;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 3px 8px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-style: normal;
    font-weight: 400;
  }
  :global(.hardware-device-list):where(.hardware-device-list) :global(em.ready),
  :global(.hardware-device-list):where(.hardware-device-list) :global(em.signed) {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.08);
    color: var(--success);
  }
  :global(.hardware-device-list):where(.hardware-device-list) :global(em.attention) {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
