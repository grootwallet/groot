<script lang="ts">
  import {
    Check,
    ChevronRight,
    Clock3,
    Cpu,
    Download,
    Eye,
    FileKey,
    HeartPulse,
    History,
    KeyRound,
    LockKeyhole,
    Moon,
    Network,
    Pencil,
    Plus,
    RefreshCw,
    ShieldCheck,
    Sun,
    Trash2,
    WalletCards
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import IdentifierDetailsModal from '$lib/components/IdentifierDetailsModal.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import { toast } from '$lib/stores/toasts';
  import { formatInteger, locale, t } from '$lib/i18n';
  import { APP_VERSION, defaultConfig, networkName } from '$lib/config';
  import { walletService, WalletError } from '$lib/wallet';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import type {
    CoreNodeConfig,
    CosignerHealthCheck,
    ExternalSignerWallet,
    NetworkSetupSource,
    NodeStatus,
    RecoveryScanSettings,
    RecoveryScanStatus,
    WalletProfile,
    WalletSyncSource
  } from '$lib/wallet/contracts';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import { matchingDeviceForHealthCheck } from '$lib/hardware/health-check';
  import { amountUnit, denomination, formatAmount, setDenomination } from '$lib/denomination';
  import {
    hardwareHealthChecks,
    hardwareHealthKey,
    recordHardwareHealthCheck,
    setHardwareHealthChecks
  } from '$lib/hardware/health-check-state';
  const walletShell = useWalletShellContext();
  let deleting = $state(false);
  let confirmText = $state('');
  let deleteCredential = $state('');
  let busy = $state(false);
  let checking = $state(false);
  let connected = $state<boolean | null>(null);
  let nodeStatus = $state<NodeStatus | null>(null);
  let theme = $state<'light' | 'dark'>('dark');
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let profileReadGeneration = 0;
  let inactivityTimeoutMinutes = $state(5);
  let savingInactivityTimeout = $state(false);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let isSoftwareWallet = $derived(selectedProfile?.kind === 'single_key');
  let credentialLabel = $derived(isSoftwareWallet ? 'Wallet passphrase' : 'App PIN');
  let backupTitle = $derived(
    selectedProfile?.kind === 'multisig'
      ? 'Policy and signer backups'
      : selectedProfile?.kind === 'watch_only'
        ? 'Hardware signer backup'
        : 'Recovery words + wallet passphrase'
  );
  let backupDescription = $derived(
    selectedProfile?.kind === 'multisig'
      ? 'Keep the public descriptor and enough signer backups to restore access.'
      : selectedProfile?.kind === 'watch_only'
        ? 'Recovery words remain on the signer. The app PIN only protects local Groot data.'
        : 'Keep both together. Recovery words can be re-presented only in the authenticated native backup flow; the wallet passphrase cannot be displayed or reset.'
  );
  const timeoutOptions = [
    { value: 1, label: '1 minute' },
    { value: 5, label: '5 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' }
  ];
  let nodeOpen = $state(false),
    nodePassword = $state(''),
    walletCredential = $state(''),
    nodeError = $state('');
  const localRpcUrl =
    defaultConfig.network === 'regtest'
      ? 'http://127.0.0.1:18443'
      : defaultConfig.network === 'signet'
        ? 'http://127.0.0.1:38332'
        : 'http://127.0.0.1:48332';
  const localNodeConfig = (): CoreNodeConfig => ({
    backend: { type: 'local_core', url: localRpcUrl },
    auth: defaultConfig.network === 'regtest' ? 'cookie' : 'user_pass',
    username: null,
    torProxy: null
  });
  let node = $state<CoreNodeConfig>(localNodeConfig());
  let networkSetupSources = $state<NetworkSetupSource[]>([]);
  let networkReuseOpen = $state(false),
    networkReuseSourceId = $state(''),
    networkReuseCredential = $state(''),
    networkReuseError = $state(''),
    networkReusing = $state(false);
  let reusableNetworkSetups = $derived(
    networkSetupSources.filter((source) => source.walletId !== selectedWalletId)
  );
  let syncSource = $state<WalletSyncSource>({ type: 'bitcoin_core' });
  let syncOpen = $state(false),
    syncSaving = $state(false),
    syncCredential = $state(''),
    syncError = $state('');
  let syncSourceType = $state<'bitcoin_core' | 'compact_filters'>('bitcoin_core');
  let syncDiscoverPeers = $state(true),
    syncPeers = $state(''),
    syncRequiredPeers = $state(2),
    syncTorProxy = $state('');
  let scanOpen = $state(false),
    scanCredential = $state(''),
    scanError = $state(''),
    scan = $state<RecoveryScanSettings>({ birthdayHeight: 0, gapLimit: 20 }),
    scanDraft = $state<RecoveryScanSettings>({ birthdayHeight: 0, gapLimit: 20 });
  let scanStatus = $state<RecoveryScanStatus>({
    status: 'idle',
    birthdayHeight: 0,
    gapLimit: 20,
    currentHeight: 0,
    targetHeight: 0,
    processedBlocks: 0,
    totalBlocks: 0,
    startedAt: 0,
    updatedAt: 0
  });
  let scanning = $state(false),
    cancellingScan = $state(false),
    scanPoll: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let scanPercent = $derived(
    scanStatus.totalBlocks > 0
      ? Math.min(100, Math.round((scanStatus.processedBlocks / scanStatus.totalBlocks) * 100))
      : 0
  );
  let verifyOpen = $state(false),
    verifyCredential = $state(''),
    verifyError = $state(''),
    verifying = $state(false),
    revealingBackup = $state(false);
  let hardwareBackupOpen = $state(false),
    descriptorDetailsOpen = $state(false),
    hardwareBackupPin = $state(''),
    hardwareBackupError = $state(''),
    hardwareBackup = $state(''),
    hardwareBackupContent = $state(''),
    exportingHardwareBackup = $state(false);
  let renameOpen = $state(false),
    renameDraft = $state(''),
    renameError = $state(''),
    renaming = $state(false);
  let hardwareSignerWallet = $state<ExternalSignerWallet | null>(null);
  let signerDetailsOpen = $state(false);
  let checkingSignerHealth = $state(false);
  let hardwareSignerDetails = $derived.by<CosignerDraft | null>(() =>
    hardwareSignerWallet
      ? {
          id: `external-${hardwareSignerWallet.signer.fingerprint.toLowerCase()}`,
          ...hardwareSignerWallet.signer,
          source: hardwareSignerWallet.signer.source
        }
      : null
  );
  let signerHealth = $derived(
    hardwareSignerWallet
      ? ($hardwareHealthChecks[hardwareHealthKey(hardwareSignerWallet.signer.fingerprint)] ?? null)
      : null
  );
  let signerRenameOpen = $state(false),
    signerRenameDraft = $state(''),
    signerRenameError = $state(''),
    signerRenaming = $state(false);
  onMount(async () => {
    const generation = ++profileReadGeneration;
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const registry = await walletService.profiles();
    if (generation !== profileReadGeneration) return;
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
    inactivityTimeoutMinutes = registry.inactivityTimeoutMinutes;
    const activeProfile = registry.wallets.find(
      (wallet) => wallet.id === registry.selectedWalletId
    );
    if (activeProfile?.kind === 'watch_only') {
      const [nextHardwareSignerWallet, nextHealthChecks] = await Promise.all([
        walletService.externalSignerWallet(),
        walletService.hardwareHealthChecks()
      ]);
      hardwareSignerWallet = nextHardwareSignerWallet;
      setHardwareHealthChecks(nextHealthChecks);
    } else {
      setHardwareHealthChecks([]);
    }
    [node, syncSource, networkSetupSources] = await Promise.all([
      walletService.nodeConfig(),
      walletService.syncSource(),
      walletService.networkSetupSources()
    ]);
    scan = await walletService.recoveryScanSettings();
    scanDraft = { ...scan };
    scanStatus = await walletService.recoveryScanStatus();
  });
  onDestroy(() => {
    destroyed = true;
    deleteCredential = '';
    confirmText = '';
    nodePassword = '';
    walletCredential = '';
    networkReuseCredential = '';
    syncCredential = '';
    scanCredential = '';
    verifyCredential = '';
    hardwareBackupPin = '';
    hardwareBackup = '';
    hardwareBackupContent = '';
    signerRenameDraft = '';
    if (scanPoll) clearTimeout(scanPoll);
  });
  function setTheme(next: 'light' | 'dark') {
    theme = next;
    document.documentElement.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'light' ? '#f4f1e9' : '#0d1118');
    localStorage.setItem('groot-theme', next);
  }
  function storageSize(bytes: number) {
    return bytes >= 1_000_000_000
      ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
      : `${Math.round(bytes / 1_000_000)} MB`;
  }
  async function checkConnection() {
    checking = true;
    try {
      const result = await walletService.testNodeConnection();
      connected = true;
      nodeStatus = result;
      toast({
        title: 'Bitcoin node connected',
        description: `${formatInteger(result.blocks, $locale)} blocks · ${result.pruned ? `pruned from ${result.pruneHeight === null ? 'an unknown height' : formatInteger(result.pruneHeight, $locale)}` : 'full block history'}`,
        tone: 'success'
      });
    } catch (cause) {
      connected = false;
      toast({
        title: 'Node unavailable',
        description: cause instanceof Error ? cause.message : undefined,
        tone: 'danger'
      });
    } finally {
      checking = false;
    }
  }
  function setNodeLocation(type: 'local_core' | 'remote_core' | 'tor') {
    node =
      type === 'local_core'
        ? localNodeConfig()
        : type === 'tor'
          ? {
              backend: { type: 'remote_core', url: 'http://example.onion:8332' },
              auth: 'user_pass',
              username: '',
              torProxy: '127.0.0.1:9050'
            }
          : {
              backend: { type: 'remote_core', url: 'https://' },
              auth: 'user_pass',
              username: '',
              torProxy: null
            };
    nodePassword = '';
    nodeError = '';
  }
  async function saveNode() {
    busy = true;
    nodeError = '';
    try {
      const result = await walletService.saveNodeConfig(node, nodePassword, walletCredential);
      connected = true;
      nodeStatus = result;
      nodeOpen = false;
      nodePassword = '';
      walletCredential = '';
      toast({
        title: 'Node saved and verified',
        description: `Connected at block ${formatInteger(result.blocks, $locale)} · ${result.pruned ? 'pruned' : 'full history'}.`,
        tone: 'success'
      });
    } catch (cause) {
      connected = false;
      nodeError = cause instanceof Error ? cause.message : 'Could not save this node.';
    } finally {
      nodePassword = '';
      walletCredential = '';
      busy = false;
    }
  }
  function openNetworkReuse() {
    networkReuseSourceId = reusableNetworkSetups[0]?.walletId ?? '';
    networkReuseCredential = '';
    networkReuseError = '';
    networkReuseOpen = true;
  }
  async function reuseNetworkSetup() {
    if (!networkReuseSourceId || !networkReuseCredential) return;
    networkReusing = true;
    networkReuseError = '';
    const source = reusableNetworkSetups.find(
      (candidate) => candidate.walletId === networkReuseSourceId
    );
    try {
      const result = await walletService.adoptNetworkSetup(
        networkReuseSourceId,
        networkReuseCredential
      );
      node = result.backend;
      syncSource = await walletService.syncSource();
      connected = true;
      nodeStatus = result;
      networkReuseCredential = '';
      networkReuseOpen = false;
      toast({
        title: 'Network setup reused',
        description: source ? `Copied from ${source.walletName}.` : undefined,
        tone: 'success'
      });
    } catch (cause) {
      networkReuseError = cause instanceof Error ? cause.message : 'Could not reuse this setup.';
    } finally {
      networkReuseCredential = '';
      networkReusing = false;
    }
  }
  function openSyncSource() {
    syncSourceType = syncSource.type;
    if (syncSource.type === 'compact_filters') {
      syncDiscoverPeers = syncSource.discoverPeers;
      syncPeers = syncSource.peers.join('\n');
      syncRequiredPeers = syncSource.requiredPeers;
      syncTorProxy = syncSource.torProxy ?? '';
    } else {
      syncDiscoverPeers = defaultConfig.network !== 'regtest';
      syncPeers = defaultConfig.network === 'regtest' ? '127.0.0.1:18444' : '';
      syncRequiredPeers = defaultConfig.network === 'regtest' ? 1 : 2;
      syncTorProxy = '';
    }
    syncCredential = '';
    syncError = '';
    syncOpen = true;
  }
  async function saveSyncSource() {
    syncSaving = true;
    syncError = '';
    const source: WalletSyncSource =
      syncSourceType === 'bitcoin_core'
        ? { type: 'bitcoin_core' }
        : {
            type: 'compact_filters',
            peers: syncPeers
              .split(/\r?\n/)
              .map((peer) => peer.trim())
              .filter(Boolean),
            requiredPeers: Number(syncRequiredPeers),
            discoverPeers: syncDiscoverPeers,
            torProxy: syncTorProxy.trim() || null
          };
    try {
      syncSource = await walletService.saveSyncSource(source, syncCredential);
      syncCredential = '';
      syncOpen = false;
      toast({
        title: 'Wallet sync source updated',
        description:
          syncSource.type === 'compact_filters'
            ? 'The next refresh will discover confirmed activity through verified compact block filters.'
            : 'The next refresh will use the configured Bitcoin Core node.',
        tone: 'success'
      });
    } catch (cause) {
      syncError = cause instanceof Error ? cause.message : 'Could not save the wallet sync source.';
    } finally {
      syncCredential = '';
      syncSaving = false;
    }
  }
  async function lockNow() {
    await walletService.lock();
    await goto('/unlock');
  }
  async function saveInactivityTimeout(minutes: number) {
    const previous = inactivityTimeoutMinutes;
    inactivityTimeoutMinutes = minutes;
    savingInactivityTimeout = true;
    try {
      const registry = await walletService.saveInactivityTimeout(minutes);
      inactivityTimeoutMinutes = registry.inactivityTimeoutMinutes;
      toast({
        title: 'Automatic lock updated',
        description: `Every wallet will lock after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of inactivity.`,
        tone: 'success'
      });
    } catch (cause) {
      inactivityTimeoutMinutes = previous;
      toast({
        title: 'Could not update automatic lock',
        description: cause instanceof Error ? cause.message : undefined,
        tone: 'danger'
      });
    } finally {
      savingInactivityTimeout = false;
    }
  }
  function openRename() {
    renameDraft = selectedProfile?.name ?? '';
    renameError = '';
    renameOpen = true;
  }
  async function renameWallet() {
    renaming = true;
    renameError = '';
    try {
      const renamed = await walletService.renameWallet(renameDraft);
      profiles = profiles.map((profile) => (profile.id === renamed.id ? renamed : profile));
      renameDraft = '';
      renameOpen = false;
      toast({
        title: 'Wallet name updated',
        description: `This wallet is now shown as ${renamed.name}.`,
        tone: 'success'
      });
    } catch (cause) {
      renameError = cause instanceof Error ? cause.message : 'Could not rename this wallet.';
    } finally {
      renaming = false;
    }
  }
  function openSignerRename() {
    signerRenameDraft = hardwareSignerWallet?.signer.label ?? '';
    signerRenameError = '';
    signerRenameOpen = true;
  }
  async function renameHardwareSigner() {
    signerRenaming = true;
    signerRenameError = '';
    try {
      hardwareSignerWallet = await walletService.renameExternalSigner(signerRenameDraft);
      signerRenameDraft = '';
      signerRenameOpen = false;
      toast({
        title: 'Hardware signer name updated',
        description: 'Signing and verification screens now use the new local name.',
        tone: 'success'
      });
    } catch (cause) {
      signerRenameError =
        cause instanceof Error ? cause.message : 'Could not rename this hardware signer.';
    } finally {
      signerRenaming = false;
    }
  }
  async function runExternalSignerHealthCheck() {
    if (!hardwareSignerWallet || checkingSignerHealth) return;
    const signer = hardwareSignerWallet.signer;
    checkingSignerHealth = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This saved signer has no USB device type. Re-import its public account backup.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      const result = await walletService.checkHardwareExternalSigner(signer, device.id);
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({
        title: 'Signer verified',
        description: `${signer.label} matches this wallet.`,
        tone: 'success'
      });
    } catch (cause) {
      const result: CosignerHealthCheck = {
        checkedAt: new Date().toISOString(),
        summary: cause instanceof Error ? cause.message : 'The device could not be verified.',
        status: 'attention'
      };
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({ title: 'Health check needs attention', description: result.summary, tone: 'danger' });
    } finally {
      checkingSignerHealth = false;
    }
  }
  async function saveHardwareHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
    recordHardwareHealthCheck(fingerprint, check);
  }
  async function runFullRescan() {
    scanning = true;
    scanError = '';
    try {
      scan = await walletService.saveRecoveryScanSettings(
        Number(scanDraft.birthdayHeight),
        Number(scanDraft.gapLimit),
        scanCredential
      );
      scanDraft = { ...scan };
      const rescan = walletService.fullRescan(scanCredential);
      void pollFullRescan();
      const snapshot = await rescan;
      scanStatus = await walletService.recoveryScanStatus();
      scanOpen = false;
      toast({
        title: 'Full rescan complete',
        description: `Recovered balance: ${formatAmount(snapshot.balance.total, $denomination)} ${amountUnit($denomination)}`,
        tone: 'success'
      });
    } catch (cause) {
      scanError = cause instanceof Error ? cause.message : 'The full rescan failed.';
      try {
        scanStatus = await walletService.recoveryScanStatus();
      } catch {
        /* Keep the original failure. */
      }
    } finally {
      if (scanPoll) clearTimeout(scanPoll);
      scanPoll = undefined;
      scanCredential = '';
      scanning = false;
      cancellingScan = false;
    }
  }
  async function pollFullRescan() {
    try {
      scanStatus = await walletService.recoveryScanStatus();
    } catch {
      /* The foreground result remains authoritative. */
    } finally {
      if (scanning && !destroyed) scanPoll = setTimeout(() => void pollFullRescan(), 250);
    }
  }
  async function cancelFullRescan() {
    cancellingScan = true;
    scanError = '';
    try {
      scanStatus = await walletService.cancelFullRescan();
    } catch (cause) {
      scanError =
        cause instanceof Error ? cause.message : 'The recovery scan could not be cancelled.';
      cancellingScan = false;
    }
  }
  async function deleteWallet() {
    busy = true;
    try {
      await walletService.deleteWallet(deleteCredential, confirmText);
      deleting = false;
      confirmText = '';
      deleteCredential = '';
      toast({
        title: 'Wallet deleted',
        description: 'Local wallet data and encrypted key material were removed.'
      });
      await walletShell.refreshProfiles();
      const registry = await walletService.profiles();
      await goto(registry.wallets.length ? '/unlock' : '/welcome');
    } catch (cause) {
      toast({
        title: 'Could not delete wallet',
        description: cause instanceof Error ? cause.message : undefined,
        tone: 'danger'
      });
    } finally {
      deleteCredential = '';
      busy = false;
    }
  }
  async function verifyBackup() {
    verifying = true;
    verifyError = '';
    try {
      const verified = await walletService.verifyBackup(verifyCredential);
      verifyCredential = '';
      verifyOpen = false;
      if (!verified) {
        toast({
          title: 'Backup still unverified',
          description: 'Return when your written recovery words are available.'
        });
        return;
      }
      profiles = profiles.map((profile) =>
        profile.id === selectedWalletId ? { ...profile, backupVerified: true } : profile
      );
      toast({
        title: 'Recovery backup verified',
        description: 'Your written words matched this wallet.',
        tone: 'success'
      });
    } catch (cause) {
      verifyError =
        cause instanceof Error ? cause.message : 'Could not verify this recovery backup.';
    } finally {
      verifyCredential = '';
      verifying = false;
    }
  }
  async function revealAndVerifyBackup() {
    revealingBackup = true;
    verifyError = '';
    try {
      const verified = await walletService.revealAndVerifyBackup(verifyCredential);
      if (!verified) {
        toast({
          title: 'Backup still unverified',
          description: 'Your recovery words remain available to reveal again before verification.'
        });
        return;
      }
      verifyOpen = false;
      profiles = profiles.map((profile) =>
        profile.id === selectedWalletId ? { ...profile, backupVerified: true } : profile
      );
      toast({
        title: 'Recovery backup verified',
        description: 'Your reconstructed word order matched this wallet.',
        tone: 'success'
      });
    } catch (cause) {
      verifyError =
        cause instanceof Error ? cause.message : 'Could not reveal this recovery backup.';
    } finally {
      verifyCredential = '';
      revealingBackup = false;
    }
  }
  async function prepareHardwareBackup() {
    exportingHardwareBackup = true;
    hardwareBackupError = '';
    try {
      const backup = await walletService.exportExternalSignerDescriptor(hardwareBackupPin);
      hardwareBackup = backup.descriptor;
      hardwareBackupContent = backup.content;
      hardwareBackupPin = '';
      toast({
        title: 'Public descriptor ready',
        description: 'This watch-only backup cannot sign, but it reveals wallet activity.',
        tone: 'success'
      });
    } catch (cause) {
      hardwareBackupError =
        cause instanceof Error ? cause.message : 'Could not prepare the public descriptor.';
    } finally {
      hardwareBackupPin = '';
      exportingHardwareBackup = false;
    }
  }
  async function saveHardwareBackup() {
    try {
      const saved = await walletService.savePublicBackup(
        'groot-hardware-wallet.json',
        hardwareBackupContent
      );
      if (saved.saved)
        toast({
          title: 'Descriptor backup saved',
          description: 'Use this file for a clean-profile recovery test.',
          tone: 'success',
          action:
            saved.revealToken && saved.revealLabel
              ? {
                  label: saved.revealLabel,
                  run: async () => {
                    try {
                      await walletService.revealSavedFile(saved.revealToken!);
                    } catch (cause) {
                      toast({
                        title: 'Could not show saved backup',
                        description: cause instanceof Error ? cause.message : undefined,
                        tone: 'danger'
                      });
                    }
                  }
                }
              : undefined
        });
    } catch (cause) {
      hardwareBackupError =
        cause instanceof Error ? cause.message : 'Could not save the descriptor backup.';
    }
  }
  async function selectWallet(profile: WalletProfile) {
    if (profile.id === selectedWalletId) return;
    const previousWalletId = selectedWalletId;
    ++profileReadGeneration;
    selectedWalletId = profile.id;
    try {
      await walletShell.selectWallet(profile.id);
      selectedWalletId = walletShell.selectedWalletId();
    } catch (cause) {
      if (selectedWalletId === profile.id) selectedWalletId = previousWalletId;
      toast({
        title: 'Could not open wallet',
        description: cause instanceof Error ? cause.message : undefined,
        tone: 'danger'
      });
    }
  }
</script>

<div class="page narrow-page settings-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">WALLET SETTINGS</p>
      <h1>{selectedProfile?.name ?? 'Settings'}</h1>
      <p class="subtitle">Wallet security and connection. Appearance is global.</p>
    </div>
  </header>
  <section class="settings-group wallet-details">
    <h2>Wallet details</h2>
    <div class="settings-list">
      <button aria-label={`Rename ${selectedProfile?.name ?? 'wallet'}`} onclick={openRename}
        ><span class="setting-icon"><Pencil size={18} /></span><span
          ><strong>Wallet name</strong><small
            >{selectedProfile?.name ?? 'Unnamed wallet'} · Local display name only</small
          ></span
        ><ChevronRight size={16} /></button
      >
      {#if hardwareSignerWallet}
        <button
          aria-label={`Rename hardware signer ${hardwareSignerWallet.signer.label}`}
          onclick={openSignerRename}
          ><span class="setting-icon"><Cpu size={18} /></span><span
            ><strong>Hardware signer name</strong><small
              >{hardwareSignerWallet.signer.label} · Used on signing and verification screens</small
            ></span
          ><ChevronRight size={16} /></button
        >
        <button
          aria-label={`Inspect ${hardwareSignerWallet.signer.label} identity and health`}
          onclick={() => (signerDetailsOpen = true)}
        >
          <span class="setting-icon"><HeartPulse size={18} /></span>
          <span
            ><strong>Hardware signer identity &amp; health</strong><small
              >{#if signerHealth}Last checked <LocalTimestamp
                  value={signerHealth.checkedAt}
                />{:else}Inspect identity or run a health check{/if}</small
            ></span
          >
          <span class="setting-row-status"
            ><span
              class="info-badge"
              class:healthy={signerHealth?.status === 'healthy'}
              class:attention={signerHealth?.status === 'attention'}
              class:muted={!signerHealth}
              >{signerHealth?.status === 'healthy'
                ? 'Checked'
                : signerHealth?.status === 'attention'
                  ? 'Attention'
                  : 'Not checked'}</span
            ><ChevronRight size={16} /></span
          >
        </button>
      {/if}
    </div>
  </section>
  <section class="settings-group immediate-security">
    <h2>Security</h2>
    <div class="settings-list">
      <button onclick={lockNow}
        ><span class="setting-icon"><LockKeyhole size={18} /></span><span
          ><strong>Lock {selectedProfile?.name ?? 'wallet'} now</strong><small
            >Lock only this wallet immediately.</small
          ></span
        ><ChevronRight size={16} /></button
      >
      <div class="setting-row automatic-lock-row">
        <span class="setting-icon"><Clock3 size={18} /></span><span
          ><strong>Automatic lock</strong><small
            >One global setting; each unlocked wallet tracks its own inactivity.</small
          ></span
        ><select
          class="timeout-choice"
          aria-label="Automatic lock inactivity period"
          value={inactivityTimeoutMinutes}
          disabled={savingInactivityTimeout}
          onchange={(event) => saveInactivityTimeout(Number(event.currentTarget.value))}
          >{#each timeoutOptions as option}<option value={option.value}>{option.label}</option
            >{/each}</select
        >
      </div>
    </div>
  </section>
  <section class="settings-group current-wallet-settings">
    <h2>Backup and recovery</h2>
    <div class="settings-list">
      {#if isSoftwareWallet && !selectedProfile?.backupVerified}<button
          class="wallet-context-row backup-needs-verification"
          onclick={() => {
            verifyError = '';
            verifyOpen = true;
          }}
          ><span class="setting-icon"><KeyRound size={18} /></span><span
            ><strong>Recovery words not verified</strong><small
              >Use your written backup to confirm all 24 words in exact order.</small
            ></span
          ><span class="info-badge attention">Verify now</span></button
        >{:else}<div class="setting-row wallet-context-row">
          <span class="setting-icon"
            >{#if selectedProfile?.kind === 'multisig'}<ShieldCheck
                size={18}
              />{:else if selectedProfile?.kind === 'watch_only'}<Cpu size={18} />{:else}<KeyRound
                size={18}
              />{/if}</span
          ><span><strong>{backupTitle}</strong><small>{backupDescription}</small></span><span
            class="info-badge">{isSoftwareWallet ? 'Verified' : 'Backup required'}</span
          >
        </div>{/if}
      <button
        onclick={() => {
          scanDraft = { ...scan };
          scanOpen = true;
        }}
        ><span class="setting-icon"><History size={18} /></span><span
          ><strong>Recovery scan</strong><small
            >Birthday block {formatInteger(scan.birthdayHeight, $locale)} · gap limit {formatInteger(
              scan.gapLimit,
              $locale
            )}</small
          ></span
        ><ChevronRight size={16} /></button
      >
      {#if selectedProfile?.kind === 'multisig'}<button onclick={() => goto('/multisig/backup')}
          ><span class="setting-icon"><ShieldCheck size={18} /></span><span
            ><strong>Export & test wallet backup</strong><small
              >Save the descriptors, then confirm the backup restores this wallet.</small
            ></span
          ><ChevronRight size={16} /></button
        >{:else if selectedProfile?.kind === 'watch_only'}<button
          onclick={() => {
            hardwareBackupOpen = true;
            hardwareBackup = '';
            hardwareBackupContent = '';
            hardwareBackupError = '';
          }}
          ><span class="setting-icon"><FileKey size={18} /></span><span
            ><strong>Export public descriptor</strong><small
              >Save a watch-only backup for independent recovery.</small
            ></span
          ><ChevronRight size={16} /></button
        >{/if}
    </div>
  </section>
  <section class="settings-group wallet-manager mobile-wallet-manager">
    <h2>
      <span>Wallets</span><strong
        >{profiles.length} {profiles.length === 1 ? 'wallet' : 'wallets'}</strong
      >
    </h2>
    <div class="settings-list">
      {#each profiles as profile}
        <button
          aria-label={`${profile.name}${profile.id === selectedWalletId ? ', active wallet' : ''}`}
          onclick={() => selectWallet(profile)}
        >
          <span class="setting-icon"
            >{#if profile.kind === 'multisig'}<ShieldCheck
                size={18}
              />{:else if profile.kind === 'watch_only'}<Cpu size={18} />{:else}<WalletCards
                size={18}
              />{/if}</span
          >
          <span
            ><strong>{profile.name}</strong><small
              >{profile.kind === 'multisig'
                ? 'Multisig wallet'
                : profile.kind === 'watch_only'
                  ? 'Hardware wallet'
                  : 'Software wallet'}</small
            ></span
          >
          {#if profile.id === selectedWalletId}<Check size={16} />{:else}<ChevronRight
              size={16}
            />{/if}
        </button>
      {/each}
      <button onclick={() => goto('/welcome?add=1')}
        ><span class="setting-icon"><Plus size={18} /></span><span
          ><strong>Add wallet</strong><small>Create or recover another isolated wallet.</small
          ></span
        ><ChevronRight size={16} /></button
      >
    </div>
  </section>
  <section class="settings-group">
    <h2>{t('appAppearance', $locale)}</h2>
    <div class="settings-list">
      <div class="setting-row">
        <span class="setting-icon"
          >{#if theme === 'dark'}<Moon size={18} />{:else}<Sun size={18} />{/if}</span
        ><span
          ><strong>{t('theme', $locale)}</strong><small>{t('themeDescription', $locale)}</small
          ></span
        ><span class="theme-choice"
          ><button class:active={theme === 'light'} onclick={() => setTheme('light')}
            >{t('light', $locale)}</button
          ><button class:active={theme === 'dark'} onclick={() => setTheme('dark')}
            >{t('dark', $locale)}</button
          ></span
        >
      </div>
      <div class="setting-row language-setting-row"><LanguageToggle labelled /></div>
      <div class="setting-row">
        <span class="setting-icon"><WalletCards size={18} /></span><span
          ><strong>Amount display</strong><small>Use one denomination throughout Groot.</small
          ></span
        ><span class="theme-choice" aria-label="Amount display">
          <button
            class:active={$denomination === 'sats'}
            aria-pressed={$denomination === 'sats'}
            onclick={() => setDenomination('sats')}>sats</button
          ><button
            class:active={$denomination === 'btc'}
            aria-pressed={$denomination === 'btc'}
            onclick={() => setDenomination('btc')}>BTC</button
          >
        </span>
      </div>
    </div>
  </section>
  <section class="settings-group">
    <h2>Network services</h2>
    <div class="settings-list">
      <button onclick={openSyncSource}
        ><span class="setting-icon"><RefreshCw size={18} /></span><span
          ><strong>Wallet activity sync</strong><small
            >{syncSource.type === 'compact_filters'
              ? 'P2P compact filters · confirmed activity only'
              : 'Bitcoin Core RPC · confirmed and mempool activity'}</small
          ></span
        ><ChevronRight size={16} /></button
      >
      <button onclick={() => (nodeOpen = true)}
        ><span class="setting-icon"><Network size={18} /></span><span
          ><strong>Fee and broadcast node</strong><small
            >{networkName(defaultConfig.network)}{' · '}{node.backend.type === 'local_core'
              ? 'This Mac'
              : 'Trusted remote server'}{' · '}<span class="selectable-text"
              >{node.backend.url}</span
            ></small
          ></span
        ><ChevronRight size={16} /></button
      >
      {#if reusableNetworkSetups.length > 0}<button onclick={openNetworkReuse}
          ><span class="setting-icon"><RefreshCw size={18} /></span><span
            ><strong>Use an existing network setup</strong><small
              >Copy the node and sync method from another unlocked wallet.</small
            ></span
          ><ChevronRight size={16} /></button
        >{/if}
      <button disabled={checking} onclick={checkConnection}
        ><span class="setting-icon"><Check size={18} /></span><span
          ><strong>Test connection</strong><small
            >{nodeStatus
              ? `${nodeStatus.pruned ? `Pruned from block ${nodeStatus.pruneHeight === null ? 'unknown' : formatInteger(nodeStatus.pruneHeight, $locale)}` : 'Full block history'} · ${storageSize(nodeStatus.sizeOnDisk)} chain data · filter index ${nodeStatus.blockFilterIndex}${nodeStatus.initialBlockDownload ? ' · initial download active' : ''}`
              : 'Verify RPC authentication, retained block history, IBD, disk use, and filter-index status.'}</small
          ></span
        ><span class="badge" class:offline={connected === false}
          >{checking
            ? 'Checking…'
            : connected === true
              ? 'Connected'
              : connected === false
                ? 'Offline'
                : 'Check'}</span
        ></button
      >
    </div>
  </section>
  {#if selectedProfile?.kind !== 'multisig'}<section class="settings-group danger-zone">
      <h2>Wallet deletion</h2>
      <div>
        <span
          ><strong>Delete wallet</strong><small
            >Remove only {selectedProfile?.name ?? 'this wallet'} from this device.</small
          ></span
        ><Button variant="danger-outline" size="small" onclick={() => (deleting = true)}
          ><Trash2 size={15} />Delete</Button
        >
      </div>
    </section>{:else}<section class="settings-group danger-zone">
      <h2>Wallet deletion</h2>
      <div>
        <span
          ><strong>Delete multisig wallet</strong><small
            >Test its backup, then remove this watch-only wallet from this device.</small
          ></span
        ><Button variant="danger-outline" size="small" href="/multisig/delete"
          ><Trash2 size={15} />Delete</Button
        >
      </div>
    </section>{/if}
  <p class="version">Groot {APP_VERSION} · BDK {networkName(defaultConfig.network)}</p>
</div>

<Modal
  open={renameOpen}
  title="Rename wallet"
  description="Change how this wallet is identified inside Groot."
  onclose={() => {
    renameOpen = false;
    renameDraft = '';
    renameError = '';
  }}
>
  <label class="field"
    ><span>Wallet name</span><input
      aria-label="New wallet name"
      maxlength="48"
      bind:value={renameDraft}
      autocomplete="off"
    /><FieldCounter
      value={renameDraft}
      max={48}
      hint="This does not change descriptors, signer identity, recovery data, or saved public backups"
    /></label
  >
  {#if renameError}<p class="form-error" role="alert">{renameError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        renameOpen = false;
        renameDraft = '';
        renameError = '';
      }}>Cancel</Button
    ><Button
      disabled={!renameDraft.trim() || renameDraft.trim() === selectedProfile?.name}
      loading={renaming}
      loadingLabel="Saving…"
      onclick={renameWallet}>Save name</Button
    >
  </div>
</Modal>
<DeviceDetailsModal
  signer={signerDetailsOpen ? hardwareSignerDetails : null}
  health={signerHealth}
  checking={checkingSignerHealth}
  onclose={() => (signerDetailsOpen = false)}
  oncheck={runExternalSignerHealthCheck}
  onrename={async (label) => {
    signerRenameDraft = label;
    await renameHardwareSigner();
  }}
/>
<Modal
  open={signerRenameOpen}
  title="Rename hardware signer"
  description="Change the local name shown when this signing key is required."
  onclose={() => {
    signerRenameOpen = false;
    signerRenameDraft = '';
    signerRenameError = '';
  }}
>
  <label class="field"
    ><span>Hardware signer name</span><input
      aria-label="New hardware signer name"
      maxlength="48"
      bind:value={signerRenameDraft}
      autocomplete="off"
    /><FieldCounter
      value={signerRenameDraft}
      max={48}
      hint="This does not change the device, fingerprint, public keys, descriptors, or saved public backups"
    /></label
  >
  {#if signerRenameError}<p class="form-error" role="alert">{signerRenameError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        signerRenameOpen = false;
        signerRenameDraft = '';
        signerRenameError = '';
      }}>Cancel</Button
    ><Button
      disabled={!signerRenameDraft.trim() ||
        signerRenameDraft.trim() === hardwareSignerWallet?.signer.label}
      loading={signerRenaming}
      loadingLabel="Saving…"
      onclick={renameHardwareSigner}>Save signer name</Button
    >
  </div>
</Modal>
<Modal
  open={deleting}
  title="Delete this wallet?"
  description="This permanently removes wallet data from this device."
  onclose={() => (deleting = false)}
>
  <div class="warning-box danger">
    <strong>Make sure your recovery phrase is backed up.</strong> Without it, your bitcoin cannot be recovered.
  </div>
  <PasswordField
    label={credentialLabel}
    bind:value={deleteCredential}
    autocomplete="current-password"
  />
  <label class="field"
    ><span>Type DELETE to confirm</span><input
      bind:value={confirmText}
      placeholder="DELETE"
    /></label
  >
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        deleting = false;
        deleteCredential = '';
      }}>Cancel</Button
    ><Button
      variant="danger"
      disabled={confirmText !== 'DELETE' || !deleteCredential}
      loading={busy}
      loadingLabel="Deleting…"
      onclick={deleteWallet}>Delete wallet</Button
    >
  </div>
</Modal>
<Modal
  open={verifyOpen}
  title="Verify recovery backup"
  description="Use your written 24 words for a private native proof, or reveal them securely first if you still need to make the backup."
  onclose={() => {
    verifyOpen = false;
    verifyCredential = '';
    verifyError = '';
  }}
>
  <div class="warning-box verify-backup-warning">
    <strong>Recovery words stay inside the trusted native window.</strong> Revealing or verifying them
    never sends the words into the webview.
  </div>
  <PasswordField
    label="Wallet passphrase"
    bind:value={verifyCredential}
    autocomplete="current-password"
    hint="Required to decrypt the recovery words only inside trusted Rust code."
  />
  {#if verifyError}<p class="form-error" role="alert">
      {verifyError.replace('passphrase / PIN', 'wallet passphrase')}
    </p>{/if}
  <div class="modal-footer verify-backup-actions">
    <Button
      class="show-words-action"
      variant="secondary"
      disabled={!verifyCredential || verifying || revealingBackup}
      loading={revealingBackup}
      loadingLabel="Opening recovery words…"
      onclick={revealAndVerifyBackup}>View recovery words first</Button
    >
    <Button
      variant="secondary"
      disabled={verifying || revealingBackup}
      onclick={() => {
        verifyOpen = false;
        verifyCredential = '';
        verifyError = '';
      }}>Cancel</Button
    ><Button
      disabled={!verifyCredential || revealingBackup}
      loading={verifying}
      loadingLabel="Opening verification…"
      onclick={verifyBackup}>Continue</Button
    >
  </div>
</Modal>
<Modal
  open={hardwareBackupOpen}
  title="Export public descriptor"
  description="Recover this watch-only wallet without exposing the Ledger seed."
  onclose={() => {
    hardwareBackupOpen = false;
    hardwareBackupPin = '';
    hardwareBackupError = '';
    hardwareBackup = '';
    hardwareBackupContent = '';
  }}
>
  {#if !hardwareBackup}
    <div class="modal-form">
      <div class="warning-box">
        <strong>Public, not harmless.</strong> This descriptor cannot spend bitcoin, but it reveals every
        wallet address and transaction. Store it privately.
      </div>
      <PasswordField
        label="App PIN"
        bind:value={hardwareBackupPin}
        autocomplete="current-password"
        hint="Re-authenticate before exposing wallet metadata."
      />
    </div>
    {#if hardwareBackupError}<p class="form-error" role="alert">{hardwareBackupError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        onclick={() => {
          hardwareBackupOpen = false;
          hardwareBackupPin = '';
        }}>Cancel</Button
      ><Button
        disabled={!hardwareBackupPin}
        loading={exportingHardwareBackup}
        loadingLabel="Preparing…"
        onclick={prepareHardwareBackup}>Prepare backup</Button
      >
    </div>
  {:else}
    <div class="ready-panel">
      <Check size={18} />
      <div>
        <strong>Public descriptor ready</strong><small
          >Import this file in a clean disposable Groot profile and confirm the first receive
          address matches.</small
        >
      </div>
    </div>
    {#if hardwareBackupError}<p class="form-error" role="alert">{hardwareBackupError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        onclick={() => {
          hardwareBackupOpen = false;
          descriptorDetailsOpen = true;
        }}><Eye size={15} />View descriptor</Button
      ><Button onclick={saveHardwareBackup}><Download size={15} />Save descriptor</Button>
    </div>
  {/if}
</Modal>
<IdentifierDetailsModal
  open={descriptorDetailsOpen}
  value={hardwareBackup}
  title="Public wallet descriptor"
  description="This watch-only descriptor cannot spend bitcoin, but it reveals the wallet’s complete activity."
  label="Descriptor"
  onclose={() => {
    descriptorDetailsOpen = false;
    hardwareBackupOpen = true;
  }}
/>
<Modal
  open={syncOpen}
  title="Wallet activity sync"
  description="Choose how this wallet discovers transactions. Fee estimation and broadcast continue to use the separately configured Bitcoin Core service."
  onclose={() => {
    if (syncSaving) return;
    syncOpen = false;
    syncCredential = '';
    syncError = '';
  }}
>
  <div class="theme-choice node-location">
    <button
      class:active={syncSourceType === 'bitcoin_core'}
      onclick={() => (syncSourceType = 'bitcoin_core')}>Bitcoin Core</button
    ><button
      class:active={syncSourceType === 'compact_filters'}
      onclick={() => (syncSourceType = 'compact_filters')}>Compact filters</button
    >
  </div>
  {#if syncSourceType === 'compact_filters'}
    <div class="warning-box">
      <strong>Confirmed activity only.</strong> BIP157/158 peers provide public filters and matching blocks.
      Groot validates them locally; pending incoming payments are not discoverable through this source.
      This build keeps the public chain index in memory, so filters are downloaded again after an app
      restart; wallet history and checkpoints remain durable.
    </div>
    <label class="field"
      ><span>Peer selection</span><select
        bind:value={syncDiscoverPeers}
        onchange={(event) => {
          syncDiscoverPeers = event.currentTarget.value === 'true';
          if (syncDiscoverPeers) syncTorProxy = '';
        }}
        ><option value={true}>Public peer discovery</option><option value={false}
          >Manual peers only</option
        ></select
      ><small>Manual mode never falls back to DNS seeds or public peers.</small></label
    >
    <label class="field"
      ><span>Required peers</span><input
        type="number"
        min={defaultConfig.network === 'regtest' ? 1 : 2}
        max="15"
        step="1"
        bind:value={syncRequiredPeers}
      /><small
        >Public test networks require at least two independent peers. Regtest permits one local
        peer.</small
      ></label
    >
    <label class="field"
      ><span>Manual peers · one numeric IP:port per line</span><textarea
        rows="3"
        bind:value={syncPeers}
        placeholder={defaultConfig.network === 'regtest'
          ? '127.0.0.1:18444'
          : '203.0.113.10:38333\n[2001:db8::10]:38333'}></textarea><small
        >Hostnames are rejected so proxy mode cannot leak DNS.</small
      ></label
    >
    {#if !syncDiscoverPeers}<label class="field"
        ><span>Optional local Tor SOCKS5 proxy</span><input
          bind:value={syncTorProxy}
          placeholder="127.0.0.1:9050"
        /><small
          >When set, every P2P connection uses this loopback proxy. There is no direct fallback.</small
        ></label
      >{/if}
  {:else}
    <div class="warning-box">
      <strong>Bitcoin Core activity sync.</strong> Groot uses the RPC node below for confirmed blocks
      and mempool changes. It does not require Core’s block-filter index. A pruned node can sync while
      it still retains every block newer than this wallet’s checkpoint; an older rescan needs an archival
      node or a reindex/re-download with enough history.
    </div>
  {/if}
  <PasswordField
    label={credentialLabel}
    bind:value={syncCredential}
    autocomplete="current-password"
    hint="Required to change this wallet’s network privacy boundary."
  />
  {#if syncError}<p class="form-error" role="alert">{syncError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        syncOpen = false;
        syncCredential = '';
      }}>Cancel</Button
    ><Button
      disabled={!syncCredential ||
        (syncSourceType === 'compact_filters' &&
          (!Number.isInteger(Number(syncRequiredPeers)) ||
            (!syncDiscoverPeers && !syncPeers.trim())))}
      loading={syncSaving}
      loadingLabel="Saving…"
      onclick={saveSyncSource}>Save source</Button
    >
  </div>
</Modal>
<Modal
  open={scanOpen}
  title="Full wallet rescan"
  description="Search from the earliest possible payment while deriving a bounded address gap."
  onclose={() => {
    if (scanning) return;
    scanOpen = false;
    scanCredential = '';
    scanError = '';
    scanDraft = { ...scan };
  }}
>
  <div class="scan-form">
    <div class="warning-box">
      <strong>Earlier is safer; later is faster.</strong> A birthday after the wallet’s first payment
      can miss funds. A larger gap increases work and memory use.
    </div>
    <label class="field"
      ><span>Wallet birthday block</span><input
        aria-label="Wallet birthday block"
        type="number"
        min="0"
        step="1"
        bind:value={scanDraft.birthdayHeight}
        disabled={scanning}
      /><small>Use 0 when uncertain. Regtest scans are intentionally cheap.</small></label
    >
    <label class="field"
      ><span>Address gap limit</span><input
        aria-label="Address gap limit"
        type="number"
        min="20"
        max="1000"
        step="1"
        bind:value={scanDraft.gapLimit}
        disabled={scanning}
      /><small>20 is standard. Increase only if the wallet revealed long unused runs.</small></label
    >
    <PasswordField
      label={credentialLabel}
      bind:value={scanCredential}
      autocomplete="current-password"
      disabled={scanning}
    />
    {#if scanning || ['cancelling', 'cancelled', 'interrupted', 'failed'].includes(scanStatus.status)}
      <div class="scan-progress" role="status" aria-live="polite">
        <div>
          <strong
            >{scanStatus.status === 'cancelling'
              ? 'Cancelling safely…'
              : scanStatus.status === 'interrupted'
                ? 'Previous scan interrupted'
                : scanStatus.status === 'cancelled'
                  ? 'Scan cancelled'
                  : scanStatus.status === 'failed'
                    ? 'Previous scan failed'
                    : `Scanning blocks · ${scanPercent}%`}</strong
          ><small
            >{formatInteger(scanStatus.processedBlocks, $locale)} of {formatInteger(
              scanStatus.totalBlocks,
              $locale
            )}
            blocks processed{scanStatus.currentHeight
              ? ` · height ${formatInteger(scanStatus.currentHeight, $locale)}`
              : ''}</small
          >
        </div>
        <progress max="100" value={scanPercent} aria-label="Recovery scan progress"></progress>
      </div>
    {/if}
  </div>
  {#if scanError}<p class="form-error" aria-live="polite">{scanError}</p>{/if}
  <div class="modal-footer">
    {#if scanning}<Button
        variant="secondary"
        disabled={cancellingScan || scanStatus.status === 'cancelling'}
        loading={cancellingScan}
        loadingLabel="Requesting…"
        onclick={cancelFullRescan}>Cancel scan</Button
      >{:else}<Button
        variant="secondary"
        onclick={() => {
          scanOpen = false;
          scanDraft = { ...scan };
        }}>Close</Button
      >{/if}<Button
      disabled={scanning ||
        !scanCredential ||
        scanDraft.gapLimit < 20 ||
        scanDraft.gapLimit > 1000 ||
        scanDraft.birthdayHeight < 0}
      loading={scanning}
      loadingLabel="Scanning blocks…"
      onclick={runFullRescan}><RefreshCw size={15} />Save & rescan</Button
    >
  </div>
</Modal>
<Modal
  open={networkReuseOpen}
  title="Use existing network setup"
  description="Copy a verified node connection and sync method. Wallet data stays separate."
  onclose={() => {
    if (networkReusing) return;
    networkReuseCredential = '';
    networkReuseError = '';
    networkReuseOpen = false;
  }}
>
  <label class="field"
    ><span>Copy from</span><select bind:value={networkReuseSourceId}
      >{#each reusableNetworkSetups as source}<option value={source.walletId}
          >{source.walletName}</option
        >{/each}</select
    ><small>The RPC password stays inside trusted native code.</small></label
  >
  <PasswordField
    label={credentialLabel}
    bind:value={networkReuseCredential}
    autocomplete="current-password"
    hint="Protects the copied connection for this wallet."
  />
  {#if networkReuseError}<p class="form-error" role="alert">{networkReuseError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={networkReusing}
      onclick={() => {
        networkReuseCredential = '';
        networkReuseOpen = false;
      }}>Cancel</Button
    ><Button
      disabled={!networkReuseSourceId || !networkReuseCredential}
      loading={networkReusing}
      loadingLabel="Verifying…"
      onclick={reuseNetworkSetup}>Use setup</Button
    >
  </div>
</Modal>
<Modal
  open={nodeOpen}
  title="Connect Bitcoin Core"
  description="Each wallet keeps isolated, encrypted RPC credentials. Use direct TLS or a local Tor SOCKS proxy remotely."
  onclose={() => (nodeOpen = false)}
>
  <div class="theme-choice node-location">
    <button
      class:active={node.backend.type === 'local_core'}
      onclick={() => setNodeLocation('local_core')}>This Mac</button
    ><button
      class:active={node.backend.type === 'remote_core' && !node.torProxy}
      onclick={() => setNodeLocation('remote_core')}>Remote TLS</button
    ><button class:active={!!node.torProxy} onclick={() => setNodeLocation('tor')}>Tor onion</button
    >
  </div>
  <label class="field"
    ><span>RPC URL</span><input
      bind:value={node.backend.url}
      placeholder={node.backend.type === 'local_core'
        ? localRpcUrl
        : node.torProxy
          ? 'http://your-node.onion:8332'
          : 'https://node.example.com:8332'}
    /><small
      >Credentials in URLs are rejected. TLS uses system trust roots; Tor accepts only .onion
      destinations.</small
    ></label
  >
  {#if node.torProxy}<label class="field"
      ><span>Local SOCKS5 proxy</span><input
        bind:value={node.torProxy}
        placeholder="127.0.0.1:9050"
      /><small>The proxy must listen on loopback. Remote proxies are rejected.</small></label
    >{/if}
  {#if node.backend.type === 'local_core'}
    {#if defaultConfig.network === 'regtest'}<div class="credential-warning">
        <ShieldCheck size={16} />
        <p>
          <strong>Automatic cookie authentication</strong><span
            >Uses Groot’s isolated local Regtest cookie. Switch to username/password only for a
            custom local node.</span
          >
        </p>
      </div>{/if}
    <label class="field"
      ><span>Authentication</span><select bind:value={node.auth}
        >{#if defaultConfig.network === 'regtest'}<option value="cookie">Local cookie</option
          >{/if}<option value="user_pass">Username and password</option></select
      ></label
    >
  {/if}
  {#if node.auth === 'user_pass'}<label class="field"
      ><span>RPC username</span><input
        value={node.username ?? ''}
        oninput={(event) => (node = { ...node, username: event.currentTarget.value })}
        autocomplete="off"
      /></label
    ><PasswordField
      label="RPC password"
      bind:value={nodePassword}
      autocomplete="new-password"
      hint="Encrypted locally; never placed in the URL or public config."
    />{/if}
  <PasswordField
    label={credentialLabel}
    bind:value={walletCredential}
    autocomplete="current-password"
    hint="Required once to protect this wallet’s RPC credentials."
  />
  {#if nodeError}<p class="form-error">{nodeError}</p>{/if}
  <div class="modal-footer">
    <Button variant="secondary" onclick={() => (nodeOpen = false)}>Cancel</Button><Button
      disabled={!node.backend.url ||
        !walletCredential ||
        (node.auth === 'user_pass' && (!node.username || !nodePassword))}
      loading={busy}
      loadingLabel="Testing connection…"
      onclick={saveNode}>Save & test</Button
    >
  </div>
</Modal>
