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
    FileUp,
    LockKeyhole,
    QrCode,
    RefreshCw,
    ScanLine,
    X
  } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import TransactionReviewDetails from '$lib/components/TransactionReviewDetails.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
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
    type HardwareDevice,
    type MultisigProposal,
    type MultisigWallet,
    type PolicyVerificationAddress,
    type SignerPolicyVerification,
    type WalletErrorCode
  } from '$lib/wallet';
  import type { Utxo } from '$lib/types';
  import { defaultConfig, networkName } from '$lib/config';
  import { addressPrefixForNetwork, hasAddressPrefixForNetwork } from '$lib/wallet/policy';
  import { compactAddress } from '$lib/address-display';
  import { accelerationUnavailableTitle } from '$lib/wallet/acceleration-presentation';
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
    denomination,
    formatAmount,
    parseAmountInput
  } from '$lib/denomination';
  let wallet = $state<MultisigWallet | null>(null),
    proposal = $state<MultisigProposal | null>(null),
    estimates = $state<FeeEstimates | null>(null);
  let address = $state(''),
    label = $state(''),
    amount = $state(''),
    selectedRate = $state(0),
    pin = $state(''),
    imported = $state(''),
    txid = $state(''),
    error = $state(''),
    importError = $state(''),
    feeEstimateError = $state(''),
    deviceError = $state(''),
    cancelError = $state('');
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
    cancelOpen = $state(false),
    exitOpen = $state(false),
    devices = $state<HardwareDevice[]>([]),
    activeHardwareDevice = $state<HardwareDevice | null>(null),
    urFrames = $state<string[]>([]),
    scannedFrames = $state<string[]>([]);
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
  let accelerationRequest = $state<{ txid: string; method: 'rbf' | 'cpfp' } | null>(null);
  let hardwareAction = $state<'scan' | 'sign'>('scan');
  let hardwareScanGeneration = 0;
  let coins = $state<Utxo[]>([]),
    selectedCoins = $state<string[]>([]),
    showCoins = $state(false),
    available = $state(0);
  let automaticStrategy = $state<AutomaticSelectionStrategy>('balanced');
  let selectionPreview = $state<CoinSelectionPreview | null>(null),
    selectionPreviewRevision = 0;
  let draftStep = $state<1 | 2>(1);
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
  const proposalHasPrivacyWarning = $derived(
    Boolean(
      proposal &&
      (proposal.selectionImpact.newClusterLinks > 0 ||
        proposal.selectionImpact.hasUnknownProvenance ||
        proposal.selectionImpact.hasAddressReuse)
    )
  );
  const showColdcardPolicyHelp = $derived(
    shouldShowColdcardPolicyHelp(wallet?.cosigners ?? [], devices, policyVerifications)
  );
  const selectedRateNumber = $derived(Number(selectedRate)),
    customFeeValid = $derived(
      Number.isFinite(selectedRateNumber) && selectedRateNumber > 0 && selectedRateNumber <= 10_000
    );
  const amountSats = $derived(parseAmountInput(amount, $denomination)),
    estimatedFee = $derived(Math.ceil(selectedRateNumber * 220)),
    addressValid = $derived(hasAddressPrefixForNetwork(address, defaultConfig.network)),
    valid = $derived(
      addressValid &&
        label.trim().length > 0 &&
        label.trim().length <= 48 &&
        Number.isSafeInteger(amountSats) &&
        amountSats > 0 &&
        amountSats + estimatedFee <= available &&
        customFeeValid
    );
  const intentValid = $derived(
    addressValid && label.trim().length > 0 && label.trim().length <= 48
  );
  const progressStep = $derived<1 | 2 | 3>(proposal ? 3 : draftStep);
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
  const signerItems = $derived(
    (wallet?.cosigners ?? []).map((signer) => ({
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
  onDestroy(() => {
    hardwareScanGeneration += 1;
    pin = '';
    imported = '';
    pinPositions = '';
    pinChallenge = '';
  });
  onMount(async () => {
    try {
      const [snapshot, loadedWallet, proposals, verifications, verificationAddress] =
        await Promise.all([
          walletService.multisigSnapshot(),
          walletService.multisigWallet(),
          walletService.multisigProposals(),
          walletService.multisigSignerPolicyVerifications(),
          walletService.multisigPolicyVerificationAddress()
        ]);
      wallet = loadedWallet;
      policyVerifications = verifications;
      policyAddress = verificationAddress;
      coins = snapshot.utxos;
      const url = new URL(window.location.href),
        requested = url.searchParams.get('coins')?.split(',').filter(Boolean) ?? [],
        method = url.searchParams.get('accelerate'),
        txid = url.searchParams.get('txid');
      selectedCoins = requested.filter((outpoint) =>
        coins.some((coin) => coin.outpoint === outpoint && !coin.frozen)
      );
      updateAvailable();
      try {
        estimates = await walletService.estimateFees();
        selectedRate = Number(estimates.standard);
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
        if (estimates) {
          proposal = await walletService.prepareMultisigAcceleration(
            txid,
            method,
            feeRate(Number(estimates.priority))
          );
          accelerationRequest = null;
        }
      } else proposal = proposals[0] ?? null;
    } catch (cause) {
      if (accelerationRequest) {
        feeEstimateError = localizedError(cause, $locale, 'Could not prepare fee acceleration.');
        toast({
          title: accelerationUnavailableTitle(accelerationRequest.method),
          description: feeEstimateError,
          tone: 'danger'
        });
      } else error = localizedError(cause, $locale, 'Could not load wallet.');
    }
  });
  function submitIntentOnEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (intentValid) {
      error = '';
      draftStep = 2;
    }
  }
  async function prepare() {
    if (!valid) return;
    busy = true;
    error = '';
    try {
      proposal = await walletService.prepareMultisigPayment(
        address,
        label,
        sats(amountSats),
        feeRate(selectedRateNumber),
        selection
      );
    } catch (cause) {
      error =
        cause instanceof WalletError && cause.code === 'insufficient_funds'
          ? `The amount plus network fee exceeds the ${selectedCoins.length ? 'selected coin balance' : 'available balance'}.`
          : localizedError(cause, $locale, 'Could not prepare payment.');
    } finally {
      busy = false;
    }
  }
  async function useMaxAmount() {
    if (!addressValid || selectedRateNumber <= 0) return;
    error = '';
    try {
      const maximum = await walletService.maxMultisigSpend(
        address,
        feeRate(selectedRateNumber),
        selection
      );
      amount = amountInputValue(maximum.amount, $denomination);
    } catch (cause) {
      error = localizedError(cause, $locale, 'Maximum amount could not be calculated.');
    }
  }
  async function prepareCustomAcceleration() {
    const request = accelerationRequest;
    if (!request || !customFeeValid) return;
    busy = true;
    feeEstimateError = '';
    try {
      proposal = await walletService.prepareMultisigAcceleration(
        request.txid,
        request.method,
        feeRate(selectedRateNumber)
      );
      accelerationRequest = null;
    } catch (cause) {
      feeEstimateError = localizedError(cause, $locale, 'Could not prepare fee acceleration.');
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
    selectedCoins = checked
      ? [...selectedCoins, outpoint]
      : selectedCoins.filter((item) => item !== outpoint);
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
    return (
      wallet?.cosigners.find(
        (signer) =>
          device.fingerprint &&
          signer.fingerprint.toLowerCase() === device.fingerprint.toLowerCase()
      ) ?? null
    );
  }
  function devicePolicyVerification(device: HardwareDevice) {
    const signer = savedSignerForDevice(device);
    return signer ? matchingPolicyVerification(signer, policyVerifications) : null;
  }
  async function scan() {
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
      devices = [];
      deviceError = localizedError(cause, $locale, 'Could not find hardware.');
    } finally {
      if (generation === hardwareScanGeneration) busy = false;
    }
  }
  function closeHardwareScan() {
    if (busy && hardwareAction !== 'scan') return;
    hardwareScanGeneration += 1;
    busy = false;
    deviceOpen = false;
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
    const profile = policyRegistrationProfile(device);
    if (!profile.supported && profile.registration === 'unsupported') {
      deviceError = `${profile.name} is not supported by Groot's pinned HWI release and is not physically certified.`;
      return;
    }
    const verification = signer ? matchingPolicyVerification(signer, policyVerifications) : null;
    if (signer && profile.registration === 'file_once' && !verification) {
      coldcardSetupDevice = device;
      coldcardSetupError = '';
      deviceOpen = false;
      coldcardSetupOpen = true;
      return;
    }
    if (
      signer &&
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
        title: 'Hardware wallet unlocked',
        description: 'Scanning again so you can select this signer.',
        tone: 'success'
      });
      await scan();
    } catch (cause) {
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
    const reviewingPolicy = policyReviewOpen && policyReviewDevice?.id === device.id;
    activeHardwareDevice = device;
    hardwareAction = 'sign';
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
      closeHardwareReviewOverlays();
      policyReviewOpen = false;
      deviceOpen = true;
      deviceError = localizedError(cause, $locale, 'Device signing failed.');
    } finally {
      busy = false;
      policyReviewBusy = false;
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
      const signed = proposal.canFinalize;
      const saved = await walletService.savePsbt(psbtFilename(proposal.proposalId), proposal.psbt);
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

<div class="page narrow-page send-page" class:signing-page={Boolean(proposal)}>
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'SEND')}</p>
      <h1>{translate($locale, 'Send bitcoin')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          !proposal && draftStep === 1
            ? 'Name the payment and choose its recipient.'
            : !proposal
              ? 'Choose the amount, coins, and network fee.'
              : `Review once, then collect ${wallet?.threshold ?? 'the required'} signatures.`
        )}
      </p>
    </div>
    {#if proposal}<Button
        variant="secondary"
        ariaLabel="Back to overview"
        onclick={() => (exitOpen = true)}>{translate($locale, 'Back')}</Button
      >{:else}<Button variant="secondary" ariaLabel="Back to overview" href="/"
        >{translate($locale, 'Back')}</Button
      >{/if}
  </header>
  {#if !txid}<SendProgress current={progressStep} />{#if wallet && !proposal}<SignerSummary
        signers={signerItems}
        required={wallet.threshold}
        signedFingerprints={[]}
        collecting={false}
      />{/if}{/if}
  {#if txid}<section class="empty-state success-state">
      <span class="empty-icon success"><Check size={25} /></span>
      <h2>{translate($locale, 'Transaction broadcast')}</h2>
      <p>
        {translate($locale, 'The signed transaction was accepted by the')}
        {networkName(defaultConfig.network)}
        {translate($locale, 'network.')}
      </p>
      <div class="txid-box">
        <span>{translate($locale, 'Transaction ID')}</span><code>{txid}</code>
      </div>
      <Button href="/multisig">{translate($locale, 'Return to wallet')}</Button>
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
        <h2>{translate($locale, 'Enter a custom fee rate')}</h2>
        <p>
          {translate(
            $locale,
            'Bitcoin Core has no usable estimate. Groot will not invent one; choose the sat/vB rate\n          every signer will review.'
          )}
        </p>
      </div>
      <label class="field"
        ><span>{translate($locale, 'Custom fee rate')}</span>
        <div class="amount-input">
          <input
            aria-label={translate($locale, 'Custom acceleration fee rate')}
            bind:value={selectedRate}
            inputmode="decimal"
            placeholder="0"
          /><b>{translate($locale, 'sat/vB')}</b>
        </div>
        <small>{translate($locale, 'Required · greater than 0 and at most 10,000 sat/vB')}</small
        ></label
      >{#if feeEstimateError}<p class="form-error" role="alert">{feeEstimateError}</p>{/if}<Button
        type="submit"
        size="large"
        class="full"
        disabled={!customFeeValid}
        loading={busy}
        loadingLabel={translate($locale, 'Preparing acceleration…')}
        >{translate($locale, 'Review acceleration')}</Button
      >
    </form>
  {:else if !proposal && draftStep === 1}
    <form
      class="form-card send-stage-card"
      onsubmit={(e) => {
        e.preventDefault();
        if (intentValid) {
          error = '';
          draftStep = 2;
        }
      }}
      in:fly={{ x: 8, duration: 180 }}
    >
      <div class="send-stage-heading">
        <span>{translate($locale, 'STEP 1')}</span>
        <h2>{translate($locale, 'What is this payment for?')}</h2>
        <p>
          {translate($locale, 'This permanent label helps every signer recognize the transaction.')}
        </p>
      </div>
      <label class="field"
        ><span>{translate($locale, 'Payment label')}</span><input
          aria-label={translate($locale, 'Payment label')}
          bind:value={label}
          oninput={clearDraftError}
          onkeydown={submitIntentOnEnter}
          placeholder={translate($locale, 'e.g. Hardware purchase, Pay Alex, Test transaction')}
          maxlength="48"
        /><FieldCounter
          value={label}
          max={48}
          hint={translate($locale, 'Required · cannot be changed')}
        /></label
      >
      <label class="field"
        ><span>{translate($locale, 'Bitcoin address')}</span><input
          aria-label={translate($locale, 'Bitcoin address')}
          bind:value={address}
          oninput={clearDraftError}
          onkeydown={submitIntentOnEnter}
          placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…"
        />{#if address && !addressValid}<em
            >{translate($locale, 'Enter a valid')}
            {networkName(defaultConfig.network)}
            {translate($locale, 'address')}</em
          >{/if}</label
      >
      <Button type="submit" size="large" class="full" disabled={!intentValid}
        >{translate($locale, 'Continue to amount')}</Button
      >
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
            oninput={clearDraftError}
            inputmode={$denomination === 'btc' ? 'decimal' : 'numeric'}
            placeholder="0"
          /><b>{translate($locale, $denomination === 'btc' ? 'BTC' : 'sats')}</b><button
            type="button"
            onclick={useMaxAmount}>{translate($locale, 'Max')}</button
          >
        </div>
        <small
          >{translate($locale, 'Available:')}
          <Amount value={available} hidden={$discreetMode} /></small
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
                    ><strong
                      >{translate($locale, $discreetMode ? 'Label hidden' : coin.label)}</strong
                    >{#if coin.provenance.state !== 'unknown'}<PermanentLabelTags
                        labels={coin.provenance.labels.filter(
                          (item) =>
                            item.text.trim().toLocaleLowerCase() !==
                            coin.label.trim().toLocaleLowerCase()
                        )}
                        hidden={$discreetMode}
                      />{/if}</span
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
          <span>{translate($locale, 'You send')}</span><strong
            ><Amount value={Number(proposal.amount)} /></strong
          >
        </div>
        <dl class="details-list proposal-review-primary">
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
            <dd>{proposal.label}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{proposal.network}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Network fee')}</dt>
            <dd><Amount value={Number(proposal.fee)} /></dd>
          </div>
          <div class="total">
            <dt>{translate($locale, 'Total')}</dt>
            <dd><Amount value={Number(proposal.total)} /></dd>
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
                'than the valid\n              More private candidate. Lower fee is not better privacy.'
              )}</span
            >
          </div>{/if}
        <TransactionReviewDetails
          {proposal}
          policy={`${wallet?.threshold} of ${wallet?.cosigners.length}`}
          onChangeAddress={() => (changeAddressOpen = true)}
        />
        {#if !proposal.canFinalize}<div class="psbt-actions">
            <Button variant="secondary" onclick={scan}
              ><Cpu size={16} />{translate($locale, 'Sign with device')}</Button
            ><Button variant="secondary" onclick={showPsbtQr}
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
            required={wallet.threshold}
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
>
  {#if proposal}
    <section
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
          <dd>{proposal.label}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Amount')}</dt>
          <dd><Amount value={Number(proposal.amount)} /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network')}</dt>
          <dd>{proposal.network}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Network fee')}</dt>
          <dd><Amount value={Number(proposal.fee)} /></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Total')}</dt>
          <dd><Amount value={Number(proposal.total)} /></dd>
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
        policy={`${wallet?.threshold} of ${wallet?.cosigners.length}`}
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
        hardwareAction === 'sign' ? 'Check your hardware device' : 'Looking for hardware devices'
      )}
      detail={translate(
        $locale,
        hardwareAction === 'sign'
          ? 'Review the recipient, amount, fee, change, and wallet policy, then approve on the device.'
          : 'Keep each signer connected and unlocked. Follow any instructions shown on the device.'
      )}
      label={translate(
        $locale,
        hardwareAction === 'sign'
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
  onclose={() => {
    if (!policyReviewBusy) {
      policyReviewOpen = false;
      policyReviewDevice = null;
      policyReviewError = '';
      deviceOpen = true;
    }
  }}
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
  open={qrScanOpen}
  title={translate($locale, 'Scan signed PSBT')}
  description={translate(
    $locale,
    'Groot accepts only crypto-psbt UR frames and verifies the exact proposal before merging.'
  )}
  onclose={() => (qrScanOpen = false)}><UrQrScanner onframe={receiveUrFrame} /></Modal
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
        <dd>{proposal.label}</dd>
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
        <dd>{proposal.label}</dd>
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
