<script lang="ts">
  import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Cable,
    Check,
    FileUp,
    HelpCircle,
    Network,
    QrCode,
    ShieldCheck
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import HardwareDeviceList from '$lib/components/HardwareDeviceList.svelte';
  import IdentifierDetailsModal from '$lib/components/IdentifierDetailsModal.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import { toast } from '$lib/stores/toasts';
  import { readTransferFile } from '$lib/transfer';
  import { compactIdentifier } from '$lib/address-display';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import {
    walletService,
    WalletError,
    type ExternalSigner,
    type ExternalSignerSource,
    type HardwareDevice,
    type NetworkSetupSource,
    type WalletErrorCode
  } from '$lib/wallet';

  const walletShell = useWalletShellContext();
  const hardwareSteps = ['Connect signer', 'Review identity', 'Protect app'];

  let step = $state(1),
    busy = $state(false),
    scanOpen = $state(false),
    guideOpen = $state(false);
  let label = $state(''),
    encoded = $state(''),
    error = $state(''),
    errorTitle = $state('Could not scan hardware'),
    errorCode = $state<WalletErrorCode | ''>('');
  let pin = $state(''),
    confirmation = $state(''),
    signer = $state<ExternalSigner | null>(null),
    devices = $state<HardwareDevice[]>([]);
  let importSource = $state<ExternalSignerSource>('file');
  let standardWalletOpen = $state(false),
    standardWalletDevice = $state<HardwareDevice | null>(null);
  let hardwareProgress = $state('Scanning all USB hardware wallets…');
  let pinOpen = $state(false),
    pinBusy = $state(false),
    pinChallenge = $state(''),
    pinPositions = $state(''),
    pinError = $state('');
  let pinErrorCode = $state<WalletErrorCode | ''>('');
  let pinDevice = $state<HardwareDevice | null>(null);
  let xpubOpen = $state(false);
  let isLedger = $derived(Boolean(signer?.deviceType?.toLowerCase().includes('ledger')));
  let isTrezor = $derived(Boolean(signer?.deviceType?.toLowerCase().includes('trezor')));
  let isBitBoxNova = $derived(
    Boolean(
      signer?.deviceType?.toLowerCase().includes('bitbox') &&
      signer.label.toLowerCase().includes('nova')
    )
  );
  let isFileImport = $derived(signer?.source === 'file');
  let networkSetupSource = $state<NetworkSetupSource | null>(null);
  let reuseNetworkSetup = $state(true);
  let hardwareScanGeneration = 0;

  onMount(async () => {
    try {
      networkSetupSource = (await walletService.networkSetupSources())[0] ?? null;
    } catch {
      networkSetupSource = null;
    }
  });

  onDestroy(() => {
    hardwareScanGeneration += 1;
    pin = '';
    confirmation = '';
    pinPositions = '';
    pinChallenge = '';
  });

  async function scan() {
    const generation = ++hardwareScanGeneration;
    scanOpen = true;
    busy = true;
    hardwareProgress = 'Scanning all USB hardware wallets…';
    errorTitle = 'Could not scan hardware';
    error = '';
    try {
      const discovered = await walletService.listHardwareDevices();
      if (generation !== hardwareScanGeneration || !scanOpen) return;
      devices = discovered;
    } catch (cause) {
      if (generation !== hardwareScanGeneration) return;
      devices = [];
      error = cause instanceof Error ? cause.message : 'Could not scan hardware.';
    } finally {
      if (generation === hardwareScanGeneration) busy = false;
    }
  }
  function closeHardwareScan() {
    hardwareScanGeneration += 1;
    busy = false;
    scanOpen = false;
  }
  async function useDevice(device: HardwareDevice, allowEmptyPassphrase = false) {
    if (device.action === 'prompt_pin') {
      await startHardwarePin(device);
      return;
    }
    if (device.action === 'confirm_empty_passphrase' && !allowEmptyPassphrase) {
      standardWalletDevice = device;
      scanOpen = false;
      standardWalletOpen = true;
      return;
    }
    if (device.status !== 'ready' && device.status !== 'detected' && !allowEmptyPassphrase) {
      error = device.message;
      return;
    }
    busy = true;
    errorTitle = 'Could not read the account key';
    hardwareProgress = device.model.startsWith('ledger')
      ? 'Reading the public account key from Ledger…'
      : `Reading the public account key from ${device.label}…`;
    error = '';
    try {
      const walletLabel = label.trim() || device.label;
      signer = await walletService.importHardwareExternalSigner(
        device.id,
        walletLabel,
        allowEmptyPassphrase
      );
      label = walletLabel;
      scanOpen = false;
      standardWalletOpen = false;
      standardWalletDevice = null;
      step = 2;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not import the public account key.';
    } finally {
      busy = false;
    }
  }
  async function startHardwarePin(device: HardwareDevice) {
    const retrying = pinOpen;
    busy = true;
    pinBusy = retrying;
    errorTitle = 'Could not start hardware unlock';
    error = '';
    pinError = '';
    pinErrorCode = '';
    pinPositions = '';
    pinChallenge = '';
    try {
      pinChallenge = await walletService.promptHardwarePin(device.id);
      pinDevice = device;
      scanOpen = false;
      pinOpen = true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not start the PIN matrix.';
      if (retrying) {
        pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
        pinError = message;
      } else error = message;
    } finally {
      busy = false;
      pinBusy = false;
    }
  }
  async function submitHardwarePin() {
    if (!pinChallenge || !pinPositions || pinBusy) return;
    pinBusy = true;
    pinError = '';
    pinErrorCode = '';
    let positions = pinPositions;
    pinPositions = '';
    try {
      await walletService.sendHardwarePin(pinChallenge, positions);
      pinChallenge = '';
      pinOpen = false;
      pinDevice = null;
      toast({
        title: 'Hardware wallet unlocked',
        description: 'Now choose its standard or hidden wallet.',
        tone: 'success'
      });
      await scan();
    } catch (cause) {
      pinChallenge = '';
      pinErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      pinError =
        cause instanceof Error ? cause.message : 'Trezor did not accept that matrix entry.';
    } finally {
      positions = '';
      pinBusy = false;
    }
  }
  async function parseImport() {
    if (!encoded.trim() || !label.trim()) return;
    busy = true;
    error = '';
    try {
      signer = await walletService.parseExternalSignerImport(encoded, label, importSource);
      step = 2;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not parse this public-key export.';
    } finally {
      busy = false;
    }
  }
  async function loadFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      if (!label.trim()) {
        label =
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .trim() || 'Recovered hardware wallet';
      }
      encoded = await readTransferFile(file);
      importSource = 'file';
      await parseImport();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not read this file.';
    }
  }
  async function create() {
    const walletName = label.trim();
    if (!signer || !walletName || !pin || pin !== confirmation) return;
    busy = true;
    error = '';
    errorCode = '';
    try {
      let networkSetupCopied = true;
      await walletService.createExternalSignerWallet(
        walletName,
        { ...signer, label: walletName },
        pin
      );
      if (reuseNetworkSetup && networkSetupSource) {
        try {
          await walletService.adoptNetworkSetup(networkSetupSource.walletId, pin);
        } catch {
          networkSetupCopied = false;
        }
      }
      pin = '';
      confirmation = '';
      toast({
        title: 'Hardware wallet added',
        description: networkSetupCopied
          ? 'Only public descriptors are stored in Groot.'
          : 'Network setup was not copied. Configure it in Settings.',
        tone: networkSetupCopied ? 'success' : 'default'
      });
      await walletShell.refreshProfiles();
      await goto('/');
    } catch (cause) {
      errorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      error = cause instanceof Error ? cause.message : 'Could not create the wallet.';
    } finally {
      pin = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<div class="page narrow-page hardware-setup-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">EXTERNAL SIGNER</p>
      <h1>Add hardware wallet</h1>
      <p class="subtitle">One key. Signing stays on your hardware device.</p>
    </div>
    <Button variant="secondary" href="/welcome?add=1"><ArrowLeft size={16} />Cancel</Button>
  </header>
  <div class="hardware-setup-progress">
    <SetupProgress steps={hardwareSteps} current={step} label="Hardware wallet setup progress" />
  </div>
  {#if step === 1}
    <section class="form-card">
      <div class="credential-warning hardware-preparation-note">
        <ShieldCheck size={17} />
        <p>
          <span
            >Before connecting, initialize and unlock the signer. Select any hardware passphrase
            on-device. Groot imports public data only.</span
          >
        </p>
      </div>
      <label class="field"
        ><span>Wallet name</span><input
          bind:value={label}
          maxlength="48"
          placeholder="Defaults to the device model"
        /><FieldCounter
          value={label}
          max={48}
          hint="This also identifies the signer inside Groot"
        /></label
      >
      <div class="source-list">
        <button onclick={scan}
          ><Cable size={20} /><span
            ><strong>Connect with cable</strong><small
              >Jade, BitBox02, Trezor, Ledger, and HWI-compatible devices</small
            ></span
          ><ArrowRight size={17} /></button
        >
        <label class="source-button"
          ><FileUp size={20} /><span
            ><strong>Import public backup</strong><small
              >From this computer, an SD card, or a connected drive</small
            ></span
          ><ArrowRight size={17} /><input
            aria-label="Import public backup file"
            type="file"
            accept=".json,.txt,.bsms,.desc,application/json,text/plain"
            onchange={loadFile}
          /></label
        >
        <button
          onclick={() => {
            importSource = 'qr';
            encoded = '';
          }}
          ><QrCode size={20} /><span
            ><strong>Paste QR payload</strong><small
              >Animated-QR scanners can be added without changing the parser</small
            ></span
          ><ArrowRight size={17} /></button
        >
      </div>
      {#if importSource === 'qr'}<label class="field"
          ><span>Descriptor or public export</span><textarea
            bind:value={encoded}
            rows="5"
            placeholder="wpkh([fingerprint/84'/1'/0']tpub…/<0;1>/*)"></textarea></label
        ><Button
          class="full"
          disabled={!encoded.trim() || !label.trim()}
          loading={busy}
          loadingLabel="Validating…"
          onclick={parseImport}>Validate public key</Button
        >{/if}
      <button class="help-link" onclick={() => (guideOpen = true)}>
        <HelpCircle size={15} />
        <span>Device setup guides</span>
        <ArrowRight size={14} />
      </button>
      {#if error}<p class="form-error">{error}</p>{/if}
    </section>
  {:else if step === 2 && signer}
    <section class="form-card hardware-review-card">
      <span class="setup-step">PUBLIC DATA REVIEW</span>
      <h2>{label.trim() || signer.label}</h2>
      <label class="field"
        ><span>Wallet name</span><input
          aria-label="Reviewed wallet name"
          bind:value={label}
          maxlength="48"
        /><FieldCounter
          value={label}
          max={48}
          hint="You can rename this local Groot wallet without changing its signer identity"
        /></label
      >
      <dl class="details-list">
        <div>
          <dt>Fingerprint</dt>
          <dd class="mono">{signer.fingerprint}</dd>
        </div>
        <div>
          <dt>Account path</dt>
          <dd class="mono">{signer.derivationPath}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{signer.source}</dd>
        </div>
        <div>
          <dt>Account xpub</dt>
          <dd>
            <button
              type="button"
              class="address-review-trigger mono"
              aria-label="View complete account public key"
              onclick={() => (xpubOpen = true)}>{compactIdentifier(signer.xpub, 14, 10)}</button
            >
          </dd>
        </div>
      </dl>
      {#if isLedger}
        <div class="credential-warning">
          <ShieldCheck size={17} />
          <p>
            <strong>This identifies the wallet currently open on Ledger.</strong><span
              >A different seed or passphrase produces a different fingerprint and completely
              different addresses. Nano S Plus does not display this fingerprint, so verify your
              first receive address on Ledger before using the wallet.</span
            >
          </p>
        </div>
        <details class="ledger-passphrase-help">
          <summary>Want to use a Ledger passphrase?</summary>
          <p>
            Set it directly on Ledger before importing: open device Settings → Security →
            Passphrase, then choose a temporary passphrase or attach one to a secondary PIN. Go back
            and import again after activating that wallet. Groot never receives the passphrase.
          </p>
        </details>
      {:else if isTrezor}
        <div class="credential-warning">
          <ShieldCheck size={17} />
          <p>
            <strong>This public identity came from the connected Trezor.</strong><span
              >Trezor does not show its master fingerprint during this export, so no fingerprint
              comparison is required here. After setup, verify the first receive address on the
              Trezor before accepting bitcoin.</span
            >
          </p>
        </div>
      {:else if isBitBoxNova}
        <div class="credential-warning">
          <ShieldCheck size={17} />
          <p>
            <strong>This public identity came from the connected Nova.</strong><span
              >Nova does not show its fingerprint during this import, so no fingerprint comparison
              is required here. After setup, verify the first receive address on Nova before
              accepting bitcoin.</span
            >
          </p>
        </div>
      {:else if isFileImport}
        <div class="credential-warning">
          <ShieldCheck size={17} />
          <p>
            <strong>Review the public backup identity.</strong><span
              >Compare the fingerprint with the original wallet or a trusted record when available.
              After setup, verify the first receive address on the hardware wallet before accepting
              funds.</span
            >
          </p>
        </div>
      {:else}
        <div class="credential-warning">
          <ShieldCheck size={17} />
          <p>
            <strong>Verify the fingerprint.</strong><span
              >Compare it with the value shown by the hardware wallet or its trusted export. A
              different seed or passphrase produces a different wallet.</span
            >
          </p>
        </div>
      {/if}
      <div class="split-actions">
        <Button
          variant="secondary"
          onclick={() => {
            signer = null;
            step = 1;
          }}>Back</Button
        ><Button disabled={!label.trim()} onclick={() => (step = 3)}
          >{isLedger
            ? 'Use this Ledger wallet'
            : isTrezor
              ? 'Use this Trezor wallet'
              : isBitBoxNova
                ? 'Use this Nova wallet'
                : isFileImport
                  ? 'Use this public backup'
                  : 'Fingerprint matches'}<ArrowRight size={17} /></Button
        >
      </div>
    </section>
  {:else if signer}
    <form
      class="form-card hardware-protection-card"
      onsubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <h2>Set an app PIN</h2>
      <p>
        This unlocks this wallet in Groot. Sending bitcoin still requires your hardware signer. It
        is separate from the PIN and passphrase on that device.
      </p>
      <PasswordField
        label="App PIN"
        bind:value={pin}
        autocomplete="new-password"
        hint="It can be different for every wallet in Groot."
      />
      <PasswordField
        label="Confirm app PIN"
        bind:value={confirmation}
        autocomplete="new-password"
        error={confirmation && pin !== confirmation ? 'PINs do not match.' : ''}
      />
      {#if networkSetupSource}<label class="credential-warning credential-ack"
          ><input type="checkbox" bind:checked={reuseNetworkSetup} /><Network size={16} />
          <p>
            <strong>Use {networkSetupSource.walletName}’s network setup.</strong><span
              >Copies its node and sync method. This wallet protects its own copy.</span
            >
          </p></label
        >{/if}
      {#if error}
        <div class="hardware-inline-error hardware-create-error" role="alert">
          <AlertTriangle size={18} />
          <span>
            <strong
              >{errorCode === 'wallet_already_exists'
                ? 'This hardware wallet is already in Groot'
                : 'Could not create the wallet'}</strong
            >
            <small
              >{errorCode === 'wallet_already_exists'
                ? 'Groot matched the same public descriptor. No duplicate was created and nothing was changed. Open the existing wallet instead.'
                : error}</small
            >
          </span>
          {#if errorCode === 'wallet_already_exists'}<Button
              variant="secondary"
              size="small"
              onclick={() => goto('/')}>Open wallet</Button
            >{/if}
        </div>
      {/if}
      <div class="split-actions">
        <Button
          variant="secondary"
          onclick={() => {
            error = '';
            errorCode = '';
            step = 2;
          }}>Back</Button
        ><Button
          type="submit"
          disabled={!pin || pin !== confirmation}
          loading={busy}
          loadingLabel="Creating wallet…"><Check size={17} />Create wallet</Button
        >
      </div>
    </form>
  {/if}
</div>
<IdentifierDetailsModal
  value={signer?.xpub ?? ''}
  open={xpubOpen && Boolean(signer)}
  title="Account public key"
  description="Complete watch-only key imported from this signer."
  label="Account xpub"
  onclose={() => (xpubOpen = false)}
/>

<Modal
  open={scanOpen}
  title="Connect hardware signer"
  description="Quit other wallet apps so Groot can use USB."
  onclose={closeHardwareScan}
>
  {#if busy}<HardwareActionPrompt
      title={hardwareProgress}
      detail={hardwareProgress.startsWith('Scanning')
        ? 'Keep the signer connected. Quit other wallet apps.'
        : hardwareProgress.includes('Ledger')
          ? 'Keep Bitcoin Test open for Regtest and follow any prompt on the Ledger screen.'
          : 'Keep the signer connected and unlocked.'}
      label="Hardware wallet setup in progress"
    />{:else if devices.length || !error}<HardwareDeviceList
      {devices}
      emptyMessage="Unlock the signer, quit other wallet apps, then scan again."
      onselect={useDevice}
      onrescan={scan}
      disabled={busy}
      detailedStatus
    />{/if}
  {#if error}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span><strong>{errorTitle}</strong><small>{error}</small></span
      ><Button variant="secondary" size="small" onclick={scan}>Scan again</Button>
    </div>{/if}
</Modal>
<Modal
  open={standardWalletOpen}
  title="Use Trezor standard wallet?"
  description="This selects the seed-derived wallet with no hardware passphrase."
  onclose={() => {
    standardWalletOpen = false;
    standardWalletDevice = null;
    scanOpen = true;
  }}
>
  <div class="credential-warning">
    <ShieldCheck size={17} />
    <p>
      <strong>Your hidden wallet is unchanged.</strong><span
        >The same Trezor can use a passphrase-derived wallet elsewhere and its standard wallet here.
        They have different fingerprints and addresses.</span
      >
    </p>
  </div>
  <p>
    Review the imported public identity in the next step. You can enable or choose a Trezor
    passphrase later, but that opens a different hidden wallet; add it to Groot as a separate wallet
    while this standard wallet remains unchanged.
  </p>
  {#if busy}<HardwareActionPrompt
      title="Importing the Trezor standard wallet"
      detail="Keep Trezor connected while Groot reads its public account key."
      label="Hardware wallet import in progress"
    />{:else}<div class="split-actions">
      <Button
        variant="secondary"
        onclick={() => {
          standardWalletOpen = false;
          standardWalletDevice = null;
          scanOpen = true;
        }}>Back</Button
      ><Button
        disabled={!standardWalletDevice}
        onclick={() => {
          if (standardWalletDevice) useDevice(standardWalletDevice, true);
        }}>Use standard wallet</Button
      >
    </div>{/if}
</Modal>
<TrezorPinModal
  open={pinOpen}
  busy={pinBusy}
  challengeReady={Boolean(pinChallenge)}
  positions={pinPositions}
  device={pinDevice}
  errorCode={pinErrorCode}
  error={pinError}
  onappend={(position) => (pinPositions += position)}
  ondelete={() => (pinPositions = pinPositions.slice(0, -1))}
  onclear={() => (pinPositions = '')}
  onsubmit={submitHardwarePin}
  onretry={() => {
    if (pinDevice) startHardwarePin(pinDevice);
  }}
  onclose={() => {
    pinOpen = false;
    pinPositions = '';
    pinChallenge = '';
    pinDevice = null;
    pinError = '';
    pinErrorCode = '';
  }}
/>
<Modal
  open={guideOpen}
  title="Prepare your signer"
  description="Use the device’s own screen to confirm identity and passphrase wallet."
  onclose={() => (guideOpen = false)}
>
  <div class="guide-list">
    <p>
      <strong>Jade</strong><span
        >Log in on Jade, then connect USB or import its BIP84 xpub by QR.</span
      >
    </p>
    <p>
      <strong>BitBox02</strong><span>Unlock BitBox and quit BitBoxApp, then scan.</span>
    </p>
    <p>
      <strong>Trezor</strong><span
        >Unlock on-device. Model One hidden-wallet passphrases are not supported.</span
      >
    </p>
    <p>
      <strong>Ledger</strong><span>Quit Ledger Live, unlock Ledger, and open Bitcoin Test.</span>
    </p>
    <p>
      <strong>Passport</strong><span>Import a BIP84 descriptor or xpub by microSD or QR.</span>
    </p>
  </div>
</Modal>
