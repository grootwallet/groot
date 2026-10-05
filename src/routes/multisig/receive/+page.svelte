<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Plus,
    QrCode,
    RefreshCw,
    Shield,
    ShieldCheck,
    Trash2
  } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import PermanentLabelEditor from '$lib/components/PermanentLabelEditor.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ReadableAddress from '$lib/components/ReadableAddress.svelte';
  import AddressDetailsModal from '$lib/components/AddressDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import HardwareVerificationStatus from '$lib/components/HardwareVerificationStatus.svelte';
  import HardwareReceiveVerification from '$lib/components/HardwareReceiveVerification.svelte';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { compactAddress } from '$lib/address-display';
  import { walletService, WalletError } from '$lib/wallet';
  import { awaitingPaymentAddresses } from '$lib/wallet/policy';
  import {
    permanentLabelsForSubmission,
    visibleLabelSuggestions,
    VISIBLE_LABEL_SUGGESTION_LIMIT
  } from '$lib/wallet/label-suggestions';
  import type { LabelSuggestion, ReceiveAddress } from '$lib/types';
  import type { MultisigWallet } from '$lib/wallet';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import { discreetMode } from '$lib/privacy';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  const walletShell = useWalletShellContext();
  let label = $state('');
  let selectedLabels = $state<string[]>([]);
  let current = $state<ReceiveAddress | null>(null);
  let addresses = $state<ReceiveAddress[]>([]);
  let labelSuggestions = $state<LabelSuggestion[]>([]);
  let visibleSuggestions = $derived(
    visibleLabelSuggestions(labelSuggestions, label, VISIBLE_LABEL_SUGGESTION_LIMIT, selectedLabels)
  );
  let submissionLabels = $derived(permanentLabelsForSubmission(selectedLabels, label));
  let qrDataUrl = $state('');
  let busy = $state(false);
  let syncing = $state(false);
  let syncError = $state('');
  let ready = $state(false);
  let loadError = $state('');
  let generateError = $state('');
  let policyVerificationNeeded = $state(false);
  let showGenerate = $state(false);
  let showDiscard = $state(false);
  let showQr = $state(false);
  let showDetails = $state(false);
  let copied = $state(false);
  let discardAddressCopied = $state(false);
  let discardTarget = $state<ReceiveAddress | null>(null);
  let detailAddress = $state<ReceiveAddress | null>(null);
  let awaiting = $derived(awaitingPaymentAddresses(addresses));
  let history = $derived(addresses.filter((address) => address.status !== 'awaiting'));
  let wallet = $state<MultisigWallet | null>(null);
  let supportsHardwareVerification = $derived(wallet !== null && !wallet.recoveryTemplate);
  let eligibleDeviceTypes = $derived([
    ...new Set(
      (wallet?.cosigners ?? [])
        .map((signer) => signer.deviceType)
        .filter((deviceType): deviceType is string => Boolean(deviceType))
    )
  ]);
  let eligibleFingerprints = $derived(
    (wallet?.cosigners ?? []).map((signer) => signer.fingerprint)
  );
  onMount(() => {
    let active = true;
    const unsubscribe = walletService.subscribe((event) => {
      if (
        event.type === 'wallet_updated' &&
        event.walletKind === 'multisig' &&
        event.walletId === walletShell.selectedWalletId()
      ) {
        applyAddresses(event.snapshot.receiveAddresses);
        labelSuggestions = event.snapshot.labelSuggestions;
        syncError = '';
      }
    });
    void (async () => {
      try {
        const shellWallets = walletShell.profiles();
        const shellSelectedWalletId = walletShell.selectedWalletId();
        const registry =
          shellWallets.length && shellSelectedWalletId
            ? { wallets: shellWallets, selectedWalletId: shellSelectedWalletId }
            : await walletService.profiles();
        const selected = registry.wallets.find(
          (profile) => profile.id === registry.selectedWalletId
        );
        if (selected?.kind !== 'multisig') {
          await goto('/receive', { replaceState: true });
          return;
        }
        const [, savedWallet] = await Promise.all([
          walletService.multisigSnapshot().then((state) => {
            if (!active) return;
            applyAddresses(state.receiveAddresses);
            labelSuggestions = state.labelSuggestions;
          }),
          walletService.multisigWallet()
        ]);
        if (!active) return;
        wallet = savedWallet;
        ready = true;
      } catch (cause) {
        if (!active) return;
        if (cause instanceof WalletError && cause.code === 'wrong_wallet_kind') {
          await goto('/receive', { replaceState: true });
          return;
        }
        loadError = localizedError(cause, $locale);
        toast({
          title: 'Could not load wallet',
          description: loadError,
          tone: 'danger'
        });
      }
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  });
  $effect(() => {
    const address = current?.address;
    qrDataUrl = '';
    if (address)
      QRCode.toDataURL(`bitcoin:${address}`, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M'
      }).then((value) => {
        if (current?.address === address) qrDataUrl = value;
      });
  });
  async function syncNow() {
    if (syncing || busy || !ready) return;
    syncing = true;
    syncError = '';
    try {
      await walletShell.pauseAutomaticSync();
      const [snapshot] = await Promise.all([
        walletService.syncMultisig(),
        new Promise((resolve) => setTimeout(resolve, 1_200))
      ]);
      applyAddresses(snapshot.receiveAddresses);
      labelSuggestions = snapshot.labelSuggestions;
      toast({
        title: 'Wallet is up to date',
        description: 'Incoming payments and receive addresses refreshed.',
        tone: 'success'
      });
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'sync_cancelled') return;
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock?next=/multisig/receive');
        return;
      }
      syncError = localizedError(cause, $locale);
      toast({
        title: 'Sync failed',
        description: syncError,
        tone: 'danger'
      });
    } finally {
      syncing = false;
      walletShell.resumeAutomaticSync();
    }
  }
  async function generate() {
    if (busy || !ready || !submissionLabels.length) return;
    busy = true;
    generateError = '';
    policyVerificationNeeded = false;
    let automaticSyncPaused = false;
    try {
      await walletShell.pauseAutomaticSync();
      automaticSyncPaused = true;
      current = await walletService.createMultisigAddress(submissionLabels);
      addresses = [current, ...addresses];
      try {
        const snapshot = await walletService.multisigSnapshot();
        applyAddresses(snapshot.receiveAddresses);
        labelSuggestions = snapshot.labelSuggestions;
      } catch {
        // Address creation already succeeded. A later wallet refresh will recover suggestions.
      }
      label = '';
      selectedLabels = [];
      showGenerate = false;
      toast({
        title: 'Receive address ready',
        description: 'The label is stored with the wallet.',
        tone: 'success'
      });
    } catch (cause) {
      policyVerificationNeeded =
        cause instanceof WalletError && cause.code === 'hardware_not_approved';
      generateError = localizedError(cause, $locale, 'Could not generate the address.');
      toast({ title: 'Could not generate address', description: generateError, tone: 'danger' });
    } finally {
      busy = false;
      if (automaticSyncPaused) walletShell.resumeAutomaticSync();
    }
  }
  async function copy() {
    if (!current) return;
    try {
      await copyText(current.address, 'bitcoin-address');
      copied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }
  async function discard() {
    if (!discardTarget) return;
    busy = true;
    try {
      const id = discardTarget.id;
      await walletService.discardMultisigAddress(id);
      addresses = addresses.map((item) =>
        item.id === id ? { ...item, status: 'discarded' } : item
      );
      if (current?.id === id) current = awaitingPaymentAddresses(addresses)[0] ?? null;
      discardTarget = null;
      showDiscard = false;
      toast({ title: 'Address discarded' });
    } catch (cause) {
      toast({
        title: 'Could not discard address',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      busy = false;
    }
  }
  async function copyDiscardAddress() {
    if (!discardTarget) return;
    try {
      await copyText(discardTarget.address, 'bitcoin-address');
      discardAddressCopied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => (discardAddressCopied = false), 1500);
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }
  function applyAddresses(nextAddresses: ReceiveAddress[]) {
    addresses = nextAddresses;
    const nextAwaiting = awaitingPaymentAddresses(nextAddresses);
    current = nextAwaiting.find((address) => address.id === current?.id) ?? nextAwaiting[0] ?? null;
  }
  const requestDiscard = (address: ReceiveAddress) => {
    discardAddressCopied = false;
    discardTarget = address;
    showDiscard = true;
  };
  function applyVerifiedAddress(verified: ReceiveAddress) {
    addresses = addresses.map((address) => (address.id === verified.id ? verified : address));
    if (current?.id === verified.id) current = verified;
  }
</script>

<div class="page narrow-page receive-page">
  <header class="page-header">
    <div>
      <h1>{translate($locale, 'Receive bitcoin')}</h1>
    </div>
    <div class="page-header-actions">
      <button class="sync-button" disabled={syncing || busy || !ready} onclick={syncNow}
        ><RefreshCw size={15} class={syncing ? 'spin' : ''} />{translate(
          $locale,
          syncing ? 'Refreshing payments…' : 'Refresh payments'
        )}</button
      >
    </div>
  </header>
  {#if syncError}
    <div class="sync-failure-banner">
      <LoadFailure
        title={translate($locale, 'Sync failed')}
        description={syncError}
        onretry={syncNow}
      />
    </div>
  {/if}
  {#if loadError}<section class="empty-state" role="alert">
      <h2>{translate($locale, 'Could not load wallet')}</h2>
      <p>{loadError}</p>
      <Button variant="secondary" onclick={() => window.location.reload()}
        >{translate($locale, 'Try again')}</Button
      >
    </section>
  {:else if current}<section class="receive-card">
      <button
        class="qr-placeholder qr-button"
        aria-label={translate($locale, 'Enlarge QR code')}
        onclick={() => (showQr = true)}
        >{#if qrDataUrl}<img
            src={qrDataUrl}
            alt={translate($locale, 'QR code for {address}', { address: current.address })}
          />{:else}<QrCode size={154} />{/if}</button
      >
      <div class="address-label">
        <PermanentLabelTags
          labels={current.labels ?? [current.label]}
          prominent
        />{#if current.hardwareVerifiedAt}<HardwareVerificationStatus />{:else}<small
            >{translate($locale, 'Not verified')}</small
          >{/if}
      </div>
      <button class="address-box" onclick={copy}
        ><code>{current.address}</code>{#if copied}<Check size={17} />{:else}<Copy
            size={17}
          />{/if}</button
      >
      <div class="receive-actions">
        <Button variant="secondary" onclick={copy}
          >{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}{translate(
            $locale,
            'Copy address'
          )}</Button
        >{#if !wallet?.recoveryTemplate}<HardwareReceiveVerification
            address={current}
            walletKind="multisig"
            {eligibleDeviceTypes}
            {eligibleFingerprints}
            savedSigners={wallet?.cosigners ?? []}
            onverified={applyVerifiedAddress}
          />{/if}<Button variant="ghost-danger" onclick={() => requestDiscard(current!)}
          ><Trash2 size={16} />{translate($locale, 'Discard')}</Button
        >
      </div>
      {#if wallet?.recoveryTemplate}<WarningNotice
          role="note"
          title={translate(
            $locale,
            'Hardware address display is unavailable for this delayed policy.'
          )}
          body={translate(
            $locale,
            'Verify the descriptor and address with an independent Miniscript-aware tool. Groot’s pinned HWI release cannot display this policy safely.'
          )}
        />{/if}
      <button class="insight-toggle" onclick={() => (showDetails = !showDetails)}
        >{translate($locale, showDetails ? 'Hide' : 'Show')}
        {translate($locale, 'address details')}
        <ChevronDown size={14} class={showDetails ? 'rotated' : ''} /></button
      >{#if showDetails}<dl class="optional-details">
          <div>
            <dt>{translate($locale, 'Derivation')}</dt>
            <dd><code>{current.derivationPath}</code></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Type')}</dt>
            <dd>
              {translate(
                $locale,
                wallet?.recoveryTemplate
                  ? 'Descriptor · Miniscript'
                  : 'Native SegWit · standard multisig'
              )}
            </dd>
          </div>
          {#if current.hardwareVerifiedAt}<div>
              <dt>{translate($locale, 'Hardware verified')}</dt>
              <dd><LocalTimestamp value={current.hardwareVerifiedAt} /></dd>
            </div>{/if}{#if current.hardwareVerifiedBy}<div>
              <dt>{translate($locale, 'Signer fingerprint')}</dt>
              <dd><code>{current.hardwareVerifiedBy}</code></dd>
            </div>{/if}
        </dl>{/if}{#if !current.hardwareVerifiedAt}<p class="privacy-note">
          {translate($locale, 'Verify on a wallet signer before sharing this address.')}
        </p>{/if}
    </section>
  {:else if !ready}<WalletSkeleton variant="balance" />
  {:else}<section class="empty-state">
      <span class="empty-icon"><QrCode size={24} /></span>
      <h2>
        {translate($locale, ready ? 'No address awaiting payment' : 'Loading receive addresses…')}
      </h2>
      <p>
        {translate(
          $locale,
          ready
            ? 'Every receive address needs a label.'
            : 'Confirming the selected wallet before deriving an address.'
        )}
      </p>
      <Button
        disabled={!ready}
        onclick={() => {
          generateError = '';
          showGenerate = true;
        }}><Plus size={17} />{translate($locale, 'New address')}</Button
      >
    </section>{/if}
  {#if ready}<div class="section-heading compact">
      <div>
        <h2>{translate($locale, 'Awaiting payment')}</h2>
        <p>
          {awaiting.length}
          {translate($locale, 'active')}
          {translate($locale, awaiting.length === 1 ? 'address' : 'addresses')}
        </p>
      </div>
      <Button
        variant="secondary"
        size="small"
        disabled={!ready}
        onclick={() => {
          generateError = '';
          showGenerate = true;
        }}
        ariaLabel="New receive address"><Plus size={15} />{translate($locale, 'New')}</Button
      >
    </div>
    <div class="awaiting-addresses">
      {#each awaiting as address}<article class:active={current?.id === address.id}>
          <button
            class="awaiting-select"
            aria-label={`${translate($locale, 'View {label}', { label: address.label })}${
              supportsHardwareVerification
                ? `. ${translate(
                    $locale,
                    address.hardwareVerifiedAt ? 'Hardware verified' : 'Hardware not verified'
                  )}`
                : ''
            }`}
            onclick={() => {
              current = address;
              showDetails = false;
            }}
            ><span class="status-dot"></span><span
              ><PermanentLabelTags labels={address.labels ?? [address.label]} prominent /><small
                >{compactAddress(address.address)}</small
              ></span
            ><span class="right-meta"
              >{#if supportsHardwareVerification}<span
                  class="address-verification-state"
                  class:verified={Boolean(address.hardwareVerifiedAt)}
                  >{#if address.hardwareVerifiedAt}<ShieldCheck size={12} />{translate(
                      $locale,
                      'Hardware verified'
                    )}{:else}<Shield size={12} />{translate(
                      $locale,
                      'Hardware not verified'
                    )}{/if}</span
                >{:else}{translate($locale, 'Awaiting')}{/if}<small
                ><LocalTimestamp value={address.created} /></small
              ></span
            ></button
          ><button
            class="awaiting-discard"
            aria-label={translate($locale, 'Discard {label}', { label: address.label })}
            onclick={() => requestDiscard(address)}><Trash2 size={15} /></button
          >
        </article>{:else}<p class="list-empty">
          {translate($locale, 'No active payment requests.')}
        </p>{/each}
    </div>{:else if !loadError}<WalletSkeleton variant="transactions" count={2} />{/if}
  {#if ready}<div class="section-heading compact">
      <div>
        <h2>{translate($locale, 'Address history')}</h2>
        <p>{translate($locale, 'Used and discarded addresses remain monitored.')}</p>
      </div>
    </div>
    <div class="address-history">
      {#each history as address}<button
          class="address-history-row"
          aria-label={translate($locale, 'View details for {label}', { label: address.label })}
          onclick={() => (detailAddress = address)}
          ><span class="status-dot" class:used={address.status === 'used'}></span><span
            ><PermanentLabelTags labels={address.labels ?? [address.label]} prominent /><small
              >{compactAddress(address.address)}</small
            ></span
          ><span class="right-meta"
            >{address.status}<small><LocalTimestamp value={address.created} /></small></span
          ><ChevronRight size={15} /></button
        >{:else}<p class="list-empty">{translate($locale, 'No past addresses yet.')}</p>{/each}
    </div>{/if}
</div>

<Modal
  open={showGenerate}
  title={translate($locale, 'New receive address')}
  description={translate(
    $locale,
    'Add up to five labels for this address. You can reuse labels, but you cannot change them later.'
  )}
  onclose={() => {
    if (!busy) {
      showGenerate = false;
      generateError = '';
    }
  }}
  ><form
    onsubmit={(e) => {
      e.preventDefault();
      generate();
    }}
  >
    <PermanentLabelEditor
      id="multisig-receive-label-input"
      title={translate($locale, 'Label')}
      placeholder={translate($locale, 'e.g. Treasury deposit')}
      discreet={$discreetMode}
      suggestions={visibleSuggestions}
      bind:labels={selectedLabels}
      bind:value={label}
      onedit={(kind) => {
        if (kind === 'input') generateError = '';
      }}
    />
    {#if generateError}<p class="form-error" role="alert">{generateError}</p>{/if}
    {#if policyVerificationNeeded && generateError}<div class="privacy-note">
        <p>
          {translate(
            $locale,
            'Verify the signer policies, then return to create this labeled address.'
          )}
        </p>
        <Button variant="secondary" href="/multisig">{translate($locale, 'Open Policy')}</Button>
      </div>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        disabled={busy}
        onclick={() => {
          showGenerate = false;
          generateError = '';
        }}>{translate($locale, 'Cancel')}</Button
      ><Button
        type="submit"
        disabled={!ready || busy || !submissionLabels.length}
        loading={busy}
        loadingLabel={translate($locale, 'Generating address…')}
        >{translate($locale, 'Generate address')}</Button
      >
    </div>
  </form></Modal
>
<Modal
  open={showDiscard}
  title={translate($locale, 'Discard {label}?', {
    label: discardTarget?.label ?? translate($locale, 'this receive address')
  })}
  description={translate($locale, 'It remains monitored but will never be offered again.')}
  onclose={() => {
    discardAddressCopied = false;
    showDiscard = false;
    discardTarget = null;
  }}
  >{#if discardTarget}
    <div class="address-detail-view discard-address-detail">
      <div class="address-detail-status">
        <PermanentLabelTags
          labels={discardTarget.labels?.length ? discardTarget.labels : [discardTarget.label]}
          prominent
        />
      </div>
      <ReadableAddress
        address={discardTarget.address}
        copied={discardAddressCopied}
        oncopy={copyDiscardAddress}
      />
      <details class="verification-details">
        <summary>{translate($locale, 'Show address details')}<ChevronDown size={16} /></summary>
        <dl class="optional-details">
          <div>
            <dt>{translate($locale, 'Derivation path')}</dt>
            <dd><code>{discardTarget.derivationPath}</code></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Address type')}</dt>
            <dd>
              {translate(
                $locale,
                wallet?.recoveryTemplate
                  ? 'Descriptor · Miniscript'
                  : 'Native SegWit · standard multisig'
              )}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  {/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        discardAddressCopied = false;
        showDiscard = false;
        discardTarget = null;
      }}>{translate($locale, 'Keep address')}</Button
    ><Button
      variant="danger"
      loading={busy}
      loadingLabel={translate($locale, 'Discarding…')}
      onclick={discard}>{translate($locale, 'Discard address')}</Button
    >
  </div></Modal
>
<Modal
  open={showQr}
  title={translate($locale, current?.label ?? 'Receive address')}
  description={translate($locale, 'Scan to pay this exact descriptor address.')}
  onclose={() => (showQr = false)}
  >{#if current && qrDataUrl}<div class="large-qr">
      <img
        src={qrDataUrl}
        alt={translate($locale, 'Large QR code for {address}', { address: current.address })}
      /><ReadableAddress address={current.address} {copied} oncopy={copy} />
    </div>{/if}</Modal
>
<AddressDetailsModal
  address={detailAddress}
  open={Boolean(detailAddress)}
  walletType={wallet?.recoveryTemplate
    ? 'Descriptor · Miniscript'
    : 'Native SegWit · standard multisig'}
  onclose={() => (detailAddress = null)}
/>
