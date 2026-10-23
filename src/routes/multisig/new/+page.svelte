<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
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
    Plus,
    RefreshCw,
    ShieldCheck,
    Smartphone,
    Trash2,
    Usb,
    Users
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { formatInteger, locale } from '$lib/i18n';
  import { defaultConfig, networkName } from '$lib/config';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import HardwareDeviceList from '$lib/components/HardwareDeviceList.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import DiscardMultisigSetupModal from '$lib/components/DiscardMultisigSetupModal.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import SetupTask from '$lib/components/SetupTask.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import SignerPolicyReview from '$lib/components/SignerPolicyReview.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { toast } from '$lib/stores/toasts';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { hardwareDeviceStateLabel, type HardwareWalletMembership } from '$lib/hardware/discovery';
  import {
    walletService,
    WalletError,
    type CosignerHealthCheck,
    type HardwareDevice,
    type MultisigPreview,
    type MultisigSetupDraft,
    type PolicyVerificationAddress,
    type RecoveryTemplate,
    type SavedFileResult,
    type SignerPolicyVerification,
    type WalletErrorCode
  } from '$lib/wallet';
  import type { PairingInvitation } from '$lib/wallet';
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
    multisigSetupRecoveryTemplate,
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
  const walletShell = useWalletShellContext();
  let existingWalletId = $state<string | null>(null);
  const ledgerAppName = defaultConfig.network === 'mainnet' ? 'Bitcoin' : 'Bitcoin Test';
  const hardwareGuides: Array<{
    id: HardwareGuideId;
    name: string;
    models: string[];
    steps: string[];
  }> = [
    {
      id: 'coldcard',
      name: 'Coldcard',
      models: ['Mk4'],
      steps: ['Sign in, enable USB, and leave the device at its main menu.']
    },
    {
      id: 'bitbox02',
      name: 'BitBox02',
      models: ['Bitcoin-only', 'Nova Bitcoin-only'],
      steps: ['Connect and unlock BitBox.', 'Quit BitBoxApp, then continue.']
    },
    {
      id: 'ledger',
      name: 'Ledger',
      models: ['Nano S Plus'],
      steps: [
        `Quit Ledger Live, unlock the device, and open ${ledgerAppName}.`,
        'Approve the public-key export on-device.'
      ]
    },
    {
      id: 'trezor',
      name: 'Trezor',
      models: ['Model One', 'Safe 3 Bitcoin-only'],
      steps: [
        'Quit Trezor Suite, connect, and unlock the device.',
        'For Model One, complete Groot’s PIN matrix.',
        'Choose the intended standard or hidden wallet.'
      ]
    },
    {
      id: 'jade',
      name: 'Blockstream Jade',
      models: ['Jade Classic'],
      steps: ['Connect Jade Classic and continue.', 'Enter its PIN on-device when prompted.']
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
  let copiedDescriptor = $state('');
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
  let mobilePairOpen = $state(false);
  let mobilePairScan = $state(false);
  let mobilePairBusy = $state(false);
  let mobilePairError = $state('');
  let mobilePairAccepted = $state(false);
  let mobileInvitation = $state<PairingInvitation | null>(null);
  let mobileResponseFrames = $state<string[]>([]);
  let mobileCandidate = $state<CosignerDraft | null>(null);
  let mobileSessionId = $state('');
  let mobileFinalFrames = $state<string[]>([]);
  let mobileFinalOpen = $state(false);
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
  let preview = $state<MultisigPreview | null>(null);
  let policyAddress = $state<PolicyVerificationAddress | null>(null);
  let busy = $state(false);
  let error = $state('');
  let templateKind = $state<MultisigSetupDraft['templateKind']>('standard');
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
  let createdWalletNeedsFinalPolicy = $state(false);
  let hardwareScanGeneration = 0;
  let queuedDraft: MultisigSetupDraft | null = null;
  let draftSaveRunning = false;
  let draftRetryTimer: number | null = null;
  let lastDraftFingerprint = '';
  const policy = $derived({ name, threshold, cosigners });
  const standardCosignerCount = $derived(
    standardRecipe === '2of3' ? 3 : standardRecipe === '3of5' ? 5 : customCosignerCount
  );
  const requiredKeys = $derived(
    templateKind === 'standard'
      ? standardCosignerCount
      : templateKind === 'partner_continuity_v1'
        ? 8
        : templateKind === 'family_continuity_v1'
          ? 7
          : 4
  );
  const hasGrootPhoneSigner = $derived(
    cosigners.some((signer) => signer.deviceType === 'groot-mobile')
  );
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
    return multisigSetupRecoveryTemplate(templateKind, cosigners, recoveryDelayBlocks);
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
    const restoredTemplate = multisigSetupRecoveryTemplate(
      draft.templateKind,
      draft.cosigners,
      draft.recoveryDelayBlocks
    );
    if (!restoredTemplate) return;
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
    if (draft.templateKind !== 'standard' && defaultConfig.network === 'mainnet') {
      stage = 'policy';
      policyStep = 'choose';
      error =
        'Timelocked policy creation is not available yet. Choose Standard or keep this setup for a future version.';
    }
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

  async function startMobilePairing() {
    if (hasGrootPhoneSigner) return;
    pickerOpen = false;
    mobilePairOpen = true;
    mobilePairBusy = true;
    mobilePairError = '';
    mobilePairAccepted = false;
    mobilePairScan = false;
    mobileResponseFrames = [];
    mobileCandidate = null;
    try {
      mobileInvitation = await walletService.createPairingInvitation(name, threshold, requiredKeys);
      mobileSessionId = mobileInvitation.sessionId;
    } catch (cause) {
      mobilePairError = localizedError(cause, $locale, 'Could not create a phone invitation.');
    } finally {
      mobilePairBusy = false;
    }
  }

  async function receiveMobileResponse(frame: string) {
    mobileResponseFrames = [...mobileResponseFrames, frame];
    try {
      mobileCandidate = await walletService.acceptMobileSigner(mobileResponseFrames);
      mobilePairError = '';
      return true;
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'qr_incomplete') return false;
      const message = localizedError(cause, $locale, 'Waiting for the complete phone response.');
      mobilePairError = message;
      throw cause;
    }
  }

  function confirmMobileSigner() {
    if (!mobileCandidate) return;
    if (!appendCosigner(mobileCandidate, (message) => (mobilePairError = message))) return;
    mobilePairAccepted = true;
    mobilePairScan = false;
    toast({
      title: 'Phone signer added',
      description: 'Continue on desktop. The phone waits for the completed wallet policy.',
      tone: 'success'
    });
  }

  function continueAfterMobileSigner() {
    mobilePairOpen = false;
    mobilePairAccepted = false;
  }

  async function cancelMobilePairing() {
    const session = mobileSessionId;
    mobilePairOpen = false;
    mobileInvitation = null;
    mobileCandidate = null;
    mobileSessionId = '';
    if (session) await walletService.cancelPairing(session).catch(() => {});
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

  function policyRole(index: number) {
    if (templateKind === 'partner_continuity_v1') {
      return index < 3 ? 'Owner signer' : index < 5 ? 'Partner signer' : 'Estate guardian';
    }
    if (templateKind === 'family_continuity_v1') {
      return index < 2
        ? 'Parent signer'
        : index < 4
          ? 'Child assistance role'
          : index < 6
            ? 'Child inheritance role'
            : 'Executor';
    }
    return index === 3
      ? templateKind === 'inheritance'
        ? 'Heir-only signer'
        : 'Recovery-only signer'
      : 'Primary signer';
  }

  function chooseTemplate(next: MultisigSetupDraft['templateKind']) {
    templateKind = next;
    if (next !== 'standard') threshold = 2;
    else applyStandardRecipe(standardRecipe);
    error = '';
  }

  function continueToPolicyConfiguration() {
    if (templateKind !== 'standard' && defaultConfig.network === 'mainnet') return;
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

  async function runDraftHealthCheck(unlockedDevice?: HardwareDevice) {
    if (!selectedSigner || checkingSigner) return;
    const signer = selectedSigner;
    checkingSigner = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = unlockedDevice ?? (await walletService.findSavedHardwareDevice(signer));
      const result = await walletService.checkHardwareCosigner(signer, device.id, true);
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
    void walletService.cancelHardwareOperations(true).catch((cause) => {
      const description = localizedError(cause, $locale, 'Could not stop the hardware scan.');
      error = description;
      toast({
        title: translate($locale, 'Could not stop hardware scan'),
        description,
        tone: 'danger'
      });
    });
  }

  async function copyDescriptor(value: string, label: 'Wallet' | 'Receive' | 'Change') {
    await copyText(value, 'public-wallet-data');
    copiedDescriptor = value;
    toast({
      title: translate($locale, '{label} descriptor copied', { label: translate($locale, label) }),
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
    setTimeout(() => {
      if (copiedDescriptor === value) copiedDescriptor = '';
    }, 1_500);
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
    try {
      if (!portable) throw new Error('The wallet descriptor could not be combined.');
      const content = `${portable}\n`;
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

  async function importHardware(
    device: HardwareDevice,
    allowEmptyPassphrase = false,
    pinResolved = false
  ) {
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
    if (templateKind !== 'standard') {
      error = translate($locale, 'USB hardware signing is not available for delayed policies yet.');
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
      const errorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      if (errorCode === 'hardware_wallet_selection_required' && pinResolved) {
        error = '';
        standardWalletDevice = {
          ...device,
          status: 'detected',
          action: 'import',
          message: 'Unlocked. Choose the standard wallet or a hidden wallet.'
        };
        hardwareOpen = false;
        standardWalletOpen = true;
        return;
      }
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
    hardwareBusy = true;
    pinBusy = true;
    error = '';
    pinError = '';
    pinErrorCode = '';
    pinPositions = '';
    pinChallenge = '';
    pinDevice = device;
    pinPurpose = purpose;
    hardwareOpen = false;
    pinOpen = true;
    try {
      const prompt = await walletService.promptHardwarePin(device.id);
      if (!prompt.pinRequired) {
        pinOpen = false;
        pinDevice = null;
        if (purpose === 'health') await runDraftHealthCheck(device);
        else await importHardware(device, false, true);
        return;
      }
      pinChallenge = prompt.challengeId ?? '';
    } catch (cause) {
      const message = localizedError(cause, $locale, 'Could not start the PIN matrix.');
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      pinError = message;
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
    const unlockedDevice = pinDevice;
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
        if (unlockedDevice) await runDraftHealthCheck(unlockedDevice);
        else await runDraftHealthCheck();
      } else {
        toast({
          title: 'Hardware signer unlocked',
          description: 'Reading its public account key now.',
          tone: 'success'
        });
        if (unlockedDevice) await importHardware(unlockedDevice, false, true);
        else await scanHardware();
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

  function openDraftPolicyVerification(signer: CosignerDraft) {
    policyLookupGeneration += 1;
    policySigner = signer;
    policyDevice = null;
    policyReviewError = '';
    policyReviewOpen = true;
    policyReviewBusy = false;
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
    if (!policySigner || policyReviewBusy) return;
    const signer = policySigner;
    const signerLabel = signer.label;
    const generation = ++policyLookupGeneration;
    policyDevice = null;
    policyReviewBusy = true;
    policyReviewError = '';
    try {
      // One fresh lookup per explicit attempt; Rust proves the complete identity.
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      if (generation !== policyLookupGeneration) return;
      policyDevice = device;
      const verification = await walletService.verifyMultisigDraftSignerPolicy(
        policy,
        policyDevice.id,
        signer.fingerprint
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
      if (generation !== policyLookupGeneration) return;
      policyReviewError = localizedError(
        cause,
        $locale,
        'The wallet policy could not be verified.'
      );
    } finally {
      if (generation === policyLookupGeneration) policyReviewBusy = false;
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
    if (templateKind !== 'standard' && defaultConfig.network === 'mainnet') return;
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
    existingWalletId = null;
    try {
      await flushCurrentDraft();
      if (recoveryTemplate) {
        await walletService.createRecoveryMultisig(name, recoveryTemplate, cosigners, credential);
      } else {
        await walletService.createMultisig(policy, credential);
      }
      hasDraft = false;
      createdWalletNeedsFinalPolicy = Boolean(mobileSessionId);
      toast({
        title: 'Multisig wallet created',
        description:
          templateKind === 'standard'
            ? `${threshold} signatures are required to spend.`
            : 'The primary signers can spend now; delayed paths follow the reviewed block schedule.',
        tone: 'success'
      });
      if (mobileSessionId) {
        try {
          mobileFinalFrames = await walletService.finalizePairingOnDesktop(mobileSessionId);
          mobileFinalOpen = true;
          createdWalletNeedsFinalPolicy = false;
        } catch (cause) {
          createErrorTitle = 'Wallet created — phone pairing incomplete';
          error = localizedError(
            cause,
            $locale,
            'Retry the final QR. Do not create this wallet again.'
          );
        }
      } else {
        await goto('/multisig');
      }
    } catch (cause) {
      existingWalletId =
        cause instanceof WalletError && cause.code === 'wallet_already_exists'
          ? cause.existingWalletId
          : null;
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

  async function retryFinalPolicyQr() {
    if (!mobileSessionId || busy) return;
    busy = true;
    error = '';
    try {
      mobileFinalFrames = await walletService.finalizePairingOnDesktop(mobileSessionId);
      mobileFinalOpen = true;
      createdWalletNeedsFinalPolicy = false;
    } catch (cause) {
      createErrorTitle = 'Phone pairing still incomplete';
      error = localizedError(cause, $locale, 'Could not prepare the final wallet QR.');
    } finally {
      busy = false;
    }
  }

  async function openExistingWallet() {
    if (!existingWalletId || busy) return;
    busy = true;
    try {
      await flushCurrentDraft();
      if (walletShell.selectedWalletId() === existingWalletId) await goto('/unlock');
      else await walletShell.selectWallet(existingWalletId);
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not select this wallet.');
      toast({ title: 'Wallet not switched', description: error, tone: 'danger' });
    } finally {
      busy = false;
    }
  }
</script>

<div class="page coordinator-page">
  <header class="page-header">
    <div>
      <h1>{translate($locale, 'Create a multisig wallet')}</h1>
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
  {#if draftSaveError}<WarningNotice
      tone="danger"
      role="alert"
      icon
      title={translate($locale, 'Setup progress could not be saved')}
      body={draftSaveError}
    />{/if}

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
              <h2>{translate($locale, 'Choose how this wallet spends')}</h2>
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
              class:active={templateKind === 'partner_continuity_v1'}
              type="button"
              disabled={defaultConfig.network === 'mainnet'}
              onclick={() => chooseTemplate('partner_continuity_v1')}
              ><span class="policy-kind-icon"><ShieldCheck size={21} /></span><span
                class="policy-kind-copy"
                ><strong>{translate($locale, 'Partner continuity')}</strong><small
                  >{translate(
                    $locale,
                    'Your 2 of 3 now, guided access for your partner later.'
                  )}</small
                ></span
              ><span class="policy-kind-meta"
                >{translate(
                  $locale,
                  defaultConfig.network === 'mainnet' ? 'Coming soon' : 'Test networks only'
                )}</span
              >{#if templateKind === 'partner_continuity_v1'}<span
                  class="policy-kind-check"
                  aria-hidden="true"><Check size={16} strokeWidth={3} /></span
                >{/if}</button
            >
            <button
              class="policy-kind-card inheritance"
              class:active={templateKind === 'family_continuity_v1'}
              type="button"
              disabled={defaultConfig.network === 'mainnet'}
              onclick={() => chooseTemplate('family_continuity_v1')}
              ><span class="policy-kind-icon"><Clock3 size={21} /></span><span
                class="policy-kind-copy"
                ><strong>{translate($locale, 'Family continuity')}</strong><small
                  >{translate(
                    $locale,
                    'Parents stay in control; children can assist or inherit later.'
                  )}</small
                ></span
              ><span class="policy-kind-meta"
                >{translate(
                  $locale,
                  defaultConfig.network === 'mainnet' ? 'Coming soon' : 'Test networks only'
                )}</span
              >{#if templateKind === 'family_continuity_v1'}<span
                  class="policy-kind-check"
                  aria-hidden="true"><Check size={16} strokeWidth={3} /></span
                >{/if}</button
            >
          </div>
          <WarningNotice
            title={translate($locale, 'Miniscript signer compatibility')}
            body={translate(
              $locale,
              'Partner and Family continuity are experimental on Regtest and Testnet4. Ledger, Jade/Jade Plus, BitBox02 and BitBox02 Nova are Miniscript candidates only; no direct USB Miniscript workflow is certified in Groot. Coldcard and Trezor are unsupported for delayed policies through this integration. Phone pairing supports standard multisig only.'
            )}
          />
          <div class="policy-choice-insight">
            <span>{translate($locale, 'About this plan')}</span><InsightTip
              label={translate(
                $locale,
                templateKind === 'standard'
                  ? 'How Standard multisig works'
                  : templateKind === 'partner_continuity_v1'
                    ? 'How Partner continuity works'
                    : 'How Family continuity works'
              )}
              text={translate(
                $locale,
                templateKind === 'standard'
                  ? 'Choose how many independent keys must sign each payment. No single key can spend alone.'
                  : templateKind === 'partner_continuity_v1'
                    ? 'Your 2-of-3 remains available. After three months your partner uses both partner keys, after nine months either partner key works, and after twelve months two estate guardians can recover. Renewing moves every delayed path back.'
                    : 'Both parents sign now. After three months either parent can sign with either child assistance key. After twelve months two of the children’s inheritance role keys and the executor can recover. Renewing moves the delayed paths back.'
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
          <div class="section-heading compact policy-configure-heading">
            <div>
              <h2>
                {translate(
                  $locale,
                  templateKind === 'standard'
                    ? 'Standard multisig'
                    : templateKind === 'partner_continuity_v1'
                      ? 'Partner continuity'
                      : templateKind === 'family_continuity_v1'
                        ? 'Family continuity'
                        : templateKind === 'recovery'
                          ? 'Recovery wallet'
                          : 'Inheritance wallet'
                )}
              </h2>
            </div>
            <span class="policy-pill"
              >{translate(
                $locale,
                templateKind === 'standard'
                  ? `${threshold} of ${requiredKeys}`
                  : templateKind === 'partner_continuity_v1'
                    ? '2 of 3 + continuity'
                    : templateKind === 'family_continuity_v1'
                      ? 'Parents + family'
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
            {/if}
          {:else if templateKind === 'partner_continuity_v1' || templateKind === 'family_continuity_v1'}
            <div
              class="path-visual continuity-path-visual"
              class:family-continuity-path={templateKind === 'family_continuity_v1'}
            >
              <span
                ><b>{translate($locale, 'TODAY')}</b><strong
                  >{translate(
                    $locale,
                    templateKind === 'partner_continuity_v1' ? 'Owner: 2 of 3' : 'Parents: 2 of 2'
                  )}</strong
                ></span
              >
              <i></i>
              <span
                ><b>{translate($locale, 'ABOUT 3 MONTHS')}</b><strong
                  >{translate(
                    $locale,
                    templateKind === 'partner_continuity_v1'
                      ? 'Both partner keys'
                      : 'One parent + one child'
                  )}</strong
                ><small>{formatInteger(13_140, $locale)} {translate($locale, 'blocks')}</small
                ></span
              >
              <i></i>
              <span
                ><b
                  >{translate(
                    $locale,
                    templateKind === 'partner_continuity_v1' ? 'ABOUT 9 MONTHS' : 'ABOUT 12 MONTHS'
                  )}</b
                ><strong
                  >{translate(
                    $locale,
                    templateKind === 'partner_continuity_v1'
                      ? 'Either partner key'
                      : '2 of 3 estate quorum'
                  )}</strong
                ><small
                  >{formatInteger(
                    templateKind === 'partner_continuity_v1' ? 39_420 : 52_560,
                    $locale
                  )}
                  {translate($locale, 'blocks')}</small
                ></span
              >
              {#if templateKind === 'partner_continuity_v1'}
                <i></i><span
                  ><b>{translate($locale, 'ABOUT 12 MONTHS')}</b><strong
                    >{translate($locale, '2 of 3 estate guardians')}</strong
                  ><small>{formatInteger(52_560, $locale)} {translate($locale, 'blocks')}</small
                  ></span
                >
              {/if}
            </div>
            <p class="policy-delay-note">
              <RefreshCw size={14} />{translate(
                $locale,
                'Renew around six months to move every delayed path back.'
              )}
            </p>
            <div class="recovery-separation">
              <ShieldCheck size={15} /><span
                ><strong>{translate($locale, 'Fixed, reviewed roles')}</strong><small
                  >{translate(
                    $locale,
                    'Only Ledger, Jade/Jade Plus, BitBox02, and BitBox02 Nova are Miniscript candidates; each exact setup still requires certification.'
                  )}</small
                ></span
              >
            </div>
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
          {#if error}<WarningNotice
              tone="danger"
              icon
              role="alert"
              ariaLive="polite"
              body={error}
            />{/if}
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
                  : templateKind === 'partner_continuity_v1'
                    ? '2 of 3 + continuity'
                    : templateKind === 'family_continuity_v1'
                      ? 'Parents + family'
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
                          class="source-badge">{translate($locale, policyRole(i))}</span
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
        {#if reviewAttempted && visibleErrors.length}<WarningNotice
            tone="danger"
            icon
            role="alert"
            ariaLive="polite"
          >
            {#each visibleErrors as item}<p>{translate($locale, item)}</p>{/each}
          </WarningNotice>{/if}
        {#if error}<WarningNotice
            tone="danger"
            icon
            role="alert"
            ariaLive="polite"
            body={error}
          />{/if}
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
        <ul>
          <li>{translate($locale, 'Save the wallet descriptor.')}</li>
          <li>{translate($locale, 'Verify keys on each signer.')}</li>
          <li>{translate($locale, 'Store signers separately.')}</li>
        </ul>
        <button class="hardware-help-card" onclick={() => openHardwareHelp()}
          ><CircleHelp size={17} /><span
            ><strong>{translate($locale, 'Hardware setup help')}</strong><small
              >{translate($locale, 'Coldcard, BitBox02, Ledger, Trezor, Jade')}</small
            ></span
          ><ChevronRight size={14} /></button
        >
      </aside>
    </div>
  {:else if stage === 'review' && preview}
    <section class="form-card review-policy">
      <h2>{translate($locale, '{walletName} Review', { walletName: preview.name })}</h2>
      <div class="policy-summary">
        <strong
          >{translate(
            $locale,
            templateKind === 'standard'
              ? '{threshold} of {total} signatures'
              : templateKind === 'partner_continuity_v1'
                ? '2 of 3 + continuity'
                : templateKind === 'family_continuity_v1'
                  ? 'Parents + family'
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
      <h2>{translate($locale, 'Back up {walletName} Wallet', { walletName: preview.name })}</h2>
      <div class="policy-summary">
        <strong
          >{translate(
            $locale,
            templateKind === 'standard'
              ? '{threshold} of {total} signatures'
              : templateKind === 'partner_continuity_v1'
                ? '2 of 3 + continuity'
                : templateKind === 'family_continuity_v1'
                  ? 'Parents + family'
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
          {#if combinedDescriptor}
            <Button
              variant="secondary"
              class="full"
              onclick={() => copyDescriptor(combinedDescriptor!, 'Wallet')}
            >
              {#if copiedDescriptor === combinedDescriptor}<Check size={14} />{:else}<Copy
                  size={14}
                />{/if}{translate($locale, 'Copy wallet descriptor')}
            </Button>
          {/if}
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
                  <code>{combinedDescriptor}</code>
                </section>
              {:else}<WarningNotice
                  tone="danger"
                  icon
                  role="alert"
                  ariaLive="polite"
                  body={translate(
                    $locale,
                    'The wallet descriptor could not be combined. Your saved backup is unchanged.'
                  )}
                />{/if}
              {#if recoveryTemplate?.type === 'recovery'}<span
                  >{translate($locale, 'Spend paths')}</span
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
            </div>{/if}
          {#if backupError}<WarningNotice
              tone="danger"
              icon
              role="alert"
              ariaLive="polite"
              body={backupError}
            />{/if}
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
          {#if credential && confirmation && credential !== confirmation}<WarningNotice
              tone="danger"
              icon
              role="alert"
              ariaLive="polite"
              body={translate($locale, 'PINs do not match.')}
            />{/if}
        </SetupTask>
      </div>
      {#if error}<WarningNotice
          tone="danger"
          icon
          role="alert"
          class="hardware-create-error inline-action"
          title={translate($locale, createErrorTitle || 'Wallet could not be created')}
          body={error}
        >
          {#if existingWalletId}<Button
              variant="secondary"
              loading={busy}
              onclick={openExistingWallet}>{translate($locale, 'Open existing wallet')}</Button
            >{/if}
        </WarningNotice>{/if}
      {#if createdWalletNeedsFinalPolicy}
        <Button class="full" loading={busy} onclick={retryFinalPolicyQr}
          >{translate($locale, 'Retry final phone QR')}</Button
        >
      {:else}<div class="coordinator-actions">
          <Button variant="secondary" disabled={busy} onclick={() => (stage = 'review')}>
            <ArrowLeft size={16} />{translate($locale, 'Back to verification')}
          </Button>
          <Button
            size="large"
            disabled={!saved ||
              !policyReadinessAcknowledged ||
              !credential ||
              credential !== confirmation}
            loading={busy}
            loadingLabel={translate($locale, 'Creating wallet…')}
            onclick={create}>{translate($locale, 'Create wallet')}</Button
          >
        </div>
      {/if}
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
    <WarningNotice
      icon
      title={translate($locale, 'You will need to add this signer again.')}
      body={translate($locale, 'Its hardware signer and seed are not changed.')}
    />
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
    {#if templateKind === 'standard' && defaultConfig.network !== 'mainnet'}<button
        disabled={hasGrootPhoneSigner}
        onclick={startMobilePairing}
        ><Smartphone size={18} /><span
          ><strong>{translate($locale, 'Add a Groot phone')}</strong><small
            >{translate(
              $locale,
              hasGrootPhoneSigner
                ? 'One Groot phone signer per wallet in V1'
                : 'Accountless · encrypted two-QR pairing'
            )}</small
          ></span
        ><ChevronRight size={15} /></button
      >{/if}
    {#if templateKind === 'standard'}<button onclick={scanHardware}
        ><Cpu size={18} /><span
          ><strong>{translate($locale, 'Connect hardware device')}</strong><small
            >{translate(
              $locale,
              'Connect an initialized, unlocked signer directly by cable.'
            )}</small
          ></span
        ><ChevronRight size={15} /></button
      >{:else}<WarningNotice
        role="note"
        icon
        title={translate(
          $locale,
          'USB hardware signing is not available for delayed policies yet.'
        )}
        body={translate(
          $locale,
          'Groot’s pinned HWI release supports standard multisig only. Add public keys by file or manual entry and use the offline PSBT workflow.'
        )}
      />{/if}
    <label class="source-button"
      ><FileUp size={18} /><span
        ><strong>{translate($locale, 'Import public-key file')}</strong><small
          >{translate($locale, 'Choose a signer-export JSON file · 256 KiB maximum')}</small
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
          >{translate($locale, 'Enter an account xpub, fingerprint, and BIP48 path')}</small
        ></span
      ><ChevronRight size={15} /></button
    >
  </div>
  {#if pickerError}<WarningNotice
      tone="danger"
      icon
      role="alert"
      ariaLive="polite"
      title={translate($locale, pickerErrorTitle)}
      body={pickerError}
    >
      <small>{translate($locale, pickerErrorGuidance)}</small>
    </WarningNotice>{/if}
</Modal>
<Modal
  open={mobilePairOpen}
  dismissible={false}
  wide={mobilePairScan && !mobileCandidate}
  title={translate($locale, 'Add a Groot phone')}
  description={translate($locale, 'Create one words-only phone signer.')}
  onclose={cancelMobilePairing}
>
  <div class="mobile-pairing-flow">
    {#if mobilePairAccepted}
      <WarningNotice
        role="status"
        icon
        title={translate($locale, 'Phone key added')}
        body={translate(
          $locale,
          'Keep the phone on its waiting screen. After you add the remaining signers and create the wallet, desktop will show one final QR for the phone.'
        )}
      />
      <Button class="full" onclick={continueAfterMobileSigner}
        >{translate($locale, 'Continue wallet setup')}</Button
      >
    {:else if mobilePairBusy}<HardwareActionPrompt
        title={translate($locale, 'Creating one-time invitation')}
        detail={translate($locale, 'Groot is generating a fresh 128-bit BIP129 token.')}
        label={translate($locale, 'Pairing invitation in progress')}
      />{:else if mobileInvitation && !mobilePairScan && !mobileCandidate}
      <AnimatedUrQr
        frames={mobileInvitation.frames}
        label={translate($locale, 'Groot phone invitation QR')}
      />
      <div class="comparison-code">
        <small>{translate($locale, 'Both devices must show')}</small><strong
          >{mobileInvitation.comparisonCode}</strong
        >
      </div>
      <WarningNotice
        role="note"
        icon
        title={translate($locale, 'One phone, one invitation')}
        body={translate(
          $locale,
          'On the fresh phone choose “Connect desktop app,” scan this QR, and keep the response private.'
        )}
      />
      <Button class="full" onclick={() => (mobilePairScan = true)}
        >{translate($locale, 'Scan phone QR code')}</Button
      >
    {:else if mobileInvitation && mobilePairScan && !mobileCandidate}
      {#if mobilePairError}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={mobilePairError}
        />{/if}
      <UrQrScanner
        acceptedTypes={['groot-bsms']}
        prompt={translate($locale, 'Point the camera at the encrypted phone response')}
        onframe={receiveMobileResponse}
        onreset={() => {
          mobileResponseFrames = [];
          mobilePairError = '';
        }}
      />
    {:else if mobileInvitation && mobileCandidate}
      <div class="device-scan paired-mobile">
        <Smartphone size={20} /><strong>{mobileCandidate.label}</strong><span
          >{translate($locale, 'Phone key fingerprint')} {mobileCandidate.fingerprint}</span
        >
      </div>
      <div class="comparison-code">
        <small>{translate($locale, 'Confirm the phone shows the same digits')}</small><strong
          >{mobileInvitation.comparisonCode}</strong
        >
      </div>
      {#if mobilePairError}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={mobilePairError}
        />{/if}
      <Button class="full" onclick={confirmMobileSigner}
        >{translate($locale, 'Six digits match — add signer')}</Button
      >
    {:else if mobilePairError}<WarningNotice
        tone="danger"
        icon
        role="alert"
        ariaLive="polite"
        body={mobilePairError}
      />{/if}
    {#if !mobilePairAccepted}<Button
        variant="secondary"
        class="full"
        disabled={mobilePairBusy}
        onclick={cancelMobilePairing}>{translate($locale, 'Cancel pairing')}</Button
      >{/if}
  </div>
</Modal>

<Modal
  open={mobileFinalOpen}
  dismissible={false}
  title={translate($locale, 'Return the final policy to the phone')}
  description={translate(
    $locale,
    'Final phone step. This encrypted QR commits the wallet policy and first address.'
  )}
  onclose={() => {}}
>
  <div class="mobile-pairing-flow">
    <AnimatedUrQr
      frames={mobileFinalFrames}
      label={translate($locale, 'Final shared wallet policy QR')}
    />
    <WarningNotice
      role="note"
      icon
      title={translate($locale, 'Verify before funding')}
      body={translate(
        $locale,
        'On the phone, check the same threshold and first address. Pairing is not complete until the phone accepts this policy.'
      )}
    />
    <Button class="full" onclick={() => goto('/multisig')}
      >{translate($locale, 'Phone accepted the wallet')}</Button
    >
  </div>
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
  {:else if policySigner && preview && policyAddress}<SignerPolicyReview
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
  description={translate(
    $locale,
    'Connect one initialized and unlocked signer directly to this computer.'
  )}
  onclose={closeHardwareScan}
>
  <div class="hardware-readiness">
    <Usb size={18} /><span
      ><strong>{translate($locale, 'Keep USB free')}</strong><small
        >{translate($locale, 'Use a cable and quit other wallet apps before scanning.')}</small
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
          ? ledgerAppName === 'Bitcoin'
            ? 'Keep Bitcoin open and confirm the export on the device screen.'
            : 'Keep Bitcoin Test open and confirm the export on the device screen.'
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
  {:else}<HardwareDeviceList
      devices={hardware}
      emptyMessage=""
      onselect={handleHardware}
      onrescan={scanHardware}
      showRescan
      detailedStatus
      deviceDisplayName={(device) => addedSignerForDevice(device)?.label ?? device.label}
      deviceDisabled={(device) => Boolean(addedSignerForDevice(device)) || device.action === 'none'}
      deviceStateLabel={(device, membership: HardwareWalletMembership) =>
        addedSignerForDevice(device)
          ? 'Already added'
          : hardwareDeviceStateLabel(device, membership)}
    />{/if}
  {#if error && hardware.length > 0}<WarningNotice
      tone="danger"
      icon
      role="alert"
      class="inline-action"
      title={translate($locale, 'Could not read the account key')}
      body={error}
    >
      <Button variant="secondary" size="small" onclick={scanHardware}
        >{translate($locale, 'Try again')}</Button
      >
    </WarningNotice>{/if}
</Modal>

<Modal
  open={standardWalletOpen}
  title={translate($locale, 'Use Trezor standard wallet?')}
  description={translate(
    $locale,
    'This selects the seed-derived wallet with no hardware passphrase.'
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
      <strong>{translate($locale, 'Your hidden wallet is unchanged.')}</strong><span
        >{translate($locale, 'Confirm this standard wallet to continue.')}</span
      >
    </p>
  </div>
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
    pinOpen = false;
    pinPurpose = 'import';
    pinPositions = '';
    pinChallenge = '';
    pinDevice = null;
    pinError = '';
    pinErrorCode = '';
    void scanHardware();
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
        <div class="hardware-guide-models">
          {#each selectedHardwareGuide.models as model}<span>{model}</span>{/each}
        </div>
        <ol>
          {#each selectedHardwareGuide.steps as step}<li>{step}</li>{/each}
        </ol>
      </div>
    </div>
    <p>
      <strong>{translate($locale, 'Prepare the signer first.')}</strong>
      {translate($locale, 'It must be initialized, unlocked, and have its recovery backup saved.')}
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
    {#if keyError}<WarningNotice
        tone="danger"
        icon
        role="alert"
        ariaLive="polite"
        body={keyError}
      />{/if}
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

<style>
  .path-visual.continuity-path-visual {
    grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr) 28px minmax(0, 1fr) 28px minmax(
        0,
        1fr
      );
    gap: 8px;
  }
  .path-visual.family-continuity-path {
    grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1fr) 36px minmax(0, 1fr);
  }
  @media (max-width: 760px) {
    .path-visual.continuity-path-visual,
    .path-visual.family-continuity-path {
      grid-template-columns: 1fr;
    }
  }

  .mobile-pairing-flow {
    display: grid;
    gap: 1rem;
  }
  .comparison-code {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    padding: 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }
  .comparison-code small {
    color: var(--muted);
  }
  .comparison-code strong {
    font-size: 1.65rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.secondary-link):where(.secondary-link) {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 11px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    color: var(--text);
    font-size: var(--font-size-meta);
    font-weight: 650;
    text-decoration: none;
    background: var(--panel);
  }
  :global(.secondary-link:hover):where(.secondary-link) {
    border-color: var(--fr-blue);
    color: var(--link);
    background: var(--fr-blue-soft);
  }
  :global(.network-chip):where(.network-chip) {
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--muted);
    border-radius: 999px;
    padding: 7px 11px;
    font-size: var(--font-size-meta);
    white-space: nowrap;
  }
  .policy-only-grid {
    grid-template-columns: minmax(0, 1fr);
    width: min(960px, 100%);
    margin: 0 auto;
  }
  .policy-setup-card {
    padding: 34px 36px;
    border-radius: var(--radius-panel);
    background:
      radial-gradient(
        circle at 50% 0%,
        color-mix(in srgb, var(--fr-blue) 6%, transparent),
        transparent 46%
      ),
      var(--panel);
  }
  :global(.coordinator-main):where(.coordinator-main) :global(.section-heading.compact) {
    margin: 0 0 24px;
  }
  :global(.threshold-row):where(.threshold-row) {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 24px;
    padding: 4px 0 22px;
    border-bottom: 1px solid var(--border);
  }
  :global(.threshold-row):where(.threshold-row) > :global(div) {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 2px;
  }
  :global(.threshold-row):where(.threshold-row) > :global(div span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.threshold-row):where(.threshold-row) > :global(div strong) {
    font-size: 14px;
    margin-top: 4px;
  }
  :global(.threshold-row):where(.threshold-row) > :global(div small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.policy-recipes):where(.policy-recipes) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 4px 0 22px;
  }
  :global(.policy-recipes):where(.policy-recipes) :global(button) {
    position: relative;
    min-height: 118px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 17px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-inset);
    color: var(--text);
    background: var(--surface-control);
    cursor: pointer;
    text-align: left;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  :global(.policy-recipes):where(.policy-recipes) :global(button:hover) {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--fr-blue) 65%, var(--control-border));
    background: var(--panel-2);
    box-shadow: 0 9px 24px rgba(0, 0, 0, 0.09);
  }
  :global(.policy-recipes):where(.policy-recipes) :global(button.active) {
    border-color: var(--fr-blue);
    background: var(--fr-blue-soft);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fr-blue) 22%, transparent);
  }
  :global(.policy-recipes):where(.policy-recipes) :global(button > span) {
    display: grid;
    gap: 6px;
  }
  :global(.policy-recipes):where(.policy-recipes) :global(strong) {
    font-size: 17px;
    line-height: 1.15;
  }
  :global(.policy-recipes):where(.policy-recipes) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }
  :global(.policy-recipes):where(.policy-recipes) :global(em) {
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  :global(.recovery-delay-options):where(.recovery-delay-options) {
    gap: 12px;
    margin: 24px 0 18px;
  }
  :global(.recovery-delay-title):where(.recovery-delay-title) {
    grid-column: 1 / -1;
    margin: 0 0 2px;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-weight: 650;
    line-height: 1.35;
  }
  :global(.recovery-delay-options):where(.recovery-delay-options) :global(button) {
    min-height: 110px;
    padding: 18px 20px;
    border-color: color-mix(in srgb, var(--control-border) 76%, transparent);
    border-radius: var(--radius-inset);
  }
  :global(.custom-threshold):where(.custom-threshold) {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 0;
  }
  :global(.custom-threshold):where(.custom-threshold) :global(.field) {
    margin: 0;
  }
  :global(.cosigner-list):where(.cosigner-list) {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    overflow: hidden;
  }
  :global(.cosigner-list):where(.cosigner-list) :global(article) {
    min-height: 76px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  :global(.cosigner-list):where(.cosigner-list) :global(article:last-child) {
    border-bottom: 0;
  }
  :global(.cosigner-card):where(.cosigner-card) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 50px;
    align-items: stretch;
    padding: 0;
    background: var(--panel);
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  :global(.cosigner-card:hover):where(.cosigner-card),
  :global(.cosigner-card:has(.draft-cosigner-trigger:focus-visible)):where(.cosigner-card) {
    background: color-mix(in srgb, var(--link) 5.5%, transparent);
    box-shadow: inset 3px 0 0 var(--fr-blue);
  }
  :global(.draft-cosigner-trigger):where(.draft-cosigner-trigger) {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 18px;
    gap: 13px;
    align-items: start;
    padding: 16px 12px 16px 14px;
    color: inherit;
    text-align: left;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
  }
  :global(.draft-cosigner-trigger:focus-visible):where(.draft-cosigner-trigger) {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  :global(.draft-cosigner-trigger:hover):where(.draft-cosigner-trigger)
    :global(.draft-row-chevron) {
    transform: translateX(2px);
    background: color-mix(in srgb, var(--link) 14%, transparent);
  }
  :global(.cosigner-card-body):where(.cosigner-card-body) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  :global(.cosigner-name):where(.cosigner-name) {
    color: var(--text);
    font-size: 14px;
    line-height: 1.3;
  }
  :global(.cosigner-metadata):where(.cosigner-metadata) {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(120px, 0.7fr) minmax(105px, 0.45fr);
    gap: 10px 16px;
    margin: 0;
  }
  :global(.cosigner-metadata):where(.cosigner-metadata) > :global(span) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
  :global(.cosigner-metadata):where(.cosigner-metadata) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 650;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }
  :global(.cosigner-metadata):where(.cosigner-metadata) :global(code) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.cosigner-public-key):where(.cosigner-public-key) {
    grid-column: 1 / -1;
    width: 100%;
  }
  :global(.cosigner-public-key):where(.cosigner-public-key) :global(code) {
    width: 100%;
    padding: 8px 9px;
    overflow-wrap: anywhere;
    word-break: break-all;
    white-space: normal;
    line-height: 1.5;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-inset);
  }
  :global(.source-badge):where(.source-badge) {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 3px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-inset);
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-weight: 600;
    white-space: nowrap;
  }
  :global(.remove-cosigner):where(.remove-cosigner) {
    appearance: none;
    -webkit-appearance: none;
    width: 32px;
    height: 32px;
    align-self: center;
    justify-self: center;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted-2);
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease,
      border-color 0.15s ease;
  }
  :global(.remove-cosigner:hover):where(.remove-cosigner) {
    color: var(--danger);
    border-color: rgba(239, 100, 100, 0.18);
    background: rgba(239, 100, 100, 0.07);
  }
  :global(.remove-cosigner:focus-visible):where(.remove-cosigner) {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  :global(.cosigner-list):where(.cosigner-list) :global(.cosigner-trigger) {
    width: 100%;
    min-height: 76px;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto 18px;
    gap: 12px;
    align-items: center;
    padding: 11px 13px;
    color: inherit;
    text-align: left;
    border-radius: 0;
    transition: background 0.15s ease;
  }
  :global(.cosigner-list):where(.cosigner-list) :global(.cosigner-trigger:hover) {
    background: var(--panel-2);
  }
  :global(.cosigner-list):where(.cosigner-list) :global(.cosigner-trigger:focus-visible) {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  :global(.keys-empty):where(.keys-empty) {
    min-height: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: var(--muted-2);
  }
  :global(.keys-empty):where(.keys-empty) :global(strong) {
    color: var(--text-soft);
    margin-top: 5px;
  }
  :global(.keys-empty):where(.keys-empty) :global(span) {
    font-size: var(--font-size-meta);
  }
  :global(.cosigner-progress):where(.cosigner-progress) {
    margin: 9px 2px 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.coordinator-actions):where(.coordinator-actions) {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }
  :global(.hardware-help-card):where(.hardware-help-card) {
    width: 100%;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 14px;
    align-items: center;
    gap: 8px;
    margin: 14px 0 10px;
    padding: 10px;
    color: var(--text-soft);
    text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
    cursor: pointer;
  }
  :global(.hardware-help-card):where(.hardware-help-card) > :global(svg) {
    color: var(--link);
  }
  :global(.hardware-help-card):where(.hardware-help-card) :global(span) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.hardware-help-card):where(.hardware-help-card) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.hardware-help-card):where(.hardware-help-card) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.hardware-help-card:hover):where(.hardware-help-card) {
    border-color: var(--border-strong);
    background: var(--surface-hover);
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(article) {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 11px;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
    border-radius: var(--radius-control);
    background: var(--accent-soft);
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(article.complete) {
    border-color: color-mix(in srgb, var(--success) 38%, var(--border));
    background: color-mix(in srgb, var(--success) 7%, var(--panel));
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(article > span) {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--accent);
    background: var(--surface-icon);
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(article.complete > span) {
    color: var(--success);
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(article > div) {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.signer-readiness-list):where(.signer-readiness-list) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }
  :global(.hardware-guide):where(.hardware-guide) {
    display: grid;
    gap: 14px;
  }
  :global(.hardware-guide-tabs):where(.hardware-guide-tabs) {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  :global(.hardware-guide-tabs):where(.hardware-guide-tabs) :global(button) {
    min-height: 36px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-control);
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.hardware-guide-tabs):where(.hardware-guide-tabs) :global(button.active) {
    color: var(--text);
    border-color: var(--fr-blue);
    background: color-mix(in srgb, var(--link) 10%, transparent);
  }
  :global(.hardware-guide-body):where(.hardware-guide-body) {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 11px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.hardware-guide-body):where(.hardware-guide-body) :global(strong) {
    font-size: 13px;
  }
  :global(.hardware-guide-models):where(.hardware-guide-models) {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }
  :global(.hardware-guide-models):where(.hardware-guide-models) :global(span) {
    padding: 3px 7px;
    color: var(--text-soft);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-control);
    font-size: var(--font-size-meta);
    line-height: 1.2;
  }
  :global(.hardware-guide-body):where(.hardware-guide-body) :global(ol) {
    margin: 9px 0 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.65;
  }
  :global(.hardware-guide):where(.hardware-guide) > :global(p) {
    margin: 0;
    padding: 11px 12px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.55;
    border-left: 2px solid var(--fr-red);
  }
  :global(.hardware-guide):where(.hardware-guide) > :global(p strong) {
    color: var(--text-soft);
  }
  :global(.review-policy):where(.review-policy) {
    max-width: 720px;
    margin: 0 auto;
  }
  :global(.review-policy):where(.review-policy) > :global(h2) {
    font-size: 24px;
    margin: 8px 0 0;
  }
  :global(.policy-summary):where(.policy-summary) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid var(--border);
    background: var(--surface-control);
    border-radius: var(--radius-control);
    padding: 14px;
    margin: 20px 0 10px;
  }
  :global(.policy-summary):where(.policy-summary) :global(strong) {
    color: var(--text);
    font-size: 13px;
  }
  :global(.policy-summary):where(.policy-summary) :global(span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.backup-setup-sections):where(.backup-setup-sections) {
    display: grid;
    gap: 14px;
    margin-top: 18px;
  }
  :global(.defer-policy-verification):where(.defer-policy-verification) {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: 9px;
    width: 100%;
    padding: 11px 12px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-control);
    color: var(--muted);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  :global(.defer-policy-verification:hover:not(:disabled)):where(.defer-policy-verification) {
    color: var(--text-soft);
    border-color: var(--fr-blue);
    background: var(--fr-blue-soft);
  }
  :global(.defer-policy-verification:disabled):where(.defer-policy-verification) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  :global(.defer-policy-verification):where(.defer-policy-verification) :global(span) {
    display: grid;
    gap: 3px;
  }
  :global(.defer-policy-verification):where(.defer-policy-verification) :global(strong) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.defer-policy-verification):where(.defer-policy-verification) :global(small) {
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.backup-confirmation):where(.backup-confirmation) {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.backup-confirmation):where(.backup-confirmation) :global(input) {
    margin-top: 2px;
    accent-color: var(--success);
  }
  :global(.backup-confirmation):where(.backup-confirmation) :global(span) {
    display: grid;
    gap: 3px;
  }
  :global(.backup-confirmation):where(.backup-confirmation) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.backup-confirmation):where(.backup-confirmation) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.review-signers):where(.review-signers) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
    margin: 10px 0 20px;
  }
  :global(.review-signers):where(.review-signers) > :global(div) {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 10px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  :global(.review-signers):where(.review-signers) :global(svg) {
    color: var(--success);
  }
  :global(.review-signers):where(.review-signers) :global(span) {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.review-signers):where(.review-signers) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.review-signers):where(.review-signers) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.cosigner-step-heading):where(.cosigner-step-heading) :global(.setup-step) {
    display: block;
    margin: 0 0 5px;
  }
  :global(.cosigner-step-heading):where(.cosigner-step-heading) :global(h2) {
    margin: 0 0 4px;
  }
  :global(.template-grid):where(.template-grid) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 10px;
  }
  :global(.template-grid):where(.template-grid) :global(button) {
    min-height: 94px;
    border: 1px solid var(--border);
    background: var(--surface-control);
    color: var(--text);
    border-radius: var(--radius-control);
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7px;
    text-align: left;
    cursor: pointer;
  }
  :global(.template-grid):where(.template-grid) :global(button svg) {
    color: var(--muted);
  }
  :global(.template-grid):where(.template-grid) :global(button strong) {
    font-size: var(--font-size-meta);
  }
  :global(.template-grid):where(.template-grid) :global(button small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.35;
  }
  :global(.template-grid):where(.template-grid) :global(button.active) {
    border-color: var(--fr-blue);
    background: color-mix(in srgb, var(--link) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--link) 15%, transparent);
  }
  :global(.template-grid):where(.template-grid) :global(button.active svg) {
    color: var(--link);
  }
  :global(.path-visual):where(.path-visual) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
    align-items: stretch;
    gap: 12px;
    padding: 4px 0 0;
  }
  :global(.path-visual):where(.path-visual) > :global(span) {
    min-height: 108px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7px;
    padding: 16px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-inset);
    background: var(--surface-control);
  }
  :global(.path-visual):where(.path-visual) > :global(span:last-child) {
    text-align: left;
    border-color: color-mix(in srgb, var(--accent) 42%, var(--control-border));
    background: color-mix(in srgb, var(--accent) 7%, var(--surface-control));
  }
  :global(.path-visual):where(.path-visual) :global(b) {
    color: var(--link);
    font-size: var(--font-size-meta);
    letter-spacing: 0.1em;
  }
  :global(.path-visual):where(.path-visual) :global(strong) {
    font-size: 15px;
    line-height: 1.25;
  }
  :global(.path-visual):where(.path-visual) :global(.path-title) {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  :global(.path-visual):where(.path-visual) :global(.path-title > .insight-tip) {
    flex: 0 0 auto;
  }
  :global(.path-visual):where(.path-visual) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.path-visual):where(.path-visual) :global(i) {
    align-self: center;
    height: 2px;
    background: linear-gradient(90deg, var(--fr-blue), var(--fr-red));
  }
  :global(.policy-delay-note):where(.policy-delay-note) {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 10px 2px 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.descriptor-toggle-row):where(.descriptor-toggle-row) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 28px;
    align-items: center;
    gap: 5px;
    margin-bottom: 8px;
  }
  :global(.descriptor-toggle-row):where(.descriptor-toggle-row) :global(.descriptor-toggle) {
    margin-bottom: 0;
  }
  :global(.descriptor-toggle-row):where(.descriptor-toggle-row) > :global(.insight-tip) {
    justify-self: center;
  }
  :global(.descriptor-toggle):where(.descriptor-toggle) {
    width: 100%;
    min-height: 40px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    border-radius: var(--radius-control);
    padding: 0 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.descriptor-toggle):where(.descriptor-toggle) :global(svg) {
    transition: transform 0.15s;
  }
  :global(.descriptor-toggle):where(.descriptor-toggle) :global(svg.rotated) {
    transform: rotate(180deg);
  }
  .policy-choice-heading :global(.setup-step),
  .policy-configure-heading :global(.setup-step) {
    display: block;
    margin-bottom: 7px;
  }
  .policy-choice-heading :global(h2),
  .policy-configure-heading :global(h2) {
    font-size: 24px;
    line-height: 1.18;
    letter-spacing: -0.025em;
  }
  .policy-choice-heading :global(p),
  .policy-configure-heading :global(p) {
    max-width: 58ch;
    margin-top: 8px;
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button) {
    position: relative;
    min-height: 192px;
    padding: 20px;
    gap: 17px;
    border-radius: var(--radius-inset);
    overflow: hidden;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button::before) {
    content: '';
    position: absolute;
    width: 96px;
    height: 96px;
    top: -50px;
    right: -44px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--policy-accent, var(--fr-blue)) 12%, transparent);
    transition: transform 0.18s ease;
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button.standard) {
    --policy-accent: var(--fr-blue);
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button.recovery) {
    --policy-accent: var(--success);
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button.inheritance) {
    --policy-accent: var(--accent);
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button:hover) {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--policy-accent) 70%, var(--control-border));
    background: var(--panel-2);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.11);
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button:hover::before) {
    transform: scale(1.14);
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(button.active) {
    border-color: var(--policy-accent);
    background: color-mix(in srgb, var(--policy-accent) 8%, var(--surface-control));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--policy-accent) 20%, transparent);
  }
  :global(.policy-kind-icon):where(.policy-kind-icon) {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    color: var(--policy-accent);
    background: color-mix(in srgb, var(--policy-accent) 12%, transparent);
    border-radius: var(--radius-inset);
  }
  :global(.policy-kind-copy):where(.policy-kind-copy) {
    display: grid;
    gap: 8px;
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(.policy-kind-copy strong) {
    font-size: 15px;
    line-height: 1.2;
  }
  :global(.policy-template-grid):where(.policy-template-grid) :global(.policy-kind-copy small) {
    max-width: 26ch;
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.policy-kind-meta):where(.policy-kind-meta) {
    margin-top: auto;
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  :global(.policy-kind-check):where(.policy-kind-check) {
    position: absolute;
    right: 15px;
    bottom: 14px;
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    color: #fff;
    background: var(--policy-accent);
    border: 2px solid color-mix(in srgb, #fff 82%, var(--policy-accent));
    border-radius: 50%;
    box-shadow: 0 2px 7px color-mix(in srgb, var(--policy-accent) 28%, transparent);
  }
  :global(.policy-kind-check):where(.policy-kind-check) :global(svg) {
    color: #fff;
    stroke: #fff;
  }
  :global(.policy-choice-insight):where(.policy-choice-insight) {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    margin-top: 8px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 650;
  }
  :global(.policy-template-grid):where(.policy-template-grid) + :global(.coordinator-actions) {
    margin-top: 28px;
  }
  :global(.policy-choice-insight):where(.policy-choice-insight) + :global(.coordinator-actions) {
    margin-top: 12px;
  }
  .policy-configure-heading {
    margin-top: 24px !important;
  }
  .policy-setup-card > :global(.field > span) {
    font-size: 14px;
  }
  .policy-setup-card > :global(.field input) {
    min-height: 48px;
    font-size: 14px;
  }
  :global(.recovery-separation):where(.recovery-separation) {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding: 15px 16px;
    margin: 14px 0 22px;
    border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
    border-radius: var(--radius-inset);
    color: var(--accent);
    background: var(--accent-soft);
  }
  :global(.recovery-separation):where(.recovery-separation) :global(span) {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.recovery-separation):where(.recovery-separation) :global(strong) {
    color: var(--text-soft);
    font-size: 14px;
  }
  :global(.recovery-separation):where(.recovery-separation) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }

  @media (max-width: 760px) {
    :global(.review-policy):where(.review-policy) :global(.coordinator-actions) {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    :global(.review-policy):where(.review-policy) :global(.coordinator-actions .button) {
      width: 100%;
    }
    :global(.network-chip):where(.network-chip) {
      display: none;
    }
    :global(.threshold-row):where(.threshold-row) {
      grid-template-columns: 1fr;
      gap: 0;
    }
    :global(.review-signers):where(.review-signers) {
      grid-template-columns: 1fr;
    }
    :global(.cosigner-step-heading):where(.cosigner-step-heading) {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
      align-items: start;
    }
    :global(.cosigner-step-heading):where(.cosigner-step-heading) :global(.button) {
      width: 100%;
    }
    :global(.template-grid):where(.template-grid) {
      grid-template-columns: 1fr;
    }
    :global(.template-grid):where(.template-grid) :global(button) {
      min-height: 70px;
    }
    .policy-setup-card {
      padding: 24px 18px;
      border-radius: var(--radius-panel);
    }
    .policy-choice-heading :global(h2),
    .policy-configure-heading :global(h2) {
      font-size: 21px;
    }
    :global(.policy-template-grid):where(.policy-template-grid) :global(button) {
      min-height: 118px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      align-items: start;
      column-gap: 13px;
      row-gap: 10px;
      padding: 15px;
    }
    :global(.policy-kind-icon):where(.policy-kind-icon) {
      grid-row: 1 / 3;
    }
    :global(.policy-kind-copy):where(.policy-kind-copy) {
      grid-column: 2 / 4;
      grid-row: 1;
      padding-right: 18px;
    }
    :global(.policy-kind-meta):where(.policy-kind-meta) {
      grid-column: 2;
      grid-row: 2;
      margin: 0;
    }
    :global(.policy-kind-check):where(.policy-kind-check) {
      position: static;
      grid-column: 3;
      grid-row: 2;
      width: 23px;
      height: 23px;
      justify-self: end;
    }
    :global(.policy-recipes):where(.policy-recipes) {
      grid-template-columns: 1fr;
    }
    :global(.policy-recipes):where(.policy-recipes) :global(button) {
      min-height: 92px;
      flex-direction: row;
      align-items: center;
    }
    :global(.policy-recipes):where(.policy-recipes) :global(em) {
      margin-left: auto;
    }
    :global(.recovery-delay-options):where(.recovery-delay-options) {
      gap: 10px;
      margin: 22px 0 18px;
    }
    :global(.recovery-delay-title):where(.recovery-delay-title) {
      margin-bottom: 4px;
    }
    :global(.recovery-delay-options):where(.recovery-delay-options) :global(button) {
      min-height: 86px;
      padding: 15px 16px;
    }
    :global(.path-visual):where(.path-visual) {
      grid-template-columns: 1fr;
    }
    :global(.path-visual):where(.path-visual) :global(i) {
      width: 2px;
      height: 28px;
      justify-self: center;
      background: linear-gradient(180deg, var(--fr-blue), var(--fr-red));
    }
    :global(.path-visual):where(.path-visual) > :global(span) {
      min-height: 92px;
    }
    :global(.cosigner-list):where(.cosigner-list) :global(.cosigner-trigger) {
      grid-template-columns: 32px minmax(0, 1fr) auto;
    }
    :global(.cosigner-card):where(.cosigner-card) {
      grid-template-columns: minmax(0, 1fr) 42px;
    }
    :global(.draft-cosigner-trigger):where(.draft-cosigner-trigger) {
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 9px;
      padding: 13px 7px 13px 9px;
    }
    :global(.cosigner-metadata):where(.cosigner-metadata) {
      grid-template-columns: 1fr;
    }
    :global(.cosigner-public-key):where(.cosigner-public-key) {
      grid-column: auto;
    }
    :global(.hardware-guide-tabs):where(.hardware-guide-tabs) {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
