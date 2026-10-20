<script lang="ts">
  import { formatInteger, locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    ChevronRight,
    Clock3,
    Cpu,
    Eye,
    FileKey,
    FlaskConical,
    Plus,
    RotateCcw,
    ShieldCheck,
    Smartphone,
    Usb
  } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import SignerPolicyReview from '$lib/components/SignerPolicyReview.svelte';
  import ColdcardPolicySetup from '$lib/components/ColdcardPolicySetup.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import MultisigDescriptorsModal from '$lib/components/MultisigDescriptorsModal.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import {
    walletService,
    WalletError,
    type CosignerHealthCheck,
    type CoordinationStatus,
    type HardwareDevice,
    type MultisigWallet,
    type PolicyVerificationAddress,
    type SignerPolicyVerification,
    type WalletErrorCode,
    type WalletSnapshot
  } from '$lib/wallet';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import {
    DESKTOP_MANAGED_SIGNER_CONTEXT,
    LOCAL_MOBILE_SIGNER_CONTEXT
  } from '$lib/wallet/contracts/coordination';
  import { defaultConfig, networkName } from '$lib/config';
  import { shortSats } from '$lib/data';
  import Amount from '$lib/components/Amount.svelte';
  import { toast } from '$lib/stores/toasts';
  import { coldcardPolicyFilename } from '$lib/transfer';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import {
    hasMiniscriptPolicy,
    policyMaturitySummary,
    validPolicyMaturity,
    walletPolicyPresentation
  } from '$lib/wallet/policy';
  import {
    matchingPolicyVerification,
    policyReadinessLabel,
    policyRegistrationProfile,
    requiresPolicySetup
  } from '$lib/hardware/policy-readiness';
  import {
    lockedDeviceForHealthCheck,
    matchingDeviceForHealthCheck
  } from '$lib/hardware/health-check';
  import {
    hardwareHealthChecks,
    hardwareHealthKey,
    recordHardwareHealthCheck,
    setHardwareHealthChecks
  } from '$lib/hardware/health-check-state';
  const MATURITY_MATURE = 'mature';
  const MATURITY_APPROACHING = 'approaching';
  const MATURITY_IMMATURE = 'immature';
  const MATURITY_UNCONFIRMED = 'unconfirmed';
  const walletShell = useWalletShellContext();
  let wallet = $state<MultisigWallet | null>(null);
  let walletLoading = $state(true);
  let walletLoadError = $state('');
  let snapshot = $state<WalletSnapshot | null>(null);
  let coordination = $state<CoordinationStatus | null>(null);
  let statusError = $state('');
  let selectedSigner = $state<CosignerDraft | null>(null);
  let showDescriptors = $state(false);
  let showPhoneRecovery = $state(false);
  let phoneRecoveryFrames = $state<string[]>([]);
  let phoneRecoveryBusy = $state(false);
  let phoneRecoveryError = $state('');
  let moreOpen = $state(false);
  let moreRoot = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let checking = $state(false);
  let policyVerifications = $state<SignerPolicyVerification[]>([]);
  let policyAddress = $state<PolicyVerificationAddress | null>(null);
  let policySigner = $state<CosignerDraft | null>(null);
  let policyDevice = $state<HardwareDevice | null>(null);
  let policyBusy = $state(false);
  let policyError = $state('');
  let policyLookupGeneration = 0;
  let healthPinOpen = $state(false);
  let healthPinBusy = $state(false);
  let healthPinChallenge = $state('');
  let healthPinPositions = $state('');
  let healthPinDevice = $state<HardwareDevice | null>(null);
  let healthPinError = $state('');
  let healthPinErrorCode = $state<WalletErrorCode | ''>('');
  let phoneBackupVerified = $state(true);
  let phoneBackupOpen = $state(false);
  let phoneBackupCredential = $state('');
  let phoneBackupError = $state('');
  let phoneBackupBusy = $state(false);
  let phoneBackupNotice = $state('');
  let phoneCheckOpen = $state(false);
  let phoneCheckCredential = $state('');
  let phoneCheckError = $state('');
  let phoneCheckBusy = $state(false);
  const maturitySummary = $derived(
    snapshot ? policyMaturitySummary(snapshot.utxos, snapshot.chainTip) : null
  );
  const policyCoins = $derived(snapshot?.utxos.filter((coin) => validPolicyMaturity(coin)) ?? []);
  const delayedPolicyType = $derived(
    wallet?.policyType === 'inheritance' ? 'inheritance' : 'recovery'
  );
  const policyPresentation = $derived(wallet ? walletPolicyPresentation(wallet) : null);
  const recoveryPolicyLabAvailable = $derived(hasMiniscriptPolicy(wallet));
  onDestroy(() => {
    phoneBackupCredential = '';
    healthPinChallenge = '';
    healthPinPositions = '';
    phoneCheckCredential = '';
  });
  async function verifyPhoneBackup(reveal = false) {
    if (!phoneBackupCredential || phoneBackupBusy) return;
    phoneBackupBusy = true;
    phoneBackupError = '';
    phoneBackupNotice = '';
    try {
      const verified = reveal
        ? await walletService.revealAndVerifyBackup(phoneBackupCredential)
        : await walletService.verifyBackup(phoneBackupCredential);
      phoneBackupVerified = verified;
      phoneBackupNotice = translate(
        $locale,
        verified ? 'Recovery backup verified' : 'Backup still unverified'
      );
      if (verified) phoneBackupOpen = false;
      toast({ title: phoneBackupNotice, tone: verified ? 'success' : 'default' });
    } catch (cause) {
      phoneBackupError = localizedError(cause, $locale, 'Could not verify this recovery backup.');
      toast({ title: 'Backup verification failed', description: phoneBackupError, tone: 'danger' });
    } finally {
      phoneBackupCredential = '';
      phoneBackupBusy = false;
    }
  }
  async function loadPolicyWallet() {
    walletLoading = true;
    walletLoadError = '';
    try {
      wallet = await walletService.multisigWallet();
    } catch (cause) {
      walletLoadError = localizedError(cause, $locale, 'Could not load this wallet policy.');
      return;
    } finally {
      walletLoading = false;
    }
    if (!wallet) return;
    try {
      coordination = await walletService.coordinationStatus();
      if (coordination.role === 'mobile_cosigner') {
        const registry = await walletService.profiles();
        phoneBackupVerified =
          registry.wallets.find((profile) => profile.id === registry.selectedWalletId)
            ?.backupVerified ?? false;
      }
    } catch (cause) {
      toast({
        title: 'Device role unavailable',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
    const [verifications, address, health, walletSnapshot] = await Promise.allSettled([
      walletService.multisigSignerPolicyVerifications(),
      walletService.multisigPolicyVerificationAddress(),
      walletService.hardwareHealthChecks(),
      walletService.multisigSnapshot()
    ]);
    if (verifications.status === 'fulfilled') policyVerifications = verifications.value;
    if (address.status === 'fulfilled') policyAddress = address.value;
    if (health.status === 'fulfilled') setHardwareHealthChecks(health.value);
    if (walletSnapshot.status === 'fulfilled') snapshot = walletSnapshot.value;
    const firstFailure =
      walletSnapshot.status === 'rejected'
        ? { title: 'Wallet is offline', cause: walletSnapshot.reason }
        : verifications.status === 'rejected'
          ? { title: 'Policy status unavailable', cause: verifications.reason }
          : address.status === 'rejected'
            ? { title: 'Policy status unavailable', cause: address.reason }
            : health.status === 'rejected'
              ? { title: 'Health-check status unavailable', cause: health.reason }
              : null;
    if (firstFailure) {
      statusError = localizedError(firstFailure.cause, $locale);
      toast({ title: firstFailure.title, description: statusError, tone: 'danger' });
    }
  }
  onMount(() => {
    void loadPolicyWallet();
  });

  async function openPhoneRecovery() {
    phoneRecoveryBusy = true;
    phoneRecoveryError = '';
    try {
      phoneRecoveryFrames = await walletService.mobileRecoveryRecord();
      showPhoneRecovery = true;
      moreOpen = false;
    } catch (cause) {
      phoneRecoveryError = localizedError(
        cause,
        $locale,
        'Groot could not prepare the replacement-phone QR.'
      );
      toast({
        title: translate($locale, 'Recovery QR unavailable'),
        description: phoneRecoveryError,
        tone: 'danger'
      });
    } finally {
      phoneRecoveryBusy = false;
    }
  }
  onMount(() =>
    walletService.subscribe((event) => {
      if (
        event.type === 'wallet_updated' &&
        event.walletKind === 'multisig' &&
        event.walletId === walletShell.selectedWalletId()
      )
        snapshot = event.snapshot;
    })
  );
  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (moreOpen && moreRoot && event.target instanceof Node && !moreRoot.contains(event.target))
        moreOpen = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !moreOpen) return;
      moreOpen = false;
      requestAnimationFrame(() => moreTrigger?.focus());
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  });
  function policyEvidenceLabel(verification: SignerPolicyVerification) {
    return verification.scope === 'policy_file_acknowledgement'
      ? 'Policy imported'
      : 'Policy verified';
  }
  function signerSourceName(signer: CosignerDraft) {
    return signer.deviceType === 'groot-mobile' ? 'QR connection' : sourceName(signer.source);
  }
  function sourceName(source: CosignerSource) {
    return {
      usb: 'USB hardware',
      qr: 'QR import',
      file: 'File import',
      manual: 'Manual backup',
      virtual: 'Virtual test device'
    }[source];
  }
  function openSigner(signer: CosignerDraft) {
    selectedSigner = signer;
  }
  function signerDeviceContext(signer: CosignerDraft) {
    if (coordination?.role !== 'mobile_cosigner') return null;
    return signer.fingerprint.toLowerCase() === coordination.mobileSignerFingerprint?.toLowerCase()
      ? LOCAL_MOBILE_SIGNER_CONTEXT
      : DESKTOP_MANAGED_SIGNER_CONTEXT;
  }
  function signerAvailabilityLabel(
    signer: CosignerDraft,
    verification: SignerPolicyVerification | null
  ) {
    const context = signerDeviceContext(signer);
    if (context === LOCAL_MOBILE_SIGNER_CONTEXT) return 'Available on this phone';
    if (context === DESKTOP_MANAGED_SIGNER_CONTEXT) return 'Managed on desktop';
    return policyReadinessLabel(signer, verification);
  }
  function signerPolicyStatus(signer: CosignerDraft) {
    const context = signerDeviceContext(signer);
    if (context === LOCAL_MOBILE_SIGNER_CONTEXT)
      return {
        label: translate($locale, 'Available on this phone'),
        description: translate(
          $locale,
          'This phone holds this key. Its fingerprint and public account key match the wallet policy.'
        ),
        attention: false
      };
    if (context === DESKTOP_MANAGED_SIGNER_CONTEXT)
      return {
        label: translate($locale, 'Managed on desktop'),
        description: translate(
          $locale,
          'Identity and device details came from the authenticated desktop wallet policy. Connect and verify this signer on desktop.'
        ),
        attention: false
      };
    const profile = policyRegistrationProfile(signer);
    const verification = matchingPolicyVerification(signer, policyVerifications);
    const label = translate($locale, policyReadinessLabel(signer, verification));
    if (!profile.supported)
      return { label, description: translate($locale, profile.creationCopy), attention: true };
    if (profile.registration === 'none')
      return { label, description: translate($locale, profile.creationCopy), attention: false };
    if (verification) {
      const description =
        profile.registration === 'file_once'
          ? 'Policy import is recorded in Groot. Coldcard keeps this wallet policy on-device.'
          : profile.registration === 'interactive_per_signing'
            ? 'Policy and first address were verified. Ledger will authorize the policy again when signing.'
            : 'Policy and first address were verified for this wallet.';
      return {
        label,
        description: translate($locale, description),
        attention: false,
        verifiedAt: verification.verifiedAt,
        acknowledgement: verification.scope === 'policy_file_acknowledgement',
        actionLabel: profile.registration === 'file_once' ? 'Review setup' : 'Verify again'
      };
    }
    return {
      label,
      description:
        profile.registration === 'file_once'
          ? 'Groot has no saved acknowledgement yet. Record the existing Coldcard policy import or review the setup steps.'
          : translate($locale, profile.creationCopy),
      attention: true,
      actionLabel: profile.registration === 'file_once' ? 'Review setup' : 'Verify policy'
    };
  }
  function latestHealth(signer: CosignerDraft) {
    return $hardwareHealthChecks[hardwareHealthKey(signer.fingerprint)] ?? null;
  }
  async function saveHardwareHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
    recordHardwareHealthCheck(fingerprint, check);
  }
  async function renameSavedSigner(label: string) {
    if (!selectedSigner) return;
    const signerId = selectedSigner.id;
    wallet = await walletService.renameMultisigSigner(signerId, label);
    selectedSigner = wallet.cosigners.find((signer) => signer.id === signerId) ?? null;
    toast({
      title: 'Signer renamed',
      description: translate($locale, 'This signer is now “{label}”.', { label }),
      tone: 'success'
    });
  }
  async function runHealthCheck(unlockedDevice?: HardwareDevice) {
    if (!selectedSigner || checking) return;
    const signer = selectedSigner;
    checking = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = unlockedDevice ?? (await walletService.findSavedHardwareDevice(signer));
      const result = await walletService.checkHardwareCosigner(signer, device.id);
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({
        title: 'Signer verified',
        description: translate($locale, '{signerName} matches this wallet.', {
          signerName: signer.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      const summary = localizedError(cause, $locale, 'The device could not be verified.');
      await saveHardwareHealthCheck(signer.fingerprint, {
        checkedAt: new Date().toISOString(),
        summary,
        status: 'attention'
      });
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checking = false;
    }
  }
  function openPhoneHealthCheck() {
    phoneCheckCredential = '';
    phoneCheckError = '';
    phoneCheckOpen = true;
  }
  async function runPhoneHealthCheck() {
    if (!selectedSigner || !phoneCheckCredential || phoneCheckBusy) return;
    const signer = selectedSigner;
    phoneCheckBusy = true;
    phoneCheckError = '';
    try {
      const result = await walletService.checkMobileSigner(phoneCheckCredential);
      await saveHardwareHealthCheck(signer.fingerprint, result);
      phoneCheckCredential = '';
      phoneCheckOpen = false;
      toast({
        title: translate($locale, 'Phone key verified'),
        description: translate(
          $locale,
          'The encrypted key on this phone matches the wallet policy.'
        ),
        tone: 'success'
      });
    } catch (cause) {
      phoneCheckError = localizedError(cause, $locale, 'The phone key could not be verified.');
      phoneCheckCredential = '';
    } finally {
      phoneCheckBusy = false;
    }
  }
  async function startHealthPin(device: HardwareDevice) {
    const retrying = healthPinOpen;
    healthPinBusy = true;
    healthPinError = '';
    healthPinErrorCode = '';
    healthPinPositions = '';
    healthPinChallenge = '';
    try {
      const prompt = await walletService.promptHardwarePin(device.id);
      if (!prompt.pinRequired) {
        healthPinDevice = null;
        healthPinOpen = false;
        await runHealthCheck(device);
        return;
      }
      healthPinChallenge = prompt.challengeId ?? '';
      healthPinDevice = device;
      healthPinOpen = true;
    } catch (cause) {
      healthPinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      healthPinError = localizedError(cause, $locale, 'Could not start the Trezor PIN matrix.');
      if (!retrying)
        toast({ title: 'Trezor unlock unavailable', description: healthPinError, tone: 'danger' });
    } finally {
      healthPinBusy = false;
    }
  }
  async function submitHealthPin() {
    if (!healthPinChallenge || !healthPinPositions || healthPinBusy) return;
    healthPinBusy = true;
    healthPinError = '';
    healthPinErrorCode = '';
    const positions = healthPinPositions;
    const unlockedDevice = healthPinDevice;
    healthPinPositions = '';
    try {
      await walletService.sendHardwarePin(healthPinChallenge, positions);
      healthPinChallenge = '';
      healthPinOpen = false;
      healthPinDevice = null;
      toast({
        title: 'Trezor unlocked',
        description: 'Resuming the signer health check.',
        tone: 'success'
      });
      if (unlockedDevice) await runHealthCheck(unlockedDevice);
      else await runHealthCheck();
    } catch (cause) {
      healthPinChallenge = '';
      healthPinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      healthPinError = localizedError(cause, $locale, 'Trezor did not accept that matrix entry.');
    } finally {
      healthPinBusy = false;
    }
  }
  function closeHealthPin() {
    healthPinOpen = false;
    healthPinBusy = false;
    healthPinChallenge = '';
    healthPinPositions = '';
    healthPinDevice = null;
    healthPinError = '';
    healthPinErrorCode = '';
  }
  async function openPolicyVerification(signer: CosignerDraft) {
    const generation = ++policyLookupGeneration;
    policySigner = signer;
    selectedSigner = null;
    policyDevice = null;
    policyError = '';
    policyBusy = true;
    if (policyRegistrationProfile(signer).registration === 'file_once') {
      policyBusy = false;
      return;
    }
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      if (generation !== policyLookupGeneration) return;
      policyDevice = device;
    } catch (cause) {
      if (generation !== policyLookupGeneration) return;
      policyError = localizedError(cause, $locale, 'Could not scan hardware devices.');
    } finally {
      if (generation === policyLookupGeneration) policyBusy = false;
    }
  }

  function closePolicyVerification() {
    if (policyBusy && policyDevice) return;
    policyLookupGeneration += 1;
    policySigner = null;
    policyDevice = null;
    policyBusy = false;
    policyError = '';
  }
  async function verifySignerPolicy() {
    if (!policySigner || !policyDevice || policyBusy) return;
    const signerLabel = policySigner.label;
    policyBusy = true;
    policyError = '';
    try {
      const verification = await walletService.verifyMultisigSignerPolicy(
        policyDevice.id,
        policySigner.fingerprint
      );
      policyVerifications = [
        verification,
        ...policyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      policySigner = null;
      policyDevice = null;
      toast({
        title: 'Wallet policy verified',
        description: translate(
          $locale,
          '{signerName} registered the policy and verified its first address.',
          { signerName: signerLabel }
        ),
        tone: 'success'
      });
    } catch (cause) {
      policyError = localizedError(cause, $locale, 'The wallet policy could not be verified.');
    } finally {
      policyBusy = false;
    }
  }
  async function saveColdcardPolicy() {
    if (!wallet || policyBusy) return;
    policyBusy = true;
    policyError = '';
    try {
      const saved = await walletService.savePublicBackup(
        coldcardPolicyFilename(wallet.name),
        `# Groot multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${wallet.externalDescriptor}\n`
      );
      if (saved.saved)
        toast({
          title: 'Coldcard policy saved',
          description: 'Import it on the Coldcard and verify the policy details.',
          tone: 'success',
          action:
            saved.revealToken && saved.revealLabel
              ? {
                  label: saved.revealLabel,
                  run: () => walletService.revealSavedFile(saved.revealToken!)
                }
              : undefined
        });
    } catch (cause) {
      policyError = localizedError(cause, $locale, 'Could not save the Coldcard policy.');
    } finally {
      policyBusy = false;
    }
  }
  async function confirmColdcardPolicy() {
    if (!policySigner || policyBusy) return;
    policyBusy = true;
    policyError = '';
    try {
      const verification = await walletService.acknowledgeColdcardPolicy(policySigner.fingerprint);
      policyVerifications = [
        verification,
        ...policyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      toast({
        title: 'Coldcard policy recorded',
        description: 'This signer is ready for transaction review.',
        tone: 'success'
      });
      policySigner = null;
    } catch (cause) {
      policyError = localizedError(cause, $locale, 'Could not record the Coldcard policy check.');
    } finally {
      policyBusy = false;
    }
  }
</script>

<div class="page coordinator-page">
  {#if wallet}
    <header class="page-header">
      <div>
        <h1>{wallet.name}</h1>
        <p class="subtitle">
          {translate(
            $locale,
            coordination?.role === 'mobile_cosigner'
              ? 'Phone signer · QR connection'
              : coordination?.role === 'desktop_coordinator'
                ? 'Desktop coordinator'
                : 'Watch-only wallet'
          )}
        </p>
      </div>
    </header>
    {#if statusError}<WarningNotice
        role="status"
        title={translate($locale, 'Wallet data is unavailable')}
        body={statusError}
      >
        <a href="/settings">{translate($locale, 'Open network settings')}</a>
      </WarningNotice>{/if}
    {#if coordination?.role === 'mobile_cosigner' && !phoneBackupVerified}
      <WarningNotice
        title={translate($locale, 'Recovery backup not verified')}
        class="compact-action"
      >
        <Button
          size="small"
          variant="secondary"
          onclick={() => {
            phoneBackupError = '';
            phoneBackupNotice = '';
            phoneBackupOpen = true;
          }}>{translate($locale, 'Verify now')}</Button
        >
      </WarningNotice>
    {/if}
    {#if phoneBackupNotice}<p role="status">{phoneBackupNotice}</p>{/if}
    <section class="vault-hero">
      <span><ShieldCheck size={22} /></span>
      <div class="vault-summary">
        <strong class="vault-balance"><Amount value={snapshot?.balance.total ?? 0} /></strong>
        <div class="vault-policy-tags" aria-label={translate($locale, 'Spending policy')}>
          {#if policyPresentation?.delayed && policyPresentation.delayedKeyLabel}
            <span class="policy-pill"
              >{translate($locale, '{required} of {total} primary keys', {
                required: policyPresentation.primaryThreshold,
                total: policyPresentation.primarySignerCount
              })}</span
            >
            <span class="policy-pill delayed"
              ><Clock3 size={12} />{translate(
                $locale,
                delayedPolicyType === 'inheritance'
                  ? 'Heir key after wait'
                  : 'Recovery key after wait'
              )}</span
            >
          {:else if policyPresentation?.delayed}
            <span class="policy-pill">{translate($locale, 'Policy details unavailable')}</span>
          {:else if policyPresentation}
            <span class="policy-pill"
              >{translate($locale, '{required} of {total} keys', {
                required: policyPresentation.primaryThreshold,
                total: policyPresentation.primarySignerCount
              })}</span
            >
          {/if}
        </div>
        <p>
          {translate($locale, 'Native SegWit ·')}
          {networkName(snapshot?.network ?? defaultConfig.network)}
        </p>
      </div>
      <div class="vault-actions">
        <div class="wallet-more" bind:this={moreRoot}>
          <OverflowMenuButton
            bind:element={moreTrigger}
            label={translate($locale, 'More wallet actions')}
            expanded={moreOpen}
            onclick={() => (moreOpen = !moreOpen)}
          />{#if moreOpen}<div class="wallet-more-menu" role="menu">
              <button
                role="menuitem"
                onclick={() => {
                  moreOpen = false;
                  showDescriptors = true;
                }}
                ><Eye size={15} /><span
                  ><strong>{translate($locale, 'Show descriptors')}</strong><small
                    >{translate($locale, 'Inspect receive and change logic')}</small
                  ></span
                ></button
              ><a role="menuitem" href="/multisig/backup"
                ><FileKey size={15} /><span
                  ><strong>{translate($locale, 'Export & verify')}</strong><small
                    >{translate($locale, 'Save a public wallet backup')}</small
                  ></span
                ></a
              >{#if coordination?.role === 'desktop_coordinator'}<button
                  role="menuitem"
                  disabled={phoneRecoveryBusy}
                  onclick={openPhoneRecovery}
                  ><RotateCcw size={15} /><span
                    ><strong>{translate($locale, 'Restore Groot phone')}</strong><small
                      >{translate($locale, 'Rebuild the phone signer from its 24 words')}</small
                    ></span
                  ></button
                >{/if}{#if recoveryPolicyLabAvailable}<a role="menuitem" href="/multisig/policy"
                  ><FlaskConical size={15} /><span
                    ><strong>{translate($locale, 'Recovery policy lab')}</strong><small
                      >{translate($locale, 'Explore guided Miniscript paths')}</small
                    ></span
                  ></a
                >{/if}
            </div>{/if}
        </div>
        <Button variant="secondary" href="/multisig/receive">{translate($locale, 'Receive')}</Button
        >{#if coordination?.canSignOnThisDevice}<Button href="/mobile/sign"
            ><Smartphone size={16} />{translate($locale, 'Sign desktop PSBT')}</Button
          >{:else}<Button href="/multisig/send">{translate($locale, 'Send')}</Button>{/if}
      </div>
    </section>
    {#if maturitySummary}
      <section class="policy-maturity-panel" aria-live="polite">
        <div class="policy-maturity-panel-heading">
          <span><Clock3 size={19} /></span>
          <div>
            <h2>
              {translate(
                $locale,
                delayedPolicyType === 'inheritance' ? 'Heir access' : 'Recovery access'
              )}<InsightTip
                label={translate($locale, 'About backup-key access')}
                text={translate(
                  $locale,
                  'Each coin starts its own wait after confirmation, so backup-key access can become available at different times.'
                )}
              />
            </h2>
            <p>
              {#if !maturitySummary.chainCurrent}
                {translate($locale, 'Recovery status is paused until the chain is current.')}
              {:else if maturitySummary.mature === 1}
                {translate($locale, 'No action is required. {key} is available for 1 coin.', {
                  key: translate(
                    $locale,
                    delayedPolicyType === 'inheritance' ? 'Heir key' : 'Recovery key'
                  )
                })}
              {:else if maturitySummary.mature > 1}
                {translate(
                  $locale,
                  'No action is required. {key} is available for {count} coins.',
                  {
                    key: translate(
                      $locale,
                      delayedPolicyType === 'inheritance' ? 'Heir key' : 'Recovery key'
                    ),
                    count: formatInteger(maturitySummary.mature, $locale)
                  }
                )}
              {:else if maturitySummary.approaching === 1}
                {translate(
                  $locale,
                  'No action is required. {key} will be available for 1 coin soon.',
                  {
                    key: translate(
                      $locale,
                      delayedPolicyType === 'inheritance' ? 'Heir key' : 'Recovery key'
                    )
                  }
                )}
              {:else}
                {translate(
                  $locale,
                  'No action is required. The backup key is still waiting for every coin.'
                )}
              {/if}
            </p>
          </div>
          <Button variant="secondary" size="small" href="/coins"
            >{translate($locale, 'Review coins')}</Button
          >
        </div>
        <div class="policy-maturity-facts">
          <div class="info-banner">
            <ShieldCheck size={16} />
            <p>
              {translate(
                $locale,
                maturitySummary.total === 1
                  ? 'Normal keys still work for 1 coin.'
                  : 'Normal keys still work for all {count} coins.',
                { count: formatInteger(maturitySummary.total, $locale) }
              )}
            </p>
          </div>
          {#if maturitySummary.chainCurrent && maturitySummary.nextRemainingBlocks !== null}<div
              class="info-banner"
            >
              <Clock3 size={16} />
              <p>
                {translate($locale, 'Next change in {count} blocks.', {
                  count: formatInteger(maturitySummary.nextRemainingBlocks, $locale)
                })}
              </p>
            </div>{/if}
        </div>
        <details class="policy-maturity-details">
          <summary>{translate($locale, 'How backup-key access works')}</summary>
          <p>
            {translate(
              $locale,
              'After its wait, the backup key can spend that coin alone. The coin does not expire, and your normal keys still work.'
            )}
          </p>
          {#if maturitySummary.mature > 0}<p>
              {translate(
                $locale,
                'Open an available coin to use the backup key or restart its wait.'
              )}
            </p>{/if}
          <div class="policy-access-coins">
            <h3>{translate($locale, 'Coin timelines')}</h3>
            <div>
              {#each policyCoins as coin (coin.outpoint)}{@const maturity =
                  validPolicyMaturity(coin)}
                {#if maturity}<article>
                    <span>
                      {#if coin.label}<PermanentLabelTags
                          labels={[coin.label]}
                          prominent
                        />{:else}<strong>{translate($locale, 'Coin')}</strong>{/if}
                      <small
                        class="coin-status"
                        class:policy-mature={maturity.state === MATURITY_MATURE}
                        class:policy-approaching={maturity.state === MATURITY_APPROACHING}
                        class:policy-immature={maturity.state === MATURITY_IMMATURE}
                        class:pending={maturity.state === MATURITY_UNCONFIRMED}
                        >{maturity.state === MATURITY_MATURE
                          ? translate($locale, 'Backup key available')
                          : maturity.state === MATURITY_APPROACHING &&
                              maturity.remainingBlocks !== null
                            ? translate($locale, 'Available in {count} blocks', {
                                count: formatInteger(maturity.remainingBlocks, $locale)
                              })
                            : maturity.state === MATURITY_IMMATURE &&
                                maturity.remainingBlocks !== null
                              ? translate($locale, 'Waiting · {count} blocks', {
                                  count: formatInteger(maturity.remainingBlocks, $locale)
                                })
                              : translate($locale, 'Wait starts after confirmation')}</small
                      >
                    </span>
                    <Amount value={coin.amount} />
                  </article>{/if}
              {/each}
            </div>
          </div>
        </details>
      </section>
    {/if}
    <div class="vault-grid">
      <section class="vault-cosigners">
        <div class="section-heading compact">
          <div>
            <h2>{translate($locale, 'Signing keys')}</h2>
            <p>
              {translate(
                $locale,
                policyPresentation?.delayed
                  ? 'Payments normally use 2 of 3 primary keys. The separate backup key becomes available per coin after its wait.'
                  : translate($locale, 'Any {count} keys can sign.', { count: wallet.threshold })
              )}
            </p>
          </div>
        </div>
        <div class="saved-cosigner-list">
          {#each wallet.cosigners as signer, i}{@const verification = matchingPolicyVerification(
              signer,
              policyVerifications
            )}
            <article>
              <button
                aria-label={translate($locale, 'View {signer} details', { signer: signer.label })}
                onclick={() => openSigner(signer)}
                ><span class="device-number">{i + 1}</span><span class="saved-cosigner-copy"
                  ><strong>{signer.label}</strong><span
                    ><code>{signer.fingerprint.toLowerCase()}</code><i></i>{translate(
                      $locale,
                      signerSourceName(signer)
                    )}{#if latestHealth(signer)}<i></i>{translate($locale, 'Checked')}
                      <LocalTimestamp
                        value={latestHealth(signer)!.checkedAt}
                      />{:else if verification}<i></i>{translate(
                        $locale,
                        policyEvidenceLabel(verification)
                      )}
                      <LocalTimestamp value={verification.verifiedAt} />{/if}</span
                  ></span
                ><span
                  class="ready-badge"
                  class:attention={!signerDeviceContext(signer) &&
                    ((requiresPolicySetup(signer) && !verification) ||
                      !policyRegistrationProfile(signer).supported)}
                  >{translate($locale, signerAvailabilityLabel(signer, verification))}</span
                ><ChevronRight class="row-chevron" size={16} /></button
              >
            </article>{/each}
        </div>
      </section>
      <aside class="vault-backup-card">
        <span class="vault-backup-icon"><FileKey size={20} /></span>
        <div>
          <h2>{translate($locale, 'Backups & recovery')}</h2>
          <p>
            {translate($locale, 'Back up the policy and verify its first address.')}
          </p>
        </div>
        <Button variant="secondary" class="full" href="/multisig/backup"
          >{translate($locale, 'Export & verify')}</Button
        >{#if coordination?.role === 'desktop_coordinator'}<Button
            variant="secondary"
            class="full"
            loading={phoneRecoveryBusy}
            onclick={openPhoneRecovery}
            ><RotateCcw size={16} />{translate($locale, 'Restore Groot phone')}</Button
          >{/if}{#if recoveryPolicyLabAvailable}<Button
            variant="ghost"
            class="full"
            href="/multisig/policy">{translate($locale, 'Recovery policy lab')}</Button
          >{/if}
      </aside>
    </div>
  {:else if walletLoading}
    <section
      class="policy-loading-skeleton"
      aria-label={translate($locale, 'Loading wallet policy')}
      role="status"
    >
      <div class="wallet-skeleton balance" aria-hidden="true">
        <span class="skeleton-line label"></span>
        <span class="skeleton-line amount"></span>
        <span class="skeleton-line pending"></span>
      </div>
      <div class="wallet-skeleton transactions" aria-hidden="true">
        {#each [1, 2, 3] as row (row)}<div class="skeleton-row">
            <span class="skeleton-block icon"></span>
            <span class="skeleton-copy"
              ><span class="skeleton-line primary"></span><span class="skeleton-line secondary"
              ></span></span
            >
          </div>{/each}
      </div>
    </section>
  {:else if walletLoadError}
    <section class="empty-state vault-empty" role="alert">
      <h2>{translate($locale, 'Wallet policy unavailable')}</h2>
      <p>{walletLoadError}</p>
      <Button variant="secondary" onclick={loadPolicyWallet}
        >{translate($locale, 'Try again')}</Button
      >
    </section>
  {:else}
    <section class="empty-state vault-empty">
      <span class="empty-icon"><Usb size={24} /></span>
      <h2>{translate($locale, 'Single-key policy')}</h2>
      <p>
        {translate(
          $locale,
          'This wallet is controlled by one signing key. Add another wallet to use a shared or recovery\n        policy.'
        )}
      </p>
      <Button href="/welcome?add=1"
        ><Plus size={16} />{translate($locale, 'Add another wallet')}</Button
      >
    </section>
  {/if}
</div>

<DeviceDetailsModal
  signer={healthPinOpen || phoneCheckOpen ? null : selectedSigner}
  health={selectedSigner ? latestHealth(selectedSigner) : null}
  policyStatus={selectedSigner ? signerPolicyStatus(selectedSigner) : null}
  deviceContext={selectedSigner ? signerDeviceContext(selectedSigner) : null}
  {checking}
  onclose={() => (selectedSigner = null)}
  oncheck={selectedSigner && signerDeviceContext(selectedSigner) === LOCAL_MOBILE_SIGNER_CONTEXT
    ? openPhoneHealthCheck
    : selectedSigner?.deviceType &&
        selectedSigner.deviceType !== 'groot-mobile' &&
        coordination?.role !== 'mobile_cosigner'
      ? runHealthCheck
      : undefined}
  onpolicy={selectedSigner && !signerDeviceContext(selectedSigner)
    ? () => selectedSigner && openPolicyVerification(selectedSigner)
    : undefined}
  onrename={selectedSigner && !signerDeviceContext(selectedSigner) ? renameSavedSigner : undefined}
/>
<Modal
  open={phoneCheckOpen}
  title={translate($locale, 'Check phone key')}
  description={translate(
    $locale,
    'Enter the app PIN to decrypt this phone key and prove it matches the wallet policy.'
  )}
  onclose={() => {
    if (phoneCheckBusy) return;
    phoneCheckOpen = false;
    phoneCheckCredential = '';
    phoneCheckError = '';
  }}
>
  <PasswordField
    label={translate($locale, 'App PIN')}
    bind:value={phoneCheckCredential}
    autocomplete="current-password"
    error={phoneCheckError}
    oninput={() => (phoneCheckError = '')}
  />
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        phoneCheckOpen = false;
        phoneCheckCredential = '';
        phoneCheckError = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!phoneCheckCredential}
      loading={phoneCheckBusy}
      loadingLabel={translate($locale, 'Checking…')}
      onclick={runPhoneHealthCheck}>{translate($locale, 'Check phone key')}</Button
    >
  </div>
</Modal>
<Modal
  open={phoneBackupOpen}
  title={translate($locale, 'Verify phone recovery backup')}
  onclose={() => {
    if (!phoneBackupBusy) {
      phoneBackupOpen = false;
      phoneBackupCredential = '';
      phoneBackupError = '';
    }
  }}
>
  <PasswordField
    label={translate($locale, 'App PIN')}
    bind:value={phoneBackupCredential}
    autocomplete="current-password"
    error={phoneBackupError}
  />
  {#if phoneBackupNotice}<p role="status">{phoneBackupNotice}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={phoneBackupBusy}
      onclick={() => {
        phoneBackupOpen = false;
        phoneBackupCredential = '';
      }}>{translate($locale, 'Verify later')}</Button
    >
    <Button
      variant="secondary"
      disabled={!phoneBackupCredential || phoneBackupBusy}
      onclick={() => verifyPhoneBackup(true)}>{translate($locale, 'Show recovery words')}</Button
    >
    <Button
      disabled={!phoneBackupCredential}
      loading={phoneBackupBusy}
      onclick={() => verifyPhoneBackup()}>{translate($locale, 'Verify now')}</Button
    >
  </div>
</Modal>
<TrezorPinModal
  open={healthPinOpen}
  busy={healthPinBusy}
  challengeReady={Boolean(healthPinChallenge)}
  positions={healthPinPositions}
  device={healthPinDevice}
  errorCode={healthPinErrorCode}
  error={healthPinError}
  onappend={(position) => (healthPinPositions += position)}
  ondelete={() => (healthPinPositions = healthPinPositions.slice(0, -1))}
  onclear={() => (healthPinPositions = '')}
  onsubmit={submitHealthPin}
  onretry={() => healthPinDevice && startHealthPin(healthPinDevice)}
  onclose={closeHealthPin}
/>
<MultisigDescriptorsModal
  open={showDescriptors}
  {wallet}
  onclose={() => (showDescriptors = false)}
/>
<Modal
  open={showPhoneRecovery}
  title={translate($locale, 'Restore a Groot phone')}
  description={translate(
    $locale,
    'Scan this public wallet record on the replacement phone, then enter the original 24 words there.'
  )}
  onclose={() => {
    showPhoneRecovery = false;
    phoneRecoveryFrames = [];
    phoneRecoveryError = '';
  }}
>
  <div class="phone-recovery-qr">
    <AnimatedUrQr
      frames={phoneRecoveryFrames}
      label={translate($locale, 'Replacement phone wallet record')}
      expandable
    />
    <div class="phone-recovery-note">
      <ShieldCheck size={18} />
      <p>
        <strong>{translate($locale, 'Words stay on the phone')}</strong>
        <span
          >{translate(
            $locale,
            'This QR cannot spend, but it reveals wallet addresses. The phone accepts it only when the words reproduce the exact signer and policy.'
          )}</span
        >
      </p>
    </div>
    {#if phoneRecoveryError}<p class="inline-error" role="alert">{phoneRecoveryError}</p>{/if}
  </div>
</Modal>
<Modal
  open={!!policySigner}
  title={translate(
    $locale,
    policySigner && policyRegistrationProfile(policySigner).registration === 'file_once'
      ? 'Prepare Coldcard for this wallet'
      : 'Verify wallet policy'
  )}
  description={translate(
    $locale,
    policySigner && policyRegistrationProfile(policySigner).registration === 'file_once'
      ? 'Complete the one-time policy-file import before signing.'
      : 'Check the policy, signer keys, and first address.'
  )}
  onclose={closePolicyVerification}
>
  {#if policySigner && wallet && policyRegistrationProfile(policySigner).registration === 'file_once'}<ColdcardPolicySetup
      {wallet}
      signer={policySigner}
      busy={policyBusy}
      error={policyError}
      completionLabel="Complete policy registration"
      ondownload={saveColdcardPolicy}
      onconfirm={confirmColdcardPolicy}
    />
  {:else if policyBusy && !policyDevice}<HardwareActionPrompt
      title={translate($locale, 'Looking for the saved signer')}
      detail={translate(
        $locale,
        'Keep the saved signer connected and unlocked while Groot checks its account key.'
      )}
      label={translate($locale, 'Signer scan in progress')}
    />
  {:else if policySigner && wallet && policyDevice && policyAddress}<SignerPolicyReview
      {wallet}
      signer={policySigner}
      {policyAddress}
      verification={matchingPolicyVerification(policySigner, policyVerifications)}
      busy={policyBusy}
      error={policyError}
      onverify={verifySignerPolicy}
    />
  {:else if policySigner && policyDevice}<div class="device-scan">
      <Cpu size={20} /><strong>{translate($locale, 'Policy reference unavailable')}</strong><span
        >{translate(
          $locale,
          'Groot found the signer, but could not load this wallet’s first address. Check the wallet connection and try again.'
        )}</span
      >
    </div>
  {:else if policySigner}<div class="device-scan">
      <Cpu size={20} /><strong>{translate($locale, 'Saved signer not found')}</strong><span
        >{translate(
          $locale,
          policyError || `Connect and unlock ${policySigner.label}, then scan again.`
        )}</span
      ><Button variant="secondary" onclick={() => openPolicyVerification(policySigner!)}
        >{translate($locale, 'Scan again')}</Button
      >
    </div>{/if}
</Modal>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.policy-loading-skeleton):where(.policy-loading-skeleton) {
    display: grid;
    gap: 16px;
  }
  :global(.info-banner):where(.info-banner) {
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-control);
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    padding: 11px 13px;
  }
  :global(.info-banner):where(.info-banner) :global(p) {
    font-size: var(--font-size-meta);
    margin: 0;
  }
  :global(.vault-hero):where(.vault-hero) {
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-panel);
    padding: 22px;
    display: grid;
    grid-template-columns: 45px minmax(0, 1fr) auto;
    align-items: center;
    gap: 15px;
    margin-bottom: 30px;
    overflow: hidden;
  }
  :global(.vault-hero):where(.vault-hero) > :global(span) {
    width: 43px;
    height: 43px;
    border-radius: var(--radius-inset);
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
  }
  :global(.vault-summary):where(.vault-summary) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  :global(.vault-policy-tags):where(.vault-policy-tags) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 9px;
  }
  :global(.vault-policy-tags):where(.vault-policy-tags) :global(.policy-pill) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    font-size: var(--font-size-meta);
  }
  :global(.vault-policy-tags):where(.vault-policy-tags) :global(.policy-pill.delayed) {
    color: var(--focus);
    border-color: color-mix(in srgb, var(--focus) 25%, var(--border));
    background: color-mix(in srgb, var(--focus) 7%, var(--panel));
  }
  :global(.vault-policy-tags):where(.vault-policy-tags) :global(svg) {
    flex: 0 0 auto;
  }
  :global(.vault-hero):where(.vault-hero) :global(small),
  :global(.vault-hero):where(.vault-hero) :global(p) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    margin: 0;
  }
  :global(.vault-balance):where(.vault-balance) {
    display: block;
    color: var(--text);
    font-size: 21px;
    line-height: 1.1;
  }

  :global(.policy-maturity-panel):where(.policy-maturity-panel) {
    display: grid;
    gap: 12px;
    margin-bottom: 24px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--panel);
  }

  :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
  }

  :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading)
    > :global(span:first-child) {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--focus);
    background: var(--surface-icon);
  }

  :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading) :global(h2),
  :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading) :global(p) {
    margin: 0;
  }

  :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading)
    :global(p:not(.eyebrow)) {
    margin-top: 2px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }

  :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading) :global(h2) {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    font-weight: 650;
  }

  :global(.policy-maturity-facts):where(.policy-maturity-facts) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
  }

  :global(.policy-maturity-facts):where(.policy-maturity-facts) :global(.info-banner) {
    min-height: 40px;
    padding: 9px 11px;
    background: var(--surface-inset);
  }

  :global(.policy-maturity-facts):where(.policy-maturity-facts) :global(svg) {
    flex: 0 0 auto;
    color: var(--focus);
  }

  :global(.policy-maturity-details):where(.policy-maturity-details) {
    padding: 0 2px;
  }

  :global(.policy-maturity-details):where(.policy-maturity-details) :global(summary) {
    cursor: pointer;
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 600;
  }

  :global(.policy-maturity-details):where(.policy-maturity-details) :global(p) {
    max-width: 720px;
    margin: 8px 0 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }

  :global(.policy-access-coins):where(.policy-access-coins) {
    margin-top: 14px;
  }

  :global(.policy-access-coins):where(.policy-access-coins) :global(h3) {
    margin: 0 0 7px;
    color: var(--text);
    font-size: var(--font-size-meta);
  }

  :global(.policy-access-coins):where(.policy-access-coins) > :global(div) {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }

  :global(.policy-access-coins):where(.policy-access-coins) :global(article) {
    min-height: 48px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-inset);
  }

  :global(.policy-access-coins):where(.policy-access-coins) :global(article:last-child) {
    border-bottom: 0;
  }

  :global(.policy-access-coins):where(.policy-access-coins) :global(article > span) {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  :global(.policy-access-coins):where(.policy-access-coins) :global(article strong),
  :global(.policy-access-coins):where(.policy-access-coins) :global(article .formatted-amount) {
    font-size: var(--font-size-meta);
  }
  :global(.vault-actions):where(.vault-actions) {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  :global(.vault-empty):where(.vault-empty) {
    margin-top: 80px;
  }
  :global(.vault-grid):where(.vault-grid) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    align-items: start;
    gap: 20px;
  }
  :global(.vault-cosigners):where(.vault-cosigners),
  :global(.vault-backup-card):where(.vault-backup-card) {
    min-width: 0;
  }
  :global(.vault-cosigners):where(.vault-cosigners) :global(.section-heading.compact) {
    margin: 10px 0 14px;
  }
  :global(.saved-cosigner-list):where(.saved-cosigner-list) {
    display: grid;
    gap: 8px;
  }
  :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(article) {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--panel);
  }
  :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(button) {
    width: 100%;
    min-height: 76px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 12px;
    padding: 13px 14px;
    border: 0;
    color: var(--text);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(button:hover) {
    background: var(--surface-hover);
    box-shadow: inset 3px 0 0 var(--fr-blue);
  }
  :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(button:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  :global(.saved-cosigner-copy):where(.saved-cosigner-copy) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  :global(.saved-cosigner-copy):where(.saved-cosigner-copy) :global(strong) {
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.saved-cosigner-copy):where(.saved-cosigner-copy) > :global(span) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.saved-cosigner-copy):where(.saved-cosigner-copy) :global(code) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.saved-cosigner-copy):where(.saved-cosigner-copy) :global(i) {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--muted-2);
  }
  :global(.vault-backup-card):where(.vault-backup-card) {
    display: grid;
    gap: 12px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--surface-control);
  }
  :global(.vault-backup-icon):where(.vault-backup-icon) {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-inset);
    color: var(--accent);
    background: var(--accent-soft);
  }
  :global(.vault-backup-card):where(.vault-backup-card) :global(h2) {
    margin: 0;
    font-size: 14px;
  }
  :global(.vault-backup-card):where(.vault-backup-card) :global(p) {
    margin: 6px 0 2px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.55;
  }
  :global(.vault-backup-card):where(.vault-backup-card) :global(.button) {
    min-width: 0;
    max-width: 100%;
  }

  @media (max-width: 700px) {
    :global(.policy-maturity-panel):where(.policy-maturity-panel) {
      padding: 16px;
    }

    :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading) {
      grid-template-columns: auto minmax(0, 1fr);
    }

    :global(.policy-maturity-panel-heading):where(.policy-maturity-panel-heading)
      > :global(.button) {
      grid-column: 2;
      justify-self: start;
    }
  }

  @media (max-width: 760px) {
    :global(.vault-grid):where(.vault-grid) {
      grid-template-columns: 1fr;
    }
    :global(.vault-hero):where(.vault-hero) {
      grid-template-columns: 42px minmax(0, 1fr);
    }
    :global(.vault-actions):where(.vault-actions) {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: auto 1fr 1fr;
    }
    :global(.vault-backup-card):where(.vault-backup-card) {
      order: -1;
    }
    :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(button) {
      grid-template-columns: 32px minmax(0, 1fr) auto;
    }
    :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(.row-chevron) {
      display: none;
    }
    :global(.vault-actions):where(.vault-actions) :global(.wallet-more-menu) {
      right: 18px;
      left: 18px;
      width: auto;
    }
  }

  @media (min-width: 761px) and (max-width: 1050px) {
    :global(.vault-grid):where(.vault-grid) {
      grid-template-columns: minmax(0, 1fr);
    }
    :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(button) {
      grid-template-columns: 34px minmax(0, 1fr) auto;
    }
    :global(.saved-cosigner-list):where(.saved-cosigner-list) :global(.row-chevron) {
      display: none;
    }
  }
  :global(.vault-hero):where(.vault-hero) {
    position: relative;
    z-index: 2;
    overflow: visible;
  }

  .phone-recovery-qr {
    display: grid;
    gap: 1rem;
  }
  .phone-recovery-note {
    display: flex;
    gap: 0.75rem;
    padding: 0.9rem;
    border-radius: 0.8rem;
    background: var(--surface-inset);
  }
  .phone-recovery-note > p {
    display: grid;
    gap: 0.2rem;
    margin: 0;
  }
  .phone-recovery-note span {
    color: var(--muted);
    font-size: 0.875rem;
  }
  .inline-error {
    margin: 0;
    color: var(--danger);
  }
  .coordinator-page > :global(.warning-notice) {
    margin-bottom: 1rem;
  }
</style>
