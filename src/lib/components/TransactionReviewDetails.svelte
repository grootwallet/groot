<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { compactAddress } from '$lib/address-display';
  import Amount from './Amount.svelte';
  import type { MultisigProposal, PaymentProposal } from '$lib/wallet';

  let {
    proposal,
    onChangeAddress,
    changeAddressOverride = null,
    policy = '',
    compact = false,
    interactiveAmounts = false
  }: {
    proposal: PaymentProposal | MultisigProposal;
    onChangeAddress: () => void;
    changeAddressOverride?: string | null;
    policy?: string;
    compact?: boolean;
    interactiveAmounts?: boolean;
  } = $props();

  const inputPaths = $derived([
    ...new Set(proposal.inputs.flatMap((input) => input.derivationPaths ?? []))
  ]);
  const recipientPaths = $derived([...new Set(proposal.recipientDerivationPaths ?? [])]);
  const changePaths = $derived([...new Set(proposal.changeDerivationPaths?.flat() ?? [])]);
</script>

{#if proposal.recipientIsWalletOwned}<aside class="self-transfer-notice">
    <strong>{translate($locale, 'Self-transfer')}</strong>
    <span
      >{translate(
        $locale,
        'This recipient belongs to this wallet. The network fee is the only amount leaving the wallet.'
      )}</span
    >
    {#if proposal.walletControlledOutputAmount != null}<div class="self-transfer-consolidating">
        <span>
          <strong>{translate($locale, 'Consolidating')}</strong>
          <small
            >{translate(
              $locale,
              'Total staying within this wallet. Compare this amount with the hardware signer.'
            )}</small
          >
        </span>
        <Amount value={proposal.walletControlledOutputAmount} interactive={interactiveAmounts} />
      </div>{/if}
  </aside>{/if}
{#if proposal.acceleration?.method === 'rbf'}<aside class="info-banner acceleration-review-summary">
    <strong>{translate($locale, 'Fee increase replacement')}</strong>
    <dl class="details-list">
      <div>
        <dt>{translate($locale, 'Original effective rate')}</dt>
        <dd>{proposal.acceleration.originalFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Exact replacement minimum')}</dt>
        <dd>{proposal.acceleration.minimumFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Selected target')}</dt>
        <dd>{proposal.acceleration.targetFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Replacement fee')}</dt>
        <dd><Amount value={proposal.fee} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Incremental fee')}</dt>
        <dd><Amount value={proposal.acceleration.incrementalFee} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Resulting effective rate')}</dt>
        <dd>{proposal.feeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
    </dl>
    <span
      >{translate(
        $locale,
        'Whole-satoshi fee construction can make the resulting effective rate differ slightly from the selected target.'
      )}</span
    >
  </aside>{/if}
<details class:hardware-review-details={compact} class:proposal-review-details={!compact}>
  <summary>{translate($locale, 'View more details')}</summary>
  <dl class:details-list={!compact}>
    <div>
      <dt>{translate($locale, 'Inputs')}</dt>
      <dd>
        {proposal.inputs.length}{' · '}<Amount
          value={proposal.inputs.reduce((sum, input) => sum + Number(input.amount), 0)}
          interactive={interactiveAmounts}
        />
      </dd>
    </div>
    {#if inputPaths.length}<div>
        <dt>
          {translate($locale, 'Input')}
          {translate($locale, inputPaths.length === 1 ? 'path' : 'paths')}
        </dt>
        <dd class="derivation-paths">
          {#each inputPaths as path}<code>{path}</code>{/each}
        </dd>
      </div>{/if}
    <div>
      <dt>{translate($locale, 'Outputs')}</dt>
      <dd>{proposal.outputCount}</dd>
    </div>
    {#if recipientPaths.length}<div>
        <dt>
          {translate($locale, recipientPaths.length === 1 ? 'Receive path' : 'Receive paths')}
        </dt>
        <dd class="derivation-paths">
          {#each recipientPaths as path}<code>{path}</code>{/each}
        </dd>
      </div>{/if}
    <div>
      <dt>{translate($locale, 'Fee rate')}</dt>
      <dd>{proposal.feeRate} {translate($locale, 'sat/vB')}</dd>
    </div>
    <div>
      <dt>{translate($locale, 'Change')}</dt>
      <dd><Amount value={Number(proposal.change)} interactive={interactiveAmounts} /></dd>
    </div>
    {#if proposal.changeAddresses[0]}
      <div>
        <dt>{translate($locale, 'Change address')}</dt>
        <dd>
          <button
            type="button"
            class={compact ? 'compact-address-button' : 'address-review-trigger mono'}
            aria-label={translate($locale, 'View complete change address')}
            onclick={onChangeAddress}
            >{compactAddress(changeAddressOverride ?? proposal.changeAddresses[0])}</button
          >
        </dd>
      </div>
    {/if}
    {#if changePaths.length}<div>
        <dt>
          {translate($locale, 'Change')}
          {translate($locale, changePaths.length === 1 ? 'path' : 'paths')}
        </dt>
        <dd class="derivation-paths">
          {#each changePaths as path}<code>{path}</code>{/each}
        </dd>
      </div>{/if}
    <div>
      <dt>{translate($locale, 'Locktime / RBF')}</dt>
      <dd>{proposal.locktime}{' · '}{translate($locale, proposal.rbf ? 'Enabled' : 'Disabled')}</dd>
    </div>
    {#if policy}<div>
        <dt>{translate($locale, 'Wallet policy')}</dt>
        <dd>{policy}</dd>
      </div>{/if}
  </dl>
</details>
