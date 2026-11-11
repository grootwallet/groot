<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { Check, FileUp } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import HardwareDeviceList from '$lib/components/HardwareDeviceList.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import PolicySignerList from '$lib/components/PolicySignerList.svelte';
  import ReadableAddress from '$lib/components/ReadableAddress.svelte';
  import { copyText } from '$lib/clipboard';
  import { defaultConfig } from '$lib/config';
  import type { HardwareDevice, WalletErrorCode } from '$lib/wallet/contracts';
  import { WalletError } from '$lib/wallet';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import TransferFilePicker from '$lib/components/TransferFilePicker.svelte';
  import { toast } from '$lib/stores/toasts';
  import { readTransferFile } from '$lib/transfer';
  import { walletService, type RecoveryDrill } from '$lib/wallet';
  import type { PolicySignerGroup } from '$lib/types';
  import { policySignerRoleLabel } from '$lib/wallet/policy';
  let backup = $state(''),
    loadedBackupName = $state(''),
    walletName = $state('Recovered wallet'),
    pin = $state(''),
    confirmation = $state(''),
    drill = $state<RecoveryDrill | null>(null),
    verified = $state(false),
    busy = $state(false),
    error = $state('');
  let devices = $state<HardwareDevice[]>([]);
  let identified = $state<CosignerDraft[]>([]);
  let hardwareBusy = $state(false);
  let hardwareError = $state('');
  let standardDevice = $state<HardwareDevice | null>(null);
  let pinDevice = $state<HardwareDevice | null>(null);
  let pinChallenge = $state('');
  let pinPositions = $state('');
  let pinError = $state('');
  let pinErrorCode = $state<WalletErrorCode | ''>('');
  const expectedSigners = $derived(drill?.cosigners ?? []);
  const recoveredPolicyPaths = $derived(drill?.policyPaths ?? []);
  const pathGroupRequirement = (group: PolicySignerGroup) =>
    translate($locale, '{count} of {total} {group}', {
      count: group.required,
      total: group.signers.length,
      group: translate($locale, group.label)
    });
  const recoveredPolicyLabel = (policyType: RecoveryDrill['policyType']) => {
    if (policyType === 'partner_continuity_v1') return 'Partner continuity';
    if (policyType === 'family_continuity_v1') return 'Family continuity';
    if (policyType === 'inheritance') return 'Inheritance';
    if (policyType === 'recovery') return 'Recovery';
    return '';
  };
  const signersReady = $derived(
    defaultConfig.network !== 'mainnet' ||
      (expectedSigners.length > 0 &&
        expectedSigners.every((signer) =>
          identified.some(
            (key) =>
              key.fingerprint === signer.fingerprint &&
              key.xpub === signer.xpub &&
              key.derivationPath === signer.derivationPath
          )
        ))
  );
  async function scanDevices() {
    if (hardwareBusy) return;
    hardwareBusy = true;
    hardwareError = '';
    try {
      devices = await walletService.listHardwareDevices();
    } catch (cause) {
      hardwareError = localizedError(cause, $locale, 'Could not scan hardware signers.');
      toast({
        title: 'Could not scan hardware signers',
        description: hardwareError,
        tone: 'danger'
      });
    } finally {
      hardwareBusy = false;
    }
  }
  async function identifyDevice(device: HardwareDevice, allowEmptyPassphrase = false) {
    if (hardwareBusy) return;
    if (device.action === 'retry') return scanDevices();
    if (device.action === 'confirm_empty_passphrase' && !allowEmptyPassphrase) {
      standardDevice = device;
      return;
    }
    hardwareBusy = true;
    hardwareError = '';
    try {
      if (device.action === 'prompt_pin' && !allowEmptyPassphrase) {
        pinDevice = device;
        pinPositions = '';
        pinError = '';
        pinErrorCode = '';
        const prompt = await walletService.promptHardwarePin(device.id);
        if (prompt.pinRequired) {
          pinChallenge = prompt.challengeId ?? '';
          return;
        }
        pinDevice = null;
      }
      const key = await walletService.importHardwareCosigner(
        device.id,
        device.label,
        allowEmptyPassphrase
      );
      if (
        !expectedSigners.some(
          (expected) =>
            expected.fingerprint === key.fingerprint &&
            expected.xpub === key.xpub &&
            expected.derivationPath === key.derivationPath
        )
      )
        throw new WalletError('backup_mismatch', 'This signer does not match a key in the backup.');
      identified = [
        ...identified.filter((existing) => existing.fingerprint !== key.fingerprint),
        key
      ];
      standardDevice = null;
      toast({ title: 'Signer identified', tone: 'success' });
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'hardware_wallet_selection_required') {
        standardDevice = device;
        pinDevice = null;
      } else {
        hardwareError = localizedError(cause, $locale, 'Could not read the public key.');
        pinError = hardwareError;
        pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
        toast({ title: 'Could not identify signer', description: pinError, tone: 'danger' });
        toast({ title: 'Could not identify signer', description: hardwareError, tone: 'danger' });
      }
    } finally {
      hardwareBusy = false;
    }
  }
  async function submitPin() {
    if (!pinChallenge || !pinPositions || !pinDevice || hardwareBusy) return;
    hardwareBusy = true;
    const positions = pinPositions;
    pinPositions = '';
    const device = pinDevice;
    try {
      await walletService.sendHardwarePin(pinChallenge, positions);
      pinChallenge = '';
      pinDevice = null;
      hardwareBusy = false;
      await identifyDevice({ ...device, action: 'import' });
    } catch (cause) {
      pinError = localizedError(cause, $locale);
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      toast({ title: 'Could not identify signer', description: pinError, tone: 'danger' });
    } finally {
      hardwareBusy = false;
    }
  }
  function isPublicDescriptorBackup() {
    return !backup.trimStart().startsWith('{');
  }
  async function inspect() {
    busy = true;
    error = '';
    drill = null;
    verified = false;
    identified = [];
    devices = [];
    try {
      drill = isPublicDescriptorBackup()
        ? await walletService.inspectMultisigBsms(backup)
        : await walletService.recoveryDrill(backup);
    } catch (cause) {
      error = localizedError(cause, $locale, 'Invalid backup.');
      toast({ title: 'Invalid backup', description: error, tone: 'danger' });
    } finally {
      busy = false;
    }
  }
  function backupChanged() {
    pin = '';
    confirmation = '';
    pinPositions = '';
    pinChallenge = '';
    pinDevice = null;
    loadedBackupName = '';
    drill = null;
    verified = false;
    identified = [];
    devices = [];
    error = '';
  }
  async function loadBackupFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    backup = '';
    loadedBackupName = '';
    drill = null;
    verified = false;
    identified = [];
    devices = [];
    error = '';
    try {
      backup = await readTransferFile(file);
      loadedBackupName = file.name;
      toast({ title: 'Backup file ready', description: file.name, tone: 'success' });
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not read the backup file.');
      toast({ title: 'Could not read backup', description: error, tone: 'danger' });
    }
  }
  onDestroy(() => {
    pin = '';
    confirmation = '';
    pinPositions = '';
    pinChallenge = '';
  });
  async function recover() {
    if (!drill || !verified || !signersReady || busy || pin !== confirmation) return;
    busy = true;
    error = '';
    try {
      if (isPublicDescriptorBackup())
        await walletService.recoverMultisigBsms(walletName, backup, pin);
      else await walletService.recoverMultisig(backup, pin);
      toast({
        title: 'Wallet recovered',
        description: 'Descriptors were restored. Run a full rescan before relying on the balance.',
        tone: 'success'
      });
      await goto('/multisig');
    } catch (cause) {
      error = localizedError(cause, $locale, 'Recovery failed.');
      toast({ title: 'Recovery failed', description: error, tone: 'danger' });
    } finally {
      pin = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<div class="page narrow-page">
  <header class="page-header">
    <div>
      <h1>{translate($locale, 'Recover multisig wallet')}</h1>
    </div>
    <Button variant="secondary" href="/settings" disabled={busy || hardwareBusy}
      >{translate($locale, 'Cancel')}</Button
    >
  </header>
  <section class="form-card recovery-form">
    <TransferFilePicker
      ariaLabel="Choose recovery backup file"
      accept=".bsms,.json,.txt,application/json,text/plain"
      title={translate($locale, loadedBackupName ? 'Backup file ready' : 'Choose backup file')}
      description={translate(
        $locale,
        loadedBackupName || 'BSMS, descriptor text, or Groot JSON · up to 256 KiB'
      )}
      loaded={Boolean(loadedBackupName)}
      onchange={loadBackupFile}
    />
    <div class="input-alternative" aria-hidden="true">
      <span>{translate($locale, 'Paste instead')}</span>
    </div>
    <label class="field"
      ><span>{translate($locale, 'Descriptor backup')}</span><textarea
        aria-label={translate($locale, 'Recovery descriptor backup')}
        rows="10"
        bind:value={backup}
        oninput={backupChanged}
        placeholder={translate($locale, 'Paste BSMS, public descriptor text, or Groot JSON')}
      ></textarea></label
    ><Button
      variant="secondary"
      class="full"
      disabled={!backup.trim()}
      loading={busy}
      loadingLabel={translate($locale, 'Validating backup…')}
      onclick={inspect}><FileUp size={15} />{translate($locale, 'Validate backup')}</Button
    >
    {#if drill}<div class="drill-result passed">
        <Check size={17} /><span
          ><strong>{translate($locale, 'Backup is valid')}</strong><small
            >{translate(
              $locale,
              'Verify this first receive address against your offline record.'
            )}</small
          ><ReadableAddress
            address={drill.firstAddress}
            oncopy={async () => {
              await copyText(drill!.firstAddress, 'bitcoin-address');
              toast({ title: 'Address copied', tone: 'success' });
            }}
          /></span
        >
      </div>
      {#if recoveredPolicyPaths.length}<section
          class="recovered-policy"
          aria-label={translate($locale, 'Recovered spending policy')}
        >
          <header>
            <div>
              <h2>{translate($locale, 'Recovered spending policy')}</h2>
              <p>
                {translate(
                  $locale,
                  'This backup contains the exact spending paths below. Verify every signer group before restoring.'
                )}
              </p>
            </div>
            {#if recoveredPolicyLabel(drill.policyType)}<span class="policy-pill"
                >{translate($locale, recoveredPolicyLabel(drill.policyType))}</span
              >{/if}
          </header>
          <div class="recovered-paths">
            {#each recoveredPolicyPaths as path (path.index)}<article class="recovered-path">
                <div class="recovered-path-heading">
                  <strong>{translate($locale, path.name)}</strong>
                  <small
                    >{path.availableAfterBlocks === 0
                      ? translate($locale, 'No timelock')
                      : translate($locale, 'After {count} confirmations', {
                          count: path.availableAfterBlocks
                        })}</small
                  >
                </div>
                <div class="recovered-path-groups">
                  {#each path.signerGroups as group (group.code)}<section>
                      <strong>{pathGroupRequirement(group)}</strong>
                      <ul aria-label={translate($locale, group.label)}>
                        {#each group.signers as signer (signer.fingerprint)}<li>
                            <span class="recovered-signer"
                              ><strong>{signer.label}</strong><small
                                >{translate($locale, policySignerRoleLabel(signer.role))}</small
                              ></span
                            ><code>{signer.fingerprint}</code>
                          </li>{/each}
                      </ul>
                    </section>{/each}
                </div>
              </article>{/each}
          </div>
        </section>
        {#if expectedSigners.length}<PolicySignerList signers={expectedSigners} />{/if}
      {:else if drill.threshold && expectedSigners.length}<p>
          {translate($locale, '{threshold} of {total} wallet policy', {
            threshold: drill.threshold,
            total: expectedSigners.length
          })}
        </p>
        <PolicySignerList signers={expectedSigners} />{/if}
      {#if defaultConfig.network === 'mainnet'}<section class="form-card">
          <h2>{translate($locale, 'Identify backup signers')}</h2>
          <p>
            {translate(
              $locale,
              'Select each hardware signer to prove its public account key matches the backup. Groot keeps the saved policy unchanged.'
            )}
          </p>
          <Button variant="secondary" disabled={hardwareBusy} onclick={scanDevices}
            >{translate($locale, 'Scan devices')}</Button
          >
          {#if hardwareBusy}<HardwareActionPrompt
              title={translate($locale, 'Follow your hardware signer')}
              detail={translate($locale, 'Keep the signer connected and review its screen.')}
              label={translate($locale, 'Hardware signer setup in progress')}
            />{:else if devices.length}<HardwareDeviceList
              {devices}
              emptyMessage=""
              onselect={identifyDevice}
              onrescan={scanDevices}
              showRescan
            />{/if}
          <p role="status">
            {translate($locale, '{count} of {total} signers identified', {
              count: identified.length,
              total: expectedSigners.length
            })}
          </p>
          {#if hardwareError}<WarningNotice
              tone="danger"
              icon
              role="alert"
              ariaLive="polite"
              body={hardwareError}
            />{/if}
        </section>{/if}
      <label class="check-row"
        ><input
          aria-label={translate($locale, 'I verified the first receive address')}
          type="checkbox"
          bind:checked={verified}
        /><span
          ><strong>{translate($locale, 'I verified the first receive address')}</strong><small
            >{translate(
              $locale,
              'A mismatch means this is not the wallet you intended to recover.'
            )}</small
          ></span
        ></label
      >{#if isPublicDescriptorBackup()}<label class="field"
          ><span>{translate($locale, 'Wallet name')}</span><input
            aria-label={translate($locale, 'Recovered wallet name')}
            bind:value={walletName}
            maxlength="48"
          /><FieldCounter value={walletName} max={48} /></label
        >
        <p class="field-hint">
          {translate(
            $locale,
            'Public descriptor files do not include private labels. Signers will be named Signer 1,\n          Signer 2, and so on.'
          )}
        </p>{/if}
      <div class="credential-grid">
        <PasswordField
          label={translate($locale, 'New app PIN')}
          inputLabel="New wallet app PIN"
          bind:value={pin}
          autocomplete="new-password"
        /><PasswordField
          label={translate($locale, 'Confirm app PIN')}
          inputLabel="Confirm new wallet app PIN"
          bind:value={confirmation}
          autocomplete="new-password"
        />
      </div>
      {#if pin && confirmation && pin !== confirmation}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={translate($locale, 'PINs do not match.')}
        />{/if}<Button
        class="full"
        disabled={!verified ||
          !signersReady ||
          !walletName.trim() ||
          !pin ||
          pin !== confirmation ||
          hardwareBusy}
        loading={busy}
        loadingLabel={translate($locale, 'Recovering wallet…')}
        onclick={recover}>{translate($locale, 'Recover wallet')}</Button
      >{/if}
    {#if error}<WarningNotice tone="danger" icon role="alert" ariaLive="polite" body={error} />{/if}
  </section>
</div>

<Modal
  open={Boolean(standardDevice)}
  title={translate($locale, 'Use Trezor standard wallet?')}
  description={translate($locale, 'Choose the same standard or hidden wallet used in your backup.')}
  onclose={() => {
    if (!hardwareBusy) standardDevice = null;
  }}
>
  <Button
    disabled={hardwareBusy}
    onclick={() => {
      if (standardDevice) void identifyDevice(standardDevice, true);
    }}>{translate($locale, 'Use standard wallet')}</Button
  >
  <p>{translate($locale, 'For a hidden wallet, select it on the device and scan again.')}</p>
</Modal>
<TrezorPinModal
  open={Boolean(pinDevice)}
  busy={hardwareBusy}
  challengeReady={Boolean(pinChallenge)}
  positions={pinPositions}
  device={pinDevice}
  error={pinError}
  errorCode={pinErrorCode}
  onappend={(position) => (pinPositions += position)}
  ondelete={() => (pinPositions = pinPositions.slice(0, -1))}
  onclear={() => (pinPositions = '')}
  onsubmit={submitPin}
  onretry={() => {
    pinDevice = null;
    pinChallenge = '';
    pinPositions = '';
    pinError = '';
    pinErrorCode = '';
    void scanDevices();
  }}
  onclose={() => {
    pinDevice = null;
    pinChallenge = '';
    pinPositions = '';
  }}
/>

<style>
  .recovery-form {
    display: grid;
    gap: 18px;
  }
  .recovery-form .field {
    margin: 0;
  }

  .input-alternative {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    color: var(--muted);
  }

  .input-alternative::before,
  .input-alternative::after {
    height: 1px;
    background: var(--border);
    content: '';
  }

  .input-alternative span {
    font-size: var(--font-size-meta);
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .recovered-policy {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--surface-inset);
  }

  .recovered-policy > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .recovered-policy h2,
  .recovered-policy p {
    margin: 0;
  }

  .recovered-policy h2 {
    font-size: 15px;
  }

  .recovered-policy p {
    margin-top: 3px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }

  .recovered-policy .policy-pill {
    flex: 0 0 auto;
  }

  .recovered-paths {
    display: grid;
    gap: 8px;
  }

  .recovered-path {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel);
  }

  .recovered-path-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .recovered-path-heading strong,
  .recovered-path-heading small,
  .recovered-path-groups strong,
  .recovered-path-groups li {
    font-size: var(--font-size-meta);
  }

  .recovered-path-heading small,
  .recovered-path-groups code {
    color: var(--muted);
  }

  .recovered-path-groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
    padding: 10px 12px 12px;
  }

  .recovered-path-groups section {
    min-width: 0;
  }

  .recovered-path-groups ul {
    display: grid;
    gap: 3px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }

  .recovered-path-groups li {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .recovered-signer {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .recovered-signer strong,
  .recovered-signer small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recovered-signer strong {
    font-weight: 550;
  }

  .recovered-signer small {
    color: var(--muted);
    font-size: 11px;
  }

  .recovered-path-groups code {
    flex: 0 0 auto;
    font-size: inherit;
  }

  @media (max-width: 540px) {
    .recovered-policy > header,
    .recovered-path-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
