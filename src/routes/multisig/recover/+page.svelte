<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { Check, FileUp } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import TransferFilePicker from '$lib/components/TransferFilePicker.svelte';
  import { toast } from '$lib/stores/toasts';
  import { readTransferFile } from '$lib/transfer';
  import { walletService, type RecoveryDrill } from '$lib/wallet';
  let backup = $state(''),
    loadedBackupName = $state(''),
    walletName = $state('Recovered wallet'),
    pin = $state(''),
    confirmation = $state(''),
    drill = $state<RecoveryDrill | null>(null),
    verified = $state(false),
    busy = $state(false),
    error = $state('');
  function isPublicDescriptorBackup() {
    return !backup.trimStart().startsWith('{');
  }
  async function inspect() {
    busy = true;
    error = '';
    drill = null;
    verified = false;
    try {
      drill = isPublicDescriptorBackup()
        ? await walletService.inspectMultisigBsms(backup)
        : await walletService.recoveryDrill(backup);
    } catch (cause) {
      error = localizedError(cause, $locale, 'Invalid backup.');
    } finally {
      busy = false;
    }
  }
  function backupChanged() {
    loadedBackupName = '';
    drill = null;
    verified = false;
    error = '';
  }
  async function loadBackupFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    backup = '';
    loadedBackupName = '';
    drill = null;
    verified = false;
    error = '';
    try {
      backup = await readTransferFile(file);
      loadedBackupName = file.name;
      toast({ title: 'Backup file ready', description: file.name, tone: 'success' });
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not read the backup file.');
      toast({ title: 'Could not read backup', description: error, tone: 'danger' });
    }
  }
  onDestroy(() => {
    pin = '';
    confirmation = '';
  });
  async function recover() {
    if (!drill || !verified || pin !== confirmation) return;
    busy = true;
    error = '';
    try {
      if (isPublicDescriptorBackup())
        await walletService.recoverMultisigBsms(walletName, backup, pin);
      else await walletService.recoverMultisig(backup, pin);
      toast({
        title: 'Wallet recovered',
        description: 'Descriptors were restored. Run a full rescan before relying on the balance.',
        tone: 'success'
      });
      await goto('/multisig');
    } catch (cause) {
      error = localizedError(cause, $locale, 'Recovery failed.');
    } finally {
      pin = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<div class="page narrow-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'DESCRIPTOR RECOVERY')}</p>
      <h1>{translate($locale, 'Recover multisig wallet')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'Validate BSMS or public descriptor text, or restore complete Groot recovery metadata.'
        )}
      </p>
    </div>
    <Button variant="secondary" href="/settings">{translate($locale, 'Cancel')}</Button>
  </header>
  <section class="form-card recovery-form">
    <TransferFilePicker
      ariaLabel="Choose recovery backup file"
      accept=".bsms,.json,.txt,application/json,text/plain"
      title={translate($locale, loadedBackupName ? 'Backup file ready' : 'Choose backup file')}
      description={translate(
        $locale,
        loadedBackupName || 'BSMS, descriptor text, or Groot JSON · up to 256 KiB'
      )}
      loaded={Boolean(loadedBackupName)}
      onchange={loadBackupFile}
    />
    <div class="input-alternative" aria-hidden="true">
      <span>{translate($locale, 'Paste instead')}</span>
    </div>
    <label class="field"
      ><span>{translate($locale, 'Descriptor backup')}</span><textarea
        aria-label={translate($locale, 'Recovery descriptor backup')}
        rows="10"
        bind:value={backup}
        oninput={backupChanged}
        placeholder={translate($locale, 'Paste BSMS, public descriptor text, or Groot JSON')}
      ></textarea></label
    ><Button
      variant="secondary"
      class="full"
      disabled={!backup.trim()}
      loading={busy}
      loadingLabel={translate($locale, 'Validating backup…')}
      onclick={inspect}><FileUp size={15} />{translate($locale, 'Validate backup')}</Button
    >
    {#if drill}<div class="drill-result passed">
        <Check size={17} /><span
          ><strong>{translate($locale, 'Backup is valid')}</strong><small
            >{translate(
              $locale,
              'Verify this first receive address against your offline record.'
            )}</small
          ><code>{drill.firstAddress}</code></span
        >
      </div>
      <label class="check-row"
        ><input
          aria-label={translate($locale, 'I verified the first receive address')}
          type="checkbox"
          bind:checked={verified}
        /><span
          ><strong>{translate($locale, 'I verified the first receive address')}</strong><small
            >{translate(
              $locale,
              'A mismatch means this is not the wallet you intended to recover.'
            )}</small
          ></span
        ></label
      >{#if isPublicDescriptorBackup()}<label class="field"
          ><span>{translate($locale, 'Wallet name')}</span><input
            aria-label={translate($locale, 'Recovered wallet name')}
            bind:value={walletName}
            maxlength="48"
          /><FieldCounter value={walletName} max={48} /></label
        >
        <p class="field-hint">
          {translate(
            $locale,
            'Public descriptor files do not include private labels. Signers will be named Signer 1,\n          Signer 2, and so on.'
          )}
        </p>{/if}
      <div class="credential-grid">
        <PasswordField
          label={translate($locale, 'New app PIN')}
          inputLabel="New wallet app PIN"
          bind:value={pin}
          autocomplete="new-password"
        /><PasswordField
          label={translate($locale, 'Confirm app PIN')}
          inputLabel="Confirm new wallet app PIN"
          bind:value={confirmation}
          autocomplete="new-password"
        />
      </div>
      {#if pin && confirmation && pin !== confirmation}<p class="form-error">
          {translate($locale, 'PINs do not match.')}
        </p>{/if}<Button
        class="full"
        disabled={!verified || !walletName.trim() || !pin || pin !== confirmation}
        loading={busy}
        loadingLabel={translate($locale, 'Recovering wallet…')}
        onclick={recover}>{translate($locale, 'Recover wallet')}</Button
      >{/if}
    {#if error}<p class="form-error" aria-live="polite">{error}</p>{/if}
  </section>
</div>

<style>
  .recovery-form {
    display: grid;
    gap: 18px;
  }
  .recovery-form .field {
    margin: 0;
  }

  .input-alternative {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    color: var(--muted);
  }

  .input-alternative::before,
  .input-alternative::after {
    height: 1px;
    background: var(--border);
    content: '';
  }

  .input-alternative span {
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
