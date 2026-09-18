<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { AlertTriangle, Check, Clock3, ShieldCheck } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import { formatInteger, locale } from '$lib/i18n';
  import {
    walletService,
    hasMiniscriptPolicy,
    type MultisigWallet,
    type RecoveryPolicyAnalysis,
    type RecoveryTemplate
  } from '$lib/wallet';

  let wallet = $state<MultisigWallet | null>(null);
  let loading = $state(true);
  let kind = $state<'recovery' | 'decaying' | 'expanding'>('recovery');
  let delayOne = $state(4320);
  let delayTwo = $state(8640);
  let recoveryThreshold = $state(1);
  let age = $state(0);
  let analysis = $state<RecoveryPolicyAnalysis | null>(null);
  let error = $state('');
  let busy = $state(false);
  const activePath = $derived(
    analysis?.paths.filter((path) => path.availableAfterBlocks <= age).at(-1) ?? analysis?.paths[0]
  );
  const canUseSeparateRecoveryKey = $derived(
    (wallet?.cosigners.length ?? 0) >= 4 &&
      (wallet?.threshold ?? 2) <= (wallet?.cosigners.length ?? 0) - 1
  );

  onMount(async () => {
    const selectedWallet = await walletService.multisigWallet();
    if (selectedWallet && !hasMiniscriptPolicy(selectedWallet)) {
      await goto('/multisig', { replaceState: true });
      return;
    }
    wallet = selectedWallet;
    loading = false;
  });

  function template(): RecoveryTemplate {
    const ids = wallet?.cosigners.map((key) => key.id) ?? [];
    if (kind === 'recovery')
      return {
        type: 'recovery',
        immediate: { threshold: wallet?.threshold ?? 2, signerIds: ids.slice(0, -1) },
        recovery: {
          availableAfterBlocks: delayOne,
          threshold: recoveryThreshold,
          signerIds: [ids.at(-1)!]
        }
      };
    if (kind === 'decaying')
      return {
        type: 'decaying',
        stages: [
          { availableAfterBlocks: 0, threshold: Math.min(3, ids.length), signerIds: ids },
          { availableAfterBlocks: delayOne, threshold: 2, signerIds: ids },
          { availableAfterBlocks: delayTwo, threshold: 1, signerIds: ids }
        ]
      };
    const first = ids.slice(0, Math.max(2, ids.length - 1));
    return {
      type: 'expanding',
      stages: [
        { availableAfterBlocks: 0, threshold: 2, signerIds: first },
        { availableAfterBlocks: delayOne, threshold: 2, signerIds: ids }
      ]
    };
  }

  async function analyze() {
    if (!wallet) return;
    busy = true;
    error = '';
    analysis = null;
    try {
      analysis = await walletService.analyzeRecoveryPolicy(template(), wallet.cosigners);
      age = 0;
    } catch (cause) {
      error = localizedError(cause, $locale, 'The policy could not be compiled.');
    } finally {
      busy = false;
    }
  }
</script>

<div class="page coordinator-page policy-lab" class:policy-lab-loading={loading}>
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'V2 POLICY LAB')}</p>
      <h1>{translate($locale, 'Guided recovery policy')}</h1>
      <p class="subtitle">
        {translate($locale, 'Explore recovery paths without changing this wallet.')}
      </p>
    </div>
    <Button variant="secondary" href="/multisig">{translate($locale, 'Back to policy')}</Button>
  </header>
  {#if wallet}<div class="coordinator-grid">
      <section class="form-card">
        <div class="warning-box policy-lab-notice" role="note">
          <strong>{translate($locale, 'Experimental analysis only')}</strong><span
            >{translate(
              $locale,
              'Compiling previews public descriptors and spending paths. To use a different policy, create and back up a separate recovery wallet.'
            )}</span
          >
        </div>
        <label class="field"
          ><span>{translate($locale, 'Template')}</span><select
            aria-label={translate($locale, 'Policy template')}
            bind:value={kind}
            ><option value="recovery">{translate($locale, 'Timelocked recovery')}</option><option
              value="decaying">{translate($locale, 'Decaying multisig')}</option
            ><option value="expanding">{translate($locale, 'Expanding multisig')}</option></select
          ></label
        >
        <div class="template-explainer">
          <ShieldCheck size={19} /><span
            ><strong
              >{translate(
                $locale,
                kind === 'recovery'
                  ? 'Operational policy plus recovery key'
                  : kind === 'decaying'
                    ? 'Fewer signatures become sufficient'
                    : 'More recovery keys become eligible'
              )}</strong
            ><small
              >{translate(
                $locale,
                kind === 'recovery'
                  ? 'Three primary keys spend now; an independent fourth key becomes recovery-only later.'
                  : kind === 'decaying'
                    ? 'The same keys remain, while the threshold intentionally falls over time.'
                    : 'The threshold stays fixed while additional keys become eligible.'
              )}</small
            ></span
          >
        </div>
        <div class="credential-grid">
          <label class="field"
            ><span
              >{translate($locale, kind === 'decaying' ? 'First delay' : 'Recovery delay')}</span
            >
            <div class="amount-input">
              <input
                aria-label={translate($locale, 'First recovery delay')}
                type="number"
                min="144"
                max="52560"
                bind:value={delayOne}
              /><b>{translate($locale, 'blocks')}</b>
            </div></label
          >{#if kind === 'decaying'}<label class="field"
              ><span>{translate($locale, 'Second delay')}</span>
              <div class="amount-input">
                <input
                  aria-label={translate($locale, 'Second recovery delay')}
                  type="number"
                  min="144"
                  max="52560"
                  bind:value={delayTwo}
                /><b>{translate($locale, 'blocks')}</b>
              </div></label
            >{/if}
        </div>
        {#if kind === 'recovery'}<label class="field"
            ><span>{translate($locale, 'Recovery signatures')}</span><select
              bind:value={recoveryThreshold}
              disabled={!canUseSeparateRecoveryKey}
              ><option value={1}>{translate($locale, '1 signature')}</option></select
            ><small
              >{translate(
                $locale,
                canUseSeparateRecoveryKey
                  ? `Uses ${wallet.cosigners.at(-1)?.label} only for recovery; it is excluded from the immediate branch.`
                  : 'This wallet has no signer outside its immediate multisig.'
              )}</small
            ></label
          >{/if}
        {#if kind === 'recovery' && !canUseSeparateRecoveryKey}<div class="warning-box danger">
            <strong>{translate($locale, 'Separate recovery key required')}</strong><span
              >{translate(
                $locale,
                'Recovery cannot reuse one of this wallet’s operational signers. Create a recovery\n              wallet with three primary keys plus an independent fourth key.'
              )}</span
            ><Button variant="secondary" href="/multisig/new"
              >{translate($locale, 'Create recovery wallet')}</Button
            >
          </div>{/if}
        {#if kind === 'expanding' && wallet.cosigners.length < 4}<div class="warning-box danger">
            <strong>{translate($locale, 'One more signer is required.')}</strong>
            {translate(
              $locale,
              'Expanding multisig needs an additional key that\n            is not eligible in the immediate path.'
            )}
          </div>{/if}
        {#if error}<p class="form-error" aria-live="polite">
            {translate(
              $locale,
              error === 'recovery_signer_reused'
                ? 'The recovery signer must be independent from every immediate-path signer.'
                : error
            )}
          </p>{/if}<Button
          class="full"
          disabled={(kind === 'recovery' && !canUseSeparateRecoveryKey) ||
            (kind === 'expanding' && wallet.cosigners.length < 4)}
          loading={busy}
          loadingLabel={translate($locale, 'Compiling policy…')}
          onclick={analyze}>{translate($locale, 'Compile & analyze policy')}</Button
        >
      </section>
      <aside class="safety-panel">
        <Clock3 size={20} />
        <h2>{translate($locale, 'Block-based delays')}</h2>
        <p>
          {translate(
            $locale,
            'Relative timelocks start independently when each UTXO confirms. Calendar estimates are\n          approximate and never determine spendability.'
          )}
        </p>
        <ul>
          <li>{translate($locale, 'Minimum delay: 144 blocks')}</li>
          <li>{translate($locale, 'Maximum delay: 52,560 blocks')}</li>
          <li>{translate($locale, 'Time-based locks are rejected in V2')}</li>
        </ul>
      </aside>
    </div>
    {#if analysis}<section class="form-card policy-analysis">
        <div class="section-heading compact">
          <div>
            <h2>{translate($locale, 'Compiled policy')}</h2>
            <p>
              {translate($locale, 'Checksummed WSH descriptor · maximum satisfaction')}
              {analysis.maxSatisfactionWeight}
              {translate($locale, 'wu')}
            </p>
          </div>
          <span class="ready-badge">{translate($locale, 'Sanity checked')}</span>
        </div>
        {#each analysis.warnings as warning}<div class="warning-box danger">
            <AlertTriangle size={16} /><strong>{warning.message}</strong>
          </div>{/each}
        <div class="policy-timeline">
          {#each analysis.paths as path, index}<article class:active={activePath === path}>
              <span>{index + 1}</span>
              <div>
                <strong
                  >{translate(
                    $locale,
                    path.availableAfterBlocks === 0
                      ? 'Available immediately'
                      : `After ${formatInteger(path.availableAfterBlocks, $locale)} blocks`
                  )}</strong
                ><small
                  >{path.threshold} of {path.signerIds.length}
                  {translate($locale, 'listed keys can spend')}</small
                >
              </div>
              {#if activePath === path}<Check size={16} />{/if}
            </article>{/each}
        </div>
        <label class="field"
          ><span
            >{translate($locale, 'Simulate UTXO age:')}
            {formatInteger(age, $locale)}
            {translate($locale, 'blocks')}</span
          ><input
            aria-label={translate($locale, 'Simulated UTXO age')}
            type="range"
            min="0"
            max={Math.max(delayTwo, delayOne) + 1000}
            step="10"
            bind:value={age}
          /><small
            >{translate($locale, 'Active path requires')}
            {activePath?.threshold}
            {translate($locale, 'signature')}{translate(
              $locale,
              activePath?.threshold === 1 ? '' : 's'
            )}.</small
          ></label
        >
        <div class="descriptor-block">
          <span>{translate($locale, 'Receive descriptor')}</span><code
            >{analysis.externalDescriptor}</code
          >
        </div>
        <div class="descriptor-block">
          <span>{translate($locale, 'Change descriptor')}</span><code
            >{analysis.internalDescriptor}</code
          >
        </div>
      </section>{/if}
  {:else}<section class="empty-state">
      <h2>{translate($locale, 'Create a multisig wallet first')}</h2>
      <p>
        {translate(
          $locale,
          'Recovery analysis needs a shared wallet with independent signing keys.'
        )}
      </p>
      <Button href="/multisig/new">{translate($locale, 'Create wallet')}</Button>
    </section>{/if}
</div>
