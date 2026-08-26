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
    Shield,
    ShieldCheck,
    Trash2,
    X
  } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import { onMount, tick } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ReadableAddress from '$lib/components/ReadableAddress.svelte';
  import AddressDetailsModal from '$lib/components/AddressDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import HardwareVerificationStatus from '$lib/components/HardwareVerificationStatus.svelte';
  import HardwareReceiveVerification from '$lib/components/HardwareReceiveVerification.svelte';
  import { compactAddress } from '$lib/address-display';
  import { walletService } from '$lib/wallet';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { awaitingPaymentAddresses } from '$lib/wallet/policy';
  import {
    addPermanentLabel,
    backspaceLabelDraft,
    permanentLabelsForSubmission,
    tokenizeLabelDraft,
    visibleLabelSuggestions,
    VISIBLE_LABEL_SUGGESTION_LIMIT
  } from '$lib/wallet/label-suggestions';
  import type { LabelSuggestion, ReceiveAddress } from '$lib/types';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import { discreetMode } from '$lib/privacy';
  let label = $state('');
  let selectedLabels = $state<string[]>([]);
  let armedLabelIndex = $state<number | null>(null);
  let current = $state<ReceiveAddress | null>(null);
  let addresses = $state<ReceiveAddress[]>([]);
  let labelSuggestions = $state<LabelSuggestion[]>([]);
  let visibleSuggestions = $derived(
    visibleLabelSuggestions(labelSuggestions, label, VISIBLE_LABEL_SUGGESTION_LIMIT, selectedLabels)
  );
  let submissionLabels = $derived(permanentLabelsForSubmission(selectedLabels, label));
  let qrDataUrl = $state('');
  let busy = $state(false);
  let showGenerate = $state(false);
  let showDiscard = $state(false);
  let showQr = $state(false);
  let showDetails = $state(false);
  let copied = $state(false);
  let qrGeneration = 0;
  let discardTarget = $state<ReceiveAddress | null>(null);
  let detailAddress = $state<ReceiveAddress | null>(null);
  let receiveCard = $state<HTMLElement | null>(null);
  let savedSignerDeviceType = $state<string | null>(null);
  let savedSignerFingerprint = $state<string | null>(null);
  let savedSignerLabel = $state<string | null>(null);
  const walletShell = useWalletShellContext();
  let externalSigner = $derived(
    walletShell.profiles().find((profile) => profile.id === walletShell.selectedWalletId())
      ?.kind === 'watch_only'
  );
  let awaiting = $derived(awaitingPaymentAddresses(addresses));
  let history = $derived(addresses.filter((address) => address.status !== 'awaiting'));
  onMount(load);
  onMount(() =>
    walletService.subscribe((event) => {
      if (
        event.type !== 'wallet_updated' ||
        event.walletKind !== 'single_key' ||
        event.walletId !== walletShell.selectedWalletId()
      )
        return;
      applyAddresses(event.snapshot.receiveAddresses);
      labelSuggestions = event.snapshot.labelSuggestions;
    })
  );
  $effect(() => {
    const address = current?.address;
    const generation = ++qrGeneration;
    qrDataUrl = '';
    if (address)
      QRCode.toDataURL(`bitcoin:${address}`, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
        .then((value) => {
          if (generation === qrGeneration && current?.address === address) qrDataUrl = value;
        })
        .catch((cause) => {
          if (generation === qrGeneration)
            toast({
              title: 'Could not generate QR code',
              description: localizedError(cause, $locale),
              tone: 'danger'
            });
        });
  });
  async function load() {
    try {
      const snapshot = await walletService.snapshot();
      applyAddresses(snapshot.receiveAddresses);
      labelSuggestions = snapshot.labelSuggestions;
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      const registry =
        shellWallets.length && shellSelectedWalletId
          ? { wallets: shellWallets, selectedWalletId: shellSelectedWalletId }
          : await walletService.profiles();
      if (
        registry.wallets.find((profile) => profile.id === registry.selectedWalletId)?.kind ===
        'watch_only'
      ) {
        const savedSigner = (await walletService.externalSignerWallet()).signer;
        savedSignerDeviceType = savedSigner.deviceType;
        savedSignerFingerprint = savedSigner.fingerprint;
        savedSignerLabel = savedSigner.label;
      }
    } catch (cause) {
      toast({
        title: 'Could not load addresses',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
  }
  function applyAddresses(nextAddresses: ReceiveAddress[]) {
    addresses = nextAddresses;
    const nextAwaiting = awaitingPaymentAddresses(nextAddresses);
    current = nextAwaiting.find((address) => address.id === current?.id) ?? nextAwaiting[0] ?? null;
  }
  const generate = async () => {
    if (!submissionLabels.length) return;
    busy = true;
    try {
      current = await walletService.createAddress(submissionLabels);
      addresses = [current, ...addresses];
      try {
        const snapshot = await walletService.snapshot();
        applyAddresses(snapshot.receiveAddresses);
        labelSuggestions = snapshot.labelSuggestions;
      } catch {
        // Address creation already succeeded. A later wallet refresh will recover suggestions.
      }
      label = '';
      selectedLabels = [];
      showGenerate = false;
      await tick();
      receiveCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        await copyText(current.address, 'bitcoin-address');
        copied = true;
        setTimeout(() => (copied = false), 1500);
        toast({
          title: 'Address ready and copied',
          description: 'The permanent label is stored locally.',
          tone: 'success'
        });
      } catch {
        toast({
          title: 'New address ready',
          description: 'Tap Copy address to copy it.',
          tone: 'success'
        });
      }
    } catch (cause) {
      toast({
        title: 'Could not generate address',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      busy = false;
    }
  };
  function addDraftLabel(value = label) {
    armedLabelIndex = null;
    const next = addPermanentLabel(selectedLabels, value);
    if (next.length !== selectedLabels.length) {
      selectedLabels = next;
      label = '';
    }
  }
  function updateLabelDraft(value: string) {
    armedLabelIndex = null;
    const draft = tokenizeLabelDraft(selectedLabels, value);
    selectedLabels = draft.labels;
    label = draft.input;
  }
  function handleLabelKeydown(event: KeyboardEvent) {
    if (event.key === 'Backspace' && !label) {
      event.preventDefault();
      const result = backspaceLabelDraft(selectedLabels, armedLabelIndex);
      selectedLabels = result.labels;
      armedLabelIndex = result.armedIndex;
      return;
    }
    armedLabelIndex = null;
    if (!label.trim() || !['Enter', 'Tab', ',', ';'].includes(event.key)) return;
    if (event.key !== 'Tab') event.preventDefault();
    const draft = tokenizeLabelDraft(selectedLabels, label, true);
    selectedLabels = draft.labels;
    label = draft.input;
  }
  function addressLabelText(address: ReceiveAddress): string {
    return (address.labels?.length ? address.labels : [address.label]).join(' · ');
  }
  const copy = async () => {
    if (!current) return;
    try {
      await copyText(current.address, 'bitcoin-address');
      copied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select and copy the address manually.',
        tone: 'danger'
      });
    }
  };
  const discard = async () => {
    if (!discardTarget) return;
    busy = true;
    try {
      const discardedId = discardTarget.id;
      await walletService.discardAddress(discardedId);
      addresses = addresses.map((address) =>
        address.id === discardedId ? { ...address, status: 'discarded' } : address
      );
      if (current?.id === discardedId) current = awaitingPaymentAddresses(addresses)[0] ?? null;
      discardTarget = null;
      showDiscard = false;
      toast({
        title: 'Address discarded',
        description: 'It will not be offered for payment again.'
      });
    } catch (cause) {
      toast({
        title: 'Could not discard address',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      busy = false;
    }
  };
  const requestDiscard = (address: ReceiveAddress) => {
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
      <p class="eyebrow">{translate($locale, 'RECEIVE')}</p>
      <h1>{translate($locale, 'Receive bitcoin')}</h1>
      <p class="subtitle">{translate($locale, 'Create a labeled address for one payment.')}</p>
    </div>
  </header>
  {#if current}
    <section class="receive-card" bind:this={receiveCard}>
      <button
        class="qr-placeholder qr-button"
        aria-label={translate($locale, 'Enlarge QR code')}
        onclick={() => (showQr = true)}
        >{#if qrDataUrl}<img
            src={qrDataUrl}
            alt={translate($locale, 'QR code for {address}', { address: current.address })}
          />{:else}<QrCode size={154} strokeWidth={1.2} /><span
            >{translate($locale, 'Generating QR…')}</span
          >{/if}</button
      >
      <div class="address-label">
        <span>{current.label}</span
        >{#if externalSigner}{#if current.hardwareVerifiedAt}<HardwareVerificationStatus
            />{:else}<small>{translate($locale, 'Not verified')}</small>{/if}{:else}<small
            >{translate($locale, 'Awaiting payment')}</small
          >{/if}
      </div>
      <button class="address-box" onclick={copy}
        ><code>{current.address}</code>{#if copied}<Check size={17} />{:else}<Copy
            size={17}
          />{/if}</button
      >
      <div class="receive-actions">
        <Button variant="secondary" onclick={copy}
          ><Copy size={16} />{translate($locale, 'Copy address')}</Button
        >{#if externalSigner}<HardwareReceiveVerification
            address={current}
            walletKind="single_key"
            savedDeviceIdentity={savedSignerDeviceType}
            eligibleDeviceTypes={savedSignerDeviceType ? [savedSignerDeviceType] : []}
            eligibleFingerprints={savedSignerFingerprint ? [savedSignerFingerprint] : []}
            savedSigners={savedSignerFingerprint && savedSignerLabel
              ? [{ fingerprint: savedSignerFingerprint, label: savedSignerLabel }]
              : []}
            onverified={applyVerifiedAddress}
          />{/if}<Button variant="ghost-danger" onclick={() => requestDiscard(current!)}
          ><Trash2 size={16} />{translate($locale, 'Discard')}</Button
        >
      </div>
      <button
        class="insight-toggle"
        onclick={() => (showDetails = !showDetails)}
        aria-expanded={showDetails}
        >{translate($locale, showDetails ? 'Hide' : 'Show')}
        {translate($locale, 'address details')}
        <ChevronDown size={14} class={showDetails ? 'rotated' : ''} /></button
      >
      {#if showDetails}<dl class="optional-details">
          <div>
            <dt>{translate($locale, 'Derivation')}</dt>
            <dd><code>{current.derivationPath}</code></dd>
          </div>
          <div>
            <dt>{translate($locale, 'Type')}</dt>
            <dd>{translate($locale, 'Native SegWit · BIP84')}</dd>
          </div>
          {#if current.hardwareVerifiedAt}<div>
              <dt>{translate($locale, 'Hardware verified')}</dt>
              <dd><LocalTimestamp value={current.hardwareVerifiedAt} /></dd>
            </div>{/if}{#if current.hardwareVerifiedBy}<div>
              <dt>{translate($locale, 'Signer fingerprint')}</dt>
              <dd><code>{current.hardwareVerifiedBy}</code></dd>
            </div>{/if}
        </dl>{/if}
      {#if externalSigner && !current.hardwareVerifiedAt}<p class="privacy-note">
          {translate($locale, 'Verify on the saved hardware signer before sharing this address.')}
        </p>{:else if !externalSigner}<p class="privacy-note">
          {translate(
            $locale,
            'Only an unused address awaiting payment can be discarded. Used addresses remain in your\n          history.'
          )}
        </p>{/if}
    </section>
  {:else}
    <section class="empty-state">
      <span class="empty-icon"><QrCode size={24} /></span>
      <h2>{translate($locale, 'No address awaiting payment')}</h2>
      <p>{translate($locale, 'Generate a new address and give it a permanent label.')}</p>
      <Button onclick={() => (showGenerate = true)}
        ><Plus size={17} />{translate($locale, 'New address')}</Button
      >
    </section>
  {/if}
  <div class="section-heading compact">
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
      onclick={() => (showGenerate = true)}
      ariaLabel="New receive address"><Plus size={15} />{translate($locale, 'New')}</Button
    >
  </div>
  <div class="awaiting-addresses">
    {#each awaiting as address}
      <article class:active={current?.id === address.id}>
        <button
          class="awaiting-select"
          aria-label={`${translate($locale, 'View {label}', { label: address.label })}${
            externalSigner
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
            ><strong>{addressLabelText(address)}</strong><small
              >{compactAddress(address.address)}</small
            ></span
          ><span class="right-meta"
            >{#if externalSigner}<span
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
        >
        <button
          class="awaiting-discard"
          aria-label={translate($locale, 'Discard {label}', { label: address.label })}
          onclick={() => requestDiscard(address)}><Trash2 size={15} /></button
        >
      </article>
    {:else}
      <p class="list-empty">{translate($locale, 'No active payment requests.')}</p>
    {/each}
  </div>
  <div class="section-heading compact">
    <div>
      <h2>{translate($locale, 'Address history')}</h2>
      <p>{translate($locale, 'Used and discarded addresses remain monitored.')}</p>
    </div>
  </div>
  <div class="address-history">
    {#each history as address}
      <button
        class="address-history-row"
        aria-label={translate($locale, 'View details for {label}', { label: address.label })}
        onclick={() => (detailAddress = address)}
        ><span class="status-dot" class:used={address.status === 'used'}></span><span
          ><strong>{addressLabelText(address)}</strong><small
            >{compactAddress(address.address)}</small
          ></span
        ><span class="right-meta"
          >{address.status}<small><LocalTimestamp value={address.created} /></small></span
        ><ChevronRight size={15} /></button
      >
    {:else}<p class="list-empty">{translate($locale, 'No past addresses yet.')}</p>
    {/each}
  </div>
</div>

<Modal
  open={showGenerate}
  title={translate($locale, 'New receive address')}
  description={translate(
    $locale,
    'Assignments cannot be changed. Label text can be reused intentionally.'
  )}
  onclose={() => (showGenerate = false)}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      generate();
    }}
  >
    <div class="field">
      <label for="receive-label-input">{translate($locale, 'Permanent label')}</label>
      <div class="label-token-field" aria-label={translate($locale, 'Selected labels')}>
        {#each selectedLabels as selected, index}<span
            class="label-token"
            class:label-token-armed={index === armedLabelIndex}
            ><span class="label-token-text">{selected}</span><button
              type="button"
              aria-label={translate($locale, 'Remove {label}', { label: selected })}
              onclick={() => {
                selectedLabels = selectedLabels.filter((item) => item !== selected);
                armedLabelIndex = null;
              }}><X size={13} /></button
            ></span
          >{/each}<input
          id="receive-label-input"
          aria-label={translate($locale, 'Permanent label')}
          value={label}
          oninput={(event) => updateLabelDraft(event.currentTarget.value)}
          onkeydown={handleLabelKeydown}
          placeholder={selectedLabels.length ? '' : translate($locale, 'e.g. Invoice #105')}
          maxlength="48"
        />
      </div>
      <FieldCounter value={label} max={48} />
    </div>
    {#if !$discreetMode}<div class="label-suggestions">
        {#each visibleSuggestions as suggestion}<button
            type="button"
            aria-label={translate($locale, 'Reuse {label}', { label: suggestion.text })}
            onclick={() => addDraftLabel(suggestion.text)}>{suggestion.text}</button
          >{/each}
      </div>{/if}
    <div class="modal-footer">
      <Button variant="secondary" onclick={() => (showGenerate = false)}
        >{translate($locale, 'Cancel')}</Button
      ><Button
        type="submit"
        disabled={!submissionLabels.length}
        loading={busy}
        loadingLabel={translate($locale, 'Generating address…')}
        >{translate($locale, 'Generate address')}</Button
      >
    </div>
  </form>
</Modal>
<AddressDetailsModal
  address={detailAddress}
  open={Boolean(detailAddress)}
  onclose={() => (detailAddress = null)}
/>
<Modal
  open={showQr}
  title={translate($locale, current?.label ?? 'Receive bitcoin')}
  description={translate($locale, 'Scan to pay this exact address.')}
  onclose={() => (showQr = false)}
>
  {#if current && qrDataUrl}<div class="large-qr">
      <img
        src={qrDataUrl}
        alt={translate($locale, 'Large QR code for {address}', { address: current.address })}
      /><ReadableAddress address={current.address} {copied} oncopy={copy} />
    </div>{/if}
</Modal>
<Modal
  open={showDiscard}
  title={translate($locale, 'Discard {label}?', {
    label: discardTarget?.label ?? translate($locale, 'this address')
  })}
  description={translate($locale, 'It will be retired and never shown for payment again.')}
  onclose={() => {
    showDiscard = false;
    discardTarget = null;
  }}
>
  <div class="warning-box">{translate($locale, 'Discarded addresses remain monitored.')}</div>
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        showDiscard = false;
        discardTarget = null;
      }}>{translate($locale, 'Keep address')}</Button
    ><Button
      variant="danger"
      loading={busy}
      loadingLabel={translate($locale, 'Discarding…')}
      onclick={discard}>{translate($locale, 'Discard address')}</Button
    >
  </div>
</Modal>
