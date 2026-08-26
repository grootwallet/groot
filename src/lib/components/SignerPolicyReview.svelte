<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { AlertTriangle, Check, ShieldCheck } from '@lucide/svelte';
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
  import ReadableAddress from './ReadableAddress.svelte';

  let {
    wallet,
    signer,
    policyAddress,
    verification = null,
    busy = false,
    error = '',
    action = 'verify',
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
    onverify?: () => void;
    oncontinue?: () => void;
    onshowtransaction?: () => void;
    onback?: () => void;
  }>();
  let signerDetailsOpen = $state(false);
  let signerDetailsReviewed = $state(false);
  let addressCopied = $state(false);
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
      <small
        >{#if verification}{translate(
            $locale,
            kind === 'ledger' ? 'Previously compared' : 'Verified'
          )}
          <LocalTimestamp value={verification.verifiedAt} />
          {translate($locale, 'with signer')}
          <code>{verification.signerFingerprint}</code>.{:else}{translate(
            $locale,
            'Reject if any value differs on'
          )}
          {deviceName}.{/if}</small
      >
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
      <p>
        {translate($locale, 'Ledger may label the keys @0 through @')}{wallet.cosigners.length - 1}
        {translate(
          $locale,
          'in a different order. Match\n        the complete values, not the position.'
        )}
      </p>
      {#if verification}<p class="policy-repeat-note">
          {translate(
            $locale,
            "Groot's current Ledger connection must authorize this policy again for each signing\n          request. Keep this reference open until Ledger reaches the transaction."
          )}
        </p>{/if}
    </div>
  {:else if isBitBox}
    <div class="policy-device-warning">
      <strong>{translate($locale, 'Review on BitBox')}</strong>
      <p>
        {translate(
          $locale,
          'Enter a new device-local account name. BitBox shows the script type, account path, every account xpub, and the first address; signer fingerprints remain a Groot reference.'
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
      ><span
        ><strong>{translate($locale, 'Signer key reference')}</strong><small
          >{translate($locale, 'Open while reviewing the values shown by the device.')}</small
        ></span
      ><em
        >{translate(
          $locale,
          signerDetailsOpen ? 'Hide' : signerDetailsReviewed ? 'Review again' : 'Review'
        )}</em
      ></summary
    >
    <PolicySignerList signers={wallet.cosigners} currentFingerprint={signer.fingerprint} />
  </details>

  <section class="policy-address-check" aria-label={translate($locale, 'First address to verify')}>
    <div>
      <strong
        >{translate(
          $locale,
          isBitBox ? 'Address shown after registration' : 'First address reference'
        )}</strong
      ><small
        >{isBitBox
          ? translate($locale, '{device} shows this after policy approval.', {
              device: deviceName
            })
          : translate($locale, 'Compare this when it appears on the device.')}</small
      >
    </div>
    <ReadableAddress address={displayedAddress} copied={addressCopied} oncopy={copyAddress} />
    <small class="policy-address-purpose">
      {translate(
        $locale,
        'Verification reference only. Do not fund this address directly; after the wallet is created,\n      use Receive to create a permanently labeled payment request.'
      )}
    </small>
    {#if testnetAddressDevice}<small
        >{testnetAddressDevice}
        {translate($locale, 'displays the Regtest script with a')}
        <code>{translate($locale, 'tb1')}</code>
        {translate(
          $locale,
          'prefix. Rust verified\n        that it decodes to the identical Bitcoin output script.'
        )}</small
      >{/if}
  </section>

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
        >{deviceName} {translate($locale, 'policy approved — show transaction')}</Button
      >
    {:else}<Button onclick={oncontinue}
        >{translate($locale, 'Start')} {deviceName} {translate($locale, 'review & signing')}</Button
      >{/if}
  </div>
</section>
