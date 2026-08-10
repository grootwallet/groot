<script lang="ts">
  import { compactAddress } from '$lib/address-display';
  import { shortSats } from '$lib/data';
  import type { MultisigProposal, PaymentProposal } from '$lib/wallet';

  let {
    proposal,
    onChangeAddress,
    policy = '',
    compact = false
  }: {
    proposal: PaymentProposal | MultisigProposal;
    onChangeAddress: () => void;
    policy?: string;
    compact?: boolean;
  } = $props();
</script>

<details class:hardware-review-details={compact} class:proposal-review-details={!compact}>
  <summary>View more details</summary>
  <dl class:details-list={!compact}>
    <div><dt>Inputs</dt><dd>{proposal.inputs.length} · {shortSats(proposal.inputs.reduce((sum, input) => sum + Number(input.amount), 0))} sats</dd></div>
    <div><dt>Outputs</dt><dd>{proposal.outputCount}</dd></div>
    <div><dt>Fee rate</dt><dd>{proposal.feeRate} sat/vB</dd></div>
    <div><dt>Change</dt><dd>{shortSats(Number(proposal.change))} sats</dd></div>
    {#if proposal.changeAddresses[0]}
      <div><dt>Change address</dt><dd><button type="button" class={compact ? 'compact-address-button' : 'address-review-trigger mono'} aria-label="View complete change address" onclick={onChangeAddress}>{compactAddress(proposal.changeAddresses[0])}</button></dd></div>
    {/if}
    <div><dt>Locktime / RBF</dt><dd>{proposal.locktime} · {proposal.rbf ? 'Enabled' : 'Disabled'}</dd></div>
    {#if policy}<div><dt>Wallet policy</dt><dd>{policy}</dd></div>{/if}
  </dl>
  <section class="proposal-input-details" aria-label="Input outpoints and sequences">
    <strong>Input outpoints and sequences</strong>
    <dl class:details-list={!compact}>
      {#each proposal.inputs as input}
        <div><dt><code>{input.outpoint}</code></dt><dd>{shortSats(input.amount)} sats · sequence {input.sequence}</dd></div>
      {/each}
    </dl>
  </section>
</details>
