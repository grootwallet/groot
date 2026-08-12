<script lang="ts">
  import { AlertTriangle, Check, Clock3, ShieldCheck } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import { walletService, type MultisigWallet, type RecoveryPolicyAnalysis, type RecoveryTemplate } from '$lib/wallet';

  let wallet = $state<MultisigWallet | null>(null);
  let kind = $state<'recovery'|'decaying'|'expanding'>('recovery');
  let delayOne = $state(4320);
  let delayTwo = $state(8640);
  let recoveryThreshold = $state(1);
  let age = $state(0);
  let analysis = $state<RecoveryPolicyAnalysis | null>(null);
  let error = $state('');
  let busy = $state(false);
  const activePath = $derived(analysis?.paths.filter((path)=>path.availableAfterBlocks<=age).at(-1) ?? analysis?.paths[0]);
  const canUseSeparateRecoveryKey = $derived((wallet?.cosigners.length ?? 0) >= 4 && (wallet?.threshold ?? 2) <= (wallet?.cosigners.length ?? 0) - 1);

  onMount(async()=>{ wallet=await walletService.multisigWallet(); });

  function template(): RecoveryTemplate {
    const ids = wallet?.cosigners.map((key)=>key.id) ?? [];
    if (kind === 'recovery') return { type:'recovery', immediate:{threshold:wallet?.threshold??2,signerIds:ids.slice(0,-1)}, recovery:{availableAfterBlocks:delayOne,threshold:recoveryThreshold,signerIds:[ids.at(-1)!]} };
    if (kind === 'decaying') return { type:'decaying', stages:[{availableAfterBlocks:0,threshold:Math.min(3,ids.length),signerIds:ids},{availableAfterBlocks:delayOne,threshold:2,signerIds:ids},{availableAfterBlocks:delayTwo,threshold:1,signerIds:ids}] };
    const first = ids.slice(0,Math.max(2,ids.length-1));
    return { type:'expanding', stages:[{availableAfterBlocks:0,threshold:2,signerIds:first},{availableAfterBlocks:delayOne,threshold:2,signerIds:ids}] };
  }

  async function analyze() {
    if (!wallet) return; busy=true; error=''; analysis=null;
    try { analysis=await walletService.analyzeRecoveryPolicy(template(),wallet.cosigners); age=0; }
    catch(cause){error=cause instanceof Error?cause.message:'The policy could not be compiled.';}
    finally{busy=false;}
  }
</script>

<div class="page coordinator-page policy-lab"><header class="page-header"><div><p class="eyebrow">V2 POLICY LAB</p><h1>Guided recovery policy</h1><p class="subtitle">Preview reviewed Miniscript templates in Rust. This lab never changes the selected wallet.</p></div><Button variant="secondary" href="/multisig">Back to policy</Button></header>
{#if wallet}<div class="coordinator-grid"><section class="form-card"><div class="warning-box"><strong>Experimental analysis only</strong><br/>Compile shows the resulting public descriptors and spending paths. To use a policy, create and back up a separate recovery wallet.</div><label class="field"><span>Template</span><select aria-label="Policy template" bind:value={kind}><option value="recovery">Timelocked recovery</option><option value="decaying">Decaying multisig</option><option value="expanding">Expanding multisig</option></select></label>
  <div class="template-explainer"><ShieldCheck size={19}/><span><strong>{kind==='recovery'?'Operational policy plus recovery key':kind==='decaying'?'Fewer signatures become sufficient':'More recovery keys become eligible'}</strong><small>{kind==='recovery'?'Three primary keys spend now; an independent fourth key becomes recovery-only later.':kind==='decaying'?'The same keys remain, while the threshold intentionally falls over time.':'The threshold stays fixed while additional keys become eligible.'}</small></span></div>
  <div class="credential-grid"><label class="field"><span>{kind==='decaying'?'First delay':'Recovery delay'}</span><div class="amount-input"><input aria-label="First recovery delay" type="number" min="144" max="52560" bind:value={delayOne}/><b>blocks</b></div></label>{#if kind==='decaying'}<label class="field"><span>Second delay</span><div class="amount-input"><input aria-label="Second recovery delay" type="number" min="144" max="52560" bind:value={delayTwo}/><b>blocks</b></div></label>{/if}</div>
  {#if kind==='recovery'}<label class="field"><span>Recovery signatures</span><select bind:value={recoveryThreshold} disabled={!canUseSeparateRecoveryKey}><option value={1}>1 signature</option></select><small>{canUseSeparateRecoveryKey ? `Uses ${wallet.cosigners.at(-1)?.label} only for recovery; it is excluded from the immediate branch.` : 'This wallet has no signer outside its immediate multisig.'}</small></label>{/if}
  {#if kind==='recovery'&&!canUseSeparateRecoveryKey}<div class="warning-box danger"><strong>Separate recovery key required</strong><span>Recovery cannot reuse one of this wallet’s operational signers. Create a recovery wallet with three primary keys plus an independent fourth key.</span><Button variant="secondary" href="/multisig/new">Create recovery wallet</Button></div>{/if}
  {#if kind==='expanding'&&wallet.cosigners.length<4}<div class="warning-box danger"><strong>One more signer is required.</strong> Expanding multisig needs an additional key that is not eligible in the immediate path.</div>{/if}
  {#if error}<p class="form-error" aria-live="polite">{error === 'recovery_signer_reused' ? 'The recovery signer must be independent from every immediate-path signer.' : error}</p>{/if}<Button class="full" disabled={(kind==='recovery'&&!canUseSeparateRecoveryKey)||(kind==='expanding'&&wallet.cosigners.length<4)} loading={busy} loadingLabel="Compiling policy…" onclick={analyze}>Compile & analyze policy</Button>
</section>
<aside class="safety-panel"><Clock3 size={20}/><h2>Block-based delays</h2><p>Relative timelocks start independently when each UTXO confirms. Calendar estimates are approximate and never determine spendability.</p><ul><li>Minimum delay: 144 blocks</li><li>Maximum delay: 52,560 blocks</li><li>Time-based locks are rejected in V2</li></ul></aside></div>
{#if analysis}<section class="form-card policy-analysis"><div class="section-heading compact"><div><h2>Compiled policy</h2><p>Checksummed WSH descriptor · maximum satisfaction {analysis.maxSatisfactionWeight} wu</p></div><span class="ready-badge">Sanity checked</span></div>
  {#each analysis.warnings as warning}<div class="warning-box danger"><AlertTriangle size={16}/><strong>{warning.message}</strong></div>{/each}
  <div class="policy-timeline">{#each analysis.paths as path,index}<article class:active={activePath===path}><span>{index+1}</span><div><strong>{path.availableAfterBlocks===0?'Available immediately':`After ${path.availableAfterBlocks.toLocaleString()} blocks`}</strong><small>{path.threshold} of {path.signerIds.length} listed keys can spend</small></div>{#if activePath===path}<Check size={16}/>{/if}</article>{/each}</div>
  <label class="field"><span>Simulate UTXO age: {age.toLocaleString()} blocks</span><input aria-label="Simulated UTXO age" type="range" min="0" max={Math.max(delayTwo,delayOne)+1000} step="10" bind:value={age}/><small>Active path requires {activePath?.threshold} signature{activePath?.threshold===1?'':'s'}.</small></label>
  <div class="descriptor-block"><span>Receive descriptor</span><code>{analysis.externalDescriptor}</code></div><div class="descriptor-block"><span>Change descriptor</span><code>{analysis.internalDescriptor}</code></div>
</section>{/if}
{:else}<section class="empty-state"><h2>Create a policy wallet first</h2><p>Recovery analysis needs a shared wallet with independent signing keys.</p><Button href="/multisig/new">Create wallet</Button></section>{/if}</div>
