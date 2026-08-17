<script lang="ts">
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
  <summary>View more details</summary>
  <dl class:details-list={!compact}>
    <div>
      <dt>Inputs</dt>
      <dd>
        {proposal.inputs.length}{' · '}<Amount
          value={proposal.inputs.reduce((sum, input) => sum + Number(input.amount), 0)}
        />
      </dd>
    </div>
    {#if inputPaths.length}<div>
        <dt>Input {inputPaths.length === 1 ? 'path' : 'paths'}</dt>
        <dd class="derivation-paths">
          {#each inputPaths as path}<code>{path}</code>{/each}
        </dd>
      </div>{/if}
    <div>
      <dt>Outputs</dt>
      <dd>{proposal.outputCount}</dd>
    </div>
    <div>
      <dt>Fee rate</dt>
      <dd>{proposal.feeRate} sat/vB</dd>
    </div>
    <div>
      <dt>Change</dt>
      <dd><Amount value={Number(proposal.change)} /></dd>
    </div>
    {#if proposal.changeAddresses[0]}
      <div>
        <dt>Change address</dt>
        <dd>
          <button
            type="button"
            class={compact ? 'compact-address-button' : 'address-review-trigger mono'}
            aria-label="View complete change address"
            onclick={onChangeAddress}
            >{compactAddress(changeAddressOverride ?? proposal.changeAddresses[0])}</button
          >
        </dd>
      </div>
    {/if}
    {#if changePaths.length}<div>
        <dt>Change {changePaths.length === 1 ? 'path' : 'paths'}</dt>
        <dd class="derivation-paths">
          {#each changePaths as path}<code>{path}</code>{/each}
        </dd>
      </div>{/if}
    <div>
      <dt>Locktime / RBF</dt>
      <dd>{proposal.locktime}{' · '}{proposal.rbf ? 'Enabled' : 'Disabled'}</dd>
    </div>
    {#if policy}<div>
        <dt>Wallet policy</dt>
        <dd>{policy}</dd>
      </div>{/if}
  </dl>
</details>
