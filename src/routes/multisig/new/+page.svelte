<script lang="ts">
  import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Cpu, Download, FileKey, FileUp, Plus, RefreshCw, ShieldCheck, Trash2, Usb, Users } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, type CosignerHealthCheck, type HardwareDevice, type MultisigPreview, type RecoveryTemplate, type WalletErrorCode } from '$lib/wallet';
  import { MULTISIG_ACCOUNT_PATH, validatePolicyDraft, type CosignerDraft, type CosignerSource } from '$lib/multisig/policy';
  import { copyText } from '$lib/clipboard';
  import { coldcardPolicyFilename, downloadText, readTransferFile, safeTransferFilename } from '$lib/transfer';
  import { parsePublicCosignerFile } from '$lib/multisig/cosigner-import';
  import { mergeHardwareDiscovery } from '$lib/hardware/discovery';

  type HardwareGuideId = 'coldcard' | 'bitbox02' | 'ledger' | 'trezor' | 'jade';
  const hardwareGuides: Array<{ id: HardwareGuideId; name: string; steps: string[] }> = [
    { id: 'coldcard', name: 'Coldcard', steps: ['Finish device setup and make an offline seed backup.', 'Sign in and enable USB communication if it was disabled.', 'Leave the device unlocked and ready at its main menu.'] },
    { id: 'bitbox02', name: 'BitBox02', steps: ['In BitBoxApp, enter the device password and confirm the same pairing code on both screens.', 'Wait until the wallet is visible, then quit BitBoxApp completely.', 'Reconnect and unlock BitBox02, then scan again in Groot.'] },
    { id: 'ledger', name: 'Ledger', steps: ['Finish device setup and make an offline recovery backup, then quit Ledger Live completely.', 'For Regtest, unlock the device and open Bitcoin Test—not the main Bitcoin app.', 'Start the import in Groot, then approve the public-key export shown on Ledger.'] },
    { id: 'trezor', name: 'Trezor', steps: ['Finish device setup and make an offline seed backup, then quit Trezor Suite completely. Closing its window is not enough.', 'Reconnect the device. A locked Model One is expected: select its Groot card to open the position keypad while the device shows a scrambled PIN matrix.', 'Choose the standard no-passphrase wallet explicitly, or select a hidden wallet on-device when supported. Model One host passphrase entry is not yet supported.'] },
    { id: 'jade', name: 'Jade', steps: ['Finish device setup and make an offline seed backup.', 'Log in on Jade with Recovery Phrase Login or QR PIN Unlock.', 'Keep Jade connected over USB while Groot imports the public key.'] }
  ];

  let name = $state('');
  let threshold = $state(2);
  let cosigners = $state<CosignerDraft[]>([]);
  let stage = $state<'policy' | 'keys' | 'review' | 'backup'>('policy');
  let pickerOpen = $state(false);
  let pickerError = $state('');
  let keyOpen = $state(false);
  let hardwareOpen = $state(false);
  let hardware = $state<HardwareDevice[]>([]);
  let hardwareBusy = $state(false);
  let hardwareProgress = $state('Looking for devices…');
  let standardWalletOpen = $state(false);
  let standardWalletDevice = $state<HardwareDevice | null>(null);
  let pinOpen = $state(false);
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
  let checkingSigner = $state(false);
  let healthChecks = $state<Record<string, CosignerHealthCheck>>({});
  let source = $state<CosignerSource>('manual');
  let label = $state('');
  let fingerprint = $state('');
  let xpub = $state('');
  let saved = $state(false);
  let coldcardRegistered = $state(false);
  let credential = $state('');
  let confirmation = $state('');
  let preview = $state<MultisigPreview | null>(null);
  let busy = $state(false);
  let error = $state('');
  let templateKind = $state<'standard' | 'recovery' | 'inheritance'>('standard');
  let standardRecipe = $state<'2of3' | '3of5' | 'custom'>('2of3');
  let customCosignerCount = $state(3);
  let showDescriptor = $state(false);
  let reviewAttempted = $state(false);
  let hardwareScanGeneration = 0;
  const policy = $derived({ name, threshold, cosigners });
  const standardCosignerCount = $derived(standardRecipe === '2of3' ? 3 : standardRecipe === '3of5' ? 5 : customCosignerCount);
  const requiredKeys = $derived(templateKind === 'standard' ? standardCosignerCount : 4);
  const errors = $derived([...validatePolicyDraft(policy), ...(cosigners.length !== requiredKeys ? [`${templateKind === 'standard' ? 'This wallet' : 'This template'} needs exactly ${requiredKeys} cosigners.`] : [])]);
  const visibleErrors = $derived.by(() => {
    if (cosigners.length === requiredKeys) return errors.map(signerLanguage);
    const countErrors = new Set([
      'Add at least 3 cosigners.',
      'The threshold cannot exceed the number of cosigners.',
      `${templateKind === 'standard' ? 'This wallet' : 'This template'} needs exactly ${requiredKeys} cosigners.`
    ]);
    const remaining = requiredKeys - cosigners.length;
    const countGuidance = remaining > 0
      ? `Add ${remaining} more cosigner${remaining === 1 ? '' : 's'}.`
      : `Remove ${Math.abs(remaining)} cosigner${remaining === -1 ? '' : 's'}.`;
    return [...errors.filter((item) => !countErrors.has(item)), countGuidance].map(signerLanguage);
  });
  const recoveryTemplate = $derived.by<RecoveryTemplate | null>(() => {
    if (templateKind === 'standard' || cosigners.length < 4) return null;
    return { type: 'recovery', immediate: { threshold: 2, signerIds: cosigners.slice(0, 3).map((key) => key.id) }, recovery: { threshold: 1, signerIds: [cosigners[3].id], availableAfterBlocks: templateKind === 'inheritance' ? 52_560 : 4_320 } };
  });
  const selectedHardwareGuide = $derived(hardwareGuides.find((guide) => guide.id === hardwareGuide) ?? hardwareGuides[0]);
  const coldcardRegistrationRequired = $derived(cosigners.some((signer) => signer.deviceType?.toLowerCase() === 'coldcard'));

  onDestroy(() => { credential = ''; confirmation = ''; pinPositions = ''; pinChallenge = ''; hardwareScanGeneration += 1; });

  function signerLanguage(value: string) {
    return value.replaceAll('cosigners', 'signers').replaceAll('cosigner', 'signer');
  }

  function chooseSource(next: CosignerSource) {
    source = next;
    pickerOpen = false;
    keyOpen = true;
  }

  async function importCosignerFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    pickerError = '';
    try {
      const fallbackLabel = file.name.replace(/\.[^.]+$/, '').slice(0, 48);
      const imported = parsePublicCosignerFile(await readTransferFile(file), fallbackLabel);
      cosigners = [...cosigners, { id: crypto.randomUUID(), ...imported, source: 'file' }];
      pickerOpen = false;
      toast({ title: 'Public signer imported', description: `${imported.label} was loaded from a local file.`, tone: 'success' });
    } catch (cause) {
      pickerError = cause instanceof Error ? cause.message : 'Could not read the public-key file.';
    }
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
    return value === 'usb' ? 'USB' : value === 'virtual' ? 'USB demo' : value === 'qr' ? 'QR code' : value === 'file' ? 'File' : 'Manual entry';
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
    cosigners = [...cosigners, {
      id: crypto.randomUUID(), label, fingerprint, xpub,
      derivationPath: MULTISIG_ACCOUNT_PATH, source
    }];
    label = ''; fingerprint = ''; xpub = ''; keyOpen = false;
  }

  function removeCosigner(id: string) {
    cosigners = cosigners.filter((item) => item.id !== id);
    if (selectedSigner?.id === id) selectedSigner = null;
    const { [id]: _removed, ...remainingChecks } = healthChecks;
    healthChecks = remainingChecks;
  }

  async function copyPublicKey() {
    if (!selectedSigner) return;
    await copyText(selectedSigner.xpub, 'public-wallet-data');
    toast({ title: 'Public key copied', description: `${selectedSigner.label} account key copied.`, tone: 'success' });
  }

  async function runDraftHealthCheck() {
    if (!selectedSigner || checkingSigner) return;
    const signer = selectedSigner;
    checkingSigner = true;
    try {
      healthChecks[signer.id] = await walletService.checkHardwareCosigner(signer);
      toast({ title: 'Health check passed', description: `${signer.label} is ready.`, tone: 'success' });
    } catch (cause) {
      const summary = cause instanceof Error ? cause.message : 'The device could not be verified.';
      healthChecks[signer.id] = { checkedAt: new Date().toISOString(), summary, status: 'attention' };
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checkingSigner = false;
    }
  }

  async function scanHardware() {
    const generation = ++hardwareScanGeneration;
    pickerOpen = false; hardwareOpen = true; hardware = []; hardwareBusy = true; hardwareProgress = 'Looking for devices…'; error = '';
    try {
      const first = await walletService.listHardwareDevices();
      if (generation !== hardwareScanGeneration || !hardwareOpen) return;
      hardware = first;
      hardwareProgress = 'Checking for another connected signer…';
      await new Promise((resolve) => setTimeout(resolve, 550));
      if (generation !== hardwareScanGeneration || !hardwareOpen) return;
      hardware = mergeHardwareDiscovery(first, await walletService.listHardwareDevices());
    }
    catch (cause) {
      if (generation !== hardwareScanGeneration) return;
      if (hardware.length === 0) error = cause instanceof Error ? cause.message : 'Could not scan for devices.';
    }
    finally { if (generation === hardwareScanGeneration) hardwareBusy = false; }
  }

  function closeHardwareScan() {
    hardwareScanGeneration += 1;
    hardwareOpen = false;
    hardwareBusy = false;
  }

  async function copyDescriptor(value: string, branch: 'receive' | 'change') {
    await copyText(value, 'public-wallet-data');
    toast({ title: `${branch === 'receive' ? 'Receive' : 'Change'} descriptor copied`, description: 'Public watch-only descriptor copied.', tone: 'success' });
  }

  function saveDescriptorDraft() {
    if (!preview) return;
    downloadText(`${safeTransferFilename(preview.name)}-descriptors.txt`, `Wallet: ${preview.name}\nReceive descriptor:\n${preview.externalDescriptor}\n\nChange descriptor:\n${preview.internalDescriptor}\n`);
  }

  function saveColdcardPolicy() {
    if (!preview) return;
    downloadText(
      coldcardPolicyFilename(preview.name),
      `# Groot multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${preview.externalDescriptor}\n`
    );
    toast({ title: 'Coldcard policy saved', description: 'Import it on every Coldcard signer, then verify the policy on-device.', tone: 'success' });
  }

  async function importHardware(device: HardwareDevice, allowEmptyPassphrase = false) {
    const deviceLabel = label.trim() || device.label;
    hardwareBusy = true;
    hardwareProgress = device.model.startsWith('ledger')
      ? 'Reading the multisig account key from Ledger…'
      : device.model === 'bitbox02'
        ? 'Reading the public key from BitBox02…'
        : `Reading the public key from ${device.label}…`;
    error = '';
    try { cosigners = [...cosigners, await walletService.importHardwareCosigner(device.id, deviceLabel, allowEmptyPassphrase)]; hardwareOpen = false; standardWalletOpen = false; standardWalletDevice = null; label = ''; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not read the public key.'; }
    finally { hardwareBusy = false; }
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

  async function startHardwarePin(device: HardwareDevice) {
    const retrying = pinOpen;
    hardwareBusy = true; pinBusy = retrying; error = ''; pinError = ''; pinErrorCode = ''; pinPositions = '';
    try {
      pinChallenge = await walletService.promptHardwarePin(device.id);
      pinDevice = device;
      hardwareOpen = false;
      pinOpen = true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not start the PIN matrix.';
      if (retrying) {
        pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
        pinError = message;
      } else error = message;
    } finally { hardwareBusy = false; pinBusy = false; }
  }

  async function submitHardwarePin() {
    if (!pinChallenge || !pinPositions || pinBusy) return;
    pinBusy = true; pinError = ''; pinErrorCode = '';
    let positions = pinPositions;
    pinPositions = '';
    try {
      await walletService.sendHardwarePin(pinChallenge, positions);
      pinChallenge = ''; pinOpen = false; pinDevice = null;
      toast({ title: 'Hardware wallet unlocked', description: 'Scanning again for its public fingerprint.', tone: 'success' });
      await scanHardware();
    } catch (cause) {
      pinChallenge = '';
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      pinError = cause instanceof Error ? cause.message : 'Trezor did not accept that matrix entry.';
    } finally { positions = ''; pinBusy = false; }
  }

  async function review() {
    reviewAttempted = true;
    error = '';
    if (errors.length > 0) return;
    busy = true;
    try {
      if (recoveryTemplate) {
        const analysis = await walletService.analyzeRecoveryPolicy(recoveryTemplate, cosigners);
        preview = { name: name.trim(), threshold: 2, cosigners, externalDescriptor: analysis.externalDescriptor, internalDescriptor: analysis.internalDescriptor };
      } else preview = await walletService.previewMultisig(policy);
      stage = 'review'; showDescriptor = false;
    }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not build the descriptor.'; }
    finally { busy = false; }
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
    if (!preview || !saved || (coldcardRegistrationRequired && !coldcardRegistered) || !credential || credential !== confirmation) return;
    busy = true; error = '';
    try {
      if (recoveryTemplate) await walletService.createRecoveryMultisig(name, recoveryTemplate, cosigners, credential);
      else await walletService.createMultisig(policy, credential);
      toast({ title: 'Multisig wallet created', description: `${threshold} signatures are required to spend.`, tone: 'success' });
      await goto('/multisig');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not create the wallet.'; }
    finally { credential = ''; confirmation = ''; busy = false; }
  }
</script>

<div class="page coordinator-page">
  <header class="page-header">
    <div><p class="eyebrow">WALLET POLICY</p><h1>Create a policy wallet</h1><p class="subtitle">Choose a simple shared policy or add a separate delayed recovery key.</p></div>
    <div class="page-header-actions"><a class="secondary-link" href="/multisig/recover" aria-label="Recover from backup"><FileUp size={15}/>Recover</a><span class="network-chip">Regtest · Native SegWit</span></div>
  </header>
  <nav class="creation-progress four-step-progress" aria-label="Wallet creation progress"><span class:active={stage === 'policy'}><b>1</b>Policy</span><i class:active={stage !== 'policy'}></i><span class:active={stage === 'keys'}><b>2</b>Signers</span><i class:active={stage === 'review' || stage === 'backup'}></i><span class:active={stage === 'review'}><b>3</b>Verify</span><i class:active={stage === 'backup'}></i><span class:active={stage === 'backup'}><b>4</b>Back up</span></nav>

  {#if stage === 'policy'}
    <div class="coordinator-grid policy-only-grid">
      <section class="form-card coordinator-main">
        <div class="template-grid" aria-label="Wallet templates">
          <button class:active={templateKind === 'standard'} onclick={() => chooseTemplate('standard')}><Users size={18}/><strong>Standard</strong><small>Flexible M of N · no timer</small></button>
          <button class:active={templateKind === 'recovery'} onclick={() => chooseTemplate('recovery')}><ShieldCheck size={18}/><strong>Recovery path</strong><small>2 of 3 · backup after ~1 month</small></button>
          <button class:active={templateKind === 'inheritance'} onclick={() => chooseTemplate('inheritance')}><Clock3 size={18}/><strong>Inheritance</strong><small>2 of 3 · heir after ~1 year</small></button>
        </div>
        <div class="template-tradeoff"><strong>{templateKind === 'standard' ? 'Simplest and most interoperable' : templateKind === 'recovery' ? 'Survives loss of two primary keys' : 'A delayed key can recover without the primary set'}</strong><span>{templateKind === 'standard' ? 'Any two devices can always spend.' : 'The fourth key stays powerless until its delay matures.'}</span></div>
        <div class="section-heading compact"><div><h2>Wallet policy</h2><p>Public keys only. Signing stays on each device.</p></div><span class="policy-pill">{templateKind === 'standard' ? `${threshold} of ${requiredKeys}` : '2 of 3 + recovery'}</span></div>
        <label class="field"><span>Wallet name</span><input bind:value={name} maxlength="48" placeholder="e.g. Family vault" /></label>
        {#if templateKind === 'standard'}
          <div class="policy-recipes" aria-label="Standard multisig recipes">
            <button class:active={standardRecipe === '2of3'} onclick={() => applyStandardRecipe('2of3')}><strong>2 of 3</strong><small>Recommended</small></button>
            <button class:active={standardRecipe === '3of5'} onclick={() => applyStandardRecipe('3of5')}><strong>3 of 5</strong><small>Larger group</small></button>
            <button class:active={standardRecipe === 'custom'} onclick={() => applyStandardRecipe('custom')}><strong>Custom</strong><small>Advanced</small></button>
          </div>
          {#if standardRecipe === 'custom'}<div class="threshold-row custom-threshold">
            <label class="field"><span>Signatures required (M)</span><select aria-label="Signatures required" value={threshold} onchange={(event) => threshold = Number(event.currentTarget.value)}>{#each Array(customCosignerCount - 1) as _, i}<option value={i + 2}>{i + 2}</option>{/each}</select></label>
            <label class="field"><span>Total signers (N)</span><select aria-label="Total signers" value={customCosignerCount} onchange={(event) => setCustomCosignerCount(Number(event.currentTarget.value))}>{#each Array(5) as _, i}<option value={i + 3}>{i + 3}</option>{/each}</select></label>
          </div><p class="policy-guidance">Groot starts at 2 signatures. A 1-of-N wallet has no multisig theft protection; use a single-key wallet instead.</p>
          {:else}<div class="recipe-summary"><strong>{threshold} of {requiredKeys} signatures</strong><span>{standardRecipe === '2of3' ? 'Lose one key without losing access.' : 'Designed for a larger family or team.'}</span></div>{/if}
        {:else}<div class="path-visual"><span><b>NOW</b><strong>2 of 3 primary keys</strong></span><i></i><span><b>{templateKind === 'recovery' ? '~1 MONTH' : '~1 YEAR'}</b><strong>1 recovery key</strong></span></div><div class="recovery-separation"><ShieldCheck size={15}/><span><strong>Four independent keys required</strong><small>Key 4 is recovery-only. It is excluded from the immediate 2-of-3 branch and cannot be reused as a primary signer.</small></span></div>{/if}
        {#if error}<p class="form-error">{error}</p>{/if}
        <div class="coordinator-actions"><Button variant="secondary" href="/settings"><ArrowLeft size={16}/>Cancel</Button><Button onclick={continueToCosigners}>Continue to signers<ChevronRight size={16}/></Button></div>
      </section>
    </div>
  {:else if stage === 'keys'}
    <div class="coordinator-grid">
      <section class="form-card coordinator-main">
        <div class="section-heading compact cosigner-step-heading"><div><span class="setup-step">SIGNERS</span><h2>Add {requiredKeys} independent keys</h2><p>{name.trim()} · {templateKind === 'standard' ? `${threshold} of ${requiredKeys}` : '2 of 3 + recovery'}</p></div><Button variant="secondary" size="small" disabled={cosigners.length >= requiredKeys} onclick={() => pickerOpen = true}><Plus size={15}/>{cosigners.length >= requiredKeys ? 'All added' : 'Add a signer'}</Button></div>
        <div class="cosigner-list">
          {#each cosigners as signer, i}
            <article class="cosigner-card">
              <button class="draft-cosigner-trigger" aria-label="View {signer.label} details" onclick={() => selectedSigner = signer}>
                <span class="device-number" aria-hidden="true">{i + 1}</span>
                <span class="cosigner-card-body">
                  <strong class="cosigner-name">{signer.label}</strong>
                  <span class="cosigner-metadata">
                    {#if templateKind !== 'standard'}<span><small>Policy role</small><span class="source-badge">{i === 3 ? 'Recovery-only signer' : 'Primary signer'}</span></span>{/if}
                    <span><small>Device fingerprint</small><code>{signer.fingerprint.toLowerCase()}</code></span>
                    <span><small>{sourceHeading(signer.source)}</small><span class="source-badge">{sourceLabel(signer.source)}</span></span>
                    <span class="cosigner-public-key"><small>Public account key</small><code>{signer.xpub}</code></span>
                  </span>
                </span>
                <ChevronRight class="draft-row-chevron" size={16}/>
              </button>
              <button class="remove-cosigner" aria-label="Remove {signer.label}" title="Remove signer" onclick={() => removeCosigner(signer.id)}><Trash2 size={16}/></button>
            </article>
          {:else}
            <div class="keys-empty"><FileKey size={22}/><strong>No signers yet</strong><span>Add {requiredKeys} independent keys for this template.</span></div>
          {/each}
        </div>
        {#if cosigners.length > 0}<p class="cosigner-progress" aria-live="polite">{cosigners.length} of {requiredKeys} signers added</p>{/if}
        {#if reviewAttempted && visibleErrors.length}<div class="policy-errors" aria-live="polite">{#each visibleErrors as item}<p>{item}</p>{/each}</div>{/if}
        {#if error}<p class="form-error">{error}</p>{/if}
        <div class="coordinator-actions"><Button variant="secondary" onclick={() => {error='';stage='policy';}}><ArrowLeft size={16}/>Back to policy</Button><Button loading={busy} loadingLabel="Building policy…" onclick={review}>Review wallet<ChevronRight size={16}/></Button></div>
      </section>
      <aside class="safety-panel"><ShieldCheck size={22}/><h2>Before you continue</h2><p>Groot stores public descriptors only. It cannot spend without enough signatures.</p><ul><li>Back up the wallet descriptor.</li><li>Verify each fingerprint on its device.</li><li>Keep devices in separate places.</li></ul><button class="hardware-help-card" onclick={() => openHardwareHelp()}><CircleHelp size={17}/><span><strong>Hardware setup help</strong><small>Coldcard, BitBox02, Ledger, Trezor, Jade</small></span><ChevronRight size={14}/></button><code>{MULTISIG_ACCOUNT_PATH}</code></aside>
    </div>
  {:else if stage === 'review' && preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => stage = 'keys'}><ArrowLeft size={16}/>Edit keys</button>
      <span class="setup-step">FINAL REVIEW</span><h2>{preview.name}</h2><p class="review-intro">Confirm the policy and save the descriptor before creating this wallet.</p>
      <div class="policy-summary"><strong>{threshold} of {cosigners.length} signatures</strong><span>wsh · sortedmulti · BIP48</span></div>
      <button class="descriptor-toggle" onclick={() => showDescriptor = !showDescriptor}>Descriptor logic <ChevronDown size={14} class={showDescriptor?'rotated':''}/></button>
      {#if showDescriptor}<div class="descriptor-block" data-testid="descriptor-preview"><span class="descriptor-label"><span>Receive descriptor</span><button aria-label="Copy receive descriptor" onclick={() => copyDescriptor(preview!.externalDescriptor, 'receive')}><Copy size={14}/></button></span><code>{preview.externalDescriptor}</code><span class="descriptor-label"><span>Change descriptor</span><button aria-label="Copy change descriptor" onclick={() => copyDescriptor(preview!.internalDescriptor, 'change')}><Copy size={14}/></button></span><code>{preview.internalDescriptor}</code>{#if recoveryTemplate?.type === 'recovery'}<span>Spend paths</span><code>2 of first 3 now · 1 recovery key after {recoveryTemplate.recovery.availableAfterBlocks.toLocaleString()} blocks</code>{/if}<button class="descriptor-download" onclick={saveDescriptorDraft}><Download size={14}/>Save public descriptor text</button></div>{/if}
      <div class="review-signers">{#each preview.cosigners as signer}<div><Check size={14}/><span><strong>{signer.label}</strong><small>{signer.fingerprint}</small></span></div>{/each}</div>
      <div class="coordinator-actions"><Button variant="secondary" onclick={() => stage = 'keys'}><ArrowLeft size={16}/>Back to signers</Button><Button onclick={() => stage = 'backup'}>Continue to backup<ChevronRight size={16}/></Button></div>
    </section>
  {:else if stage === 'backup' && preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => stage = 'review'}><ArrowLeft size={16}/>Back to verification</button>
      <span class="setup-step">BACK UP</span><h2>Protect {preview.name}</h2><p class="review-intro">Save the public descriptor, then protect this coordinator with a local app PIN.</p>
      <div class="policy-summary"><strong>{threshold} of {cosigners.length} signatures</strong><span>wsh · sortedmulti · BIP48</span></div>
      <Button variant="secondary" class="full" onclick={saveDescriptorDraft}><Download size={14}/>Save public descriptor text</Button>
      <label class="check-row"><input type="checkbox" bind:checked={saved}/><span><strong>I saved the wallet descriptor</strong><small>This public backup is required to recover addresses and coordinate signatures.</small></span></label>
      {#if coldcardRegistrationRequired}<div class="hardware-policy-registration"><ShieldCheck size={18}/><div><strong>Register this wallet on Coldcard</strong><p>Coldcard must know the complete multisig policy before it can verify recipients and change. Save this BIP-380 descriptor, then import it from <b>Settings → Multisig Wallets → Import</b> on every Coldcard signer.</p><Button variant="secondary" size="small" onclick={saveColdcardPolicy}><Download size={14}/>Save Coldcard policy</Button></div></div><label class="check-row"><input type="checkbox" bind:checked={coldcardRegistered}/><span><strong>I imported and verified the policy on every Coldcard</strong><small>The name, signing threshold, and signer fingerprints matched on-device.</small></span></label>{/if}
      <div class="credential-grid"><PasswordField label="App PIN" inputLabel="App PIN" bind:value={credential} placeholder="Unlock this coordinator" autocomplete="new-password"/><PasswordField label="Confirm app PIN" inputLabel="Confirm app PIN" bind:value={confirmation} placeholder="Enter it again" autocomplete="new-password"/></div>
      <p class="credential-note">This PIN protects local coordinator data. Hardware devices keep their own signing credentials.</p>
      {#if credential && confirmation && credential !== confirmation}<p class="form-error">PINs do not match.</p>{/if}
      {#if error}<p class="form-error">{error}</p>{/if}
      <Button class="full" size="large" disabled={!saved || (coldcardRegistrationRequired && !coldcardRegistered) || !credential || credential !== confirmation} loading={busy} loadingLabel="Creating wallet…" onclick={create}>Create wallet</Button>
    </section>
  {/if}
</div>

<Modal open={pickerOpen} title="Add a signer" description="Choose how to import this signer’s public account key." onclose={() => { pickerOpen = false; pickerError = ''; }}>
  <div class="source-list">
    <button onclick={scanHardware}><Cpu size={18}/><span><strong>Connect hardware device</strong><small>Desktop · Bitcoin Core HWI</small></span><ChevronRight size={15}/></button>
    <label class="source-button"><FileUp size={18}/><span><strong>Import public-key file</strong><small>Mounted SD card or local JSON · 256 KiB maximum</small></span><ChevronRight size={15}/><input aria-label="Public signer file" type="file" accept=".json,application/json" onchange={importCosignerFile}/></label>
    <button onclick={() => chooseSource('manual')}><FileKey size={18}/><span><strong>Enter public key</strong><small>Paste an account xpub and fingerprint</small></span><ChevronRight size={15}/></button>
  </div>
  {#if pickerError}<p class="form-error" aria-live="polite">{pickerError}</p>{/if}
</Modal>

<Modal open={hardwareOpen} title="Connect hardware device" description="Connect one initialized device over USB, then verify its fingerprint before adding it." onclose={closeHardwareScan}>
  <div class="hardware-readiness"><Usb size={18}/><span><strong>Unlock the signer, then release its USB connection</strong><small>BitBox02: open the wallet in BitBoxApp first, then quit BitBoxApp completely before scanning. Quit Trezor Suite, Ledger Live, and other companion apps too. A locked Trezor Model One is supported from its Groot card.</small></span><button onclick={() => openHardwareHelp(true)}>Device help</button></div>
  <label class="field"><span>Signer label</span><input bind:value={label} placeholder="Defaults to device model" maxlength="48"/></label>
  {#if hardwareBusy}<HardwareActionPrompt title={hardwareProgress} detail={hardwareProgress.includes('Ledger') ? 'Keep Bitcoin Test open for Regtest and confirm the export on the device screen.' : 'Keep the signer connected and unlocked. Follow any instructions shown on the device.'} label="Hardware signer setup in progress"/>
  {:else if hardware.length === 0}<div class="device-scan"><Cpu size={20}/><strong>{error ? 'Device needs attention' : 'No device found'}</strong><span>{error || 'HWI returned no device. For Coldcard, sign in first, enable its USB port, reconnect, then scan again. Other signers must be initialized, unlocked, and released by companion apps.'}</span><Button variant="secondary" size="small" onclick={scanHardware}>Scan again</Button></div>
  {:else}<div class="source-list hardware-device-list">{#each hardware as device}<button disabled={device.action === 'none'} onclick={() => handleHardware(device)}><Cpu size={18}/><span><strong>{device.label}</strong><small>{device.fingerprint ? `Fingerprint ${device.fingerprint} · ${device.message}` : device.message}</small><em class:ready={device.status === 'ready'}>{device.status === 'ready' ? 'Ready' : device.status === 'detected' ? 'Detected' : device.status === 'needs_pin' ? 'Unlock' : device.action === 'confirm_empty_passphrase' ? 'Choose wallet' : device.action === 'retry' ? 'Scan again' : 'Unavailable'}</em></span>{#if device.action !== 'none'}<ChevronRight size={15}/>{/if}</button>{/each}<button class="hardware-rescan" onclick={scanHardware}><RefreshCw size={16}/><span><strong>Scan again</strong><small>Refresh the list after unlocking or connecting another signer.</small></span><ChevronRight size={15}/></button></div>{/if}
  {#if error && hardware.length > 0}<div class="hardware-inline-error" role="alert"><AlertTriangle size={18}/><span><strong>Could not read the account key</strong><small>{error}</small></span><Button variant="secondary" size="small" onclick={scanHardware}>Try again</Button></div>{/if}
</Modal>

<Modal open={standardWalletOpen} title="Use Trezor standard wallet?" description="Passphrase protection can expose several independent wallets from the same device." onclose={() => { standardWalletOpen = false; standardWalletDevice = null; hardwareOpen = true; }}>
  <div class="credential-warning"><ShieldCheck size={17}/><p><strong>No hardware passphrase for this signer</strong><span>This imports the key derived from the device seed alone. It does not disable, change, or reveal any hidden passphrase wallet you may use elsewhere.</span></p></div>
  <p class="policy-guidance">Choose this only if you intentionally want the Trezor <strong>standard wallet</strong> in this multisig policy. Enabling or choosing a passphrase later opens a different hidden wallet; it does not change this signer. The imported fingerprint is permanently bound to this policy.</p>
  {#if hardwareBusy}<HardwareActionPrompt title="Importing the Trezor standard wallet" detail="Keep Trezor connected while Groot reads its public BIP48 account key." label="Hardware signer import in progress"/>{:else}<div class="modal-footer"><Button variant="secondary" onclick={() => { standardWalletOpen = false; standardWalletDevice = null; hardwareOpen = true; }}>Back</Button><Button disabled={!standardWalletDevice} onclick={() => { if (standardWalletDevice) importHardware(standardWalletDevice, true); }}>Use standard wallet</Button></div>{/if}
</Modal>

<TrezorPinModal
  open={pinOpen}
  busy={pinBusy}
  challengeReady={Boolean(pinChallenge)}
  positions={pinPositions}
  device={pinDevice}
  errorCode={pinErrorCode}
  error={pinError}
  onappend={(position) => pinPositions += position}
  ondelete={() => pinPositions = pinPositions.slice(0, -1)}
  onclear={() => pinPositions = ''}
  onsubmit={submitHardwarePin}
  onretry={() => { if (pinDevice) startHardwarePin(pinDevice); }}
  onclose={() => { pinOpen = false; pinPositions = ''; pinChallenge = ''; pinDevice = null; pinError = ''; pinErrorCode = ''; }}
/>

<Modal open={hardwareHelpOpen} title="Prepare your hardware signer" description="Groot imports one public account key. Your seed and private keys never leave the device." onclose={closeHardwareHelp}>
  <div class="hardware-guide">
    <div class="hardware-guide-tabs" aria-label="Hardware signer model">{#each hardwareGuides as guide}<button class:active={hardwareGuide === guide.id} onclick={() => hardwareGuide = guide.id}>{guide.name}</button>{/each}</div>
    <div class="hardware-guide-body"><span class="device-number"><Usb size={15}/></span><div><strong>{selectedHardwareGuide.name}</strong><ol>{#each selectedHardwareGuide.steps as step}<li>{step}</li>{/each}</ol></div></div>
    <p><strong>Never enter a seed into Groot.</strong> If a device asks you to restore or initialize it during this flow, cancel and complete that process using the device vendor’s trusted instructions first.</p>
    <Button class="full" onclick={() => { hardwareHelpOpen = false; hardwareHelpReturnsToScan = false; scanHardware(); }}>Scan for devices</Button>
  </div>
</Modal>

<Modal open={keyOpen} title="Enter public signer key" description="No private key or seed should ever be entered here." onclose={() => keyOpen = false}>
  <form onsubmit={(event) => { event.preventDefault(); addKey(); }}>
    <label class="field"><span>Signer label</span><input aria-label="Signer label" bind:value={label} placeholder="e.g. Coldcard" maxlength="48"/></label>
    <label class="field"><span>Master fingerprint</span><input aria-label="Master fingerprint" bind:value={fingerprint} placeholder="8 hex characters" maxlength="8"/></label>
    <label class="field"><span>Account xpub</span><textarea aria-label="Account xpub" bind:value={xpub} rows="3" placeholder="tpub…"></textarea><small>Derivation: {MULTISIG_ACCOUNT_PATH}</small></label>
    <div class="modal-footer"><Button variant="secondary" onclick={() => keyOpen = false}>Cancel</Button><Button type="submit" disabled={!label.trim() || !/^[0-9a-fA-F]{8}$/.test(fingerprint.trim()) || !xpub.trim()}>Add key</Button></div>
  </form>
</Modal>

<DeviceDetailsModal signer={selectedSigner} health={selectedSigner ? healthChecks[selectedSigner.id] ?? null : null} checking={checkingSigner} onclose={() => selectedSigner = null} oncheck={runDraftHealthCheck} oncopy={copyPublicKey}/>
