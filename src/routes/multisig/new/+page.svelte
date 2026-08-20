<script lang="ts">
  import {
    AlertTriangle,
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    Clock3,
    Copy,
    Cpu,
    Download,
    FileKey,
    FileUp,
    Network,
    Plus,
    RefreshCw,
    ShieldCheck,
    Trash2,
    Usb,
    Users
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import DiscardMultisigSetupModal from '$lib/components/DiscardMultisigSetupModal.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import SetupTask from '$lib/components/SetupTask.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import SignerPolicyReview from '$lib/components/SignerPolicyReview.svelte';
  import { toast } from '$lib/stores/toasts';
  import {
    walletService,
    WalletError,
    type CosignerHealthCheck,
    type HardwareDevice,
    type MultisigPreview,
    type MultisigSetupDraft,
    type NetworkSetupSource,
    type PolicyVerificationAddress,
    type RecoveryTemplate,
    type SavedFileResult,
    type SignerPolicyVerification,
    type WalletErrorCode
  } from '$lib/wallet';
  import {
    findDuplicateCosigner,
    MULTISIG_ACCOUNT_PATH,
    normalizeSignerLabel,
    validatePolicyDraft,
    type CosignerDraft,
    type CosignerSource
  } from '$lib/multisig/policy';
  import { copyText } from '$lib/clipboard';
  import { combineDescriptorBranches } from '$lib/descriptors';
  import {
    isMeaningfulMultisigSetupDraft,
    multisigSetupSignerTarget
  } from '$lib/wallet/multisig-setup';
  import { coldcardPolicyFilename, readTransferFile, safeTransferFilename } from '$lib/transfer';
  import {
    parsePublicCosignerFile,
    PublicCosignerImportError
  } from '$lib/multisig/cosigner-import';
  import {
    lockedDeviceForHealthCheck,
    matchingDeviceForHealthCheck
  } from '$lib/hardware/health-check';
  import {
    matchingPolicyVerification,
    policyDeviceName,
    policyReadinessKind,
    policyRegistrationProfile,
    requiresInteractivePolicyVerification
  } from '$lib/hardware/policy-readiness';

  type HardwareGuideId = 'coldcard' | 'bitbox02' | 'ledger' | 'trezor' | 'jade';
  const hardwareGuides: Array<{ id: HardwareGuideId; name: string; steps: string[] }> = [
    {
      id: 'coldcard',
      name: 'Coldcard',
      steps: [
        'Finish device setup and make an offline seed backup.',
        'Sign in and enable USB communication if it was disabled.',
        'Leave the device unlocked and ready at its main menu.'
      ]
    },
    {
      id: 'bitbox02',
      name: 'BitBox02',
      steps: [
        'Connect BitBox02, then scan in Groot.',
        'Enter the device password when BitBox02 asks.',
        'If BitBoxApp is open, quit it so Groot can use USB. Use it only if Groot reports that first-time pairing is required.'
      ]
    },
    {
      id: 'ledger',
      name: 'Ledger',
      steps: [
        'Finish device setup and make an offline recovery backup, then quit Ledger Live completely.',
        'For Regtest, unlock the device and open Bitcoin Test—not the main Bitcoin app.',
        'Start the import in Groot, then approve the public-key export shown on Ledger.'
      ]
    },
    {
      id: 'trezor',
      name: 'Trezor',
      steps: [
        'Finish device setup and make an offline seed backup, then quit Trezor Suite completely. Closing its window is not enough.',
        'Reconnect the device. A locked Model One is expected: select its Groot card to open the position keypad while the device shows a scrambled PIN matrix.',
        'Choose the standard no-passphrase wallet explicitly, or select a hidden wallet on-device when supported. Model One host passphrase entry is not yet supported.'
      ]
    },
    {
      id: 'jade',
      name: 'Jade',
      steps: [
        'Finish device setup and make an offline seed backup.',
        'Log in on Jade with Recovery Phrase Login or QR PIN Unlock.',
        'Keep Jade connected over USB while Groot imports the public key.'
      ]
    }
  ];
  const creationSteps = ['Policy', 'Signers', 'Verify', 'Back up'];

  let name = $state('');
  let threshold = $state(2);
  let cosigners = $state<CosignerDraft[]>([]);
  let stage = $state<'policy' | 'keys' | 'review' | 'backup'>('policy');
  let pickerOpen = $state(false);
  let pickerErrorTitle = $state('');
  let pickerError = $state('');
  let pickerErrorGuidance = $state('');
  let keyOpen = $state(false);
  let keyError = $state('');
  let hardwareOpen = $state(false);
  let hardware = $state<HardwareDevice[]>([]);
  let hardwareBusy = $state(false);
  let hardwareProgress = $state('Looking for devices…');
  let standardWalletOpen = $state(false);
  let standardWalletDevice = $state<HardwareDevice | null>(null);
  let pinOpen = $state(false);
  let pinPurpose = $state<'import' | 'health'>('import');
  let pinBusy = $state(false);
  let pinChallenge = $state('');
  let pinPositions = $state('');
  let pinDevice = $state<HardwareDevice | null>(null);
  let pinError = $state('');
  let pinErrorCode = $state<WalletErrorCode | ''>('');
  let hardwareHelpOpen = $state(false);
  let hardwareHelpReturnsToScan = $state(false);
  let hardwareGuide = $state<HardwareGuideId>('coldcard');
  let selectedSigner = $state<CosignerDraft | null>(null);
  let signerPendingRemoval = $state<CosignerDraft | null>(null);
  let checkingSigner = $state(false);
  let healthChecks = $state<Record<string, CosignerHealthCheck>>({});
  let source = $state<CosignerSource>('manual');
  let label = $state('');
  let fingerprint = $state('');
  let xpub = $state('');
  let saved = $state(false);
  let coldcardRegistered = $state(false);
  let draftPolicyVerifications = $state<SignerPolicyVerification[]>([]);
  let policyVerificationDeferred = $state(false);
  let policySigner = $state<CosignerDraft | null>(null);
  let policyDevice = $state<HardwareDevice | null>(null);
  let policyReviewOpen = $state(false);
  let policyReviewBusy = $state(false);
  let policyReviewError = $state('');
  let policyLookupGeneration = 0;
  let credential = $state('');
  let confirmation = $state('');
  let networkSetupSource = $state<NetworkSetupSource | null>(null);
  let reuseNetworkSetup = $state(true);
  let preview = $state<MultisigPreview | null>(null);
  let policyAddress = $state<PolicyVerificationAddress | null>(null);
  let busy = $state(false);
  let error = $state('');
  let templateKind = $state<'standard' | 'recovery' | 'inheritance'>('standard');
  let policyStep = $state<'choose' | 'configure'>('choose');
  let standardRecipe = $state<'2of3' | '3of5' | 'custom'>('2of3');
  let customCosignerCount = $state(3);
  let showDescriptor = $state(false);
  let savingDescriptor = $state(false);
  let backupError = $state('');
  const creationStep = $derived(
    stage === 'policy' ? 1 : stage === 'keys' ? 2 : stage === 'review' ? 3 : 4
  );
  let reviewAttempted = $state(false);
  let draftReady = $state(false);
  let hasDraft = $state(false);
  let discardDraftOpen = $state(false);
  let discardDraftError = $state('');
  let discardingDraft = $state(false);
  let draftSaveError = $state('');
  let createErrorTitle = $state('');
  let hardwareScanGeneration = 0;
  let queuedDraft: MultisigSetupDraft | null = null;
  let draftSaveRunning = false;
  let draftRetryTimer: number | null = null;
  let lastDraftFingerprint = '';
  const policy = $derived({ name, threshold, cosigners });
  const standardCosignerCount = $derived(
    standardRecipe === '2of3' ? 3 : standardRecipe === '3of5' ? 5 : customCosignerCount
  );
  const requiredKeys = $derived(templateKind === 'standard' ? standardCosignerCount : 4);
  const errors = $derived([
    ...validatePolicyDraft(policy),
    ...(cosigners.length !== requiredKeys
      ? [
          `${templateKind === 'standard' ? 'This wallet' : 'This template'} needs exactly ${requiredKeys} signers.`
        ]
      : [])
  ]);
  const visibleErrors = $derived.by(() => {
    if (cosigners.length === requiredKeys) return errors.map(signerLanguage);
    const countErrors = new Set([
      'Add at least 3 signers.',
      'The threshold cannot exceed the number of signers.',
      `${templateKind === 'standard' ? 'This wallet' : 'This template'} needs exactly ${requiredKeys} signers.`
    ]);
    const remaining = requiredKeys - cosigners.length;
    const countGuidance =
      remaining > 0
        ? `Add ${remaining} more signer${remaining === 1 ? '' : 's'}.`
        : `Remove ${Math.abs(remaining)} signer${remaining === -1 ? '' : 's'}.`;
    return [...errors.filter((item) => !countErrors.has(item)), countGuidance].map(signerLanguage);
  });
  const recoveryTemplate = $derived.by<RecoveryTemplate | null>(() => {
    if (templateKind === 'standard' || cosigners.length < 4) return null;
    return {
      type: 'recovery',
      immediate: { threshold: 2, signerIds: cosigners.slice(0, 3).map((key) => key.id) },
      recovery: {
        threshold: 1,
        signerIds: [cosigners[3].id],
        availableAfterBlocks: templateKind === 'inheritance' ? 52_560 : 4_320
      }
    };
  });
  const combinedDescriptor = $derived(
    preview
      ? combineDescriptorBranches(preview.externalDescriptor, preview.internalDescriptor)
      : null
  );
  const selectedHardwareGuide = $derived(
    hardwareGuides.find((guide) => guide.id === hardwareGuide) ?? hardwareGuides[0]
  );
  const coldcardRegistrationRequired = $derived(
    cosigners.some((signer) => policyReadinessKind(signer) === 'coldcard')
  );
  const interactivePolicySigners = $derived(
    templateKind === 'standard' ? cosigners.filter(requiresInteractivePolicyVerification) : []
  );
  const interactivePoliciesComplete = $derived(
    interactivePolicySigners.every(
      (signer) => !!matchingPolicyVerification(signer, draftPolicyVerifications)
    )
  );
  const policySetupComplete = $derived(
    (!coldcardRegistrationRequired || coldcardRegistered) && interactivePoliciesComplete
  );
  const hasOptionalPolicySetup = $derived(
    coldcardRegistrationRequired || interactivePolicySigners.length > 0
  );
  const policyReadinessAcknowledged = $derived(
    !hasOptionalPolicySetup || policySetupComplete || policyVerificationDeferred
  );
  const pinAvailable = $derived(saved && policyReadinessAcknowledged);
  const coldcardStep = 2;
  const interactivePolicyStep = $derived(coldcardRegistrationRequired ? 3 : 2);
  const pinStep = $derived(
    1 + (coldcardRegistrationRequired ? 1 : 0) + (interactivePolicySigners.length ? 1 : 0) + 1
  );

  function recipeForDraft(): MultisigSetupDraft['standardRecipe'] {
    return standardRecipe === '2of3'
      ? 'two_of_three'
      : standardRecipe === '3of5'
        ? 'three_of_five'
        : 'custom';
  }

  function recipeFromDraft(value: MultisigSetupDraft['standardRecipe']): typeof standardRecipe {
    return value === 'two_of_three' ? '2of3' : value === 'three_of_five' ? '3of5' : 'custom';
  }

  function currentSetupDraft(): MultisigSetupDraft {
    return {
      version: 1,
      stage,
      templateKind,
      standardRecipe: recipeForDraft(),
      customCosignerCount,
      name,
      threshold,
      cosigners: cosigners.map((cosigner) => ({ ...cosigner })),
      descriptorSaved: saved,
      coldcardRegistered,
      policyVerificationDeferred,
      policyVerifications: draftPolicyVerifications.flatMap((verification) =>
        verification.displayedAddress
          ? [
              {
                signerFingerprint: verification.signerFingerprint,
                deviceType: verification.deviceType,
                verifiedAt: verification.verifiedAt,
                displayedAddress: verification.displayedAddress
              }
            ]
          : []
      ),
      updatedAt: 0
    };
  }

  function draftSaveMessage(cause: unknown): string {
    if (cause instanceof WalletError && cause.code === 'wallet_corrupt') {
      return 'A saved hardware-policy verification could not be validated. Verify that signer again; your signers and descriptor are unchanged.';
    }
    return cause instanceof Error
      ? cause.message
      : 'Groot could not save this setup. It will retry automatically.';
  }

  async function drainDraftSaveQueue() {
    if (draftSaveRunning) return;
    draftSaveRunning = true;
    while (queuedDraft) {
      const next = queuedDraft;
      queuedDraft = null;
      try {
        await walletService.saveMultisigSetupDraft(next);
        if (draftRetryTimer) window.clearTimeout(draftRetryTimer);
        draftRetryTimer = null;
        hasDraft = true;
        draftSaveError = '';
      } catch (cause) {
        draftSaveError = draftSaveMessage(cause);
        if (!queuedDraft && !discardingDraft) {
          if (draftRetryTimer) window.clearTimeout(draftRetryTimer);
          draftRetryTimer = window.setTimeout(() => {
            draftRetryTimer = null;
            queueDraftSave(next);
          }, 3_000);
        }
      }
    }
    draftSaveRunning = false;
  }

  function queueDraftSave(draft: MultisigSetupDraft) {
    if (draftRetryTimer) window.clearTimeout(draftRetryTimer);
    draftRetryTimer = null;
    queuedDraft = draft;
    void drainDraftSaveQueue();
  }

  async function flushCurrentDraft() {
    queueDraftSave(currentSetupDraft());
    while (draftSaveRunning || queuedDraft) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
    }
    if (draftSaveError) throw new Error(draftSaveError);
  }

  async function previewRestoredDraft(draft: MultisigSetupDraft) {
    if (draft.cosigners.length !== multisigSetupSignerTarget(draft)) return;
    if (draft.templateKind === 'standard') {
      [preview, policyAddress] = await Promise.all([
        walletService.previewMultisig({
          name: draft.name,
          threshold: draft.threshold,
          cosigners: draft.cosigners
        }),
        walletService.previewMultisigPolicyVerificationAddress({
          name: draft.name,
          threshold: draft.threshold,
          cosigners: draft.cosigners
        })
      ]);
      return;
    }
    const restoredTemplate: RecoveryTemplate = {
      type: 'recovery',
      immediate: { threshold: 2, signerIds: draft.cosigners.slice(0, 3).map((key) => key.id) },
      recovery: {
        threshold: 1,
        signerIds: [draft.cosigners[3].id],
        availableAfterBlocks: draft.templateKind === 'inheritance' ? 52_560 : 4_320
      }
    };
    const analysis = await walletService.analyzeRecoveryPolicy(restoredTemplate, draft.cosigners);
    preview = {
      name: draft.name,
      threshold: 2,
      cosigners: draft.cosigners,
      externalDescriptor: analysis.externalDescriptor,
      internalDescriptor: analysis.internalDescriptor
    };
  }

  function applySetupDraft(draft: MultisigSetupDraft) {
    name = draft.name;
    threshold = draft.threshold;
    cosigners = draft.cosigners.map((cosigner) => ({ ...cosigner }));
    stage = draft.stage;
    policyStep = draft.stage === 'policy' ? 'configure' : 'choose';
    templateKind = draft.templateKind;
    standardRecipe = recipeFromDraft(draft.standardRecipe);
    customCosignerCount = draft.customCosignerCount;
    saved = draft.descriptorSaved;
    coldcardRegistered = draft.coldcardRegistered;
    policyVerificationDeferred = draft.policyVerificationDeferred;
    draftPolicyVerifications = draft.policyVerifications.map((verification) => ({
      ...verification,
      scope: 'policy_and_address',
      displayedAddress: verification.displayedAddress
    }));
  }

  function resetSetupState() {
    name = '';
    threshold = 2;
    cosigners = [];
    stage = 'policy';
    policyStep = 'choose';
    templateKind = 'standard';
    standardRecipe = '2of3';
    customCosignerCount = 3;
    saved = false;
    coldcardRegistered = false;
    draftPolicyVerifications = [];
    policyVerificationDeferred = false;
    preview = null;
    policyAddress = null;
    credential = '';
    confirmation = '';
    error = '';
    createErrorTitle = '';
    draftSaveError = '';
    discardDraftError = '';
  }

  async function discardSetupDraft() {
    if (discardingDraft) return;
    discardingDraft = true;
    queuedDraft = null;
    if (draftRetryTimer) window.clearTimeout(draftRetryTimer);
    draftRetryTimer = null;
    try {
      await walletService.discardMultisigSetupDraft();
      lastDraftFingerprint = '';
      hasDraft = false;
      discardDraftOpen = false;
      discardDraftError = '';
      resetSetupState();
      toast({
        title: 'Setup discarded',
        description: 'The saved public multisig draft was removed.',
        tone: 'success'
      });
      await goto('/');
    } catch (cause) {
      discardDraftError =
        cause instanceof Error ? cause.message : 'The saved setup could not be discarded.';
    } finally {
      discardingDraft = false;
    }
  }

  onMount(async () => {
    try {
      networkSetupSource = (await walletService.networkSetupSources())[0] ?? null;
    } catch {
      networkSetupSource = null;
    }
    try {
      const draft = await walletService.multisigSetupDraft();
      if (draft) {
        applySetupDraft(draft);
        await previewRestoredDraft(draft);
        hasDraft = true;
        toast({
          title: 'Multisig setup resumed',
          description: `Returned to ${draft.stage === 'keys' ? 'Signers' : draft.stage === 'review' ? 'Verify' : draft.stage === 'backup' ? 'Back up' : 'Policy'}.`,
          tone: 'success'
        });
      }
    } catch (cause) {
      hasDraft = true;
      draftSaveError =
        cause instanceof Error ? cause.message : 'Saved setup progress could not be loaded.';
    } finally {
      draftReady = true;
    }
  });

  $effect(() => {
    if (!draftReady || discardingDraft) return;
    const draft = currentSetupDraft();
    if (!isMeaningfulMultisigSetupDraft(draft)) return;
    const fingerprint = JSON.stringify(draft);
    if (fingerprint === lastDraftFingerprint) return;
    lastDraftFingerprint = fingerprint;
    queueDraftSave(draft);
  });

  onDestroy(() => {
    if (draftRetryTimer) window.clearTimeout(draftRetryTimer);
    credential = '';
    confirmation = '';
    pinPositions = '';
    pinChallenge = '';
    hardwareScanGeneration += 1;
  });

  function signerLanguage(value: string) {
    return value.replaceAll('cosigners', 'signers').replaceAll('cosigner', 'signer');
  }

  function chooseSource(next: CosignerSource) {
    source = next;
    pickerOpen = false;
    keyError = '';
    keyOpen = true;
  }

  function duplicateSignerMessage(candidate: CosignerDraft): string | null {
    const duplicate = findDuplicateCosigner(cosigners, candidate);
    if (!duplicate) return null;
    if (duplicate.match === 'both') {
      return `This signer is already added as “${duplicate.cosigner.label}” (fingerprint ${duplicate.cosigner.fingerprint.toLowerCase()}).`;
    }
    if (duplicate.match === 'fingerprint') {
      return `Fingerprint ${candidate.fingerprint.trim().toLowerCase()} is already used by “${duplicate.cosigner.label}”.`;
    }
    return `This account xpub is already used by “${duplicate.cosigner.label}”.`;
  }

  function appendCosigner(candidate: CosignerDraft, showError: (message: string) => void): boolean {
    const duplicate = duplicateSignerMessage(candidate);
    if (duplicate) {
      showError(duplicate);
      toast({ title: 'Signer already added', description: duplicate, tone: 'danger' });
      return false;
    }
    cosigners = [...cosigners, candidate];
    return true;
  }

  async function importCosignerFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    pickerErrorTitle = '';
    pickerError = '';
    pickerErrorGuidance = '';
    try {
      const fallbackLabel = file.name.replace(/\.[^.]+$/, '').slice(0, 48);
      const imported = parsePublicCosignerFile(await readTransferFile(file), fallbackLabel);
      const candidate = { id: crypto.randomUUID(), ...imported, source: 'file' as const };
      if (!appendCosigner(candidate, (message) => (pickerError = message))) return;
      pickerOpen = false;
      toast({
        title: 'Public signer imported',
        description: `${imported.label} was loaded from a local file.`,
        tone: 'success'
      });
    } catch (cause) {
      pickerErrorTitle =
        cause instanceof PublicCosignerImportError
          ? 'Could not import this signer'
          : 'Could not read this file';
      pickerError =
        cause instanceof Error ? cause.message : 'The public-key file could not be read.';
      pickerErrorGuidance =
        cause instanceof PublicCosignerImportError
          ? cause.guidance
          : 'Choose a Coldcard XPUB JSON or Groot public-signer JSON file and try again.';
    }
  }

  function closeSignerPicker() {
    pickerOpen = false;
    pickerErrorTitle = '';
    pickerError = '';
    pickerErrorGuidance = '';
  }

  function openHardwareHelp(returnToScan = false) {
    hardwareHelpReturnsToScan = returnToScan;
    if (returnToScan) hardwareOpen = false;
    hardwareHelpOpen = true;
  }

  function closeHardwareHelp() {
    hardwareHelpOpen = false;
    if (hardwareHelpReturnsToScan) hardwareOpen = true;
    hardwareHelpReturnsToScan = false;
  }

  function sourceLabel(value: CosignerSource) {
    return value === 'usb'
      ? 'USB'
      : value === 'virtual'
        ? 'USB demo'
        : value === 'qr'
          ? 'QR code'
          : value === 'file'
            ? 'File'
            : 'Manual entry';
  }

  function sourceHeading(value: CosignerSource) {
    return value === 'usb' || value === 'virtual' ? 'Connection' : 'Imported via';
  }

  function chooseTemplate(next: 'standard' | 'recovery' | 'inheritance') {
    templateKind = next;
    if (next !== 'standard') threshold = 2;
    else applyStandardRecipe(standardRecipe);
    error = '';
  }

  function continueToPolicyConfiguration() {
    error = '';
    policyStep = 'configure';
  }

  function returnToPolicyChoice() {
    error = '';
    policyStep = 'choose';
  }

  function applyStandardRecipe(next: '2of3' | '3of5' | 'custom') {
    const nextCount = next === '2of3' ? 3 : next === '3of5' ? 5 : customCosignerCount;
    if (cosigners.length > nextCount) {
      error = `Remove ${cosigners.length - nextCount} signer${cosigners.length - nextCount === 1 ? '' : 's'} before choosing this setup.`;
      return;
    }
    standardRecipe = next;
    threshold = next === '3of5' ? 3 : Math.min(Math.max(2, threshold), nextCount);
    if (next === '2of3') threshold = 2;
    error = '';
  }

  function setCustomCosignerCount(next: number) {
    if (cosigners.length > next) {
      error = `Remove ${cosigners.length - next} signer${cosigners.length - next === 1 ? '' : 's'} before reducing the key count.`;
      return;
    }
    customCosignerCount = next;
    threshold = Math.min(threshold, next);
    error = '';
  }

  function addKey() {
    const candidate: CosignerDraft = {
      id: crypto.randomUUID(),
      label,
      fingerprint,
      xpub,
      derivationPath: MULTISIG_ACCOUNT_PATH,
      source
    };
    if (!appendCosigner(candidate, (message) => (keyError = message))) return;
    label = '';
    fingerprint = '';
    xpub = '';
    keyOpen = false;
  }

  function addedSignerForDevice(device: HardwareDevice): CosignerDraft | null {
    if (!device.fingerprint) return null;
    const fingerprint = device.fingerprint.toLowerCase();
    return (
      cosigners.find((cosigner) => cosigner.fingerprint.trim().toLowerCase() === fingerprint) ??
      null
    );
  }

  function confirmCosignerRemoval() {
    if (!signerPendingRemoval) return;
    const { id, label: removedLabel } = signerPendingRemoval;
    cosigners = cosigners.filter((item) => item.id !== id);
    if (selectedSigner?.id === id) selectedSigner = null;
    const { [id]: _removed, ...remainingChecks } = healthChecks;
    healthChecks = remainingChecks;
    draftPolicyVerifications = draftPolicyVerifications.filter((verification) =>
      cosigners.some(
        (signer) =>
          signer.fingerprint.toLowerCase() === verification.signerFingerprint.toLowerCase()
      )
    );
    signerPendingRemoval = null;
    toast({
      title: 'Signer removed',
      description: `${removedLabel} was removed from this unfinished wallet.`,
      tone: 'success'
    });
  }

  async function renameDraftSigner(nextLabel: string) {
    if (!selectedSigner) return;
    const signerId = selectedSigner.id;
    const normalized = normalizeSignerLabel(nextLabel);
    const renamed = { ...selectedSigner, label: normalized };
    cosigners = cosigners.map((signer) => (signer.id === signerId ? renamed : signer));
    selectedSigner = renamed;
    await flushCurrentDraft();
    toast({
      title: 'Signer renamed',
      description: `This signer is now “${normalized}”.`,
      tone: 'success'
    });
  }

  async function runDraftHealthCheck() {
    if (!selectedSigner || checkingSigner) return;
    const signer = selectedSigner;
    checkingSigner = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      const result = await walletService.checkHardwareCosigner(signer, device.id);
      healthChecks[signer.id] = result;
      toast({
        title: 'Signer verified',
        description: `${signer.label} matches this wallet.`,
        tone: 'success'
      });
    } catch (cause) {
      const summary = cause instanceof Error ? cause.message : 'The device could not be verified.';
      healthChecks[signer.id] = {
        checkedAt: new Date().toISOString(),
        summary,
        status: 'attention'
      };
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checkingSigner = false;
    }
  }

  async function scanHardware() {
    const generation = ++hardwareScanGeneration;
    pickerOpen = false;
    hardwareOpen = true;
    hardware = [];
    hardwareBusy = true;
    hardwareProgress = 'Looking for devices…';
    error = '';
    try {
      const discovered = await walletService.listHardwareDevices();
      if (generation !== hardwareScanGeneration || !hardwareOpen) return;
      hardware = discovered;
    } catch (cause) {
      if (generation !== hardwareScanGeneration) return;
      if (hardware.length === 0)
        error = cause instanceof Error ? cause.message : 'Could not scan for devices.';
    } finally {
      if (generation === hardwareScanGeneration) hardwareBusy = false;
    }
  }

  function closeHardwareScan() {
    hardwareScanGeneration += 1;
    hardwareOpen = false;
    hardwareBusy = false;
  }

  async function copyDescriptor(value: string, label: 'Wallet' | 'Receive' | 'Change') {
    await copyText(value, 'public-wallet-data');
    toast({
      title: `${label} descriptor copied`,
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
  }

  function savedFileAction(result: SavedFileResult) {
    if (!result.revealToken || !result.revealLabel) return undefined;
    return {
      label: result.revealLabel,
      run: async () => {
        try {
          await walletService.revealSavedFile(result.revealToken!);
        } catch (cause) {
          toast({
            title: 'Could not show saved file',
            description: cause instanceof Error ? cause.message : undefined,
            tone: 'danger'
          });
        }
      }
    };
  }

  async function saveDescriptorDraft() {
    if (!preview || savingDescriptor) return;
    savingDescriptor = true;
    backupError = '';
    const portable = combineDescriptorBranches(
      preview.externalDescriptor,
      preview.internalDescriptor
    );
    const content = `Wallet: ${preview.name}\n${portable ? `Portable wallet descriptor:\n${portable}\n\n` : ''}Receive descriptor:\n${preview.externalDescriptor}\n\nChange descriptor:\n${preview.internalDescriptor}\n`;
    try {
      const savedBackup = await walletService.savePublicBackup(
        `${safeTransferFilename(preview.name)}-descriptors.txt`,
        content
      );
      if (savedBackup.saved) {
        saved = true;
        toast({
          title: 'Descriptor backup saved',
          description: 'The public wallet descriptor was written to the selected file.',
          tone: 'success',
          action: savedFileAction(savedBackup)
        });
      }
    } catch (cause) {
      backupError =
        cause instanceof Error ? cause.message : 'Could not save the descriptor backup.';
      toast({ title: 'Descriptor backup not saved', description: backupError, tone: 'danger' });
    } finally {
      savingDescriptor = false;
    }
  }

  async function saveColdcardPolicy() {
    if (!preview || savingDescriptor) return;
    savingDescriptor = true;
    backupError = '';
    try {
      const savedPolicy = await walletService.savePublicBackup(
        coldcardPolicyFilename(preview.name),
        `# Groot multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${preview.externalDescriptor}\n`
      );
      if (savedPolicy.saved)
        toast({
          title: 'Coldcard policy saved',
          description: 'Import it on every Coldcard signer, then verify the policy on-device.',
          tone: 'success',
          action: savedFileAction(savedPolicy)
        });
    } catch (cause) {
      backupError = cause instanceof Error ? cause.message : 'Could not save the Coldcard policy.';
      toast({ title: 'Coldcard policy not saved', description: backupError, tone: 'danger' });
    } finally {
      savingDescriptor = false;
    }
  }

  async function importHardware(device: HardwareDevice, allowEmptyPassphrase = false) {
    const profile = policyRegistrationProfile(device);
    if (!profile.supported && profile.registration === 'unsupported') {
      error = `${profile.name} is not supported by Groot's pinned HWI release and has not completed physical certification.`;
      return;
    }
    const deviceLabel = label.trim() || device.label;
    hardwareBusy = true;
    hardwareProgress = device.model.startsWith('ledger')
      ? 'Reading the multisig account key from Ledger…'
      : device.model === 'bitbox02'
        ? 'Reading the public key from BitBox02…'
        : `Reading the public key from ${device.label}…`;
    error = '';
    try {
      const candidate = await walletService.importHardwareCosigner(
        device.id,
        deviceLabel,
        allowEmptyPassphrase
      );
      if (!appendCosigner(candidate, (message) => (error = message))) return;
      hardwareOpen = false;
      standardWalletOpen = false;
      standardWalletDevice = null;
      label = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not read the public key.';
    } finally {
      hardwareBusy = false;
    }
  }

  async function handleHardware(device: HardwareDevice) {
    if (device.action === 'import') return importHardware(device);
    if (device.action === 'prompt_pin') return startHardwarePin(device);
    if (device.action === 'confirm_empty_passphrase') {
      standardWalletDevice = device;
      hardwareOpen = false;
      standardWalletOpen = true;
      return;
    }
    if (device.action === 'retry') return scanHardware();
  }

  async function startHardwarePin(device: HardwareDevice, purpose: 'import' | 'health' = 'import') {
    const retrying = pinOpen;
    hardwareBusy = true;
    pinBusy = retrying;
    error = '';
    pinError = '';
    pinErrorCode = '';
    pinPositions = '';
    try {
      pinChallenge = await walletService.promptHardwarePin(device.id);
      pinDevice = device;
      pinPurpose = purpose;
      hardwareOpen = false;
      pinOpen = true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not start the PIN matrix.';
      if (retrying) {
        pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
        pinError = message;
      } else error = message;
    } finally {
      hardwareBusy = false;
      pinBusy = false;
    }
  }

  async function submitHardwarePin() {
    if (!pinChallenge || !pinPositions || pinBusy) return;
    pinBusy = true;
    pinError = '';
    pinErrorCode = '';
    let positions = pinPositions;
    pinPositions = '';
    try {
      await walletService.sendHardwarePin(pinChallenge, positions);
      pinChallenge = '';
      pinOpen = false;
      pinDevice = null;
      if (pinPurpose === 'health') {
        pinPurpose = 'import';
        toast({
          title: 'Hardware wallet unlocked',
          description: 'Resuming the signer health check.',
          tone: 'success'
        });
        await runDraftHealthCheck();
      } else {
        toast({
          title: 'Hardware wallet unlocked',
          description: 'Scanning again for its public fingerprint.',
          tone: 'success'
        });
        await scanHardware();
      }
    } catch (cause) {
      pinChallenge = '';
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      pinError =
        cause instanceof Error ? cause.message : 'Trezor did not accept that matrix entry.';
    } finally {
      positions = '';
      pinBusy = false;
    }
  }

  async function openDraftPolicyVerification(signer: CosignerDraft) {
    const generation = ++policyLookupGeneration;
    policySigner = signer;
    policyDevice =
      hardware.find(
        (device) => device.fingerprint?.toLowerCase() === signer.fingerprint.toLowerCase()
      ) ?? null;
    policyReviewError = '';
    policyReviewOpen = true;
    if (policyDevice) {
      policyReviewBusy = false;
      return;
    }
    policyReviewBusy = true;
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
      policyReviewError =
        cause instanceof Error ? cause.message : 'Could not scan hardware devices.';
    } finally {
      if (generation === policyLookupGeneration) policyReviewBusy = false;
    }
  }

  function closeDraftPolicyVerification() {
    if (policyReviewBusy && policyDevice) return;
    policyLookupGeneration += 1;
    policyReviewOpen = false;
    policySigner = null;
    policyDevice = null;
    policyReviewBusy = false;
    policyReviewError = '';
  }

  async function verifyDraftPolicy() {
    if (!policySigner || !policyDevice || policyReviewBusy) return;
    const signerLabel = policySigner.label;
    policyReviewBusy = true;
    policyReviewError = '';
    try {
      const verification = await walletService.verifyMultisigDraftSignerPolicy(
        policy,
        policyDevice.id,
        policySigner.fingerprint
      );
      draftPolicyVerifications = [
        verification,
        ...draftPolicyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      policyReviewOpen = false;
      policySigner = null;
      policyDevice = null;
      toast({
        title: 'Wallet policy verified',
        description: `${signerLabel} registered the policy and verified its first address.`,
        tone: 'success'
      });
    } catch (cause) {
      policyReviewError =
        cause instanceof Error ? cause.message : 'The wallet policy could not be verified.';
    } finally {
      policyReviewBusy = false;
    }
  }

  async function review() {
    reviewAttempted = true;
    error = '';
    if (errors.length > 0) return;
    busy = true;
    try {
      const previousDescriptor = preview?.externalDescriptor;
      if (recoveryTemplate) {
        const analysis = await walletService.analyzeRecoveryPolicy(recoveryTemplate, cosigners);
        preview = {
          name: name.trim(),
          threshold: 2,
          cosigners,
          externalDescriptor: analysis.externalDescriptor,
          internalDescriptor: analysis.internalDescriptor
        };
      } else {
        [preview, policyAddress] = await Promise.all([
          walletService.previewMultisig(policy),
          walletService.previewMultisigPolicyVerificationAddress(policy)
        ]);
      }
      if (previousDescriptor && previousDescriptor !== preview.externalDescriptor) {
        saved = false;
        coldcardRegistered = false;
        draftPolicyVerifications = [];
        policyVerificationDeferred = false;
      }
      stage = 'review';
      showDescriptor = false;
      backupError = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not build the descriptor.';
    } finally {
      busy = false;
    }
  }

  function continueToCosigners() {
    error = '';
    if (!name.trim()) {
      error = 'A wallet name is required.';
      return;
    }
    stage = 'keys';
  }

  async function create() {
    if (
      !preview ||
      !saved ||
      !policyReadinessAcknowledged ||
      !credential ||
      credential !== confirmation
    )
      return;
    busy = true;
    error = '';
    createErrorTitle = '';
    try {
      let networkSetupCopied = true;
      await flushCurrentDraft();
      if (recoveryTemplate)
        await walletService.createRecoveryMultisig(name, recoveryTemplate, cosigners, credential);
      else await walletService.createMultisig(policy, credential);
      if (reuseNetworkSetup && networkSetupSource) {
        try {
          await walletService.adoptNetworkSetup(networkSetupSource.walletId, credential);
        } catch {
          networkSetupCopied = false;
        }
      }
      hasDraft = false;
      toast({
        title: 'Multisig wallet created',
        description: networkSetupCopied
          ? `${threshold} signatures are required to spend.`
          : 'Network setup was not copied. Configure it in Settings.',
        tone: networkSetupCopied ? 'success' : 'default'
      });
      await goto('/multisig');
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_corrupt') {
        createErrorTitle = 'Hardware verification needs attention';
        error =
          'Groot could not safely restore the saved verification. Open “Verify hardware wallet policies” and verify the signer again.';
      } else {
        createErrorTitle = 'Wallet could not be created';
        error =
          cause instanceof Error
            ? cause.message
            : 'Try again. Your hardware-wallet keys and saved descriptor are unchanged.';
      }
    } finally {
      credential = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<div class="page coordinator-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">MULTISIG WALLET</p>
      <h1>Create a multisig wallet</h1>
      <p class="subtitle">
        {stage === 'policy' && policyStep === 'choose'
          ? 'Choose how this wallet can be spent.'
          : stage === 'policy'
            ? 'Name and configure the policy before adding signers.'
            : 'Add independent signers, verify the policy, and back it up.'}
      </p>
    </div>
    <div class="page-header-actions">
      {#if hasDraft}<Button
          variant="ghost-danger"
          size="small"
          onclick={() => {
            discardDraftError = '';
            discardDraftOpen = true;
          }}><Trash2 size={14} />Discard setup</Button
        >{/if}{#if stage === 'policy'}<a
          class="secondary-link"
          href="/multisig/recover"
          aria-label="Recover from backup"><FileUp size={15} />Recover</a
        >{/if}<span class="network-chip">Regtest · Native SegWit</span>
    </div>
  </header>
  <SetupProgress steps={creationSteps} current={creationStep} label="Wallet creation progress" />
  {#if draftSaveError}<div class="warning-box danger" role="alert">
      <AlertTriangle size={16} /><strong>Setup progress could not be saved</strong><span
        >{draftSaveError}</span
      >
    </div>{/if}

  {#if !draftReady}
    <section class="form-card">
      <HardwareActionPrompt
        title="Restoring multisig setup"
        detail="Checking for saved public policy progress…"
        label="Restoring multisig setup"
      />
    </section>
  {:else if stage === 'policy'}
    <div class="coordinator-grid policy-only-grid">
      <section class="form-card coordinator-main">
        {#if policyStep === 'choose'}
          <div class="section-heading compact policy-choice-heading">
            <div>
              <span class="setup-step">POLICY · 1 OF 2</span>
              <h2>Choose a spending policy</h2>
              <p>
                Start with who should be able to spend and whether a separate delayed key is needed.
              </p>
            </div>
          </div>
          <div class="template-grid policy-template-grid" aria-label="Wallet policies">
            <button
              class:active={templateKind === 'standard'}
              onclick={() => chooseTemplate('standard')}
              ><Users size={18} /><strong>Standard</strong><small
                >A fixed group approves every payment. No timer.</small
              ></button
            >
            <button
              class:active={templateKind === 'recovery'}
              onclick={() => chooseTemplate('recovery')}
              ><ShieldCheck size={18} /><strong>Recovery path</strong><small
                >2 of 3 now; an emergency key after about one month.</small
              ></button
            >
            <button
              class:active={templateKind === 'inheritance'}
              onclick={() => chooseTemplate('inheritance')}
              ><Clock3 size={18} /><strong>Inheritance</strong><small
                >2 of 3 now; an heir key after about one year.</small
              ></button
            >
          </div>
          <div class="template-tradeoff policy-choice-explainer">
            <strong
              >{templateKind === 'standard'
                ? 'Best for ordinary shared custody'
                : templateKind === 'recovery'
                  ? 'Shorter emergency fallback'
                  : 'Longer planned handoff'}</strong
            >
            <span
              >{templateKind === 'standard'
                ? 'Every payment always needs the chosen number of signers.'
                : templateKind === 'recovery'
                  ? 'A fourth independent key can spend after each coin has aged about 4,320 blocks.'
                  : 'A fourth independent heir key can spend after each coin has aged about 52,560 blocks.'}</span
            >
          </div>
          <p class="policy-template-note">
            Recovery path and Inheritance use the same four-key structure. Their intended holder and
            delay are different; the delayed key cannot spend before its timer matures.
          </p>
          <div class="coordinator-actions">
            <Button variant="secondary" href="/settings"><ArrowLeft size={16} />Cancel</Button
            ><Button onclick={continueToPolicyConfiguration}
              >Configure {templateKind === 'standard'
                ? 'standard'
                : templateKind === 'recovery'
                  ? 'recovery path'
                  : 'inheritance'}<ChevronRight size={16} /></Button
            >
          </div>
        {:else}
          <button class="back-link" onclick={returnToPolicyChoice}
            ><ArrowLeft size={16} />Change policy type</button
          >
          <div class="section-heading compact policy-configure-heading">
            <div>
              <span class="setup-step">POLICY · 2 OF 2</span>
              <h2>
                Configure {templateKind === 'standard'
                  ? 'a standard wallet'
                  : templateKind === 'recovery'
                    ? 'the recovery path'
                    : 'inheritance'}
              </h2>
              <p>Choose a local name and confirm how many independent keys this policy needs.</p>
            </div>
            <span class="policy-pill"
              >{templateKind === 'standard'
                ? `${threshold} of ${requiredKeys}`
                : '2 of 3 + delayed key'}</span
            >
          </div>
          <label class="field"
            ><span>Wallet name</span><input
              bind:value={name}
              maxlength="48"
              placeholder="e.g. Family wallet"
            /><FieldCounter value={name} max={48} /></label
          >
          {#if templateKind === 'standard'}
            <div class="policy-recipes" aria-label="Standard multisig recipes">
              <button
                class:active={standardRecipe === '2of3'}
                onclick={() => applyStandardRecipe('2of3')}
                ><strong>2 of 3</strong><small>Recommended</small></button
              >
              <button
                class:active={standardRecipe === '3of5'}
                onclick={() => applyStandardRecipe('3of5')}
                ><strong>3 of 5</strong><small>Larger group</small></button
              >
              <button
                class:active={standardRecipe === 'custom'}
                onclick={() => applyStandardRecipe('custom')}
                ><strong>Custom</strong><small>Advanced</small></button
              >
            </div>
            {#if standardRecipe === 'custom'}<div class="threshold-row custom-threshold">
                <label class="field"
                  ><span>Signatures required (M)</span><select
                    aria-label="Signatures required"
                    value={threshold}
                    onchange={(event) => (threshold = Number(event.currentTarget.value))}
                    >{#each Array(customCosignerCount - 1) as _, i}<option value={i + 2}
                        >{i + 2}</option
                      >{/each}</select
                  ></label
                >
                <label class="field"
                  ><span>Total signers (N)</span><select
                    aria-label="Total signers"
                    value={customCosignerCount}
                    onchange={(event) => setCustomCosignerCount(Number(event.currentTarget.value))}
                    >{#each Array(5) as _, i}<option value={i + 3}>{i + 3}</option>{/each}</select
                  ></label
                >
              </div>
              <p class="policy-guidance">
                Groot starts at 2 signatures. A 1-of-N wallet has no multisig theft protection; use
                a single-key wallet instead.
              </p>
            {:else}<div class="recipe-summary">
                <strong>{threshold} of {requiredKeys} signatures</strong><span
                  >{standardRecipe === '2of3'
                    ? 'Lose one key without losing access.'
                    : 'Designed for a larger family or team.'}</span
                >
              </div>{/if}
          {:else}<div class="path-visual">
              <span><b>NOW</b><strong>2 of 3 primary keys</strong></span><i></i><span
                ><b>{templateKind === 'recovery' ? '~1 MONTH' : '~1 YEAR'}</b><strong
                  >1 {templateKind === 'recovery' ? 'emergency' : 'heir'} key</strong
                ></span
              >
            </div>
            <div class="recovery-separation">
              <ShieldCheck size={15} /><span
                ><strong>Four independent keys required</strong><small
                  >Key 4 is delayed and excluded from the immediate 2-of-3 branch. It cannot be
                  reused as a primary signer.</small
                ></span
              >
            </div>{/if}
          {#if error}<p class="form-error">{error}</p>{/if}
          <div class="coordinator-actions">
            <Button variant="secondary" onclick={returnToPolicyChoice}
              ><ArrowLeft size={16} />Back</Button
            ><Button onclick={continueToCosigners}
              >Continue to signers<ChevronRight size={16} /></Button
            >
          </div>
        {/if}
      </section>
    </div>
  {:else if stage === 'keys'}
    <div class="coordinator-grid">
      <section class="form-card coordinator-main">
        <div class="section-heading compact cosigner-step-heading">
          <div>
            <span class="setup-step">SIGNERS</span>
            <h2>Add {requiredKeys} independent keys</h2>
            <p>
              {name.trim()} · {templateKind === 'standard'
                ? `${threshold} of ${requiredKeys}`
                : '2 of 3 + recovery'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="small"
            disabled={cosigners.length >= requiredKeys}
            onclick={() => (pickerOpen = true)}
            ><Plus size={15} />{cosigners.length >= requiredKeys
              ? 'All added'
              : 'Add a signer'}</Button
          >
        </div>
        <div class="cosigner-list">
          {#each cosigners as signer, i}
            <article class="cosigner-card">
              <button
                class="draft-cosigner-trigger"
                aria-label="View {signer.label} details"
                onclick={() => (selectedSigner = signer)}
              >
                <span class="device-number" aria-hidden="true">{i + 1}</span>
                <span class="cosigner-card-body">
                  <strong class="cosigner-name">{signer.label}</strong>
                  <span class="cosigner-metadata">
                    {#if templateKind !== 'standard'}<span
                        ><small>Policy role</small><span class="source-badge"
                          >{i === 3 ? 'Recovery-only signer' : 'Primary signer'}</span
                        ></span
                      >{/if}
                    <span
                      ><small>Device fingerprint</small><code
                        >{signer.fingerprint.toLowerCase()}</code
                      ></span
                    >
                    <span
                      ><small>{sourceHeading(signer.source)}</small><span class="source-badge"
                        >{sourceLabel(signer.source)}</span
                      ></span
                    >
                    <span class="cosigner-public-key"
                      ><small>Public account key (xpub)</small><code>{signer.xpub}</code></span
                    >
                  </span>
                </span>
                <ChevronRight class="draft-row-chevron" size={16} />
              </button>
              <button
                class="remove-cosigner"
                aria-label="Remove {signer.label}"
                title="Remove signer"
                onclick={() => (signerPendingRemoval = signer)}><Trash2 size={16} /></button
              >
            </article>
          {:else}
            <div class="keys-empty">
              <FileKey size={22} /><strong>No signers yet</strong><span
                >Add {requiredKeys} independent keys for this template.</span
              >
            </div>
          {/each}
        </div>
        {#if cosigners.length > 0}<p class="cosigner-progress" aria-live="polite">
            {cosigners.length} of {requiredKeys} signers added
          </p>{/if}
        {#if reviewAttempted && visibleErrors.length}<div class="policy-errors" aria-live="polite">
            {#each visibleErrors as item}<p>{item}</p>{/each}
          </div>{/if}
        {#if error}<p class="form-error">{error}</p>{/if}
        <div class="coordinator-actions">
          <Button
            variant="secondary"
            onclick={() => {
              error = '';
              policyStep = 'configure';
              stage = 'policy';
            }}><ArrowLeft size={16} />Back to policy</Button
          ><Button loading={busy} loadingLabel="Building policy…" onclick={review}
            >Review wallet<ChevronRight size={16} /></Button
          >
        </div>
      </section>
      <aside class="safety-panel">
        <ShieldCheck size={22} />
        <h2>Before you continue</h2>
        <p>Groot stores public descriptors only. It cannot spend without enough signatures.</p>
        <ul>
          <li>Back up the wallet descriptor.</li>
          <li>Verify each fingerprint on its device.</li>
          <li>Keep devices in separate places.</li>
        </ul>
        <button class="hardware-help-card" onclick={() => openHardwareHelp()}
          ><CircleHelp size={17} /><span
            ><strong>Hardware setup help</strong><small
              >Coldcard, BitBox02, Ledger, Trezor, Jade</small
            ></span
          ><ChevronRight size={14} /></button
        ><code>{MULTISIG_ACCOUNT_PATH}</code>
      </aside>
    </div>
  {:else if stage === 'review' && preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => (stage = 'keys')}
        ><ArrowLeft size={16} />Edit keys</button
      >
      <span class="setup-step">FINAL REVIEW</span>
      <h2>{preview.name}</h2>
      <p class="review-intro">
        Confirm the policy and save the descriptor before creating this wallet.
      </p>
      <div class="policy-summary">
        <strong>{threshold} of {cosigners.length} signatures</strong><span
          >wsh · sortedmulti · BIP48</span
        >
      </div>
      <div class="descriptor-toggle-row">
        <button
          class="descriptor-toggle"
          aria-expanded={showDescriptor}
          onclick={() => (showDescriptor = !showDescriptor)}
          >Descriptor logic <ChevronDown
            size={14}
            class={showDescriptor ? 'rotated' : ''}
          /></button
        ><InsightTip
          label="About wallet descriptors"
          text="A descriptor is a public, watch-only recipe that defines the signing policy and derives every receive and change address. It cannot spend bitcoin, but it reveals the wallet’s complete address history, so keep it private and back it up."
        />
      </div>
      {#if showDescriptor}<div
          class="descriptor-block descriptor-viewer"
          data-testid="descriptor-preview"
        >
          {#if combinedDescriptor}<section class="descriptor-primary">
              <div>
                <span>Portable wallet descriptor</span><small
                  >Standard multipath form: branch 0 receives, branch 1 creates change.</small
                >
              </div>
              <code>{combinedDescriptor}</code><button
                aria-label="Copy wallet descriptor"
                onclick={() => copyDescriptor(combinedDescriptor!, 'Wallet')}
                ><Copy size={14} />Copy wallet descriptor</button
              >
            </section>
            <details>
              <summary>View separate receive and change descriptors</summary>
              <section>
                <div>
                  <span>Receive descriptor</span><small
                    >Generates addresses shared for incoming payments.</small
                  >
                </div>
                <code>{preview.externalDescriptor}</code><button
                  aria-label="Copy receive descriptor"
                  onclick={() => copyDescriptor(preview!.externalDescriptor, 'Receive')}
                  ><Copy size={14} />Copy receive descriptor</button
                >
              </section>
              <section>
                <div>
                  <span>Change descriptor</span><small
                    >Generates private change addresses after spending.</small
                  >
                </div>
                <code>{preview.internalDescriptor}</code><button
                  aria-label="Copy change descriptor"
                  onclick={() => copyDescriptor(preview!.internalDescriptor, 'Change')}
                  ><Copy size={14} />Copy change descriptor</button
                >
              </section>
            </details>
          {:else}<section>
              <div>
                <span>Receive descriptor</span><small
                  >Generates addresses shared for incoming payments.</small
                >
              </div>
              <code>{preview.externalDescriptor}</code><button
                aria-label="Copy receive descriptor"
                onclick={() => copyDescriptor(preview!.externalDescriptor, 'Receive')}
                ><Copy size={14} />Copy receive descriptor</button
              >
            </section>
            <section>
              <div>
                <span>Change descriptor</span><small
                  >Generates private change addresses after spending.</small
                >
              </div>
              <code>{preview.internalDescriptor}</code><button
                aria-label="Copy change descriptor"
                onclick={() => copyDescriptor(preview!.internalDescriptor, 'Change')}
                ><Copy size={14} />Copy change descriptor</button
              >
            </section>{/if}
          {#if recoveryTemplate?.type === 'recovery'}<span>Spend paths</span><code
              >2 of first 3 now · 1 recovery key after {recoveryTemplate.recovery.availableAfterBlocks.toLocaleString()}
              blocks</code
            >{/if}
          <p>
            <ShieldCheck size={14} />Keep descriptors private even though they cannot spend. They
            reveal every address in this wallet.
          </p>
          <button
            class="descriptor-download"
            disabled={savingDescriptor}
            onclick={saveDescriptorDraft}
            ><Download size={14} />{savingDescriptor
              ? 'Opening save dialog…'
              : 'Save public descriptor text'}</button
          >
        </div>{/if}
      {#if backupError}<p class="form-error" role="alert">{backupError}</p>{/if}
      <div class="review-signers">
        {#each preview.cosigners as signer}<div>
            <Check size={14} /><span
              ><strong>{signer.label}</strong><small>{signer.fingerprint}</small></span
            >
          </div>{/each}
      </div>
      <div class="coordinator-actions">
        <Button variant="secondary" onclick={() => (stage = 'keys')}
          ><ArrowLeft size={16} />Back to signers</Button
        ><Button onclick={() => (stage = 'backup')}
          >Continue to backup<ChevronRight size={16} /></Button
        >
      </div>
    </section>
  {:else if stage === 'backup' && preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => (stage = 'review')}
        ><ArrowLeft size={16} />Back to verification</button
      >
      <span class="setup-step">BACK UP</span>
      <h2>Protect {preview.name}</h2>
      <p class="review-intro">Complete each section before creating this coordinator.</p>
      <div class="policy-summary">
        <strong>{threshold} of {cosigners.length} signatures</strong><span
          >wsh · sortedmulti · BIP48</span
        >
      </div>
      <div class="backup-setup-sections">
        <SetupTask
          step={1}
          title="Save the wallet descriptor"
          description="This public backup recovers every wallet address and coordinates signatures. It cannot spend, but it reveals wallet activity."
          state={saved ? 'complete' : 'current'}
          status={saved ? 'Saved' : 'Current step'}
        >
          <Button
            variant="secondary"
            class="full"
            disabled={savingDescriptor}
            loading={savingDescriptor}
            loadingLabel="Opening save dialog…"
            onclick={saveDescriptorDraft}
            ><Download size={14} />{saved
              ? 'Save another copy'
              : 'Save public descriptor text'}</Button
          >
          {#if backupError}<p class="form-error" role="alert">{backupError}</p>{/if}
        </SetupTask>
        {#if coldcardRegistrationRequired}<SetupTask
            step={coldcardStep}
            title="Register the policy on Coldcard"
            description="Recommended now, but optional during coordinator creation. Coldcard must know the complete policy before it signs."
            state={coldcardRegistered
              ? 'complete'
              : policyVerificationDeferred
                ? 'deferred'
                : saved
                  ? 'current'
                  : 'upcoming'}
            status={coldcardRegistered
              ? 'Policy imported'
              : policyVerificationDeferred
                ? 'Required before signing'
                : saved
                  ? 'Optional now'
                  : 'Available after backup'}
          >
            <ol>
              <li>Save the policy to microSD or Coldcard Virtual Disk.</li>
              <li>
                On every Coldcard, import it from <b>Settings → Multisig Wallets → Import</b>.
              </li>
              <li>
                Verify the wallet name, 2-of-3 threshold, and all signer fingerprints on-device.
              </li>
            </ol>
            <Button
              variant="secondary"
              class="full"
              disabled={!saved || savingDescriptor}
              loading={savingDescriptor}
              loadingLabel="Opening save dialog…"
              onclick={saveColdcardPolicy}><Download size={14} />Save Coldcard policy</Button
            >
            <label class="backup-confirmation"
              ><input type="checkbox" disabled={!saved} bind:checked={coldcardRegistered} /><span
                ><strong>Policy verified on every Coldcard</strong><small
                  >I matched the wallet name, threshold, and signer fingerprints on each device.</small
                ></span
              ></label
            >
            {#if !coldcardRegistered && !policyVerificationDeferred}<button
                class="defer-policy-verification"
                disabled={!saved}
                onclick={() => (policyVerificationDeferred = true)}
                ><Clock3 size={14} /><span
                  ><strong>Finish hardware setup before first signature</strong><small
                    >Create the watch-only coordinator now. Groot will stop an unregistered Coldcard
                    before transaction signing.</small
                  ></span
                ></button
              >{/if}
          </SetupTask>{/if}
        {#if interactivePolicySigners.length}<SetupTask
            step={interactivePolicyStep}
            title="Verify hardware wallet policies"
            description="Recommended now, but optional during coordinator creation. Register the policy and prove its first receive address before first use."
            state={interactivePoliciesComplete
              ? 'complete'
              : policyVerificationDeferred
                ? 'deferred'
                : saved && (!coldcardRegistrationRequired || coldcardRegistered)
                  ? 'current'
                  : 'upcoming'}
            status={interactivePoliciesComplete
              ? 'Policy verified'
              : policyVerificationDeferred
                ? 'Required before signing'
                : saved && (!coldcardRegistrationRequired || coldcardRegistered)
                  ? 'Optional now'
                  : 'Available after Coldcard setup'}
          >
            <div class="signer-readiness-list">
              {#each interactivePolicySigners as signer}{@const verification =
                  matchingPolicyVerification(signer, draftPolicyVerifications)}
                <article class:complete={!!verification}>
                  <span><ShieldCheck size={17} /></span>
                  <div>
                    <strong>{signer.label}</strong><small
                      >{verification
                        ? `Policy and first address verified on ${policyDeviceName(policyReadinessKind(signer))}`
                        : policyRegistrationProfile(signer).creationCopy}</small
                    >
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={!saved || (coldcardRegistrationRequired && !coldcardRegistered)}
                    onclick={() => openDraftPolicyVerification(signer)}
                    >{verification ? 'Verify again' : 'Verify policy'}</Button
                  >
                </article>{/each}
            </div>
            {#if !interactivePoliciesComplete && !policyVerificationDeferred && (!coldcardRegistrationRequired || coldcardRegistered)}<button
                class="defer-policy-verification"
                disabled={!saved}
                onclick={() => (policyVerificationDeferred = true)}
                ><Clock3 size={14} /><span
                  ><strong>Finish hardware setup before first signature</strong><small
                    >Create the watch-only coordinator now. Groot will block each unverified signer
                    before transaction signing.</small
                  ></span
                ></button
              >{/if}
          </SetupTask>{/if}
        <SetupTask
          step={pinStep}
          title="Set the coordinator PIN"
          description="This PIN protects local Groot data. It is separate from every hardware-wallet credential."
          state={pinAvailable ? 'current' : 'upcoming'}
          status={pinAvailable ? 'Current step' : 'Available after earlier steps'}
        >
          <div class="credential-grid">
            <PasswordField
              label="App PIN"
              inputLabel="App PIN"
              bind:value={credential}
              placeholder="Unlock this coordinator"
              autocomplete="new-password"
              disabled={!pinAvailable}
            /><PasswordField
              label="Confirm app PIN"
              inputLabel="Confirm app PIN"
              bind:value={confirmation}
              placeholder="Enter it again"
              autocomplete="new-password"
              disabled={!pinAvailable}
            />
          </div>
          {#if credential && confirmation && credential !== confirmation}<p class="form-error">
              PINs do not match.
            </p>{/if}
          {#if networkSetupSource}<label class="credential-warning credential-ack"
              ><input type="checkbox" bind:checked={reuseNetworkSetup} /><Network size={16} />
              <p>
                <strong>Use {networkSetupSource.walletName}’s network setup.</strong><span
                  >Copies its node and sync method. This wallet protects its own copy.</span
                >
              </p></label
            >{/if}
        </SetupTask>
      </div>
      {#if error}<div class="hardware-inline-error hardware-create-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{createErrorTitle || 'Wallet could not be created'}</strong><small
              >{error}</small
            ></span
          >
        </div>{/if}
      <Button
        class="full backup-create-action"
        size="large"
        disabled={!saved ||
          !policyReadinessAcknowledged ||
          !credential ||
          credential !== confirmation}
        loading={busy}
        loadingLabel="Creating wallet…"
        onclick={create}>Create wallet</Button
      >
    </section>
  {/if}
</div>

<DiscardMultisigSetupModal
  open={discardDraftOpen}
  busy={discardingDraft}
  error={discardDraftError}
  onclose={() => {
    discardDraftOpen = false;
    discardDraftError = '';
  }}
  onconfirm={discardSetupDraft}
/>

<Modal
  open={Boolean(signerPendingRemoval)}
  title="Remove signer?"
  description={signerPendingRemoval
    ? `Remove ${signerPendingRemoval.label} from this unfinished wallet?`
    : ''}
  onclose={() => (signerPendingRemoval = null)}
>
  {#if signerPendingRemoval}
    <div class="warning-box">
      <AlertTriangle size={17} /><strong>You will need to add this signer again.</strong><span
        >Its hardware wallet and seed are not changed.</span
      >
    </div>
    <div class="modal-footer">
      <Button variant="secondary" onclick={() => (signerPendingRemoval = null)}>Keep signer</Button
      ><Button variant="danger" onclick={confirmCosignerRemoval}>Remove signer</Button>
    </div>
  {/if}
</Modal>

<Modal
  open={pickerOpen}
  title="Add a signer"
  description="Choose how to import this signer’s public account key."
  onclose={closeSignerPicker}
>
  <div class="source-list">
    <button onclick={scanHardware}
      ><Cpu size={18} /><span
        ><strong>Connect hardware device</strong><small>Desktop · Bitcoin Core HWI</small></span
      ><ChevronRight size={15} /></button
    >
    <label class="source-button"
      ><FileUp size={18} /><span
        ><strong>Import public-key file</strong><small
          >Coldcard XPUB JSON or Groot signer JSON · 256 KiB maximum</small
        ></span
      ><ChevronRight size={15} /><input
        aria-label="Public signer file"
        type="file"
        accept=".json,application/json"
        onchange={importCosignerFile}
      /></label
    >
    <button onclick={() => chooseSource('manual')}
      ><FileKey size={18} /><span
        ><strong>Enter public key</strong><small>Paste an account xpub and fingerprint</small></span
      ><ChevronRight size={15} /></button
    >
  </div>
  {#if pickerError}<div class="import-error" role="alert" aria-live="polite">
      <AlertTriangle size={18} /><span
        ><strong>{pickerErrorTitle}</strong><b>{pickerError}</b><small>{pickerErrorGuidance}</small
        ></span
      >
    </div>{/if}
</Modal>
<Modal
  open={policyReviewOpen}
  title="Verify wallet policy"
  description="Check the policy, signer keys, and first address."
  onclose={closeDraftPolicyVerification}
>
  {#if policyReviewBusy && !policyDevice}<HardwareActionPrompt
      title="Looking for the saved signer"
      detail="Keep the saved signer connected and unlocked while Groot checks its account key."
      label="Signer scan in progress"
    />
  {:else if policySigner && policyDevice && preview && policyAddress}<SignerPolicyReview
      wallet={{ ...preview, kind: 'multisig', createdAt: '', policyType: 'standard' }}
      signer={policySigner}
      {policyAddress}
      verification={matchingPolicyVerification(policySigner, draftPolicyVerifications)}
      busy={policyReviewBusy}
      error={policyReviewError}
      onverify={verifyDraftPolicy}
    />
  {:else if policySigner}<div class="device-scan">
      <Cpu size={20} /><strong>Saved signer not found</strong><span
        >{policyReviewError || `Connect and unlock ${policySigner.label}, then scan again.`}</span
      ><Button variant="secondary" onclick={() => openDraftPolicyVerification(policySigner!)}
        >Scan again</Button
      >
    </div>{/if}
</Modal>

<Modal
  open={hardwareOpen}
  title="Connect hardware device"
  description="Connect one initialized device over USB, then verify its fingerprint before adding it."
  onclose={closeHardwareScan}
>
  <div class="hardware-readiness">
    <Usb size={18} /><span
      ><strong>Connect the signer and release any competing USB session</strong><small
        >BitBox02 can unlock directly from Groot when scanned. If a companion app is open, quit it
        first. A locked Trezor Model One is supported from its Groot card.</small
      ></span
    ><button onclick={() => openHardwareHelp(true)}>Device help</button>
  </div>
  <label class="field"
    ><span>Signer label</span><input
      bind:value={label}
      placeholder="Defaults to device model"
      maxlength="48"
    /><FieldCounter value={label} max={48} /></label
  >
  {#if hardwareBusy}<HardwareActionPrompt
      title={hardwareProgress}
      detail={hardwareProgress.includes('Ledger')
        ? 'Keep Bitcoin Test open for Regtest and confirm the export on the device screen.'
        : 'Keep the signer connected and unlocked. Follow any instructions shown on the device.'}
      label="Hardware signer setup in progress"
    />
  {:else if hardware.length === 0}<div class="device-scan">
      <Cpu size={20} /><strong>{error ? 'Device needs attention' : 'No device found'}</strong><span
        >{error ||
          'HWI returned no device. For Coldcard, sign in first, enable its USB port, reconnect, then scan again. Other signers must be initialized, unlocked, and released by companion apps.'}</span
      ><Button variant="secondary" size="small" onclick={scanHardware}>Scan again</Button>
    </div>
  {:else}<div class="source-list hardware-device-list">
      {#each hardware as device}{@const addedSigner = addedSignerForDevice(device)}<button
          disabled={Boolean(addedSigner) || device.action === 'none'}
          onclick={() => handleHardware(device)}
          ><Cpu size={18} /><span
            ><strong>{addedSigner?.label ?? device.label}</strong><small
              >{addedSigner
                ? `Fingerprint ${device.fingerprint} · Already added as ${addedSigner.label}.`
                : device.fingerprint
                  ? `Fingerprint ${device.fingerprint} · ${device.message}`
                  : device.message}</small
            ><em
              class:ready={!addedSigner && device.status === 'ready'}
              class:signed={Boolean(addedSigner)}
              >{addedSigner
                ? 'Already added'
                : device.status === 'ready'
                  ? 'Ready'
                  : device.status === 'detected'
                    ? 'Detected'
                    : device.status === 'needs_pin'
                      ? 'Unlock'
                      : device.action === 'confirm_empty_passphrase'
                        ? 'Choose wallet'
                        : device.action === 'retry'
                          ? 'Scan again'
                          : 'Unavailable'}</em
            ></span
          >{#if !addedSigner && device.action !== 'none'}<ChevronRight size={15} />{/if}</button
        >{/each}<button class="hardware-rescan" onclick={scanHardware}
        ><RefreshCw size={16} /><span
          ><strong>Scan again</strong><small
            >Refresh the list after unlocking or connecting another signer.</small
          ></span
        ><ChevronRight size={15} /></button
      >
    </div>{/if}
  {#if error && hardware.length > 0}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>Could not read the account key</strong><small>{error}</small></span
      ><Button variant="secondary" size="small" onclick={scanHardware}>Try again</Button>
    </div>{/if}
</Modal>

<Modal
  open={standardWalletOpen}
  title="Use Trezor standard wallet?"
  description="Passphrase protection can expose several independent wallets from the same device."
  onclose={() => {
    standardWalletOpen = false;
    standardWalletDevice = null;
    hardwareOpen = true;
  }}
>
  <div class="credential-warning">
    <ShieldCheck size={17} />
    <p>
      <strong>No hardware passphrase for this signer</strong><span
        >This imports the key derived from the device seed alone. It does not disable, change, or
        reveal any hidden passphrase wallet you may use elsewhere.</span
      >
    </p>
  </div>
  <p class="policy-guidance">
    Choose this only if you intentionally want the Trezor <strong>standard wallet</strong> in this multisig
    policy. Enabling or choosing a passphrase later opens a different hidden wallet; it does not change
    this signer. The imported fingerprint is permanently bound to this policy.
  </p>
  {#if hardwareBusy}<HardwareActionPrompt
      title="Importing the Trezor standard wallet"
      detail="Keep Trezor connected while Groot reads its public BIP48 account key."
      label="Hardware signer import in progress"
    />{:else}<div class="modal-footer">
      <Button
        variant="secondary"
        onclick={() => {
          standardWalletOpen = false;
          standardWalletDevice = null;
          hardwareOpen = true;
        }}>Back</Button
      ><Button
        disabled={!standardWalletDevice}
        onclick={() => {
          if (standardWalletDevice) importHardware(standardWalletDevice, true);
        }}>Use standard wallet</Button
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
  onsubmit={submitHardwarePin}
  onretry={() => {
    if (pinDevice) startHardwarePin(pinDevice);
  }}
  onclose={() => {
    pinOpen = false;
    pinPurpose = 'import';
    pinPositions = '';
    pinChallenge = '';
    pinDevice = null;
    pinError = '';
    pinErrorCode = '';
  }}
/>

<Modal
  open={hardwareHelpOpen}
  title="Prepare your hardware signer"
  description="Groot imports one public account key. Your seed and private keys never leave the device."
  onclose={closeHardwareHelp}
>
  <div class="hardware-guide">
    <div class="hardware-guide-tabs" aria-label="Hardware signer model">
      {#each hardwareGuides as guide}<button
          class:active={hardwareGuide === guide.id}
          onclick={() => (hardwareGuide = guide.id)}>{guide.name}</button
        >{/each}
    </div>
    <div class="hardware-guide-body">
      <span class="device-number"><Usb size={15} /></span>
      <div>
        <strong>{selectedHardwareGuide.name}</strong>
        <ol>
          {#each selectedHardwareGuide.steps as step}<li>{step}</li>{/each}
        </ol>
      </div>
    </div>
    <p>
      <strong>Never enter a seed into Groot.</strong> If a device asks you to restore or initialize it
      during this flow, cancel and complete that process using the device vendor’s trusted instructions
      first.
    </p>
    <Button
      class="full"
      onclick={() => {
        hardwareHelpOpen = false;
        hardwareHelpReturnsToScan = false;
        scanHardware();
      }}>Scan for devices</Button
    >
  </div>
</Modal>

<Modal
  open={keyOpen}
  title="Enter public signer key"
  description="No private key or seed should ever be entered here."
  onclose={() => {
    keyOpen = false;
    keyError = '';
  }}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      addKey();
    }}
  >
    <label class="field"
      ><span>Signer label</span><input
        aria-label="Signer label"
        bind:value={label}
        placeholder="e.g. Coldcard"
        maxlength="48"
      /><FieldCounter value={label} max={48} /></label
    >
    <label class="field"
      ><span>Master fingerprint</span><input
        aria-label="Master fingerprint"
        bind:value={fingerprint}
        placeholder="8 hex characters"
        maxlength="8"
      /></label
    >
    <label class="field"
      ><span>Account xpub</span><textarea
        aria-label="Account xpub"
        bind:value={xpub}
        rows="3"
        placeholder="tpub…"></textarea><small>Derivation: {MULTISIG_ACCOUNT_PATH}</small></label
    >
    {#if keyError}<p class="form-error" role="alert">{keyError}</p>{/if}
    <div class="modal-footer">
      <Button variant="secondary" onclick={() => (keyOpen = false)}>Cancel</Button><Button
        type="submit"
        disabled={!label.trim() || !/^[0-9a-fA-F]{8}$/.test(fingerprint.trim()) || !xpub.trim()}
        >Add key</Button
      >
    </div>
  </form>
</Modal>

<DeviceDetailsModal
  signer={selectedSigner}
  health={selectedSigner ? (healthChecks[selectedSigner.id] ?? null) : null}
  checking={checkingSigner}
  onclose={() => (selectedSigner = null)}
  oncheck={runDraftHealthCheck}
  onrename={renameDraftSigner}
/>
