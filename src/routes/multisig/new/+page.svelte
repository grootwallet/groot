<script lang="ts">
  import { ArrowLeft, Check, ChevronDown, ChevronRight, Clock3, Cpu, FileKey, Plus, ShieldCheck, Trash2, Users } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { toast } from '$lib/stores/toasts';
  import { walletService, type HardwareDevice, type MultisigPreview, type RecoveryTemplate } from '$lib/wallet';
  import { MULTISIG_ACCOUNT_PATH, validatePolicyDraft, type CosignerDraft, type CosignerSource } from '$lib/multisig/policy';

  let name = $state('');
  let threshold = $state(2);
  let cosigners = $state<CosignerDraft[]>([]);
  let stage = $state<'keys' | 'review'>('keys');
  let pickerOpen = $state(false);
  let keyOpen = $state(false);
  let hardwareOpen = $state(false);
  let hardware = $state<HardwareDevice[]>([]);
  let hardwareBusy = $state(false);
  let source = $state<CosignerSource>('manual');
  let label = $state('');
  let fingerprint = $state('');
  let xpub = $state('');
  let saved = $state(false);
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
  const policy = $derived({ name, threshold, cosigners });
  const standardCosignerCount = $derived(standardRecipe === '2of3' ? 3 : standardRecipe === '3of5' ? 5 : customCosignerCount);
  const requiredKeys = $derived(templateKind === 'standard' ? standardCosignerCount : 4);
  const errors = $derived([...validatePolicyDraft(policy), ...(cosigners.length !== requiredKeys ? [`${templateKind === 'standard' ? 'This wallet' : 'This template'} needs exactly ${requiredKeys} cosigners.`] : [])]);
  const visibleErrors = $derived.by(() => {
    if (cosigners.length === requiredKeys) return errors;
    const countErrors = new Set([
      'Add at least 3 cosigners.',
      'The threshold cannot exceed the number of cosigners.',
      `${templateKind === 'standard' ? 'This wallet' : 'This template'} needs exactly ${requiredKeys} cosigners.`
    ]);
    const remaining = requiredKeys - cosigners.length;
    const countGuidance = remaining > 0
      ? `Add ${remaining} more cosigner${remaining === 1 ? '' : 's'}.`
      : `Remove ${Math.abs(remaining)} cosigner${remaining === -1 ? '' : 's'}.`;
    return [...errors.filter((item) => !countErrors.has(item)), countGuidance];
  });
  const recoveryTemplate = $derived.by<RecoveryTemplate | null>(() => {
    if (templateKind === 'standard' || cosigners.length < 4) return null;
    return { type: 'recovery', immediate: { threshold: 2, signerIds: cosigners.slice(0, 3).map((key) => key.id) }, recovery: { threshold: 1, signerIds: [cosigners[3].id], availableAfterBlocks: templateKind === 'inheritance' ? 52_560 : 4_320 } };
  });

  onDestroy(() => { credential = ''; confirmation = ''; });

  function chooseSource(next: CosignerSource) {
    source = next;
    pickerOpen = false;
    keyOpen = true;
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
      error = `Remove ${cosigners.length - nextCount} cosigner${cosigners.length - nextCount === 1 ? '' : 's'} before choosing this setup.`;
      return;
    }
    standardRecipe = next;
    threshold = next === '3of5' ? 3 : Math.min(Math.max(2, threshold), nextCount);
    if (next === '2of3') threshold = 2;
    error = '';
  }

  function setCustomCosignerCount(next: number) {
    if (cosigners.length > next) {
      error = `Remove ${cosigners.length - next} cosigner${cosigners.length - next === 1 ? '' : 's'} before reducing the key count.`;
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

  async function scanHardware() {
    pickerOpen = false; hardwareOpen = true; hardwareBusy = true; error = '';
    try { hardware = await walletService.listHardwareDevices(); }
    catch (cause) { hardware = []; error = cause instanceof Error ? cause.message : 'Could not scan for devices.'; }
    finally { hardwareBusy = false; }
  }

  async function importHardware(device: HardwareDevice) {
    const deviceLabel = label.trim() || device.label;
    hardwareBusy = true; error = '';
    try { cosigners = [...cosigners, await walletService.importHardwareCosigner(device.id, deviceLabel)]; hardwareOpen = false; label = ''; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not read the public key.'; }
    finally { hardwareBusy = false; }
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

  async function create() {
    if (!preview || !saved || !credential || credential !== confirmation) return;
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
    <div><p class="eyebrow">DESCRIPTOR WALLET</p><h1>Create a multisig wallet</h1><p class="subtitle">Combine independent keys. Satchel coordinates; your devices sign.</p></div>
    <span class="network-chip">Regtest · Native SegWit</span>
  </header>
  <nav class="creation-progress" aria-label="Wallet creation progress"><span class:active={stage === 'keys'}><b>1</b>Design</span><i class:active={stage === 'review'}></i><span class:active={stage === 'review'}><b>2</b>Verify</span><i></i><span><b>3</b>Back up</span></nav>

  {#if stage === 'keys'}
    <div class="coordinator-grid">
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
            <label class="field"><span>Total cosigners (N)</span><select aria-label="Total cosigners" value={customCosignerCount} onchange={(event) => setCustomCosignerCount(Number(event.currentTarget.value))}>{#each Array(5) as _, i}<option value={i + 3}>{i + 3}</option>{/each}</select></label>
          </div><p class="policy-guidance">Satchel starts at 2 signatures. A 1-of-N wallet has no multisig theft protection; use a single-key wallet instead.</p>
          {:else}<div class="recipe-summary"><strong>{threshold} of {requiredKeys} signatures</strong><span>{standardRecipe === '2of3' ? 'Lose one key without losing access.' : 'Designed for a larger family or team.'}</span></div>{/if}
        {:else}<div class="path-visual"><span><b>NOW</b><strong>2 of 3 primary keys</strong></span><i></i><span><b>{templateKind === 'recovery' ? '~1 MONTH' : '~1 YEAR'}</b><strong>1 recovery key</strong></span></div>{/if}
        <div class="key-heading"><div><h2>Cosigners</h2><p>Use a different device or backup for every key.</p></div><Button variant="secondary" size="small" disabled={cosigners.length >= requiredKeys} onclick={() => pickerOpen = true}><Plus size={15}/>{cosigners.length >= requiredKeys ? 'All added' : 'Add a cosigner'}</Button></div>
        <div class="cosigner-list">
          {#each cosigners as signer, i}
            <article class="cosigner-card">
              <span class="device-number" aria-hidden="true">{i + 1}</span>
              <div class="cosigner-card-body">
                <strong class="cosigner-name">{signer.label}</strong>
                <dl class="cosigner-metadata">
                  <div><dt>Device fingerprint</dt><dd><code>{signer.fingerprint.toLowerCase()}</code></dd></div>
                  <div><dt>{sourceHeading(signer.source)}</dt><dd><span class="source-badge">{sourceLabel(signer.source)}</span></dd></div>
                  <div class="cosigner-public-key"><dt>Public account key</dt><dd><code>{signer.xpub}</code></dd></div>
                </dl>
              </div>
              <button class="remove-cosigner" aria-label="Remove {signer.label}" title="Remove cosigner" onclick={() => cosigners = cosigners.filter((item) => item.id !== signer.id)}><Trash2 size={16}/></button>
            </article>
          {:else}
            <div class="keys-empty"><FileKey size={22}/><strong>No cosigners yet</strong><span>Add {requiredKeys} independent keys for this template.</span></div>
          {/each}
        </div>
        {#if cosigners.length > 0}<p class="cosigner-progress" aria-live="polite">{cosigners.length} of {requiredKeys} cosigners added</p>{/if}
        {#if reviewAttempted && visibleErrors.length}<div class="policy-errors" aria-live="polite">{#each visibleErrors as item}<p>{item}</p>{/each}</div>{/if}
        {#if error}<p class="form-error">{error}</p>{/if}
        <div class="coordinator-actions"><Button variant="secondary" href="/settings"><ArrowLeft size={16}/>Cancel</Button><Button disabled={busy} onclick={review}>{busy ? 'Building…' : 'Review wallet'}<ChevronRight size={16}/></Button></div>
      </section>
      <aside class="safety-panel"><ShieldCheck size={22}/><h2>Before you continue</h2><p>Satchel stores public descriptors only. It cannot spend without enough signatures.</p><ul><li>Back up the wallet descriptor.</li><li>Verify each fingerprint on its device.</li><li>Keep devices in separate places.</li></ul><code>{MULTISIG_ACCOUNT_PATH}</code></aside>
    </div>
  {:else if preview}
    <section class="form-card review-policy">
      <button class="back-link" onclick={() => stage = 'keys'}><ArrowLeft size={16}/>Edit keys</button>
      <span class="setup-step">FINAL REVIEW</span><h2>{preview.name}</h2><p class="review-intro">Confirm the policy and save the descriptor before creating this wallet.</p>
      <div class="policy-summary"><strong>{threshold} of {cosigners.length} signatures</strong><span>wsh · sortedmulti · BIP48</span></div>
      <button class="descriptor-toggle" onclick={() => showDescriptor = !showDescriptor}>Descriptor logic <ChevronDown size={14} class={showDescriptor?'rotated':''}/></button>
      {#if showDescriptor}<div class="descriptor-block" data-testid="descriptor-preview"><span>Receive descriptor</span><code>{preview.externalDescriptor}</code>{#if recoveryTemplate?.type === 'recovery'}<span>Spend paths</span><code>2 of first 3 now · 1 recovery key after {recoveryTemplate.recovery.availableAfterBlocks.toLocaleString()} blocks</code>{/if}</div>{/if}
      <div class="review-signers">{#each preview.cosigners as signer}<div><Check size={14}/><span><strong>{signer.label}</strong><small>{signer.fingerprint}</small></span></div>{/each}</div>
      <label class="check-row"><input type="checkbox" bind:checked={saved}/><span><strong>I saved the wallet descriptor</strong><small>This public backup is required to recover addresses and coordinate signatures.</small></span></label>
      <div class="credential-grid"><PasswordField label="App PIN" inputLabel="App PIN" bind:value={credential} placeholder="Unlock this coordinator" autocomplete="new-password"/><PasswordField label="Confirm app PIN" inputLabel="Confirm app PIN" bind:value={confirmation} placeholder="Enter it again" autocomplete="new-password"/></div>
      <p class="credential-note">This PIN protects local coordinator data. Hardware devices keep their own signing credentials.</p>
      {#if credential && confirmation && credential !== confirmation}<p class="form-error">PINs do not match.</p>{/if}
      {#if error}<p class="form-error">{error}</p>{/if}
      <Button class="full" size="large" disabled={!saved || !credential || credential !== confirmation || busy} onclick={create}>{busy ? 'Creating…' : 'Create wallet'}</Button>
    </section>
  {/if}
</div>

<Modal open={pickerOpen} title="Add a cosigner" description="Choose how to import this device’s public account key." onclose={() => pickerOpen = false}>
  <div class="source-list">
    <button onclick={scanHardware}><Cpu size={18}/><span><strong>Connect hardware device</strong><small>Desktop · Bitcoin Core HWI</small></span><ChevronRight size={15}/></button>
    <button onclick={() => chooseSource('manual')}><FileKey size={18}/><span><strong>Enter public key</strong><small>Paste an account xpub and fingerprint</small></span><ChevronRight size={15}/></button>
  </div>
</Modal>

<Modal open={hardwareOpen} title="Connect hardware device" description="Unlock the device and keep it ready over USB, then verify the fingerprint on-device." onclose={() => hardwareOpen = false}>
  <label class="field"><span>Cosigner label</span><input bind:value={label} placeholder="Defaults to device model" maxlength="48"/></label>
  {#if hardwareBusy}<div class="device-scan"><Cpu size={20}/><span>Looking for devices…</span></div>
  {:else if hardware.length === 0}<div class="device-scan"><Cpu size={20}/><strong>No device found</strong><span>Install Bitcoin Core HWI, connect one device, and try again. QR and manual import work on every platform.</span><Button variant="secondary" size="small" onclick={scanHardware}>Scan again</Button></div>
  {:else}<div class="source-list">{#each hardware as device}<button onclick={() => importHardware(device)}><Cpu size={18}/><span><strong>{device.label}</strong><small>{device.fingerprint} · {device.model}</small></span><ChevronRight size={15}/></button>{/each}</div>{/if}
  {#if error}<p class="form-error">{error}</p>{/if}
</Modal>

<Modal open={keyOpen} title="Enter public cosigner key" description="No private key or seed should ever be entered here." onclose={() => keyOpen = false}>
  <form onsubmit={(event) => { event.preventDefault(); addKey(); }}>
    <label class="field"><span>Cosigner label</span><input aria-label="Cosigner label" bind:value={label} placeholder="e.g. Coldcard" maxlength="48"/></label>
    <label class="field"><span>Master fingerprint</span><input aria-label="Master fingerprint" bind:value={fingerprint} placeholder="8 hex characters" maxlength="8"/></label>
    <label class="field"><span>Account xpub</span><textarea aria-label="Account xpub" bind:value={xpub} rows="3" placeholder="tpub…"></textarea><small>Derivation: {MULTISIG_ACCOUNT_PATH}</small></label>
    <div class="modal-footer"><Button variant="secondary" onclick={() => keyOpen = false}>Cancel</Button><Button type="submit" disabled={!label.trim() || !/^[0-9a-fA-F]{8}$/.test(fingerprint.trim()) || !xpub.trim()}>Add key</Button></div>
  </form>
</Modal>
