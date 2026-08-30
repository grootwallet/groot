<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    AlertTriangle,
    Check,
    CircleDot,
    Copy,
    Cpu,
    Download,
    ExternalLink,
    FileUp,
    LockKeyhole,
    QrCode,
    RefreshCw,
    ScanLine,
    Trash2,
    X
  } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '$lib/components/Button.svelte';
  import PermanentLabelEditor from '$lib/components/PermanentLabelEditor.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import TransactionReviewDetails from '$lib/components/TransactionReviewDetails.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import PaymentRequestQrScanner from '$lib/components/PaymentRequestQrScanner.svelte';
  import RecipientAddressModal from '$lib/components/RecipientAddressModal.svelte';
  import SendProgress from '$lib/components/SendProgress.svelte';
  import SignerSummary from '$lib/components/SignerSummary.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import SignerPolicyReview from '$lib/components/SignerPolicyReview.svelte';
  import ColdcardPolicySetup from '$lib/components/ColdcardPolicySetup.svelte';
  import { copyText } from '$lib/clipboard';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { coldcardPolicyFilename, psbtFilename, readTransferFile } from '$lib/transfer';
  import {
    feeRate,
    sats,
    walletService,
    WalletError,
    type AutomaticSelectionStrategy,
    type CoinSelection,
    type CoinSelectionPreview,
    type FeeEstimates,
    type AccelerationQuote,
    type CpfpAccelerationQuote,
    type HardwareDevice,
    type MultisigProposal,
    type MultisigWallet,
    type PolicyVerificationAddress,
    type SignerPolicyVerification,
    type WalletErrorCode
  } from '$lib/wallet';
  import type { LabelSuggestion, Utxo } from '$lib/types';
  import { defaultConfig, networkName, transactionExplorerUrl } from '$lib/config';
  import {
    addressPrefixForNetwork,
    hasAddressPrefixForNetwork,
    normalizePermanentLabel,
    validPolicyMaturity
  } from '$lib/wallet/policy';
  import { compactAddress, compactIdentifier } from '$lib/address-display';
  import {
    accelerationUnavailableDescription,
    accelerationUnavailableTitle
  } from '$lib/wallet/acceleration-presentation';
  import {
    automaticStrategyMessage,
    presentedCoinSelection,
    toggleManualCoin
  } from '$lib/wallet/coin-selection-presentation';
  import {
    isCurrentMaxSpendResponse,
    matchingMaxSpendFee,
    validatedMaxSpendQuote,
    type MaxSpendQuote
  } from '$lib/wallet/max-spend-quote';
  import {
    permanentLabelsForSubmission,
    visibleLabelSuggestions,
    VISIBLE_LABEL_SUGGESTION_LIMIT
  } from '$lib/wallet/label-suggestions';
  import {
    addressForHardwareDisplay,
    testnetAddressDisplayName
  } from '$lib/wallet/hardware-display';
  import {
    matchingPolicyVerification,
    policyReadinessLabel,
    policyRegistrationProfile,
    repeatsPolicyAuthorizationWhenSigning,
    requiresInteractivePolicyVerification,
    requiresPolicySetup,
    savedSignerCandidatesForDevice,
    shouldShowColdcardPolicyHelp
  } from '$lib/hardware/policy-readiness';
  import { hardwareDeviceDisplayName } from '$lib/hardware/discovery';
  import { fly } from 'svelte/transition';
  import { discreetMode } from '$lib/privacy';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import FeeSelector from '$lib/components/FeeSelector.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import {
    amountInputValue,
    amountUnit,
    convertAmountInput,
    denomination,
    formatAmount,
    parseAmountInput,
    setDenomination
  } from '$lib/denomination';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
  import { useWalletShellContext } from '$lib/wallet/shell-context';

  const walletShell = useWalletShellContext();
  const initialAcceleration: { txid: string; method: 'rbf' | 'cpfp' } | null = (() => {
    const method = page.url.searchParams.get('accelerate');
    const txid = page.url.searchParams.get('txid');
    if (!txid || (method !== 'rbf' && method !== 'cpfp')) return null;
    return { txid, method };
  })();
  let wallet = $state<MultisigWallet | null>(null),
    proposal = $state<MultisigProposal | null>(null),
    estimates = $state<FeeEstimates | null>(null);
  let address = $state(''),
    label = $state(''),
    amount = $state(''),
    selectedRate = $state<number | ''>(0),
    pin = $state(''),
    imported = $state(''),
    txid = $state(''),
    broadcastExplorerError = $state(''),
    error = $state(''),
    importError = $state(''),
    feeEstimateError = $state(''),
    deviceError = $state(''),
    cancelError = $state('');
  let selectedLabels = $state<string[]>([]);
  let labelSuggestions = $state<LabelSuggestion[]>([]);
  let visibleSuggestions = $derived(
    visibleLabelSuggestions(labelSuggestions, label, VISIBLE_LABEL_SUGGESTION_LIMIT, selectedLabels)
  );
  let submissionLabels = $derived(permanentLabelsForSubmission(selectedLabels, label));
  let discardError = $state(''),
    discardSigner = $state<{ label: string; fingerprint?: string | null } | null>(null);
  let busy = $state(false),
    savingPsbt = $state(false),
    deviceOpen = $state(false),
    addressOpen = $state(false),
    changeAddressOpen = $state(false),
    hardwareAddressOpen = $state(false),
    hardwareChangeAddressOpen = $state(false),
    importOpen = $state(false),
    qrOpen = $state(false),
    qrScanOpen = $state(false),
    paymentScanOpen = $state(false),
    cancelOpen = $state(false),
    exitOpen = $state(false),
    devices = $state<HardwareDevice[]>([]),
    activeHardwareDevice = $state<HardwareDevice | null>(null),
    urFrames = $state<string[]>([]),
    scannedFrames = $state<string[]>([]);
  let paymentScanError = $state('');
  let paymentRequestNotice = $state('');
  let pinOpen = $state(false),
    pinBusy = $state(false),
    pinChallenge = $state(''),
    pinPositions = $state(''),
    pinError = $state(''),
    pinErrorCode = $state<WalletErrorCode | ''>(''),
    pinDevice = $state<HardwareDevice | null>(null);
  let policyReviewOpen = $state(false),
    policyReviewBusy = $state(false),
    policyReviewError = $state(''),
    policyReviewDevice = $state<HardwareDevice | null>(null),
    policyVerifications = $state<SignerPolicyVerification[]>([]);
  let policyAddress = $state<PolicyVerificationAddress | null>(null);
  let coldcardSetupOpen = $state(false),
    coldcardSetupBusy = $state(false),
    coldcardSetupError = $state(''),
    coldcardSetupDevice = $state<HardwareDevice | null>(null);
  let accelerationRequest = $state<{ txid: string; method: 'rbf' | 'cpfp' } | null>(
    initialAcceleration
  );
  let accelerationLoading = $state(Boolean(initialAcceleration));
  let rbfQuote = $state<AccelerationQuote | null>(null);
  let cpfpQuote = $state<CpfpAccelerationQuote | null>(null);
  const broadcastExplorerUrl = $derived(
    txid ? transactionExplorerUrl(defaultConfig.network, txid) : null
  );
  let hardwareAction = $state<'scan' | 'sign'>('scan');
  let hardwareAttentionSignal = $state(0),
    hardwareCancelRequested = $state(false);
  let hardwareScanGeneration = 0;
  let coins = $state<Utxo[]>([]),
    selectedCoins = $state<string[]>([]),
    showCoins = $state(false),
    available = $state(0);
  let automaticStrategy = $state<AutomaticSelectionStrategy>('balanced');
  let maxSpendQuote = $state<MaxSpendQuote | null>(null);
  let maxSpendActive = $state(false);
  let maxSpendRequestRevision = 0;
  let renewalMode = $state(false),
    renewalCoin = $state<Utxo | null>(null);
  let delayedSpendMode = $state(false),
    delayedSpendCoin = $state<Utxo | null>(null);
  let selectionPreview = $state<CoinSelectionPreview | null>(null),
    selectionPreviewRevision = 0;
  let draftStep = $state<1 | 2>(1);
  let draftWalletId = '';
  let restoredPaymentDraft = false;
  let hasPaymentDraft = $state(false);
  let discardDraftOpen = $state(false);
  let discardingDraft = $state(false);
  let discardDraftError = $state('');
  let suppressDraftSave = false;
  const selection = $derived<CoinSelection>(
    presentedCoinSelection(selectedCoins, automaticStrategy)
  );
  const automaticStrategyLabel = $derived(
    translate($locale, automaticStrategyMessage(automaticStrategy))
  );
  const frozenAmount = $derived(
    coins.filter((coin) => coin.frozen).reduce((total, coin) => total + coin.amount, 0)
  );
  const proposalHasPrivacyWarning = $derived(
    Boolean(
      proposal &&
      (proposal.selectionImpact.newClusterLinks > 0 ||
        proposal.selectionImpact.hasUnknownProvenance ||
        proposal.selectionImpact.hasAddressReuse)
    )
  );
  const selectedReadyCoins = $derived(
    coins.filter((coin) => {
      const maturity = validPolicyMaturity(coin);
      return (
        selectedCoins.includes(coin.outpoint) &&
        maturity?.state === 'mature' &&
        maturity.delayedSpendSupported
      );
    })
  );
  const recoveryReadyCoins = $derived(
    coins.filter((coin) => {
      const maturity = validPolicyMaturity(coin);
      return !coin.frozen && maturity?.state === 'mature' && maturity.delayedSpendSupported;
    })
  );
  const recoveryReadyKeyName = $derived(
    (recoveryReadyCoins[0] ? validPolicyMaturity(recoveryReadyCoins[0]) : null)?.policyType ===
      'inheritance'
      ? 'heir key'
      : 'recovery key'
  );
  const regularRequired = $derived(
    wallet?.recoveryTemplate?.type === 'recovery'
      ? wallet.recoveryTemplate.immediate.threshold
      : (wallet?.threshold ?? 1)
  );
  const proposalReadyCoins = $derived.by(() => {
    const reviewed = proposal;
    return reviewed
      ? coins.filter(
          (coin) =>
            reviewed.selectedOutpoints.includes(coin.outpoint) &&
            validPolicyMaturity(coin)?.state === 'mature'
        )
      : [];
  });
  const showColdcardPolicyHelp = $derived(
    shouldShowColdcardPolicyHelp(wallet?.cosigners ?? [], devices, policyVerifications)
  );
  const selectedRateNumber = $derived(Number(selectedRate)),
    customFeeValid = $derived(
      Number.isFinite(selectedRateNumber) && selectedRateNumber > 0 && selectedRateNumber <= 10_000
    );
  const amountSats = $derived(parseAmountInput(amount, $denomination)),
    quotedMaxFee = $derived(
      matchingMaxSpendFee(maxSpendQuote, {
        recipient: address,
        feeRate: selectedRateNumber,
        coinSelection: selection,
        amount: amountSats
      })
    ),
    estimatedFee = $derived(quotedMaxFee ?? Math.ceil(selectedRateNumber * 220)),
    addressValid = $derived(hasAddressPrefixForNetwork(address, defaultConfig.network)),
    valid = $derived(
      addressValid &&
        submissionLabels.length > 0 &&
        Number.isSafeInteger(amountSats) &&
        amountSats > 0 &&
        amountSats + estimatedFee <= available &&
        customFeeValid
    );
  const intentValid = $derived(addressValid && submissionLabels.length > 0);
  const progressStep = $derived<1 | 2 | 3>(proposal ? 3 : draftStep);
  const renewalMaturity = $derived(renewalCoin ? validPolicyMaturity(renewalCoin) : null);
  const renewalKeyName = $derived(
    renewalMaturity?.policyType === 'inheritance' ? 'Heir key' : 'Recovery key'
  );
  const delayedSpendMaturity = $derived(
    delayedSpendCoin ? validPolicyMaturity(delayedSpendCoin) : null
  );
  const delayedSpendKeyName = $derived(
    delayedSpendMaturity?.policyType === 'inheritance' ? 'heir key' : 'recovery key'
  );
  const renewalValid = $derived(
    renewalMode && renewalCoin !== null && submissionLabels.length > 0 && customFeeValid
  );
  const delayedSpendValid = $derived(
    delayedSpendMode &&
      delayedSpendCoin !== null &&
      addressValid &&
      submissionLabels.length > 0 &&
      customFeeValid
  );
  const signaturesRemaining = $derived(
    proposal ? Math.max(0, proposal.required - proposal.signed) : 0
  );
  const signatureRequirementLabel = $derived(
    translate(
      $locale,
      signaturesRemaining === 1
        ? '{count} more signature required'
        : '{count} more signatures required',
      { count: signaturesRemaining }
    )
  );
  const eligibleSignerSet = $derived.by(() => {
    if (proposal)
      return new Set(proposal.eligibleSignerFingerprints.map((item) => item.toLowerCase()));
    if (wallet?.recoveryTemplate?.type !== 'recovery') return null;
    const ids = new Set(
      delayedSpendMode
        ? wallet.recoveryTemplate.recovery.signerIds
        : wallet.recoveryTemplate.immediate.signerIds
    );
    return new Set(
      wallet.cosigners
        .filter((item) => ids.has(item.id))
        .map((item) => item.fingerprint.toLowerCase())
    );
  });
  const signerItems = $derived(
    (wallet?.cosigners ?? [])
      .filter(
        (signer) => !eligibleSignerSet || eligibleSignerSet.has(signer.fingerprint.toLowerCase())
      )
      .map((signer) => ({
        label: signer.label,
        fingerprint: signer.fingerprint,
        detail:
          signer.deviceType ??
          translate($locale, '{source} signer', { source: translate($locale, signer.source) })
      }))
  );
  const hardwareDeviceIdentity = $derived(
    activeHardwareDevice ? `${activeHardwareDevice.label} ${activeHardwareDevice.model}` : ''
  );
  const hardwareTestnetAddressDevice = $derived(
    proposal?.recipientTestnetAlias ? testnetAddressDisplayName(hardwareDeviceIdentity) : null
  );
  const hardwareRecipient = $derived(
    addressForHardwareDisplay(
      proposal?.recipient ?? '',
      proposal?.recipientTestnetAlias,
      hardwareDeviceIdentity
    )
  );
  const hardwareChangeAddress = $derived(
    addressForHardwareDisplay(
      proposal?.changeAddresses[0] ?? '',
      proposal?.changeTestnetAliases[0],
      hardwareDeviceIdentity
    )
  );
  $effect(() => {
    const outpoints = selectedCoins,
      target = Number.isSafeInteger(amountSats) && amountSats > 0 ? amountSats : 0,
      revision = ++selectionPreviewRevision;
    if (!outpoints.length) {
      selectionPreview = null;
      return;
    }
    void walletService
      .previewMultisigCoinSelection(outpoints, sats(target))
      .then((preview) => {
        if (revision === selectionPreviewRevision) selectionPreview = preview;
      })
      .catch(() => {
        if (revision === selectionPreviewRevision) selectionPreview = null;
      });
  });
  function clearDraftError() {
    error = '';
  }
  function activateDelayedSpend(candidate: Utxo) {
    delayedSpendMode = true;
    delayedSpendCoin = candidate;
    renewalMode = false;
    renewalCoin = null;
    selectedCoins = [candidate.outpoint];
    error = '';
  }
  onDestroy(() => {
    if (!suppressDraftSave) void saveCurrentDraft();
    hardwareScanGeneration += 1;
    pin = '';
    imported = '';
    pinPositions = '';
    pinChallenge = '';
  });
  onMount(async () => {
    try {
      const [snapshot, loadedWallet, proposals, registry] = await Promise.all([
        walletService.multisigSnapshot(),
        walletService.multisigWallet(),
        walletService.multisigProposals(),
        walletService.profiles()
      ]);
      wallet = loadedWallet;
      const selectedProfile = registry.wallets.find(
        (profile) => profile.id === registry.selectedWalletId
      );
      draftWalletId = selectedProfile?.kind === 'multisig' ? selectedProfile.id : '';
      coins = snapshot.utxos;
      labelSuggestions = snapshot.labelSuggestions;
      void walletService
        .multisigSignerPolicyVerifications()
        .then((verifications) => (policyVerifications = verifications))
        .catch(() => undefined);
      void walletService
        .multisigPolicyVerificationAddress()
        .then((verificationAddress) => (policyAddress = verificationAddress))
        .catch(() => undefined);
      const url = new URL(window.location.href),
        requested = url.searchParams.get('coins')?.split(',').filter(Boolean) ?? [],
        requestedProposalId = url.searchParams.get('proposal'),
        renewalRequested = url.searchParams.get('renewProtection') === '1',
        delayedSpendRequested = url.searchParams.get('delayedSpend') === '1',
        method = url.searchParams.get('accelerate'),
        txid = url.searchParams.get('txid');
      selectedCoins = requested.filter((outpoint) =>
        coins.some((coin) => coin.outpoint === outpoint && !coin.frozen)
      );
      const snapshotCurrent = snapshot.chainTip.status === 'recent';
      if (renewalRequested && proposals.length === 0 && selectedCoins.length === 1) {
        const candidate = coins.find((coin) => coin.outpoint === selectedCoins[0]) ?? null;
        const maturity = candidate ? validPolicyMaturity(candidate) : null;
        if (candidate && maturity?.state === 'mature' && snapshotCurrent) {
          renewalMode = true;
          renewalCoin = candidate;
        } else {
          toast({
            title: translate($locale, 'Protection renewal unavailable'),
            description: translate(
              $locale,
              snapshotCurrent
                ? 'Choose one coin whose recovery or heir key can already spend.'
                : 'Sync the wallet before renewing protection.'
            ),
            tone: 'danger'
          });
        }
      } else if (renewalRequested && proposals.length > 0) {
        toast({
          title: translate($locale, 'Payment already in progress'),
          description: translate($locale, 'Finish or cancel it before renewing another coin.'),
          tone: 'danger'
        });
      } else if (delayedSpendRequested && proposals.length === 0 && selectedCoins.length === 1) {
        const candidate = coins.find((coin) => coin.outpoint === selectedCoins[0]) ?? null;
        const maturity = candidate ? validPolicyMaturity(candidate) : null;
        if (
          candidate &&
          maturity?.state === 'mature' &&
          maturity.delayedSpendSupported &&
          snapshotCurrent
        ) {
          delayedSpendMode = true;
          delayedSpendCoin = candidate;
        } else {
          toast({
            title: translate($locale, 'Recovery key unavailable'),
            description: translate(
              $locale,
              snapshotCurrent
                ? 'Choose one coin whose extra key is ready.'
                : 'Sync the wallet before using the extra key.'
            ),
            tone: 'danger'
          });
        }
      }
      if (!txid || (method !== 'rbf' && method !== 'cpfp')) {
        proposal = requestedProposalId
          ? (proposals.find((item) => item.proposalId === requestedProposalId) ?? null)
          : latestActiveProposal(proposals);
        if (proposal) {
          if (draftWalletId) await walletService.clearPaymentDraft();
          address = proposal.recipient;
          selectedLabels = proposal.labels ?? [proposal.label];
          label = '';
          amount = String(proposal.amount);
          draftStep = 2;
        } else if (requestedProposalId) {
          error = translate($locale, 'This saved payment is no longer available.');
        }
      }
      if (!proposal && !renewalMode && !delayedSpendMode && !accelerationRequest && draftWalletId) {
        const savedDraft = await walletService.paymentDraft();
        if (savedDraft?.kind === 'multisig') {
          restoredPaymentDraft = true;
          hasPaymentDraft = true;
          address = savedDraft.address;
          selectedLabels = savedDraft.labels;
          label = '';
          amount = savedDraft.amount;
          draftStep = savedDraft.stage;
          selectedRate = savedDraft.selectedRate;
          automaticStrategy = savedDraft.automaticStrategy;
          if (!requested.length) {
            selectedCoins = savedDraft.selectedCoins.filter((outpoint) =>
              coins.some((coin) => coin.outpoint === outpoint && !coin.frozen)
            );
          }
        }
      }
      updateAvailable();
      try {
        estimates = await walletService.estimateFees();
        if (!restoredPaymentDraft) selectedRate = Number(estimates.standard);
      } catch (cause) {
        feeEstimateError = localizedError(
          cause,
          $locale,
          'Bitcoin Core fee estimates are unavailable.'
        );
        toast({
          title: 'Fee estimates unavailable',
          description: feeEstimateError,
          tone: 'danger'
        });
      }
      if (txid && (method === 'rbf' || method === 'cpfp')) {
        accelerationRequest = { txid, method };
        if (method === 'rbf') {
          rbfQuote = await walletService.quoteRbf(txid);
          selectedRate = Number(rbfQuote.targetFeeRate);
        } else if (estimates) {
          cpfpQuote = await walletService.quoteCpfp(txid);
          selectedRate = Number(cpfpQuote.targetFeeRate);
        } else {
          selectedRate = '';
        }
      }
    } catch (cause) {
      if (accelerationRequest) {
        if (accelerationRequest.method === 'rbf' && !rbfQuote) selectedRate = '';
        feeEstimateError = accelerationUnavailableDescription(
          accelerationRequest.method,
          cause,
          $locale
        );
        toast({
          title: accelerationUnavailableTitle(accelerationRequest.method),
          description: feeEstimateError,
          tone: 'danger'
        });
      } else error = localizedError(cause, $locale, 'Could not load wallet.');
    } finally {
      accelerationLoading = false;
    }
  });
  function submitIntentOnEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    continueToAmount();
  }
  async function continueToAmount() {
    if (!intentValid) return;
    error = '';
    selectedLabels = submissionLabels;
    label = '';
    draftStep = 2;
    try {
      await saveCurrentDraft();
    } catch (cause) {
      draftStep = 1;
      error = localizedError(cause, $locale, 'Could not save payment draft.');
    }
  }
  async function receivePaymentRequest(value: string) {
    paymentScanError = '';
    try {
      const request = await walletService.inspectPaymentRequest(value);
      if (request.payjoin) {
        throw new WalletError(
          'invalid_payment_request',
          'This request requires Payjoin, which this Groot release cannot safely complete. Ask the recipient for a standard Bitcoin payment request instead.'
        );
      }
      address = request.address;
      amount = '';
      maxSpendRequestRevision += 1;
      maxSpendActive = false;
      maxSpendQuote = null;
      if (request.amountSats !== null) {
        const parsedAmount = Number(request.amountSats);
        if (!Number.isSafeInteger(parsedAmount) || parsedAmount < 0) {
          throw new WalletError(
            'invalid_payment_request',
            'The payment request amount is outside Groot’s supported range.'
          );
        }
        if (parsedAmount > 0) amount = amountInputValue(parsedAmount, $denomination);
      }

      const requestedLabel = request.message ?? request.label;
      let labelNote = '';
      if (submissionLabels.length === 0 && requestedLabel) {
        try {
          label = normalizePermanentLabel(requestedLabel);
          selectedLabels = [];
        } catch {
          labelNote = ' Its description is too long for a Groot label, so enter a label manually.';
        }
      } else if (submissionLabels.length > 0 && requestedLabel) {
        labelNote = ' Your existing payment label was kept.';
      }
      paymentRequestNotice = `Payment request scanned. Review the recipient${request.amountSats === null ? '' : ' and amount'}.${labelNote}`;
      error = '';
      paymentScanOpen = false;
      toast({
        title: 'Payment request scanned',
        description: paymentRequestNotice,
        tone: 'success'
      });
    } catch (cause) {
      paymentScanError = localizedError(
        cause,
        $locale,
        'This QR code is not a valid payment request for this wallet network.'
      );
    }
  }
  async function saveCurrentDraft() {
    if (
      suppressDraftSave ||
      !draftWalletId ||
      proposal ||
      renewalMode ||
      delayedSpendMode ||
      !addressValid ||
      submissionLabels.length === 0
    )
      return;
    await walletService.savePaymentDraft({
      kind: 'multisig',
      walletId: draftWalletId,
      address,
      labels: [...submissionLabels],
      amount,
      stage: draftStep,
      selectedCoins: [...selectedCoins],
      automaticStrategy,
      selectedRate: selectedRateNumber
    });
    hasPaymentDraft = true;
  }

  async function confirmDiscardPaymentDraft() {
    if (!hasPaymentDraft || proposal || discardingDraft) return;
    discardingDraft = true;
    discardDraftError = '';
    try {
      await walletService.clearPaymentDraft();
      suppressDraftSave = true;
      hasPaymentDraft = false;
      discardDraftOpen = false;
      toast({
        title: translate($locale, 'Payment draft discarded'),
        description: translate(
          $locale,
          'The unfinished payment was removed. No transaction was created.'
        ),
        tone: 'success'
      });
      await goto('/');
    } catch (cause) {
      suppressDraftSave = false;
      discardDraftError = localizedError(
        cause,
        $locale,
        'The payment draft could not be discarded.'
      );
    } finally {
      discardingDraft = false;
    }
  }
  async function prepare() {
    if (!valid) return;
    busy = true;
    error = '';
    try {
      proposal = await walletService.prepareMultisigPayment(
        address,
        submissionLabels,
        sats(amountSats),
        feeRate(selectedRateNumber),
        selection
      );
      if (draftWalletId) {
        await walletService.clearPaymentDraft();
        hasPaymentDraft = false;
      }
    } catch (cause) {
      error =
        cause instanceof WalletError && cause.code === 'insufficient_funds'
          ? `The amount plus network fee exceeds the ${selectedCoins.length ? 'selected coin balance' : 'available balance'}.`
          : localizedError(cause, $locale, 'Could not prepare payment.');
    } finally {
      busy = false;
    }
  }
  async function prepareRenewal() {
    if (!renewalValid || !renewalCoin) return;
    busy = true;
    error = '';
    try {
      proposal = await walletService.prepareMultisigPolicyRenewal(
        renewalCoin.outpoint,
        submissionLabels,
        feeRate(selectedRateNumber)
      );
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not prepare the protection renewal.');
    } finally {
      busy = false;
    }
  }
  async function prepareDelayedSpend() {
    if (!delayedSpendValid || !delayedSpendCoin) return;
    busy = true;
    error = '';
    try {
      proposal = await walletService.prepareMultisigDelayedSpend(
        delayedSpendCoin.outpoint,
        address,
        submissionLabels,
        feeRate(selectedRateNumber)
      );
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not prepare recovery-key payment.');
    } finally {
      busy = false;
    }
  }
  async function useMaxAmount(requestedFeeRate = selectedRateNumber, announce = true) {
    if (!addressValid || requestedFeeRate <= 0) return;
    const requestRevision = ++maxSpendRequestRevision;
    error = '';
    const request = {
      recipient: address,
      feeRate: requestedFeeRate,
      coinSelection:
        selection.mode === 'manual'
          ? { mode: 'manual' as const, outpoints: [...selection.outpoints] }
          : { mode: 'auto' as const, strategy: selection.strategy }
    };
    try {
      const maximum = await walletService.maxMultisigSpend(
        request.recipient,
        feeRate(request.feeRate),
        request.coinSelection
      );
      if (
        !isCurrentMaxSpendResponse(requestRevision, maxSpendRequestRevision, request, {
          recipient: address,
          feeRate: selectedRateNumber,
          coinSelection: selection
        })
      )
        return;
      const quote = validatedMaxSpendQuote(maximum, request);
      if (!quote) throw new Error('Native maximum-spend quote was invalid.');
      maxSpendQuote = quote;
      maxSpendActive = true;
      amount = amountInputValue(quote.amount, $denomination);
      if (announce) {
        toast({
          title: 'Maximum spendable amount selected',
          description:
            frozenAmount > 0
              ? 'Frozen coins remain in this wallet. Unfreeze them first to include them.'
              : 'The amount uses all spendable coins after the network fee.',
          tone: 'success'
        });
      }
    } catch (cause) {
      error = localizedError(cause, $locale, 'Maximum amount could not be calculated.');
    }
  }

  function toggleAmountInputDenomination() {
    const next = $denomination === 'btc' ? 'sats' : 'btc';
    const converted = convertAmountInput(amount, $denomination, next);
    if (converted === null) return;
    amount = converted;
    setDenomination(next);
  }
  function updatePaymentFeeRate(rate: number) {
    const refreshMaximum = maxSpendActive;
    selectedRate = rate;
    clearDraftError();
    if (refreshMaximum && Number.isFinite(rate) && rate > 0) void useMaxAmount(rate, false);
  }
  async function prepareCustomAcceleration() {
    const request = accelerationRequest;
    if (!request || !customFeeValid) return;
    busy = true;
    feeEstimateError = '';
    try {
      if (request.method === 'rbf') {
        rbfQuote = await walletService.quoteRbf(request.txid, feeRate(selectedRateNumber));
        selectedRate = Number(rbfQuote.targetFeeRate);
      } else {
        cpfpQuote = await walletService.quoteCpfp(request.txid, feeRate(selectedRateNumber));
        selectedRate = Number(cpfpQuote.targetFeeRate);
      }
      proposal = await walletService.prepareMultisigAcceleration(
        request.txid,
        request.method,
        feeRate(selectedRateNumber)
      );
      accelerationRequest = null;
    } catch (cause) {
      feeEstimateError = accelerationUnavailableDescription(request.method, cause, $locale);
      toast({
        title: accelerationUnavailableTitle(request.method),
        description: feeEstimateError,
        tone: 'danger'
      });
    } finally {
      busy = false;
    }
  }
  function updateAvailable() {
    available = coins
      .filter(
        (coin) => !coin.frozen && (!selectedCoins.length || selectedCoins.includes(coin.outpoint))
      )
      .reduce((total, coin) => total + coin.amount, 0);
  }
  function toggleCoin(outpoint: string, checked: boolean) {
    error = '';
    selectedCoins = toggleManualCoin(selectedCoins, outpoint, checked);
    updateAvailable();
  }
  function useAutomatic() {
    error = '';
    selectedCoins = [];
    showCoins = false;
    updateAvailable();
  }
  function deviceHasSigned(device: HardwareDevice) {
    return Boolean(
      device.fingerprint &&
      proposal?.signedFingerprints.some(
        (fingerprint) => fingerprint.toLowerCase() === device.fingerprint!.toLowerCase()
      )
    );
  }
  function savedSignerForDevice(device: HardwareDevice) {
    const candidates = savedSignerCandidatesForDevice(
      device,
      wallet?.cosigners ?? [],
      proposal?.eligibleSignerFingerprints ?? []
    );
    return candidates.length === 1 ? candidates[0] : null;
  }
  function devicePolicyVerification(device: HardwareDevice) {
    const signer = savedSignerForDevice(device);
    return signer ? matchingPolicyVerification(signer, policyVerifications) : null;
  }
  async function redirectExpiredHardwareSession(cause?: unknown): Promise<boolean> {
    if (cause && (!(cause instanceof WalletError) || cause.code !== 'wallet_locked')) return false;
    hardwareScanGeneration += 1;
    busy = false;
    pinBusy = false;
    deviceOpen = false;
    pinOpen = false;
    policyReviewOpen = false;
    coldcardSetupOpen = false;
    deviceError = '';
    toast({
      title: 'Wallet locked',
      description: 'Your session expired. Unlock this wallet before using a hardware signer.'
    });
    await goto('/unlock');
    return true;
  }
  async function hardwareSessionIsUnlocked(): Promise<boolean> {
    try {
      if ((await walletService.session()).unlocked) return true;
      await redirectExpiredHardwareSession();
      return false;
    } catch (cause) {
      if (await redirectExpiredHardwareSession(cause)) return false;
      deviceError = localizedError(cause, $locale, 'Could not verify the wallet session.');
      return false;
    }
  }
  async function scan() {
    if (!(await hardwareSessionIsUnlocked())) return;
    const generation = ++hardwareScanGeneration;
    deviceOpen = true;
    activeHardwareDevice = null;
    hardwareAction = 'scan';
    busy = true;
    deviceError = '';
    try {
      const discovered = await walletService.listHardwareDevices();
      if (generation !== hardwareScanGeneration || !deviceOpen) return;
      devices = discovered;
    } catch (cause) {
      if (generation !== hardwareScanGeneration) return;
      if (await redirectExpiredHardwareSession(cause)) return;
      devices = [];
      deviceError = localizedError(cause, $locale, 'Could not find hardware.');
    } finally {
      if (generation === hardwareScanGeneration) busy = false;
    }
  }
  function closeHardwareScan() {
    if (busy && hardwareAction !== 'scan') {
      hardwareCancelRequested = true;
      hardwareAttentionSignal += 1;
      if (policyReviewOpen) {
        policyReviewError =
          'Reject or cancel the pending request on the device. Groot will close this dialog after the device responds.';
      }
      return;
    }
    hardwareScanGeneration += 1;
    busy = false;
    deviceOpen = false;
  }
  function closePolicyReview() {
    if (policyReviewBusy) {
      if (busy && hardwareAction === 'sign') closeHardwareScan();
      return;
    }
    policyReviewOpen = false;
    policyReviewDevice = null;
    policyReviewError = '';
    deviceOpen = true;
  }
  async function handleHardware(device: HardwareDevice) {
    if (deviceHasSigned(device)) return;
    if (device.action === 'prompt_pin') {
      await startHardwarePin(device);
      return;
    }
    if (device.action === 'retry' || device.action === 'none') {
      deviceError = device.message;
      return;
    }
    const signer = savedSignerForDevice(device);
    const signerCandidates = savedSignerCandidatesForDevice(
      device,
      wallet?.cosigners ?? [],
      proposal?.eligibleSignerFingerprints ?? []
    );
    if (!device.fingerprint && !signer && requiresInteractivePolicyVerification(device)) {
      deviceError =
        signerCandidates.length > 1
          ? 'More than one saved signer uses this device family. Unlock the intended device and rescan so Groot can bind its exact fingerprint.'
          : 'Unlock this device and rescan so Groot can bind it to an eligible saved signer.';
      return;
    }
    if (
      proposal &&
      signer &&
      !proposal.eligibleSignerFingerprints.some(
        (fingerprint) => fingerprint.toLowerCase() === signer.fingerprint.toLowerCase()
      )
    ) {
      deviceError = 'This payment needs a different wallet key.';
      return;
    }
    const profile = policyRegistrationProfile(device);
    if (!profile.supported && profile.registration === 'unsupported') {
      deviceError = `${profile.name} is not supported by Groot's pinned HWI release and is not physically certified.`;
      return;
    }
    const verification = signer ? matchingPolicyVerification(signer, policyVerifications) : null;
    if (
      signer &&
      wallet?.recoveryTemplate?.type !== 'recovery' &&
      profile.registration === 'file_once' &&
      !verification
    ) {
      coldcardSetupDevice = device;
      coldcardSetupError = '';
      deviceOpen = false;
      coldcardSetupOpen = true;
      return;
    }
    if (
      signer &&
      wallet?.recoveryTemplate?.type !== 'recovery' &&
      requiresInteractivePolicyVerification(device) &&
      (repeatsPolicyAuthorizationWhenSigning(device) || !verification)
    ) {
      policyReviewDevice = device;
      policyReviewError = '';
      deviceOpen = false;
      policyReviewOpen = true;
      return;
    }
    await sign(device);
  }
  async function startHardwarePin(device: HardwareDevice) {
    const retrying = pinOpen;
    busy = true;
    pinBusy = retrying;
    deviceError = '';
    pinError = '';
    pinErrorCode = '';
    pinPositions = '';
    pinChallenge = '';
    try {
      pinChallenge = await walletService.promptHardwarePin(device.id);
      pinDevice = device;
      deviceOpen = false;
      pinOpen = true;
    } catch (cause) {
      if (await redirectExpiredHardwareSession(cause)) return;
      const message = localizedError(cause, $locale, 'Could not start the PIN matrix.');
      if (retrying) {
        pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
        pinError = message;
      } else deviceError = message;
    } finally {
      busy = false;
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
      toast({
        title: 'Hardware signer unlocked',
        description: 'Scanning again so you can select this signer.',
        tone: 'success'
      });
      await scan();
    } catch (cause) {
      if (await redirectExpiredHardwareSession(cause)) return;
      pinChallenge = '';
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      pinError = localizedError(cause, $locale, 'Trezor did not accept that matrix entry.');
    } finally {
      positions = '';
      pinBusy = false;
    }
  }
  function closeHardwareReviewOverlays() {
    hardwareAddressOpen = false;
    hardwareChangeAddressOpen = false;
  }
  async function sign(device: HardwareDevice) {
    if (!proposal) return;
    const releaseHardwareReview = walletShell.beginHardwareReview();
    const reviewingPolicy = policyReviewOpen && policyReviewDevice?.id === device.id;
    activeHardwareDevice = device;
    hardwareAction = 'sign';
    hardwareCancelRequested = false;
    busy = true;
    policyReviewBusy = true;
    deviceError = '';
    policyReviewError = '';
    if (!reviewingPolicy) deviceOpen = true;
    try {
      proposal = await walletService.signMultisigWithHardware(
        proposal.proposalId,
        device.id,
        proposal.psbt
      );
      closeHardwareReviewOverlays();
      policyReviewOpen = false;
      policyReviewDevice = null;
      deviceOpen = false;
      toast({
        title: 'Signature added',
        description: translate($locale, '{signed} of {required} signatures', {
          signed: proposal.signed,
          required: proposal.required
        }),
        tone: 'success'
      });
    } catch (cause) {
      if (await redirectExpiredHardwareSession(cause)) return;
      closeHardwareReviewOverlays();
      policyReviewOpen = false;
      deviceOpen = !hardwareCancelRequested;
      deviceError = hardwareCancelRequested
        ? ''
        : localizedError(cause, $locale, 'Device signing failed.');
    } finally {
      releaseHardwareReview();
      busy = false;
      policyReviewBusy = false;
      hardwareCancelRequested = false;
    }
  }
  function showTransactionDuringSigning() {
    policyReviewOpen = false;
    deviceOpen = true;
  }
  function showPolicyDuringSigning() {
    if (!busy || !policyReviewDevice) return;
    deviceOpen = false;
    policyReviewOpen = true;
  }
  async function verifyPolicyBeforeSigning() {
    const device = policyReviewDevice,
      signer = device ? savedSignerForDevice(device) : null;
    if (!device || !signer || policyReviewBusy) return;
    policyReviewBusy = true;
    policyReviewError = '';
    try {
      const verification = await walletService.verifyMultisigSignerPolicy(
        device.id,
        signer.fingerprint
      );
      policyVerifications = [
        verification,
        ...policyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      toast({
        title: 'Wallet policy verified',
        description:
          'The device returned the correct first address. Continue to transaction signing.',
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
  async function confirmColdcardPolicy() {
    const device = coldcardSetupDevice,
      signer = device ? savedSignerForDevice(device) : null;
    if (!device || !signer || coldcardSetupBusy) return;
    coldcardSetupBusy = true;
    coldcardSetupError = '';
    try {
      const verification = await walletService.acknowledgeColdcardPolicy(signer.fingerprint);
      policyVerifications = [
        verification,
        ...policyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      coldcardSetupOpen = false;
      toast({
        title: 'Coldcard policy recorded',
        description: 'Continue with the transaction review on-device.',
        tone: 'success'
      });
      await sign(device);
    } catch (cause) {
      coldcardSetupError = localizedError(
        cause,
        $locale,
        'Could not record the Coldcard policy check.'
      );
    } finally {
      coldcardSetupBusy = false;
    }
  }
  async function importPsbt() {
    if (!proposal || !imported.trim()) return;
    busy = true;
    importError = '';
    error = '';
    try {
      proposal = await walletService.importMultisigProposal(
        proposal.proposalId,
        proposal.psbt,
        imported
      );
      imported = '';
      importOpen = false;
      toast({
        title: 'Signed PSBT merged',
        description: translate($locale, '{signed} of {required} signatures', {
          signed: proposal.signed,
          required: proposal.required
        }),
        tone: 'success'
      });
    } catch (cause) {
      importError = localizedError(cause, $locale, 'PSBT import failed.');
      toast({ title: 'Signed PSBT rejected', description: importError, tone: 'danger' });
    } finally {
      busy = false;
    }
  }
  function openPsbtImport() {
    imported = '';
    importError = '';
    error = '';
    importOpen = true;
  }
  function closePsbtImport() {
    if (busy) return;
    const durableError = importError;
    imported = '';
    importError = '';
    importOpen = false;
    error = durableError;
  }
  async function broadcast() {
    if (!proposal || !pin) return;
    busy = true;
    error = '';
    try {
      const result = await walletService.broadcastMultisigProposal(
        proposal.proposalId,
        proposal.psbt,
        pin
      );
      txid = result.txid;
    } catch (cause) {
      error = localizedError(cause, $locale, 'Broadcast failed.');
    } finally {
      pin = '';
      busy = false;
    }
  }
  async function copyBroadcastTxid() {
    if (!txid) return;
    try {
      await copyText(txid, 'identifier');
      toast({ title: 'Transaction ID copied', tone: 'success' });
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }
  async function openBroadcastExplorer() {
    if (!txid || !broadcastExplorerUrl) return;
    broadcastExplorerError = '';
    try {
      await walletService.openTransactionExplorer(txid);
    } catch (cause) {
      broadcastExplorerError = localizedError(
        cause,
        $locale,
        'The system browser could not open the explorer.'
      );
      toast({
        title: translate($locale, 'Could not open explorer'),
        description: broadcastExplorerError,
        tone: 'danger'
      });
    }
  }
  async function confirmCancel() {
    if (!proposal || busy) return;
    busy = true;
    cancelError = '';
    try {
      await walletService.cancelMultisigProposal(proposal.proposalId);
      proposal = null;
      address = '';
      label = '';
      amount = '';
      pin = '';
      draftStep = 1;
      cancelOpen = false;
      toast({
        title: 'Payment canceled',
        description: 'The unsigned transaction and any collected signatures were discarded.'
      });
      await goto('/');
    } catch (cause) {
      cancelError = localizedError(cause, $locale, 'The payment could not be canceled.');
    } finally {
      busy = false;
    }
  }
  async function confirmDiscardSignature() {
    if (!proposal || !discardSigner?.fingerprint || busy) return;
    busy = true;
    discardError = '';
    try {
      proposal = await walletService.discardMultisigSignature(
        proposal.proposalId,
        proposal.psbt,
        discardSigner.fingerprint
      );
      discardSigner = null;
      toast({
        title: 'Local signature discarded',
        description: translate($locale, '{signed} of {required} signatures remain', {
          signed: proposal.signed,
          required: proposal.required
        }),
        tone: 'success'
      });
    } catch (cause) {
      discardError = localizedError(cause, $locale, 'The local signature could not be discarded.');
    } finally {
      busy = false;
    }
  }
  async function copyPsbt() {
    if (!proposal) return;
    await copyText(proposal.psbt, 'transaction-data');
    toast({ title: 'PSBT copied', tone: 'success' });
  }
  async function saveProposalPsbt() {
    if (!proposal || savingPsbt) return;
    savingPsbt = true;
    error = '';
    try {
      const signed = proposal.signed > 0;
      const saved = await walletService.savePsbt(
        psbtFilename(proposal.proposalId, proposal.signed),
        proposal.psbt
      );
      if (saved.saved)
        toast({
          title: signed ? 'Signed PSBT saved' : 'PSBT saved',
          description: translate(
            $locale,
            signed
              ? 'The signed transaction was saved to the selected file.'
              : 'The unsigned transaction was saved to the selected file.'
          ),
          tone: 'success',
          action:
            saved.revealToken && saved.revealLabel
              ? {
                  label: saved.revealLabel,
                  run: async () => {
                    try {
                      await walletService.revealSavedFile(saved.revealToken!);
                    } catch (cause) {
                      toast({
                        title: 'Could not show saved PSBT',
                        description: localizedError(cause, $locale),
                        tone: 'danger'
                      });
                    }
                  }
                }
              : undefined
        });
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not save the PSBT.');
      toast({ title: 'Could not save PSBT', description: error, tone: 'danger' });
    } finally {
      savingPsbt = false;
    }
  }
  async function loadPsbtFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    importError = '';
    try {
      imported = await readTransferFile(file);
      toast({ title: 'Signed PSBT file loaded', tone: 'success' });
    } catch (cause) {
      importError = localizedError(cause, $locale, 'Could not read PSBT file.');
      toast({ title: 'Could not read PSBT file', description: importError, tone: 'danger' });
    }
  }
  async function showPsbtQr() {
    if (!proposal) return;
    busy = true;
    error = '';
    try {
      urFrames = await walletService.encodePsbtUr(proposal.psbt);
      qrOpen = true;
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not encode the PSBT QR.');
    } finally {
      busy = false;
    }
  }
  async function saveColdcardPolicy() {
    if (!wallet || coldcardSetupBusy) return;
    coldcardSetupBusy = true;
    coldcardSetupError = '';
    try {
      const saved = await walletService.savePublicBackup(
        coldcardPolicyFilename(wallet.name),
        `# Groot multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${wallet.externalDescriptor}\n`
      );
      if (saved.saved)
        toast({
          title: 'Coldcard policy saved',
          description: 'Import and verify it on the Coldcard before signing.',
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
      coldcardSetupError = localizedError(cause, $locale, 'Could not save the Coldcard policy.');
    } finally {
      coldcardSetupBusy = false;
    }
  }
  async function receiveUrFrame(frame: string) {
    if (scannedFrames.includes(frame)) return;
    scannedFrames = [...scannedFrames, frame];
    try {
      imported = await walletService.decodePsbtUr(scannedFrames);
      qrScanOpen = false;
      await importPsbt();
    } catch (cause) {
      const message = localizedError(cause, $locale, '');
      if (!message.includes('Keep scanning')) error = message || 'The QR frame was rejected.';
    }
  }
</script>

{#snippet labelTokenPicker(id: string, title: string, placeholder: string, hint: string)}
  <PermanentLabelEditor
    {id}
    {title}
    {placeholder}
    {hint}
    discreet={$discreetMode}
    suggestions={visibleSuggestions}
    bind:labels={selectedLabels}
    bind:value={label}
    onedit={clearDraftError}
  />
{/snippet}

<div class="page narrow-page send-page" class:signing-page={Boolean(proposal)}>
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'SEND')}</p>
      <h1>
        {translate(
          $locale,
          renewalMode
            ? 'Renew protection'
            : delayedSpendMode
              ? translate($locale, 'Use {key}', { key: delayedSpendKeyName })
              : 'Send bitcoin'
        )}
      </h1>
      <p class="subtitle">
        {translate(
          $locale,
          renewalMode
            ? proposal
              ? 'Review the renewal, then approve it with your usual keys.'
              : 'Move this coin within your wallet to restart its protection.'
            : delayedSpendMode
              ? proposal
                ? translate($locale, 'Review once, then approve with the {key}.', {
                    key: delayedSpendKeyName
                  })
                : translate(
                    $locale,
                    'Send this coin with the {key}. The fee is deducted automatically.',
                    { key: delayedSpendKeyName }
                  )
              : !proposal && draftStep === 1
                ? 'Name the payment and choose its recipient.'
                : !proposal
                  ? 'Choose the amount, coins, and network fee.'
                  : `Review once, then collect ${wallet?.threshold ?? 'the required'} signatures.`
        )}
      </p>
    </div>
    <div class="page-header-actions">
      {#if hasPaymentDraft && !proposal && !renewalMode && !delayedSpendMode && !accelerationRequest}<Button
          variant="ghost-danger"
          size="small"
          onclick={() => {
            discardDraftError = '';
            discardDraftOpen = true;
          }}><Trash2 size={14} />{translate($locale, 'Discard draft')}</Button
        >{/if}{#if proposal}<Button
          variant="secondary"
          ariaLabel="Back to overview"
          onclick={() => (exitOpen = true)}>{translate($locale, 'Back')}</Button
        >{:else}<Button variant="secondary" ariaLabel="Back to overview" href="/"
          >{translate($locale, 'Back')}</Button
        >{/if}
    </div>
  </header>
  {#if !txid && ((!renewalMode && !delayedSpendMode) || proposal)}<SendProgress
      current={progressStep}
    />{#if accelerationLoading}<SignerSummary
        signers={[]}
        loading
      />{:else if wallet && !proposal && !renewalMode && !delayedSpendMode}<SignerSummary
        signers={signerItems}
        required={regularRequired}
        signedFingerprints={[]}
        collecting={false}
      />{/if}{/if}
  {#if !txid && !proposal && !renewalMode && !delayedSpendMode && recoveryReadyCoins.length}<section
      class="recovery-key-option"
      aria-live="polite"
    >
      <span><LockKeyhole size={17} /></span>
      <div>
        <strong
          >{translate(
            $locale,
            recoveryReadyCoins.length === 1
              ? 'Your {key} can spend 1 coin'
              : 'Your {key} can spend {count} coins',
            { key: recoveryReadyKeyName, count: recoveryReadyCoins.length }
          )}</strong
        ><small
          >{translate(
            $locale,
            'Use the one-key recovery flow, or continue here with your normal 2-of-3 keys.'
          )}</small
        >
      </div>
      <Button
        size="small"
        variant="secondary"
        onclick={recoveryReadyCoins.length === 1
          ? () => activateDelayedSpend(recoveryReadyCoins[0])
          : undefined}
        href={recoveryReadyCoins.length === 1
          ? `/multisig/send?coins=${encodeURIComponent(recoveryReadyCoins[0].outpoint)}&delayedSpend=1${typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('fixture-policy-maturity') === '1' ? '&fixture-policy-maturity=1' : ''}`
          : '/coins'}
        >{translate($locale, recoveryReadyCoins.length === 1 ? 'Use {key}' : 'Choose a coin', {
          key: recoveryReadyKeyName
        })}</Button
      >
    </section>{/if}
  {#if delayedSpendMode && delayedSpendCoin && delayedSpendMaturity}<section
      class="policy-renewal-banner"
      aria-live="polite"
    >
      <span><LockKeyhole size={18} /></span>
      <div>
        <strong>{translate($locale, 'The {key} is ready', { key: delayedSpendKeyName })}</strong>
        <p>
          {translate(
            $locale,
            'It can now move this coin by itself. Your usual 2-of-3 keys still work too.'
          )}
        </p>
        <details>
          <summary>{translate($locale, 'What happens')}</summary>
          <ul>
            <li>
              {translate(
                $locale,
                'This sends one coin to the address you choose. No other wallet coins are combined.'
              )}
            </li>
            <li>
              {translate(
                $locale,
                'The network fee is deducted from that coin, so the recipient gets the remainder.'
              )}
            </li>
            <li>{translate($locale, 'Only the extra key signs this payment.')}</li>
          </ul>
        </details>
      </div>
    </section>
  {:else if renewalMode && renewalCoin && renewalMaturity}<section
      class="policy-renewal-banner"
      aria-live="polite"
    >
      <span><RefreshCw size={18} /></span>
      <div>
        <strong>{translate($locale, 'Lock the extra key again')}</strong>
        <p>
          {translate(
            $locale,
            'Only this coin moves. Its protection restarts after the new coin confirms.'
          )}
        </p>
        <details>
          <summary>{translate($locale, 'How it works')}</summary>
          <ul>
            <li>
              {translate(
                $locale,
                'Your usual 2-of-3 keys approve the move. The {key} is not used.',
                { key: translate($locale, renewalKeyName) }
              )}
            </li>
            <li>
              {translate(
                $locale,
                'After confirmation, the new coin gets a fresh {count}-block wait.',
                { count: renewalMaturity.delayBlocks.toLocaleString() }
              )}
            </li>
            <li>
              {translate(
                $locale,
                'The fee comes from this coin. No other coin is combined, but the move remains visible onchain.'
              )}
            </li>
          </ul>
        </details>
      </div>
    </section>{/if}
  {#if txid}<section class="empty-state success-state">
      <span class="empty-icon success"><Check size={25} /></span>
      <h2>
        {translate(
          $locale,
          renewalMode
            ? 'Protection renewal broadcast'
            : delayedSpendMode
              ? 'Recovery-key payment broadcast'
              : proposal?.acceleration
                ? 'Transaction accelerated'
                : 'Transaction broadcast'
        )}
      </h2>
      {#if proposal}<div class="success-amount">
          <Amount
            value={proposal.acceleration?.method === 'cpfp'
              ? Number(proposal.fee)
              : Number(proposal.amount)}
            interactive
          />
        </div>{/if}
      <p>
        {#if proposal?.acceleration?.method === 'rbf'}{translate(
            $locale,
            'The higher fee was accepted. Your payment amount and recipient stayed the same.'
          )}{:else if proposal?.acceleration?.method === 'cpfp'}{translate(
            $locale,
            'The additional fee was accepted. Your payment is waiting for confirmation.'
          )}{:else}{translate($locale, 'The signed transaction was accepted by the')}
          {networkName(defaultConfig.network)}
          {translate($locale, 'network.')}{/if}
      </p>
      <button class="hash-box" type="button" onclick={copyBroadcastTxid}
        ><span>{translate($locale, 'Transaction ID')}</span><code>{compactIdentifier(txid)}</code
        ><Copy size={16} /></button
      >
      <div class="success-actions">
        <Button href="/multisig">{translate($locale, 'Return to wallet')}</Button>
        <Button variant="secondary" href="/activity"
          >{translate($locale, 'View transaction')}</Button
        >
      </div>
      {#if broadcastExplorerUrl}<div class="explorer-panel">
          <button class="explorer-link" type="button" onclick={openBroadcastExplorer}
            >{translate($locale, 'View on mempool.space')} <ExternalLink size={14} /></button
          >{#if broadcastExplorerError}<p class="form-error" role="alert">
              {broadcastExplorerError}
            </p>{/if}
          <p class="explorer-privacy">
            {translate($locale, 'Opening this shares the transaction lookup with mempool.space.')}
          </p>
        </div>{/if}
    </section>
  {:else if accelerationLoading}<section
      class="form-card send-stage-card acceleration-loading-card"
      aria-live="polite"
    >
      <RefreshCw class="spin" size={28} />
      <div class="send-stage-heading">
        <span>{translate($locale, 'FEE ACCELERATION')}</span>
        <h2>{translate($locale, 'Preparing fee acceleration')}</h2>
        <p>
          {translate(
            $locale,
            'Reading the original transaction and current fee policy from Bitcoin Core.'
          )}
        </p>
      </div>
      <div class="acceleration-loading-lines" aria-hidden="true"><i></i><i></i><i></i></div>
    </section>
  {:else if accelerationRequest}<form
      class="form-card send-stage-card"
      onsubmit={(event) => {
        event.preventDefault();
        prepareCustomAcceleration();
      }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'FEE ACCELERATION')}</span>
        <h2>
          {translate(
            $locale,
            (accelerationRequest.method === 'rbf' && rbfQuote) ||
              (accelerationRequest.method === 'cpfp' && cpfpQuote)
              ? 'Speed up transaction'
              : 'Enter a custom fee rate'
          )}
        </h2>
        <p>
          {translate(
            $locale,
            (accelerationRequest.method === 'rbf' && rbfQuote) ||
              (accelerationRequest.method === 'cpfp' && cpfpQuote)
              ? 'Confirm the additional fee, then continue to sign.'
              : 'Bitcoin Core has no usable estimate. Groot will not invent one; choose the sat/vB rate\n          every signer will review.'
          )}
        </p>
      </div>
      {#if (accelerationRequest.method === 'rbf' && rbfQuote) || (accelerationRequest.method === 'cpfp' && cpfpQuote)}
        <div class="acceleration-default-choice">
          <span>{translate($locale, 'You will spend this much more')}</span>
          <Amount
            value={accelerationRequest.method === 'rbf'
              ? (rbfQuote?.incrementalFee ?? 0)
              : (cpfpQuote?.childFee ?? 0)}
            interactive
          />
          <p>
            {translate(
              $locale,
              accelerationRequest.method === 'rbf'
                ? 'Your payment amount and recipient will not change.'
                : 'This child fee helps the parent and child confirm together.'
            )}
          </p>
        </div>
        <details class="acceleration-optional-control">
          <summary>{translate($locale, 'Change fee rate')}</summary>
          <label class="field"
            ><span
              >{translate(
                $locale,
                accelerationRequest.method === 'cpfp' ? 'Package fee rate' : 'New fee rate'
              )}</span
            >
            <div class="amount-input">
              <input
                aria-label={translate($locale, 'Custom acceleration fee rate')}
                bind:value={selectedRate}
                onblur={async () => {
                  if (!accelerationRequest || !customFeeValid) return;
                  try {
                    if (accelerationRequest.method === 'rbf') {
                      rbfQuote = await walletService.quoteRbf(
                        accelerationRequest.txid,
                        feeRate(selectedRateNumber)
                      );
                      selectedRate = Number(rbfQuote.targetFeeRate);
                    } else {
                      cpfpQuote = await walletService.quoteCpfp(
                        accelerationRequest.txid,
                        feeRate(selectedRateNumber)
                      );
                      selectedRate = Number(cpfpQuote.targetFeeRate);
                    }
                    feeEstimateError = '';
                  } catch (cause) {
                    feeEstimateError = accelerationUnavailableDescription(
                      accelerationRequest.method,
                      cause,
                      $locale
                    );
                  }
                }}
                inputmode="decimal"
                placeholder={translate($locale, 'Enter a fee rate')}
              /><b>{translate($locale, 'sat/vB')}</b>
            </div>
            <small
              >{translate($locale, 'Minimum {rate} sat/vB', {
                rate:
                  accelerationRequest.method === 'rbf'
                    ? (rbfQuote?.minimumFeeRate ?? 0)
                    : (cpfpQuote?.minimumFeeRate ?? 0)
              })}</small
            ></label
          >
        </details>
        <details class="acceleration-optional-control">
          <summary>{translate($locale, 'View fee details')}</summary>
          {#if accelerationRequest.method === 'rbf' && rbfQuote}<dl
              class="details-list acceleration-quote-details"
            >
              <div>
                <dt>{translate($locale, 'Original fee rate')}</dt>
                <dd>{rbfQuote.originalEffectiveFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'Minimum fee rate')}</dt>
                <dd>{rbfQuote.minimumFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'New fee rate')}</dt>
                <dd>{rbfQuote.targetFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'New network fee')}</dt>
                <dd><Amount value={rbfQuote.estimatedReplacementFee} /></dd>
              </div>
              <div>
                <dt>{translate($locale, 'Additional fee')}</dt>
                <dd><Amount value={rbfQuote.incrementalFee} /></dd>
              </div>
              <div>
                <dt>{translate($locale, 'Effective fee rate')}</dt>
                <dd>{rbfQuote.resultingEffectiveFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
            </dl>{:else if cpfpQuote}<dl class="details-list acceleration-quote-details">
              <div>
                <dt>{translate($locale, 'Parent fee rate')}</dt>
                <dd>{cpfpQuote.parentEffectiveFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'Minimum package rate')}</dt>
                <dd>{cpfpQuote.minimumFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'Target package rate')}</dt>
                <dd>{cpfpQuote.targetFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'Child network fee')}</dt>
                <dd><Amount value={cpfpQuote.childFee} /></dd>
              </div>
              <div>
                <dt>{translate($locale, 'Package network fee')}</dt>
                <dd><Amount value={cpfpQuote.packageFee} /></dd>
              </div>
              <div>
                <dt>{translate($locale, 'Effective package rate')}</dt>
                <dd>{cpfpQuote.resultingPackageFeeRate} {translate($locale, 'sat/vB')}</dd>
              </div>
            </dl>{/if}
        </details>
      {:else}
        <label class="field"
          ><span>{translate($locale, 'Custom fee rate')}</span>
          <div class="amount-input">
            <input
              aria-label={translate($locale, 'Custom acceleration fee rate')}
              bind:value={selectedRate}
              inputmode="decimal"
              placeholder={translate($locale, 'Enter a fee rate')}
            /><b>{translate($locale, 'sat/vB')}</b>
          </div>
          <small>{translate($locale, 'Required · greater than 0 and at most 10,000 sat/vB')}</small
          ></label
        >
      {/if}
      {#if feeEstimateError}<p class="form-error" role="alert">{feeEstimateError}</p>{/if}<Button
        type="submit"
        size="large"
        class="full"
        disabled={!customFeeValid}
        loading={busy}
        loadingLabel={translate($locale, 'Preparing acceleration…')}
        >{translate($locale, 'Continue to sign')}</Button
      >
    </form>
  {:else if delayedSpendMode && delayedSpendCoin && !proposal}<form
      class="form-card send-stage-card"
      onsubmit={(event) => {
        event.preventDefault();
        prepareDelayedSpend();
      }}
      in:fly={{ x: 8, duration: 180 }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'RECOVERY PAYMENT')}</span>
        <h2>{translate($locale, 'Where should this coin go?')}</h2>
        <p>
          {translate($locale, 'The {key} signs alone. The fee is deducted from this coin.', {
            key: delayedSpendKeyName
          })}
        </p>
      </div>
      <div class="renewal-coin-summary">
        <span>{translate($locale, 'Coin available')}</span>
        <strong><Amount value={delayedSpendCoin.amount} hidden={$discreetMode} /></strong>
        <small>{translate($locale, 'Ready for the {key}', { key: delayedSpendKeyName })}</small>
      </div>
      <label class="field"
        ><span>{translate($locale, 'Send to')}</span><input
          aria-label={translate($locale, 'Bitcoin address')}
          bind:value={address}
          oninput={clearDraftError}
          placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…"
        />{#if address && !addressValid}<em
            >{translate($locale, 'Enter a valid')}
            {networkName(defaultConfig.network)}
            {translate($locale, 'address')}</em
          >{/if}</label
      >
      {@render labelTokenPicker(
        'delayed-spend-label-input',
        translate($locale, 'Label'),
        translate($locale, 'e.g. Emergency recovery'),
        translate($locale, 'Required · cannot be changed')
      )}
      <details class="selection-technical">
        <summary
          >{translate($locale, 'Network fee · {rate} sat/vB', {
            rate: selectedRateNumber || translate($locale, 'Not available')
          })}</summary
        >
        <FeeSelector
          {estimates}
          value={selectedRateNumber}
          {estimatedFee}
          error={feeEstimateError}
          onchange={(rate) => {
            selectedRate = rate;
            clearDraftError();
          }}
        />
      </details>
      {#if error}<div class="hardware-inline-error send-form-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{translate($locale, 'Payment could not be prepared')}</strong><small
              >{error}</small
            ></span
          >
        </div>{/if}
      <Button
        type="submit"
        size="large"
        class="full"
        disabled={!delayedSpendValid}
        loading={busy}
        loadingLabel={translate($locale, 'Preparing payment…')}
        >{translate($locale, 'Review {key} payment', { key: delayedSpendKeyName })}</Button
      >
    </form>
  {:else if renewalMode && renewalCoin && !proposal}<form
      class="form-card send-stage-card"
      onsubmit={(event) => {
        event.preventDefault();
        prepareRenewal();
      }}
      in:fly={{ x: 8, duration: 180 }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'COIN PROTECTION')}</span>
        <h2>{translate($locale, 'Renew this coin’s protection')}</h2>
        <p>
          {translate($locale, 'Choose a label and fee. You will review everything before signing.')}
        </p>
      </div>
      <div class="renewal-coin-summary">
        <span>{translate($locale, 'Coin being renewed')}</span>
        <strong><Amount value={renewalCoin.amount} hidden={$discreetMode} /></strong>
        <small
          >{translate($locale, '{key} can spend now', {
            key: translate($locale, renewalKeyName)
          })}</small
        >
      </div>
      {@render labelTokenPicker(
        'renewal-label-input',
        translate($locale, 'Transaction label'),
        translate($locale, 'e.g. Renew savings protection'),
        translate($locale, 'Required · cannot be changed; reuse is intentional')
      )}
      <details class="selection-technical">
        <summary
          >{translate($locale, 'Network fee · {rate} sat/vB', {
            rate: selectedRateNumber || translate($locale, 'Not available')
          })}</summary
        >
        <FeeSelector
          {estimates}
          value={selectedRateNumber}
          {estimatedFee}
          error={feeEstimateError}
          onchange={(rate) => {
            selectedRate = rate;
            clearDraftError();
          }}
        />
      </details>
      {#if error}<div class="hardware-inline-error send-form-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{translate($locale, 'Protection renewal could not be prepared')}</strong><small
              >{error}</small
            ></span
          >
        </div>{/if}
      <Button
        type="submit"
        size="large"
        class="full"
        disabled={!renewalValid}
        loading={busy}
        loadingLabel={translate($locale, 'Preparing renewal…')}
        >{translate($locale, 'Review protection renewal')}</Button
      >
    </form>
  {:else if !proposal && draftStep === 1}
    <form
      class="form-card send-stage-card"
      onsubmit={(e) => {
        e.preventDefault();
        continueToAmount();
      }}
      in:fly={{ x: 8, duration: 180 }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'STEP 1')}</span>
        <h2>{translate($locale, 'What is this payment for?')}</h2>
        <p>
          {translate($locale, 'Labels help every signer recognize the transaction.')}
        </p>
      </div>
      {@render labelTokenPicker(
        'multisig-send-label-input',
        translate($locale, 'Payment label'),
        translate($locale, 'e.g. Hardware purchase, Pay Alex, Test transaction'),
        translate($locale, 'Required · cannot be changed')
      )}
      <div class="field">
        <span>{translate($locale, 'Bitcoin address')}</span>
        <div class="address-input-control">
          <input
            aria-label={translate($locale, 'Bitcoin address')}
            bind:value={address}
            oninput={() => {
              clearDraftError();
              paymentRequestNotice = '';
            }}
            onkeydown={submitIntentOnEnter}
            placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…"
          /><button
            type="button"
            aria-label={translate($locale, 'Scan Bitcoin payment QR')}
            title={translate($locale, 'Scan Bitcoin payment QR')}
            onclick={() => {
              paymentScanError = '';
              paymentScanOpen = true;
            }}><QrCode size={19} /></button
          >
        </div>
        {#if address && !addressValid}<em
            >{translate($locale, 'Enter a valid')}
            {networkName(defaultConfig.network)}
            {translate($locale, 'address')}</em
          >{/if}{#if paymentRequestNotice}<small class="payment-request-result" role="status"
            >{paymentRequestNotice}</small
          >{/if}
      </div>
      <Button type="submit" size="large" class="full" disabled={!intentValid}
        >{translate($locale, 'Continue to amount')}</Button
      >
      {#if error}<div class="hardware-inline-error send-form-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{translate($locale, 'Could not save payment draft')}</strong><small
              >{error}</small
            ></span
          >
        </div>{/if}
    </form>
  {:else if !proposal}
    <form
      class="form-card send-stage-card"
      onsubmit={(e) => {
        e.preventDefault();
        prepare();
      }}
      in:fly={{ x: 8, duration: 180 }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'STEP 2')}</span>
        <h2>{translate($locale, 'Fund the payment')}</h2>
        <p>
          {translate(
            $locale,
            'Set the amount, then keep automatic selection or choose specific coins.'
          )}
        </p>
      </div>
      <label class="field"
        ><span>{translate($locale, 'Amount')}</span>
        <div class="amount-input">
          <input
            aria-label={translate($locale, 'Amount')}
            bind:value={amount}
            oninput={() => {
              maxSpendRequestRevision += 1;
              maxSpendActive = false;
              maxSpendQuote = null;
              clearDraftError();
            }}
            inputmode={$denomination === 'btc' ? 'decimal' : 'numeric'}
            placeholder="0"
          /><button
            class="amount-unit-toggle"
            type="button"
            aria-label={translate(
              $locale,
              $denomination === 'btc'
                ? 'Show transaction amount in sats'
                : 'Show transaction amount in BTC'
            )}
            onclick={toggleAmountInputDenomination}
            >{translate($locale, $denomination === 'btc' ? 'BTC' : 'sats')}</button
          ><button class="amount-max-action" type="button" onclick={() => void useMaxAmount()}
            >{translate($locale, 'Max')}</button
          >
        </div>
        <small class="available-balance-summary"
          ><span
            >{translate($locale, 'Available:')}
            <Amount value={available} hidden={$discreetMode} /></span
          >{#if frozenAmount > 0}<span class="frozen-balance-guidance"
              ><Amount value={frozenAmount} hidden={$discreetMode} />
              {translate($locale, 'frozen')} ·
              <a href="/coins">{translate($locale, 'Review frozen coins')}</a></span
            >{/if}</small
        ></label
      >
      {#if maxSpendActive}<p class="max-spend-guidance" role="status">
          {translate(
            $locale,
            frozenAmount > 0
              ? 'Maximum spendable amount selected. Frozen coins remain in this wallet.'
              : 'Maximum spendable amount selected after the network fee.'
          )}
        </p>{/if}
      <div class="coin-control-field">
        <span>{translate($locale, 'Coin selection')}</span><button
          type="button"
          class="coin-mode"
          class:open={showCoins}
          aria-expanded={showCoins}
          onclick={() => (showCoins = !showCoins)}
          ><CircleDot size={16} /><span
            ><strong
              >{selectedCoins.length
                ? translate(
                    $locale,
                    selectedCoins.length === 1 ? 'Manual · {count} coin' : 'Manual · {count} coins',
                    { count: selectedCoins.length }
                  )
                : translate($locale, 'Automatic selection')}</strong
            ><small
              >{selectedCoins.length
                ? translate($locale, '{amount} {unit} available', {
                    amount: $discreetMode ? '••••••' : formatAmount(available, $denomination),
                    unit: amountUnit($denomination)
                  })
                : translate($locale, '{strategy} · Frozen coins stay untouched', {
                    strategy: automaticStrategyLabel
                  })}</small
            ></span
          ><b>{translate($locale, showCoins ? 'Done' : 'Choose')}</b></button
        >{#if showCoins}<div class="send-coin-picker">
            <fieldset class="automatic-strategies">
              <legend>{translate($locale, 'Automatic strategy')}</legend
              >{#each [{ id: 'balanced', name: 'Balanced', detail: 'Limit privacy merges without excessive fees' }, { id: 'private', name: 'More private', detail: 'Avoid reused, unknown, and unrelated coins' }, { id: 'lower_fee', name: 'Lower fee', detail: 'Prefer fewer, larger inputs' }] as option}<button
                  type="button"
                  class:active={automaticStrategy === option.id && !selectedCoins.length}
                  onclick={() => {
                    automaticStrategy = option.id as AutomaticSelectionStrategy;
                    selectedCoins = [];
                    updateAvailable();
                  }}><strong>{option.name}</strong><small>{option.detail}</small></button
                >{/each}
            </fieldset>
            {#each coins as coin}<label class:frozen={coin.frozen}
                ><input
                  type="checkbox"
                  checked={selectedCoins.includes(coin.outpoint)}
                  disabled={coin.frozen}
                  onchange={(event) => toggleCoin(coin.outpoint, event.currentTarget.checked)}
                /><span
                  ><span class="coin-picker-title-line"
                    ><PermanentLabelTags
                      labels={coin.provenance.labels.length ? coin.provenance.labels : [coin.label]}
                      hidden={$discreetMode}
                      prominent
                    /></span
                  ><small
                    >{translate(
                      $locale,
                      $discreetMode
                        ? '•••••• · Provenance hidden'
                        : `${formatAmount(coin.amount, $denomination)} ${amountUnit($denomination)}${coin.provenance.state === 'unknown' ? ' · Source unknown' : ''}${coin.provenance.addressReused ? ' · Address reused' : ''}`
                    )}{translate(
                      $locale,
                      coin.frozen
                        ? ' · Frozen'
                        : validPolicyMaturity(coin)?.state === 'mature'
                          ? ' · Backup key available'
                          : ''
                    )}</small
                  ></span
                ></label
              >{/each}<button type="button" onclick={useAutomatic}
              >{translate($locale, 'Use automatic selection')}</button
            >
          </div>{/if}
      </div>
      {#if selectionPreview}<div
          class:warning={selectionPreview.newClusterLinks > 0 ||
            selectionPreview.hasUnknownProvenance ||
            selectionPreview.hasAddressReuse}
          class="selection-review manual-selection-preview"
        >
          <strong
            >{selectionPreview.selectedInputCount}
            {translate($locale, 'selected ·')}
            <Amount value={selectionPreview.selectedAmount} hidden={$discreetMode} /></strong
          >{#if $discreetMode}<span
              >{translate($locale, 'Funding provenance hidden in discreet mode.')}</span
            >{:else}<div class="selection-labels">
              <span>{translate($locale, 'Funding labels')}</span><PermanentLabelTags
                labels={selectionPreview.fundingLabels}
              />
            </div>
            <span
              >{translate(
                $locale,
                selectionPreview.newClusterLinks
                  ? `${selectionPreview.newClusterLinks} new public link${selectionPreview.newClusterLinks === 1 ? '' : 's'}.`
                  : 'No new links between existing groups.'
              )}</span
            >{#if selectionPreview.oneExistingGroupCanFund && selectionPreview.newClusterLinks > 0}<div
                class="selection-recommendation"
              >
                <strong>{translate($locale, 'Privacy recommendation')}</strong><span
                  >{translate(
                    $locale,
                    'One existing group can fund this payment without linking these groups.'
                  )}</span
                ><button
                  type="button"
                  onclick={() => {
                    automaticStrategy = 'private';
                    useAutomatic();
                  }}>{translate($locale, 'Use privacy-first selection')}</button
                >
              </div>{/if}
            <details class="selection-technical">
              <summary>{translate($locale, 'Input details')}</summary><span
                >{translate($locale, 'Estimated input weight:')}
                {shortSats(selectionPreview.estimatedInputWeight)} WU</span
              >
            </details>{/if}
        </div>{/if}
      {#if selectedReadyCoins.length}<div class="selection-review renewal-review">
          <strong
            >{translate(
              $locale,
              selectedReadyCoins.length === 1
                ? 'This coin already has its backup key available'
                : '{count} selected coins already have their backup keys available',
              { count: selectedReadyCoins.length }
            )}</strong
          >
          <span
            >{translate(
              $locale,
              'Spending them is safe with your normal keys. Any wallet change starts a fresh wait after confirmation.'
            )}</span
          >
        </div>{/if}
      <FeeSelector
        {estimates}
        value={selectedRateNumber}
        {estimatedFee}
        error={feeEstimateError}
        onchange={updatePaymentFeeRate}
      />
      {#if error}<div class="hardware-inline-error send-form-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{translate($locale, 'Payment could not be prepared')}</strong><small
              >{error}</small
            ></span
          >
        </div>{/if}
      <div class="split-actions">
        <Button
          variant="secondary"
          size="large"
          onclick={() => {
            error = '';
            draftStep = 1;
          }}>{translate($locale, 'Back')}</Button
        ><Button
          type="submit"
          size="large"
          disabled={!valid}
          loading={busy}
          loadingLabel={translate($locale, 'Preparing payment…')}
          >{translate($locale, 'Review payment')}</Button
        >
      </div>
    </form>
  {:else}<div class="multisig-signing-layout">
      <section
        class="form-card"
        aria-label={translate(
          $locale,
          proposal.canFinalize ? 'Signed transaction review' : 'Transaction review'
        )}
      >
        <div class="review-amount">
          <span
            >{translate(
              $locale,
              renewalMode
                ? 'New protected coin'
                : delayedSpendMode
                  ? 'Recipient receives'
                  : 'You send'
            )}</span
          ><strong><Amount value={Number(proposal.amount)} interactive /></strong>
        </div>
        <dl class="details-list proposal-review-primary">
          <div>
            <dt>{translate($locale, renewalMode ? 'New wallet address' : 'To')}</dt>
            <dd>
              <button
                class="address-review-trigger mono"
                aria-label={translate($locale, 'View complete recipient address')}
                onclick={() => (addressOpen = true)}>{compactAddress(proposal.recipient)}</button
              >
            </dd>
          </div>
          <div class="label-details-row">
            <dt>{translate($locale, 'Label')}</dt>
            <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{proposal.network}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network fee')}</dt>
            <dd><Amount value={Number(proposal.fee)} interactive /></dd>
          </div>
          <div class="total">
            <dt>{translate($locale, 'Total')}</dt>
            <dd><Amount value={Number(proposal.total)} interactive /></dd>
          </div>
        </dl>
        {#if delayedSpendMode}<div class="selection-review renewal-review">
            <strong
              >{translate($locale, 'Signed by the {key}', { key: delayedSpendKeyName })}</strong
            >
            <span
              >{translate(
                $locale,
                'One coin goes to one address. The network fee is deducted from it.'
              )}</span
            >
          </div>{:else}<div class:warning={proposalHasPrivacyWarning} class="selection-review">
            <strong
              >{proposal.selectionImpact.selectedInputCount}
              {translate($locale, 'funding coin')}{translate(
                $locale,
                proposal.selectionImpact.selectedInputCount === 1 ? '' : 's'
              )} · {proposal.selectionImpact.strategy.replace('_', ' ')}</strong
            ><span
              >{translate(
                $locale,
                proposalHasPrivacyWarning
                  ? `Review: ${proposal.selectionImpact.newClusterLinks} new cluster link${proposal.selectionImpact.newClusterLinks === 1 ? '' : 's'}; unknown or reused sources are called out.`
                  : 'No new cluster link, unknown provenance, or address-reuse warning.'
              )}</span
            >
          </div>{/if}
        {#if renewalMode}<div class="selection-review renewal-review">
            <strong>{translate($locale, 'Protection restarts after confirmation')}</strong><span
              >{translate(
                $locale,
                'Only this coin moves. The network fee is the only amount leaving your wallet.'
              )}</span
            >
          </div>{/if}
        {#if !renewalMode && !delayedSpendMode && proposalReadyCoins.length}<div
            class="selection-review renewal-review"
          >
            <strong
              >{translate(
                $locale,
                proposalReadyCoins.length === 1
                  ? 'One recovery-ready coin is being spent'
                  : '{count} recovery-ready coins are being spent',
                { count: proposalReadyCoins.length }
              )}</strong
            >
            <span
              >{translate(
                $locale,
                'Your normal keys approve this payment. Any wallet change begins a fresh wait after confirmation.'
              )}</span
            >
          </div>{/if}
        {#if proposal.selectionImpact.feeDifferenceVsPrivate !== null}<div class="selection-review">
            <strong>{translate($locale, 'Exact strategy comparison')}</strong><span
              ><Amount value={Math.abs(proposal.selectionImpact.feeDifferenceVsPrivate)} />
              {translate(
                $locale,
                proposal.selectionImpact.feeDifferenceVsPrivate <= 0 ? 'lower' : 'higher'
              )}
              {translate(
                $locale,
                'than the valid\n              More private candidate. Lower fee is not better privacy.'
              )}</span
            >
          </div>{/if}
        <TransactionReviewDetails
          {proposal}
          interactiveAmounts
          policy={proposal.spendPath === 'delayed'
            ? `${delayedSpendKeyName} only`
            : wallet?.recoveryTemplate?.type === 'recovery'
              ? '2 of 3 primary keys'
              : `${wallet?.threshold} of ${wallet?.cosigners.length}`}
          onChangeAddress={() => (changeAddressOpen = true)}
        />
        {#if !proposal.canFinalize}<div class="psbt-actions">
            {#if !wallet?.recoveryTemplate}<Button variant="secondary" onclick={scan}
                ><Cpu size={16} />{translate($locale, 'Sign with device')}</Button
              >{/if}<Button variant="secondary" onclick={showPsbtQr}
              ><QrCode size={16} />{translate($locale, 'Show unsigned QR')}</Button
            ><Button
              variant="secondary"
              onclick={() => {
                scannedFrames = [];
                qrScanOpen = true;
              }}><ScanLine size={16} />{translate($locale, 'Scan signed QR')}</Button
            ><Button variant="secondary" onclick={openPsbtImport}
              ><FileUp size={16} />{translate($locale, 'Import signed PSBT')}</Button
            ><Button variant="secondary" onclick={copyPsbt}
              ><Copy size={16} />{translate($locale, 'Copy PSBT')}</Button
            ><Button
              variant="secondary"
              loading={savingPsbt}
              loadingLabel={translate($locale, 'Saving PSBT…')}
              onclick={saveProposalPsbt}
              ><Download size={16} />{translate($locale, 'Save PSBT')}</Button
            >
          </div>{/if}
        {#if !proposal.canFinalize && wallet?.recoveryTemplate}<div
            class="selection-review"
            role="note"
          >
            <strong
              >{translate($locale, 'Use offline PSBT signing for this delayed policy.')}</strong
            ><span
              >{translate(
                $locale,
                'USB hardware signing is blocked because Groot’s pinned HWI release cannot execute this Miniscript policy safely.'
              )}</span
            >
          </div>{/if}
        {#if proposal.canFinalize}<div class="ready-panel">
            <LockKeyhole size={18} />
            <div>
              <strong>{translate($locale, 'Ready to finalize')}</strong><small
                >{translate(
                  $locale,
                  'Enter the coordinator app PIN. Hardware signatures are already inside the PSBT.'
                )}</small
              >
            </div>
          </div>
          <Button
            variant="secondary"
            class="full signed-psbt-export"
            loading={savingPsbt}
            loadingLabel={translate($locale, 'Saving signed PSBT…')}
            onclick={saveProposalPsbt}
            ><Download size={16} />{translate($locale, 'Save signed PSBT')}</Button
          ><PasswordField
            label={translate($locale, 'App PIN')}
            inputLabel="App PIN"
            bind:value={pin}
            autocomplete="current-password"
          /><Button
            size="large"
            class="full"
            disabled={!pin}
            loading={busy}
            loadingLabel={translate($locale, 'Finalizing & broadcasting…')}
            onclick={broadcast}>{translate($locale, 'Finalize & broadcast')}</Button
          >{:else}<Button
            size="large"
            class="full signature-requirement-action"
            disabled
            ariaLabel={signatureRequirementLabel}>{signatureRequirementLabel}</Button
          >{/if}{#if error}<div class="hardware-inline-error signing-transport-error" role="alert">
            <AlertTriangle size={18} /><span
              ><strong>{translate($locale, 'Payment action failed')}</strong><small>{error}</small
              ></span
            >
          </div>{/if}<Button
          variant="ghost-danger"
          class="full proposal-cancel-action"
          disabled={busy}
          onclick={() => {
            cancelError = '';
            cancelOpen = true;
          }}><X size={15} />{translate($locale, 'Cancel payment')}</Button
        >
      </section>
      {#if wallet}<aside class="signer-side-panel">
          <SignerSummary
            signers={signerItems}
            required={proposal.required}
            signedFingerprints={proposal.signedFingerprints}
            collecting
            ondiscard={(signer) => {
              discardError = '';
              discardSigner = signer;
            }}
          />
        </aside>{/if}
    </div>{/if}
</div>

<Modal
  open={deviceOpen}
  title={translate($locale, 'Sign with hardware')}
  description={translate($locale, 'Compare every value below with the device before approving.')}
  onclose={closeHardwareScan}
  attentionSignal={hardwareAttentionSignal}
>
  {#if proposal}
    <section
      class="hardware-review"
      aria-label={translate($locale, 'Authoritative transaction details')}
    >
      {#if busy && policyReviewDevice && requiresInteractivePolicyVerification(policyReviewDevice)}<p
          class="hardware-review-step"
        >
          {translate($locale, 'Step 2 of 2 · Transaction review')}
        </p>{/if}
      <strong>{translate($locale, 'Transaction to verify')}</strong>
      <dl class="hardware-review-primary">
        <div>
          <dt>
            {translate(
              $locale,
              proposal.recipientIsWalletOwned ? 'Self-transfer recipient' : 'Recipient'
            )}
          </dt>
          <dd>
            <button
              type="button"
              class="compact-address-button"
              onclick={() => (hardwareAddressOpen = true)}
              >{compactAddress(hardwareRecipient)}</button
            >
          </dd>
        </div>
        <div>
          <dt>{translate($locale, 'Label')}</dt>
          <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Amount')}</dt>
          <dd><Amount value={Number(proposal.amount)} interactive /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network')}</dt>
          <dd>{proposal.network}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network fee')}</dt>
          <dd><Amount value={Number(proposal.fee)} interactive /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Total')}</dt>
          <dd><Amount value={Number(proposal.total)} interactive /></dd>
        </div>
      </dl>
      {#if hardwareTestnetAddressDevice}<p class="verification-network-note">
          {hardwareTestnetAddressDevice}
          {translate($locale, 'shows the Regtest output with a')}
          <code>{translate($locale, 'tb1')}</code>
          {translate(
            $locale,
            'prefix. Rust\n          supplied this alias only after proving it decodes to the identical Bitcoin output script.'
          )}
        </p>{/if}
      <TransactionReviewDetails
        {proposal}
        compact
        interactiveAmounts
        policy={proposal.spendPath === 'delayed'
          ? `${delayedSpendKeyName} only`
          : wallet?.recoveryTemplate?.type === 'recovery'
            ? '2 of 3 primary keys'
            : `${wallet?.threshold} of ${wallet?.cosigners.length}`}
        changeAddressOverride={hardwareChangeAddress}
        onChangeAddress={() => (hardwareChangeAddressOpen = true)}
      />
    </section>
  {/if}
  {#if busy}
    {#if policyReviewDevice && requiresInteractivePolicyVerification(policyReviewDevice)}<div
        class="hardware-phase-reference"
      >
        <span
          ><strong>{translate($locale, 'Device still showing the wallet policy?')}</strong><small
            >{translate(
              $locale,
              'Return to the saved policy reference without interrupting this signing request.'
            )}</small
          ></span
        ><Button variant="secondary" size="small" onclick={showPolicyDuringSigning}
          >{translate($locale, 'View policy reference')}</Button
        >
      </div>{/if}
    <HardwareActionPrompt
      title={translate(
        $locale,
        hardwareCancelRequested
          ? 'Cancel on your hardware device'
          : hardwareAction === 'sign'
            ? 'Check your hardware device'
            : 'Looking for hardware devices'
      )}
      detail={translate(
        $locale,
        hardwareCancelRequested
          ? 'Reject or cancel the pending request on the device. Groot will close this dialog after the device responds.'
          : hardwareAction === 'sign'
            ? 'Review the recipient, amount, fee, change, and wallet policy, then approve on the device.'
            : 'Keep each signer connected and unlocked. Follow any instructions shown on the device.'
      )}
      label={translate(
        $locale,
        hardwareCancelRequested
          ? 'Waiting for hardware cancellation'
          : hardwareAction === 'sign'
            ? 'Waiting for hardware signature'
            : 'Hardware device scan in progress'
      )}
    />
  {:else if devices.length === 0}
    <div class="device-scan">
      <strong>{translate($locale, 'No device found')}</strong><span
        >{translate($locale, 'Connect an HWI-compatible device, or use signed PSBT import.')}</span
      ><Button variant="secondary" onclick={scan}>{translate($locale, 'Scan again')}</Button>
    </div>
  {:else}
    <div class="source-list hardware-device-list">
      {#each devices as device}{@const alreadySigned =
          deviceHasSigned(device)}{@const policyRequired =
          requiresPolicySetup(device)}{@const policyVerified =
          devicePolicyVerification(device)}<button
          disabled={alreadySigned ||
            device.action === 'none' ||
            policyRegistrationProfile(device).registration === 'unsupported'}
          onclick={() => handleHardware(device)}
          ><Cpu size={18} /><span
            ><strong>{hardwareDeviceDisplayName(device, wallet?.cosigners ?? [])}</strong><small
              >{translate($locale, device.fingerprint ?? device.message)}</small
            ><em
              class:ready={!alreadySigned &&
                (device.status === 'ready' || device.status === 'detected') &&
                (!policyRequired || !!policyVerified)}
              class:signed={alreadySigned}
              class:attention={(policyRequired && !policyVerified) ||
                policyRegistrationProfile(device).registration === 'unsupported'}
              >{#if alreadySigned}<Check size={11} />{translate(
                  $locale,
                  'Already signed'
                )}{:else if policyRequired || policyRegistrationProfile(device).registration === 'unsupported'}{translate(
                  $locale,
                  policyReadinessLabel(device, policyVerified)
                )}{:else}{translate(
                  $locale,
                  device.status === 'ready' || device.status === 'detected'
                    ? 'No setup needed'
                    : device.action === 'unlock'
                      ? 'Unlock & continue'
                      : device.action === 'prompt_pin'
                        ? 'Unlock'
                        : device.action === 'retry'
                          ? 'Scan again'
                          : 'Attention'
                )}{/if}</em
            ></span
          ></button
        >{/each}<button class="hardware-rescan" onclick={scan}
        ><RefreshCw size={16} /><span
          ><strong>{translate($locale, 'Rescan devices')}</strong><small
            >{translate($locale, 'Refresh after connecting or unlocking another signer.')}</small
          ></span
        ></button
      >
    </div>
  {/if}
  {#if !busy && showColdcardPolicyHelp}<div class="hardware-policy-help">
      <strong>{translate($locale, 'Coldcard must know this wallet policy')}</strong><span
        >{translate(
          $locale,
          'If it reports an unknown multisig wallet, import this public descriptor from Settings →\n        Multisig Wallets → Import.'
        )}</span
      ><Button variant="secondary" size="small" onclick={saveColdcardPolicy}
        ><Download size={14} />{translate($locale, 'Save wallet policy')}</Button
      >
    </div>{/if}
  {#if deviceError}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'This device could not sign')}</strong><small
          >{deviceError}</small
        ></span
      ><Button variant="secondary" size="small" onclick={scan}
        >{translate($locale, 'Rescan')}</Button
      >
    </div>{/if}
</Modal>
<Modal
  open={policyReviewOpen}
  title={translate($locale, 'Review wallet policy')}
  description={translate($locale, 'Check the policy, signer keys, and first address.')}
  onclose={closePolicyReview}
  attentionSignal={hardwareAttentionSignal}
>
  {#if wallet && policyAddress && policyReviewDevice && savedSignerForDevice(policyReviewDevice)}{@const signer =
      savedSignerForDevice(policyReviewDevice)!}{@const verification = matchingPolicyVerification(
      signer,
      policyVerifications
    )}<SignerPolicyReview
      {wallet}
      {signer}
      {policyAddress}
      {verification}
      busy={policyReviewBusy}
      error={policyReviewError}
      action={verification ? 'sign' : 'verify'}
      onverify={verifyPolicyBeforeSigning}
      oncontinue={() => sign(policyReviewDevice!)}
      onshowtransaction={showTransactionDuringSigning}
      onback={() => {
        policyReviewOpen = false;
        policyReviewDevice = null;
        policyReviewError = '';
        deviceOpen = true;
      }}
    />{/if}
</Modal>
<Modal
  open={coldcardSetupOpen}
  title={translate($locale, 'Prepare Coldcard for this wallet')}
  description={translate(
    $locale,
    'Complete the one-time policy-file import before transaction signing.'
  )}
  onclose={() => {
    if (!coldcardSetupBusy) {
      coldcardSetupOpen = false;
      coldcardSetupDevice = null;
      coldcardSetupError = '';
      deviceOpen = true;
    }
  }}
>
  {#if wallet && coldcardSetupDevice && savedSignerForDevice(coldcardSetupDevice)}<ColdcardPolicySetup
      {wallet}
      signer={savedSignerForDevice(coldcardSetupDevice)!}
      busy={coldcardSetupBusy}
      error={coldcardSetupError}
      ondownload={saveColdcardPolicy}
      onconfirm={confirmColdcardPolicy}
      onback={() => {
        coldcardSetupOpen = false;
        coldcardSetupDevice = null;
        coldcardSetupError = '';
        deviceOpen = true;
      }}
    />{/if}
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
    pinPositions = '';
    pinChallenge = '';
    pinDevice = null;
    pinError = '';
    pinErrorCode = '';
    deviceOpen = true;
  }}
/>
<Modal
  open={importOpen}
  title={translate($locale, 'Import signed PSBT')}
  description={translate($locale, 'Only signatures for this exact proposal are accepted.')}
  onclose={closePsbtImport}
  ><label class="file-action"
    ><FileUp size={16} />{translate($locale, 'Choose PSBT file')}<input
      aria-label={translate($locale, 'Choose signed PSBT file')}
      type="file"
      accept=".psbt,text/plain"
      onchange={loadPsbtFile}
    /></label
  ><label class="field"
    ><span>{translate($locale, 'Signed PSBT')}</span><textarea
      aria-label={translate($locale, 'Signed PSBT')}
      rows="6"
      bind:value={imported}
      oninput={() => (importError = '')}
      placeholder={translate($locale, 'cHNidP8…')}></textarea></label
  >{#if importError}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Signed PSBT rejected')}</strong><small>{importError}</small
        ></span
      >
    </div>{/if}
  <div class="modal-footer">
    <Button variant="secondary" disabled={busy} onclick={closePsbtImport}
      >{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!imported.trim()}
      loading={busy}
      loadingLabel={translate($locale, 'Validating signatures…')}
      onclick={importPsbt}>{translate($locale, 'Validate & merge')}</Button
    >
  </div></Modal
>
<Modal
  open={qrOpen}
  title={translate($locale, 'Unsigned PSBT')}
  description={translate($locale, 'Scan with an offline signer. No private data is encoded.')}
  onclose={() => (qrOpen = false)}><AnimatedUrQr frames={urFrames} /></Modal
>
<Modal
  open={paymentScanOpen}
  wide
  title={translate($locale, 'Scan payment request')}
  description={translate(
    $locale,
    'Scan a Bitcoin address or payment URI. You will review every imported detail before sending.'
  )}
  onclose={() => (paymentScanOpen = false)}
>
  <PaymentRequestQrScanner onscan={receivePaymentRequest} />
  {#if paymentScanError}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'QR code rejected')}</strong><small>{paymentScanError}</small
        ></span
      >
    </div>{/if}
</Modal>

<Modal
  open={qrScanOpen}
  title={translate($locale, 'Scan signed PSBT')}
  description={translate(
    $locale,
    'Groot accepts only crypto-psbt UR frames and verifies the exact proposal before merging.'
  )}
  onclose={() => (qrScanOpen = false)}><UrQrScanner onframe={receiveUrFrame} /></Modal
>
<Modal
  open={discardDraftOpen}
  title={translate($locale, 'Discard this payment draft?')}
  description={translate($locale, 'Remove the unfinished payment without creating a transaction.')}
  onclose={() => {
    if (!discardingDraft) {
      discardDraftOpen = false;
      discardDraftError = '';
    }
  }}
  ><div class="warning-box">
    <strong>{translate($locale, 'Only the draft will be removed.')}</strong>
    {translate($locale, 'No transaction or signature exists yet.')}
  </div>
  <dl class="details-list cancel-proposal-details">
    <div>
      <dt>{translate($locale, 'Payment')}</dt>
      <dd><PermanentLabelTags labels={submissionLabels} prominent /></dd>
    </div>
    <div>
      <dt>{translate($locale, 'Saved fields')}</dt>
      <dd>{translate($locale, 'Recipient, labels, amount, fee, and coin selection')}</dd>
    </div>
  </dl>
  {#if discardDraftError}<p class="form-error" role="alert">{discardDraftError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={discardingDraft}
      onclick={() => {
        discardDraftOpen = false;
        discardDraftError = '';
      }}>{translate($locale, 'Keep draft')}</Button
    ><Button
      variant="danger"
      loading={discardingDraft}
      loadingLabel={translate($locale, 'Discarding draft…')}
      onclick={confirmDiscardPaymentDraft}>{translate($locale, 'Discard draft')}</Button
    >
  </div></Modal
>
<Modal
  open={cancelOpen}
  title={translate($locale, 'Cancel this payment?')}
  description={translate($locale, 'Review what will be discarded before continuing.')}
  onclose={() => {
    if (!busy) {
      cancelOpen = false;
      cancelError = '';
    }
  }}
  >{#if proposal}<div class="warning-box">
      <strong>{translate($locale, 'This cannot be undone.')}</strong>
      {translate($locale, 'You will need to prepare and sign this payment again.')}
    </div>
    <dl class="details-list cancel-proposal-details">
      <div>
        <dt>{translate($locale, 'Payment')}</dt>
        <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Amount')}</dt>
        <dd><Amount value={Number(proposal.amount)} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Signatures lost')}</dt>
        <dd>{proposal.signed} of {proposal.required} {translate($locale, 'collected')}</dd>
      </div>
    </dl>
    {#if cancelError}<p class="form-error" role="alert">{cancelError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        disabled={busy}
        onclick={() => {
          cancelOpen = false;
          cancelError = '';
        }}>{translate($locale, 'Keep payment')}</Button
      ><Button
        variant="danger"
        loading={busy}
        loadingLabel={translate($locale, 'Canceling payment…')}
        onclick={confirmCancel}>{translate($locale, 'Cancel payment')}</Button
      >
    </div>{/if}</Modal
>
<Modal
  open={Boolean(discardSigner)}
  title={translate($locale, 'Discard local signature?')}
  description={translate($locale, "Remove this signer from Groot's current proposal.")}
  onclose={() => {
    if (!busy) {
      discardSigner = null;
      discardError = '';
    }
  }}
  >{#if proposal && discardSigner}<div class="warning-box danger">
      <strong>{translate($locale, 'This does not revoke the signature.')}</strong><span
        >{translate(
          $locale,
          'Any PSBT copy already exported or shared may still contain it and can remain broadcastable\n        if it has enough signatures.'
        )}</span
      >
    </div>
    <dl class="details-list cancel-proposal-details">
      <div>
        <dt>{translate($locale, 'Signer')}</dt>
        <dd>{discardSigner.label}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Signature progress')}</dt>
        <dd>
          {proposal.signed} of {proposal.required} → {Math.max(0, proposal.signed - 1)} of {proposal.required}
        </dd>
      </div>
    </dl>
    {#if discardError}<p class="form-error" role="alert">{discardError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        disabled={busy}
        onclick={() => {
          discardSigner = null;
          discardError = '';
        }}>{translate($locale, 'Keep signature')}</Button
      ><Button
        variant="danger"
        loading={busy}
        loadingLabel={translate($locale, 'Discarding signature…')}
        onclick={confirmDiscardSignature}>{translate($locale, 'Discard local signature')}</Button
      >
    </div>{/if}</Modal
>
<Modal
  open={exitOpen}
  title={translate($locale, 'Leave signing?')}
  description={translate($locale, 'Confirm before returning to the overview.')}
  onclose={() => (exitOpen = false)}
  >{#if proposal}<div class="ready-panel">
      <Check size={18} />
      <div>
        <strong>{translate($locale, 'Your proposal will stay saved.')}</strong><small
          >{translate(
            $locale,
            'You can return to signing without rebuilding the transaction or losing collected\n          signatures.'
          )}</small
        >
      </div>
    </div>
    <dl class="details-list cancel-proposal-details">
      <div>
        <dt>{translate($locale, 'Payment')}</dt>
        <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Amount')}</dt>
        <dd><Amount value={Number(proposal.amount)} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Signatures saved')}</dt>
        <dd>{proposal.signed} of {proposal.required} {translate($locale, 'collected')}</dd>
      </div>
    </dl>
    <div class="modal-footer">
      <Button variant="secondary" onclick={() => (exitOpen = false)}
        >{translate($locale, 'Keep signing')}</Button
      ><Button href="/">{translate($locale, 'Leave to overview')}</Button>
    </div>{/if}</Modal
>
<RecipientAddressModal
  open={addressOpen}
  address={proposal?.recipient ?? ''}
  label={translate($locale, proposal?.label ?? '')}
  labels={proposal?.labels ?? (proposal ? [proposal.label] : [])}
  onclose={() => (addressOpen = false)}
/>
<RecipientAddressModal
  open={changeAddressOpen}
  address={proposal?.changeAddresses[0] ?? ''}
  label={translate($locale, 'Wallet change')}
  title={translate($locale, 'Change address')}
  description={translate(
    $locale,
    'Compare this wallet-controlled output with the hardware device.'
  )}
  detail={translate($locale, 'Internal wallet output · not the recipient')}
  onclose={() => (changeAddressOpen = false)}
/>
<RecipientAddressModal
  open={hardwareAddressOpen}
  address={hardwareRecipient}
  label={translate($locale, proposal?.label ?? '')}
  labels={proposal?.labels ?? (proposal ? [proposal.label] : [])}
  title={translate($locale, 'Address shown on hardware')}
  description={translate($locale, 'Compare this exact encoding with the hardware device.')}
  onclose={() => (hardwareAddressOpen = false)}
/>
<RecipientAddressModal
  open={hardwareChangeAddressOpen}
  address={hardwareChangeAddress}
  label={translate($locale, 'Wallet change')}
  title={translate($locale, 'Change shown on hardware')}
  description={translate(
    $locale,
    'Compare this exact wallet-controlled output with the hardware device.'
  )}
  detail={translate($locale, 'Internal wallet output · not the recipient')}
  onclose={() => (hardwareChangeAddressOpen = false)}
/>
