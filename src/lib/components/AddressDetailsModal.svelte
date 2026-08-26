<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import Modal from './Modal.svelte';
  import ReadableAddress from './ReadableAddress.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import type { ReceiveAddress } from '$lib/types';

  let {
    address,
    open,
    walletType = 'Native SegWit',
    onclose
  } = $props<{
    address: ReceiveAddress | null;
    open: boolean;
    walletType?: string;
    onclose: () => void;
  }>();
  let copied = $state(false);
  let labels = $derived(address ? (address.labels?.length ? address.labels : [address.label]) : []);

  async function copy() {
    if (!address) return;
    try {
      await copyText(address.address, 'bitcoin-address');
      copied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => (copied = false), 1_500);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select and copy the address manually.',
        tone: 'danger'
      });
    }
  }
</script>

<Modal
  {open}
  title={translate($locale, address?.label ?? 'Address details')}
  description={translate($locale, 'Saved receive record for this wallet.')}
  {onclose}
>
  {#if address}
    <div class="address-detail-view">
      <div class="address-detail-status">
        <span class="status-dot" class:used={address.status === 'used'}></span><span
          ><strong>{labels.join(' · ')}</strong><small
            >{translate(
              $locale,
              address.status === 'awaiting'
                ? 'Awaiting payment'
                : address.status === 'used'
                  ? 'Payment received'
                  : 'Retired from presentation'
            )}</small
          ></span
        >
      </div>
      <ReadableAddress address={address.address} {copied} oncopy={copy} />
      <dl>
        <div>
          <dt>{translate($locale, 'Labels')}</dt>
          <dd>{labels.join(' · ')}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Status')}</dt>
          <dd>{address.status}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Created')}</dt>
          <dd class="address-created-time"><LocalTimestamp value={address.created} /></dd>
        </div>
        {#if address.hardwareVerifiedAt}<div>
            <dt>{translate($locale, 'Hardware verified')}</dt>
            <dd class="address-created-time">
              <LocalTimestamp value={address.hardwareVerifiedAt} />
            </dd>
          </div>{/if}{#if address.hardwareVerifiedBy}<div>
            <dt>{translate($locale, 'Signer fingerprint')}</dt>
            <dd><code>{address.hardwareVerifiedBy}</code></dd>
          </div>{/if}
        <div>
          <dt>{translate($locale, 'Derivation path')}</dt>
          <dd><code>{address.derivationPath}</code></dd>
        </div>
        <div>
          <dt>{translate($locale, 'Address type')}</dt>
          <dd>{walletType}</dd>
        </div>
      </dl>
      <p>
        {translate(
          $locale,
          'The labels are permanent. Spaces above are visual only; copying always uses the exact address.'
        )}
      </p>
    </div>
  {/if}
</Modal>
