<script lang="ts">
  import { ChevronRight, Copy, Eye, FileKey, FlaskConical, MoreHorizontal, Plus, ShieldCheck, Usb } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { isPrototypeWallet, walletService, type CosignerHealthCheck, type MultisigWallet, type WalletSnapshot } from '$lib/wallet';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import { defaultConfig, networkName } from '$lib/config';
  import { shortSats } from '$lib/data';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import { combineDescriptorBranches } from '$lib/descriptors';
  import { cosignerHealthHistory, recordCosignerHealth } from '$lib/stores/cosigner-health';
  let wallet = $state<MultisigWallet | null>(null);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selectedSigner = $state<CosignerDraft | null>(null);
  let showDescriptors = $state(false);
  let moreOpen = $state(false);
  let checking = $state(false);
  let combinedDescriptor = $derived(wallet ? combineDescriptorBranches(wallet.externalDescriptor, wallet.internalDescriptor) : null);
  onMount(async () => { wallet = await walletService.multisigWallet(); if (wallet) { try { snapshot = await walletService.syncMultisig(); } catch (cause) { toast({title:'Vault is offline',description:cause instanceof Error?cause.message:undefined,tone:'danger'}); } } });
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated' && event.walletKind === 'multisig') snapshot = event.snapshot;
  }));
  async function copyDescriptor(value: string, label: string) {
    await copyText(value);
    toast({ title: `${label} descriptor copied`, description: 'Public watch-only descriptor copied.', tone: 'success' });
  }
  function sourceName(source: CosignerSource) {
    return ({ usb: 'USB hardware', qr: 'QR import', file: 'File import', manual: 'Manual backup', virtual: 'Virtual test device' })[source];
  }
  function openSigner(signer: CosignerDraft) {
    selectedSigner = signer;
  }
  function healthLabel(signer: CosignerDraft) {
    const check = latestHealth(signer);
    if (check?.status === 'healthy') return 'Healthy';
    if (check?.status === 'record_valid') return 'Record valid';
    if (check?.status === 'attention') return 'Attention';
    return 'Ready';
  }
  function latestHealth(signer: CosignerDraft) { return $cosignerHealthHistory[signer.id]?.[0] ?? null; }
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
      recordCosignerHealth(signer.id, await walletService.checkHardwareCosigner(signer));
      toast({ title: 'Health check passed', description: `${signer.label} is ready.`, tone: 'success' });
    } catch (cause) {
      const summary = cause instanceof Error ? cause.message : 'The device could not be verified.';
      recordCosignerHealth(signer.id, { checkedAt: new Date().toISOString(), summary, status: 'attention' });
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checking = false;
    }
  }
</script>

<div class="page coordinator-page">
  {#if wallet}
    <header class="page-header"><div><p class="eyebrow">WALLET POLICY</p><h1>{wallet.name}</h1><p class="subtitle">A watch-only wallet whose spending policy is enforced by independent keys.</p></div><span class="policy-pill">{wallet.threshold} of {wallet.cosigners.length}</span></header>
    <section class="vault-hero"><span><ShieldCheck size={22}/></span><div class="vault-summary"><small>{shortSats(snapshot?.balance.total ?? 0)} sats · Spending policy</small><strong>{wallet.threshold} of {wallet.cosigners.length}</strong><p>Native SegWit · sortedmulti · {networkName(snapshot?.network ?? defaultConfig.network)}</p>{#if isPrototypeWallet}<p class="prototype-hint">Ready-to-test demo vault <span>·</span> PIN <code>prototype-passphrase</code></p>{/if}</div><div class="vault-actions"><div class="wallet-more"><button type="button" class="wallet-more-trigger" aria-label="More wallet actions" aria-haspopup="menu" aria-expanded={moreOpen} onclick={() => moreOpen=!moreOpen} onkeydown={(event) => { if (event.key === 'Escape') moreOpen=false; }}><MoreHorizontal size={18}/></button>{#if moreOpen}<div class="wallet-more-menu" role="menu" tabindex="-1" onkeydown={(event) => { if (event.key === 'Escape') moreOpen=false; }}><button role="menuitem" onclick={() => { moreOpen=false; showDescriptors=true; }}><Eye size={15}/><span><strong>Show descriptors</strong><small>Inspect receive and change logic</small></span></button><a role="menuitem" href="/multisig/backup"><FileKey size={15}/><span><strong>Export & verify</strong><small>Save a public wallet backup</small></span></a><a role="menuitem" href="/multisig/policy"><FlaskConical size={15}/><span><strong>Recovery policy lab</strong><small>Explore guided Miniscript paths</small></span></a></div>{/if}</div><Button variant="secondary" href="/multisig/receive">Receive</Button><Button href="/multisig/send">Send</Button></div></section>
    <div class="vault-grid">
      <section class="vault-cosigners"><div class="section-heading compact"><div><h2>Signing keys</h2><p>Sign with any {wallet.threshold} keys. Select one to inspect its identity and health history.</p></div></div><div class="saved-cosigner-list">{#each wallet.cosigners as signer, i}<article><button aria-label="View {signer.label} details" onclick={() => openSigner(signer)}><span class="device-number">{i + 1}</span><span class="saved-cosigner-copy"><strong>{signer.label}</strong><span><code>{signer.fingerprint.toLowerCase()}</code><i></i>{sourceName(signer.source)}{#if latestHealth(signer)}<i></i>Checked <LocalTimestamp value={latestHealth(signer)!.checkedAt}/>{/if}</span></span><span class="ready-badge" class:attention={latestHealth(signer)?.status === 'attention'}>{healthLabel(signer)}</span><ChevronRight class="row-chevron" size={16}/></button></article>{/each}</div></section>
      <aside class="vault-backup-card"><span class="vault-backup-icon"><FileKey size={20}/></span><div><h2>Backups & recovery</h2><p>Save the public policy, then verify it rebuilds the same first address.</p></div><Button variant="secondary" class="full" href="/multisig/backup">Export & verify</Button><Button variant="ghost" class="full" href="/multisig/policy">Recovery policy lab</Button></aside>
    </div>
  {:else}
    <section class="empty-state vault-empty"><span class="empty-icon"><Usb size={24}/></span><h2>Single-key policy</h2><p>This wallet is controlled by one signing key. Add another wallet to use a shared or recovery policy.</p><Button href="/welcome?add=1"><Plus size={16}/>Add another wallet</Button></section>
  {/if}
</div>

<DeviceDetailsModal signer={selectedSigner} health={selectedSigner ? latestHealth(selectedSigner) : null} history={selectedSigner ? ($cosignerHealthHistory[selectedSigner.id] ?? []) : []} {checking} onclose={() => selectedSigner = null} oncheck={runHealthCheck} oncopy={copyPublicKey}/>
<Modal open={showDescriptors} title="Wallet descriptors" description="Public watch-only logic for receiving and change. It cannot sign transactions, but it reveals wallet activity." onclose={() => showDescriptors=false}>
  {#if wallet}<div class="descriptor-viewer">{#if combinedDescriptor}<section class="descriptor-primary"><div><span>Portable wallet descriptor</span><small>Standard multipath form: branch 0 receives, branch 1 creates change.</small></div><code>{combinedDescriptor}</code><button onclick={() => copyDescriptor(combinedDescriptor!, 'Wallet')}><Copy size={15}/>Copy wallet descriptor</button></section><details><summary>View separate receive and change descriptors</summary><section><div><span>Receive descriptor</span><small>Generates addresses shared for incoming payments.</small></div><code>{wallet.externalDescriptor}</code><button onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}><Copy size={15}/>Copy receive descriptor</button></section><section><div><span>Change descriptor</span><small>Generates private change addresses after spending.</small></div><code>{wallet.internalDescriptor}</code><button onclick={() => copyDescriptor(wallet!.internalDescriptor, 'Change')}><Copy size={15}/>Copy change descriptor</button></section></details>{:else}<section><div><span>Receive descriptor</span><small>Generates addresses shared for incoming payments.</small></div><code>{wallet.externalDescriptor}</code><button onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}><Copy size={15}/>Copy receive descriptor</button></section><section><div><span>Change descriptor</span><small>Generates private change addresses after spending.</small></div><code>{wallet.internalDescriptor}</code><button onclick={() => copyDescriptor(wallet!.internalDescriptor, 'Change')}><Copy size={15}/>Copy change descriptor</button></section>{/if}<p><ShieldCheck size={14}/>Keep descriptors private even though they cannot spend. They reveal every address in this wallet.</p></div>{/if}
</Modal>
