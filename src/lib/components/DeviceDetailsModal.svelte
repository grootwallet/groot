<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    CheckCircle2,
    KeyRound,
    Maximize2,
    Pencil,
    RefreshCw,
    ShieldCheck
  } from '@lucide/svelte';
  import { compactIdentifier } from '$lib/address-display';
  import {
    normalizeSignerLabel,
    signerLabelError,
    type CosignerDraft,
    type CosignerSource
  } from '$lib/multisig/policy';
  import type { CosignerHealthCheck } from '$lib/wallet';
  import {
    DESKTOP_MANAGED_SIGNER_CONTEXT,
    LOCAL_MOBILE_SIGNER_CONTEXT,
    type CoordinationSignerContext
  } from '$lib/wallet/contracts/coordination';
  import Button from './Button.svelte';
  import HardwareActionPrompt from './HardwareActionPrompt.svelte';
  import IdentifierDetailsModal from './IdentifierDetailsModal.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import Modal from './Modal.svelte';

  let {
    signer,
    health,
    checking,
    onclose,
    oncheck,
    policyStatus = null,
    deviceContext = null,
    onpolicy,
    onrename
  } = $props<{
    signer: CosignerDraft | null;
    health: CosignerHealthCheck | null;
    checking: boolean;
    onclose: () => void;
    oncheck: () => void;
    policyStatus?: {
      label: string;
      description: string;
      attention: boolean;
      actionLabel?: string;
      verifiedAt?: string;
    } | null;
    deviceContext?: CoordinationSignerContext | null;
    onpolicy?: () => void;
    onrename?: (label: string) => Promise<void> | void;
  }>();
  let publicKeyOpen = $state(false);
  let editingName = $state(false);
  let nameDraft = $state('');
  let nameError = $state('');
  let renaming = $state(false);

  function sourceName(source: CosignerSource) {
    return {
      usb: 'USB hardware',
      qr: 'QR import',
      file: 'File import',
      manual: 'Manual backup',
      virtual: 'Virtual test device'
    }[source];
  }

  function healthLabel() {
    if (deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT) return 'Available on this phone';
    if (deviceContext === DESKTOP_MANAGED_SIGNER_CONTEXT) return 'Managed on desktop';
    if (health?.status === 'healthy') return 'Verified';
    if (health?.status === 'attention') return 'Attention';
    return 'Ready';
  }

  function connectionLabel() {
    if (deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT) return 'This phone';
    if (deviceContext === DESKTOP_MANAGED_SIGNER_CONTEXT) return 'Connect on desktop';
    return signer?.source === 'usb' || signer?.source === 'virtual'
      ? 'Ready to check'
      : 'USB connection needed';
  }

  function deviceTypeName(value: string) {
    if (value === 'groot-mobile') return 'Groot mobile';
    return value.replaceAll(/[-_]+/g, ' ').replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function startRenaming() {
    if (!signer || !onrename) return;
    nameDraft = signer.label;
    nameError = '';
    editingName = true;
  }

  function cancelRenaming() {
    editingName = false;
    nameDraft = '';
    nameError = '';
  }

  async function saveName() {
    if (!signer || !onrename || renaming) return;
    nameError = signerLabelError(nameDraft) ?? '';
    if (nameError) return;
    const normalized = normalizeSignerLabel(nameDraft);
    if (normalized === signer.label) {
      cancelRenaming();
      return;
    }
    renaming = true;
    try {
      await onrename(normalized);
      cancelRenaming();
    } catch (cause) {
      nameError = localizedError(cause, $locale, 'Could not rename this signer.');
    } finally {
      renaming = false;
    }
  }
</script>

<Modal
  open={!!signer}
  title={translate($locale, signer?.label ?? 'Signer details')}
  description={translate($locale, 'Public signer identity. No private keys stored.')}
  {onclose}
>
  {#if signer}
    <div class="device-details">
      <div class="device-identity">
        <span><KeyRound size={20} /></span>
        <div>
          <strong>{translate($locale, sourceName(signer.source))}</strong><small
            >{translate(
              $locale,
              deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT
                ? 'Signing key held by this phone'
                : deviceContext === DESKTOP_MANAGED_SIGNER_CONTEXT
                  ? 'Signer details received from desktop'
                  : signer.source === 'usb' || signer.source === 'virtual'
                    ? 'Ready to check'
                    : 'Connect signer to check'
            )}</small
          >
        </div>
        <span class="ready-badge" class:attention={health?.status === 'attention'}
          >{translate($locale, healthLabel())}</span
        >
      </div>
      {#if onrename}
        <section class="signer-name-editor">
          {#if editingName}
            <form
              onsubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
            >
              <label
                ><span>{translate($locale, 'Signer name')}</span><input
                  aria-label={translate($locale, 'Signer name')}
                  bind:value={nameDraft}
                  maxlength="48"
                  autocomplete="off"
                /></label
              >
              <div>
                <Button variant="secondary" size="small" onclick={cancelRenaming}
                  >{translate($locale, 'Cancel')}</Button
                ><Button
                  size="small"
                  type="submit"
                  loading={renaming}
                  loadingLabel={translate($locale, 'Saving…')}
                  disabled={Boolean(signerLabelError(nameDraft))}
                  >{translate($locale, 'Save name')}</Button
                >
              </div>
            </form>
            {#if nameError}<p class="form-error" role="alert">{nameError}</p>{/if}
          {:else}
            <span
              ><small>{translate($locale, 'Signer name')}</small><strong>{signer.label}</strong
              ></span
            >
            <Button variant="secondary" size="small" onclick={startRenaming}
              ><Pencil size={13} />{translate($locale, 'Edit name')}</Button
            >
          {/if}
        </section>
      {/if}
      <dl>
        <div>
          <dt>{translate($locale, 'Master fingerprint')}</dt>
          <dd><code>{signer.fingerprint}</code></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Account path')}</dt>
          <dd><code>{signer.derivationPath}</code></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Key source')}</dt>
          <dd>{translate($locale, sourceName(signer.source))}</dd>
        </div>
        {#if signer.deviceType}<div>
            <dt>{translate($locale, 'Device type')}</dt>
            <dd>{deviceTypeName(signer.deviceType)}</dd>
          </div>{/if}
        <div class="connection-detail">
          <dt>{translate($locale, 'Connection')}</dt>
          <dd>
            {translate($locale, connectionLabel())}
          </dd>
        </div>
        <div class="public-key-detail">
          <dt>{translate($locale, 'Public account key (xpub)')}</dt>
          <dd>
            <button
              class="public-key-trigger"
              aria-label={translate($locale, 'View public account key (xpub)')}
              onclick={() => (publicKeyOpen = true)}
              ><code>{compactIdentifier(signer.xpub, 18, 12)}</code><Maximize2 size={14} /></button
            >
          </dd>
        </div>
      </dl>
      {#if policyStatus}
        <section class="device-policy-status" class:attention={policyStatus.attention}>
          <span><ShieldCheck size={18} /></span>
          <div>
            <strong>{translate($locale, 'Wallet policy')}</strong>
            <small>{translate($locale, policyStatus.description)}</small>
            {#if policyStatus.verifiedAt}<small
                >{translate($locale, 'Last verified')}
                <LocalTimestamp value={policyStatus.verifiedAt} /></small
              >{/if}
          </div>
          <em>{translate($locale, policyStatus.label)}</em>
          {#if policyStatus.actionLabel && onpolicy}
            <Button variant="secondary" size="small" onclick={onpolicy}
              >{translate($locale, policyStatus.actionLabel)}</Button
            >
          {/if}
        </section>
      {/if}
      {#if !deviceContext}<section class="health-card" aria-live="polite">
          <div class="health-heading">
            <span
              class:checked={health?.status === 'healthy'}
              class:attention={health?.status === 'attention'}><CheckCircle2 size={18} /></span
            >
            <div>
              <strong>{translate($locale, 'Signer check')}</strong><small
                >{#if health}{translate($locale, 'Last checked')}
                  <LocalTimestamp value={health.checkedAt} />{:else}{translate(
                    $locale,
                    'Not\n                checked yet'
                  )}{/if}</small
              >
            </div>
          </div>
          <div class="health-card-body">
            {#if checking}
              <HardwareActionPrompt
                title={translate($locale, 'Checking signer')}
                detail={translate($locale, 'Keep it connected and unlocked.')}
                label={translate($locale, 'Checking signer')}
              />
            {:else}
              <p>
                {translate(
                  $locale,
                  health?.status === 'healthy'
                    ? 'Signer matches this wallet.'
                    : (health?.summary ?? 'Connect and unlock the signer to check it.')
                )}
              </p>
              <Button variant="secondary" class="full" onclick={oncheck}
                ><RefreshCw size={15} />{translate($locale, 'Check signer')}</Button
              >
            {/if}
          </div>
        </section>{/if}
    </div>
  {/if}
</Modal>

{#if signer}<IdentifierDetailsModal
    value={signer.xpub}
    open={publicKeyOpen}
    title={translate($locale, '{signer} public account key (xpub)', { signer: signer.label })}
    description={translate($locale, 'Derives wallet addresses. Cannot sign.')}
    label={translate($locale, 'Public account key (xpub)')}
    onclose={() => (publicKeyOpen = false)}
  />{/if}
