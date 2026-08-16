<script lang="ts">
  import { Copy, ShieldCheck } from '@lucide/svelte';
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

  async function copyDescriptor(value: string, label: string) {
    await copyText(value, 'public-wallet-data');
    toast({
      title: `${label} descriptor copied`,
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
  }
</script>

<Modal
  {open}
  title="Wallet descriptors"
  description="Public watch-only logic for receiving and change. It cannot sign transactions, but it reveals wallet activity."
  {onclose}
>
  {#if wallet}
    <div class="descriptor-viewer">
      {#if combinedDescriptor}
        <section class="descriptor-primary">
          <div>
            <span>Portable wallet descriptor</span><small
              >Standard multipath form: branch 0 receives, branch 1 creates change.</small
            >
          </div>
          <code>{combinedDescriptor}</code>
          <button onclick={() => copyDescriptor(combinedDescriptor!, 'Wallet')}
            ><Copy size={15} />Copy wallet descriptor</button
          >
        </section>
        <details>
          <summary>View separate receive and change descriptors</summary>
          <section>
            <div>
              <span>Receive descriptor</span><small
                >Generates addresses shared for incoming payments.</small
              >
            </div>
            <code>{wallet.externalDescriptor}</code><button
              onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}
              ><Copy size={15} />Copy receive descriptor</button
            >
          </section>
          <section>
            <div>
              <span>Change descriptor</span><small
                >Generates private change addresses after spending.</small
              >
            </div>
            <code>{wallet.internalDescriptor}</code><button
              onclick={() => copyDescriptor(wallet!.internalDescriptor, 'Change')}
              ><Copy size={15} />Copy change descriptor</button
            >
          </section>
        </details>
      {:else}
        <section>
          <div>
            <span>Receive descriptor</span><small
              >Generates addresses shared for incoming payments.</small
            >
          </div>
          <code>{wallet.externalDescriptor}</code><button
            onclick={() => copyDescriptor(wallet!.externalDescriptor, 'Receive')}
            ><Copy size={15} />Copy receive descriptor</button
          >
        </section>
        <section>
          <div>
            <span>Change descriptor</span><small
              >Generates private change addresses after spending.</small
            >
          </div>
          <code>{wallet.internalDescriptor}</code><button
            onclick={() => copyDescriptor(wallet!.internalDescriptor, 'Change')}
            ><Copy size={15} />Copy change descriptor</button
          >
        </section>
      {/if}
      <p>
        <ShieldCheck size={14} />Keep descriptors private even though they cannot spend. They reveal
        every address in this wallet.
      </p>
    </div>
  {/if}
</Modal>
