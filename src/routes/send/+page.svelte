<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    AlertTriangle,
    ArrowRight,
    Check,
    CircleDot,
    Copy,
    Cpu,
    Download,
    FileUp,
    Gauge,
    ExternalLink,
    LockKeyhole,
    QrCode,
    RefreshCw,
    ScanLine,
    Trash2,
    X
  } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '$lib/components/Button.svelte';
  import PermanentLabelEditor from '$lib/components/PermanentLabelEditor.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import HardwareDeviceList from '$lib/components/HardwareDeviceList.svelte';
  import TransactionReviewDetails from '$lib/components/TransactionReviewDetails.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import PaymentRequestQrScanner from '$lib/components/PaymentRequestQrScanner.svelte';
  import RecipientAddressModal from '$lib/components/RecipientAddressModal.svelte';
  import SendProgress from '$lib/components/SendProgress.svelte';
  import SignerSummary from '$lib/components/SignerSummary.svelte';
  import { psbtFilename, readTransferFile } from '$lib/transfer';
  import { copyText } from '$lib/clipboard';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import {
    feeRate as asFeeRate,
    sats,
    walletService,
    WalletError,
    type AutomaticSelectionStrategy,
    type AccelerationQuote,
    type CpfpAccelerationQuote,
    type CoinSelection,
    type CoinSelectionPreview,
    type ExternalSignerWallet,
    type FeeEstimates,
    type HardwareDevice,
    type MultisigProposal,
    type PaymentProposal
  } from '$lib/wallet';
  import type { LabelSuggestion, Utxo } from '$lib/types';
  import { defaultConfig, networkName, transactionExplorerUrl } from '$lib/config';
  import {
    addressPrefixForNetwork,
    hasAddressPrefixForNetwork,
    normalizePermanentLabel
  } from '$lib/wallet/policy';
  import { compactAddress, compactIdentifier } from '$lib/address-display';
  import {
    addressForHardwareDisplay,
    testnetAddressDisplayName
  } from '$lib/wallet/hardware-display';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
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
    accelerationUnavailableDescription,
    accelerationUnavailableTitle
  } from '$lib/wallet/acceleration-presentation';
  import {
    automaticStrategyMessage,
    presentedCoinSelection,
    toggleManualCoin
  } from '$lib/wallet/coin-selection-presentation';
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
  import { fly } from 'svelte/transition';
  import { useWalletShellContext } from '$lib/wallet/shell-context';

  const walletShell = useWalletShellContext();
  const initialAcceleration: { txid: string; method: 'rbf' | 'cpfp' } | null = (() => {
    const method = page.url.searchParams.get('accelerate');
    const txid = page.url.searchParams.get('txid');
    if (!txid || (method !== 'rbf' && method !== 'cpfp')) return null;
    return { txid, method };
  })();

  let step = $state(1);
  let draftStep = $state<1 | 2>(1);
  let draftWalletId = '';
  let address = $state('');
  let label = $state('');
  let selectedLabels = $state<string[]>([]);
  let labelSuggestions = $state<LabelSuggestion[]>([]);
  let visibleSuggestions = $derived(
    visibleLabelSuggestions(labelSuggestions, label, VISIBLE_LABEL_SUGGESTION_LIMIT, selectedLabels)
  );
  let submissionLabels = $derived(permanentLabelsForSubmission(selectedLabels, label));
  let amount = $state('');
  let speed = $state('medium');
  let customFee = $state('');
  let passphrase = $state('');
  let credentialError = $state('');
  let broadcasting = $state(false);
  let savingPsbt = $state(false);
  let preparing = $state(false);
  let available = $state(0);
  let estimates = $state<FeeEstimates | null>(null);
  let feeEstimateError = $state('');
  let draftError = $state('');
  let paymentScanOpen = $state(false);
  let paymentScanError = $state('');
  let paymentRequestNotice = $state('');
  let hasPaymentDraft = $state(false);
  let discardDraftOpen = $state(false);
  let discardingDraft = $state(false);
  let discardDraftError = $state('');
  let suppressDraftSave = false;
  let proposal = $state<PaymentProposal | null>(null);
  let maxSpendQuote = $state<MaxSpendQuote | null>(null);
  let maxSpendActive = $state(false);
  let maxSpendRequestRevision = 0;
  let txid = $state('');
  let broadcastExplorerError = $state('');
  let sentAmount = $state(0);
  let balanceSyncPending = $state(false);
  let accelerationMethod = $state<'rbf' | 'cpfp' | null>(initialAcceleration?.method ?? null);
  let accelerationRequest = $state<{ txid: string; method: 'rbf' | 'cpfp' } | null>(
    initialAcceleration
  );
  let accelerationLoading = $state(Boolean(initialAcceleration));
  let rbfQuote = $state<AccelerationQuote | null>(null);
  let cpfpQuote = $state<CpfpAccelerationQuote | null>(null);
  const broadcastExplorerUrl = $derived(
    txid ? transactionExplorerUrl(defaultConfig.network, txid) : null
  );
  let coins = $state<Utxo[]>([]);
  let selectedCoins = $state<string[]>([]);
  let showCoins = $state(false);
  let automaticStrategy = $state<AutomaticSelectionStrategy>('balanced');
  let selectionPreview = $state<CoinSelectionPreview | null>(null);
  let selectionPreviewRevision = 0;
  let externalWallet = $state<ExternalSignerWallet | null>(null);
  let signerSummaryReady = $state(false);
  let hardwareScanGeneration = 0;
  let externalSigner = $state(false),
    externalProposal = $state<MultisigProposal | null>(null),
    deviceOpen = $state(false),
    addressOpen = $state(false),
    changeAddressOpen = $state(false),
    hardwareAddressOpen = $state(false),
    hardwareChangeAddressOpen = $state(false),
    importOpen = $state(false),
    qrOpen = $state(false),
    qrScanOpen = $state(false),
    cancelOpen = $state(false),
    cancelError = $state(''),
    discardSignatureOpen = $state(false),
    discardSignatureError = $state(''),
    devices = $state<HardwareDevice[]>([]),
    deviceError = $state(''),
    imported = $state(''),
    urFrames = $state<string[]>([]),
    scannedFrames = $state<string[]>([]);
  let importError = $state('');
  let hardwareAction = $state<'scan' | 'sign'>('scan');
  let hardwareAttentionSignal = $state(0),
    hardwareCancelRequested = $state(false);
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
  const fees = $derived({
    slow: Number(estimates?.economy ?? 0),
    medium: Number(estimates?.standard ?? 0),
    fast: Number(estimates?.priority ?? 0)
  });
  const selectedFeeRate = $derived(
    speed === 'custom' ? Number(customFee || 0) : fees[speed as keyof typeof fees]
  );
  const customFeeValid = $derived(
    Number.isFinite(Number(customFee)) && Number(customFee) > 0 && Number(customFee) <= 10_000
  );
  const amountSats = $derived(parseAmountInput(amount, $denomination));
  const quotedMaxFee = $derived(
    matchingMaxSpendFee(maxSpendQuote, {
      recipient: address,
      feeRate: selectedFeeRate,
      coinSelection: selection,
      amount: amountSats
    })
  );
  const fee = $derived(
    Number(proposal?.fee ?? quotedMaxFee ?? Math.max(0, Math.round(selectedFeeRate * 141)))
  );
  const addressValid = $derived(hasAddressPrefixForNetwork(address, defaultConfig.network));
  const valid = $derived(
    addressValid &&
      submissionLabels.length > 0 &&
      Number.isSafeInteger(amountSats) &&
      amountSats > 0 &&
      amountSats + fee <= available &&
      selectedFeeRate > 0
  );
  const intentValid = $derived(addressValid && submissionLabels.length > 0);
  const progressStep = $derived<1 | 2 | 3>(step === 1 ? draftStep : 3);
  const signerItems = $derived(
    externalSigner && externalWallet
      ? [
          {
            label: externalWallet.signer.label,
            fingerprint: externalWallet.signer.fingerprint,
            detail: externalWallet.signer.deviceType ?? 'External hardware signer'
          }
        ]
      : [{ label: 'Groot app', detail: 'Software signer · This device', software: true }]
  );
  const hardwareSignerIdentity = $derived(externalWallet?.signer.deviceType ?? '');
  const hardwareTestnetAddressDevice = $derived(
    proposal?.recipientTestnetAlias ? testnetAddressDisplayName(hardwareSignerIdentity) : null
  );
  const hardwareRecipient = $derived(
    addressForHardwareDisplay(
      proposal?.recipient ?? '',
      proposal?.recipientTestnetAlias,
      hardwareSignerIdentity
    )
  );
  const hardwareChangeAddress = $derived(
    addressForHardwareDisplay(
      proposal?.changeAddresses[0] ?? '',
      proposal?.changeTestnetAliases[0],
      hardwareSignerIdentity
    )
  );

  $effect(() => {
    const outpoints = selectedCoins;
    const target = Number.isSafeInteger(amountSats) && amountSats > 0 ? amountSats : 0;
    const revision = ++selectionPreviewRevision;
    if (!outpoints.length) {
      selectionPreview = null;
      return;
    }
    void walletService
      .previewCoinSelection(outpoints, sats(target))
      .then((preview) => {
        if (revision === selectionPreviewRevision) selectionPreview = preview;
      })
      .catch(() => {
        if (revision === selectionPreviewRevision) selectionPreview = null;
      });
  });

  let walletLoadError = $state('');
  let walletLoading = $state(true);
  let walletLoadGeneration = 0;
  onMount(loadWallet);
  async function loadWallet() {
    const generation = ++walletLoadGeneration;
    let dataLoaded = false;
    walletLoadError = '';
    walletLoading = true;
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      const registry =
        shellWallets.length && shellSelectedWalletId
          ? { wallets: shellWallets, selectedWalletId: shellSelectedWalletId }
          : await walletService.profiles();
      if (generation !== walletLoadGeneration) return;
      externalSigner =
        registry.wallets.find((profile) => profile.id === registry.selectedWalletId)?.kind ===
        'watch_only';
      draftWalletId = registry.selectedWalletId ?? '';
      // Saved public identity is independent of the expensive coin snapshot.
      // It never asserts that a physical device is currently connected.
      const identity = externalSigner
        ? walletService.externalSignerWallet().then((value) => {
            if (generation !== walletLoadGeneration) return;
            externalWallet = value;
            signerSummaryReady = true;
          })
        : Promise.resolve().then(() => {
            signerSummaryReady = true;
          });
      const [snapshot] = await Promise.all([walletService.snapshot(), identity]);
      if (generation !== walletLoadGeneration) return;
      dataLoaded = true;
      coins = snapshot.utxos;
      labelSuggestions = snapshot.labelSuggestions;
      const requested =
        new URL(window.location.href).searchParams.get('coins')?.split(',').filter(Boolean) ?? [];
      selectedCoins = requested.filter((outpoint) =>
        snapshot.utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen)
      );
      available = snapshot.utxos
        .filter(
          (coin) => !coin.frozen && (!selectedCoins.length || selectedCoins.includes(coin.outpoint))
        )
        .reduce((total, coin) => total + coin.amount, 0);
      try {
        estimates = await walletService.estimateFees();
      } catch (cause) {
        feeEstimateError = localizedError(
          cause,
          $locale,
          'Bitcoin Core fee estimates are unavailable.'
        );
        speed = 'custom';
        toast({
          title: 'Fee estimates unavailable',
          description: feeEstimateError,
          tone: 'danger'
        });
      }
      if (generation !== walletLoadGeneration) return;
      const url = new URL(window.location.href);
      const requestedProposalId = url.searchParams.get('proposal');
      const acceleration = url.searchParams.get('accelerate');
      const accelerationTxid = url.searchParams.get('txid');
      if (accelerationTxid && (acceleration === 'rbf' || acceleration === 'cpfp')) {
        accelerationMethod = acceleration;
        accelerationRequest = { txid: accelerationTxid, method: acceleration };
        if (acceleration === 'rbf') {
          rbfQuote = await walletService.quoteRbf(accelerationTxid);
          customFee = String(rbfQuote.targetFeeRate);
          speed = 'custom';
        } else if (estimates) {
          cpfpQuote = await walletService.quoteCpfp(accelerationTxid);
          customFee = String(cpfpQuote.targetFeeRate);
          speed = 'custom';
        } else {
          customFee = '';
        }
      } else if (externalSigner) {
        const proposals = await walletService.externalSignerProposals();
        if (generation !== walletLoadGeneration) return;
        const activeProposal = requestedProposalId
          ? (proposals.find((item) => item.proposalId === requestedProposalId) ?? null)
          : latestActiveProposal(proposals);
        if (activeProposal) {
          if (draftWalletId) await walletService.clearPaymentDraft();
          externalProposal = activeProposal;
          proposal = activeProposal;
          address = activeProposal.recipient;
          selectedLabels = activeProposal.labels ?? [activeProposal.label];
          label = '';
          amount = String(activeProposal.amount);
          step = activeProposal.canFinalize ? 3 : 2;
        }
      } else {
        const proposals = await walletService.paymentProposals();
        if (generation !== walletLoadGeneration) return;
        const activeProposal = requestedProposalId
          ? (proposals.find((item) => item.proposalId === requestedProposalId) ?? null)
          : (proposals[0] ?? null);
        if (activeProposal) {
          if (draftWalletId) await walletService.clearPaymentDraft();
          proposal = activeProposal;
          address = activeProposal.recipient;
          selectedLabels = activeProposal.labels ?? [activeProposal.label];
          label = '';
          amount = String(activeProposal.amount);
          step = 2;
        }
      }
      if (!proposal && !accelerationRequest && draftWalletId) {
        if (generation !== walletLoadGeneration) return;
        const savedDraft = await walletService.paymentDraft();
        if (generation !== walletLoadGeneration) return;
        if (savedDraft?.kind === 'single_key') {
          hasPaymentDraft = true;
          address = savedDraft.address;
          selectedLabels = savedDraft.labels;
          label = '';
          amount = savedDraft.amount;
          draftStep = savedDraft.stage;
          speed = savedDraft.speed;
          customFee = savedDraft.customFee;
          automaticStrategy = savedDraft.automaticStrategy;
          if (!requested.length) {
            selectedCoins = savedDraft.selectedCoins.filter((outpoint) =>
              snapshot.utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen)
            );
          }
          available = snapshot.utxos
            .filter(
              (coin) =>
                !coin.frozen && (!selectedCoins.length || selectedCoins.includes(coin.outpoint))
            )
            .reduce((total, coin) => total + coin.amount, 0);
        }
      }
    } catch (cause) {
      if (generation !== walletLoadGeneration) return;
      walletLoadError =
        accelerationRequest && dataLoaded
          ? ''
          : localizedError(cause, $locale, 'The wallet data could not be read.');
      const description = accelerationRequest
        ? accelerationUnavailableDescription(accelerationRequest.method, cause, $locale)
        : cause instanceof WalletError && cause.code === 'insufficient_funds'
          ? `The amount plus network fee exceeds the ${selectedCoins.length ? 'selected coin balance' : 'available balance'}.`
          : localizedError(cause, $locale);
      if (accelerationRequest) {
        feeEstimateError = description ?? 'Could not prepare fee acceleration.';
        toast({
          title: accelerationUnavailableTitle(accelerationRequest.method),
          description: feeEstimateError,
          tone: 'danger'
        });
      } else {
        toast({ title: 'Could not load wallet', description, tone: 'danger' });
      }
    } finally {
      if (generation === walletLoadGeneration) {
        accelerationLoading = false;
        walletLoading = false;
      }
    }
  }

  onDestroy(() => {
    ++walletLoadGeneration;
    if (!suppressDraftSave) void saveCurrentDraft();
    hardwareScanGeneration += 1;
    passphrase = '';
  });

  async function saveCurrentDraft() {
    if (
      suppressDraftSave ||
      !draftWalletId ||
      proposal ||
      !addressValid ||
      submissionLabels.length === 0
    )
      return;
    await walletService.savePaymentDraft({
      kind: 'single_key',
      walletId: draftWalletId,
      address,
      labels: [...submissionLabels],
      amount,
      stage: draftStep,
      selectedCoins: [...selectedCoins],
      automaticStrategy,
      speed,
      customFee
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
    preparing = true;
    try {
      proposal = await walletService.preparePayment(
        address,
        submissionLabels,
        sats(amountSats),
        asFeeRate(selectedFeeRate),
        selection
      );
      if (draftWalletId) {
        await walletService.clearPaymentDraft();
        hasPaymentDraft = false;
      }
      if (externalSigner)
        externalProposal =
          (await walletService.externalSignerProposals()).find(
            (item) => item.proposalId === proposal?.proposalId
          ) ?? null;
      step = 2;
    } catch (cause) {
      toast({
        title: 'Could not prepare payment',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      preparing = false;
    }
  }

  async function useMaxAmount(requestedFeeRate = selectedFeeRate, announce = true) {
    if (!addressValid || requestedFeeRate <= 0) return;
    const requestRevision = ++maxSpendRequestRevision;
    const request = {
      recipient: address,
      feeRate: requestedFeeRate,
      coinSelection:
        selection.mode === 'manual'
          ? { mode: 'manual' as const, outpoints: [...selection.outpoints] }
          : { mode: 'auto' as const, strategy: selection.strategy }
    };
    try {
      const maximum = await walletService.maxSpend(
        request.recipient,
        asFeeRate(request.feeRate),
        request.coinSelection
      );
      if (
        !isCurrentMaxSpendResponse(requestRevision, maxSpendRequestRevision, request, {
          recipient: address,
          feeRate: selectedFeeRate,
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
      toast({
        title: 'Maximum unavailable',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
  }

  function toggleAmountInputDenomination() {
    const next = $denomination === 'btc' ? 'sats' : 'btc';
    const converted = convertAmountInput(amount, $denomination, next);
    if (converted === null) return;
    amount = converted;
    setDenomination(next);
  }

  function updateFeeRate(rate: number) {
    const refreshMaximum = maxSpendActive;
    const match = Object.entries(fees).find(([, value]) => value === rate);
    if (match) speed = match[0];
    else {
      speed = 'custom';
      customFee = rate ? String(rate) : '';
    }
    if (refreshMaximum && Number.isFinite(rate) && rate > 0) void useMaxAmount(rate, false);
  }

  async function prepareCustomAcceleration() {
    const request = accelerationRequest;
    if (!request || !customFeeValid) return;
    preparing = true;
    try {
      if (request.method === 'rbf') {
        rbfQuote = await walletService.quoteRbf(request.txid, asFeeRate(Number(customFee)));
        customFee = String(rbfQuote.targetFeeRate);
      } else {
        cpfpQuote = await walletService.quoteCpfp(request.txid, asFeeRate(Number(customFee)));
        customFee = String(cpfpQuote.targetFeeRate);
      }
      proposal = await walletService.prepareAcceleration(
        request.txid,
        request.method,
        asFeeRate(Number(rbfQuote?.targetFeeRate ?? cpfpQuote?.targetFeeRate ?? customFee))
      );
      address = proposal.recipient;
      selectedLabels = proposal.labels ?? [proposal.label];
      label = '';
      amount = String(proposal.amount);
      if (externalSigner)
        externalProposal =
          (await walletService.externalSignerProposals()).find(
            (item) => item.proposalId === proposal?.proposalId
          ) ?? null;
      accelerationRequest = null;
      step = 2;
    } catch (cause) {
      feeEstimateError = accelerationUnavailableDescription(request.method, cause, $locale);
      toast({
        title: accelerationUnavailableTitle(request.method),
        description: feeEstimateError,
        tone: 'danger'
      });
    } finally {
      preparing = false;
    }
  }

  function useAutomatic() {
    selectedCoins = [];
    showCoins = false;
    available = coins
      .filter((coin) => !coin.frozen)
      .reduce((total, coin) => total + coin.amount, 0);
  }
  function toggleCoin(outpoint: string, checked: boolean) {
    selectedCoins = toggleManualCoin(selectedCoins, outpoint, checked);
    available = coins
      .filter((coin) => !coin.frozen && selectedCoins.includes(coin.outpoint))
      .reduce((total, coin) => total + coin.amount, 0);
  }

  async function broadcast() {
    if (!passphrase || !proposal) return;
    credentialError = '';
    broadcasting = true;
    try {
      const result = externalSigner
        ? await walletService.broadcastExternalSignerProposal(
            proposal.proposalId,
            externalProposal?.psbt ?? '',
            passphrase
          )
        : await walletService.signAndBroadcast(proposal.proposalId, passphrase);
      txid = result.txid;
      sentAmount = Number(proposal.amount);
      balanceSyncPending = result.syncPending;
      available = result.snapshot.balance.total;
      passphrase = '';
      step = 4;
    } catch (cause) {
      credentialError = localizedError(cause, $locale, 'Could not sign or broadcast.');
      passphrase = '';
    } finally {
      broadcasting = false;
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
  function clearSigningTransportError() {
    importError = '';
    credentialError = '';
  }
  function openPsbtImport() {
    imported = '';
    clearSigningTransportError();
    importOpen = true;
  }
  function closePsbtImport() {
    if (broadcasting) return;
    const durableError = importError;
    imported = '';
    importOpen = false;
    importError = durableError;
    credentialError = durableError;
  }
  async function redirectExpiredHardwareSession(cause?: unknown): Promise<boolean> {
    if (cause && (!(cause instanceof WalletError) || cause.code !== 'wallet_locked')) return false;
    hardwareScanGeneration += 1;
    broadcasting = false;
    deviceOpen = false;
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
  async function scanHardware() {
    if (!(await hardwareSessionIsUnlocked())) return;
    const generation = ++hardwareScanGeneration;
    clearSigningTransportError();
    deviceOpen = true;
    hardwareAction = 'scan';
    broadcasting = true;
    deviceError = '';
    try {
      const discovered = externalWallet
        ? [await walletService.findSavedHardwareDevice(externalWallet.signer)]
        : await walletService.listHardwareDevices();
      if (generation !== hardwareScanGeneration || !deviceOpen) return;
      devices = discovered;
    } catch (cause) {
      if (generation !== hardwareScanGeneration) return;
      if (await redirectExpiredHardwareSession(cause)) return;
      devices = [];
      deviceError = localizedError(cause, $locale, 'Could not find hardware.');
    } finally {
      if (generation === hardwareScanGeneration) broadcasting = false;
    }
  }
  function closeHardwareScan() {
    if (broadcasting && hardwareAction !== 'scan') {
      hardwareCancelRequested = true;
      hardwareAttentionSignal += 1;
      return;
    }
    hardwareScanGeneration += 1;
    broadcasting = false;
    deviceOpen = false;
  }
  async function signHardware(device: HardwareDevice) {
    if (!proposal || !externalProposal) return;
    const releaseHardwareReview = walletShell.beginHardwareReview();
    hardwareAction = 'sign';
    hardwareCancelRequested = false;
    broadcasting = true;
    deviceError = '';
    try {
      externalProposal = await walletService.signExternalWithHardware(
        proposal.proposalId,
        device.id,
        externalProposal.psbt
      );
      deviceOpen = false;
      toast({ title: 'Hardware signature added', tone: 'success' });
    } catch (cause) {
      if (await redirectExpiredHardwareSession(cause)) return;
      deviceOpen = !hardwareCancelRequested;
      deviceError = hardwareCancelRequested
        ? ''
        : localizedError(cause, $locale, 'Hardware signing failed.');
    } finally {
      releaseHardwareReview();
      broadcasting = false;
      hardwareCancelRequested = false;
    }
  }
  async function importSigned() {
    if (!proposal || !externalProposal || !imported.trim()) return;
    broadcasting = true;
    credentialError = '';
    importError = '';
    try {
      externalProposal = await walletService.importExternalSignerProposal(
        proposal.proposalId,
        externalProposal.psbt,
        imported
      );
      imported = '';
      importOpen = false;
      toast({ title: 'Signed PSBT validated', tone: 'success' });
    } catch (cause) {
      importError = localizedError(cause, $locale, 'Signed PSBT was rejected.');
      credentialError = importError;
      toast({ title: 'Signed PSBT rejected', description: importError, tone: 'danger' });
    } finally {
      broadcasting = false;
    }
  }
  async function loadSignedFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    importError = '';
    credentialError = '';
    try {
      imported = await readTransferFile(file);
    } catch (cause) {
      importError = localizedError(cause, $locale, 'Could not read PSBT.');
      credentialError = importError;
      toast({ title: 'Could not read PSBT', description: importError, tone: 'danger' });
    }
  }
  async function showPsbtQr() {
    if (!externalProposal) return;
    clearSigningTransportError();
    broadcasting = true;
    try {
      urFrames = await walletService.encodePsbtUr(externalProposal.psbt);
      qrOpen = true;
    } catch (cause) {
      credentialError = localizedError(cause, $locale, 'Could not encode the PSBT QR.');
    } finally {
      broadcasting = false;
    }
  }
  async function saveExternalPsbt() {
    if (!externalProposal || savingPsbt) return;
    clearSigningTransportError();
    savingPsbt = true;
    try {
      const saved = await walletService.savePsbt(
        psbtFilename(externalProposal.proposalId, externalProposal.signed),
        externalProposal.psbt
      );
      if (saved.saved)
        toast({
          title: externalProposal.signed ? 'Signed PSBT saved' : 'PSBT saved',
          description: externalProposal.signed
            ? 'The signed transaction was saved to the selected file.'
            : 'The unsigned transaction was saved to the selected file.',
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
      credentialError = localizedError(cause, $locale, 'Could not save the PSBT.');
      toast({ title: 'Could not save PSBT', description: credentialError, tone: 'danger' });
    } finally {
      savingPsbt = false;
    }
  }
  async function confirmCancelProposal() {
    if (!proposal || broadcasting || (externalSigner && !externalProposal)) return;
    broadcasting = true;
    cancelError = '';
    try {
      if (externalSigner) await walletService.cancelExternalSignerProposal(proposal.proposalId);
      else await walletService.cancelPaymentProposal(proposal.proposalId);
      proposal = null;
      externalProposal = null;
      address = '';
      label = '';
      amount = '';
      passphrase = '';
      step = 1;
      draftStep = 1;
      cancelOpen = false;
      toast({
        title: 'Payment canceled',
        description: 'The transaction and any collected signatures were discarded.'
      });
      await goto('/');
    } catch (cause) {
      cancelError = localizedError(cause, $locale, 'The payment could not be canceled.');
    } finally {
      broadcasting = false;
    }
  }
  async function confirmDiscardExternalSignature() {
    if (!proposal || !externalProposal || broadcasting) return;
    broadcasting = true;
    discardSignatureError = '';
    try {
      externalProposal = await walletService.discardExternalSignerSignature(
        proposal.proposalId,
        externalProposal.psbt
      );
      discardSignatureOpen = false;
      toast({
        title: 'Local signature discarded',
        description: 'The transaction details are unchanged and ready for hardware signing again.',
        tone: 'success'
      });
    } catch (cause) {
      discardSignatureError = localizedError(
        cause,
        $locale,
        'The local signature could not be discarded.'
      );
    } finally {
      broadcasting = false;
    }
  }
  async function receiveUrFrame(frame: string) {
    if (scannedFrames.includes(frame)) return;
    scannedFrames = [...scannedFrames, frame];
    try {
      imported = await walletService.decodePsbtUr(scannedFrames);
      qrScanOpen = false;
      await importSigned();
    } catch (cause) {
      const message = localizedError(cause, $locale, '');
      if (!message.includes('Keep scanning'))
        credentialError = message || 'The QR frame was rejected.';
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
      draftError = '';
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
  async function continueToAmount() {
    if (!intentValid) return;
    draftError = '';
    selectedLabels = submissionLabels;
    label = '';
    draftStep = 2;
    try {
      await saveCurrentDraft();
    } catch (cause) {
      draftStep = 1;
      draftError = localizedError(cause, $locale, 'Could not save payment draft.');
      toast({
        title: 'Could not save payment draft',
        description: draftError,
        tone: 'danger'
      });
    }
  }
</script>

<div class="page narrow-page send-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'SEND')}</p>
      <h1>{translate($locale, 'Send bitcoin')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          step === 1 && draftStep === 1
            ? 'Name the payment and choose its recipient.'
            : step === 1
              ? 'Choose the amount, coins, and network fee.'
              : step === 2
                ? 'Review everything carefully.'
                : step === 3
                  ? 'Unlock, sign, and broadcast.'
                  : accelerationMethod === 'cpfp'
                    ? 'Transaction accelerated.'
                    : accelerationMethod === 'rbf'
                      ? 'Transaction accelerated.'
                      : 'Payment sent.'
        )}
      </p>
    </div>
    {#if hasPaymentDraft && !proposal && !accelerationRequest}<div class="page-header-actions">
        <Button
          variant="ghost-danger"
          size="small"
          onclick={() => {
            discardDraftError = '';
            discardDraftOpen = true;
          }}><Trash2 size={14} />{translate($locale, 'Discard draft')}</Button
        ><Button variant="secondary" size="small" href="/">{translate($locale, 'Back')}</Button>
      </div>{/if}
  </header>
  {#if step < 4}<SendProgress current={progressStep} />{/if}
  {#if step < 4 && (!walletLoadError || signerSummaryReady)}<SignerSummary
      signers={signerItems}
      signedFingerprints={externalProposal?.signedFingerprints ?? []}
      collecting={externalSigner && Boolean(proposal)}
      loading={!signerSummaryReady && !walletLoadError}
      ondiscard={externalSigner
        ? () => {
            discardSignatureError = '';
            discardSignatureOpen = true;
          }
        : undefined}
    />{/if}

  {#if walletLoadError}
    <LoadFailure
      title={translate($locale, 'Wallet details are unavailable')}
      description={walletLoadError}
      onretry={loadWallet}
    />
  {/if}
  {#if accelerationLoading}
    <section class="form-card send-stage-card acceleration-loading-card" aria-live="polite">
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
  {:else if step === 1 && accelerationRequest}
    <form
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
              : 'Bitcoin Core has no usable estimate. Groot will not invent one; choose the sat/vB rate you\n          want to review.'
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
                bind:value={customFee}
                onblur={async () => {
                  if (!accelerationRequest || !customFeeValid) return;
                  try {
                    if (accelerationRequest.method === 'rbf') {
                      rbfQuote = await walletService.quoteRbf(
                        accelerationRequest.txid,
                        asFeeRate(Number(customFee))
                      );
                      customFee = String(rbfQuote.targetFeeRate);
                    } else {
                      cpfpQuote = await walletService.quoteCpfp(
                        accelerationRequest.txid,
                        asFeeRate(Number(customFee))
                      );
                      customFee = String(cpfpQuote.targetFeeRate);
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
              bind:value={customFee}
              inputmode="decimal"
              placeholder={translate($locale, 'Enter a fee rate')}
            /><b>{translate($locale, 'sat/vB')}</b>
          </div>
          <small>{translate($locale, 'Required · greater than 0 and at most 10,000 sat/vB')}</small
          ></label
        >
      {/if}
      {#if feeEstimateError}<p class="form-error" role="alert">{feeEstimateError}</p>{/if}
      <Button
        type="submit"
        disabled={!customFeeValid}
        loading={preparing}
        loadingLabel={translate($locale, 'Preparing acceleration…')}
        size="large"
        class="full">{translate($locale, 'Continue to sign')}<ArrowRight size={17} /></Button
      >
    </form>
  {:else if step === 1 && draftStep === 1}
    <form
      class="form-card send-stage-card"
      onsubmit={(event) => {
        event.preventDefault();
        continueToAmount();
      }}
      in:fly={{ x: 8, duration: 180 }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'STEP 1')}</span>
        <h2>{translate($locale, 'What is this payment for?')}</h2>
        <p>
          {translate($locale, 'Labels help you recognize the transaction later.')}
        </p>
      </div>
      <PermanentLabelEditor
        id="send-label-input"
        title={translate($locale, 'Payment label')}
        placeholder={translate($locale, 'e.g. Hardware purchase, Pay Alex, Test transaction')}
        hint={translate($locale, 'Required · cannot be changed')}
        discreet={$discreetMode}
        suggestions={visibleSuggestions}
        bind:labels={selectedLabels}
        bind:value={label}
      />
      <div class="field">
        <span>{translate($locale, 'Bitcoin address')}</span>
        <div class="address-input-control">
          <input
            aria-label={translate($locale, 'Bitcoin address')}
            bind:value={address}
            oninput={() => {
              draftError = '';
              paymentRequestNotice = '';
            }}
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
      <Button
        type="submit"
        disabled={!intentValid || walletLoading || Boolean(walletLoadError)}
        size="large"
        class="full">{translate($locale, 'Continue to amount')}<ArrowRight size={17} /></Button
      >
      {#if draftError}<div class="hardware-inline-error send-form-error" role="alert">
          <AlertTriangle size={18} /><span
            ><strong>{translate($locale, 'Could not save payment draft')}</strong><small
              >{draftError}</small
            ></span
          >
        </div>{/if}
    </form>
  {:else if step === 1}
    <form
      class="form-card send-stage-card"
      onsubmit={(event) => {
        event.preventDefault();
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
        >
        {#if showCoins}<div class="send-coin-picker">
            <fieldset class="automatic-strategies">
              <legend>{translate($locale, 'Automatic strategy')}</legend
              >{#each [{ id: 'balanced', name: 'Balanced', detail: 'Limit privacy merges without excessive fees' }, { id: 'private', name: 'More private', detail: 'Avoid reused, unknown, and unrelated coins' }, { id: 'lower_fee', name: 'Lower fee', detail: 'Prefer fewer, larger inputs' }] as option}<button
                  type="button"
                  class:active={automaticStrategy === option.id && !selectedCoins.length}
                  onclick={() => {
                    automaticStrategy = option.id as AutomaticSelectionStrategy;
                    selectedCoins = [];
                    available = coins
                      .filter((coin) => !coin.frozen)
                      .reduce((total, coin) => total + coin.amount, 0);
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
                    )}{translate($locale, coin.frozen ? ' · Frozen' : '')}</small
                  ></span
                ></label
              >{/each}<button type="button" onclick={useAutomatic}
              >{translate($locale, 'Use automatic selection')}</button
            >
          </div>{/if}
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
      </div>
      <FeeSelector
        {estimates}
        value={selectedFeeRate}
        estimatedFee={fee}
        error={feeEstimateError}
        onchange={updateFeeRate}
      />
      <div class="split-actions">
        <Button variant="secondary" size="large" onclick={() => (draftStep = 1)}
          >{translate($locale, 'Back')}</Button
        ><Button
          type="submit"
          disabled={!valid}
          loading={preparing}
          loadingLabel={translate($locale, 'Preparing payment…')}
          size="large">{translate($locale, 'Review payment')}<ArrowRight size={17} /></Button
        >
      </div>
    </form>
  {:else if step === 2 && proposal}
    <section class="form-card">
      <div class="review-amount">
        <span>{translate($locale, 'You send')}</span><strong
          ><Amount value={proposal.amount} interactive /></strong
        >
      </div>
      <dl class="details-list">
        <div>
          <dt>{translate($locale, 'To')}</dt>
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
          <dd><Amount value={proposal.fee} interactive /></dd>
        </div>
        <div class="total">
          <dt>{translate($locale, 'Total')}</dt>
          <dd><Amount value={proposal.total} interactive /></dd>
        </div>
      </dl>
      <div class:warning={proposalHasPrivacyWarning} class="selection-review">
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
      </div>
      {#if proposal.selectionImpact.feeDifferenceVsPrivate !== null}<div class="selection-review">
          <strong>{translate($locale, 'Exact strategy comparison')}</strong><span
            ><Amount value={Math.abs(proposal.selectionImpact.feeDifferenceVsPrivate)} />
            {translate(
              $locale,
              proposal.selectionImpact.feeDifferenceVsPrivate <= 0 ? 'lower' : 'higher'
            )}
            {translate(
              $locale,
              'than the valid\n            More private candidate. Lower fee is not better privacy.'
            )}</span
          >
        </div>{/if}
      <TransactionReviewDetails
        {proposal}
        interactiveAmounts
        onChangeAddress={() => (changeAddressOpen = true)}
      />
      <div class="warning-box">
        {translate(
          $locale,
          'Bitcoin transactions cannot be reversed. Verify the address and amount before signing.'
        )}
      </div>
      <div class="split-actions">
        <Button
          variant="danger-outline"
          size="large"
          onclick={() => {
            cancelError = '';
            cancelOpen = true;
          }}>{translate($locale, 'Cancel payment')}</Button
        ><Button size="large" onclick={() => (step = 3)}
          >{translate($locale, 'Continue to sign')}<ArrowRight size={17} /></Button
        >
      </div>
    </section>
  {:else if step === 3 && proposal && externalSigner}
    <section class="form-card sign-card">
      {#if externalProposal?.canFinalize}
        <span class="sign-icon success"><Check size={25} /></span>
        <h2>{translate($locale, 'Review signed transaction')}</h2>
        <p>
          {translate(
            $locale,
            'The hardware signature is verified. Review the transaction once more before broadcasting.'
          )}
        </p>
      {:else}
        <span class="sign-icon"><Cpu size={25} /></span>
        <h2>{translate($locale, 'Sign on your hardware')}</h2>
        <p>
          {translate(
            $locale,
            'Verify the address, amount, and fee on the signer. Groot never receives its private key or\n          hardware passphrase.'
          )}
        </p>
      {/if}
      <section
        class="signed-transaction-review"
        aria-label={translate(
          $locale,
          externalProposal?.canFinalize ? 'Signed transaction review' : 'Transaction review'
        )}
      >
        <dl class="details-list">
          <div>
            <dt>{translate($locale, 'To')}</dt>
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
            <dt>{translate($locale, 'Amount')}</dt>
            <dd><Amount value={proposal.amount} interactive /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{proposal.network}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network fee')}</dt>
            <dd><Amount value={proposal.fee} interactive /></dd>
          </div>
          <div class="total">
            <dt>{translate($locale, 'Total')}</dt>
            <dd><Amount value={proposal.total} interactive /></dd>
          </div>
        </dl>
        <TransactionReviewDetails
          {proposal}
          interactiveAmounts
          onChangeAddress={() => (changeAddressOpen = true)}
        />
      </section>
      {#if externalProposal?.canFinalize}
        <div class="ready-panel">
          <Check size={18} />
          <div>
            <strong>{translate($locale, 'Signature verified')}</strong><small
              >{translate(
                $locale,
                'Enter this wallet’s Groot app PIN to broadcast this exact signed transaction.'
              )}</small
            >
          </div>
        </div>
        <PasswordField
          label={translate($locale, 'App PIN')}
          bind:value={passphrase}
          oninput={() => (credentialError = '')}
          autocomplete="current-password"
          error={credentialError}
        /><Button
          size="large"
          class="full"
          disabled={!passphrase}
          loading={broadcasting}
          loadingLabel={translate($locale, 'Broadcasting…')}
          onclick={broadcast}>{translate($locale, 'Finalize & broadcast')}</Button
        >
      {:else}
        <div class="psbt-actions">
          <Button variant="secondary" onclick={scanHardware}
            ><Cpu size={16} />{translate($locale, 'Sign with cable')}</Button
          ><Button variant="secondary" onclick={showPsbtQr}
            ><QrCode size={16} />{translate($locale, 'Show unsigned QR')}</Button
          ><Button
            variant="secondary"
            onclick={() => {
              clearSigningTransportError();
              scannedFrames = [];
              qrScanOpen = true;
            }}><ScanLine size={16} />{translate($locale, 'Scan signed QR')}</Button
          ><Button variant="secondary" onclick={openPsbtImport}
            ><FileUp size={16} />{translate($locale, 'Import signed PSBT')}</Button
          ><Button
            variant="secondary"
            loading={savingPsbt}
            loadingLabel={translate($locale, 'Saving PSBT…')}
            onclick={saveExternalPsbt}
            ><Download size={16} />{translate($locale, 'Save unsigned PSBT')}</Button
          >
        </div>
        {#if importError}<div class="hardware-inline-error signing-transport-error" role="alert">
            <AlertTriangle size={18} /><span
              ><strong>{translate($locale, 'Signed PSBT rejected')}</strong><small
                >{importError}</small
              ></span
            >
          </div>{:else if credentialError}<p class="form-error" role="alert">
            {credentialError}
          </p>{/if}
      {/if}
      <Button variant="ghost" size="large" class="full sign-back-action" onclick={() => (step = 2)}
        >{translate($locale, 'Back to review')}</Button
      >
      <Button
        variant="ghost-danger"
        size="large"
        class="full proposal-cancel-action"
        disabled={broadcasting}
        onclick={() => {
          cancelError = '';
          cancelOpen = true;
        }}><X size={15} />{translate($locale, 'Cancel payment')}</Button
      >
    </section>
  {:else if step === 3 && proposal}
    <form
      class="form-card sign-card"
      onsubmit={(event) => {
        event.preventDefault();
        broadcast();
      }}
    >
      <span class="sign-icon"><LockKeyhole size={25} /></span>
      <h2>{translate($locale, 'Authorize payment')}</h2>
      <p>
        {translate(
          $locale,
          'Enter your wallet passphrase to unlock the signing keys. It never leaves this device.'
        )}
      </p>
      <section
        class="signed-transaction-review"
        aria-label={translate($locale, 'Transaction authorization review')}
      >
        <dl class="details-list">
          <div>
            <dt>{translate($locale, 'To')}</dt>
            <dd>
              <button
                type="button"
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
            <dt>{translate($locale, 'Amount')}</dt>
            <dd><Amount value={proposal.amount} interactive /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{proposal.network}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network fee')}</dt>
            <dd><Amount value={proposal.fee} interactive /></dd>
          </div>
          <div class="total">
            <dt>{translate($locale, 'Total')}</dt>
            <dd><Amount value={proposal.total} interactive /></dd>
          </div>
        </dl>
        <TransactionReviewDetails
          {proposal}
          interactiveAmounts
          onChangeAddress={() => (changeAddressOpen = true)}
        />
      </section>
      <PasswordField
        label={translate($locale, 'Wallet passphrase')}
        bind:value={passphrase}
        oninput={() => (credentialError = '')}
        placeholder={translate($locale, 'Enter wallet passphrase')}
        autocomplete="current-password"
        error={credentialError}
        hint={translate(
          $locale,
          'The BIP39 passphrase kept with this software wallet’s recovery words.'
        )}
      />
      <Button
        type="submit"
        size="large"
        class="full"
        disabled={!passphrase}
        loading={broadcasting}
        loadingLabel={translate($locale, 'Signing & broadcasting…')}
        >{translate($locale, 'Sign & broadcast')}
        {formatAmount(Number(proposal.amount), $denomination)}
        {amountUnit($denomination)}</Button
      >
      <Button variant="ghost" size="large" class="full sign-back-action" onclick={() => (step = 2)}
        >{translate($locale, 'Back to review')}</Button
      >
      <Button
        variant="ghost-danger"
        size="large"
        class="full proposal-cancel-action"
        disabled={broadcasting}
        onclick={() => {
          cancelError = '';
          cancelOpen = true;
        }}><X size={15} />{translate($locale, 'Cancel payment')}</Button
      >
    </form>
  {:else}
    <section class="empty-state success-state">
      <span class="empty-icon success"><Check size={25} /></span>
      <h2>
        {translate(
          $locale,
          accelerationMethod === 'cpfp'
            ? 'Transaction accelerated'
            : accelerationMethod === 'rbf'
              ? 'Transaction accelerated'
              : 'Payment sent'
        )}
      </h2>
      <div class="success-amount">
        <Amount
          value={accelerationMethod === 'cpfp' ? Number(proposal?.fee ?? 0) : sentAmount}
          interactive
        />
      </div>
      <p>
        {#if accelerationMethod === 'cpfp'}{translate(
            $locale,
            'The additional fee was accepted. Your payment is waiting for confirmation.'
          )}{:else if accelerationMethod === 'rbf'}{translate(
            $locale,
            'The higher fee was accepted. Your payment amount and recipient stayed the same.'
          )}{:else}{translate(
            $locale,
            'Your payment was accepted by the Bitcoin network.'
          )}{/if}{#if balanceSyncPending}
          {translate($locale, 'Balance refresh is pending; sync when the node is available.')}{/if}
      </p>
      <button class="hash-box" type="button" onclick={copyBroadcastTxid}
        ><span>{translate($locale, 'Transaction ID')}</span><code>{compactIdentifier(txid)}</code
        ><Copy size={16} /></button
      >
      <div class="success-actions">
        <Button
          onclick={() => {
            step = 1;
            address = '';
            label = '';
            amount = '';
            passphrase = '';
            proposal = null;
            txid = '';
            sentAmount = 0;
            balanceSyncPending = false;
            accelerationMethod = null;
            broadcastExplorerError = '';
          }}>{translate($locale, 'Make another payment')}</Button
        ><Button variant="secondary" href="/activity"
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
  {/if}
</div>

<Modal
  open={deviceOpen}
  title={translate($locale, 'Sign with hardware')}
  description={translate(
    $locale,
    'Use the same passphrase-protected hardware signer whose fingerprint you imported.'
  )}
  onclose={closeHardwareScan}
  attentionSignal={hardwareAttentionSignal}
  >{#if proposal}<section
      class="hardware-review"
      aria-label={translate($locale, 'Authoritative transaction details')}
    >
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
          <dd><Amount value={proposal.amount} interactive /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network')}</dt>
          <dd>{proposal.network}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network fee')}</dt>
          <dd><Amount value={proposal.fee} interactive /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Total')}</dt>
          <dd><Amount value={proposal.total} interactive /></dd>
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
        </p>{/if}<TransactionReviewDetails
        {proposal}
        compact
        interactiveAmounts
        changeAddressOverride={hardwareChangeAddress}
        onChangeAddress={() => (hardwareChangeAddressOpen = true)}
      />
    </section>{/if}{#if broadcasting}<HardwareActionPrompt
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
            ? 'Review the recipient, amount, fee, and change, then approve the transaction on the device.'
            : 'Keep the signer connected. Follow any unlock instructions shown by Groot or the device.'
      )}
      label={translate(
        $locale,
        hardwareCancelRequested
          ? 'Waiting for hardware cancellation'
          : hardwareAction === 'sign'
            ? 'Waiting for hardware signature'
            : 'Hardware device scan in progress'
      )}
    />{:else}<HardwareDeviceList
      {devices}
      savedSigners={externalWallet ? [externalWallet.signer] : []}
      emptyMessage={translate(
        $locale,
        'Connect the signer and scan again. If another wallet app is open, quit it so Groot can use USB.'
      )}
      onselect={signHardware}
      onrescan={scanHardware}
      showRescan
    />{/if}{#if deviceError}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Hardware signing failed')}</strong><small>{deviceError}</small
        ></span
      ><Button variant="secondary" size="small" onclick={scanHardware}
        >{translate($locale, 'Rescan')}</Button
      >
    </div>{/if}</Modal
>
<Modal
  open={importOpen}
  title={translate($locale, 'Import signed PSBT')}
  description={translate(
    $locale,
    'Only a valid signature from this wallet’s exact fingerprint is accepted.'
  )}
  onclose={closePsbtImport}
  ><label class="file-action"
    ><FileUp size={16} />{translate($locale, 'Choose signed PSBT')}<input
      aria-label={translate($locale, 'Choose signed PSBT file')}
      type="file"
      accept=".psbt,text/plain"
      onchange={loadSignedFile}
    /></label
  ><label class="field"
    ><span>{translate($locale, 'Signed PSBT')}</span><textarea
      rows="6"
      bind:value={imported}
      oninput={() => {
        importError = '';
        credentialError = '';
      }}
      placeholder={translate($locale, 'cHNidP8…')}></textarea></label
  >{#if importError}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Signed PSBT rejected')}</strong><small>{importError}</small
        ></span
      >
    </div>{/if}
  <div class="modal-footer">
    <Button variant="secondary" disabled={broadcasting} onclick={closePsbtImport}
      >{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!imported.trim()}
      loading={broadcasting}
      loadingLabel={translate($locale, 'Validating…')}
      onclick={importSigned}>{translate($locale, 'Validate signature')}</Button
    >
  </div></Modal
>
<Modal
  open={qrOpen}
  title={translate($locale, 'Unsigned PSBT')}
  description={translate($locale, 'Scan with an offline signer. No private key data is encoded.')}
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
    'Groot accepts only crypto-psbt UR frames and verifies the exact proposal before importing.'
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
  open={discardSignatureOpen}
  title={translate($locale, 'Discard local signature?')}
  description={translate(
    $locale,
    'Keep this transaction and remove its hardware signature from Groot.'
  )}
  onclose={() => {
    if (!broadcasting) {
      discardSignatureOpen = false;
      discardSignatureError = '';
    }
  }}
  >{#if proposal && externalProposal}<div class="warning-box danger">
      <strong>{translate($locale, 'This does not revoke the signature.')}</strong><span
        >{translate(
          $locale,
          'Any PSBT copy already exported or shared may still contain it and remain broadcastable.'
        )}</span
      >
    </div>
    <dl class="details-list cancel-proposal-details">
      <div>
        <dt>{translate($locale, 'Payment')}</dt>
        <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Signature progress')}</dt>
        <dd>{externalProposal.signed} {translate($locale, 'of 1 → 0 of 1')}</dd>
      </div>
    </dl>
    {#if discardSignatureError}<p class="form-error" role="alert">
        {discardSignatureError}
      </p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        disabled={broadcasting}
        onclick={() => {
          discardSignatureOpen = false;
          discardSignatureError = '';
        }}>{translate($locale, 'Keep signature')}</Button
      ><Button
        variant="danger"
        loading={broadcasting}
        loadingLabel={translate($locale, 'Discarding signature…')}
        onclick={confirmDiscardExternalSignature}
        >{translate($locale, 'Discard local signature')}</Button
      >
    </div>{/if}</Modal
>
<Modal
  open={cancelOpen}
  title={translate($locale, 'Cancel this payment?')}
  description={translate($locale, 'Review what will be discarded before continuing.')}
  onclose={() => {
    if (!broadcasting) {
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
        <dd><Amount value={proposal.amount} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Signatures lost')}</dt>
        <dd>
          {translate($locale, '{signed} of {required} collected', {
            signed: externalProposal?.signed ?? 0,
            required: externalProposal?.required ?? 1
          })}
        </dd>
      </div>
    </dl>
    {#if cancelError}<p class="form-error" role="alert">{cancelError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        disabled={broadcasting}
        onclick={() => {
          cancelOpen = false;
          cancelError = '';
        }}>{translate($locale, 'Keep payment')}</Button
      ><Button
        variant="danger"
        loading={broadcasting}
        loadingLabel={translate($locale, 'Canceling payment…')}
        onclick={confirmCancelProposal}>{translate($locale, 'Cancel payment')}</Button
      >
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
    'This output was verified by the Rust wallet as controlled by this wallet.'
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
