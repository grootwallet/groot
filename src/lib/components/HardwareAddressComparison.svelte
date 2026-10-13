<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ChevronDown } from '@lucide/svelte';
  import type { HardwareAddressComparison } from '$lib/wallet/hardware-display';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import ReadableAddress from './ReadableAddress.svelte';

  let {
    comparison,
    derivationPath,
    addressIndex,
    hardwareVerifiedAt = null,
    hardwareVerifiedBy = null,
    copied = false,
    oncopy
  } = $props<{
    comparison: HardwareAddressComparison;
    derivationPath: string;
    addressIndex: number;
    hardwareVerifiedAt?: string | null;
    hardwareVerifiedBy?: string | null;
    copied?: boolean;
    oncopy: () => void;
  }>();
</script>

<section class="verification-address" aria-label={translate($locale, 'Address to compare')}>
  <span
    >{translate(
      $locale,
      comparison.deviceName ? `Address shown on ${comparison.deviceName}` : 'Address to compare'
    )}</span
  >
  <ReadableAddress address={comparison.address} {copied} {oncopy} />
  <details class="verification-details">
    <summary><span>{translate($locale, 'Address details')}</span><ChevronDown size={14} /></summary>
    {#if comparison.deviceName}
      <p class="verification-network-note">
        {comparison.deviceName}
        {translate($locale, 'shows')} <code>{translate($locale, 'tb1')}</code>
        {translate($locale, 'on Regtest while Groot normally uses')}
        <code>{translate($locale, 'bcrt1')}</code>{translate(
          $locale,
          '. The prefix and six-character checksum differ; Rust verified that both\n        decode to the identical Bitcoin output script.'
        )}
      </p>
    {/if}
    <dl class="verification-derivation">
      <div>
        <dt>{translate($locale, 'Derivation')}</dt>
        <dd><code>{derivationPath}</code></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Address index')}</dt>
        <dd><code>{addressIndex}</code></dd>
      </div>
      {#if hardwareVerifiedAt}<div>
          <dt>{translate($locale, 'Hardware verified')}</dt>
          <dd><LocalTimestamp value={hardwareVerifiedAt} /></dd>
        </div>{/if}
      {#if hardwareVerifiedBy}<div>
          <dt>{translate($locale, 'Signer fingerprint')}</dt>
          <dd><code>{hardwareVerifiedBy}</code></dd>
        </div>{/if}
    </dl>
  </details>
</section>
