<script lang="ts">
  import { ChevronRight, Copy, FileKey, Plus, ShieldCheck, Usb } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import { isPrototypeWallet, walletService, type CosignerHealthCheck, type MultisigWallet, type WalletSnapshot } from '$lib/wallet';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import { defaultConfig, networkName } from '$lib/config';
  import { shortSats } from '$lib/data';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  let wallet = $state<MultisigWallet | null>(null);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selectedSigner = $state<CosignerDraft | null>(null);
  let checking = $state(false);
  let healthChecks = $state<Record<string, CosignerHealthCheck>>({});
  onMount(async () => { wallet = await walletService.multisigWallet(); if (wallet) { try { snapshot = await walletService.syncMultisig(); } catch (cause) { toast({title:'Vault is offline',description:cause instanceof Error?cause.message:undefined,tone:'danger'}); } } });
  async function copyDescriptor() {
    if (!wallet) return;
    await copyText(wallet.externalDescriptor);
    toast({ title: 'Descriptor copied', description: 'Public receive descriptor copied.', tone: 'success' });
  }
  function sourceName(source: CosignerSource) {
    return ({ usb: 'USB hardware', qr: 'QR import', file: 'File import', manual: 'Manual backup', virtual: 'Virtual test device' })[source];
  }
  function openSigner(signer: CosignerDraft) {
    selectedSigner = signer;
  }
  function healthLabel(signer: CosignerDraft) {
    const check = healthChecks[signer.id];
    if (check?.status === 'healthy') return 'Healthy';
    if (check?.status === 'record_valid') return 'Record valid';
    if (check?.status === 'attention') return 'Attention';
    return 'Ready';
  }
  async function copyPublicKey() {
    if (!selectedSigner) return;
    await copyText(selectedSigner.xpub);
    toast({ title: 'Public key copied', description: `${selectedSigner.label} account key copied.`, tone: 'success' });
  }
  async function runHealthCheck() {
    if (!selectedSigner || checking) return;
    const signer = selectedSigner;
    checking = true;
    try {
      healthChecks[signer.id] = await walletService.checkHardwareCosigner(signer);
      toast({ title: 'Health check passed', description: `${signer.label} is ready.`, tone: 'success' });
    } catch (cause) {
      const summary = cause instanceof Error ? cause.message : 'The device could not be verified.';
      healthChecks[signer.id] = { checkedAt: new Date().toISOString(), summary, status: 'attention' };
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checking = false;
    }
  }
</script>

<div class="page coordinator-page">
  {#if wallet}
    <header class="page-header"><div><p class="eyebrow">MULTISIG COORDINATOR</p><h1>{wallet.name}</h1><p class="subtitle">A watch-only descriptor wallet secured by independent keys.</p></div><span class="policy-pill">{wallet.threshold} of {wallet.cosigners.length}</span></header>
    <section class="vault-hero"><span><ShieldCheck size={22}/></span><div class="vault-summary"><small>{shortSats(snapshot?.balance.total ?? 0)} sats · Spending policy</small><strong>{wallet.threshold} of {wallet.cosigners.length}</strong><p>Native SegWit · sortedmulti · {networkName(snapshot?.network ?? defaultConfig.network)}</p>{#if isPrototypeWallet}<p class="prototype-hint">Ready-to-test demo vault <span>·</span> PIN <code>prototype-passphrase</code></p>{/if}</div><div class="vault-actions"><Button variant="secondary" onclick={copyDescriptor}><Copy size={15}/>Descriptor</Button><Button variant="secondary" href="/multisig/receive">Receive</Button><Button href="/multisig/send">Send</Button></div></section>
    <div class="coordinator-grid">
      <section><div class="section-heading compact"><div><h2>Cosigners</h2><p>Sign with any {wallet.threshold} keys. Select one for details.</p></div></div><div class="cosigner-list interactive">{#each wallet.cosigners as signer, i}<article><button class="cosigner-trigger" aria-label="View {signer.label} details" onclick={() => openSigner(signer)}><span class="device-number">{i + 1}</span><span class="cosigner-summary"><strong>{signer.label}</strong><small>{signer.fingerprint} <span>·</span> {sourceName(signer.source)}</small><code>{signer.xpub}</code></span><span class="ready-badge" class:attention={healthChecks[signer.id]?.status === 'attention'}>{healthLabel(signer)}</span><ChevronRight class="row-chevron" size={16}/></button></article>{/each}</div></section>
      <aside class="safety-panel"><FileKey size={21}/><h2>Wallet backup</h2><p>Export both descriptors and prove that the backup reconstructs the same first address.</p><Button variant="secondary" class="full" href="/multisig/backup">Export & verify</Button><Button variant="secondary" class="full" href="/multisig/policy">Recovery policy lab</Button></aside>
    </div>
  {:else}
    <section class="empty-state vault-empty"><span class="empty-icon"><Usb size={24}/></span><h2>No multisig wallet</h2><p>Create a simple descriptor wallet with three independent cosigners.</p><Button href="/multisig/new"><Plus size={16}/>Create multisig wallet</Button></section>
  {/if}
</div>

<DeviceDetailsModal signer={selectedSigner} health={selectedSigner ? healthChecks[selectedSigner.id] ?? null : null} {checking} onclose={() => selectedSigner = null} oncheck={runHealthCheck} oncopy={copyPublicKey}/>
