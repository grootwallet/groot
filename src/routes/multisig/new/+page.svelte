<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
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
  import { formatInteger, locale } from '$lib/i18n';
  import { defaultConfig, networkName } from '$lib/config';
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
      steps: ['Sign in and enable USB.', 'Leave Coldcard at its main menu.']
    },
    {
      id: 'bitbox02',
      name: 'BitBox02',
      steps: ['Connect and unlock BitBox.', 'Quit BitBoxApp, then continue.']
    },
    {
      id: 'ledger',
      name: 'Ledger',
      steps: ['Quit Ledger Live and open Bitcoin Test.', 'Approve the public-key export on Ledger.']
    },
    {
      id: 'trezor',
      name: 'Trezor',
      steps: [
        'Quit Trezor Suite and reconnect.',
        'For Model One, unlock from its Groot card.',
        'Choose the standard or on-device hidden wallet.'
      ]
    },
    {
      id: 'jade',
      name: 'Jade',
      steps: ['Log in on Jade.', 'Keep Jade connected while Groot imports the key.']
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
  let recoveryDelayBlocks = $state(4_320);
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
          translate($locale, '{subject} needs exactly {count} signers.', {
            subject: translate(
              $locale,
              templateKind === 'standard' ? 'This wallet' : 'This template'
            ),
            count: requiredKeys
          })
        ]
      : [])
  ]);
  const visibleErrors = $derived.by(() => {
    if (cosigners.length === requiredKeys) return errors.map(signerLanguage);
    const countErrors = new Set([
      'Add at least 3 signers.',
      'The threshold cannot exceed the number of signers.',
      translate($locale, '{subject} needs exactly {count} signers.', {
        subject: translate($locale, templateKind === 'standard' ? 'This wallet' : 'This template'),
        count: requiredKeys
      })
    ]);
    const remaining = requiredKeys - cosigners.length;
    const countGuidance =
      remaining > 0
        ? translate(
            $locale,
            remaining === 1 ? 'Add {count} more signer.' : 'Add {count} more signers.',
            {
              count: remaining
            }
          )
        : translate(
            $locale,
            remaining === -1 ? 'Remove {count} signer.' : 'Remove {count} signers.',
            {
              count: Math.abs(remaining)
            }
          );
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
        availableAfterBlocks: templateKind === 'inheritance' ? 52_560 : recoveryDelayBlocks
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
      recoveryDelayBlocks,
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
    return localizedError(
      cause,
      $locale,
      'Groot could not save this setup. It will retry automatically.'
    );
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
        availableAfterBlocks:
          draft.templateKind === 'inheritance'
            ? (draft.recoveryDelayBlocks ?? 52_560)
            : (draft.recoveryDelayBlocks ?? 4_320)
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
    recoveryDelayBlocks =
      draft.templateKind === 'inheritance'
        ? (draft.recoveryDelayBlocks ?? 52_560)
        : (draft.recoveryDelayBlocks ?? 4_320);
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
      discardDraftError = localizedError(cause, $locale, 'The saved setup could not be discarded.');
    } finally {
      discardingDraft = false;
    }
  }

  onMount(async () => {
    try {
      networkSetupSource =
        (await walletService.networkSetupSources()).find((source) => source.ready) ?? null;
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
          description: translate($locale, 'Returned to {stage}.', {
            stage: translate(
              $locale,
              draft.stage === 'keys'
                ? 'Signers'
                : draft.stage === 'review'
                  ? 'Verify'
                  : draft.stage === 'backup'
                    ? 'Back up'
                    : 'Policy'
            )
          }),
          tone: 'success'
        });
      }
    } catch (cause) {
      hasDraft = true;
      draftSaveError = localizedError(cause, $locale, 'Saved setup progress could not be loaded.');
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
    return translate(
      $locale,
      value.replaceAll('cosigners', 'signers').replaceAll('cosigner', 'signer')
    );
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
      return translate(
        $locale,
        'This signer is already added as “{label}” (fingerprint {fingerprint}).',
        {
          label: duplicate.cosigner.label,
          fingerprint: duplicate.cosigner.fingerprint.toLowerCase()
        }
      );
    }
    if (duplicate.match === 'fingerprint') {
      return translate($locale, 'Fingerprint {fingerprint} is already used by “{label}”.', {
        fingerprint: candidate.fingerprint.trim().toLowerCase(),
        label: duplicate.cosigner.label
      });
    }
    return translate($locale, 'This account xpub is already used by “{label}”.', {
      label: duplicate.cosigner.label
    });
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
        description: translate($locale, '{signerName} was loaded from a local file.', {
          signerName: imported.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      pickerErrorTitle =
        cause instanceof PublicCosignerImportError
          ? 'Could not import this signer'
          : 'Could not read this file';
      pickerError = localizedError(cause, $locale, 'The public-key file could not be read.');
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
      description: translate($locale, '{signerName} was removed from this unfinished wallet.', {
        signerName: removedLabel
      }),
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
      description: translate($locale, 'This signer is now “{label}”.', { label: normalized }),
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
        description: translate($locale, '{signerName} matches this wallet.', {
          signerName: signer.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      const summary = localizedError(cause, $locale, 'The device could not be verified.');
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
        error = localizedError(cause, $locale, 'Could not scan for devices.');
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
      title: translate($locale, '{label} descriptor copied', { label: translate($locale, label) }),
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
            description: localizedError(cause, $locale),
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
      backupError = localizedError(cause, $locale, 'Could not save the descriptor backup.');
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
      backupError = localizedError(cause, $locale, 'Could not save the Coldcard policy.');
      toast({ title: 'Coldcard policy not saved', description: backupError, tone: 'danger' });
    } finally {
      savingDescriptor = false;
    }
  }

  async function importHardware(device: HardwareDevice, allowEmptyPassphrase = false) {
    const profile = policyRegistrationProfile(device);
    if (!profile.supported && profile.registration === 'unsupported') {
      error = translate(
        $locale,
        "{device} is not supported by Groot's pinned HWI release and has not completed physical certification.",
        {
          device: profile.name
        }
      );
      return;
    }
    const deviceLabel = label.trim() || device.label;
    hardwareBusy = true;
    hardwareProgress = device.model.startsWith('ledger')
      ? 'Reading the multisig account key from Ledger…'
      : device.model === 'bitbox02'
        ? 'Reading the public key from BitBox02…'
        : translate($locale, 'Reading the public key from {device}…', { device: device.label });
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
      error = localizedError(cause, $locale, 'Could not read the public key.');
    } finally {
      hardwareBusy = false;
    }
  }

  async function handleHardware(device: HardwareDevice) {
    if (device.action === 'import') return importHardware(device);
    if (device.action === 'unlock') return importHardware(device);
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
    pinChallenge = '';
    try {
      pinChallenge = await walletService.promptHardwarePin(device.id);
      pinDevice = device;
      pinPurpose = purpose;
      hardwareOpen = false;
      pinOpen = true;
    } catch (cause) {
      const message = localizedError(cause, $locale, 'Could not start the PIN matrix.');
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
          title: 'Hardware signer unlocked',
          description: 'Resuming the signer health check.',
          tone: 'success'
        });
        await runDraftHealthCheck();
      } else {
        toast({
          title: 'Hardware signer unlocked',
          description: 'Scanning again for its public fingerprint.',
          tone: 'success'
        });
        await scanHardware();
      }
    } catch (cause) {
      pinChallenge = '';
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      pinError = localizedError(cause, $locale, 'Trezor did not accept that matrix entry.');
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
      policyReviewError = localizedError(cause, $locale, 'Could not scan hardware devices.');
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
        description: translate(
          $locale,
          '{signerName} registered the policy and verified its first address.',
          {
            signerName: signerLabel
          }
        ),
        tone: 'success'
      });
    } catch (cause) {
      policyReviewError = localizedError(
        cause,
        $locale,
        'The wallet policy could not be verified.'
      );
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
      error = localizedError(cause, $locale, 'Could not build the descriptor.');
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
      await flushCurrentDraft();
      const networkSetupSourceWalletId =
        reuseNetworkSetup && networkSetupSource ? networkSetupSource.walletId : undefined;
      const creation = recoveryTemplate
        ? await walletService.createRecoveryMultisig(
            name,
            recoveryTemplate,
            cosigners,
            credential,
            networkSetupSourceWalletId
          )
        : await walletService.createMultisig(policy, credential, networkSetupSourceWalletId);
      hasDraft = false;
      toast({
        title: 'Multisig wallet created',
        description: creation.networkSetupCopied
          ? templateKind === 'standard'
            ? `${threshold} signatures are required to spend.`
            : '2 of 3 primary keys work now. The recovery key becomes available after the chosen wait.'
          : 'Network setup was not copied. Configure it in Settings.',
        tone: creation.networkSetupCopied ? 'success' : 'default'
      });
      await goto('/multisig');
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_corrupt') {
        createErrorTitle = 'Hardware verification needs attention';
        error =
          'Groot could not safely restore the saved verification. Open “Verify hardware signer policies” and verify the signer again.';
      } else {
        createErrorTitle = 'Wallet could not be created';
        error = localizedError(
          cause,
          $locale,
          'Try again. Your hardware-signer keys and saved descriptor are unchanged.'
        );
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
      <p class="eyebrow">{translate($locale, 'MULTISIG WALLET')}</p>
      <h1>{translate($locale, 'Create a multisig wallet')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          stage === 'policy' && policyStep === 'choose'
            ? 'Set the spending rules.'
            : stage === 'policy'
              ? 'Name and configure the policy before adding signers.'
              : 'Add independent signers, verify the policy, and back it up.'
        )}
      </p>
    </div>
    <div class="page-header-actions">
      {#if hasDraft}<Button
          variant="ghost-danger"
          size="small"
          onclick={() => {
            discardDraftError = '';
            discardDraftOpen = true;
          }}><Trash2 size={14} />{translate($locale, 'Discard setup')}</Button
        >{/if}{#if stage === 'policy'}<a
          class="secondary-link"
          href="/multisig/recover"
          aria-label={translate($locale, 'Recover from backup')}
          ><FileUp size={15} />{translate($locale, 'Recover')}</a
        >{/if}<span class="network-chip"
        >{networkName(defaultConfig.network)} · {translate($locale, 'Native SegWit')}</span
      >
    </div>
  </header>
  <SetupProgress
    steps={creationSteps.map((step) => translate($locale, step))}
    current={creationStep}
    label={translate($locale, 'Wallet creation progress')}
  />
  {#if draftSaveError}<div class="warning-box danger" role="alert">
      <AlertTriangle size={16} /><strong
        >{translate($locale, 'Setup progress could not be saved')}</strong
      ><span>{draftSaveError}</span>
    </div>{/if}

  {#if !draftReady}
    <section class="form-card">
      <HardwareActionPrompt
        title={translate($locale, 'Restoring multisig setup')}
        detail={translate($locale, 'Checking for saved public policy progress…')}
        label={translate($locale, 'Restoring multisig setup')}
      />
    </section>
  {:else if stage === 'policy'}
    <div class="coordinator-grid policy-only-grid">
      <section class="form-card coordinator-main policy-setup-card">
        {#if policyStep === 'choose'}
          <div class="section-heading compact policy-choice-heading">
            <div>
              <span class="setup-step">{translate($locale, 'POLICY · 1 OF 2')}</span>
              <h2>{translate($locale, 'Choose how this wallet spends')}</h2>
              <p>
                {translate($locale, 'Pick a plan. Review every key before creating the wallet.')}
              </p>
            </div>
          </div>
          <div
            class="template-grid policy-template-grid"
            aria-label={translate($locale, 'Wallet policies')}
          >
            <button
              class="policy-kind-card standard"
              class:active={templateKind === 'standard'}
              onclick={() => chooseTemplate('standard')}
              ><span class="policy-kind-icon"><Users size={21} /></span><span
                class="policy-kind-copy"
                ><strong>{translate($locale, 'Standard')}</strong><small
                  >{translate($locale, 'Your chosen threshold approves every payment.')}</small
                ></span
              ><span class="policy-kind-meta">{translate($locale, 'No delay')}</span
              >{#if templateKind === 'standard'}<span class="policy-kind-check" aria-hidden="true"
                  ><Check size={16} strokeWidth={3} /></span
                >{/if}</button
            >
            <button
              class="policy-kind-card recovery"
              class:active={templateKind === 'recovery'}
              onclick={() => chooseTemplate('recovery')}
              ><span class="policy-kind-icon"><ShieldCheck size={21} /></span><span
                class="policy-kind-copy"
                ><strong>{translate($locale, 'Recovery')}</strong><small
                  >{translate($locale, '2 of 3 now, or one backup key later.')}</small
                ></span
              ><span class="policy-kind-meta">{translate($locale, 'About one month')}</span
              >{#if templateKind === 'recovery'}<span class="policy-kind-check" aria-hidden="true"
                  ><Check size={16} strokeWidth={3} /></span
                >{/if}</button
            >
            <button
              class="policy-kind-card inheritance"
              type="button"
              disabled
              aria-describedby="assisted-recovery-description"
              ><span class="policy-kind-icon"><Clock3 size={21} /></span><span
                class="policy-kind-copy"
                ><strong>{translate($locale, 'Assisted recovery')}</strong><small
                  id="assisted-recovery-description"
                  >{translate(
                    $locale,
                    'A recovery partner helps you or your heirs regain access.'
                  )}</small
                ></span
              ><span class="policy-kind-meta">{translate($locale, 'Coming soon')}</span></button
            >
          </div>
          <div class="policy-choice-insight">
            <span>{translate($locale, 'About this plan')}</span><InsightTip
              label={translate(
                $locale,
                templateKind === 'standard'
                  ? 'How Standard multisig works'
                  : templateKind === 'recovery'
                    ? 'How Recovery works'
                    : 'How assisted recovery works'
              )}
              text={translate(
                $locale,
                templateKind === 'standard'
                  ? 'Standard 2-of-3 can also support assisted signing: the owners keep two keys and a trusted helper keeps one. Either owner plus the helper can sign, or the two owner keys can sign together. The helper can never spend alone.'
                  : templateKind === 'recovery'
                    ? 'The recovery key is a separate spending path. After each coin has aged 4,320 blocks, that key can spend the matured coin alone. Every new deposit starts its own delay.'
                    : 'Assisted recovery will combine your keys with a dedicated recovery service and guided beneficiary support. It is not available yet.'
              )}
            />
          </div>
          <div class="coordinator-actions">
            <Button variant="secondary" href="/settings"
              ><ArrowLeft size={16} />{translate($locale, 'Cancel')}</Button
            ><Button onclick={continueToPolicyConfiguration}
              >{translate($locale, 'Continue')}<ChevronRight size={16} /></Button
            >
          </div>
        {:else}
          <button class="back-link" onclick={returnToPolicyChoice}
            ><ArrowLeft size={16} />{translate($locale, 'Policy options')}</button
          >
          <div class="section-heading compact policy-configure-heading">
            <div>
              <span class="setup-step">{translate($locale, 'POLICY · 2 OF 2')}</span>
              <h2>
                {translate(
                  $locale,
                  templateKind === 'standard'
                    ? 'Standard multisig'
                    : templateKind === 'recovery'
                      ? 'Recovery wallet'
                      : 'Inheritance wallet'
                )}
              </h2>
              <p>
                {translate(
                  $locale,
                  templateKind === 'standard'
                    ? 'Name the wallet and choose its signature threshold.'
                    : templateKind === 'recovery'
                      ? 'Three primary keys. One backup recovery key.'
                      : 'Three primary keys. One delayed heir key.'
                )}
              </p>
            </div>
            <span class="policy-pill"
              >{translate(
                $locale,
                templateKind === 'standard'
                  ? `${threshold} of ${requiredKeys}`
                  : '2 of 3 + backup key'
              )}</span
            >
          </div>
          <label class="field"
            ><span>{translate($locale, 'Wallet name')}</span><input
              bind:value={name}
              maxlength="48"
              placeholder={translate($locale, 'e.g. Family wallet')}
            /><FieldCounter value={name} max={48} /></label
          >
          {#if templateKind === 'standard'}
            <div
              class="policy-recipes"
              aria-label={translate($locale, 'Standard multisig recipes')}
            >
              <button
                class:active={standardRecipe === '2of3'}
                onclick={() => applyStandardRecipe('2of3')}
                ><span
                  ><strong>2 of 3</strong><small
                    >{translate($locale, 'One key can be unavailable')}</small
                  ></span
                ><em>{translate($locale, 'Balanced')}</em></button
              >
              <button
                class:active={standardRecipe === '3of5'}
                onclick={() => applyStandardRecipe('3of5')}
                ><span
                  ><strong>3 of 5</strong><small
                    >{translate($locale, 'Two keys can be unavailable')}</small
                  ></span
                ><em>{translate($locale, 'Larger group')}</em></button
              >
              <button
                class:active={standardRecipe === 'custom'}
                onclick={() => applyStandardRecipe('custom')}
                ><span
                  ><strong>{translate($locale, 'Custom')}</strong><small
                    >{translate($locale, 'Choose your own threshold')}</small
                  ></span
                ><em>{translate($locale, 'Advanced')}</em></button
              >
            </div>
            {#if standardRecipe === '2of3'}<div class="assisted-signing-plan">
                <Users size={16} /><span
                  ><strong>{translate($locale, 'Assisted signing')}</strong><small
                    >{translate(
                      $locale,
                      'Two owner keys + one helper key. Any two sign; the helper never signs alone.'
                    )}</small
                  ></span
                ><InsightTip
                  label={translate($locale, 'About assisted signing')}
                  text={translate(
                    $locale,
                    'This uses the same standard 2-of-3 policy. Keep the two owner keys independent. A trusted helper can co-sign with either owner, while the owners can always sign together without the helper.'
                  )}
                />
              </div>{/if}
            {#if standardRecipe === 'custom'}<div class="threshold-row custom-threshold">
                <label class="field"
                  ><span>{translate($locale, 'Signatures required (M)')}</span><select
                    aria-label={translate($locale, 'Signatures required')}
                    value={threshold}
                    onchange={(event) => (threshold = Number(event.currentTarget.value))}
                    >{#each Array(customCosignerCount - 1) as _, i}<option value={i + 2}
                        >{i + 2}</option
                      >{/each}</select
                  ></label
                >
                <label class="field"
                  ><span>{translate($locale, 'Total signers (N)')}</span><select
                    aria-label={translate($locale, 'Total signers')}
                    value={customCosignerCount}
                    onchange={(event) => setCustomCosignerCount(Number(event.currentTarget.value))}
                    >{#each Array(5) as _, i}<option value={i + 3}>{i + 3}</option>{/each}</select
                  ></label
                >
              </div>
              <p class="policy-guidance">
                {translate($locale, 'Multisig requires at least two signatures.')}
              </p>
            {/if}
          {:else}<div class="path-visual">
              <span
                ><b>{translate($locale, 'TODAY')}</b><strong
                  >{translate($locale, '2 of 3 primary keys')}</strong
                ></span
              ><i></i><span
                ><b
                  >{translate(
                    $locale,
                    templateKind === 'inheritance'
                      ? 'ABOUT 1 YEAR'
                      : recoveryDelayBlocks === 4_320
                        ? 'ABOUT 1 MONTH'
                        : recoveryDelayBlocks === 13_140
                          ? 'ABOUT 3 MONTHS'
                          : 'ABOUT 6 MONTHS'
                  )}</b
                ><span class="path-title"
                  ><strong
                    >{translate(
                      $locale,
                      templateKind === 'recovery' ? '1 recovery key' : '1 heir key'
                    )}</strong
                  ><InsightTip
                    label={translate(
                      $locale,
                      templateKind === 'recovery'
                        ? 'Recovery key spending authority'
                        : 'Heir key spending authority'
                    )}
                    text={translate(
                      $locale,
                      templateKind === 'recovery'
                        ? 'After the chosen wait, the recovery key can spend that coin by itself. The normal 2-of-3 keys remain available.'
                        : 'After a coin has aged 52,560 blocks, the heir key can spend that matured coin by itself. It does not need either of the normal 2-of-3 signatures.'
                    )}
                  /></span
                ><small
                  >{formatInteger(
                    templateKind === 'recovery' ? recoveryDelayBlocks : 52_560,
                    $locale
                  )}
                  {translate($locale, 'blocks')}</small
                ></span
              >
            </div>
            {#if templateKind === 'recovery'}
              <div
                class="policy-recipes recovery-delay-options"
                role="group"
                aria-labelledby="recovery-delay-title"
              >
                <p id="recovery-delay-title" class="recovery-delay-title">
                  {translate($locale, 'Recovery key wait')}
                </p>
                {#each [{ blocks: 4_320, label: 'About 1 month', note: 'Recommended' }, { blocks: 13_140, label: 'About 3 months', note: 'More time' }, { blocks: 26_280, label: 'About 6 months', note: 'Longest' }] as option}
                  <button
                    type="button"
                    class:active={recoveryDelayBlocks === option.blocks}
                    onclick={() => (recoveryDelayBlocks = option.blocks)}
                  >
                    <span
                      ><strong>{translate($locale, option.label)}</strong><small
                        >{formatInteger(option.blocks, $locale)}
                        {translate($locale, 'blocks')}</small
                      ></span
                    ><em>{translate($locale, option.note)}</em>
                  </button>
                {/each}
              </div>
            {/if}
            <p class="policy-delay-note">
              <Clock3 size={14} />{translate(
                $locale,
                'The wait starts separately for each received coin.'
              )}
            </p>
            <div class="recovery-separation">
              <ShieldCheck size={15} /><span
                ><strong>{translate($locale, 'Four separate keys')}</strong><small
                  >{translate(
                    $locale,
                    'The backup key stays separate from the primary 2-of-3.'
                  )}</small
                ></span
              >
            </div>{/if}
          {#if error}<p class="form-error">{error}</p>{/if}
          <div class="coordinator-actions">
            <Button variant="secondary" onclick={returnToPolicyChoice}
              ><ArrowLeft size={16} />{translate($locale, 'Back')}</Button
            ><Button onclick={continueToCosigners}
              >{translate($locale, 'Continue to signers')}<ChevronRight size={16} /></Button
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
            <span class="setup-step">{translate($locale, 'SIGNERS')}</span>
            <h2>
              {translate($locale, 'Add')}
              {requiredKeys}
              {translate($locale, 'independent keys')}
            </h2>
            <p>
              {name.trim()} · {translate(
                $locale,
                templateKind === 'standard'
                  ? `${threshold} of ${requiredKeys}`
                  : '2 of 3 + recovery'
              )}
            </p>
          </div>
          <Button
            variant="secondary"
            size="small"
            disabled={cosigners.length >= requiredKeys}
            onclick={() => (pickerOpen = true)}
            ><Plus size={15} />{translate(
              $locale,
              cosigners.length >= requiredKeys ? 'All added' : 'Add a signer'
            )}</Button
          >
        </div>
        <div class="cosigner-list">
          {#each cosigners as signer, i}
            <article class="cosigner-card">
              <button
                class="draft-cosigner-trigger"
                aria-label={translate($locale, 'View {signer} details', { signer: signer.label })}
                onclick={() => (selectedSigner = signer)}
              >
                <span class="device-number" aria-hidden="true">{i + 1}</span>
                <span class="cosigner-card-body">
                  <strong class="cosigner-name">{signer.label}</strong>
                  <span class="cosigner-metadata">
                    {#if templateKind !== 'standard'}<span
                        ><small>{translate($locale, 'Policy role')}</small><span
                          class="source-badge"
                          >{translate(
                            $locale,
                            i === 3
                              ? templateKind === 'inheritance'
                                ? 'Heir-only signer'
                                : 'Recovery-only signer'
                              : 'Primary signer'
                          )}</span
                        ></span
                      >{/if}
                    <span
                      ><small>{translate($locale, 'Device fingerprint')}</small><code
                        >{signer.fingerprint.toLowerCase()}</code
                      ></span
                    >
                    <span
                      ><small>{translate($locale, sourceHeading(signer.source))}</small><span
                        class="source-badge">{translate($locale, sourceLabel(signer.source))}</span
                      ></span
                    >
                    <span class="cosigner-public-key"
                      ><small>{translate($locale, 'Public account key (xpub)')}</small><code
                        >{signer.xpub}</code
                      ></span
                    >
                  </span>
                </span>
                <ChevronRight class="draft-row-chevron" size={16} />
              </button>
              <button
                class="remove-cosigner"
                aria-label={translate($locale, 'Remove {signer}', { signer: signer.label })}
                title={translate($locale, 'Remove signer')}
                onclick={() => (signerPendingRemoval = signer)}><Trash2 size={16} /></button
              >
            </article>
          {:else}
            <div class="keys-empty">
              <FileKey size={22} /><strong>{translate($locale, 'No signers yet')}</strong><span
                >{translate($locale, 'Add')}
                {requiredKeys}
                {translate($locale, 'independent keys for this template.')}</span
              >
            </div>
          {/each}
        </div>
        {#if cosigners.length > 0}<p class="cosigner-progress" aria-live="polite">
            {cosigners.length} of {requiredKeys}
            {translate($locale, 'signers added')}
          </p>{/if}
        {#if reviewAttempted && visibleErrors.length}<div class="policy-errors" aria-live="polite">
            {#each visibleErrors as item}<p>{translate($locale, item)}</p>{/each}
          </div>{/if}
        {#if error}<p class="form-error">{error}</p>{/if}
        <div class="coordinator-actions">
          <Button
            variant="secondary"
            onclick={() => {
              error = '';
              policyStep = 'configure';
              stage = 'policy';
            }}><ArrowLeft size={16} />{translate($locale, 'Back to policy')}</Button
          ><Button
            loading={busy}
            loadingLabel={translate($locale, 'Building policy…')}
            onclick={review}>{translate($locale, 'Review wallet')}<ChevronRight size={16} /></Button
          >
        </div>
      </section>
      <aside class="safety-panel">
        <ShieldCheck size={22} />
        <h2>{translate($locale, 'Before you continue')}</h2>
        <p>
          {translate(
            $locale,
            'Groot stores public descriptors only. It cannot spend without enough signatures.'
          )}
        </p>
        <ul>
          <li>{translate($locale, 'Back up the wallet descriptor.')}</li>
          <li>{translate($locale, 'Verify each fingerprint on its device.')}</li>
          <li>{translate($locale, 'Keep devices in separate places.')}</li>
        </ul>
        <button class="hardware-help-card" onclick={() => openHardwareHelp()}
          ><CircleHelp size={17} /><span
            ><strong>{translate($locale, 'Hardware setup help')}</strong><small
              >{translate($locale, 'Coldcard, BitBox02, Ledger, Trezor, Jade')}</small
            ></span
          ><ChevronRight size={14} /></button
        ><code>{MULTISIG_ACCOUNT_PATH}</code>
      </aside>
    </div>
  {:else if stage === 'review' && preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => (stage = 'keys')}
        ><ArrowLeft size={16} />{translate($locale, 'Edit keys')}</button
      >
      <span class="setup-step">{translate($locale, 'FINAL REVIEW')}</span>
      <h2>{preview.name}</h2>
      <p class="review-intro">
        {translate(
          $locale,
          'Confirm the policy and save the descriptor before creating this wallet.'
        )}
      </p>
      <div class="policy-summary">
        <strong
          >{translate(
            $locale,
            templateKind === 'standard'
              ? '{threshold} of {total} signatures'
              : '2 of 3 primary keys + recovery key later',
            { threshold, total: cosigners.length }
          )}</strong
        ><span
          >{translate(
            $locale,
            templateKind === 'standard' ? 'wsh · sortedmulti · BIP48' : 'wsh · Miniscript · BIP48'
          )}</span
        >
      </div>
      <div class="descriptor-toggle-row">
        <button
          class="descriptor-toggle"
          aria-expanded={showDescriptor}
          onclick={() => (showDescriptor = !showDescriptor)}
          >{translate($locale, 'Descriptor logic')}
          <ChevronDown size={14} class={showDescriptor ? 'rotated' : ''} /></button
        ><InsightTip
          label={translate($locale, 'About wallet descriptors')}
          text={translate(
            $locale,
            'A descriptor is a public, watch-only recipe that defines the signing policy and derives every receive and change address. It cannot spend bitcoin, but it reveals the wallet’s complete address history, so keep it private and back it up.'
          )}
        />
      </div>
      {#if showDescriptor}<div
          class="descriptor-block descriptor-viewer"
          data-testid="descriptor-preview"
        >
          {#if combinedDescriptor}<section class="descriptor-primary">
              <div>
                <span>{translate($locale, 'Portable wallet descriptor')}</span><small
                  >{translate(
                    $locale,
                    'Standard multipath form: branch 0 receives, branch 1 creates change.'
                  )}</small
                >
              </div>
              <code>{combinedDescriptor}</code><button
                aria-label={translate($locale, 'Copy wallet descriptor')}
                onclick={() => copyDescriptor(combinedDescriptor!, 'Wallet')}
                ><Copy size={14} />{translate($locale, 'Copy wallet descriptor')}</button
              >
            </section>
            <details>
              <summary>{translate($locale, 'View separate receive and change descriptors')}</summary
              >
              <section>
                <div>
                  <span>{translate($locale, 'Receive descriptor')}</span><small
                    >{translate(
                      $locale,
                      'Generates addresses shared for incoming payments.'
                    )}</small
                  >
                </div>
                <code>{preview.externalDescriptor}</code><button
                  aria-label={translate($locale, 'Copy receive descriptor')}
                  onclick={() => copyDescriptor(preview!.externalDescriptor, 'Receive')}
                  ><Copy size={14} />{translate($locale, 'Copy receive descriptor')}</button
                >
              </section>
              <section>
                <div>
                  <span>{translate($locale, 'Change descriptor')}</span><small
                    >{translate(
                      $locale,
                      'Generates private change addresses after spending.'
                    )}</small
                  >
                </div>
                <code>{preview.internalDescriptor}</code><button
                  aria-label={translate($locale, 'Copy change descriptor')}
                  onclick={() => copyDescriptor(preview!.internalDescriptor, 'Change')}
                  ><Copy size={14} />{translate($locale, 'Copy change descriptor')}</button
                >
              </section>
            </details>
          {:else}<section>
              <div>
                <span>{translate($locale, 'Receive descriptor')}</span><small
                  >{translate($locale, 'Generates addresses shared for incoming payments.')}</small
                >
              </div>
              <code>{preview.externalDescriptor}</code><button
                aria-label={translate($locale, 'Copy receive descriptor')}
                onclick={() => copyDescriptor(preview!.externalDescriptor, 'Receive')}
                ><Copy size={14} />{translate($locale, 'Copy receive descriptor')}</button
              >
            </section>
            <section>
              <div>
                <span>{translate($locale, 'Change descriptor')}</span><small
                  >{translate($locale, 'Generates private change addresses after spending.')}</small
                >
              </div>
              <code>{preview.internalDescriptor}</code><button
                aria-label={translate($locale, 'Copy change descriptor')}
                onclick={() => copyDescriptor(preview!.internalDescriptor, 'Change')}
                ><Copy size={14} />{translate($locale, 'Copy change descriptor')}</button
              >
            </section>{/if}
          {#if recoveryTemplate?.type === 'recovery'}<span>{translate($locale, 'Spend paths')}</span
            ><code
              >{translate($locale, '2 of first 3 now · 1 recovery key after')}
              {formatInteger(recoveryTemplate.recovery.availableAfterBlocks, $locale)}
              {translate($locale, 'blocks')}</code
            >{/if}
          <p>
            <ShieldCheck size={14} />{translate(
              $locale,
              'Keep descriptors private even though they cannot spend. They\n            reveal every address in this wallet.'
            )}
          </p>
          <button
            class="descriptor-download"
            disabled={savingDescriptor}
            onclick={saveDescriptorDraft}
            ><Download size={14} />{translate(
              $locale,
              savingDescriptor ? 'Opening save dialog…' : 'Save public descriptor text'
            )}</button
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
          ><ArrowLeft size={16} />{translate($locale, 'Back to signers')}</Button
        ><Button onclick={() => (stage = 'backup')}
          >{translate($locale, 'Continue to backup')}<ChevronRight size={16} /></Button
        >
      </div>
    </section>
  {:else if stage === 'backup' && preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => (stage = 'review')}
        ><ArrowLeft size={16} />{translate($locale, 'Back to verification')}</button
      >
      <span class="setup-step">{translate($locale, 'BACK UP')}</span>
      <h2>{translate($locale, 'Protect')} {preview.name}</h2>
      <p class="review-intro">
        {translate($locale, 'Complete each section before creating this coordinator.')}
      </p>
      <div class="policy-summary">
        <strong
          >{translate(
            $locale,
            templateKind === 'standard'
              ? '{threshold} of {total} signatures'
              : '2 of 3 primary keys + recovery key later',
            { threshold, total: cosigners.length }
          )}</strong
        ><span
          >{translate(
            $locale,
            templateKind === 'standard' ? 'wsh · sortedmulti · BIP48' : 'wsh · Miniscript · BIP48'
          )}</span
        >
      </div>
      <div class="backup-setup-sections">
        <SetupTask
          step={1}
          title={translate($locale, 'Save the wallet descriptor')}
          description={translate(
            $locale,
            'This public backup recovers every wallet address and coordinates signatures. It cannot spend, but it reveals wallet activity.'
          )}
          state={saved ? 'complete' : 'current'}
          status={saved ? 'Saved' : 'Current step'}
        >
          <Button
            variant="secondary"
            class="full"
            disabled={savingDescriptor}
            loading={savingDescriptor}
            loadingLabel={translate($locale, 'Opening save dialog…')}
            onclick={saveDescriptorDraft}
            ><Download size={14} />{translate(
              $locale,
              saved ? 'Save another copy' : 'Save public descriptor text'
            )}</Button
          >
          {#if backupError}<p class="form-error" role="alert">{backupError}</p>{/if}
        </SetupTask>
        {#if coldcardRegistrationRequired}<SetupTask
            step={coldcardStep}
            title={translate($locale, 'Register the policy on Coldcard')}
            description={translate(
              $locale,
              'Recommended now, but optional during coordinator creation. Coldcard must know the complete policy before it signs.'
            )}
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
              <li>{translate($locale, 'Save the policy to microSD or Coldcard Virtual Disk.')}</li>
              <li>
                {translate($locale, 'On every Coldcard, import it from')}
                <b>{translate($locale, 'Settings → Multisig Wallets → Import')}</b>.
              </li>
              <li>
                {translate(
                  $locale,
                  'Verify the wallet name, 2-of-3 threshold, and all signer fingerprints on-device.'
                )}
              </li>
            </ol>
            <Button
              variant="secondary"
              class="full"
              disabled={!saved || savingDescriptor}
              loading={savingDescriptor}
              loadingLabel={translate($locale, 'Opening save dialog…')}
              onclick={saveColdcardPolicy}
              ><Download size={14} />{translate($locale, 'Save Coldcard policy')}</Button
            >
            <label class="backup-confirmation"
              ><input type="checkbox" disabled={!saved} bind:checked={coldcardRegistered} /><span
                ><strong>{translate($locale, 'Policy verified on every Coldcard')}</strong><small
                  >{translate(
                    $locale,
                    'I matched the wallet name, threshold, and signer fingerprints on each device.'
                  )}</small
                ></span
              ></label
            >
            {#if !coldcardRegistered && !policyVerificationDeferred}<button
                class="defer-policy-verification"
                disabled={!saved}
                onclick={() => (policyVerificationDeferred = true)}
                ><Clock3 size={14} /><span
                  ><strong
                    >{translate($locale, 'Finish hardware setup before first signature')}</strong
                  ><small
                    >{translate(
                      $locale,
                      'Create the watch-only coordinator now. Groot will stop an unregistered Coldcard\n                    before transaction signing.'
                    )}</small
                  ></span
                ></button
              >{/if}
          </SetupTask>{/if}
        {#if interactivePolicySigners.length}<SetupTask
            step={interactivePolicyStep}
            title={translate($locale, 'Verify hardware signer policies')}
            description={translate(
              $locale,
              'Recommended now, but optional during coordinator creation. Register the policy and prove its first receive address before first use.'
            )}
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
                      >{translate(
                        $locale,
                        verification
                          ? `Policy and first address verified on ${policyDeviceName(policyReadinessKind(signer))}`
                          : policyRegistrationProfile(signer).creationCopy
                      )}</small
                    >
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={!saved || (coldcardRegistrationRequired && !coldcardRegistered)}
                    onclick={() => openDraftPolicyVerification(signer)}
                    >{translate($locale, verification ? 'Verify again' : 'Verify policy')}</Button
                  >
                </article>{/each}
            </div>
            {#if !interactivePoliciesComplete && !policyVerificationDeferred && (!coldcardRegistrationRequired || coldcardRegistered)}<button
                class="defer-policy-verification"
                disabled={!saved}
                onclick={() => (policyVerificationDeferred = true)}
                ><Clock3 size={14} /><span
                  ><strong
                    >{translate($locale, 'Finish hardware setup before first signature')}</strong
                  ><small
                    >{translate(
                      $locale,
                      'Create the watch-only coordinator now. Groot will block each unverified signer\n                    before transaction signing.'
                    )}</small
                  ></span
                ></button
              >{/if}
          </SetupTask>{/if}
        <SetupTask
          step={pinStep}
          title={translate($locale, 'Set the coordinator PIN')}
          description={translate(
            $locale,
            'This PIN protects local Groot data. It is separate from every hardware-signer credential.'
          )}
          state={pinAvailable ? 'current' : 'upcoming'}
          status={pinAvailable ? 'Current step' : 'Available after earlier steps'}
        >
          <div class="credential-grid">
            <PasswordField
              label={translate($locale, 'App PIN')}
              inputLabel="App PIN"
              bind:value={credential}
              placeholder={translate($locale, 'Unlock this coordinator')}
              autocomplete="new-password"
              disabled={!pinAvailable}
            /><PasswordField
              label={translate($locale, 'Confirm app PIN')}
              inputLabel="Confirm app PIN"
              bind:value={confirmation}
              placeholder={translate($locale, 'Enter it again')}
              autocomplete="new-password"
              disabled={!pinAvailable}
            />
          </div>
          {#if credential && confirmation && credential !== confirmation}<p class="form-error">
              {translate($locale, 'PINs do not match.')}
            </p>{/if}
          {#if networkSetupSource}<label class="credential-warning credential-ack"
              ><input type="checkbox" bind:checked={reuseNetworkSetup} /><Network size={16} />
              <p>
                <strong
                  >{translate($locale, 'Use')}
                  {networkSetupSource.walletName}{translate($locale, '’s network setup.')}</strong
                ><span
                  >{translate(
                    $locale,
                    'Copies its node and sync method. This wallet protects its own copy.'
                  )}</span
                >
              </p></label
            >{/if}
        </SetupTask>
      </div>
      {#if error}<div class="hardware-inline-error hardware-create-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{translate($locale, createErrorTitle || 'Wallet could not be created')}</strong
            ><small>{error}</small></span
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
        loadingLabel={translate($locale, 'Creating wallet…')}
        onclick={create}>{translate($locale, 'Create wallet')}</Button
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
  title={translate($locale, 'Remove signer?')}
  description={translate(
    $locale,
    signerPendingRemoval ? `Remove ${signerPendingRemoval.label} from this unfinished wallet?` : ''
  )}
  onclose={() => (signerPendingRemoval = null)}
>
  {#if signerPendingRemoval}
    <div class="warning-box">
      <AlertTriangle size={17} /><strong
        >{translate($locale, 'You will need to add this signer again.')}</strong
      ><span>{translate($locale, 'Its hardware signer and seed are not changed.')}</span>
    </div>
    <div class="modal-footer">
      <Button variant="secondary" onclick={() => (signerPendingRemoval = null)}
        >{translate($locale, 'Keep signer')}</Button
      ><Button variant="danger" onclick={confirmCosignerRemoval}
        >{translate($locale, 'Remove signer')}</Button
      >
    </div>
  {/if}
</Modal>

<Modal
  open={pickerOpen}
  title={translate($locale, 'Add a signer')}
  description={translate($locale, 'Choose how to import this signer’s public account key.')}
  onclose={closeSignerPicker}
>
  <div class="source-list">
    {#if templateKind === 'standard'}<button onclick={scanHardware}
        ><Cpu size={18} /><span
          ><strong>{translate($locale, 'Connect hardware device')}</strong><small
            >{translate($locale, 'Desktop · Bitcoin Core HWI')}</small
          ></span
        ><ChevronRight size={15} /></button
      >{:else}<div class="warning-box" role="note">
        <AlertTriangle size={17} /><strong
          >{translate(
            $locale,
            'USB hardware signing is not available for delayed policies yet.'
          )}</strong
        ><span
          >{translate(
            $locale,
            'Groot’s pinned HWI release supports standard multisig only. Add public keys by file or manual entry and use the offline PSBT workflow.'
          )}</span
        >
      </div>{/if}
    <label class="source-button"
      ><FileUp size={18} /><span
        ><strong>{translate($locale, 'Import public-key file')}</strong><small
          >{translate($locale, 'Coldcard XPUB JSON or Groot signer JSON · 256 KiB maximum')}</small
        ></span
      ><ChevronRight size={15} /><input
        aria-label={translate($locale, 'Public signer file')}
        type="file"
        accept=".json,application/json"
        onchange={importCosignerFile}
      /></label
    >
    <button onclick={() => chooseSource('manual')}
      ><FileKey size={18} /><span
        ><strong>{translate($locale, 'Enter public key')}</strong><small
          >{translate($locale, 'Paste an account xpub and fingerprint')}</small
        ></span
      ><ChevronRight size={15} /></button
    >
  </div>
  {#if pickerError}<div class="import-error" role="alert" aria-live="polite">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, pickerErrorTitle)}</strong><b>{pickerError}</b><small
          >{translate($locale, pickerErrorGuidance)}</small
        ></span
      >
    </div>{/if}
</Modal>
<Modal
  open={policyReviewOpen}
  title={translate($locale, 'Verify wallet policy')}
  description={translate($locale, 'Check the policy, signer keys, and first address.')}
  onclose={closeDraftPolicyVerification}
>
  {#if policyReviewBusy && !policyDevice}<HardwareActionPrompt
      title={translate($locale, 'Looking for the saved signer')}
      detail={translate(
        $locale,
        'Keep the saved signer connected and unlocked while Groot checks its account key.'
      )}
      label={translate($locale, 'Signer scan in progress')}
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
      <Cpu size={20} /><strong>{translate($locale, 'Saved signer not found')}</strong><span
        >{translate(
          $locale,
          policyReviewError || `Connect and unlock ${policySigner.label}, then scan again.`
        )}</span
      ><Button variant="secondary" onclick={() => openDraftPolicyVerification(policySigner!)}
        >{translate($locale, 'Scan again')}</Button
      >
    </div>{/if}
</Modal>

<Modal
  open={hardwareOpen}
  title={translate($locale, 'Connect hardware device')}
  description={translate($locale, 'Connect one signer. Groot verifies it before adding it.')}
  onclose={closeHardwareScan}
>
  <div class="hardware-readiness">
    <Usb size={18} /><span
      ><strong>{translate($locale, 'Keep USB free')}</strong><small
        >{translate(
          $locale,
          'Unlock the signer and quit other wallet apps before scanning.'
        )}</small
      ></span
    ><button onclick={() => openHardwareHelp(true)}>{translate($locale, 'Device help')}</button>
  </div>
  <label class="field"
    ><span>{translate($locale, 'Signer label')}</span><input
      bind:value={label}
      placeholder={translate($locale, 'Defaults to device model')}
      maxlength="48"
    /><FieldCounter value={label} max={48} /></label
  >
  {#if hardwareBusy}<HardwareActionPrompt
      title={translate($locale, hardwareProgress)}
      detail={translate(
        $locale,
        hardwareProgress.includes('Ledger')
          ? 'Keep Bitcoin Test open for Regtest and confirm the export on the device screen.'
          : 'Keep the signer connected and unlocked.'
      )}
      label={translate($locale, 'Hardware signer setup in progress')}
    />
  {:else if hardware.length === 0}<div class="device-scan">
      <Cpu size={20} /><strong
        >{translate($locale, error ? 'Device needs attention' : 'No device found')}</strong
      ><span
        >{translate(
          $locale,
          error || 'Unlock the signer, quit other wallet apps, then scan again.'
        )}</span
      ><Button variant="secondary" size="small" onclick={scanHardware}
        >{translate($locale, 'Scan again')}</Button
      >
    </div>
  {:else}<div class="source-list hardware-device-list">
      {#each hardware as device}{@const addedSigner = addedSignerForDevice(device)}<button
          disabled={Boolean(addedSigner) || device.action === 'none'}
          onclick={() => handleHardware(device)}
          ><Cpu size={18} /><span
            ><strong>{translate($locale, addedSigner?.label ?? device.label)}</strong><small
              >{translate(
                $locale,
                addedSigner
                  ? `Fingerprint ${device.fingerprint} · Already added as ${addedSigner.label}.`
                  : device.fingerprint
                    ? `Fingerprint ${device.fingerprint} · ${device.message}`
                    : device.message
              )}</small
            ><em
              class:ready={!addedSigner && device.status === 'ready'}
              class:signed={Boolean(addedSigner)}
              >{translate(
                $locale,
                addedSigner
                  ? 'Already added'
                  : device.status === 'ready' || device.status === 'detected'
                    ? 'Ready'
                    : device.action === 'unlock'
                      ? 'Unlock & continue'
                      : device.status === 'needs_pin'
                        ? 'Unlock'
                        : device.action === 'confirm_empty_passphrase'
                          ? 'Choose wallet'
                          : device.action === 'retry'
                            ? 'Scan again'
                            : 'Unavailable'
              )}</em
            ></span
          >{#if !addedSigner && device.action !== 'none'}<ChevronRight size={15} />{/if}</button
        >{/each}<button class="hardware-rescan" onclick={scanHardware}
        ><RefreshCw size={16} /><span
          ><strong>{translate($locale, 'Scan again')}</strong><small
            >{translate($locale, 'Refresh connected signers.')}</small
          ></span
        ><ChevronRight size={15} /></button
      >
    </div>{/if}
  {#if error && hardware.length > 0}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Could not read the account key')}</strong><small
          >{error}</small
        ></span
      ><Button variant="secondary" size="small" onclick={scanHardware}
        >{translate($locale, 'Try again')}</Button
      >
    </div>{/if}
</Modal>

<Modal
  open={standardWalletOpen}
  title={translate($locale, 'Use Trezor standard wallet?')}
  description={translate(
    $locale,
    'Passphrase protection can expose several independent wallets from the same device.'
  )}
  onclose={() => {
    standardWalletOpen = false;
    standardWalletDevice = null;
    hardwareOpen = true;
  }}
>
  <div class="credential-warning">
    <ShieldCheck size={17} />
    <p>
      <strong>{translate($locale, 'No hardware passphrase for this signer')}</strong><span
        >{translate(
          $locale,
          'This imports the key derived from the device seed alone. It does not disable, change, or\n        reveal any hidden passphrase wallet you may use elsewhere.'
        )}</span
      >
    </p>
  </div>
  <p class="policy-guidance">
    {translate($locale, 'Choose this only if you intentionally want the Trezor')}
    <strong>{translate($locale, 'standard wallet')}</strong>
    {translate(
      $locale,
      'in this multisig\n    policy. Enabling or choosing a passphrase later opens a different hidden wallet; it does not change\n    this signer. The imported fingerprint is permanently bound to this policy.'
    )}
  </p>
  {#if hardwareBusy}<HardwareActionPrompt
      title={translate($locale, 'Importing the Trezor standard wallet')}
      detail={translate(
        $locale,
        'Keep Trezor connected while Groot reads its public BIP48 account key.'
      )}
      label={translate($locale, 'Hardware signer import in progress')}
    />{:else}<div class="modal-footer">
      <Button
        variant="secondary"
        onclick={() => {
          standardWalletOpen = false;
          standardWalletDevice = null;
          hardwareOpen = true;
        }}>{translate($locale, 'Back')}</Button
      ><Button
        disabled={!standardWalletDevice}
        onclick={() => {
          if (standardWalletDevice) importHardware(standardWalletDevice, true);
        }}>{translate($locale, 'Use standard wallet')}</Button
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
  title={translate($locale, 'Prepare your hardware signer')}
  description={translate($locale, 'Groot imports one public account key.')}
  onclose={closeHardwareHelp}
>
  <div class="hardware-guide">
    <div class="hardware-guide-tabs" aria-label={translate($locale, 'Hardware signer model')}>
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
      <strong>{translate($locale, 'Never enter a seed into Groot.')}</strong>
      {translate($locale, 'Initialize or restore only with trusted vendor tools.')}
    </p>
    <Button
      class="full"
      onclick={() => {
        hardwareHelpOpen = false;
        hardwareHelpReturnsToScan = false;
        scanHardware();
      }}>{translate($locale, 'Scan for devices')}</Button
    >
  </div>
</Modal>

<Modal
  open={keyOpen}
  title={translate($locale, 'Enter public signer key')}
  description={translate($locale, 'No private key or seed should ever be entered here.')}
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
      ><span>{translate($locale, 'Signer label')}</span><input
        aria-label={translate($locale, 'Signer label')}
        bind:value={label}
        placeholder={translate($locale, 'e.g. Coldcard')}
        maxlength="48"
      /><FieldCounter value={label} max={48} /></label
    >
    <label class="field"
      ><span>{translate($locale, 'Master fingerprint')}</span><input
        aria-label={translate($locale, 'Master fingerprint')}
        bind:value={fingerprint}
        placeholder={translate($locale, '8 hex characters')}
        maxlength="8"
      /></label
    >
    <label class="field"
      ><span>{translate($locale, 'Account xpub')}</span><textarea
        aria-label={translate($locale, 'Account xpub')}
        bind:value={xpub}
        rows="3"
        placeholder={translate($locale, defaultConfig.network === 'mainnet' ? 'xpub…' : 'tpub…')}
      ></textarea><small>{translate($locale, 'Derivation:')} {MULTISIG_ACCOUNT_PATH}</small></label
    >
    {#if keyError}<p class="form-error" role="alert">{keyError}</p>{/if}
    <div class="modal-footer">
      <Button variant="secondary" onclick={() => (keyOpen = false)}
        >{translate($locale, 'Cancel')}</Button
      ><Button
        type="submit"
        disabled={!label.trim() || !/^[0-9a-fA-F]{8}$/.test(fingerprint.trim()) || !xpub.trim()}
        >{translate($locale, 'Add key')}</Button
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
