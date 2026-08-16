<script lang="ts">
  import { Check, ShieldCheck } from '@lucide/svelte';
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
  let acknowledged = $state(false);
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

<section class="signer-policy-review" aria-label="Hardware wallet policy review">
  <header>
    <span class:verified={!!verification}><ShieldCheck size={19} /></span>
    <div>
      <strong
        >{verification
          ? kind === 'ledger'
            ? 'Policy reference saved in Groot'
            : 'Wallet policy previously verified'
          : `${wallet.threshold} of ${wallet.cosigners.length} wallet policy`}</strong
      >
      <small
        >{#if verification}{kind === 'ledger' ? 'Previously compared' : 'Verified'}
          <LocalTimestamp value={verification.verifiedAt} /> with signer
          <code>{verification.signerFingerprint}</code>.{:else}Reject if any value differs on
          {deviceName}.{/if}</small
      >
    </div>
  </header>

  {#if kind === 'ledger'}
    <div class="policy-device-expectation">
      <strong>Ledger will show</strong>
      <dl>
        <div>
          <dt>Account name</dt>
          <dd>{ledgerAccountName}</dd>
        </div>
        <div>
          <dt>Spending policy</dt>
          <dd>Any {wallet.threshold} of {wallet.cosigners.length} keys must sign</dd>
        </div>
      </dl>
      <p>
        Ledger may label the keys @0 through @{wallet.cosigners.length - 1} in a different order. Match
        the complete values, not the position.
      </p>
      {#if verification}<p class="policy-repeat-note">
          Groot's current Ledger connection must authorize this policy again for each signing
          request. Keep this reference open until Ledger reaches the transaction.
        </p>{/if}
    </div>
  {:else if isBitBox}
    <div class="policy-device-warning">
      <strong>Use a new BitBox account name</strong>
      <p>
        It is separate from the Groot wallet name. Try “Groot {wallet.threshold}of{wallet.cosigners
          .length} B”.
      </p>
    </div>
  {:else if kind === 'jade'}
    <div class="policy-device-expectation">
      <strong>Jade will show</strong>
      <p>
        Register the {wallet.threshold}-of-{wallet.cosigners.length} policy, then compare the first address.
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
        ><strong>Signer keys to compare</strong><small
          >{wallet.cosigners.length} signers · fingerprint, path, and public key</small
        ></span
      ><em>{signerDetailsOpen ? 'Hide' : signerDetailsReviewed ? 'Review again' : 'Review'}</em
      ></summary
    >
    <PolicySignerList signers={wallet.cosigners} currentFingerprint={signer.fingerprint} />
  </details>

  <section class="policy-address-check" aria-label="First address to verify">
    <div>
      <strong>{isBitBox ? 'Address shown after registration' : 'First address to verify'}</strong
      ><small
        >{isBitBox
          ? `${deviceName} shows this after policy approval.`
          : 'Approve only if the device shows this exact address.'}</small
      >
    </div>
    <ReadableAddress address={displayedAddress} copied={addressCopied} oncopy={copyAddress} />
    {#if testnetAddressDevice}<small
        >{testnetAddressDevice} displays the Regtest script with a <code>tb1</code> prefix. Rust verified
        that it decodes to the identical Bitcoin output script.</small
      >{/if}
  </section>

  <label class="policy-review-confirmation"
    ><input type="checkbox" disabled={!signerDetailsReviewed} bind:checked={acknowledged} /><span
      ><strong>I compared the threshold and every signer key</strong><small
        >{signerDetailsReviewed
          ? 'Reject the operation if even one character differs.'
          : 'Open “Signer keys to compare” first.'}</small
      ></span
    ></label
  >
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  <div class="modal-footer policy-review-actions">
    {#if onback}<Button variant="secondary" disabled={busy} onclick={onback}>Back</Button>{/if}
    {#if action === 'verify'}<Button
        disabled={!acknowledged}
        loading={busy}
        loadingLabel={`Follow ${deviceName}…`}
        onclick={onverify}
        ><Check size={15} />{isBitBox ? 'Begin on BitBox' : 'Verify policy & first address'}</Button
      >
    {:else if busy}<Button onclick={onshowtransaction}
        >{deviceName} policy approved — show transaction</Button
      >
    {:else}<Button disabled={!acknowledged} onclick={oncontinue}
        >Start {deviceName} review & signing</Button
      >{/if}
  </div>
</section>
