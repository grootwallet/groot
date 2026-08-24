<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { goto } from '$app/navigation';
  import { Check, FileUp, ShieldCheck, Trash2, X } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { recoveryDrillNotice } from '$lib/backup-presentation';
  import { toast } from '$lib/stores/toasts';
  import { readTransferFile } from '$lib/transfer';
  import { WalletError, walletService, type MultisigWallet, type RecoveryDrill } from '$lib/wallet';

  let wallet = $state<MultisigWallet | null>(null);
  let drillVerified = $state(false);
  let drill = $state<RecoveryDrill | null>(null);
  let backup = $state('');
  let loadedBackupName = $state('');
  let drillError = $state('');
  let confirmation = $state('');
  let pin = $state('');
  let deleteError = $state('');
  let busy = $state(false);
  let deleteConfirmOpen = $state(false);

  onMount(async () => {
    try {
      [wallet, drillVerified] = await Promise.all([
        walletService.multisigWallet(),
        walletService.multisigRecoveryDrillStatus()
      ]);
    } catch (cause) {
      deleteError = localizedError(cause, $locale, 'Could not load wallet deletion status.');
    }
  });
  onDestroy(() => {
    pin = '';
    confirmation = '';
    backup = '';
  });

  async function importBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    backup = '';
    loadedBackupName = '';
    drill = null;
    drillError = '';
    try {
      backup = await readTransferFile(file);
      loadedBackupName = file.name;
    } catch (cause) {
      drillError = localizedError(cause, $locale, 'Could not read the backup file.');
    }
  }

  async function verifyBackup() {
    if (!backup || busy) return;
    busy = true;
    drillError = '';
    try {
      drill = backup.trimStart().startsWith('BSMS 1.0')
        ? await walletService.inspectMultisigBsms(backup)
        : await walletService.recoveryDrill(backup);
      drillVerified = drill.matchesCurrentWallet;
      toast(recoveryDrillNotice(drill));
    } catch (cause) {
      drillVerified = false;
      drillError = localizedError(cause, $locale, 'Recovery test failed.');
    } finally {
      busy = false;
    }
  }

  async function removeWallet() {
    if (!wallet || !drillVerified || busy) return;
    busy = true;
    deleteError = '';
    try {
      await walletService.deleteMultisig(pin, confirmation);
      toast({
        title: 'Wallet deleted',
        description:
          'Local coordinator data was removed. Your verified descriptor backup remains recoverable.'
      });
      await goto('/settings');
    } catch (cause) {
      deleteError =
        cause instanceof WalletError && cause.code === 'invalid_credential'
          ? `That app PIN does not match ${wallet.name}.`
          : localizedError(cause, $locale, 'Could not delete the wallet.');
    } finally {
      pin = '';
      busy = false;
    }
  }
</script>

<div class="page narrow-page backup-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'WALLET DELETION')}</p>
      <h1>{translate($locale, 'Delete multisig wallet')}</h1>
      <p class="subtitle">
        {translate($locale, 'Remove this watch-only wallet from Groot on this device.')}
      </p>
    </div>
    <Button variant="secondary" href="/settings">{translate($locale, 'Back to settings')}</Button>
  </header>
  {#if wallet}
    <section class="form-card">
      <div class="section-heading compact">
        <div>
          <h2>{translate($locale, '1. Export and test recovery')}</h2>
          <p>
            {translate(
              $locale,
              'Save a public wallet backup, then prove it restores this exact wallet.'
            )}
          </p>
        </div>
        <ShieldCheck size={19} />
      </div>
      {#if drillVerified}
        <div class="drill-result passed">
          <Check size={17} /><span
            ><strong>{translate($locale, 'Recovery tested')}</strong><small
              >{translate($locale, 'The verified backup reconstructs')} {wallet.name}.</small
            >{#if drill}<code>{drill.firstAddress}</code>{/if}</span
          >
        </div>
      {:else}
        {#if drill}<div class="drill-result">
            <X size={17} /><span
              ><strong>{translate($locale, 'Backup does not match')}</strong><code
                >{drill.firstAddress}</code
              ></span
            >
          </div>{/if}
        <div class="backup-required-action">
          <span
            ><strong>{translate($locale, 'Need a backup?')}</strong><small
              >{translate($locale, 'Export the public descriptors before continuing.')}</small
            ></span
          ><Button variant="secondary" size="small" href="/multisig/backup"
            >{translate($locale, 'Export wallet backup')}</Button
          >
        </div>
        <label class="file-action" class:file-loaded={Boolean(loadedBackupName)}>
          <FileUp size={16} /><span
            ><strong
              >{translate(
                $locale,
                loadedBackupName ? 'Backup ready' : 'Load wallet backup'
              )}</strong
            >{#if loadedBackupName}<small title={loadedBackupName}>{loadedBackupName}</small
              >{/if}</span
          >
          <input
            aria-label={translate($locale, 'Deletion backup file')}
            type="file"
            accept=".bsms,.json,application/json,text/plain"
            onchange={importBackup}
          />
        </label>
        <Button
          class="full"
          disabled={!backup}
          loading={busy}
          loadingLabel={translate($locale, 'Testing recovery…')}
          onclick={verifyBackup}>{translate($locale, 'Test recovery')}</Button
        >
      {/if}
      {#if drillError}<p class="form-error" aria-live="polite">{drillError}</p>{/if}
    </section>

    <section class="form-card danger-card">
      <div class="section-heading compact">
        <div>
          <h2>{translate($locale, '2. Delete local wallet')}</h2>
          <p>
            {translate(
              $locale,
              'This removes local coordinator data only. Hardware-wallet keys are unchanged.'
            )}
          </p>
        </div>
        <Trash2 size={19} />
      </div>
      {#if !drillVerified}<div class="warning-box delete-prerequisite">
          <strong>{translate($locale, 'Recovery test required')}</strong><span
            >{translate($locale, 'Complete step 1 before deletion can be authorized.')}</span
          >
        </div>{/if}
      <label class="field"
        ><span
          >{translate($locale, 'Type')} <q>{wallet.name}</q> {translate($locale, 'exactly')}</span
        ><input
          aria-label={translate($locale, 'Wallet name confirmation')}
          bind:value={confirmation}
          autocomplete="off"
        /></label
      >
      {#if confirmation && confirmation !== wallet.name}<p class="form-error" aria-live="polite">
          {translate($locale, 'The wallet name does not match exactly.')}
        </p>{/if}
      <PasswordField
        label={translate($locale, 'App PIN')}
        inputLabel="Delete wallet app PIN"
        bind:value={pin}
        autocomplete="current-password"
      />
      <Button
        variant="danger"
        class="full"
        disabled={!drillVerified || confirmation !== wallet.name || !pin || busy}
        onclick={() => (deleteConfirmOpen = true)}
        >{translate($locale, 'Delete wallet from this device')}</Button
      >
      {#if deleteError}<p class="form-error" aria-live="polite">{deleteError}</p>{/if}
    </section>
  {:else}
    <section class="empty-state">
      <h2>{translate($locale, 'No multisig wallet selected')}</h2>
      <Button href="/settings">{translate($locale, 'Return to settings')}</Button>
    </section>
  {/if}
</div>

<Modal
  open={deleteConfirmOpen}
  title={translate($locale, 'Permanently delete this wallet?')}
  description={translate($locale, 'This cannot be undone on this device.')}
  onclose={() => (deleteConfirmOpen = false)}
>
  <div class="warning-box danger">
    <strong>{translate($locale, 'Final confirmation')}</strong>{translate(
      $locale,
      'The local wallet record, labels, and coordinator metadata\n    will be removed. Recovery requires the descriptor backup you verified.'
    )}
  </div>
  <div class="modal-footer">
    <Button variant="secondary" onclick={() => (deleteConfirmOpen = false)}
      >{translate($locale, 'Keep wallet')}</Button
    ><Button
      variant="danger"
      loading={busy}
      loadingLabel={translate($locale, 'Deleting…')}
      onclick={async () => {
        deleteConfirmOpen = false;
        await removeWallet();
      }}>{translate($locale, 'Delete permanently')}</Button
    >
  </div>
</Modal>
