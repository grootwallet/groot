<script lang="ts">
  import {
    Braces,
    Check,
    ClipboardCheck,
    Copy,
    Download,
    FileKey,
    FileText,
    FileUp,
    Printer,
    QrCode,
    ShieldCheck,
    X
  } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import { copyText } from '$lib/clipboard';
  import { formatWalletTimestamp, recoveryDrillNotice } from '$lib/backup-presentation';
  import { toast } from '$lib/stores/toasts';
  import { readTransferFile, safeTransferFilename } from '$lib/transfer';
  import { WalletError, walletService, type MultisigWallet, type RecoveryDrill } from '$lib/wallet';
  import { defaultConfig, networkName } from '$lib/config';

  let wallet = $state<MultisigWallet | null>(null);
  let pin = $state('');
  let backup = $state('');
  let drill = $state<RecoveryDrill | null>(null);
  let busy = $state(false);
  let exportError = $state('');
  let drillError = $state('');
  let backupFormat = $state<'bsms' | 'groot'>('bsms');
  let receiveQr = $state('');
  let changeQr = $state('');
  let loadedBackupName = $state('');

  onDestroy(() => {
    pin = '';
    backup = '';
  });

  $effect(() => {
    void walletService.multisigWallet().then((value) => (wallet = value));
  });
  $effect(() => {
    const current = wallet;
    receiveQr = '';
    changeQr = '';
    if (!current) return;
    void QRCode.toDataURL(current.externalDescriptor, {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'L'
    })
      .then((value) => {
        if (wallet?.externalDescriptor === current.externalDescriptor) receiveQr = value;
      })
      .catch(() => undefined);
    void QRCode.toDataURL(current.internalDescriptor, {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'L'
    })
      .then((value) => {
        if (wallet?.internalDescriptor === current.internalDescriptor) changeQr = value;
      })
      .catch(() => undefined);
  });

  const backupBaseName = $derived(safeTransferFilename(wallet?.name ?? 'groot-wallet'));

  function exportErrorMessage(cause: unknown) {
    if (cause instanceof WalletError && cause.code === 'invalid_credential')
      return `That app PIN does not match ${wallet?.name ?? 'this wallet'}.`;
    if (cause instanceof WalletError && cause.code === 'wallet_locked')
      return 'Your previous session expired. Re-enter this wallet’s app PIN to authorize the backup.';
    return cause instanceof Error ? cause.message : 'Could not prepare the public backup.';
  }

  async function exportBackup() {
    busy = true;
    exportError = '';
    try {
      backup =
        backupFormat === 'bsms'
          ? await walletService.exportMultisigBsms(pin)
          : await walletService.exportMultisig(pin);
      loadedBackupName = '';
      drill = null;
      pin = '';
      toast({ title: 'Descriptor backup ready', tone: 'success' });
    } catch (cause) {
      exportError = exportErrorMessage(cause);
      pin = '';
    } finally {
      busy = false;
    }
  }

  async function verifyBackup() {
    busy = true;
    drillError = '';
    try {
      drill = backup.trimStart().startsWith('BSMS 1.0')
        ? await walletService.inspectMultisigBsms(backup)
        : await walletService.recoveryDrill(backup);
      toast(recoveryDrillNotice(drill));
    } catch (cause) {
      drillError = cause instanceof Error ? cause.message : 'Recovery test failed.';
    } finally {
      busy = false;
    }
  }

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
      drill = null;
      drillError = '';
      toast({ title: 'Backup file ready', description: file.name, tone: 'success' });
    } catch (cause) {
      drillError = cause instanceof Error ? cause.message : 'Could not read the backup file.';
    }
  }

  async function copyDescriptor(value: string, label: string) {
    await copyText(value, 'public-wallet-data');
    toast({
      title: `${label} descriptor copied`,
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
  }

  async function saveBackupFile() {
    exportError = '';
    try {
      const saved = await walletService.savePublicBackup(
        backupFormat === 'bsms' ? `${backupBaseName}.bsms` : `${backupBaseName}-backup.json`,
        backup
      );
      if (saved.saved)
        toast({
          title: 'Backup saved',
          description: 'The public wallet backup was written to the selected file.',
          tone: 'success',
          action:
            saved.revealToken && saved.revealLabel
              ? {
                  label: saved.revealLabel,
                  run: async () => {
                    try {
                      await walletService.revealSavedFile(saved.revealToken!);
                    } catch (cause) {
                      toast({
                        title: 'Could not show saved backup',
                        description: cause instanceof Error ? cause.message : undefined,
                        tone: 'danger'
                      });
                    }
                  }
                }
              : undefined
        });
    } catch (cause) {
      exportError = cause instanceof Error ? cause.message : 'Could not save the public backup.';
      toast({ title: 'Backup not saved', description: exportError, tone: 'danger' });
    }
  }

  async function printBackup() {
    exportError = '';
    try {
      await walletService.printPublicBackup();
    } catch (cause) {
      exportError = cause instanceof Error ? cause.message : 'Could not open the print dialog.';
      toast({ title: 'Print unavailable', description: exportError, tone: 'danger' });
    }
  }
</script>

<div class="page narrow-page backup-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">WALLET BACKUP</p>
      <h1>Export & verify</h1>
      <p class="subtitle">
        A public descriptor backup reconstructs this wallet without exposing signing keys.
      </p>
    </div>
    <Button variant="secondary" href="/multisig">Back to policy</Button>
  </header>
  {#if wallet}
    <section class="form-card backup-export-card">
      <div class="section-heading compact">
        <div>
          <h2>1. Export backup</h2>
          <p>Authorize a public, watch-only copy of this wallet.</p>
        </div>
        <FileKey size={19} />
      </div>
      {#if !backup}
        <div class="backup-format-grid" role="radiogroup" aria-label="Backup format">
          <button
            class:active={backupFormat === 'bsms'}
            aria-pressed={backupFormat === 'bsms'}
            onclick={() => {
              backupFormat = 'bsms';
              exportError = '';
            }}
            ><span><FileText size={18} /></span><strong>BSMS 1.0</strong><small
              >Most interoperable · recommended</small
            ></button
          ><button
            class:active={backupFormat === 'groot'}
            aria-pressed={backupFormat === 'groot'}
            onclick={() => {
              backupFormat = 'groot';
              exportError = '';
            }}
            ><span><Braces size={18} /></span><strong>Groot JSON</strong><small
              >Descriptors plus Groot metadata</small
            ></button
          >
        </div>
        <p class="optional-insight">
          Backup formats <InsightTip
            label="About backup formats"
            text="BSMS is a portable public descriptor record supported by compatible coordinators. Groot JSON also preserves Groot-specific labels and metadata. Neither contains private keys."
          />
        </p>
        <div class="backup-security-note">
          <ShieldCheck size={18} /><span
            ><strong>Re-authenticate this export</strong><small
              >Use {wallet.name}’s app PIN. This protects access to private financial metadata even
              while the wallet screen is open. The exported descriptor is not encrypted: it cannot
              spend, but it reveals addresses and should remain private.</small
            ></span
          >
        </div>
        <div class="backup-auth">
          <PasswordField
            label="App PIN"
            inputLabel="Backup app PIN"
            bind:value={pin}
            placeholder="Enter this wallet’s app PIN"
            autocomplete="current-password"
          /><Button
            class="full"
            size="large"
            disabled={!pin}
            loading={busy}
            loadingLabel="Authorizing…"
            onclick={exportBackup}>Authorize & prepare backup</Button
          >
        </div>
        {#if exportError}<p class="form-error" aria-live="polite">{exportError}</p>{/if}
      {:else}
        <div class="backup-ready">
          <span><Check size={17} /></span>
          <div>
            <strong>Public backup ready</strong><small
              >{backupFormat === 'bsms'
                ? 'BSMS 1.0 descriptor record'
                : 'Groot recovery metadata'}</small
            >
          </div>
        </div>
        <details class="backup-raw">
          <summary>View raw backup</summary><textarea
            aria-label="Descriptor backup"
            rows="9"
            readonly
            value={backup}></textarea>
        </details>
        <div class="backup-actions">
          <Button
            variant="secondary"
            onclick={async () => {
              await copyText(backup, 'public-wallet-data');
              toast({ title: 'Backup copied', tone: 'success' });
            }}><Copy size={15} />Copy backup</Button
          ><Button variant="secondary" onclick={saveBackupFile}
            ><Download size={15} />Download {backupFormat === 'bsms' ? 'BSMS' : 'JSON'}</Button
          ><Button variant="secondary" onclick={printBackup}
            ><Printer size={15} />Print / save PDF</Button
          >
        </div>
        {#if exportError}<p class="form-error" aria-live="polite">{exportError}</p>{/if}
        <div class="descriptor-qr-preview">
          <div>
            <span><QrCode size={16} /><strong>Receive descriptor QR</strong></span
            >{#if receiveQr}<img
                src={receiveQr}
                alt="QR code for the receive descriptor"
              />{:else}<small
                >QR unavailable for this descriptor size. Use the downloaded file.</small
              >{/if}
          </div>
          <div class="descriptor-copy-row">
            <code>{wallet.externalDescriptor}</code><button
              aria-label="Copy receive descriptor"
              onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}
              ><Copy size={15} /></button
            >
          </div>
        </div>
      {/if}
    </section>
    <section class="form-card">
      <div class="section-heading compact">
        <div>
          <h2>
            2. Test recovery <InsightTip
              label="What does this test do?"
              text="Groot safely imports the watch-only backup in memory and proves it derives the same first address. It never signs or moves bitcoin."
            />
          </h2>
          <p>Confirm this backup reconstructs the same wallet before relying on it.</p>
        </div>
        <ClipboardCheck size={19} />
      </div>
      {#if drill}<div class="drill-result" class:passed={drill.matchesCurrentWallet}>
          {#if drill.matchesCurrentWallet}<Check size={17} />{:else}<X size={17} />{/if}<span
            ><strong
              >{drill.matchesCurrentWallet ? 'Backup verified' : 'Backup does not match'}</strong
            ><code>{drill.firstAddress}</code></span
          >
        </div>{/if}
      <label class="file-action" class:file-loaded={Boolean(loadedBackupName)}>
        <FileUp size={16} />
        <span>
          <strong>{loadedBackupName ? 'Backup ready' : 'Load backup file'}</strong>
          {#if loadedBackupName}<small title={loadedBackupName}>{loadedBackupName}</small>{/if}
        </span>
        <input
          aria-label="Backup file import"
          type="file"
          accept=".bsms,.json,application/json,text/plain"
          onchange={importBackup}
        />
      </label>
      <Button
        class="full"
        disabled={!backup}
        loading={busy}
        loadingLabel="Testing recovery…"
        onclick={verifyBackup}>Test recovery</Button
      >
      {#if drillError}<p class="form-error" aria-live="polite">{drillError}</p>{/if}
    </section>
    {#if drill?.matchesCurrentWallet}<section class="form-card">
        <div class="section-heading compact">
          <div>
            <h2>Recovery confirmed</h2>
            <p>
              This successful drill is available to the separate wallet-deletion flow for this app
              session.
            </p>
          </div>
          <ShieldCheck size={19} />
        </div>
        <Button variant="danger-outline" class="full" href="/multisig/delete"
          >Continue to wallet deletion</Button
        >
      </section>{/if}
    {#if backup}<article class="backup-print-sheet" aria-label="Printable wallet descriptor backup">
        <header>
          <p>Groot · Public wallet backup</p>
          <h1>{wallet.name}</h1>
          <strong>Watch-only descriptors — cannot spend bitcoin</strong>
        </header>
        <dl>
          <div>
            <dt>Network</dt>
            <dd>{networkName(defaultConfig.network)}</dd>
          </div>
          <div>
            <dt>Policy</dt>
            <dd>{wallet.threshold} of {wallet.cosigners.length} signatures</dd>
          </div>
          <div>
            <dt>Script</dt>
            <dd>Native SegWit · sortedmulti</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatWalletTimestamp(wallet.createdAt)}</dd>
          </div>
        </dl>
        <section>
          <h2>Signers</h2>
          <ol>
            {#each wallet.cosigners as signer}<li>
                <strong>{signer.label}</strong><span
                  >Fingerprint {signer.fingerprint.toLowerCase()} · {signer.source === 'usb'
                    ? 'USB hardware'
                    : signer.source}</span
                >
              </li>{/each}
          </ol>
        </section>
        <section class="print-descriptors">
          <div>
            <h2>Receive descriptor</h2>
            {#if receiveQr}<img src={receiveQr} alt="Receive descriptor QR code" />{/if}<code
              >{wallet.externalDescriptor}</code
            >
          </div>
          <div>
            <h2>Change descriptor</h2>
            {#if changeQr}<img src={changeQr} alt="Change descriptor QR code" />{/if}<code
              >{wallet.internalDescriptor}</code
            >
          </div>
        </section>
        <footer>
          <strong>Privacy note</strong>
          <p>
            This public backup cannot sign transactions. Anyone who sees it can derive wallet
            addresses and observe wallet activity. Store it privately and separately from enough
            signing devices.
          </p>
        </footer>
      </article>{/if}
  {:else}<section class="empty-state">
      <h2>No multisig wallet selected</h2>
      <Button href="/multisig">Return to wallet</Button>
    </section>{/if}
</div>
