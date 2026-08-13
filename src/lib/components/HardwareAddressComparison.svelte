<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { HardwareAddressComparison } from '$lib/wallet/hardware-display';
  import ReadableAddress from './ReadableAddress.svelte';

  let { comparison, derivationPath, addressIndex, copied = false, oncopy } = $props<{
    comparison: HardwareAddressComparison;
    derivationPath: string;
    addressIndex: number;
    copied?: boolean;
    oncopy: () => void;
  }>();
</script>

<section class="verification-address" aria-label="Address to compare">
  <span>{comparison.deviceName ? `Address shown on ${comparison.deviceName}` : 'Address to compare'}</span>
  <ReadableAddress address={comparison.address} {copied} {oncopy}/>
  <details class="verification-details">
    <summary><span>Address details</span><ChevronDown size={14}/></summary>
    {#if comparison.deviceName}
      <p class="verification-network-note">{comparison.deviceName} shows <code>tb1</code> on Regtest while Groot normally uses <code>bcrt1</code>. The prefix and six-character checksum differ; Rust verified that both decode to the identical Bitcoin output script.</p>
    {/if}
    <dl class="verification-derivation">
      <div><dt>Derivation</dt><dd><code>{derivationPath}</code></dd></div>
      <div><dt>Address index</dt><dd><code>{addressIndex}</code></dd></div>
    </dl>
  </details>
</section>
