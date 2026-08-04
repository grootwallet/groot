<script lang="ts">
  import { Check, FileUp } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { toast } from '$lib/stores/toasts';
  import { walletService, type RecoveryDrill } from '$lib/wallet';
  let backup=$state(''),pin=$state(''),confirmation=$state(''),drill=$state<RecoveryDrill|null>(null),verified=$state(false),busy=$state(false),error=$state('');
  async function inspect(){busy=true;error='';drill=null;verified=false;try{drill=await walletService.recoveryDrill(backup);}catch(cause){error=cause instanceof Error?cause.message:'Invalid backup.';}finally{busy=false;}}
  onDestroy(()=>{pin='';confirmation='';});
  async function recover(){if(!drill||!verified||pin!==confirmation)return;busy=true;error='';try{await walletService.recoverMultisig(backup,pin);toast({title:'Vault recovered',description:'Descriptors were restored and will rescan from genesis.',tone:'success'});await goto('/multisig');}catch(cause){error=cause instanceof Error?cause.message:'Recovery failed.';}finally{pin='';confirmation='';busy=false;}}
</script>
<div class="page narrow-page"><header class="page-header"><div><p class="eyebrow">DESCRIPTOR RECOVERY</p><h1>Recover multisig vault</h1><p class="subtitle">Restore a public coordinator from its Satchel descriptor backup.</p></div><Button variant="secondary" href="/settings">Cancel</Button></header>
<section class="form-card"><label class="field"><span>Descriptor backup</span><textarea aria-label="Recovery descriptor backup" rows="10" bind:value={backup} placeholder="Paste the Satchel JSON backup"></textarea></label><Button variant="secondary" class="full" disabled={!backup.trim()||busy} onclick={inspect}><FileUp size={15}/>Validate backup</Button>
{#if drill}<div class="drill-result passed"><Check size={17}/><span><strong>Backup is valid</strong><small>Verify this first receive address against your offline record.</small><code>{drill.firstAddress}</code></span></div><label class="check-row"><input aria-label="I verified the first receive address" type="checkbox" bind:checked={verified}/><span><strong>I verified the first receive address</strong><small>A mismatch means this is not the wallet you intended to recover.</small></span></label><div class="credential-grid"><PasswordField label="New app PIN" inputLabel="New vault app PIN" bind:value={pin} autocomplete="new-password"/><PasswordField label="Confirm app PIN" inputLabel="Confirm new vault app PIN" bind:value={confirmation} autocomplete="new-password"/></div>{#if pin&&confirmation&&pin!==confirmation}<p class="form-error">PINs do not match.</p>{/if}<Button class="full" disabled={!verified||!pin||pin!==confirmation||busy} onclick={recover}>{busy?'Recovering…':'Recover vault'}</Button>{/if}
{#if error}<p class="form-error" aria-live="polite">{error}</p>{/if}</section></div>
