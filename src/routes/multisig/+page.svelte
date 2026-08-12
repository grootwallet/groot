<script lang="ts">
  import { ChevronRight, Cpu, Eye, FileKey, FlaskConical, Plus, ShieldCheck, Usb } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import SignerPolicyReview from '$lib/components/SignerPolicyReview.svelte';
  import ColdcardPolicySetup from '$lib/components/ColdcardPolicySetup.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import MultisigDescriptorsModal from '$lib/components/MultisigDescriptorsModal.svelte';
  import { isPrototypeWallet, walletService, type CosignerHealthCheck, type HardwareDevice, type MultisigWallet, type PolicyVerificationAddress, type SignerPolicyVerification, type WalletSnapshot } from '$lib/wallet';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import { defaultConfig, networkName } from '$lib/config';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { coldcardPolicyFilename } from '$lib/transfer';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { matchingPolicyVerification, policyReadinessLabel, policyRegistrationProfile, requiresPolicySetup } from '$lib/hardware/policy-readiness';
  const walletShell = useWalletShellContext();
  type CosignerHealthLog = CosignerHealthCheck & { signerId: string };
  let wallet = $state<MultisigWallet | null>(null);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selectedSigner = $state<CosignerDraft | null>(null);
  let showDescriptors = $state(false);
  let moreOpen = $state(false);
  let moreRoot = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let checking = $state(false);
  let healthHistory = $state<Record<string, CosignerHealthLog[]>>({});
  let policyVerifications = $state<SignerPolicyVerification[]>([]);
  let policyAddress = $state<PolicyVerificationAddress | null>(null);
  let policySigner = $state<CosignerDraft | null>(null);
  let policyDevice = $state<HardwareDevice | null>(null);
  let policyBusy = $state(false);
  let policyError = $state('');
  onMount(async () => {
    wallet = await walletService.multisigWallet();
    if (!wallet) return;
    try { [policyVerifications, policyAddress] = await Promise.all([walletService.multisigSignerPolicyVerifications(), walletService.multisigPolicyVerificationAddress()]); }
    catch (cause) { toast({title:'Policy status unavailable',description:cause instanceof Error?cause.message:undefined,tone:'danger'}); }
    try { snapshot = await walletService.syncMultisig(); }
    catch (cause) { toast({title:'Wallet is offline',description:cause instanceof Error?cause.message:undefined,tone:'danger'}); }
  });
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated' && event.walletKind === 'multisig' && event.walletId === walletShell.selectedWalletId()) snapshot = event.snapshot;
  }));
  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (moreOpen && moreRoot && event.target instanceof Node && !moreRoot.contains(event.target)) moreOpen = false;
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
  function sourceName(source: CosignerSource) {
    return ({ usb: 'USB hardware', qr: 'QR import', file: 'File import', manual: 'Manual backup', virtual: 'Virtual test device' })[source];
  }
  function openSigner(signer: CosignerDraft) {
    selectedSigner = signer;
  }
  function signerPolicyStatus(signer: CosignerDraft) {
    const profile = policyRegistrationProfile(signer);
    const verification = matchingPolicyVerification(signer, policyVerifications);
    const label = policyReadinessLabel(signer, verification);
    if (!profile.supported) return { label, description: profile.creationCopy, attention: true };
    if (profile.registration === 'none') return { label, description: profile.creationCopy, attention: false };
    if (verification) {
      const description = profile.registration === 'file_once'
        ? 'Policy import is recorded in Groot. Coldcard keeps this wallet policy on-device.'
        : profile.registration === 'interactive_per_signing'
          ? 'Policy and first address were verified. Ledger will authorize the policy again when signing.'
          : 'Policy and first address were verified for this wallet.';
      return { label, description, attention: false, verifiedAt: verification.verifiedAt, actionLabel: profile.registration === 'file_once' ? 'Review setup' : 'Verify again' };
    }
    return {
      label,
      description: profile.registration === 'file_once'
        ? 'Groot has no saved acknowledgement yet. Record the existing Coldcard policy import or review the setup steps.'
        : profile.creationCopy,
      attention: true,
      actionLabel: profile.registration === 'file_once' ? 'Review setup' : 'Verify policy'
    };
  }
  function latestHealth(signer: CosignerDraft) { return healthHistory[signer.id]?.[0] ?? null; }
  function recordHealth(signerId: string, check: CosignerHealthCheck) {
    healthHistory = {
      ...healthHistory,
      [signerId]: [{ ...check, signerId }, ...(healthHistory[signerId] ?? [])].slice(0, 20)
    };
  }
  async function runHealthCheck() {
    if (!selectedSigner || checking) return;
    const signer = selectedSigner;
    checking = true;
    try {
      recordHealth(signer.id, await walletService.checkHardwareCosigner(signer));
      toast({ title: 'Health check passed', description: `${signer.label} is ready.`, tone: 'success' });
    } catch (cause) {
      const summary = cause instanceof Error ? cause.message : 'The device could not be verified.';
      recordHealth(signer.id, { checkedAt: new Date().toISOString(), summary, status: 'attention' });
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checking = false;
    }
  }
  async function openPolicyVerification(signer: CosignerDraft) {
    policySigner = signer; selectedSigner = null; policyDevice = null; policyError = ''; policyBusy = true;
    if (policyRegistrationProfile(signer).registration === 'file_once') { policyBusy = false; return; }
    try {
      const devices = await walletService.listHardwareDevices();
      policyDevice = devices.find((device) => device.fingerprint?.toLowerCase() === signer.fingerprint.toLowerCase()) ?? null;
      if (!policyDevice) policyError = `Connect and unlock ${signer.label}, then try again.`;
    } catch (cause) { policyError = cause instanceof Error ? cause.message : 'Could not scan hardware devices.'; }
    finally { policyBusy = false; }
  }
  async function verifySignerPolicy() {
    if (!policySigner || !policyDevice || policyBusy) return;
    policyBusy = true; policyError = '';
    try {
      const verification = await walletService.verifyMultisigSignerPolicy(policyDevice.id, policySigner.fingerprint);
      policyVerifications = [verification, ...policyVerifications.filter((item) => item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase())];
      toast({ title: 'Wallet policy verified', description: `${policySigner.label} returned the correct first address.`, tone: 'success' });
    } catch (cause) { policyError = cause instanceof Error ? cause.message : 'The wallet policy could not be verified.'; }
    finally { policyBusy = false; }
  }
  async function saveColdcardPolicy() {
    if (!wallet || policyBusy) return;
    policyBusy = true; policyError = '';
    try {
      const saved = await walletService.savePublicBackup(coldcardPolicyFilename(wallet.name), `# Groot multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${wallet.externalDescriptor}\n`);
      if (saved.saved) toast({title:'Coldcard policy saved',description:'Import it on the Coldcard and verify the policy details.',tone:'success',action:saved.revealToken&&saved.revealLabel?{label:saved.revealLabel,run:()=>walletService.revealSavedFile(saved.revealToken!)}:undefined});
    } catch (cause) { policyError = cause instanceof Error ? cause.message : 'Could not save the Coldcard policy.'; }
    finally { policyBusy = false; }
  }
  async function confirmColdcardPolicy() {
    if (!policySigner || policyBusy) return;
    policyBusy = true; policyError = '';
    try {
      const verification = await walletService.acknowledgeColdcardPolicy(policySigner.fingerprint);
      policyVerifications = [verification, ...policyVerifications.filter((item)=>item.signerFingerprint.toLowerCase()!==verification.signerFingerprint.toLowerCase())];
      toast({title:'Coldcard policy recorded',description:'This signer is ready for transaction review.',tone:'success'});
      policySigner = null;
    } catch (cause) { policyError = cause instanceof Error ? cause.message : 'Could not record the Coldcard policy check.'; }
    finally { policyBusy = false; }
  }
</script>

<div class="page coordinator-page">
  {#if wallet}
    <header class="page-header"><div><p class="eyebrow">WALLET POLICY</p><h1>{wallet.name}</h1><p class="subtitle">A watch-only wallet whose spending policy is enforced by independent keys.</p></div><span class="policy-pill">{wallet.threshold} of {wallet.cosigners.length}</span></header>
    <section class="vault-hero"><span><ShieldCheck size={22}/></span><div class="vault-summary"><small>{shortSats(snapshot?.balance.total ?? 0)} sats · Spending policy</small><strong>{wallet.threshold} of {wallet.cosigners.length}</strong><p>Native SegWit · sortedmulti · {networkName(snapshot?.network ?? defaultConfig.network)}</p>{#if isPrototypeWallet}<p class="prototype-hint">Ready-to-test demo wallet <span>·</span> PIN <code>prototype-passphrase</code></p>{/if}</div><div class="vault-actions"><div class="wallet-more" bind:this={moreRoot}><OverflowMenuButton bind:element={moreTrigger} label="More wallet actions" expanded={moreOpen} onclick={() => moreOpen=!moreOpen}/>{#if moreOpen}<div class="wallet-more-menu" role="menu"><button role="menuitem" onclick={() => { moreOpen=false; showDescriptors=true; }}><Eye size={15}/><span><strong>Show descriptors</strong><small>Inspect receive and change logic</small></span></button><a role="menuitem" href="/multisig/backup"><FileKey size={15}/><span><strong>Export & verify</strong><small>Save a public wallet backup</small></span></a><a role="menuitem" href="/multisig/policy"><FlaskConical size={15}/><span><strong>Recovery policy lab</strong><small>Explore guided Miniscript paths</small></span></a></div>{/if}</div><Button variant="secondary" href="/multisig/receive">Receive</Button><Button href="/multisig/send">Send</Button></div></section>
    <div class="vault-grid">
      <section class="vault-cosigners"><div class="section-heading compact"><div><h2>Signing keys</h2><p>Sign with any {wallet.threshold} keys. Open a signer to inspect its identity, health, and wallet-policy status.</p></div></div><div class="saved-cosigner-list">{#each wallet.cosigners as signer, i}{@const verification=matchingPolicyVerification(signer,policyVerifications)}<article><button aria-label="View {signer.label} details" onclick={() => openSigner(signer)}><span class="device-number">{i + 1}</span><span class="saved-cosigner-copy"><strong>{signer.label}</strong><span><code>{signer.fingerprint.toLowerCase()}</code><i></i>{sourceName(signer.source)}{#if latestHealth(signer)}<i></i>Checked <LocalTimestamp value={latestHealth(signer)!.checkedAt}/>{:else if verification}<i></i>Policy verified <LocalTimestamp value={verification.verifiedAt}/>{/if}</span></span><span class="ready-badge" class:attention={(requiresPolicySetup(signer)&&!verification)||!policyRegistrationProfile(signer).supported||latestHealth(signer)?.status === 'attention'}>{policyReadinessLabel(signer,verification)}</span><ChevronRight class="row-chevron" size={16}/></button></article>{/each}</div></section>
      <aside class="vault-backup-card"><span class="vault-backup-icon"><FileKey size={20}/></span><div><h2>Backups & recovery</h2><p>Save the public policy, then verify it rebuilds the same first address.</p></div><Button variant="secondary" class="full" href="/multisig/backup">Export & verify</Button><Button variant="ghost" class="full" href="/multisig/policy">Recovery policy lab</Button></aside>
    </div>
  {:else}
    <section class="empty-state vault-empty"><span class="empty-icon"><Usb size={24}/></span><h2>Single-key policy</h2><p>This wallet is controlled by one signing key. Add another wallet to use a shared or recovery policy.</p><Button href="/welcome?add=1"><Plus size={16}/>Add another wallet</Button></section>
  {/if}
</div>

<DeviceDetailsModal signer={selectedSigner} health={selectedSigner ? latestHealth(selectedSigner) : null} history={selectedSigner ? (healthHistory[selectedSigner.id] ?? []) : []} policyStatus={selectedSigner ? signerPolicyStatus(selectedSigner) : null} {checking} onclose={() => selectedSigner = null} oncheck={runHealthCheck} onpolicy={() => selectedSigner && openPolicyVerification(selectedSigner)}/>
<MultisigDescriptorsModal open={showDescriptors} {wallet} onclose={() => showDescriptors=false}/>
<Modal open={!!policySigner} preserveTop title={policySigner && policyRegistrationProfile(policySigner).registration==='file_once'?'Prepare Coldcard for this wallet':'Verify signer wallet policy'} description={policySigner && policyRegistrationProfile(policySigner).registration==='file_once'?'Complete the one-time policy-file import before signing.':"Compare Groot's saved public policy with every value shown on the hardware device."} onclose={()=>{if(!policyBusy){policySigner=null;policyDevice=null;policyError='';}}}>
  {#if policySigner && wallet && policyRegistrationProfile(policySigner).registration==='file_once'}<ColdcardPolicySetup {wallet} signer={policySigner} busy={policyBusy} error={policyError} ondownload={saveColdcardPolicy} onconfirm={confirmColdcardPolicy}/>
  {:else if policyBusy && !policyDevice}<HardwareActionPrompt title="Looking for the saved signer" detail="Keep the device connected, unlocked, and in its Bitcoin app while Groot matches the saved fingerprint." label="Signer scan in progress"/>
  {:else if policySigner && wallet && policyDevice && policyAddress}<SignerPolicyReview {wallet} signer={policySigner} {policyAddress} verification={matchingPolicyVerification(policySigner,policyVerifications)} busy={policyBusy} error={policyError} onverify={verifySignerPolicy}/>
  {:else if policySigner}<div class="device-scan"><Cpu size={20}/><strong>Saved signer not found</strong><span>{policyError || `Connect and unlock ${policySigner.label}, then scan again.`}</span><Button variant="secondary" onclick={()=>openPolicyVerification(policySigner!)}>Scan again</Button></div>{/if}
</Modal>
