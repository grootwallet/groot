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
    compact = false
  }: {
    proposal: PaymentProposal | MultisigProposal;
    onChangeAddress: () => void;
    changeAddressOverride?: string | null;
    policy?: string;
    compact?: boolean;
  } = $props();

  const inputPaths = $derived([
    ...new Set(proposal.inputs.flatMap((input) => input.derivationPaths ?? []))
  ]);
  const changePaths = $derived([...new Set(proposal.changeDerivationPaths?.flat() ?? [])]);
</script>

<details class:hardware-review-details={compact} class:proposal-review-details={!compact}>
  <summary>{translate($locale, 'View more details')}</summary>
  <dl class:details-list={!compact}>
    <div>
      <dt>{translate($locale, 'Inputs')}</dt>
      <dd>
        {proposal.inputs.length}{' · '}<Amount
          value={proposal.inputs.reduce((sum, input) => sum + Number(input.amount), 0)}
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
    <div>
      <dt>{translate($locale, 'Fee rate')}</dt>
      <dd>{proposal.feeRate} {translate($locale, 'sat/vB')}</dd>
    </div>
    <div>
      <dt>{translate($locale, 'Change')}</dt>
      <dd><Amount value={Number(proposal.change)} /></dd>
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
