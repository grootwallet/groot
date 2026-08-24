<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    ChevronRight,
    CircleDot,
    Clock3,
    Eye,
    EyeOff,
    FileKey,
    HeartPulse,
    RefreshCw,
    ShieldCheck
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import { amountUnit, denomination, formatAmount, setDenomination } from '$lib/denomination';
  import { formatInteger, locale } from '$lib/i18n';
  import { toast } from '$lib/stores/toasts';
  import {
    walletService,
    WalletError,
    type CosignerHealthCheck,
    type ExternalSignerWallet,
    type MultisigProposal,
    type MultisigWallet,
    type PaymentProposal,
    type WalletProfile,
    type WalletSnapshot,
    type WalletSyncSource,
    type WalletSyncStatus
  } from '$lib/wallet';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import { matchingDeviceForHealthCheck } from '$lib/hardware/health-check';
  import {
    hardwareHealthChecks,
    hardwareHealthKey,
    recordHardwareHealthCheck,
    setHardwareHealthChecks
  } from '$lib/hardware/health-check-state';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
  import { pendingBalanceBreakdown, sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Transaction } from '$lib/types';
  import { discreetMode, setDiscreetMode } from '$lib/privacy';
  import MobileWalletSwitcher from '$lib/components/MobileWalletSwitcher.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import MultisigDescriptorsModal from '$lib/components/MultisigDescriptorsModal.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { fly } from 'svelte/transition';
  const walletShell = useWalletShellContext();
  let syncing = $state(false);
  let snapshot = $state<WalletSnapshot | null>(null);
  let multisigWallet = $state<MultisigWallet | null>(null);
  let hardwareSignerWallet = $state<ExternalSignerWallet | null>(null);
  let signerDetailsOpen = $state(false);
  let checkingSignerHealth = $state(false);
  let activeProposal = $state<MultisigProposal | PaymentProposal | null>(null);
  let selected = $state<Transaction | null>(null);
  let multisig = $state(false);
  let moreOpen = $state(false);
  let moreMenu = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let showDescriptors = $state(false);
  let loadError = $state('');
  let selectedProfile = $state<WalletProfile | null>(null);
  let verifyOpen = $state(false);
  let verifyCredential = $state('');
  let verifyError = $state('');
  let verifying = $state(false);
  let revealingBackup = $state(false);
  let initialDataLoading = $state(true);
  let syncSource = $state<WalletSyncSource | null>(null);
  let syncStatus = $state<WalletSyncStatus | null>(null);
  let syncPollToken = 0;
  let hardwareSignerDetails = $derived.by<CosignerDraft | null>(() =>
    hardwareSignerWallet
      ? {
          id: `external-${hardwareSignerWallet.signer.fingerprint.toLowerCase()}`,
          ...hardwareSignerWallet.signer,
          source: hardwareSignerWallet.signer.source
        }
      : null
  );
  let signerHealth = $derived(
    hardwareSignerWallet
      ? ($hardwareHealthChecks[hardwareHealthKey(hardwareSignerWallet.signer.fingerprint)] ?? null)
      : null
  );
  const pendingBreakdown = $derived(
    snapshot ? pendingBalanceBreakdown(snapshot) : { incoming: 0, change: 0, outgoing: 0 }
  );
  const pendingDescription = $derived(
    [
      pendingBreakdown.incoming
        ? translate($locale, '{amount} {unit} awaiting confirmation', {
            amount: formatAmount(pendingBreakdown.incoming, $denomination),
            unit: amountUnit($denomination)
          })
        : '',
      pendingBreakdown.change
        ? translate($locale, '{amount} {unit} unconfirmed change', {
            amount: formatAmount(pendingBreakdown.change, $denomination),
            unit: amountUnit($denomination)
          })
        : '',
      pendingBreakdown.outgoing
        ? translate($locale, '{amount} {unit} outgoing', {
            amount: formatAmount(pendingBreakdown.outgoing, $denomination),
            unit: amountUnit($denomination)
          })
        : ''
    ]
      .filter(Boolean)
      .join(' · ') || translate($locale, '0 {unit} pending', { unit: amountUnit($denomination) })
  );
  const recentTransactions = $derived(
    sortTransactionsNewestFirst(snapshot?.transactions ?? []).slice(0, 3)
  );
  const proposalHref = $derived(multisig ? '/multisig/send' : '/send');
  const proposalCanFinalize = $derived(
    Boolean(activeProposal && 'canFinalize' in activeProposal && activeProposal.canFinalize)
  );
  const proposalTitle = $derived(
    translate(
      $locale,
      activeProposal && !('canFinalize' in activeProposal)
        ? 'Payment ready to sign'
        : proposalCanFinalize
          ? 'Payment ready to broadcast'
          : 'Signing in progress'
    )
  );
  const proposalProgress = $derived(
    activeProposal
      ? 'signed' in activeProposal
        ? translate($locale, '{signed} of {required} signatures collected', {
            signed: activeProposal.signed,
            required: activeProposal.required
          })
        : translate($locale, '{signed} of {required} signatures collected', {
            signed: 0,
            required: 1
          })
      : ''
  );
  const proposalLabel = $derived(
    activeProposal ? ($discreetMode ? 'Label hidden' : activeProposal.label) : ''
  );
  onMount(loadSnapshot);
  async function loadSnapshot() {
    loadError = '';
    initialDataLoading = true;
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      if (!shellWallets.length || !shellSelectedWalletId) {
        if (!(await walletService.exists())) {
          await goto('/welcome');
          return;
        }
      }
      const [registry, nextSyncSource] = await Promise.all([
        shellWallets.length && shellSelectedWalletId
          ? Promise.resolve({ wallets: shellWallets, selectedWalletId: shellSelectedWalletId })
          : walletService.profiles(),
        walletService.syncSource()
      ]);
      syncSource = nextSyncSource;
      selectedProfile =
        registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId) ?? null;
      multisig = selectedProfile?.kind === 'multisig';
      if (multisig) {
        const [nextSnapshot, nextWallet, proposals] = await Promise.all([
          walletService.multisigSnapshot(),
          walletService.multisigWallet(),
          walletService.multisigProposals()
        ]);
        snapshot = nextSnapshot;
        multisigWallet = nextWallet;
        hardwareSignerWallet = null;
        setHardwareHealthChecks([]);
        activeProposal = latestActiveProposal(proposals);
      } else {
        multisigWallet = null;
        const [nextSnapshot, proposals, nextHardwareSignerWallet, nextHealthChecks] =
          await Promise.all([
            walletService.snapshot(),
            selectedProfile?.kind === 'watch_only'
              ? walletService.externalSignerProposals()
              : walletService.paymentProposals(),
            selectedProfile?.kind === 'watch_only'
              ? walletService.externalSignerWallet()
              : Promise.resolve(null),
            selectedProfile?.kind === 'watch_only'
              ? walletService.hardwareHealthChecks()
              : Promise.resolve([])
          ]);
        snapshot = nextSnapshot;
        hardwareSignerWallet = nextHardwareSignerWallet;
        setHardwareHealthChecks(nextHealthChecks);
        activeProposal =
          selectedProfile?.kind === 'watch_only'
            ? latestActiveProposal(proposals as MultisigProposal[])
            : ((proposals as PaymentProposal[])[0] ?? null);
      }
      initialDataLoading = false;
      if (syncSource.type === 'compact_filters') void sync(false);
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      loadError = localizedError(cause, $locale, 'The wallet data could not be read.');
      initialDataLoading = false;
      toast({ title: 'Could not open wallet', description: loadError, tone: 'danger' });
    }
  }
  onMount(() =>
    walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
        multisig = event.walletKind === 'multisig';
        snapshot = event.snapshot;
        loadError = '';
        initialDataLoading = false;
      }
    })
  );
  onMount(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (moreOpen && event.target instanceof Node && !moreMenu?.contains(event.target))
        moreOpen = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !moreOpen) return;
      moreOpen = false;
      requestAnimationFrame(() => moreTrigger?.focus());
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  });
  async function refreshSyncStatus() {
    try {
      syncStatus = await walletService.syncStatus();
    } catch {
      /* The sync result remains authoritative. */
    }
  }
  async function pollSyncStatus(token: number) {
    while (syncing && token === syncPollToken) {
      await refreshSyncStatus();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const sync = async (showToast = true) => {
    if (syncing) return;
    syncing = true;
    const token = ++syncPollToken;
    void pollSyncStatus(token);
    try {
      const [nextSnapshot] = await Promise.all([
        multisig ? walletService.syncMultisig() : walletService.sync(),
        new Promise((resolve) => setTimeout(resolve, 1_200))
      ]);
      snapshot = nextSnapshot;
      if (showToast)
        toast({
          title: 'Wallet is up to date',
          description: 'Balance and transactions refreshed.',
          tone: 'success'
        });
    } catch (cause) {
      if (showToast)
        toast({
          title: 'Sync failed',
          description: localizedError(cause, $locale),
          tone: 'danger'
        });
    } finally {
      await refreshSyncStatus();
      syncing = false;
    }
  };
  async function verifyBackup() {
    verifying = true;
    verifyError = '';
    try {
      const verified = await walletService.verifyBackup(verifyCredential);
      verifyCredential = '';
      verifyOpen = false;
      if (!verified) {
        toast({
          title: 'Backup still unverified',
          description: 'You can return to verification whenever you are ready.'
        });
        return;
      }
      if (selectedProfile) selectedProfile = { ...selectedProfile, backupVerified: true };
      toast({
        title: 'Recovery backup verified',
        description: 'Your written words matched this wallet.',
        tone: 'success'
      });
    } catch (cause) {
      verifyError = localizedError(cause, $locale, 'Could not verify this recovery backup.');
    } finally {
      verifyCredential = '';
      verifying = false;
    }
  }
  async function revealAndVerifyBackup() {
    revealingBackup = true;
    verifyError = '';
    try {
      const verified = await walletService.revealAndVerifyBackup(verifyCredential);
      if (!verified) {
        toast({
          title: 'Backup still unverified',
          description: 'Your recovery words remain available to reveal again before verification.'
        });
        return;
      }
      verifyOpen = false;
      if (selectedProfile) selectedProfile = { ...selectedProfile, backupVerified: true };
      toast({
        title: 'Recovery backup verified',
        description: 'Your reconstructed word order matched this wallet.',
        tone: 'success'
      });
    } catch (cause) {
      verifyError = localizedError(cause, $locale, 'Could not reveal this recovery backup.');
    } finally {
      verifyCredential = '';
      revealingBackup = false;
    }
  }
  async function runExternalSignerHealthCheck() {
    if (!hardwareSignerWallet || !hardwareSignerDetails || checkingSignerHealth) return;
    const signer = hardwareSignerWallet.signer;
    checkingSignerHealth = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This saved signer has no USB device type. Re-import its public account backup.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      const result = await walletService.checkHardwareExternalSigner(signer, device.id);
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({
        title: 'Signer verified',
        description: translate($locale, '{signerName} matches this wallet.', {
          signerName: signer.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      const result: CosignerHealthCheck = {
        checkedAt: new Date().toISOString(),
        summary: localizedError(cause, $locale, 'The device could not be verified.'),
        status: 'attention'
      };
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({ title: 'Health check needs attention', description: result.summary, tone: 'danger' });
    } finally {
      checkingSignerHealth = false;
    }
  }
  async function saveHardwareHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
    recordHardwareHealthCheck(fingerprint, check);
  }
</script>

<div class="page dashboard-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'WALLET')}</p>
      <h1>{translate($locale, 'Overview')}</h1>
    </div>
    <button class="sync-button" disabled={syncing} onclick={() => sync(true)}
      ><RefreshCw size={15} class={syncing ? 'spin' : ''} />{translate(
        $locale,
        syncing && syncStatus?.progressPercent !== null && syncStatus?.progressPercent !== undefined
          ? `${syncStatus.progressPercent}%`
          : syncing
            ? 'Syncing'
            : 'Updated now'
      )}</button
    >
  </header>
  {#if syncSource?.type === 'compact_filters' && syncStatus && (syncing || syncStatus.state === 'failed')}
    <section
      class:failed={syncStatus.state === 'failed'}
      class="compact-filter-progress"
      aria-live="polite"
    >
      <div>
        <strong
          >{translate(
            $locale,
            syncStatus.state === 'connecting'
              ? 'Connecting to filter peers'
              : syncStatus.state === 'checking_matches'
                ? 'Checking matching blocks'
                : syncStatus.state === 'applying'
                  ? 'Saving verified wallet state'
                  : syncStatus.state === 'failed'
                    ? 'Compact-filter sync stopped'
                    : 'Downloading and checking compact filters'
          )}</strong
        ><small
          >{syncStatus.state === 'failed'
            ? translate(
                $locale,
                'Balance remains verified through block {height}. Retry when your connection is available.',
                {
                  height: formatInteger(syncStatus.lastVerifiedHeight, $locale)
                }
              )
            : syncStatus.chainHeight !== null
              ? translate(
                  $locale,
                  'Network height {height} · verified wallet state stays unchanged until completion',
                  {
                    height: formatInteger(syncStatus.chainHeight, $locale)
                  }
                )
              : syncStatus.connectedPeers !== null && syncStatus.requiredPeers !== null
                ? translate($locale, '{connected} of {required} required peers connected', {
                    connected: syncStatus.connectedPeers,
                    required: syncStatus.requiredPeers
                  })
                : translate(
                    $locale,
                    'Verified wallet state stays unchanged until the scan completes.'
                  )}</small
        >
      </div>
      {#if syncStatus.progressPercent !== null && syncStatus.state !== 'failed'}<progress
          max="100"
          value={syncStatus.progressPercent}
          aria-label={translate($locale, 'Compact-filter download progress')}
          >{syncStatus.progressPercent}%</progress
        >{/if}
    </section>
  {/if}
  {#if selectedProfile?.kind === 'single_key' && !selectedProfile.backupVerified}
    <section
      class="backup-verification-banner"
      aria-label={translate($locale, 'Recovery backup status')}
    >
      <ShieldCheck size={18} /><span
        ><strong>{translate($locale, 'Recovery backup not verified')}</strong><small
          >{translate(
            $locale,
            'Confirm your written words so you know this wallet can be recovered.'
          )}</small
        ></span
      ><Button
        size="small"
        variant="secondary"
        onclick={() => {
          verifyError = '';
          verifyOpen = true;
        }}>{translate($locale, 'Verify now')}</Button
      >
    </section>
  {/if}
  {#if loadError && !snapshot}
    <LoadFailure
      title={translate($locale, 'Wallet data is unavailable')}
      description={loadError}
      onretry={loadSnapshot}
    />
  {:else if snapshot && !initialDataLoading}
    <section class="balance-card content-reveal">
      <div class="balance-top">
        <span>{translate($locale, 'Total balance')}</span><button
          class="ghost-icon"
          aria-label={translate(
            $locale,
            $discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts'
          )}
          aria-pressed={$discreetMode}
          onclick={() => setDiscreetMode(!$discreetMode)}
          >{#if $discreetMode}<Eye size={17} />{:else}<EyeOff size={17} />{/if}</button
        >
      </div>
      <button
        class="balance-value"
        type="button"
        aria-label={translate(
          $locale,
          $denomination === 'btc' ? 'Show balance in sats' : 'Show balance in BTC'
        )}
        title={translate(
          $locale,
          $denomination === 'btc' ? 'Show balance in sats' : 'Show balance in BTC'
        )}
        onclick={() => setDenomination($denomination === 'btc' ? 'sats' : 'btc')}
      >
        <Amount value={snapshot?.balance.total ?? 0} hidden={$discreetMode} />
      </button>
      <div class="pending-line">
        <i></i>{translate($locale, $discreetMode ? 'Pending activity hidden' : pendingDescription)}
      </div>
    </section>
  {:else}
    <WalletSkeleton variant="balance" />
  {/if}
  {#if !loadError}
    {#if activeProposal}
      <a
        class="active-proposal-callout"
        class:ready={proposalCanFinalize}
        href={proposalHref}
        aria-label={translate($locale, 'Resume payment, {label}, {progress}', {
          label: proposalLabel,
          progress: proposalProgress
        })}
      >
        <span class="active-proposal-icon"><Clock3 size={17} /></span>
        <span class="active-proposal-copy"
          ><strong>{proposalTitle}</strong><small>{proposalLabel} · {proposalProgress}</small></span
        >
        <span class="active-proposal-action"
          >{translate($locale, 'Resume')} <ChevronRight size={15} /></span
        >
      </a>
    {/if}
    <div class="primary-actions">
      <MobileWalletSwitcher
        profiles={walletShell.profiles()}
        selectedWalletId={walletShell.selectedWalletId()}
        onselect={walletShell.selectWallet}
      />
      <div class="overview-more" bind:this={moreMenu}>
        <OverflowMenuButton
          bind:element={moreTrigger}
          label={translate($locale, 'More wallet actions')}
          expanded={moreOpen}
          size="large"
          onclick={() => (moreOpen = !moreOpen)}
        />
        {#if moreOpen}
          <div
            class="overview-more-menu"
            role="menu"
            aria-label={translate($locale, 'More wallet actions')}
            transition:fly={{ y: 5, duration: 160 }}
          >
            <a href="/activity" role="menuitem" onclick={() => (moreOpen = false)}
              ><Activity size={16} /><span
                ><strong>{translate($locale, 'Activity')}</strong><small
                  >{translate($locale, 'View all transactions')}</small
                ></span
              ></a
            >
            <a href="/coins" role="menuitem" onclick={() => (moreOpen = false)}
              ><CircleDot size={16} /><span
                ><strong>{translate($locale, 'Coins')}</strong><small
                  >{translate($locale, 'Inspect and choose UTXOs')}</small
                ></span
              ></a
            >
            {#if hardwareSignerWallet}
              <button
                role="menuitem"
                onclick={() => {
                  moreOpen = false;
                  signerDetailsOpen = true;
                }}
                ><HeartPulse size={16} /><span
                  ><strong>{translate($locale, 'Health check')}</strong><small
                    >{translate($locale, 'Verify the connected signer identity')}</small
                  ></span
                ></button
              >
            {/if}
            {#if multisig}
              <a href="/multisig" role="menuitem" onclick={() => (moreOpen = false)}
                ><ShieldCheck size={16} /><span
                  ><strong>{translate($locale, 'Policy')}</strong><small
                    >{translate($locale, 'Keys, backups, and rules')}</small
                  ></span
                ></a
              >
              <button
                role="menuitem"
                onclick={() => {
                  moreOpen = false;
                  showDescriptors = true;
                }}
                ><Eye size={16} /><span
                  ><strong>{translate($locale, 'Show descriptors')}</strong><small
                    >{translate($locale, 'Inspect receive and change logic')}</small
                  ></span
                ></button
              >
              <a href="/multisig/backup" role="menuitem" onclick={() => (moreOpen = false)}
                ><FileKey size={16} /><span
                  ><strong>{translate($locale, 'Export & verify')}</strong><small
                    >{translate($locale, 'Save a public wallet backup')}</small
                  ></span
                ></a
              >
            {/if}
          </div>
        {/if}
      </div>
      <a
        class="button secondary large overview-inline-primary"
        href={multisig ? '/multisig/receive' : '/receive'}
        ><ArrowDownToLine size={18} />{translate($locale, 'Receive')}</a
      >
      <a
        class="button default large overview-inline-primary"
        href={multisig ? '/multisig/send' : '/send'}
        ><ArrowUpFromLine size={18} />{translate($locale, 'Send')}</a
      >
    </div>
    <section class="section-block">
      <div class="section-heading">
        <div><h2>{translate($locale, 'Recent activity')}</h2></div>
        <a href="/activity">{translate($locale, 'View all')}</a>
      </div>
      {#if initialDataLoading}
        <TxList items={[]} loading />
      {:else if recentTransactions.length}
        <TxList items={recentTransactions} onselect={(transaction) => (selected = transaction)} />
      {:else}
        <EmptyState
          compact
          title={translate($locale, 'No transactions yet')}
          description={translate($locale, 'Received and sent transactions will appear here.')}
        >
          {#snippet icon()}<Activity size={22} />{/snippet}
        </EmptyState>
      {/if}
    </section>
  {/if}
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => (selected = null)} />
<DeviceDetailsModal
  signer={signerDetailsOpen ? hardwareSignerDetails : null}
  health={signerHealth}
  checking={checkingSignerHealth}
  onclose={() => (signerDetailsOpen = false)}
  oncheck={runExternalSignerHealthCheck}
/>
<MultisigDescriptorsModal
  open={showDescriptors}
  wallet={multisigWallet}
  onclose={() => (showDescriptors = false)}
/>
<Modal
  open={verifyOpen}
  title={translate($locale, 'Verify recovery backup')}
  description={translate(
    $locale,
    'Use your written 24 words for a private native proof, or reveal them securely first if you still need to make the backup.'
  )}
  onclose={() => {
    verifyOpen = false;
    verifyCredential = '';
    verifyError = '';
  }}
>
  <div class="warning-box verify-backup-warning">
    <strong>{translate($locale, 'Recovery words stay inside the trusted native window.')}</strong>
    {translate($locale, 'Revealing or verifying them\n    never sends the words into the webview.')}
  </div>
  <PasswordField
    label={translate($locale, 'Wallet passphrase')}
    bind:value={verifyCredential}
    autocomplete="current-password"
    hint={translate(
      $locale,
      'Required to decrypt the recovery words only inside trusted Rust code.'
    )}
  />
  {#if verifyError}<p class="form-error" role="alert">
      {verifyError.replace('passphrase / PIN', 'wallet passphrase')}
    </p>{/if}
  <div class="modal-footer verify-backup-actions">
    <Button
      class="show-words-action"
      variant="secondary"
      disabled={!verifyCredential || verifying || revealingBackup}
      loading={revealingBackup}
      loadingLabel={translate($locale, 'Opening recovery words…')}
      onclick={revealAndVerifyBackup}>{translate($locale, 'View recovery words first')}</Button
    >
    <Button
      variant="secondary"
      disabled={verifying || revealingBackup}
      onclick={() => {
        verifyOpen = false;
        verifyCredential = '';
        verifyError = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!verifyCredential || revealingBackup}
      loading={verifying}
      loadingLabel={translate($locale, 'Opening verification…')}
      onclick={verifyBackup}>{translate($locale, 'Continue')}</Button
    >
  </div>
</Modal>
