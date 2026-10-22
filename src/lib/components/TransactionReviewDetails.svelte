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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.self-transfer-notice):where(.self-transfer-notice) {
    display: grid;
    gap: 3px;
    margin: 10px 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--success) 35%, var(--border));
    border-radius: var(--radius-control);
    color: var(--text);
    background: color-mix(in srgb, var(--success) 8%, var(--surface-inset));
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.self-transfer-notice):where(.self-transfer-notice) > :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.transaction-review-insight):where(.transaction-review-insight),
  :global(.self-transfer-consolidating):where(.self-transfer-consolidating) > :global(span) {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  :global(.self-transfer-notice):where(.self-transfer-notice) > :global(span) {
    color: var(--muted);
  }
  :global(.self-transfer-consolidating):where(.self-transfer-consolidating) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 42%);
    align-items: center;
    gap: 12px;
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--success) 25%, var(--border));
  }
  :global(.self-transfer-consolidating):where(.self-transfer-consolidating) > :global(span) {
    min-width: 0;
  }
  :global(.self-transfer-consolidating):where(.self-transfer-consolidating) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.self-transfer-consolidating):where(.self-transfer-consolidating) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }
  :global(.self-transfer-consolidating):where(.self-transfer-consolidating) > :global(:last-child) {
    min-width: 0;
    max-width: 100%;
    justify-self: end;
    font-weight: 700;
    text-align: right;
    white-space: nowrap;
  }
  :global(.acceleration-review-summary):where(.acceleration-review-summary) {
    display: grid;
    justify-items: center;
    gap: 5px;
    margin: 4px 0 16px;
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--success) 30%, var(--border));
    border-radius: var(--radius-inset);
    background: color-mix(in srgb, var(--success) 7%, var(--surface-inset));
    text-align: center;
  }
  :global(.acceleration-review-summary):where(.acceleration-review-summary) > :global(span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.acceleration-review-summary):where(.acceleration-review-summary)
    > :global(.formatted-amount) {
    color: var(--text);
    font-size: 25px;
  }
  :global(.acceleration-review-summary):where(.acceleration-review-summary)
    > :global(.formatted-amount small) {
    font-size: 13px;
  }
  :global(.acceleration-review-summary):where(.acceleration-review-summary) > :global(small) {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.acceleration-review-summary):where(.acceleration-review-summary) {
    margin: 10px 0;
    padding: 14px;
  }
  :global(.hardware-review-details):where(.hardware-review-details) {
    margin-top: 0;
    border-top: 0;
  }
  :global(.hardware-review-details):where(.hardware-review-details) :global(summary) {
    min-height: 43px;
    display: list-item;
    box-sizing: border-box;
    padding: 14px 0;
    width: fit-content;
    color: var(--link);
    font-size: var(--font-size-meta);
    font-weight: 700;
    cursor: pointer;
  }
  :global(.hardware-review-details[open]):where(.hardware-review-details) > :global(summary) {
    margin-bottom: 0;
  }
  :global(.hardware-review-details):where(.hardware-review-details) > :global(dl) {
    margin: 0;
    border-top: 0;
  }
  :global(.hardware-review-details):where(.hardware-review-details) > :global(dl > div:last-child) {
    border-bottom: 0;
  }
  :global(.hardware-review-details):where(.hardware-review-details) > :global(dl > div) {
    min-height: 43px;
    gap: 18px;
  }
  :global(.hardware-review-details):where(.hardware-review-details)
    > :global(dl > .transaction-review-path-row) {
    padding-block: 12px;
    align-items: center;
  }
  :global(.hardware-review-details):where(.hardware-review-details) :global(dt),
  :global(.hardware-review-details):where(.hardware-review-details) :global(dd) {
    margin: 0;
    font-size: var(--font-size-meta);
  }
  :global(.hardware-review-details):where(.hardware-review-details) :global(dt) {
    color: var(--muted);
  }
  :global(.hardware-review-details):where(.hardware-review-details) :global(dd) {
    color: var(--text);
    text-align: right;
  }
  :global(.derivation-paths):where(.derivation-paths) {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
    line-height: 1.5;
  }
  :global(.derivation-paths):where(.derivation-paths) :global(code) {
    color: inherit;
    font-size: 1em;
    font-weight: inherit;
    line-height: inherit;
  }
  :global(.transaction-review-input-total):where(.transaction-review-input-total) {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 5px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  :global(.hardware-review-details):where(.hardware-review-details)
    > :global(.transaction-review-funding) {
    margin-top: 12px;
  }
</style>
