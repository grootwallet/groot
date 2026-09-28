<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Check, Copy, ShieldCheck } from '@lucide/svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { copyText } from '$lib/clipboard';
  import { combineDescriptorBranches } from '$lib/descriptors';
  import { toast } from '$lib/stores/toasts';
  import type { MultisigWallet } from '$lib/wallet';

  let {
    open,
    wallet,
    onclose
  }: { open: boolean; wallet: MultisigWallet | null; onclose: () => void } = $props();
  const combinedDescriptor = $derived(
    wallet ? combineDescriptorBranches(wallet.externalDescriptor, wallet.internalDescriptor) : null
  );
  let copiedDescriptor = $state('');

  async function copyDescriptor(value: string, label: string) {
    await copyText(value, 'public-wallet-data');
    copiedDescriptor = value;
    toast({
      title: translate($locale, '{label} descriptor copied', { label: translate($locale, label) }),
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
    setTimeout(() => {
      if (copiedDescriptor === value) copiedDescriptor = '';
    }, 1_500);
  }
</script>

<Modal
  {open}
  title={translate($locale, 'Wallet descriptors')}
  description={translate(
    $locale,
    'Public watch-only logic for receiving and change. It cannot sign transactions, but it reveals wallet activity.'
  )}
  {onclose}
>
  {#if wallet}
    <div class="descriptor-viewer">
      {#if combinedDescriptor}
        <section class="descriptor-primary">
          <div>
            <span>{translate($locale, 'Portable wallet descriptor')}</span><small
              >{translate(
                $locale,
                'Standard multipath form: branch 0 receives, branch 1 creates change.'
              )}</small
            >
          </div>
          <code>{combinedDescriptor}</code>
          <button onclick={() => copyDescriptor(combinedDescriptor!, 'Wallet')}
            >{#if copiedDescriptor === combinedDescriptor}<Check size={15} />{:else}<Copy
                size={15}
              />{/if}{translate($locale, 'Copy wallet descriptor')}</button
          >
        </section>
        <details>
          <summary>{translate($locale, 'View separate receive and change descriptors')}</summary>
          <section>
            <div>
              <span>{translate($locale, 'Receive descriptor')}</span><small
                >{translate($locale, 'Generates addresses shared for incoming payments.')}</small
              >
            </div>
            <code>{wallet.externalDescriptor}</code><button
              onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}
              >{#if copiedDescriptor === wallet.externalDescriptor}<Check size={15} />{:else}<Copy
                  size={15}
                />{/if}{translate($locale, 'Copy receive descriptor')}</button
            >
          </section>
          <section>
            <div>
              <span>{translate($locale, 'Change descriptor')}</span><small
                >{translate($locale, 'Generates private change addresses after spending.')}</small
              >
            </div>
            <code>{wallet.internalDescriptor}</code><button
              onclick={() => copyDescriptor(wallet!.internalDescriptor, 'Change')}
              >{#if copiedDescriptor === wallet.internalDescriptor}<Check size={15} />{:else}<Copy
                  size={15}
                />{/if}{translate($locale, 'Copy change descriptor')}</button
            >
          </section>
        </details>
      {:else}
        <section>
          <div>
            <span>{translate($locale, 'Receive descriptor')}</span><small
              >{translate($locale, 'Generates addresses shared for incoming payments.')}</small
            >
          </div>
          <code>{wallet.externalDescriptor}</code><button
            onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}
            >{#if copiedDescriptor === wallet.externalDescriptor}<Check size={15} />{:else}<Copy
                size={15}
              />{/if}{translate($locale, 'Copy receive descriptor')}</button
          >
        </section>
        <section>
          <div>
            <span>{translate($locale, 'Change descriptor')}</span><small
              >{translate($locale, 'Generates private change addresses after spending.')}</small
            >
          </div>
          <code>{wallet.internalDescriptor}</code><button
            onclick={() => copyDescriptor(wallet!.internalDescriptor, 'Change')}
            >{#if copiedDescriptor === wallet.internalDescriptor}<Check size={15} />{:else}<Copy
                size={15}
              />{/if}{translate($locale, 'Copy change descriptor')}</button
          >
        </section>
      {/if}
      <p>
        <ShieldCheck size={14} />{translate(
          $locale,
          'Keep descriptors private even though they cannot spend. They reveal\n        every address in this wallet.'
        )}
      </p>
    </div>
  {/if}
</Modal>
