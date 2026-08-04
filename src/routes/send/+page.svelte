<script lang="ts">
  import { ArrowRight, Check, CircleDot, Gauge, LockKeyhole } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { feeRate as asFeeRate, sats, walletService, type CoinSelection, type FeeEstimates, type PaymentProposal } from '$lib/wallet';
  import type { Utxo } from '$lib/types';
  import { defaultConfig, networkName } from '$lib/config';
  import { addressPrefixForNetwork, hasAddressPrefixForNetwork } from '$lib/wallet/policy';

  let step = $state(1);
  let address = $state('');
  let amount = $state('');
  let speed = $state('medium');
  let customFee = $state('');
  let passphrase = $state('');
  let credentialError = $state('');
  let broadcasting = $state(false);
  let preparing = $state(false);
  let available = $state(0);
  let estimates = $state<FeeEstimates | null>(null);
  let proposal = $state<PaymentProposal | null>(null);
  let txid = $state('');
  let coins = $state<Utxo[]>([]);
  let selectedCoins = $state<string[]>([]);
  let showCoins = $state(false);
  const selection = $derived<CoinSelection>(selectedCoins.length ? { mode: 'manual', outpoints: selectedCoins } : { mode: 'auto' });
  const fees = $derived({ slow: Number(estimates?.economy ?? 1), medium: Number(estimates?.standard ?? 2), fast: Number(estimates?.priority ?? 5) });
  const selectedFeeRate = $derived(speed === 'custom' ? Number(customFee || 0) : fees[speed as keyof typeof fees]);
  const fee = $derived(Number(proposal?.fee ?? Math.max(0, Math.round(selectedFeeRate * 141))));
  const amountSats = $derived(Math.round(Number(amount || 0)));
  const addressValid = $derived(hasAddressPrefixForNetwork(address, defaultConfig.network));
  const valid = $derived(addressValid && amountSats > 0 && amountSats + fee <= available && selectedFeeRate > 0);

  onMount(async () => {
    try {
      const [snapshot, feeData] = await Promise.all([walletService.snapshot(), walletService.estimateFees()]);
      coins = snapshot.utxos;
      const requested = new URL(window.location.href).searchParams.get('coins')?.split(',').filter(Boolean) ?? [];
      selectedCoins = requested.filter((outpoint) => snapshot.utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen));
      available = snapshot.utxos.filter((coin) => !coin.frozen && (!selectedCoins.length || selectedCoins.includes(coin.outpoint))).reduce((total, coin) => total + coin.amount, 0);
      estimates = feeData;
    } catch (cause) {
      toast({ title: 'Could not load wallet', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
  });

  async function prepare() {
    if (!valid) return;
    preparing = true;
    try {
      proposal = await walletService.preparePayment(address, sats(amountSats), asFeeRate(selectedFeeRate), selection);
      step = 2;
    } catch (cause) {
      toast({ title: 'Could not prepare payment', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally { preparing = false; }
  }

  function useAutomatic() {
    selectedCoins = [];
    showCoins = false;
    available = coins.filter((coin) => !coin.frozen).reduce((total, coin) => total + coin.amount, 0);
  }
  function toggleCoin(outpoint: string, checked: boolean) {
    selectedCoins = checked ? [...selectedCoins, outpoint] : selectedCoins.filter((item) => item !== outpoint);
    available = coins.filter((coin) => !coin.frozen && selectedCoins.includes(coin.outpoint)).reduce((total, coin) => total + coin.amount, 0);
  }

  async function broadcast() {
    if (!passphrase || !proposal) return;
    credentialError = '';
    broadcasting = true;
    try {
      const result = await walletService.signAndBroadcast(proposal.proposalId, passphrase);
      txid = result.txid;
      available = result.snapshot.balance.total;
      passphrase = '';
      step = 4;
    } catch (cause) {
      credentialError = cause instanceof Error ? cause.message : 'Could not sign or broadcast.';
      passphrase = '';
    } finally { broadcasting = false; }
  }
</script>

<div class="page narrow-page send-page">
  <header class="page-header"><div><p class="eyebrow">SEND</p><h1>Send bitcoin</h1><p class="subtitle">{step === 1 ? 'Enter payment details.' : step === 2 ? 'Review everything carefully.' : step === 3 ? 'Unlock, sign, and broadcast.' : 'Payment sent.'}</p></div></header>
  <div class="stepper"><span class:active={step >= 1}>1</span><i class:active={step >= 2}></i><span class:active={step >= 2}>2</span><i class:active={step >= 3}></i><span class:active={step >= 3}>3</span></div>

  {#if step === 1}
    <form class="form-card" onsubmit={(event) => { event.preventDefault(); prepare(); }}>
      <div class="coin-control-field"><span>Coin selection</span><button type="button" class="coin-mode" onclick={() => showCoins = !showCoins}><CircleDot size={16}/><span><strong>{selectedCoins.length ? `Manual · ${selectedCoins.length} coin${selectedCoins.length === 1 ? '' : 's'}` : 'Automatic selection'}</strong><small>{selectedCoins.length ? `${shortSats(available)} sats available` : 'Frozen coins stay untouched'}</small></span><b>{showCoins ? 'Done' : 'Choose'}</b></button>
        {#if showCoins}<div class="send-coin-picker">{#each coins as coin}<label class:frozen={coin.frozen}><input type="checkbox" checked={selectedCoins.includes(coin.outpoint)} disabled={coin.frozen} onchange={(event) => toggleCoin(coin.outpoint, event.currentTarget.checked)}/><span><strong>{coin.label}</strong><small>{shortSats(coin.amount)} sats{coin.frozen ? ' · Frozen' : ''}</small></span></label>{/each}<button type="button" onclick={useAutomatic}>Use automatic selection</button></div>{/if}
      </div>
      <label class="field"><span>Bitcoin address</span><input bind:value={address} placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…" />{#if address && !addressValid}<em>Enter a valid {networkName(defaultConfig.network)} address</em>{/if}</label>
      <label class="field"><span>Amount</span><div class="amount-input"><input bind:value={amount} inputmode="numeric" placeholder="0" /><b>sats</b><button type="button" onclick={() => amount = String(Math.max(0, available - 1000))}>Max</button></div><small>Available: {shortSats(available)} sats</small></label>
      <div class="field"><span>Network fee</span><div class="fee-options">
        {#each [{id:'slow',name:'Economy',rate:fees.slow},{id:'medium',name:'Standard',rate:fees.medium},{id:'fast',name:'Priority',rate:fees.fast}] as option}
          <button type="button" class:active={speed === option.id} onclick={() => speed = option.id}><span><strong>{option.name}</strong><small>Next block</small></span><b>{option.rate} sat/vB</b></button>
        {/each}
        <button type="button" class:active={speed === 'custom'} onclick={() => speed = 'custom'}><span><strong>Custom</strong><small>Set rate</small></span>{#if speed === 'custom'}<input aria-label="Custom fee rate" bind:value={customFee} onclick={(event) => event.stopPropagation()} inputmode="decimal" placeholder="0" />{:else}<Gauge size={17} />{/if}</button>
      </div><small>Fee estimates: {estimates?.source ?? 'loading…'} · Estimated fee {shortSats(fee)} sats</small></div>
      <Button type="submit" disabled={!valid || preparing} size="large" class="full">{preparing ? 'Preparing…' : 'Review payment'}<ArrowRight size={17} /></Button>
    </form>
  {:else if step === 2}
    <section class="form-card">
      <div class="review-amount"><span>You send</span><strong>{shortSats(amountSats)} <small>sats</small></strong></div>
      <dl class="details-list"><div><dt>To</dt><dd class="mono">{address}</dd></div><div><dt>Coins</dt><dd>{selectedCoins.length ? `${selectedCoins.length} manually selected` : 'Automatic selection'}</dd></div><div><dt>Fee rate</dt><dd>{selectedFeeRate} sat/vB</dd></div><div><dt>Network fee</dt><dd>{shortSats(fee)} sats</dd></div><div class="total"><dt>Total</dt><dd>{shortSats(amountSats + fee)} sats</dd></div></dl>
      <div class="warning-box">Bitcoin transactions cannot be reversed. Verify the address and amount before signing.</div>
      <div class="split-actions"><Button variant="secondary" size="large" onclick={() => { proposal = null; step = 1; }}>Back</Button><Button size="large" onclick={() => step = 3}>Continue to sign<ArrowRight size={17} /></Button></div>
    </section>
  {:else if step === 3}
    <form class="form-card sign-card" onsubmit={(event) => { event.preventDefault(); broadcast(); }}>
      <span class="sign-icon"><LockKeyhole size={25} /></span><h2>Authorize payment</h2><p>Enter your wallet passphrase to unlock the signing keys. It never leaves this device.</p>
      <PasswordField label="Passphrase / PIN" bind:value={passphrase} oninput={() => credentialError = ''} placeholder="Enter wallet passphrase / PIN" autocomplete="current-password" error={credentialError} hint="The same credential used when the wallet was created." />
      <Button type="submit" size="large" class="full" disabled={!passphrase || broadcasting}>{broadcasting ? 'Signing & broadcasting…' : `Sign & broadcast ${shortSats(amountSats)} sats`}</Button>
      <Button variant="ghost" class="full" onclick={() => step = 2}>Back to review</Button>
    </form>
  {:else}
    <section class="empty-state success-state"><span class="empty-icon success"><Check size={25} /></span><h2>Payment sent</h2><p>{shortSats(amountSats)} sats was broadcast to the Bitcoin network.</p><div class="txid-box"><span>Transaction ID</span><code>{txid}</code></div><Button onclick={() => { step = 1; address=''; amount=''; passphrase=''; proposal=null; txid=''; }}>Make another payment</Button><a href="/activity">View transaction</a></section>
  {/if}
</div>
