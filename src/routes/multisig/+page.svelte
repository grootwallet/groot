<script lang="ts">
  import { formatInteger, locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    ChevronRight,
    Clock3,
    Cpu,
    Eye,
    FileKey,
    FlaskConical,
    Plus,
    ShieldCheck,
    Usb
  } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import SignerPolicyReview from '$lib/components/SignerPolicyReview.svelte';
  import ColdcardPolicySetup from '$lib/components/ColdcardPolicySetup.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import MultisigDescriptorsModal from '$lib/components/MultisigDescriptorsModal.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import {
    walletService,
    WalletError,
    type CosignerHealthCheck,
    type HardwareDevice,
    type MultisigWallet,
    type PolicyVerificationAddress,
    type SignerPolicyVerification,
    type WalletErrorCode,
    type WalletSnapshot
  } from '$lib/wallet';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import { defaultConfig, networkName } from '$lib/config';
  import { shortSats } from '$lib/data';
  import Amount from '$lib/components/Amount.svelte';
  import { toast } from '$lib/stores/toasts';
  import { coldcardPolicyFilename } from '$lib/transfer';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { policyMaturitySummary, walletPolicyPresentation } from '$lib/wallet/policy';
  import {
    matchingPolicyVerification,
    policyReadinessLabel,
    policyRegistrationProfile,
    requiresPolicySetup
  } from '$lib/hardware/policy-readiness';
  import {
    lockedDeviceForHealthCheck,
    matchingDeviceForHealthCheck
  } from '$lib/hardware/health-check';
  import {
    hardwareHealthChecks,
    hardwareHealthKey,
    recordHardwareHealthCheck,
    setHardwareHealthChecks
  } from '$lib/hardware/health-check-state';
  const walletShell = useWalletShellContext();
  let wallet = $state<MultisigWallet | null>(null);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selectedSigner = $state<CosignerDraft | null>(null);
  let showDescriptors = $state(false);
  let moreOpen = $state(false);
  let moreRoot = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let checking = $state(false);
  let policyVerifications = $state<SignerPolicyVerification[]>([]);
  let policyAddress = $state<PolicyVerificationAddress | null>(null);
  let policySigner = $state<CosignerDraft | null>(null);
  let policyDevice = $state<HardwareDevice | null>(null);
  let policyBusy = $state(false);
  let policyError = $state('');
  let policyLookupGeneration = 0;
  let healthPinOpen = $state(false);
  let healthPinBusy = $state(false);
  let healthPinChallenge = $state('');
  let healthPinPositions = $state('');
  let healthPinDevice = $state<HardwareDevice | null>(null);
  let healthPinError = $state('');
  let healthPinErrorCode = $state<WalletErrorCode | ''>('');
  const maturitySummary = $derived(
    snapshot ? policyMaturitySummary(snapshot.utxos, snapshot.chainTip) : null
  );
  const delayedPolicyType = $derived(
    wallet?.policyType === 'inheritance' ? 'inheritance' : 'recovery'
  );
  const policyPresentation = $derived(wallet ? walletPolicyPresentation(wallet) : null);
  onDestroy(() => {
    healthPinChallenge = '';
    healthPinPositions = '';
  });
  onMount(async () => {
    wallet = await walletService.multisigWallet();
    if (!wallet) return;
    try {
      const [nextPolicyVerifications, nextPolicyAddress] = await Promise.all([
        walletService.multisigSignerPolicyVerifications(),
        walletService.multisigPolicyVerificationAddress()
      ]);
      policyVerifications = nextPolicyVerifications;
      policyAddress = nextPolicyAddress;
    } catch (cause) {
      toast({
        title: 'Policy status unavailable',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
    try {
      setHardwareHealthChecks(await walletService.hardwareHealthChecks());
    } catch (cause) {
      toast({
        title: 'Health-check status unavailable',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
    try {
      snapshot = await walletService.multisigSnapshot();
    } catch (cause) {
      toast({
        title: 'Wallet is offline',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
  });
  onMount(() =>
    walletService.subscribe((event) => {
      if (
        event.type === 'wallet_updated' &&
        event.walletKind === 'multisig' &&
        event.walletId === walletShell.selectedWalletId()
      )
        snapshot = event.snapshot;
    })
  );
  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (moreOpen && moreRoot && event.target instanceof Node && !moreRoot.contains(event.target))
        moreOpen = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !moreOpen) return;
      moreOpen = false;
      requestAnimationFrame(() => moreTrigger?.focus());
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  });
  function sourceName(source: CosignerSource) {
    return {
      usb: 'USB hardware',
      qr: 'QR import',
      file: 'File import',
      manual: 'Manual backup',
      virtual: 'Virtual test device'
    }[source];
  }
  function openSigner(signer: CosignerDraft) {
    selectedSigner = signer;
  }
  function signerPolicyStatus(signer: CosignerDraft) {
    const profile = policyRegistrationProfile(signer);
    const verification = matchingPolicyVerification(signer, policyVerifications);
    const label = translate($locale, policyReadinessLabel(signer, verification));
    if (!profile.supported)
      return { label, description: translate($locale, profile.creationCopy), attention: true };
    if (profile.registration === 'none')
      return { label, description: translate($locale, profile.creationCopy), attention: false };
    if (verification) {
      const description =
        profile.registration === 'file_once'
          ? 'Policy import is recorded in Groot. Coldcard keeps this wallet policy on-device.'
          : profile.registration === 'interactive_per_signing'
            ? 'Policy and first address were verified. Ledger will authorize the policy again when signing.'
            : 'Policy and first address were verified for this wallet.';
      return {
        label,
        description: translate($locale, description),
        attention: false,
        verifiedAt: verification.verifiedAt,
        actionLabel: profile.registration === 'file_once' ? 'Review setup' : 'Verify again'
      };
    }
    return {
      label,
      description:
        profile.registration === 'file_once'
          ? 'Groot has no saved acknowledgement yet. Record the existing Coldcard policy import or review the setup steps.'
          : translate($locale, profile.creationCopy),
      attention: true,
      actionLabel: profile.registration === 'file_once' ? 'Review setup' : 'Verify policy'
    };
  }
  function latestHealth(signer: CosignerDraft) {
    return $hardwareHealthChecks[hardwareHealthKey(signer.fingerprint)] ?? null;
  }
  async function saveHardwareHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
    recordHardwareHealthCheck(fingerprint, check);
  }
  async function renameSavedSigner(label: string) {
    if (!selectedSigner) return;
    const signerId = selectedSigner.id;
    wallet = await walletService.renameMultisigSigner(signerId, label);
    selectedSigner = wallet.cosigners.find((signer) => signer.id === signerId) ?? null;
    toast({
      title: 'Signer renamed',
      description: translate($locale, 'This signer is now “{label}”.', { label }),
      tone: 'success'
    });
  }
  async function runHealthCheck() {
    if (!selectedSigner || checking) return;
    const signer = selectedSigner;
    checking = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      const result = await walletService.checkHardwareCosigner(signer, device.id);
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({
        title: 'Signer verified',
        description: translate($locale, '{signerName} matches this wallet.', {
          signerName: signer.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      const summary = localizedError(cause, $locale, 'The device could not be verified.');
      await saveHardwareHealthCheck(signer.fingerprint, {
        checkedAt: new Date().toISOString(),
        summary,
        status: 'attention'
      });
      toast({ title: 'Health check needs attention', description: summary, tone: 'danger' });
    } finally {
      checking = false;
    }
  }
  async function startHealthPin(device: HardwareDevice) {
    const retrying = healthPinOpen;
    healthPinBusy = true;
    healthPinError = '';
    healthPinErrorCode = '';
    healthPinPositions = '';
    healthPinChallenge = '';
    try {
      healthPinChallenge = await walletService.promptHardwarePin(device.id);
      healthPinDevice = device;
      healthPinOpen = true;
    } catch (cause) {
      healthPinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      healthPinError = localizedError(cause, $locale, 'Could not start the Trezor PIN matrix.');
      if (!retrying)
        toast({ title: 'Trezor unlock unavailable', description: healthPinError, tone: 'danger' });
    } finally {
      healthPinBusy = false;
    }
  }
  async function submitHealthPin() {
    if (!healthPinChallenge || !healthPinPositions || healthPinBusy) return;
    healthPinBusy = true;
    healthPinError = '';
    healthPinErrorCode = '';
    const positions = healthPinPositions;
    healthPinPositions = '';
    try {
      await walletService.sendHardwarePin(healthPinChallenge, positions);
      healthPinChallenge = '';
      healthPinOpen = false;
      healthPinDevice = null;
      toast({
        title: 'Trezor unlocked',
        description: 'Resuming the signer health check.',
        tone: 'success'
      });
      await runHealthCheck();
    } catch (cause) {
      healthPinChallenge = '';
      healthPinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      healthPinError = localizedError(cause, $locale, 'Trezor did not accept that matrix entry.');
    } finally {
      healthPinBusy = false;
    }
  }
  function closeHealthPin() {
    healthPinOpen = false;
    healthPinBusy = false;
    healthPinChallenge = '';
    healthPinPositions = '';
    healthPinDevice = null;
    healthPinError = '';
    healthPinErrorCode = '';
  }
  async function openPolicyVerification(signer: CosignerDraft) {
    const generation = ++policyLookupGeneration;
    policySigner = signer;
    selectedSigner = null;
    policyDevice = null;
    policyError = '';
    policyBusy = true;
    if (policyRegistrationProfile(signer).registration === 'file_once') {
      policyBusy = false;
      return;
    }
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This signer has no interactive USB device type.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      if (generation !== policyLookupGeneration) return;
      policyDevice = device;
    } catch (cause) {
      if (generation !== policyLookupGeneration) return;
      policyError = localizedError(cause, $locale, 'Could not scan hardware devices.');
    } finally {
      if (generation === policyLookupGeneration) policyBusy = false;
    }
  }

  function closePolicyVerification() {
    if (policyBusy && policyDevice) return;
    policyLookupGeneration += 1;
    policySigner = null;
    policyDevice = null;
    policyBusy = false;
    policyError = '';
  }
  async function verifySignerPolicy() {
    if (!policySigner || !policyDevice || policyBusy) return;
    const signerLabel = policySigner.label;
    policyBusy = true;
    policyError = '';
    try {
      const verification = await walletService.verifyMultisigSignerPolicy(
        policyDevice.id,
        policySigner.fingerprint
      );
      policyVerifications = [
        verification,
        ...policyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      policySigner = null;
      policyDevice = null;
      toast({
        title: 'Wallet policy verified',
        description: translate(
          $locale,
          '{signerName} registered the policy and verified its first address.',
          { signerName: signerLabel }
        ),
        tone: 'success'
      });
    } catch (cause) {
      policyError = localizedError(cause, $locale, 'The wallet policy could not be verified.');
    } finally {
      policyBusy = false;
    }
  }
  async function saveColdcardPolicy() {
    if (!wallet || policyBusy) return;
    policyBusy = true;
    policyError = '';
    try {
      const saved = await walletService.savePublicBackup(
        coldcardPolicyFilename(wallet.name),
        `# Groot multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${wallet.externalDescriptor}\n`
      );
      if (saved.saved)
        toast({
          title: 'Coldcard policy saved',
          description: 'Import it on the Coldcard and verify the policy details.',
          tone: 'success',
          action:
            saved.revealToken && saved.revealLabel
              ? {
                  label: saved.revealLabel,
                  run: () => walletService.revealSavedFile(saved.revealToken!)
                }
              : undefined
        });
    } catch (cause) {
      policyError = localizedError(cause, $locale, 'Could not save the Coldcard policy.');
    } finally {
      policyBusy = false;
    }
  }
  async function confirmColdcardPolicy() {
    if (!policySigner || policyBusy) return;
    policyBusy = true;
    policyError = '';
    try {
      const verification = await walletService.acknowledgeColdcardPolicy(policySigner.fingerprint);
      policyVerifications = [
        verification,
        ...policyVerifications.filter(
          (item) =>
            item.signerFingerprint.toLowerCase() !== verification.signerFingerprint.toLowerCase()
        )
      ];
      toast({
        title: 'Coldcard policy recorded',
        description: 'This signer is ready for transaction review.',
        tone: 'success'
      });
      policySigner = null;
    } catch (cause) {
      policyError = localizedError(cause, $locale, 'Could not record the Coldcard policy check.');
    } finally {
      policyBusy = false;
    }
  }
</script>

<div class="page coordinator-page">
  {#if wallet}
    <header class="page-header">
      <div>
        <p class="eyebrow">{translate($locale, 'WALLET POLICY')}</p>
        <h1>{wallet.name}</h1>
        <p class="subtitle">
          {translate(
            $locale,
            'A watch-only wallet whose spending policy is enforced by independent keys.'
          )}
        </p>
      </div>
    </header>
    <section class="vault-hero">
      <span><ShieldCheck size={22} /></span>
      <div class="vault-summary">
        <strong class="vault-balance"><Amount value={snapshot?.balance.total ?? 0} /></strong>
        <div class="vault-policy-tags" aria-label={translate($locale, 'Spending policy')}>
          {#if policyPresentation?.delayed}
            <span class="policy-pill">{translate($locale, '2 of 3 primary keys')}</span>
            <span class="policy-pill delayed"
              ><Clock3 size={12} />{translate(
                $locale,
                delayedPolicyType === 'inheritance'
                  ? 'Heir key after wait'
                  : 'Recovery key after wait'
              )}</span
            >
          {:else}
            <span class="policy-pill">{policyPresentation?.summary}</span>
          {/if}
        </div>
        <p>
          {translate($locale, 'Native SegWit ·')}
          {networkName(snapshot?.network ?? defaultConfig.network)}
        </p>
      </div>
      <div class="vault-actions">
        <div class="wallet-more" bind:this={moreRoot}>
          <OverflowMenuButton
            bind:element={moreTrigger}
            label={translate($locale, 'More wallet actions')}
            expanded={moreOpen}
            onclick={() => (moreOpen = !moreOpen)}
          />{#if moreOpen}<div class="wallet-more-menu" role="menu">
              <button
                role="menuitem"
                onclick={() => {
                  moreOpen = false;
                  showDescriptors = true;
                }}
                ><Eye size={15} /><span
                  ><strong>{translate($locale, 'Show descriptors')}</strong><small
                    >{translate($locale, 'Inspect receive and change logic')}</small
                  ></span
                ></button
              ><a role="menuitem" href="/multisig/backup"
                ><FileKey size={15} /><span
                  ><strong>{translate($locale, 'Export & verify')}</strong><small
                    >{translate($locale, 'Save a public wallet backup')}</small
                  ></span
                ></a
              ><a role="menuitem" href="/multisig/policy"
                ><FlaskConical size={15} /><span
                  ><strong>{translate($locale, 'Recovery policy lab')}</strong><small
                    >{translate($locale, 'Explore guided Miniscript paths')}</small
                  ></span
                ></a
              >
            </div>{/if}
        </div>
        <Button variant="secondary" href="/multisig/receive">{translate($locale, 'Receive')}</Button
        ><Button href="/multisig/send">{translate($locale, 'Send')}</Button>
      </div>
    </section>
    {#if maturitySummary}
      <section class="policy-maturity-panel" aria-live="polite">
        <div class="policy-maturity-panel-heading">
          <span><Clock3 size={19} /></span>
          <div>
            <h2>
              {translate(
                $locale,
                delayedPolicyType === 'inheritance' ? 'Heir access' : 'Recovery access'
              )}
            </h2>
            <p>
              {translate(
                $locale,
                'No action is required. Review coins only if you want to use the backup key or restart a wait.'
              )}
            </p>
          </div>
          <Button variant="secondary" size="small" href="/coins"
            >{translate($locale, 'Review coins')}</Button
          >
        </div>
        <div class="policy-maturity-stats">
          <div>
            <span>{translate($locale, 'Protected')}</span><strong>{maturitySummary.immature}</strong
            >
          </div>
          <div>
            <span>{translate($locale, 'Available soon')}</span><strong
              >{maturitySummary.approaching}</strong
            >
          </div>
          <div>
            <span>{translate($locale, 'Key available')}</span><strong
              >{maturitySummary.mature}</strong
            >
          </div>
        </div>
        <div class="warning-box policy-maturity-truth">
          <ShieldCheck size={17} />
          <span>
            <strong>{translate($locale, 'Your normal keys keep working for every coin.')}</strong>
            {#if maturitySummary.chainCurrent && maturitySummary.nextRemainingBlocks !== null}
              {translate($locale, 'Next transition in {count} blocks.', {
                count: formatInteger(maturitySummary.nextRemainingBlocks, $locale)
              })}
            {:else if !maturitySummary.chainCurrent}
              {translate($locale, 'Countdowns are paused until a recent chain tip is verified.')}
            {/if}
          </span>
        </div>
        <details class="policy-maturity-details">
          <summary>{translate($locale, 'How backup-key access works')}</summary>
          <p>
            {translate(
              $locale,
              'After its wait, the backup key can spend that coin alone. The coin does not expire, and your normal keys still work.'
            )}
          </p>
          {#if maturitySummary.mature > 0}<p>
              {translate(
                $locale,
                'Open an available coin to use the backup key or restart its wait.'
              )}
            </p>{/if}
        </details>
      </section>
    {/if}
    <div class="vault-grid">
      <section class="vault-cosigners">
        <div class="section-heading compact">
          <div>
            <h2>{translate($locale, 'Signing keys')}</h2>
            <p>
              {translate(
                $locale,
                policyPresentation?.delayed
                  ? 'Payments normally use 2 of 3 primary keys. The separate backup key becomes available per coin after its wait.'
                  : `Sign with any ${wallet.threshold} keys. Open a signer to inspect its identity, health, and wallet-policy status.`
              )}
            </p>
          </div>
        </div>
        <div class="saved-cosigner-list">
          {#each wallet.cosigners as signer, i}{@const verification = matchingPolicyVerification(
              signer,
              policyVerifications
            )}
            <article>
              <button
                aria-label={translate($locale, 'View {signer} details', { signer: signer.label })}
                onclick={() => openSigner(signer)}
                ><span class="device-number">{i + 1}</span><span class="saved-cosigner-copy"
                  ><strong>{signer.label}</strong><span
                    ><code>{signer.fingerprint.toLowerCase()}</code><i></i>{translate(
                      $locale,
                      sourceName(signer.source)
                    )}{#if latestHealth(signer)}<i></i>{translate($locale, 'Checked')}
                      <LocalTimestamp
                        value={latestHealth(signer)!.checkedAt}
                      />{:else if verification}<i></i>{translate($locale, 'Policy verified')}
                      <LocalTimestamp value={verification.verifiedAt} />{/if}</span
                  ></span
                ><span
                  class="ready-badge"
                  class:attention={(requiresPolicySetup(signer) && !verification) ||
                    !policyRegistrationProfile(signer).supported ||
                    latestHealth(signer)?.status === 'attention'}
                  >{translate($locale, policyReadinessLabel(signer, verification))}</span
                ><ChevronRight class="row-chevron" size={16} /></button
              >
            </article>{/each}
        </div>
      </section>
      <aside class="vault-backup-card">
        <span class="vault-backup-icon"><FileKey size={20} /></span>
        <div>
          <h2>{translate($locale, 'Backups & recovery')}</h2>
          <p>
            {translate(
              $locale,
              'Save the public policy, then verify it rebuilds the same first address.'
            )}
          </p>
        </div>
        <Button variant="secondary" class="full" href="/multisig/backup"
          >{translate($locale, 'Export & verify')}</Button
        ><Button variant="ghost" class="full" href="/multisig/policy"
          >{translate($locale, 'Recovery policy lab')}</Button
        >
      </aside>
    </div>
  {:else}
    <section class="empty-state vault-empty">
      <span class="empty-icon"><Usb size={24} /></span>
      <h2>{translate($locale, 'Single-key policy')}</h2>
      <p>
        {translate(
          $locale,
          'This wallet is controlled by one signing key. Add another wallet to use a shared or recovery\n        policy.'
        )}
      </p>
      <Button href="/welcome?add=1"
        ><Plus size={16} />{translate($locale, 'Add another wallet')}</Button
      >
    </section>
  {/if}
</div>

<DeviceDetailsModal
  signer={healthPinOpen ? null : selectedSigner}
  health={selectedSigner ? latestHealth(selectedSigner) : null}
  policyStatus={selectedSigner ? signerPolicyStatus(selectedSigner) : null}
  {checking}
  onclose={() => (selectedSigner = null)}
  oncheck={runHealthCheck}
  onpolicy={() => selectedSigner && openPolicyVerification(selectedSigner)}
  onrename={renameSavedSigner}
/>
<TrezorPinModal
  open={healthPinOpen}
  busy={healthPinBusy}
  challengeReady={Boolean(healthPinChallenge)}
  positions={healthPinPositions}
  device={healthPinDevice}
  errorCode={healthPinErrorCode}
  error={healthPinError}
  onappend={(position) => (healthPinPositions += position)}
  ondelete={() => (healthPinPositions = healthPinPositions.slice(0, -1))}
  onclear={() => (healthPinPositions = '')}
  onsubmit={submitHealthPin}
  onretry={() => healthPinDevice && startHealthPin(healthPinDevice)}
  onclose={closeHealthPin}
/>
<MultisigDescriptorsModal
  open={showDescriptors}
  {wallet}
  onclose={() => (showDescriptors = false)}
/>
<Modal
  open={!!policySigner}
  title={translate(
    $locale,
    policySigner && policyRegistrationProfile(policySigner).registration === 'file_once'
      ? 'Prepare Coldcard for this wallet'
      : 'Verify wallet policy'
  )}
  description={translate(
    $locale,
    policySigner && policyRegistrationProfile(policySigner).registration === 'file_once'
      ? 'Complete the one-time policy-file import before signing.'
      : 'Check the policy, signer keys, and first address.'
  )}
  onclose={closePolicyVerification}
>
  {#if policySigner && wallet && policyRegistrationProfile(policySigner).registration === 'file_once'}<ColdcardPolicySetup
      {wallet}
      signer={policySigner}
      busy={policyBusy}
      error={policyError}
      ondownload={saveColdcardPolicy}
      onconfirm={confirmColdcardPolicy}
    />
  {:else if policyBusy && !policyDevice}<HardwareActionPrompt
      title={translate($locale, 'Looking for the saved signer')}
      detail={translate(
        $locale,
        'Keep the saved signer connected and unlocked while Groot checks its account key.'
      )}
      label={translate($locale, 'Signer scan in progress')}
    />
  {:else if policySigner && wallet && policyDevice && policyAddress}<SignerPolicyReview
      {wallet}
      signer={policySigner}
      {policyAddress}
      verification={matchingPolicyVerification(policySigner, policyVerifications)}
      busy={policyBusy}
      error={policyError}
      onverify={verifySignerPolicy}
    />
  {:else if policySigner}<div class="device-scan">
      <Cpu size={20} /><strong>{translate($locale, 'Saved signer not found')}</strong><span
        >{translate(
          $locale,
          policyError || `Connect and unlock ${policySigner.label}, then scan again.`
        )}</span
      ><Button variant="secondary" onclick={() => openPolicyVerification(policySigner!)}
        >{translate($locale, 'Scan again')}</Button
      >
    </div>{/if}
</Modal>
