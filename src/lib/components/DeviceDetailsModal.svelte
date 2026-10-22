<script lang="ts">
  import WarningNotice from './WarningNotice.svelte';
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
    oncheck?: () => void;
    policyStatus?: {
      label: string;
      description: string;
      attention: boolean;
      actionLabel?: string;
      verifiedAt?: string;
      acknowledgement?: boolean;
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

  function signerSourceName(signer: CosignerDraft) {
    return signer.deviceType === 'groot-mobile' ? 'QR connection' : sourceName(signer.source);
  }
  function sourceName(source: CosignerSource) {
    if (deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT) return 'Phone key';
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
    if (signer?.deviceType === 'groot-mobile') return 'QR connection';
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
  description={translate(
    $locale,
    deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT
      ? 'Encrypted signing key stored on this phone.'
      : 'Public signer identity. No private keys stored.'
  )}
  {onclose}
>
  {#if signer}
    <div class="device-details">
      <div class="device-identity">
        <span><KeyRound size={20} /></span>
        <div>
          <strong>{translate($locale, signerSourceName(signer))}</strong><small
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
            {#if nameError}<WarningNotice tone="danger" icon role="alert" body={nameError} />{/if}
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
          <dd>
            {translate($locale, signerSourceName(signer))}
          </dd>
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
                >{translate(
                  $locale,
                  policyStatus.acknowledgement ? 'Import recorded' : 'Last verified'
                )}
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
      {#if deviceContext !== DESKTOP_MANAGED_SIGNER_CONTEXT}<section
          class="health-card"
          aria-live="polite"
        >
          <div class="health-heading">
            <span
              class:checked={health?.status === 'healthy'}
              class:attention={health?.status === 'attention'}><CheckCircle2 size={18} /></span
            >
            <div>
              <strong
                >{translate(
                  $locale,
                  deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT ? 'Phone key check' : 'Signer check'
                )}</strong
              ><small
                >{#if health}{translate($locale, 'Last checked')}
                  <LocalTimestamp value={health.checkedAt} />{:else}{translate(
                    $locale,
                    'Not checked yet'
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
              {#if health?.status === 'attention'}<WarningNotice
                  tone="danger"
                  icon
                  role="alert"
                  title={translate($locale, 'Health check needs attention')}
                  body={translate($locale, health.summary)}
                />{:else}
                <p>
                  {translate(
                    $locale,
                    health?.status === 'healthy'
                      ? deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT
                        ? health.summary
                        : 'Signer matches this wallet.'
                      : (health?.summary ??
                          (deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT
                            ? 'Enter the app PIN to prove this phone key still matches the wallet.'
                            : 'Connect and unlock the signer to check it.'))
                  )}
                </p>
              {/if}
              {#if oncheck}<Button variant="secondary" class="full" onclick={() => oncheck?.()}
                  ><RefreshCw size={15} />{translate(
                    $locale,
                    deviceContext === LOCAL_MOBILE_SIGNER_CONTEXT
                      ? 'Check phone key'
                      : 'Check signer'
                  )}</Button
                >{/if}
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

<style>
  .connection-detail {
    grid-column: 1 / -1;
  }
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.device-details):where(.device-details) {
    display: grid;
    gap: 16px;
  }
  :global(.device-identity):where(.device-identity) {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  :global(.device-identity):where(.device-identity) > :global(span:first-child) {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: var(--radius-inset);
  }
  :global(.device-identity):where(.device-identity) > :global(div) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.device-identity):where(.device-identity) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.device-details):where(.device-details) :global(dl) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--border);
  }
  :global(.device-details):where(.device-details) :global(dl > div) {
    min-width: 0;
    padding: 12px;
    background: var(--surface-control);
  }
  :global(.device-details):where(.device-details) :global(dt) {
    margin-bottom: 5px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  :global(.device-details):where(.device-details) :global(dd) {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.device-details):where(.device-details) :global(dd code) {
    color: var(--text);
    font-size: var(--font-size-meta);
  }
  :global(.device-details):where(.device-details) :global(.public-key-detail) {
    grid-column: 1 / -1;
  }
  :global(.public-key-detail):where(.public-key-detail) :global(dd) {
    min-width: 0;
  }
  :global(.public-key-trigger):where(.public-key-trigger) {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  :global(.public-key-trigger:hover):where(.public-key-trigger) {
    color: var(--link);
    background: var(--surface-hover);
  }
  :global(.public-key-trigger):where(.public-key-trigger) :global(code) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.health-card):where(.health-card) {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel-2);
  }
  :global(.health-heading):where(.health-heading) {
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 10px;
    align-items: center;
  }
  :global(.health-heading):where(.health-heading) > :global(span) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: var(--surface-icon);
    border-radius: var(--radius-control);
  }
  :global(.health-heading):where(.health-heading) > :global(span.checked) {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 8%, transparent);
  }
  :global(.health-heading):where(.health-heading) > :global(span.attention) {
    color: var(--danger);
    background: rgba(239, 100, 100, 0.08);
  }
  :global(.health-heading):where(.health-heading) :global(div) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.health-heading):where(.health-heading) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.health-heading):where(.health-heading) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.health-card):where(.health-card) :global(p) {
    margin: 11px 0 13px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.signer-name-editor):where(.signer-name-editor) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
  }
  :global(.signer-name-editor):where(.signer-name-editor) > :global(span) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  :global(.signer-name-editor):where(.signer-name-editor) :global(small),
  :global(.signer-name-editor):where(.signer-name-editor) :global(label > span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  :global(.signer-name-editor):where(.signer-name-editor) :global(strong) {
    overflow: hidden;
    font-size: var(--font-size-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.signer-name-editor):where(.signer-name-editor) :global(form) {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 10px;
  }
  :global(.signer-name-editor):where(.signer-name-editor) :global(label) {
    display: grid;
    gap: 6px;
  }
  :global(.signer-name-editor):where(.signer-name-editor) :global(input) {
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    color: var(--text);
    background: var(--surface-inset);
    font: inherit;
    font-size: var(--font-size-meta);
  }
  :global(.signer-name-editor):where(.signer-name-editor) :global(form > div) {
    display: flex;
    gap: 7px;
  }
  :global(.device-policy-status):where(.device-policy-status) {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--success) 28%, var(--border));
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--success) 6%, var(--panel));
  }
  :global(.device-policy-status):where(.device-policy-status) > :global(span) {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--success);
    background: var(--surface-icon);
  }
  :global(.device-policy-status):where(.device-policy-status) > :global(div) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  :global(.device-policy-status):where(.device-policy-status) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.device-policy-status):where(.device-policy-status) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.device-policy-status):where(.device-policy-status) :global(em) {
    color: var(--success);
    font-size: var(--font-size-meta);
    font-style: normal;
    font-weight: 700;
    white-space: nowrap;
  }
  :global(.device-policy-status.attention):where(.device-policy-status) {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
    background: var(--accent-soft);
  }
  :global(.device-policy-status.attention):where(.device-policy-status) > :global(span),
  :global(.device-policy-status.attention):where(.device-policy-status) :global(em) {
    color: var(--accent);
  }
  :global(.device-policy-status):where(.device-policy-status) :global(.button) {
    grid-column: 2 / -1;
    justify-self: start;
  }
  :global(.health-card-body):where(.health-card-body) {
    margin-top: 14px;
  }
  :global(.health-card-body):where(.health-card-body) > :global(p) {
    margin-top: 0;
  }

  @media (max-width: 760px) {
    :global(.signer-name-editor):where(.signer-name-editor) :global(form) {
      grid-template-columns: 1fr;
    }
    :global(.signer-name-editor):where(.signer-name-editor) :global(form > div) {
      justify-content: stretch;
    }
    :global(.signer-name-editor):where(.signer-name-editor) :global(form > div .button) {
      flex: 1;
    }
    :global(.device-details):where(.device-details) :global(dl) {
      grid-template-columns: 1fr;
    }
    :global(.device-details):where(.device-details) :global(.public-key-detail) {
      grid-column: auto;
    }
    :global(.device-policy-status):where(.device-policy-status) {
      grid-template-columns: 30px minmax(0, 1fr);
    }
    :global(.device-policy-status):where(.device-policy-status) :global(em),
    :global(.device-policy-status):where(.device-policy-status) :global(.button) {
      grid-column: 2;
    }
  }
</style>
