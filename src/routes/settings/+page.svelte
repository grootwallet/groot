<script lang="ts">
  import { Check, ChevronRight, KeyRound, LockKeyhole, Moon, Network, Plus, ShieldCheck, Sun, Trash2, WalletCards } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { toast } from '$lib/stores/toasts';
  import { defaultConfig, networkName } from '$lib/config';
  import { walletService } from '$lib/wallet';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { WalletProfile } from '$lib/wallet/contracts';
  let deleting = $state(false);
  let confirmText = $state('');
  let deleteCredential = $state('');
  let busy = $state(false);
  let checking = $state(false);
  let connected = $state<boolean | null>(null);
  let theme = $state<'light' | 'dark'>('dark');
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  onMount(async () => {
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const registry = await walletService.profiles();
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
  });
  onDestroy(() => {
    deleteCredential = '';
    confirmText = '';
  });
  async function selectWallet(profile: WalletProfile) {
    if (profile.id === selectedWalletId) return;
    await walletService.selectWallet(profile.id);
    await goto(`/unlock?next=${profile.kind === 'multisig' ? '/multisig' : '/'}`);
  }
  function setTheme(next: 'light' | 'dark') { theme = next; document.documentElement.dataset.theme = next; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f1e9' : '#0d1118'); localStorage.setItem('satchel-theme', next); }
  async function checkConnection() {
    checking = true;
    try { if (selectedProfile?.kind === 'multisig') await walletService.syncMultisig(); else await walletService.sync(); connected = true; toast({ title: 'Bitcoin node connected', tone: 'success' }); }
    catch (cause) { connected = false; toast({ title: 'Node unavailable', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { checking = false; }
  }
  async function lockNow() {
    await walletService.lock();
    await goto('/unlock');
  }
  async function deleteWallet() {
    busy = true;
    try {
      await walletService.deleteWallet(deleteCredential, confirmText);
      deleting = false; confirmText = ''; deleteCredential = '';
      toast({ title: 'Wallet deleted', description: 'Local wallet data and encrypted key material were removed.' });
      const registry = await walletService.profiles();
      await goto(registry.wallets.length ? '/unlock' : '/welcome');
    } catch (cause) { toast({ title: 'Could not delete wallet', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { deleteCredential = ''; busy = false; }
  }
</script>

<div class="page narrow-page">
  <header class="page-header"><div><p class="eyebrow">PREFERENCES</p><h1>Settings</h1><p class="subtitle">Wallet security and network configuration.</p></div></header>
  <section class="settings-group"><h2>Wallet</h2>
    <div class="setting-row"><span class="setting-icon"><ShieldCheck size={18} /></span><span><strong>Recovery phrase</strong><small>Shown once during setup; keep your offline backup</small></span></div>
    <div class="setting-row"><span class="setting-icon"><KeyRound size={18} /></span><span><strong>Passphrase / PIN</strong><small>Fixed for this wallet; derives, unlocks, and signs</small></span></div>
    <button onclick={lockNow}><span class="setting-icon"><LockKeyhole size={18}/></span><span><strong>Lock now</strong><small>Signing access also locks after 5 minutes without wallet activity</small></span><ChevronRight size={16}/></button>
  </section>
  <section class="settings-group wallet-manager"><h2>Wallets</h2>
    {#each profiles as profile}
      <button onclick={() => selectWallet(profile)}>
        <span class="setting-icon"><WalletCards size={18}/></span>
        <span><strong>{profile.name}</strong><small>{profile.kind === 'multisig' ? 'Descriptor multisig' : profile.kind === 'watch_only' ? 'Watch-only' : 'Single-key'} · {profile.descriptorChecksum}</small></span>
        {#if profile.id === selectedWalletId}<Check size={16}/>{:else}<ChevronRight size={16}/>{/if}
      </button>
    {/each}
    <button onclick={() => goto('/welcome?add=1')}><span class="setting-icon"><Plus size={18}/></span><span><strong>Add wallet</strong><small>Create or recover another isolated wallet</small></span><ChevronRight size={16}/></button>
  </section>
  <section class="settings-group"><h2>Appearance</h2>
    <div class="setting-row"><span class="setting-icon">{#if theme === 'dark'}<Moon size={18}/>{:else}<Sun size={18}/>{/if}</span><span><strong>Theme</strong><small>Quiet contrast, with a French tricolor accent</small></span><span class="theme-choice"><button class:active={theme === 'light'} onclick={() => setTheme('light')}>Light</button><button class:active={theme === 'dark'} onclick={() => setTheme('dark')}>Dark</button></span></div>
  </section>
  <section class="settings-group"><h2>Multisig</h2>
    <button onclick={() => goto('/multisig/new')}><span class="setting-icon"><ShieldCheck size={18} /></span><span><strong>Create descriptor wallet</strong><small>Choose a recommended recipe or advanced M-of-N</small></span><ChevronRight size={16}/></button>
    <button onclick={() => goto('/multisig/recover')}><span class="setting-icon"><KeyRound size={18} /></span><span><strong>Recover descriptor wallet</strong><small>Import a checksummed Satchel backup and verify its first address</small></span><ChevronRight size={16}/></button>
  </section>
  <section class="settings-group"><h2>Network</h2>
    <button disabled={checking} onclick={checkConnection}><span class="setting-icon"><Network size={18} /></span><span><strong>Bitcoin network</strong><small>{networkName(defaultConfig.network)} · {defaultConfig.esploraUrl ? 'mempool.space Esplora' : 'local Bitcoin Core RPC'}</small></span><span class="badge" class:offline={connected === false}>{checking ? 'Checking…' : connected === true ? 'Connected' : connected === false ? 'Offline' : 'Check'}</span></button>
  </section>
  {#if selectedProfile?.kind !== 'multisig'}<section class="settings-group danger-zone"><h2>Danger zone</h2><div><span><strong>Delete wallet</strong><small>Remove only {selectedProfile?.name ?? 'this wallet'} from this device.</small></span><Button variant="danger-outline" size="small" onclick={() => deleting = true}><Trash2 size={15} />Delete</Button></div></section>{:else}<section class="settings-group"><h2>Multisig safety</h2><button onclick={() => goto('/multisig/backup')}><span class="setting-icon"><ShieldCheck size={18}/></span><span><strong>Backup and deletion</strong><small>Verify recovery before removing this coordinator</small></span><ChevronRight size={16}/></button></section>{/if}
  <p class="version">Satchel 0.1.0 · BDK regtest</p>
</div>

<Modal open={deleting} title="Delete this wallet?" description="This permanently removes wallet data from this device." onclose={() => deleting = false}>
  <div class="warning-box danger"><strong>Make sure your recovery phrase is backed up.</strong> Without it, your bitcoin cannot be recovered.</div>
  <PasswordField label="Passphrase / PIN" bind:value={deleteCredential} autocomplete="current-password" />
  <label class="field"><span>Type DELETE to confirm</span><input bind:value={confirmText} placeholder="DELETE" /></label>
  <div class="modal-footer"><Button variant="secondary" onclick={() => { deleting = false; deleteCredential = ''; }}>Cancel</Button><Button variant="danger" disabled={confirmText !== 'DELETE' || !deleteCredential || busy} onclick={deleteWallet}>{busy ? 'Deleting…' : 'Delete wallet'}</Button></div>
</Modal>
