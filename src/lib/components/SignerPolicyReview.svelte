<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { AlertTriangle, Check, ChevronRight, ShieldCheck } from '@lucide/svelte';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import type {
    MultisigWallet,
    PolicyVerificationAddress,
    SignerPolicyVerification
  } from '$lib/wallet';
  import { policyDeviceName, policyReadinessKind } from '$lib/hardware/policy-readiness';
  import {
    addressForHardwareDisplay,
    testnetAddressDisplayName
  } from '$lib/wallet/hardware-display';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import Button from './Button.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import PolicySignerList from './PolicySignerList.svelte';
  import HardwareAddressComparison from './HardwareAddressComparison.svelte';
  import { compactAddress } from '$lib/address-display';

  let {
    wallet,
    signer,
    policyAddress,
    verification = null,
    busy = false,
    error = '',
    action = 'verify',
    showAddressReference = true,
    onverify,
    oncontinue,
    onshowtransaction,
    onback
  } = $props<{
    wallet: MultisigWallet;
    signer: CosignerDraft;
    policyAddress: PolicyVerificationAddress;
    verification?: SignerPolicyVerification | null;
    busy?: boolean;
    error?: string;
    action?: 'verify' | 'sign';
    showAddressReference?: boolean;
    onverify?: () => void;
    oncontinue?: () => void;
    onshowtransaction?: () => void;
    onback?: () => void;
  }>();
  let signerDetailsOpen = $state(false);
  let signerDetailsReviewed = $state(false);
  let addressCopied = $state(false);
  let addressExpanded = $state(false);
  const kind = $derived(policyReadinessKind(signer));
  const isBitBox = $derived(kind === 'bitbox02' || kind === 'bitbox_nova');
  const deviceName = $derived(policyDeviceName(kind));
  const ledgerAccountName = $derived(`${wallet.threshold} of ${wallet.cosigners.length} Multisig`);
  const testnetAddressDevice = $derived(
    policyAddress.testnetAlias ? testnetAddressDisplayName(kind) : null
  );
  const displayedAddress = $derived(
    addressForHardwareDisplay(policyAddress.canonicalAddress, policyAddress.testnetAlias, kind)
  );

  async function copyAddress() {
    await copyText(displayedAddress, 'public-wallet-data');
    addressCopied = true;
    toast({ title: 'First address copied', tone: 'success' });
    setTimeout(() => (addressCopied = false), 1_500);
  }
</script>

<section
  class="signer-policy-review"
  aria-label={translate($locale, 'Hardware signer policy review')}
>
  {#if action === 'sign' && kind === 'ledger'}<p class="policy-review-step">
      {translate($locale, 'Step 1 of 2 · Wallet policy')}
    </p>{/if}
  <header>
    <span class:verified={!!verification}><ShieldCheck size={19} /></span>
    <div>
      <strong
        >{translate(
          $locale,
          verification
            ? kind === 'ledger'
              ? 'Policy reference saved in Groot'
              : 'Wallet policy previously verified'
            : translate($locale, '{threshold} of {total} wallet policy', {
                threshold: wallet.threshold,
                total: wallet.cosigners.length
              })
        )}</strong
      >
      {#if verification}<small
          >{#if verification && action === 'sign'}{translate($locale, 'Signer')}
            <code>{verification.signerFingerprint}</code>{:else if verification}{translate(
              $locale,
              kind === 'ledger' ? 'Previously compared' : 'Verified'
            )}
            <LocalTimestamp value={verification.verifiedAt} /> ·
            <code>{verification.signerFingerprint}</code>{/if}</small
        >{/if}
    </div>
  </header>

  {#if kind === 'ledger'}
    <div class="policy-device-expectation">
      <strong>{translate($locale, 'Ledger will show')}</strong>
      <dl>
        <div>
          <dt>{translate($locale, 'Account name')}</dt>
          <dd>{ledgerAccountName}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Spending policy')}</dt>
          <dd>
            {translate($locale, 'Any')}
            {wallet.threshold} of {wallet.cosigners.length}
            {translate($locale, 'keys must sign')}
          </dd>
        </div>
      </dl>
    </div>
  {:else if isBitBox}
    <div class="policy-device-expectation">
      <strong>{translate($locale, 'Review on BitBox')}</strong>
      <p>
        {translate(
          $locale,
          'Enter a new device-local account name. Review the details on your device.'
        )}
      </p>
    </div>
  {:else if kind === 'jade'}
    <div class="policy-device-expectation">
      <strong>{translate($locale, 'Jade will show')}</strong>
      <p>
        {translate($locale, 'Register the')}
        {wallet.threshold}-of-{wallet.cosigners.length}
        {translate($locale, 'policy, then compare the first address.')}
      </p>
    </div>
  {/if}

  <details
    class="policy-signer-details"
    bind:open={signerDetailsOpen}
    ontoggle={(event) => {
      if (event.currentTarget.open) signerDetailsReviewed = true;
    }}
  >
    <summary
      ><span><strong>{translate($locale, 'Signer keys to compare')}</strong></span><span
        class="policy-signer-details-state"
        ><em
          >{translate(
            $locale,
            signerDetailsOpen ? 'Hide' : signerDetailsReviewed ? 'Review again' : 'Review'
          )}</em
        ><ChevronRight class="policy-signer-details-chevron" size={15} aria-hidden="true" /></span
      ></summary
    >
    <PolicySignerList signers={wallet.cosigners} currentFingerprint={signer.fingerprint} />
  </details>

  {#if showAddressReference}<section
      class="policy-address-check"
      aria-label={translate($locale, 'First address to verify')}
    >
      <div>
        <strong
          >{translate(
            $locale,
            isBitBox ? 'Address shown after registration' : 'First address reference'
          )}</strong
        >{#if action !== 'sign'}<small
            >{isBitBox
              ? translate($locale, '{device} shows this after policy approval.', {
                  device: deviceName
                })
              : translate($locale, 'Compare this when it appears on the device.')}</small
          >{/if}
      </div>
      <button
        type="button"
        class="policy-address-summary"
        aria-expanded={addressExpanded}
        onclick={() => (addressExpanded = !addressExpanded)}
        ><code>{compactAddress(displayedAddress)}</code><span
          >{translate($locale, addressExpanded ? 'Hide full address' : 'Show full address')}</span
        ></button
      >
      {#if addressExpanded}<HardwareAddressComparison
          comparison={{ address: displayedAddress, deviceName: testnetAddressDevice }}
          derivationPath={policyAddress.derivationPath}
          addressIndex={0}
          copied={addressCopied}
          oncopy={copyAddress}
        />{/if}
      {#if testnetAddressDevice}<small
          >{testnetAddressDevice}
          {translate($locale, 'displays the Regtest script with a')}
          <code>{translate($locale, 'tb1')}</code>
          {translate(
            $locale,
            'prefix. Rust verified\n        that it decodes to the identical Bitcoin output script.'
          )}</small
        >{/if}
    </section>{/if}

  {#if error}<div class="hardware-inline-error" role="alert" aria-live="polite">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Device needs attention')}</strong><small>{error}</small></span
      >
    </div>{/if}
  <div class="modal-footer policy-review-actions">
    {#if onback}<Button variant="secondary" disabled={busy} onclick={onback}
        >{translate($locale, 'Back')}</Button
      >{/if}
    {#if action === 'verify'}<Button
        loading={busy}
        loadingLabel={translate($locale, 'Follow {device}…', { device: deviceName })}
        onclick={onverify}
        ><Check size={15} />{translate($locale, 'Review on {device}', {
          device: deviceName
        })}</Button
      >
    {:else if busy}<Button onclick={onshowtransaction}
        >{translate($locale, 'Wallet policy reviewed. Show transaction')}</Button
      >
    {:else}<Button onclick={oncontinue}
        >{translate($locale, 'Review & sign on {device}', { device: deviceName })}</Button
      >{/if}
  </div>
</section>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.policy-device-expectation):where(.policy-device-expectation) {
    display: grid;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.policy-device-expectation):where(.policy-device-expectation) > :global(strong) {
    font-size: 14px;
  }
  :global(.policy-device-expectation):where(.policy-device-expectation) :global(p) {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.policy-device-expectation):where(.policy-device-expectation) :global(dl) {
    display: grid;
    gap: 7px;
    margin: 0;
  }
  :global(.policy-device-expectation):where(.policy-device-expectation) :global(dl div) {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 10px;
    font-size: var(--font-size-meta);
  }
  :global(.policy-device-expectation):where(.policy-device-expectation) :global(dt) {
    color: var(--muted);
  }
  :global(.policy-device-expectation):where(.policy-device-expectation) :global(dd) {
    margin: 0;
    color: var(--text);
    font-weight: 400;
    text-align: right;
  }
  :global(.policy-address-check):where(.policy-address-check) {
    display: grid;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }

  :global(.policy-address-summary):where(.policy-address-summary) {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
    color: var(--text);
    padding: 0.85rem 1rem;
    text-align: left;
    cursor: pointer;
  }

  :global(.policy-address-summary):where(.policy-address-summary) :global(code) {
    font-size: 0.95rem;
    font-weight: 500;
  }

  :global(.policy-address-summary):where(.policy-address-summary) :global(span) {
    color: var(--link);
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
  }

  :global(.policy-address-summary:hover):where(.policy-address-summary),
  :global(.policy-address-summary:focus-visible):where(.policy-address-summary) {
    border-color: var(--focus);
    outline: none;
  }

  :global(.policy-review-step):where(.policy-review-step) {
    margin: 0 0 2px;
    color: var(--link);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  :global(.policy-address-check):where(.policy-address-check) > :global(div:first-child) {
    display: grid;
    gap: 3px;
  }
  :global(.policy-address-check):where(.policy-address-check) > :global(div:first-child strong) {
    font-size: 14px;
  }
  :global(.policy-address-check):where(.policy-address-check) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }

  @media (max-width: 760px) {
    :global(.policy-device-expectation):where(.policy-device-expectation) :global(dl div) {
      grid-template-columns: 1fr;
    }
    :global(.policy-device-expectation):where(.policy-device-expectation) :global(dd) {
      text-align: left;
    }
  }
</style>
