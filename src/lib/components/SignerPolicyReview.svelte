<script lang="ts">
  import { Check, ShieldCheck } from '@lucide/svelte';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import type { MultisigWallet, PolicyVerificationAddress, SignerPolicyVerification } from '$lib/wallet';
  import { policyDeviceName, policyReadinessKind } from '$lib/hardware/policy-readiness';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import Button from './Button.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import PolicySignerList from './PolicySignerList.svelte';
  import ReadableAddress from './ReadableAddress.svelte';

  let { wallet, signer, policyAddress, verification = null, busy = false, error = '', action = 'verify', onverify, oncontinue, onshowtransaction, onback } = $props<{
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
  let addressCopied = $state(false);
  const kind = $derived(policyReadinessKind(signer));
  const deviceName = $derived(policyDeviceName(kind));
  const ledgerAccountName = $derived(`${wallet.threshold} of ${wallet.cosigners.length} Multisig`);
  const displayedAddress = $derived(kind === 'ledger' && policyAddress.ledgerTestnetAlias ? policyAddress.ledgerTestnetAlias : policyAddress.canonicalAddress);

  async function copyAddress() {
    await copyText(displayedAddress, 'public-wallet-data');
    addressCopied = true;
    toast({ title: 'First address copied', tone: 'success' });
    setTimeout(() => addressCopied = false, 1_500);
  }
</script>

<section class="signer-policy-review" aria-label="Hardware wallet policy review">
  <header>
    <span class:verified={!!verification}><ShieldCheck size={19}/></span>
    <div>
      <strong>{verification ? (kind === 'ledger' ? 'Policy reference saved in Groot' : 'Wallet policy previously verified') : `Verify this wallet policy on ${deviceName}`}</strong>
      <small>{#if verification}{kind === 'ledger' ? 'Previously compared' : 'Verified'} <LocalTimestamp value={verification.verifiedAt}/> with signer <code>{verification.signerFingerprint}</code>.{:else}Compare the account, keys, and first address. Reject if anything differs.{/if}</small>
    </div>
  </header>

  {#if kind === 'ledger'}
    <div class="policy-device-expectation">
      <strong>Ledger will show</strong>
      <dl><div><dt>Account name</dt><dd>{ledgerAccountName}</dd></div><div><dt>Spending policy</dt><dd>Any {wallet.threshold} of {wallet.cosigners.length} keys must sign</dd></div></dl>
      <p>Ledger may label the keys @0 through @{wallet.cosigners.length - 1} in a different order. Match the complete values, not the position.</p>
      {#if verification}<p class="policy-repeat-note">Groot's current Ledger connection must authorize this policy again for each signing request. Keep this reference open until Ledger reaches the transaction.</p>{/if}
    </div>
  {:else if kind === 'bitbox02'}
    <div class="policy-device-expectation"><strong>BitBox will show</strong><p>The wallet name, {wallet.threshold}-of-{wallet.cosigners.length} threshold, every signer public key, and which key belongs to this BitBox. First-use address verification registers the policy.</p></div>
  {:else if kind === 'jade'}
    <div class="policy-device-expectation"><strong>Jade will show</strong><p>The multisig registration details before it can verify receive and change addresses. Compare the threshold and every signer identity.</p></div>
  {/if}

  <section class="policy-address-check" aria-label="First address to verify">
    <div><strong>First address to verify</strong><small>Approve only if the device shows this exact address.</small></div>
    <ReadableAddress address={displayedAddress} copied={addressCopied} oncopy={copyAddress}/>
    {#if kind === 'ledger' && policyAddress.ledgerTestnetAlias}<small>Ledger Bitcoin Test displays the Regtest script with a <code>tb1</code> prefix.</small>{/if}
  </section>

  <PolicySignerList signers={wallet.cosigners} currentFingerprint={signer.fingerprint}/>

  <label class="policy-review-confirmation"><input type="checkbox" bind:checked={acknowledged}/><span><strong>I will compare every fingerprint, path, and public key</strong><small>The long public keys wrap across several device screens. Reject the operation if even one character or the threshold differs.</small></span></label>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  <div class="modal-footer policy-review-actions">
    {#if onback}<Button variant="secondary" disabled={busy} onclick={onback}>Back</Button>{/if}
    {#if action === 'verify'}<Button disabled={!acknowledged} loading={busy} loadingLabel={`Waiting for ${deviceName}…`} onclick={onverify}><Check size={15}/>Verify policy & first address</Button>
    {:else if busy}<Button onclick={onshowtransaction}>{deviceName} policy approved — show transaction</Button>
    {:else}<Button disabled={!acknowledged} onclick={oncontinue}>Start {deviceName} review & signing</Button>{/if}
  </div>
</section>
