<script lang="ts">
  import { Check, ChevronRight, Clock3, Copy, Cpu, Download, FileKey, History, KeyRound, LockKeyhole, Moon, Network, Plus, RefreshCw, ShieldCheck, Sun, Trash2, WalletCards } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import { toast } from '$lib/stores/toasts';
  import { defaultConfig, networkName } from '$lib/config';
  import { walletService, WalletError } from '$lib/wallet';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { CoreNodeConfig, RecoveryScanSettings, WalletProfile } from '$lib/wallet/contracts';
  let deleting = $state(false);
  let confirmText = $state('');
  let deleteCredential = $state('');
  let busy = $state(false);
  let checking = $state(false);
  let connected = $state<boolean | null>(null);
  let theme = $state<'light' | 'dark'>('dark');
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let inactivityTimeoutMinutes = $state(5);
  let savingInactivityTimeout = $state(false);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let isSoftwareWallet = $derived(selectedProfile?.kind === 'single_key');
  let credentialLabel = $derived(isSoftwareWallet ? 'Wallet passphrase' : 'App PIN');
  let backupTitle = $derived(selectedProfile?.kind === 'multisig' ? 'Public policy + signer backups' : selectedProfile?.kind === 'watch_only' ? 'Hardware signer backup' : 'Recovery words + wallet passphrase');
  let backupDescription = $derived(selectedProfile?.kind === 'multisig' ? 'Keep the public descriptor and enough independent signer backups. The app PIN only protects local Satchel data.' : selectedProfile?.kind === 'watch_only' ? 'Recovery words remain on the signer. The app PIN only protects local Satchel data.' : 'Keep both together. Satchel cannot display or reset either one.');
  const timeoutOptions = [{ value: 1, label: '1 minute' }, { value: 5, label: '5 minutes' }, { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }, { value: 60, label: '1 hour' }];
  let nodeOpen = $state(false), nodePassword = $state(''), walletCredential = $state(''), nodeError = $state('');
  let node = $state<CoreNodeConfig>({ backend: { type: 'local_core', url: 'http://127.0.0.1:18443' }, auth: 'cookie', username: null });
  let scanOpen = $state(false), scanCredential = $state(''), scanError = $state(''), scan = $state<RecoveryScanSettings>({ birthdayHeight: 0, gapLimit: 20 }), scanDraft = $state<RecoveryScanSettings>({ birthdayHeight: 0, gapLimit: 20 });
  let verifyOpen = $state(false), verifyCredential = $state(''), verifyError = $state(''), verifying = $state(false);
  let hardwareBackupOpen = $state(false), hardwareBackupPin = $state(''), hardwareBackupError = $state(''), hardwareBackup = $state(''), exportingHardwareBackup = $state(false);
  onMount(async () => {
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const registry = await walletService.profiles();
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
    inactivityTimeoutMinutes = registry.inactivityTimeoutMinutes;
    node = await walletService.nodeConfig();
    scan = await walletService.recoveryScanSettings(); scanDraft = { ...scan };
  });
  onDestroy(() => {
    deleteCredential = '';
    confirmText = '';
    nodePassword = ''; walletCredential = ''; scanCredential = ''; verifyCredential = ''; hardwareBackupPin = ''; hardwareBackup = '';
  });
  function setTheme(next: 'light' | 'dark') { theme = next; document.documentElement.dataset.theme = next; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f1e9' : '#0d1118'); localStorage.setItem('satchel-theme', next); }
  async function checkConnection() {
    checking = true;
    try { const result = await walletService.testNodeConnection(); connected = true; toast({ title: 'Bitcoin node connected', description: `${result.blocks} blocks`, tone: 'success' }); }
    catch (cause) { connected = false; toast({ title: 'Node unavailable', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { checking = false; }
  }
  function setNodeLocation(type: 'local_core'|'remote_core'|'tor') { node = type === 'local_core' ? { backend:{type:'local_core',url:'http://127.0.0.1:18443'},auth:'cookie',username:null,torProxy:null } : type === 'tor' ? { backend:{type:'remote_core',url:'http://example.onion:8332'},auth:'user_pass',username:'',torProxy:'127.0.0.1:9050' } : { backend:{type:'remote_core',url:'https://'},auth:'user_pass',username:'',torProxy:null }; nodePassword=''; nodeError=''; }
  async function saveNode() {
    busy=true;nodeError='';
    try { const result=await walletService.saveNodeConfig(node,nodePassword,walletCredential);connected=true;nodeOpen=false;nodePassword='';walletCredential='';toast({title:'Node saved and verified',description:`Connected at block ${result.blocks}.`,tone:'success'}); }
    catch(cause){connected=false;nodeError=cause instanceof Error?cause.message:'Could not save this node.';}
    finally{nodePassword='';walletCredential='';busy=false;}
  }
  async function lockNow() {
    await walletService.lock();
    await goto('/unlock');
  }
  async function saveInactivityTimeout(minutes: number) {
    const previous = inactivityTimeoutMinutes;
    inactivityTimeoutMinutes = minutes;
    savingInactivityTimeout = true;
    try {
      const registry = await walletService.saveInactivityTimeout(minutes);
      inactivityTimeoutMinutes = registry.inactivityTimeoutMinutes;
      toast({
        title: 'Automatic lock updated',
        description: `Every wallet will lock after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of inactivity.`,
        tone: 'success'
      });
    } catch (cause) {
      inactivityTimeoutMinutes = previous;
      toast({ title: 'Could not update automatic lock', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally {
      savingInactivityTimeout = false;
    }
  }
  async function runFullRescan() {
    busy=true;scanError='';
    try { scan=await walletService.saveRecoveryScanSettings(Number(scanDraft.birthdayHeight),Number(scanDraft.gapLimit),scanCredential); scanDraft={...scan}; const snapshot=await walletService.fullRescan(scanCredential); scanOpen=false;toast({title:'Full rescan complete',description:`Recovered balance: ${snapshot.balance.total.toLocaleString()} sats`,tone:'success'}); }
    catch(cause){scanError=cause instanceof Error?cause.message:'The full rescan failed.';}
    finally{scanCredential='';busy=false;}
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
  async function verifyBackup() {
    verifying=true;verifyError='';
    try {
      const verified=await walletService.verifyBackup(verifyCredential);
      verifyCredential='';verifyOpen=false;
      if(!verified){toast({title:'Backup still unverified',description:'Return when your written recovery words are available.'});return;}
      profiles=profiles.map((profile)=>profile.id===selectedWalletId?{...profile,backupVerified:true}:profile);
      toast({title:'Recovery backup verified',description:'Your written words matched this wallet.',tone:'success'});
    } catch(cause){verifyError=cause instanceof Error?cause.message:'Could not verify this recovery backup.';}
    finally{verifyCredential='';verifying=false;}
  }
  async function prepareHardwareBackup() {
    exportingHardwareBackup = true; hardwareBackupError = '';
    try {
      hardwareBackup = await walletService.exportExternalSignerDescriptor(hardwareBackupPin);
      hardwareBackupPin = '';
      toast({ title: 'Public descriptor ready', description: 'This watch-only backup cannot sign, but it reveals wallet activity.', tone: 'success' });
    } catch (cause) {
      hardwareBackupError = cause instanceof Error ? cause.message : 'Could not prepare the public descriptor.';
    } finally {
      hardwareBackupPin = ''; exportingHardwareBackup = false;
    }
  }
  async function copyHardwareBackup() {
    await navigator.clipboard.writeText(hardwareBackup);
    toast({ title: 'Descriptor copied', description: 'Keep this public wallet backup private.', tone: 'success' });
  }
  async function saveHardwareBackup() {
    try {
      const saved = await walletService.savePublicBackup('satchel-hardware-wallet.desc', hardwareBackup);
      if (saved) toast({ title: 'Descriptor backup saved', description: 'Use this file for the clean-profile recovery drill.', tone: 'success' });
    } catch (cause) {
      hardwareBackupError = cause instanceof Error ? cause.message : 'Could not save the descriptor backup.';
    }
  }
  async function selectWallet(profile: WalletProfile) {
    if (profile.id === selectedWalletId) return;
    try {
      await walletService.selectWallet(profile.id);
      selectedWalletId = profile.id;
      const destination = '/';
      try {
        if (profile.kind === 'multisig') await walletService.multisigSnapshot();
        else await walletService.snapshot();
        await goto(destination);
      } catch (cause) {
        if (cause instanceof WalletError && cause.code === 'wallet_locked') {
          await goto(`/unlock?next=${destination}`);
          return;
        }
        throw cause;
      }
    } catch (cause) {
      toast({ title: 'Could not open wallet', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
  }
</script>

<div class="page narrow-page settings-page">
  <header class="page-header"><div><p class="eyebrow">WALLET SETTINGS</p><h1>{selectedProfile?.name ?? 'Settings'}</h1><p class="subtitle">Wallet security and connection. Appearance is global.</p></div></header>
  <section class="settings-group immediate-security"><h2>Security</h2>
    <div class="settings-list">
      <button onclick={lockNow}><span class="setting-icon"><LockKeyhole size={18}/></span><span><strong>Lock {selectedProfile?.name ?? 'wallet'} now</strong><small>Lock only this wallet immediately.</small></span><ChevronRight size={16}/></button>
      <div class="setting-row automatic-lock-row"><span class="setting-icon"><Clock3 size={18}/></span><span><strong>Automatic lock</strong><small>One global setting; each unlocked wallet tracks its own inactivity.</small></span><select class="timeout-choice" aria-label="Automatic lock inactivity period" value={inactivityTimeoutMinutes} disabled={savingInactivityTimeout} onchange={(event) => saveInactivityTimeout(Number(event.currentTarget.value))}>{#each timeoutOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></div>
    </div>
  </section>
  <section class="settings-group current-wallet-settings"><h2>Backup and recovery</h2>
    <div class="settings-list">
      {#if isSoftwareWallet && !selectedProfile?.backupVerified}<button class="wallet-context-row backup-needs-verification" onclick={() => {verifyError='';verifyOpen=true;}}><span class="setting-icon"><KeyRound size={18}/></span><span><strong>Recovery words not verified</strong><small>Use your written backup to confirm all 24 words in exact order.</small></span><span class="info-badge attention">Verify now</span></button>{:else}<div class="setting-row wallet-context-row"><span class="setting-icon">{#if selectedProfile?.kind === 'multisig'}<ShieldCheck size={18}/>{:else if selectedProfile?.kind === 'watch_only'}<Cpu size={18}/>{:else}<KeyRound size={18}/>{/if}</span><span><strong>{backupTitle}</strong><small>{backupDescription}</small></span><span class="info-badge">{isSoftwareWallet ? 'Verified' : 'Backup required'}</span></div>{/if}
      <button onclick={() => {scanDraft={...scan};scanOpen=true;}}><span class="setting-icon"><History size={18}/></span><span><strong>Recovery scan</strong><small>Birthday block {scan.birthdayHeight} · gap limit {scan.gapLimit}</small></span><ChevronRight size={16}/></button>
      {#if selectedProfile?.kind === 'multisig'}<button onclick={() => goto('/multisig/backup')}><span class="setting-icon"><ShieldCheck size={18}/></span><span><strong>Export & verify public backup</strong><small>Save descriptors and prove the backup reconstructs this wallet.</small></span><ChevronRight size={16}/></button>{:else if selectedProfile?.kind === 'watch_only'}<button onclick={() => {hardwareBackupOpen=true;hardwareBackup='';hardwareBackupError='';}}><span class="setting-icon"><FileKey size={18}/></span><span><strong>Export public descriptor</strong><small>Save a watch-only backup for independent recovery.</small></span><ChevronRight size={16}/></button>{/if}
    </div>
  </section>
  <section class="settings-group wallet-manager mobile-wallet-manager"><h2><span>Wallets</span><strong>{profiles.length} {profiles.length === 1 ? 'wallet' : 'wallets'}</strong></h2>
    <div class="settings-list">
      {#each profiles as profile}
        <button aria-label={`${profile.name}${profile.id === selectedWalletId ? ', active wallet' : ''}`} onclick={() => selectWallet(profile)}>
          <span class="setting-icon">{#if profile.kind === 'multisig'}<ShieldCheck size={18}/>{:else if profile.kind === 'watch_only'}<Cpu size={18}/>{:else}<WalletCards size={18}/>{/if}</span>
          <span><strong>{profile.name}</strong><small>{profile.kind === 'multisig' ? 'Shared-key policy wallet' : profile.kind === 'watch_only' ? 'Hardware wallet' : 'Software wallet'}</small></span>
          {#if profile.id === selectedWalletId}<Check size={16}/>{:else}<ChevronRight size={16}/>{/if}
        </button>
      {/each}
      <button onclick={() => goto('/welcome?add=1')}><span class="setting-icon"><Plus size={18}/></span><span><strong>Add wallet</strong><small>Create or recover another isolated wallet.</small></span><ChevronRight size={16}/></button>
    </div>
  </section>
  <section class="settings-group"><h2>App appearance</h2>
    <div class="settings-list"><div class="setting-row"><span class="setting-icon">{#if theme === 'dark'}<Moon size={18}/>{:else}<Sun size={18}/>{/if}</span><span><strong>Theme</strong><small>Quiet contrast with a restrained French tricolor accent.</small></span><span class="theme-choice"><button class:active={theme === 'light'} onclick={() => setTheme('light')}>Light</button><button class:active={theme === 'dark'} onclick={() => setTheme('dark')}>Dark</button></span></div><div class="setting-row language-setting-row"><LanguageToggle labelled /></div></div>
  </section>
  <section class="settings-group"><h2>Wallet node</h2>
    <div class="settings-list">
      <button onclick={() => nodeOpen=true}><span class="setting-icon"><Network size={18} /></span><span><strong>Bitcoin Core node</strong><small>{networkName(defaultConfig.network)} · {node.backend.type === 'local_core' ? 'This Mac' : 'Trusted remote server'} · <span class="selectable-text">{node.backend.url}</span></small></span><ChevronRight size={16}/></button>
      <button disabled={checking} onclick={checkConnection}><span class="setting-icon"><Check size={18}/></span><span><strong>Test connection</strong><small>Verify RPC authentication and chain availability.</small></span><span class="badge" class:offline={connected === false}>{checking ? 'Checking…' : connected === true ? 'Connected' : connected === false ? 'Offline' : 'Check'}</span></button>
    </div>
  </section>
  {#if selectedProfile?.kind !== 'multisig'}<section class="settings-group danger-zone"><h2>Wallet deletion</h2><div><span><strong>Delete wallet</strong><small>Remove only {selectedProfile?.name ?? 'this wallet'} from this device.</small></span><Button variant="danger-outline" size="small" onclick={() => deleting = true}><Trash2 size={15} />Delete</Button></div></section>{:else}<section class="settings-group danger-zone"><h2>Wallet deletion</h2><div><span><strong>Delete policy wallet</strong><small>A successful recovery drill is required first.</small></span><Button variant="danger-outline" size="small" href="/multisig/backup"><Trash2 size={15}/>Review</Button></div></section>{/if}
  <p class="version">Satchel 0.1.0 · BDK regtest</p>
</div>

<Modal open={deleting} title="Delete this wallet?" description="This permanently removes wallet data from this device." onclose={() => deleting = false}>
  <div class="warning-box danger"><strong>Make sure your recovery phrase is backed up.</strong> Without it, your bitcoin cannot be recovered.</div>
  <PasswordField label={credentialLabel} bind:value={deleteCredential} autocomplete="current-password" />
  <label class="field"><span>Type DELETE to confirm</span><input bind:value={confirmText} placeholder="DELETE" /></label>
  <div class="modal-footer"><Button variant="secondary" onclick={() => { deleting = false; deleteCredential = ''; }}>Cancel</Button><Button variant="danger" disabled={confirmText !== 'DELETE' || !deleteCredential} loading={busy} loadingLabel="Deleting…" onclick={deleteWallet}>Delete wallet</Button></div>
</Modal>
<Modal open={verifyOpen} title="Verify recovery backup" description="Use your written 24 words to complete a private native challenge. Satchel will not reveal them again." onclose={() => {verifyOpen=false;verifyCredential='';verifyError='';}}>
  <div class="warning-box"><strong>Have the written backup in front of you.</strong> Verification confirms its exact word order without sending the words into the webview.</div>
  <PasswordField label="Wallet passphrase" bind:value={verifyCredential} autocomplete="current-password" hint="Required to decrypt the recovery words only inside trusted Rust code."/>
  {#if verifyError}<p class="form-error" role="alert">{verifyError.replace('passphrase / PIN','wallet passphrase')}</p>{/if}
  <div class="modal-footer"><Button variant="secondary" onclick={() => {verifyOpen=false;verifyCredential='';verifyError='';}}>Cancel</Button><Button disabled={!verifyCredential} loading={verifying} loadingLabel="Opening verification…" onclick={verifyBackup}>Continue</Button></div>
</Modal>
<Modal open={hardwareBackupOpen} title="Export public descriptor" description="Recover this watch-only wallet without exposing the Ledger seed." onclose={() => {hardwareBackupOpen=false;hardwareBackupPin='';hardwareBackupError='';hardwareBackup='';}}>
  {#if !hardwareBackup}
    <div class="modal-form">
      <div class="warning-box"><strong>Public, not harmless.</strong> This descriptor cannot spend bitcoin, but it reveals every wallet address and transaction. Store it privately.</div>
      <PasswordField label="App PIN" bind:value={hardwareBackupPin} autocomplete="current-password" hint="Re-authenticate before exposing wallet metadata."/>
    </div>
    {#if hardwareBackupError}<p class="form-error" role="alert">{hardwareBackupError}</p>{/if}
    <div class="modal-footer"><Button variant="secondary" onclick={() => {hardwareBackupOpen=false;hardwareBackupPin='';}}>Cancel</Button><Button disabled={!hardwareBackupPin} loading={exportingHardwareBackup} loadingLabel="Preparing…" onclick={prepareHardwareBackup}>Prepare backup</Button></div>
  {:else}
    <div class="modal-form">
      <div class="warning-box success hardware-backup-ready"><strong>Public descriptor ready</strong><span>Import this file in a clean disposable Satchel profile and confirm the first receive address matches.</span></div>
      <details><summary>View descriptor</summary><textarea aria-label="Public hardware wallet descriptor" rows="7" readonly value={hardwareBackup}></textarea></details>
    </div>
    {#if hardwareBackupError}<p class="form-error" role="alert">{hardwareBackupError}</p>{/if}
    <div class="modal-footer"><Button variant="secondary" onclick={copyHardwareBackup}><Copy size={15}/>Copy</Button><Button onclick={saveHardwareBackup}><Download size={15}/>Save descriptor</Button></div>
  {/if}
</Modal>
<Modal open={scanOpen} title="Full wallet rescan" description="Search from the earliest possible payment while deriving a bounded address gap." onclose={() => {scanOpen=false;scanCredential='';scanError='';scanDraft={...scan};}}>
  <div class="scan-form"><div class="warning-box"><strong>Earlier is safer; later is faster.</strong> A birthday after the wallet’s first payment can miss funds. A larger gap increases work and memory use.</div>
  <label class="field"><span>Wallet birthday block</span><input aria-label="Wallet birthday block" type="number" min="0" step="1" bind:value={scanDraft.birthdayHeight}/><small>Use 0 when uncertain. Regtest scans are intentionally cheap.</small></label>
  <label class="field"><span>Address gap limit</span><input aria-label="Address gap limit" type="number" min="20" max="1000" step="1" bind:value={scanDraft.gapLimit}/><small>20 is standard. Increase only if the wallet revealed long unused runs.</small></label>
  <PasswordField label={credentialLabel} bind:value={scanCredential} autocomplete="current-password"/></div>
  {#if scanError}<p class="form-error" aria-live="polite">{scanError}</p>{/if}
  <div class="modal-footer"><Button variant="secondary" onclick={() => {scanOpen=false;scanDraft={...scan};}}>Cancel</Button><Button disabled={!scanCredential||scanDraft.gapLimit<20||scanDraft.gapLimit>1000||scanDraft.birthdayHeight<0} loading={busy} loadingLabel="Scanning blocks…" onclick={runFullRescan}><RefreshCw size={15}/>Save & rescan</Button></div>
</Modal>
<Modal open={nodeOpen} title="Connect Bitcoin Core" description="Each wallet keeps isolated, encrypted RPC credentials. Use direct TLS or a local Tor SOCKS proxy remotely." onclose={() => nodeOpen=false}>
  <div class="theme-choice node-location"><button class:active={node.backend.type==='local_core'} onclick={() => setNodeLocation('local_core')}>This Mac</button><button class:active={node.backend.type==='remote_core'&&!node.torProxy} onclick={() => setNodeLocation('remote_core')}>Remote TLS</button><button class:active={!!node.torProxy} onclick={() => setNodeLocation('tor')}>Tor onion</button></div>
  <label class="field"><span>RPC URL</span><input bind:value={node.backend.url} placeholder={node.backend.type==='local_core'?'http://127.0.0.1:18443':node.torProxy?'http://your-node.onion:8332':'https://node.example.com:8332'}/><small>Credentials in URLs are rejected. TLS uses system trust roots; Tor accepts only .onion destinations.</small></label>
  {#if node.torProxy}<label class="field"><span>Local SOCKS5 proxy</span><input bind:value={node.torProxy} placeholder="127.0.0.1:9050"/><small>The proxy must listen on loopback. Remote proxies are rejected.</small></label>{/if}
  {#if node.backend.type === 'local_core'}
    <div class="credential-warning"><ShieldCheck size={16}/><p><strong>Automatic cookie authentication</strong><span>Uses Satchel’s local regtest cookie. Switch to username/password only for a custom local node.</span></p></div>
    <label class="field"><span>Authentication</span><select bind:value={node.auth}><option value="cookie">Local cookie</option><option value="user_pass">Username and password</option></select></label>
  {/if}
  {#if node.auth === 'user_pass'}<label class="field"><span>RPC username</span><input value={node.username??''} oninput={(event) => node={...node,username:event.currentTarget.value}} autocomplete="off"/></label><PasswordField label="RPC password" bind:value={nodePassword} autocomplete="new-password" hint="Encrypted locally; never placed in the URL or public config."/>{/if}
  <PasswordField label={credentialLabel} bind:value={walletCredential} autocomplete="current-password" hint="Required once to protect this wallet’s RPC credentials."/>
  {#if nodeError}<p class="form-error">{nodeError}</p>{/if}
  <div class="modal-footer"><Button variant="secondary" onclick={() => nodeOpen=false}>Cancel</Button><Button disabled={!node.backend.url||!walletCredential||(node.auth==='user_pass'&&(!node.username||!nodePassword))} loading={busy} loadingLabel="Testing connection…" onclick={saveNode}>Save & test</Button></div>
</Modal>
