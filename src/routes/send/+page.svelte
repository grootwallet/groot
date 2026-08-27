<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    AlertTriangle,
    ArrowRight,
    Check,
    CircleDot,
    Cpu,
    Download,
    FileUp,
    Gauge,
    LockKeyhole,
    QrCode,
    ScanLine,
    X
  } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import HardwareDeviceList from '$lib/components/HardwareDeviceList.svelte';
  import TransactionReviewDetails from '$lib/components/TransactionReviewDetails.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import RecipientAddressModal from '$lib/components/RecipientAddressModal.svelte';
  import SendProgress from '$lib/components/SendProgress.svelte';
  import SignerSummary from '$lib/components/SignerSummary.svelte';
  import { psbtFilename, readTransferFile } from '$lib/transfer';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import {
    feeRate as asFeeRate,
    sats,
    walletService,
    WalletError,
    type AutomaticSelectionStrategy,
    type CoinSelection,
    type CoinSelectionPreview,
    type ExternalSignerWallet,
    type FeeEstimates,
    type HardwareDevice,
    type MultisigProposal,
    type PaymentProposal
  } from '$lib/wallet';
  import type { LabelSuggestion, Utxo } from '$lib/types';
  import { defaultConfig, networkName } from '$lib/config';
  import { addressPrefixForNetwork, hasAddressPrefixForNetwork } from '$lib/wallet/policy';
  import { compactAddress } from '$lib/address-display';
  import {
    addressForHardwareDisplay,
    testnetAddressDisplayName
  } from '$lib/wallet/hardware-display';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
  import {
    addPermanentLabel,
    backspaceLabelDraft,
    MAX_MANUAL_PERMANENT_LABELS,
    permanentLabelsForSubmission,
    tokenizeLabelDraft,
    visibleLabelSuggestions,
    VISIBLE_LABEL_SUGGESTION_LIMIT
  } from '$lib/wallet/label-suggestions';
  import { accelerationUnavailableTitle } from '$lib/wallet/acceleration-presentation';
  import { discreetMode } from '$lib/privacy';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import FeeSelector from '$lib/components/FeeSelector.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import {
    amountInputValue,
    amountUnit,
    denomination,
    formatAmount,
    parseAmountInput
  } from '$lib/denomination';
  import { fly } from 'svelte/transition';
  import { useWalletShellContext } from '$lib/wallet/shell-context';

  const walletShell = useWalletShellContext();

  let step = $state(1);
  let draftStep = $state<1 | 2>(1);
  let address = $state('');
  let label = $state('');
  let selectedLabels = $state<string[]>([]);
  let armedLabelIndex = $state<number | null>(null);
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
  let proposal = $state<PaymentProposal | null>(null);
  let txid = $state('');
  let sentAmount = $state(0);
  let balanceSyncPending = $state(false);
  let accelerationMethod = $state<'rbf' | 'cpfp' | null>(null);
  let accelerationRequest = $state<{ txid: string; method: 'rbf' | 'cpfp' } | null>(null);
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
  const selection = $derived<CoinSelection>(
    selectedCoins.length
      ? { mode: 'manual', outpoints: selectedCoins }
      : { mode: 'auto', strategy: automaticStrategy }
  );
  const automaticStrategyLabel = $derived(
    translate(
      $locale,
      automaticStrategy === 'private'
        ? 'More private'
        : automaticStrategy === 'lower_fee'
          ? 'Lower fee'
          : 'Balanced'
    )
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
  const fee = $derived(Number(proposal?.fee ?? Math.max(0, Math.round(selectedFeeRate * 141))));
  const amountSats = $derived(parseAmountInput(amount, $denomination));
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

  onMount(async () => {
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      const [snapshot, registry] = await Promise.all([
        walletService.snapshot(),
        shellWallets.length && shellSelectedWalletId
          ? Promise.resolve({ wallets: shellWallets, selectedWalletId: shellSelectedWalletId })
          : walletService.profiles()
      ]);
      externalSigner =
        registry.wallets.find((profile) => profile.id === registry.selectedWalletId)?.kind ===
        'watch_only';
      try {
        externalWallet = await walletService.externalSignerWallet();
        externalSigner = true;
      } catch {
        /* selected wallet is not externally signed */
      }
      signerSummaryReady = true;
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
      const url = new URL(window.location.href);
      const requestedProposalId = url.searchParams.get('proposal');
      const acceleration = url.searchParams.get('accelerate');
      const accelerationTxid = url.searchParams.get('txid');
      if (accelerationTxid && (acceleration === 'rbf' || acceleration === 'cpfp')) {
        accelerationMethod = acceleration;
        accelerationRequest = { txid: accelerationTxid, method: acceleration };
        if (estimates) {
          proposal = await walletService.prepareAcceleration(
            accelerationTxid,
            acceleration,
            asFeeRate(Number(estimates.priority))
          );
          address = proposal.recipient;
          selectedLabels = proposal.labels ?? [proposal.label];
          label = '';
          amount = String(proposal.amount);
          speed = 'fast';
          if (externalSigner)
            externalProposal =
              (await walletService.externalSignerProposals()).find(
                (item) => item.proposalId === proposal?.proposalId
              ) ?? null;
          accelerationRequest = null;
          step = 2;
        }
      } else if (externalSigner) {
        const proposals = await walletService.externalSignerProposals();
        const activeProposal = requestedProposalId
          ? (proposals.find((item) => item.proposalId === requestedProposalId) ?? null)
          : latestActiveProposal(proposals);
        if (activeProposal) {
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
        const activeProposal = requestedProposalId
          ? (proposals.find((item) => item.proposalId === requestedProposalId) ?? null)
          : (proposals[0] ?? null);
        if (activeProposal) {
          proposal = activeProposal;
          address = activeProposal.recipient;
          selectedLabels = activeProposal.labels ?? [activeProposal.label];
          label = '';
          amount = String(activeProposal.amount);
          step = 2;
        }
      }
    } catch (cause) {
      signerSummaryReady = true;
      const description =
        cause instanceof WalletError && cause.code === 'insufficient_funds'
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
    }
  });

  onDestroy(() => {
    hardwareScanGeneration += 1;
    passphrase = '';
  });

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

  async function useMaxAmount() {
    if (!addressValid || selectedFeeRate <= 0) return;
    try {
      const maximum = await walletService.maxSpend(address, asFeeRate(selectedFeeRate), selection);
      amount = amountInputValue(maximum.amount, $denomination);
    } catch (cause) {
      toast({
        title: 'Maximum unavailable',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
  }

  async function prepareCustomAcceleration() {
    const request = accelerationRequest;
    if (!request || !customFeeValid) return;
    preparing = true;
    try {
      proposal = await walletService.prepareAcceleration(
        request.txid,
        request.method,
        asFeeRate(Number(customFee))
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
      feeEstimateError = localizedError(cause, $locale, 'Could not prepare fee acceleration.');
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
    selectedCoins = checked
      ? [...selectedCoins, outpoint]
      : selectedCoins.filter((item) => item !== outpoint);
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
  async function scanHardware() {
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
      devices = [];
      deviceError = localizedError(cause, $locale, 'Could not find hardware.');
    } finally {
      if (generation === hardwareScanGeneration) broadcasting = false;
    }
  }
  function closeHardwareScan() {
    if (broadcasting && hardwareAction !== 'scan') return;
    hardwareScanGeneration += 1;
    broadcasting = false;
    deviceOpen = false;
  }
  async function signHardware(device: HardwareDevice) {
    if (!proposal || !externalProposal) return;
    hardwareAction = 'sign';
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
      deviceError = localizedError(cause, $locale, 'Hardware signing failed.');
    } finally {
      broadcasting = false;
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
        psbtFilename(externalProposal.proposalId),
        externalProposal.psbt
      );
      if (saved.saved)
        toast({
          title: 'PSBT saved',
          description: 'The unsigned transaction was saved to the selected file.',
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
  function updateLabelDraft(value: string): string {
    armedLabelIndex = null;
    if (selectedLabels.length >= MAX_MANUAL_PERMANENT_LABELS) {
      label = '';
      return label;
    }
    const draft = tokenizeLabelDraft(selectedLabels, value);
    selectedLabels = draft.labels;
    label = draft.input;
    return label;
  }
  function handleLabelKeydown(event: KeyboardEvent) {
    if (event.key === 'Backspace' && !label) {
      event.preventDefault();
      const result = backspaceLabelDraft(selectedLabels, armedLabelIndex);
      selectedLabels = result.labels;
      armedLabelIndex = result.armedIndex;
      return;
    }
    if (event.key === 'Tab' && event.shiftKey) return;
    armedLabelIndex = null;
    if (!label.trim() || !['Enter', 'Tab', ',', ';'].includes(event.key)) return;
    event.preventDefault();
    const draft = tokenizeLabelDraft(selectedLabels, label, true);
    selectedLabels = draft.labels;
    label = draft.input;
  }
  function continueToAmount() {
    if (!intentValid) return;
    selectedLabels = submissionLabels;
    label = '';
    armedLabelIndex = null;
    draftStep = 2;
  }
</script>

{#snippet labelSuggestionPicker()}
  {#if !$discreetMode}<div class="label-suggestions">
      {#each visibleSuggestions as suggestion}<Tooltip
          text={suggestion.text}
          truncatedSelector="button"
          ><button
            type="button"
            aria-label={translate($locale, 'Reuse {label}', { label: suggestion.text })}
            onclick={() => {
              selectedLabels = addPermanentLabel(selectedLabels, suggestion.text);
              label = '';
              armedLabelIndex = null;
            }}>{suggestion.text}</button
          ></Tooltip
        >{/each}
    </div>{/if}
{/snippet}

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
                    ? 'Fee acceleration broadcast.'
                    : accelerationMethod === 'rbf'
                      ? 'Replacement broadcast.'
                      : 'Payment sent.'
        )}
      </p>
    </div>
  </header>
  {#if step < 4}<SendProgress current={progressStep} />{/if}
  {#if step < 4}<SignerSummary
      signers={signerItems}
      signedFingerprints={externalProposal?.signedFingerprints ?? []}
      collecting={externalSigner && Boolean(proposal)}
      loading={!signerSummaryReady}
      ondiscard={externalSigner
        ? () => {
            discardSignatureError = '';
            discardSignatureOpen = true;
          }
        : undefined}
    />{/if}

  {#if step === 1 && accelerationRequest}
    <form
      class="form-card send-stage-card"
      onsubmit={(event) => {
        event.preventDefault();
        prepareCustomAcceleration();
      }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'FEE ACCELERATION')}</span>
        <h2>{translate($locale, 'Enter a custom fee rate')}</h2>
        <p>
          {translate(
            $locale,
            'Bitcoin Core has no usable estimate. Groot will not invent one; choose the sat/vB rate you\n          want to review.'
          )}
        </p>
      </div>
      <label class="field"
        ><span>{translate($locale, 'Custom fee rate')}</span>
        <div class="amount-input">
          <input
            aria-label={translate($locale, 'Custom acceleration fee rate')}
            bind:value={customFee}
            inputmode="decimal"
            placeholder="0"
          /><b>{translate($locale, 'sat/vB')}</b>
        </div>
        <small>{translate($locale, 'Required · greater than 0 and at most 10,000 sat/vB')}</small
        ></label
      >
      {#if feeEstimateError}<p class="form-error" role="alert">{feeEstimateError}</p>{/if}
      <Button
        type="submit"
        disabled={!customFeeValid}
        loading={preparing}
        loadingLabel={translate($locale, 'Preparing acceleration…')}
        size="large"
        class="full">{translate($locale, 'Review acceleration')}<ArrowRight size={17} /></Button
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
      <div class="field">
        <label for="send-label-input">{translate($locale, 'Payment label')}</label>
        <div class="label-token-field" aria-label={translate($locale, 'Selected labels')}>
          {#each selectedLabels as selected, index}<span
              class="label-token"
              class:label-token-armed={index === armedLabelIndex}
              ><span class="label-token-text">{selected}</span><button
                type="button"
                aria-label={translate($locale, 'Remove {label}', { label: selected })}
                onclick={() => {
                  selectedLabels = selectedLabels.filter((item) => item !== selected);
                  armedLabelIndex = null;
                }}><X size={11} /></button
              ></span
            >{/each}<input
            id="send-label-input"
            aria-label={translate($locale, 'Payment label')}
            value={label}
            oninput={(event) =>
              (event.currentTarget.value = updateLabelDraft(event.currentTarget.value))}
            onkeydown={handleLabelKeydown}
            placeholder={selectedLabels.length
              ? ''
              : translate($locale, 'e.g. Hardware purchase, Pay Alex, Test transaction')}
            maxlength="48"
          />
        </div>
        <FieldCounter
          value={label}
          max={48}
          hint={translate($locale, 'Required · cannot be changed')}
        />
      </div>
      {@render labelSuggestionPicker()}
      <label class="field"
        ><span>{translate($locale, 'Bitcoin address')}</span><input
          aria-label={translate($locale, 'Bitcoin address')}
          bind:value={address}
          placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…"
        />{#if address && !addressValid}<em
            >{translate($locale, 'Enter a valid')}
            {networkName(defaultConfig.network)}
            {translate($locale, 'address')}</em
          >{/if}</label
      >
      <Button type="submit" disabled={!intentValid} size="large" class="full"
        >{translate($locale, 'Continue to amount')}<ArrowRight size={17} /></Button
      >
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
            inputmode={$denomination === 'btc' ? 'decimal' : 'numeric'}
            placeholder="0"
          /><b>{translate($locale, $denomination === 'btc' ? 'BTC' : 'sats')}</b><button
            type="button"
            onclick={useMaxAmount}>{translate($locale, 'Max')}</button
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
        onchange={(rate) => {
          const match = Object.entries(fees).find(([, value]) => value === rate);
          if (match) speed = match[0];
          else {
            speed = 'custom';
            customFee = rate ? String(rate) : '';
          }
        }}
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
          ><Amount value={proposal.amount} /></strong
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
        <div>
          <dt>{translate($locale, 'Label')}</dt>
          <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network')}</dt>
          <dd>{proposal.network}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network fee')}</dt>
          <dd><Amount value={proposal.fee} /></dd>
        </div>
        <div class="total">
          <dt>{translate($locale, 'Total')}</dt>
          <dd><Amount value={proposal.total} /></dd>
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
      <TransactionReviewDetails {proposal} onChangeAddress={() => (changeAddressOpen = true)} />
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
          <div>
            <dt>{translate($locale, 'Label')}</dt>
            <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Amount')}</dt>
            <dd><Amount value={proposal.amount} /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{proposal.network}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network fee')}</dt>
            <dd><Amount value={proposal.fee} /></dd>
          </div>
          <div class="total">
            <dt>{translate($locale, 'Total')}</dt>
            <dd><Amount value={proposal.total} /></dd>
          </div>
        </dl>
        <TransactionReviewDetails {proposal} onChangeAddress={() => (changeAddressOpen = true)} />
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
          <div>
            <dt>{translate($locale, 'Label')}</dt>
            <dd><PermanentLabelTags labels={proposal.labels ?? [proposal.label]} prominent /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Amount')}</dt>
            <dd><Amount value={proposal.amount} /></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{proposal.network}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network fee')}</dt>
            <dd><Amount value={proposal.fee} /></dd>
          </div>
          <div class="total">
            <dt>{translate($locale, 'Total')}</dt>
            <dd><Amount value={proposal.total} /></dd>
          </div>
        </dl>
        <TransactionReviewDetails {proposal} onChangeAddress={() => (changeAddressOpen = true)} />
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
            ? 'Fee acceleration broadcast'
            : accelerationMethod === 'rbf'
              ? 'Replacement broadcast'
              : 'Payment sent'
        )}
      </h2>
      <p>
        {#if accelerationMethod === 'cpfp'}{translate(
            $locale,
            'A fee-only child transaction with a'
          )}
          <Amount value={Number(proposal?.fee ?? 0)} />
          {translate(
            $locale,
            'network fee was broadcast.'
          )}{:else if accelerationMethod === 'rbf'}{translate($locale, 'The')}
          <Amount value={sentAmount} />
          {translate($locale, 'payment was rebroadcast with a higher fee.')}{:else}<Amount
            value={sentAmount}
          />
          {translate(
            $locale,
            'was broadcast\n          to the Bitcoin network.'
          )}{/if}{#if balanceSyncPending}
          {translate($locale, 'Balance refresh is pending; sync when the node is available.')}{/if}
      </p>
      <div class="txid-box">
        <span>{translate($locale, 'Transaction ID')}</span><code>{txid}</code>
      </div>
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
        }}>{translate($locale, 'Make another payment')}</Button
      ><a href="/activity">{translate($locale, 'View transaction')}</a>
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
  >{#if proposal}<section
      class="hardware-review"
      aria-label={translate($locale, 'Authoritative transaction details')}
    >
      <strong>{translate($locale, 'Transaction to verify')}</strong>
      <dl class="hardware-review-primary">
        <div>
          <dt>{translate($locale, 'Recipient')}</dt>
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
          <dd><Amount value={proposal.amount} /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network')}</dt>
          <dd>{proposal.network}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network fee')}</dt>
          <dd><Amount value={proposal.fee} /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Total')}</dt>
          <dd><Amount value={proposal.total} /></dd>
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
        changeAddressOverride={hardwareChangeAddress}
        onChangeAddress={() => (hardwareChangeAddressOpen = true)}
      />
    </section>{/if}{#if broadcasting}<HardwareActionPrompt
      title={translate(
        $locale,
        hardwareAction === 'sign' ? 'Check your hardware device' : 'Looking for hardware devices'
      )}
      detail={translate(
        $locale,
        hardwareAction === 'sign'
          ? 'Review the recipient, amount, fee, and change, then approve the transaction on the device.'
          : 'Keep the signer connected. Follow any unlock instructions shown by Groot or the device.'
      )}
      label={translate(
        $locale,
        hardwareAction === 'sign'
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
  open={qrScanOpen}
  title={translate($locale, 'Scan signed PSBT')}
  description={translate(
    $locale,
    'Groot accepts only crypto-psbt UR frames and verifies the exact proposal before importing.'
  )}
  onclose={() => (qrScanOpen = false)}><UrQrScanner onframe={receiveUrFrame} /></Modal
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
