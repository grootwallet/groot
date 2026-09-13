<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
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
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import { copyText } from '$lib/clipboard';
  import { formatWalletTimestamp, recoveryDrillNotice } from '$lib/backup-presentation';
  import { createPrintableQr, type PrintableQr } from '$lib/printable-qr';
  import { toast } from '$lib/stores/toasts';
  import { readTransferFile, safeTransferFilename } from '$lib/transfer';
  import {
    WalletError,
    walletService,
    type MultisigWallet,
    type RecoveryDrill,
    type SavedFileResult
  } from '$lib/wallet';
  import { defaultConfig, networkName } from '$lib/config';
  import { walletPolicyPresentation } from '$lib/wallet/policy';

  let wallet = $state<MultisigWallet | null>(null);
  let pin = $state('');
  let backup = $state('');
  let drill = $state<RecoveryDrill | null>(null);
  let busy = $state(false);
  let exportError = $state('');
  let drillError = $state('');
  let backupFormat = $state<'bsms' | 'groot'>('bsms');
  let exportedBackups = $state<{ bsms: string; groot: string } | null>(null);
  let showReceiveQr = $state(false);
  let receiveQr = $state('');
  let changeQr = $state('');
  let receivePrintQr = $state<PrintableQr | null>(null);
  let changePrintQr = $state<PrintableQr | null>(null);
  let loadedBackupName = $state('');
  const policyPresentation = $derived(wallet ? walletPolicyPresentation(wallet) : null);

  onDestroy(() => {
    pin = '';
    backup = '';
    exportedBackups = null;
  });

  $effect(() => {
    void walletService.multisigWallet().then((value) => (wallet = value));
  });
  $effect(() => {
    const current = wallet;
    receiveQr = '';
    changeQr = '';
    receivePrintQr = null;
    changePrintQr = null;
    if (!current) return;
    receivePrintQr = createPrintableQr(current.externalDescriptor);
    changePrintQr = createPrintableQr(current.internalDescriptor);
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
    return localizedError(cause, $locale, 'Could not prepare the public backup.');
  }

  async function exportBackup() {
    if (busy) return;
    busy = true;
    exportError = '';
    const credential = pin;
    pin = '';
    try {
      const bsms = await walletService.exportMultisigBsms(credential);
      const groot = await walletService.exportMultisig(credential);
      exportedBackups = { bsms, groot };
      backup = exportedBackups[backupFormat];
      loadedBackupName = '';
      drill = null;
      toast({ title: 'Descriptor backup ready', tone: 'success' });
    } catch (cause) {
      exportError = exportErrorMessage(cause);
    } finally {
      busy = false;
    }
  }

  function selectBackupFormat(format: 'bsms' | 'groot') {
    if (busy) return;
    backupFormat = format;
    exportError = '';
    if (!exportedBackups) return;
    backup = exportedBackups[format];
    loadedBackupName = '';
    drill = null;
    drillError = '';
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
      drillError = localizedError(cause, $locale, 'Recovery test failed.');
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
      drillError = localizedError(cause, $locale, 'Could not read the backup file.');
    }
  }

  async function copyDescriptor(value: string, label: string) {
    await copyText(value, 'public-wallet-data');
    toast({
      title: translate($locale, '{label} descriptor copied', { label: translate($locale, label) }),
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
  }

  function savedFileAction(saved: SavedFileResult) {
    if (!saved.revealToken || !saved.revealLabel) return undefined;
    return {
      label: saved.revealLabel,
      run: async () => {
        try {
          await walletService.revealSavedFile(saved.revealToken!);
        } catch (cause) {
          toast({
            title: 'Could not show saved file',
            description: localizedError(cause, $locale),
            tone: 'danger'
          });
        }
      }
    };
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
          action: savedFileAction(saved)
        });
    } catch (cause) {
      exportError = localizedError(cause, $locale, 'Could not save the public backup.');
      toast({ title: 'Backup not saved', description: exportError, tone: 'danger' });
    }
  }

  async function printBackup() {
    exportError = '';
    try {
      const pending = await walletService.preparePublicBackupPdf(`${backupBaseName}-backup.pdf`);
      if (!pending.prepared || !pending.saveToken) return;
      const sheet = document.querySelector<HTMLElement>('.backup-print-sheet');
      if (!sheet) throw new Error('The PDF backup is not ready.');
      const saved = await walletService.savePublicBackupPdf(pending.saveToken, sheet.outerHTML);
      if (saved.saved)
        toast({
          title: 'PDF saved',
          description: 'The public wallet backup was saved.',
          tone: 'success',
          action: savedFileAction(saved)
        });
    } catch (cause) {
      exportError = localizedError(cause, $locale, 'Could not save the PDF backup.');
      toast({ title: 'PDF not saved', description: exportError, tone: 'danger' });
    }
  }
</script>

<div class="page narrow-page backup-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'WALLET BACKUP')}</p>
      <h1>{translate($locale, 'Export & verify')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'A public descriptor backup reconstructs this wallet without exposing signing keys.'
        )}
      </p>
    </div>
    <Button variant="secondary" href="/multisig">{translate($locale, 'Back to policy')}</Button>
  </header>
  {#if wallet}
    <section class="form-card backup-export-card">
      <div class="section-heading compact">
        <div>
          <h2>{translate($locale, '1. Export backup')}</h2>
          <p>{translate($locale, 'Authorize a public, watch-only copy of this wallet.')}</p>
        </div>
        <FileKey size={19} />
      </div>
      <div
        class="backup-format-grid"
        role="radiogroup"
        aria-label={translate($locale, 'Backup format')}
      >
        <button
          class:active={backupFormat === 'bsms'}
          aria-pressed={backupFormat === 'bsms'}
          disabled={busy}
          onclick={() => selectBackupFormat('bsms')}
          ><span><FileText size={18} /></span><strong>BSMS 1.0</strong><small
            >{translate($locale, 'Most interoperable · recommended')}</small
          ></button
        ><button
          class:active={backupFormat === 'groot'}
          aria-pressed={backupFormat === 'groot'}
          disabled={busy}
          onclick={() => selectBackupFormat('groot')}
          ><span><Braces size={18} /></span><strong>{translate($locale, 'Groot JSON')}</strong
          ><small>{translate($locale, 'Descriptors plus Groot metadata')}</small></button
        >
      </div>
      <p class="optional-insight">
        {translate($locale, 'Backup formats')}
        <InsightTip
          label={translate($locale, 'About backup formats')}
          text={translate(
            $locale,
            'BSMS is a portable public descriptor record supported by compatible coordinators. Groot JSON also preserves Groot-specific labels and metadata. Neither contains private keys.'
          )}
        />
      </p>
      {#if !backup}
        <div class="backup-security-note">
          <ShieldCheck size={18} /><span
            ><strong>{translate($locale, 'Re-authenticate this export')}</strong><small
              >{translate($locale, 'Use')}
              {wallet.name}{translate(
                $locale,
                '’s app PIN. This protects access to private financial metadata even\n              while the wallet screen is open. The exported descriptor is not encrypted: it cannot\n              spend, but it reveals addresses and should remain private.'
              )}</small
            ></span
          >
        </div>
        <div class="backup-auth">
          <PasswordField
            label={translate($locale, 'App PIN')}
            inputLabel="Backup app PIN"
            bind:value={pin}
            placeholder={translate($locale, 'Enter this wallet’s app PIN')}
            autocomplete="current-password"
          /><Button
            class="full"
            size="large"
            disabled={!pin}
            loading={busy}
            loadingLabel={translate($locale, 'Authorizing…')}
            onclick={exportBackup}>{translate($locale, 'Authorize & prepare backup')}</Button
          >
        </div>
        {#if exportError}<p class="form-error" aria-live="polite">{exportError}</p>{/if}
      {:else}
        <div class="backup-ready">
          <span><Check size={17} /></span>
          <div>
            <strong>{translate($locale, 'Public backup ready')}</strong><small
              >{translate(
                $locale,
                backupFormat === 'bsms' ? 'BSMS 1.0 descriptor record' : 'Groot recovery metadata'
              )}</small
            >
          </div>
        </div>
        <details class="backup-raw">
          <summary>{translate($locale, 'View raw backup')}</summary><textarea
            aria-label={translate($locale, 'Descriptor backup')}
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
            }}><Copy size={15} />{translate($locale, 'Copy backup')}</Button
          ><Button variant="secondary" onclick={saveBackupFile}
            ><Download size={15} />{translate($locale, 'Download')}
            {translate($locale, backupFormat === 'bsms' ? 'BSMS' : 'JSON')}</Button
          ><Button variant="secondary" onclick={printBackup}
            ><Printer size={15} />{translate($locale, 'Save PDF')}</Button
          >
        </div>
        {#if exportError}<p class="form-error" aria-live="polite">{exportError}</p>{/if}
        <div class="descriptor-qr-preview">
          <div>
            <span
              ><QrCode size={16} /><strong>{translate($locale, 'Receive descriptor QR')}</strong
              ></span
            >{#if receiveQr}<button
                class="descriptor-qr-trigger"
                aria-label={translate($locale, 'Enlarge receive descriptor QR')}
                onclick={() => (showReceiveQr = true)}
                ><img
                  src={receiveQr}
                  alt={translate($locale, 'QR code for the receive descriptor')}
                /></button
              >{:else}<small
                >{translate(
                  $locale,
                  'QR unavailable for this descriptor size. Use the downloaded file.'
                )}</small
              >{/if}
          </div>
          <div class="descriptor-copy-row">
            <code>{wallet.externalDescriptor}</code><button
              aria-label={translate($locale, 'Copy receive descriptor')}
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
            {translate($locale, '2. Test recovery')}
            <InsightTip
              label={translate($locale, 'What does this test do?')}
              text={translate(
                $locale,
                'Groot safely imports the watch-only backup in memory and proves it derives the same first address. It never signs or moves bitcoin.'
              )}
            />
          </h2>
          <p>
            {translate(
              $locale,
              'Confirm this backup reconstructs the same wallet before relying on it.'
            )}
          </p>
        </div>
        <ClipboardCheck size={19} />
      </div>
      {#if drill}<div class="drill-result" class:passed={drill.matchesCurrentWallet}>
          {#if drill.matchesCurrentWallet}<Check size={17} />{:else}<X size={17} />{/if}<span
            ><strong
              >{translate(
                $locale,
                drill.matchesCurrentWallet ? 'Backup verified' : 'Backup does not match'
              )}</strong
            ><code>{drill.firstAddress}</code></span
          >
        </div>{/if}
      <label class="file-action" class:file-loaded={Boolean(loadedBackupName)}>
        <FileUp size={16} />
        <span>
          <strong
            >{translate($locale, loadedBackupName ? 'Backup ready' : 'Load backup file')}</strong
          >
          {#if loadedBackupName}<small title={loadedBackupName}>{loadedBackupName}</small>{/if}
        </span>
        <input
          aria-label={translate($locale, 'Backup file import')}
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
      {#if drillError}<p class="form-error" aria-live="polite">{drillError}</p>{/if}
    </section>
    {#if drill?.matchesCurrentWallet}<section class="form-card">
        <div class="section-heading compact">
          <div>
            <h2>{translate($locale, 'Recovery confirmed')}</h2>
            <p>
              {translate(
                $locale,
                'This successful drill is available to the separate wallet-deletion flow for this app\n              session.'
              )}
            </p>
          </div>
          <ShieldCheck size={19} />
        </div>
        <Button variant="danger-outline" class="full" href="/multisig/delete"
          >{translate($locale, 'Continue to wallet deletion')}</Button
        >
      </section>{/if}
    {#if backup}<article
        class="backup-print-sheet"
        aria-label={translate($locale, 'Printable wallet descriptor backup')}
        aria-hidden="true"
        inert
      >
        <header>
          <p>{translate($locale, 'Groot · Public wallet backup')}</p>
          <h1>{wallet.name}</h1>
          <strong>{translate($locale, 'Watch-only descriptors — cannot spend bitcoin')}</strong>
        </header>
        <dl>
          <div>
            <dt>{translate($locale, 'Network')}</dt>
            <dd>{networkName(defaultConfig.network)}</dd>
          </div>
          <div>
            <dt>{translate($locale, 'Policy')}</dt>
            <dd>
              {policyPresentation?.summary}
            </dd>
          </div>
          <div>
            <dt>{translate($locale, 'Script')}</dt>
            <dd>
              {translate(
                $locale,
                policyPresentation?.delayed
                  ? 'Native SegWit · Miniscript'
                  : 'Native SegWit · sortedmulti'
              )}
            </dd>
          </div>
          <div>
            <dt>{translate($locale, 'Created')}</dt>
            <dd>{formatWalletTimestamp(wallet.createdAt)}</dd>
          </div>
        </dl>
        <section>
          <h2>{translate($locale, 'Signers')}</h2>
          <ol>
            {#each wallet.cosigners as signer}<li>
                <strong>{signer.label}</strong><span
                  >{translate($locale, 'Fingerprint')}
                  {signer.fingerprint.toLowerCase()} · {translate(
                    $locale,
                    signer.source === 'usb' ? 'USB hardware' : signer.source
                  )}</span
                >
              </li>{/each}
          </ol>
        </section>
        <section class="print-descriptors">
          <div>
            <h2>{translate($locale, 'Receive descriptor')}</h2>
            {#if receivePrintQr}<svg
                class="print-qr"
                viewBox={`0 0 ${receivePrintQr.size} ${receivePrintQr.size}`}
                shape-rendering="crispEdges"
                aria-label={translate($locale, 'Receive descriptor QR code')}
                role="img"><path d={receivePrintQr.path} /></svg
              >{/if}<code>{wallet.externalDescriptor}</code>
          </div>
          <div>
            <h2>{translate($locale, 'Change descriptor')}</h2>
            {#if changePrintQr}<svg
                class="print-qr"
                viewBox={`0 0 ${changePrintQr.size} ${changePrintQr.size}`}
                shape-rendering="crispEdges"
                aria-label={translate($locale, 'Change descriptor QR code')}
                role="img"><path d={changePrintQr.path} /></svg
              >{/if}<code>{wallet.internalDescriptor}</code>
          </div>
        </section>
        <footer>
          <strong>{translate($locale, 'Privacy note')}</strong>
          <p>
            {translate(
              $locale,
              'This public backup cannot sign transactions. Anyone who sees it can derive wallet\n            addresses and observe wallet activity. Store it privately and separately from enough\n            signing devices.'
            )}
          </p>
        </footer>
      </article>{/if}
  {:else}<section class="empty-state">
      <h2>{translate($locale, 'No multisig wallet selected')}</h2>
      <Button href="/multisig">{translate($locale, 'Return to wallet')}</Button>
    </section>{/if}
</div>

<Modal
  open={showReceiveQr && Boolean(receiveQr)}
  title={translate($locale, 'Receive descriptor QR')}
  description={translate(
    $locale,
    'Public watch-only descriptor. Anyone who sees it can follow this wallet’s addresses.'
  )}
  onclose={() => (showReceiveQr = false)}
  >{#if receiveQr}<div class="large-qr descriptor-qr-modal">
      <img src={receiveQr} alt={translate($locale, 'Large QR code for the receive descriptor')} />
      <Button
        variant="secondary"
        onclick={() => wallet && copyDescriptor(wallet.externalDescriptor, 'Receive')}
        ><Copy size={15} />{translate($locale, 'Copy receive descriptor')}</Button
      >
    </div>{/if}</Modal
>
