<script lang="ts">
  import { formatInteger, locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { compactAddress } from '$lib/address-display';
  import Amount from './Amount.svelte';
  import WarningNotice from './WarningNotice.svelte';
  import InsightTip from './InsightTip.svelte';
  import PermanentLabelTags from './PermanentLabelTags.svelte';
  import { discreetMode } from '$lib/privacy';
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
  let open = $state(false);
</script>

{#if proposal.recipientIsWalletOwned}<aside class="self-transfer-notice">
    <div class="transaction-review-insight">
      <strong>{translate($locale, 'Self-transfer')}</strong>
      <InsightTip
        label={translate($locale, 'Self-transfer')}
        text={translate(
          $locale,
          'This recipient belongs to this wallet. The network fee is the only amount leaving the wallet.'
        )}
      />
    </div>
    {#if proposal.walletControlledOutputAmount != null}<div class="self-transfer-consolidating">
        <span>
          <strong>{translate($locale, 'Consolidating')}</strong>
          <InsightTip
            label={translate($locale, 'Consolidating')}
            text={translate(
              $locale,
              'Total staying within this wallet. Compare this amount with the hardware signer.'
            )}
          />
        </span>
        <Amount value={proposal.walletControlledOutputAmount} interactive={interactiveAmounts} />
      </div>{/if}
  </aside>{/if}
{#if proposal.acceleration}<aside class="acceleration-review-summary">
    <span>{translate($locale, 'Speed-up cost')}</span>
    <Amount value={proposal.acceleration.incrementalFee} interactive={interactiveAmounts} />
    <small
      >{translate(
        $locale,
        proposal.acceleration.method === 'rbf'
          ? 'The payment amount stays the same.'
          : 'The child fee helps both transactions confirm together.'
      )}</small
    >
  </aside>{/if}
<details bind:open class:hardware-review-details={compact} class:proposal-review-details={!compact}>
  <summary>{translate($locale, open ? 'View less details' : 'View more details')}</summary>
  <WarningNotice
    class="transaction-review-funding"
    title={translate($locale, 'Coins spent together')}
    body={translate(
      $locale,
      proposal.inputs.length > 1
        ? 'Spending these coins together publicly links their sources. Their labels are shown below.'
        : 'This payment spends one coin. Its labels are shown below.'
    )}
  >
    {#if proposal.selectionImpact.fundingLabels.length}
      <PermanentLabelTags labels={proposal.selectionImpact.fundingLabels} hidden={$discreetMode} />
    {:else}<span>{translate($locale, 'No local labels')}</span>{/if}
    {#if proposal.selectionImpact.hasUnknownProvenance}<span
        >{translate($locale, 'Some coin sources are unknown.')}</span
      >{/if}
    {#if proposal.selectionImpact.hasAddressReuse}<span
        >{translate($locale, 'Some coins come from a reused address.')}</span
      >{/if}
  </WarningNotice>
  <dl class="details-list">
    {#if proposal.acceleration?.method === 'rbf'}
      <div>
        <dt>{translate($locale, 'Original fee rate')}</dt>
        <dd>{proposal.acceleration.originalFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Minimum fee rate')}</dt>
        <dd>{proposal.acceleration.minimumFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'New fee rate')}</dt>
        <dd>{proposal.acceleration.targetFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'New network fee')}</dt>
        <dd><Amount value={proposal.fee} interactive={interactiveAmounts} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Additional fee')}</dt>
        <dd>
          <Amount value={proposal.acceleration.incrementalFee} interactive={interactiveAmounts} />
        </dd>
      </div>
      <div>
        <dt>{translate($locale, 'Effective fee rate')}</dt>
        <dd>{proposal.feeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
    {:else if proposal.acceleration?.method === 'cpfp'}
      <div>
        <dt>{translate($locale, 'Parent fee rate')}</dt>
        <dd>{proposal.acceleration.originalFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Minimum package rate')}</dt>
        <dd>{proposal.acceleration.minimumFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Target package rate')}</dt>
        <dd>{proposal.acceleration.targetFeeRate} {translate($locale, 'sat/vB')}</dd>
      </div>
      <div>
        <dt>{translate($locale, 'Child network fee')}</dt>
        <dd><Amount value={proposal.fee} interactive={interactiveAmounts} /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Additional fee')}</dt>
        <dd>
          <Amount value={proposal.acceleration.incrementalFee} interactive={interactiveAmounts} />
        </dd>
      </div>
    {/if}
    <div>
      <dt>{translate($locale, 'Inputs')}</dt>
      <dd class="transaction-review-input-total">
        <span>{proposal.inputs.length} ·</span><Amount
          value={proposal.inputs.reduce((sum, input) => sum + Number(input.amount), 0)}
          interactive={interactiveAmounts}
        />
      </dd>
    </div>
    {#if inputPaths.length}<div class="transaction-review-path-row">
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
    {#if recipientPaths.length}<div class="transaction-review-path-row">
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
    {#if changePaths.length}<div class="transaction-review-path-row">
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
      <dd>
        {formatInteger(proposal.locktime, $locale)}{' · '}{translate(
          $locale,
          proposal.rbf ? 'Enabled' : 'Disabled'
        )}
      </dd>
    </div>
    {#if policy}<div>
        <dt>{translate($locale, 'Wallet policy')}</dt>
        <dd>{policy}</dd>
      </div>{/if}
  </dl>
</details>
