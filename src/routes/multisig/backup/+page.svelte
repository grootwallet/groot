<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    Braces,
    Check,
    ChevronRight,
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
  import { onDestroy, onMount } from 'svelte';
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
  import { combineDescriptorBranches } from '$lib/descriptors';
  import { walletPolicyPresentation } from '$lib/wallet/policy';

  let wallet = $state<MultisigWallet | null>(null);
  let pin = $state('');
  let backup = $state('');
  let copiedPublicValue = $state('');
  let drill = $state<RecoveryDrill | null>(null);
  let busy = $state(false);
  let exportError = $state('');
  let drillError = $state('');
  let backupFormat = $state<'bsms' | 'groot'>('bsms');
  let exportedBackups = $state<{ bsms: string; groot: string } | null>(null);
  let showReceiveQr = $state(false);
  let receiveQr = $state('');
  let receivePrintQr = $state<PrintableQr | null>(null);
  let loadedBackupName = $state('');
  let mobileRuntime = $state(false);
  const policyPresentation = $derived(wallet ? walletPolicyPresentation(wallet) : null);

  const combinedDescriptor = $derived(
    wallet ? combineDescriptorBranches(wallet.externalDescriptor, wallet.internalDescriptor) : null
  );
  onDestroy(() => {
    pin = '';
    backup = '';
    exportedBackups = null;
  });
  onMount(() => {
    void walletService.runtimePlatform().then((runtime) => (mobileRuntime = runtime.mobile));
  });

  $effect(() => {
    void walletService.multisigWallet().then((value) => (wallet = value));
  });
  $effect(() => {
    const descriptor = combinedDescriptor;
    receiveQr = '';
    receivePrintQr = null;
    if (!descriptor) return;
    receivePrintQr = createPrintableQr(descriptor);
    void QRCode.toDataURL(descriptor, { width: 520, margin: 2, errorCorrectionLevel: 'L' })
      .then((value) => {
        if (combinedDescriptor === descriptor) receiveQr = value;
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
    copiedPublicValue = value;
    toast({
      title: translate($locale, '{label} descriptor copied', { label: translate($locale, label) }),
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
    setTimeout(() => {
      if (copiedPublicValue === value) copiedPublicValue = '';
    }, 1_500);
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
      <h1>{translate($locale, 'Export & verify')}</h1>
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
      <details class="optional-insight-disclosure">
        <summary
          >{translate($locale, 'About backup formats')}<ChevronRight
            size={14}
            aria-hidden="true"
          /></summary
        >
        <p>
          {translate(
            $locale,
            'BSMS is a portable public descriptor record supported by compatible coordinators. Groot JSON also preserves Groot-specific labels and metadata. Neither contains private keys.'
          )}
        </p>
      </details>
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
      {#if !backup}
        <div class="backup-security-note">
          <ShieldCheck size={18} /><span
            ><strong>{translate($locale, 'Re-authenticate this export')}</strong><small
              >{translate(
                $locale,
                backupFormat === 'bsms'
                  ? 'BSMS is an unencrypted public descriptor: it cannot spend, but reveals wallet addresses. Enter the app PIN and keep the export private.'
                  : 'Groot JSON includes public descriptors and wallet metadata. It cannot spend, but reveals wallet activity. Enter the app PIN and keep the export private.'
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
        {#if exportError}<WarningNotice
            tone="danger"
            icon
            role="alert"
            ariaLive="polite"
            body={exportError}
          />{/if}
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
              copiedPublicValue = backup;
              toast({ title: 'Backup copied', tone: 'success' });
              setTimeout(() => {
                if (copiedPublicValue === backup) copiedPublicValue = '';
              }, 1_500);
            }}
            >{#if copiedPublicValue === backup}<Check size={15} />{:else}<Copy
                size={15}
              />{/if}{translate($locale, 'Copy backup')}</Button
          ><Button variant="secondary" onclick={saveBackupFile}
            ><Download size={15} />{translate($locale, 'Download')}
            {translate($locale, backupFormat === 'bsms' ? 'BSMS' : 'JSON')}</Button
          >{#if !mobileRuntime}<Button variant="secondary" onclick={printBackup}
              ><Printer size={15} />{translate($locale, 'Save PDF')}</Button
            >{/if}
        </div>
        {#if exportError}<WarningNotice
            tone="danger"
            icon
            role="alert"
            ariaLive="polite"
            body={exportError}
          />{/if}
        <div class="descriptor-qr-preview">
          <div>
            <span
              ><QrCode size={16} /><strong>{translate($locale, 'Wallet descriptor QR')}</strong
              ></span
            >{#if receiveQr}<button
                class="descriptor-qr-trigger"
                aria-label={translate($locale, 'Enlarge wallet descriptor QR')}
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
            <code>{combinedDescriptor ?? ''}</code><button
              aria-label={translate($locale, 'Copy wallet descriptor')}
              onclick={() => copyDescriptor(combinedDescriptor ?? '', 'Receive')}
              >{#if copiedPublicValue === combinedDescriptor}<Check size={15} />{:else}<Copy
                  size={15}
                />{/if}</button
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
      <p class="field-help">
        {translate($locale, 'Use a BSMS or JSON backup. PDF cannot be imported or tested.')}
      </p>
      <Button
        class="full"
        disabled={!backup}
        loading={busy}
        loadingLabel={translate($locale, 'Testing recovery…')}
        onclick={verifyBackup}>{translate($locale, 'Test recovery')}</Button
      >
      {#if drillError}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={drillError}
        />{/if}
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
          <strong>{translate($locale, 'Watch-only descriptors. Cannot spend bitcoin')}</strong>
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
            <h2>{translate($locale, 'Wallet descriptor')}</h2>
            {#if receivePrintQr}<svg
                class="print-qr"
                viewBox={`0 0 ${receivePrintQr.size} ${receivePrintQr.size}`}
                shape-rendering="crispEdges"
                aria-label={translate($locale, 'Wallet descriptor QR code')}
                role="img"><path d={receivePrintQr.path} /></svg
              >{/if}<code>{combinedDescriptor ?? ''}</code>
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
  title={translate($locale, 'Wallet descriptor QR')}
  description={translate(
    $locale,
    'Public watch-only descriptor. Anyone who sees it can follow this wallet’s addresses.'
  )}
  onclose={() => (showReceiveQr = false)}
  >{#if receiveQr}<div class="large-qr descriptor-qr-modal">
      <img src={receiveQr} alt={translate($locale, 'Large QR code for the wallet descriptor')} />
      <Button
        variant="secondary"
        onclick={() => wallet && copyDescriptor(combinedDescriptor ?? '', 'Receive')}
        >{#if copiedPublicValue === combinedDescriptor}<Check size={15} />{:else}<Copy
            size={15}
          />{/if}{translate($locale, 'Copy wallet descriptor')}</Button
      >
    </div>{/if}</Modal
>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.optional-insight-disclosure):where(.optional-insight-disclosure) {
    margin: 12px 0;
  }
  :global(.optional-insight-disclosure):where(.optional-insight-disclosure) > :global(summary) {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--link);
    font-size: var(--font-size-meta);
    font-weight: 700;
    list-style: none;
  }
  :global(.optional-insight-disclosure):where(.optional-insight-disclosure)
    > :global(summary::-webkit-details-marker) {
    display: none;
  }
  :global(.optional-insight-disclosure):where(.optional-insight-disclosure) > :global(summary svg) {
    transition: transform 140ms ease;
  }
  :global(.optional-insight-disclosure[open]):where(.optional-insight-disclosure)
    > :global(summary svg) {
    transform: rotate(90deg);
  }
  :global(.optional-insight-disclosure):where(.optional-insight-disclosure) > :global(p) {
    max-width: 62ch;
    margin: 8px 0 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.backup-export-card):where(.backup-export-card) > :global(.optional-insight-disclosure) {
    margin: 16px 0 10px;
  }
  :global(.backup-format-grid):where(.backup-format-grid) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin-bottom: 16px;
  }
  :global(.backup-format-grid):where(.backup-format-grid) :global(button) {
    min-height: 92px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 11px;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--text);
    background: var(--surface-control);
    text-align: left;
    cursor: pointer;
  }
  :global(.backup-format-grid):where(.backup-format-grid) :global(button > span) {
    grid-row: 1 / 3;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
  }
  :global(.backup-format-grid):where(.backup-format-grid) :global(button strong) {
    align-self: end;
    font-size: var(--font-size-meta);
  }
  :global(.backup-format-grid):where(.backup-format-grid) :global(button small) {
    align-self: start;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }
  :global(.backup-format-grid):where(.backup-format-grid) :global(button.active) {
    border-color: color-mix(in srgb, var(--link) 60%, transparent);
    background: color-mix(in srgb, var(--link) 8%, transparent);
    box-shadow: inset 3px 0 0 var(--fr-blue);
  }
  :global(.backup-format-grid):where(.backup-format-grid) :global(button.active > span) {
    color: var(--link);
    background: color-mix(in srgb, var(--link) 12%, transparent);
  }
  :global(.backup-security-note):where(.backup-security-note) {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 11px;
    padding: 13px;
    margin-bottom: 16px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
    border-radius: var(--radius-control);
    background: var(--accent-soft);
  }
  :global(.backup-security-note):where(.backup-security-note) > :global(svg) {
    color: var(--accent);
  }
  :global(.backup-security-note):where(.backup-security-note) :global(span) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  :global(.backup-security-note):where(.backup-security-note) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.backup-security-note):where(.backup-security-note) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.backup-auth):where(.backup-auth) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 210px;
    align-items: end;
    gap: 10px;
  }
  :global(.backup-auth):where(.backup-auth) :global(.field) {
    margin: 0;
  }
  :global(.backup-ready):where(.backup-ready) {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 13px;
    margin-bottom: 14px;
    border: 1px solid color-mix(in srgb, var(--success) 22%, transparent);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--success) 6%, transparent);
  }
  :global(.backup-ready):where(.backup-ready) > :global(span) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--success);
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }
  :global(.backup-ready):where(.backup-ready) :global(div) {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.backup-ready):where(.backup-ready) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.backup-ready):where(.backup-ready) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.backup-raw):where(.backup-raw) {
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.backup-raw):where(.backup-raw) :global(summary) {
    padding: 11px 13px;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-weight: 600;
    cursor: pointer;
  }
  :global(.backup-raw):where(.backup-raw) :global(textarea) {
    width: calc(100% - 24px);
    margin: 0 12px 12px;
    padding: 11px;
    resize: vertical;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--text-soft);
    background: var(--surface-control);
    font:
      9px/1.55 'SFMono-Regular',
      Consolas,
      monospace;
  }
  :global(.backup-actions):where(.backup-actions) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    padding: 14px;
    margin-top: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--surface-control);
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) > :global(div:first-child) {
    display: grid;
    gap: 8px;
    justify-items: center;
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) > :global(div:first-child span) {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-align: center;
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) :global(img) {
    width: 118px;
    height: 118px;
    padding: 6px;
    border-radius: var(--radius-control);
    background: #fff;
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview) :global(.descriptor-qr-trigger) {
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    cursor: zoom-in;
  }
  :global(.descriptor-qr-preview):where(.descriptor-qr-preview)
    :global(.descriptor-qr-trigger:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 3px;
  }
  :global(.descriptor-qr-modal):where(.descriptor-qr-modal) :global(img) {
    background: #fff;
    padding: 8px;
  }
  :global(.descriptor-copy-row):where(.descriptor-copy-row) {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    align-items: center;
    gap: 9px;
  }
  :global(.descriptor-copy-row):where(.descriptor-copy-row) :global(code) {
    max-height: 92px;
    overflow: auto;
    padding: 10px;
    color: var(--text-soft);
    background: var(--surface-inset);
    border-radius: var(--radius-control);
    font-size: var(--font-size-meta);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  :global(.descriptor-copy-row):where(.descriptor-copy-row) :global(button) {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
    cursor: pointer;
  }
  :global(.descriptor-copy-row):where(.descriptor-copy-row) :global(button:hover) {
    color: var(--text);
    background: var(--surface-hover);
  }

  @media (max-width: 760px) {
    :global(.backup-auth):where(.backup-auth) {
      grid-template-columns: 1fr;
      gap: 0;
    }
    :global(.backup-actions):where(.backup-actions),
    :global(.backup-format-grid):where(.backup-format-grid),
    :global(.descriptor-qr-preview):where(.descriptor-qr-preview) {
      grid-template-columns: 1fr;
    }
  }
</style>
