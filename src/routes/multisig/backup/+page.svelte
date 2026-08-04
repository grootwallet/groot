<script lang="ts">
  import { Check, ClipboardCheck, Copy, Download, FileKey, FileUp, Trash2 } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import { downloadText, readTransferFile } from '$lib/transfer';
  import { walletService, type MultisigWallet, type RecoveryDrill } from '$lib/wallet';

  let wallet = $state<MultisigWallet | null>(null);
  let pin = $state('');
  let backup = $state('');
  let drill = $state<RecoveryDrill | null>(null);
  let confirmation = $state('');
  let deletePin = $state('');
  let busy = $state(false);
  let error = $state('');

  onDestroy(() => { pin = ''; deletePin = ''; confirmation = ''; backup = ''; });

  $effect(() => { void walletService.multisigWallet().then((value) => wallet = value); });

  async function exportBackup() {
    busy = true; error = '';
    try { backup = await walletService.exportMultisig(pin); pin = ''; toast({ title: 'Descriptor backup ready', tone: 'success' }); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not export the backup.'; pin = ''; }
    finally { busy = false; }
  }

  async function verifyBackup() {
    busy = true; error = '';
    try { drill = await walletService.recoveryDrill(backup); toast({ title: drill.matchesCurrentWallet ? 'Recovery drill passed' : 'Backup mismatch', description: drill.firstAddress, tone: drill.matchesCurrentWallet ? 'success' : 'danger' }); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Recovery drill failed.'; }
    finally { busy = false; }
  }

  async function removeWallet() {
    if (!wallet || !drill?.matchesCurrentWallet) return;
    busy = true; error = '';
    try { await walletService.deleteMultisig(deletePin, confirmation); toast({ title: 'Vault deleted', description: 'Local coordinator data was removed. Your descriptor backup remains recoverable.' }); await goto('/settings'); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not delete the vault.'; }
    finally { deletePin = ''; busy = false; }
  }

  async function importBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try { backup = await readTransferFile(file); drill = null; toast({ title: 'Backup file loaded', tone: 'success' }); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not read the backup file.'; }
  }
</script>

<div class="page narrow-page backup-page">
  <header class="page-header"><div><p class="eyebrow">WALLET BACKUP</p><h1>Export & verify</h1><p class="subtitle">A public descriptor backup reconstructs this coordinator without exposing signing keys.</p></div><Button variant="secondary" href="/multisig">Back to vault</Button></header>
  {#if wallet}
    <section class="form-card"><div class="section-heading compact"><div><h2>1. Export backup</h2><p>Authenticate to export the checksummed descriptors and cosigner origins.</p></div><FileKey size={19}/></div>
      {#if !backup}<PasswordField label="App PIN" inputLabel="Backup app PIN" bind:value={pin} autocomplete="current-password"/><Button class="full" disabled={!pin || busy} onclick={exportBackup}>{busy ? 'Exporting…' : 'Export descriptor backup'}</Button>
      {:else}<label class="field"><span>Satchel descriptor backup</span><textarea aria-label="Descriptor backup" rows="9" readonly value={backup}></textarea></label><div class="psbt-actions"><Button variant="secondary" onclick={async()=>{await copyText(backup);toast({title:'Backup copied',tone:'success'});}}><Copy size={15}/>Copy</Button><Button variant="secondary" onclick={()=>downloadText('satchel-descriptor-backup.json',backup)}><Download size={15}/>Save file</Button></div>{/if}
    </section>
    <section class="form-card"><div class="section-heading compact"><div><h2>2. Recovery drill</h2><p>Rebuild the wallet in memory and compare its first receive address.</p></div><ClipboardCheck size={19}/></div>
      {#if drill}<div class="drill-result" class:passed={drill.matchesCurrentWallet}><Check size={17}/><span><strong>{drill.matchesCurrentWallet ? 'Backup verified' : 'Backup does not match'}</strong><code>{drill.firstAddress}</code></span></div>{/if}
      <label class="file-action"><FileUp size={16}/>Load backup file<input aria-label="Backup file import" type="file" accept=".json,application/json,text/plain" onchange={importBackup}/></label><Button class="full" disabled={!backup || busy} onclick={verifyBackup}>{busy ? 'Verifying…' : 'Run recovery drill'}</Button>
    </section>
    <section class="form-card danger-card"><div class="section-heading compact"><div><h2>Delete local vault</h2><p>Enabled only after a successful recovery drill.</p></div><Trash2 size={19}/></div>
      <label class="field"><span>Type {wallet.name}</span><input aria-label="Vault name confirmation" bind:value={confirmation}/></label><PasswordField label="App PIN" inputLabel="Delete vault app PIN" bind:value={deletePin} autocomplete="current-password"/>
      <Button variant="danger" class="full" disabled={!drill?.matchesCurrentWallet || confirmation !== wallet.name || !deletePin || busy} onclick={removeWallet}>Delete vault from this device</Button>
    </section>
    {#if error}<p class="form-error" aria-live="polite">{error}</p>{/if}
  {:else}<section class="empty-state"><h2>No multisig wallet</h2><Button href="/multisig">Return to vault</Button></section>{/if}
</div>
