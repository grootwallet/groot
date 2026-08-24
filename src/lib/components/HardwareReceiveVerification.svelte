<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { AlertTriangle, ChevronRight, Cpu, ShieldCheck } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import HardwareAddressComparison from '$lib/components/HardwareAddressComparison.svelte';
  import HardwareDeviceEmptyState from '$lib/components/HardwareDeviceEmptyState.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import { copyText } from '$lib/clipboard';
  import {
    hasAmbiguousUnidentifiedHardware,
    localizedReceiveVerificationFailure,
    receiveVerificationIntent
  } from '$lib/hardware/receive-verification';
  import { hardwareDeviceDisplayName, type SavedHardwareSignerName } from '$lib/hardware/discovery';
  import { toast } from '$lib/stores/toasts';
  import { walletService, type HardwareDevice, type WalletErrorCode } from '$lib/wallet';
  import { hardwareAddressComparison } from '$lib/wallet/hardware-display';
  import type { ReceiveAddress } from '$lib/types';

  type Props = {
    address: ReceiveAddress;
    walletKind: 'single_key' | 'multisig';
    savedDeviceIdentity?: string | null;
    eligibleDeviceTypes: string[];
    eligibleFingerprints: string[];
    savedSigners?: readonly SavedHardwareSignerName[];
    onverified: (address: ReceiveAddress) => void;
  };

  let {
    address,
    walletKind,
    savedDeviceIdentity = null,
    eligibleDeviceTypes,
    eligibleFingerprints,
    savedSigners = [],
    onverified
  }: Props = $props();
  let verifyOpen = $state(false);
  let verifyBusy = $state(false);
  let verifyError = $state('');
  let devices = $state<HardwareDevice[]>([]);
  let verificationDevice = $state<HardwareDevice | null>(null);
  let verificationAction = $state<'scan' | 'unlock' | 'approve'>('scan');
  let cancelRequested = $state(false);
  let modalAttentionSignal = $state(0);
  let copied = $state(false);
  let pinOpen = $state(false);
  let pinBusy = $state(false);
  let pinChallenge = $state('');
  let pinPositions = $state('');
  let pinError = $state('');
  let pinErrorCode = $state<WalletErrorCode | ''>('');
  let pinDevice = $state<HardwareDevice | null>(null);
  let hardwareScanGeneration = 0;
  let hardwareCancellation: Promise<void> | null = null;

  const verificationDeviceIdentity = $derived(
    `${savedDeviceIdentity ?? ''} ${verificationDevice?.label ?? ''} ${verificationDevice?.model ?? ''}`
  );
  const comparison = $derived(
    hardwareAddressComparison(address.address, address.testnetAlias, verificationDeviceIdentity)
  );
  const isMultisig = $derived(walletKind === 'multisig');

  onDestroy(() => {
    hardwareScanGeneration += 1;
    clearPinState();
    beginHardwareCancellation();
  });

  function beginHardwareCancellation() {
    const cancellation = walletService.cancelHardwareOperations();
    hardwareCancellation = cancellation;
    void cancellation.catch(() => {});
  }

  async function waitForHardwareCancellation() {
    const cancellation = hardwareCancellation;
    if (!cancellation) return;
    try {
      await cancellation;
    } finally {
      if (hardwareCancellation === cancellation) hardwareCancellation = null;
    }
  }

  function clearPinState() {
    pinPositions = '';
    pinChallenge = '';
  }

  function finishVerificationClose(cancelNative: boolean) {
    hardwareScanGeneration += 1;
    verifyBusy = false;
    verifyOpen = false;
    cancelRequested = false;
    if (cancelNative) beginHardwareCancellation();
  }

  function closeVerification() {
    if (verifyBusy && verificationAction !== 'scan') {
      cancelRequested = true;
      modalAttentionSignal += 1;
      return;
    }
    finishVerificationClose(true);
  }

  async function copyVerificationAddress() {
    try {
      await copyText(comparison.address, 'bitcoin-address');
      copied = true;
      toast({
        title: translate($locale, 'Address copied'),
        description: translate($locale, 'The exact comparison address is on your clipboard.'),
        tone: 'success'
      });
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast({
        title: translate($locale, 'Copy failed'),
        description: translate($locale, 'Select and copy the address manually.'),
        tone: 'danger'
      });
    }
  }

  async function scan() {
    const generation = ++hardwareScanGeneration;
    verifyOpen = true;
    verificationAction = 'scan';
    cancelRequested = false;
    verifyBusy = true;
    verifyError = '';
    verificationDevice = null;
    try {
      await waitForHardwareCancellation();
      if (generation !== hardwareScanGeneration || !verifyOpen) return;
      const discovered = await walletService.listHardwareDevicesForTypes(eligibleDeviceTypes);
      if (generation !== hardwareScanGeneration || !verifyOpen) return;
      const fingerprints = new Set(
        eligibleFingerprints.map((fingerprint) => fingerprint.trim().toLowerCase())
      );
      devices = discovered.filter(
        (device) =>
          device.fingerprint === null || fingerprints.has(device.fingerprint.toLowerCase())
      );
      if (hasAmbiguousUnidentifiedHardware(devices)) {
        devices = [];
        verifyError = translate(
          $locale,
          'More than one locked wallet of an eligible type is connected. Disconnect the extra device, then scan again.'
        );
      }
    } catch (cause) {
      if (generation !== hardwareScanGeneration) return;
      devices = [];
      verifyError = localizedReceiveVerificationFailure(
        cause,
        $locale,
        'Could not scan hardware.'
      ).message;
    } finally {
      if (generation === hardwareScanGeneration) verifyBusy = false;
    }
  }

  async function chooseDevice(device: HardwareDevice) {
    switch (receiveVerificationIntent(device)) {
      case 'prompt_pin':
        await startPin(device);
        return;
      case 'unlock':
        await verifyAddress(device, true);
        return;
      case 'unavailable':
        verifyError = translate($locale, device.message);
        return;
      case 'verify':
        await verifyAddress(device);
    }
  }

  async function startPin(device: HardwareDevice) {
    const retrying = pinOpen;
    verifyBusy = true;
    pinBusy = retrying;
    verifyError = '';
    pinError = '';
    pinErrorCode = '';
    pinPositions = '';
    pinChallenge = '';
    try {
      pinChallenge = await walletService.promptHardwarePin(device.id);
      pinDevice = device;
      verifyOpen = false;
      pinOpen = true;
    } catch (cause) {
      const failure = localizedReceiveVerificationFailure(
        cause,
        $locale,
        'Could not start the PIN matrix.'
      );
      if (retrying) {
        pinErrorCode = failure.code;
        pinError = failure.message;
      } else {
        verifyError = failure.message;
      }
    } finally {
      verifyBusy = false;
      pinBusy = false;
    }
  }

  async function submitPin() {
    if (!pinChallenge || !pinPositions || pinBusy) return;
    const device = pinDevice;
    if (!device) return;
    pinBusy = true;
    pinError = '';
    pinErrorCode = '';
    const positions = pinPositions;
    pinPositions = '';
    try {
      await walletService.sendHardwarePin(pinChallenge, positions);
      pinChallenge = '';
      pinOpen = false;
      pinDevice = null;
      verifyOpen = true;
      await verifyAddress(device);
    } catch (cause) {
      pinChallenge = '';
      const failure = localizedReceiveVerificationFailure(
        cause,
        $locale,
        'Trezor did not accept that matrix entry.'
      );
      pinErrorCode = failure.code;
      pinError = failure.message;
    } finally {
      pinPositions = '';
      pinBusy = false;
    }
  }

  async function verifyAddress(device: HardwareDevice, unlockFirst = false) {
    const generation = hardwareScanGeneration;
    const targetAddressId = address.id;
    verificationDevice = device;
    verificationAction = unlockFirst ? 'unlock' : 'approve';
    cancelRequested = false;
    verifyBusy = true;
    verifyError = '';
    try {
      const verified = isMultisig
        ? await walletService.verifyMultisigAddress(device.id, targetAddressId)
        : await walletService.verifyExternalAddress(device.id, targetAddressId);
      if (generation !== hardwareScanGeneration || !verifyOpen) return;
      if (address.id !== targetAddressId) {
        verifyError = translate($locale, 'The selected address changed. Start verification again.');
        return;
      }
      cancelRequested = false;
      onverified(verified);
      verifyOpen = false;
      toast({
        title: translate($locale, 'Address verified'),
        description: translate($locale, 'The verification time was saved with this address.'),
        tone: 'success'
      });
    } catch (cause) {
      if (generation !== hardwareScanGeneration || !verifyOpen) return;
      if (cancelRequested) {
        finishVerificationClose(false);
        return;
      }
      verifyError = localizedReceiveVerificationFailure(
        cause,
        $locale,
        'The device could not verify this address.'
      ).message;
    } finally {
      if (generation === hardwareScanGeneration) verifyBusy = false;
    }
  }

  function closePin() {
    pinOpen = false;
    clearPinState();
    pinDevice = null;
    pinError = '';
    pinErrorCode = '';
    verifyOpen = true;
  }
</script>

<Button variant="secondary" onclick={scan}>
  {#if address.hardwareVerifiedAt}<ShieldCheck size={16} />{:else}<Cpu size={16} />{/if}
  {translate($locale, address.hardwareVerifiedAt ? 'Verify again' : 'Verify on device')}
</Button>

<Modal
  open={verifyOpen}
  title={translate($locale, 'Verify receive address')}
  description={translate(
    $locale,
    comparison.deviceName
      ? `${comparison.deviceName} displays the Regtest output with a testnet prefix. Compare the exact address below.`
      : "Compare the exact address below with the complete address on the signer's trusted display."
  )}
  onclose={closeVerification}
  attentionSignal={modalAttentionSignal}
>
  <HardwareAddressComparison
    {comparison}
    derivationPath={address.derivationPath}
    addressIndex={address.id}
    {copied}
    oncopy={copyVerificationAddress}
  />
  {#if verifyBusy}
    <HardwareActionPrompt
      title={translate(
        $locale,
        cancelRequested
          ? 'Cancel on your hardware device'
          : verificationAction !== 'scan'
            ? verificationAction === 'unlock'
              ? 'Unlock and check your hardware device'
              : 'Check your hardware device'
            : isMultisig
              ? 'Looking for a wallet signer'
              : 'Looking for your saved signer'
      )}
      detail={translate(
        $locale,
        cancelRequested
          ? 'Reject or cancel the pending request on the device. Groot will close this dialog after the device responds.'
          : verificationAction !== 'scan'
            ? verificationAction === 'unlock'
              ? 'Complete the login or unlock on-device, then compare the complete address above and approve it.'
              : 'Compare the complete address above, then approve it on the device.'
            : isMultisig
              ? 'Groot checks only signer types saved in this wallet policy and ignores other connected device families.'
              : 'Groot checks only this saved signer type and ignores other connected device families.'
      )}
      label={translate(
        $locale,
        cancelRequested
          ? 'Waiting for hardware cancellation'
          : verificationAction !== 'scan'
            ? verificationAction === 'unlock'
              ? 'Waiting for hardware unlock and approval'
              : 'Waiting for hardware approval'
            : 'Hardware device scan in progress'
      )}
    />
  {:else if devices.length}
    <div class="source-list hardware-device-list">
      {#each devices as device}
        <button
          disabled={device.action === 'none' || device.action === 'retry'}
          onclick={() => chooseDevice(device)}
        >
          <Cpu size={18} />
          <span>
            <strong>{hardwareDeviceDisplayName(device, savedSigners)}</strong>
            <small>{translate($locale, device.fingerprint ?? device.message)}</small>
            <em
              class:ready={device.status === 'ready' || device.status === 'detected'}
              class:attention={device.action === 'prompt_pin' ||
                device.action === 'confirm_empty_passphrase'}
              >{translate(
                $locale,
                device.action === 'prompt_pin'
                  ? 'Unlock'
                  : device.action === 'unlock'
                    ? 'Unlock & continue'
                    : device.action === 'confirm_empty_passphrase'
                      ? 'Standard wallet'
                      : device.action === 'retry'
                        ? 'Unlock, then scan again'
                        : device.status === 'ready' || device.status === 'detected'
                          ? 'Ready'
                          : 'Unavailable'
              )}</em
            >
          </span>
          {#if device.action !== 'none'}<ChevronRight size={15} />{/if}
        </button>
      {/each}
    </div>
    <Button class="verification-rescan" variant="secondary" onclick={scan}
      >{translate($locale, 'Scan again')}</Button
    >
  {:else}
    <HardwareDeviceEmptyState
      title={translate(
        $locale,
        isMultisig ? 'No compatible signer found' : 'Saved signer not found'
      )}
      description={translate(
        $locale,
        isMultisig
          ? 'Connect and unlock a signer saved in this wallet policy, then scan again.'
          : 'Connect and unlock this wallet’s hardware signer, then scan again.'
      )}
      onretry={scan}
    />
  {/if}
  {#if verifyError}<div class="hardware-inline-error" role="alert" aria-live="polite">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Device needs attention')}</strong><small>{verifyError}</small
        ></span
      >
    </div>{/if}
</Modal>

<TrezorPinModal
  open={pinOpen}
  busy={pinBusy}
  challengeReady={Boolean(pinChallenge)}
  positions={pinPositions}
  device={pinDevice}
  errorCode={pinErrorCode}
  error={pinError}
  onappend={(position) => (pinPositions += position)}
  ondelete={() => (pinPositions = pinPositions.slice(0, -1))}
  onclear={() => (pinPositions = '')}
  onsubmit={submitPin}
  onretry={() => {
    if (pinDevice) startPin(pinDevice);
  }}
  onclose={closePin}
/>
