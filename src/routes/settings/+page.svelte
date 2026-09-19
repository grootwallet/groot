<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Clock3,
    Cpu,
    Download,
    Eye,
    FileKey,
    HeartPulse,
    History,
    KeyRound,
    Keyboard,
    LockKeyhole,
    Moon,
    Network,
    Pencil,
    Plus,
    RefreshCw,
    ScrollText,
    ShieldCheck,
    Sun,
    TriangleAlert,
    Trash2,
    Upload,
    WalletCards
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import BuildIdentity from '$lib/components/BuildIdentity.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import IdentifierDetailsModal from '$lib/components/IdentifierDetailsModal.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import { toast } from '$lib/stores/toasts';
  import { formatInteger, locale, t } from '$lib/i18n';
  import {
    defaultConfig,
    networkName,
    SWITCHABLE_NETWORKS,
    type SwitchableNetwork
  } from '$lib/config';
  import { isPrototypeWallet, walletService, WalletError } from '$lib/wallet';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
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
    RuntimePlatform,
    WalletErrorDetails,
    WalletProfile,
    WalletSyncSource
  } from '$lib/wallet/contracts';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import { matchingDeviceForHealthCheck } from '$lib/hardware/health-check';
  import { amountUnit, denomination, formatAmount, setDenomination } from '$lib/denomination';
  import {
    isDesktopPlatform,
    keyboardShortcuts,
    shortcutKeys,
    usesCommandModifier
  } from '$lib/keyboard-shortcuts';
  import { applyTheme, currentTheme, type Theme } from '$lib/theme';
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
  let theme = $state<Theme>('dark');
  let commandModifier = $state(false);
  let desktopPlatform = $state(false);
  let displayedKeyboardShortcuts = $derived(
    keyboardShortcuts.filter(
      (shortcut) => shortcut.id !== 'lock' || (!isPrototypeWallet && desktopPlatform)
    )
  );
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let walletUnlocked = $state(false);
  let profileReadGeneration = 0;
  let inactivityTimeoutMinutes = $state(5);
  let savingInactivityTimeout = $state(false);
  let timeoutMenuOpen = $state(false);
  let timeoutMenuRoot = $state<HTMLDivElement | null>(null);
  let timeoutMenuTrigger = $state<HTMLButtonElement | null>(null);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let isSoftwareWallet = $derived(selectedProfile?.kind === 'single_key');
  let credentialLabel = $derived(
    translate($locale, isSoftwareWallet ? 'Wallet passphrase' : 'App PIN')
  );
  let backupTitle = $derived(
    translate(
      $locale,
      selectedProfile?.kind === 'multisig'
        ? 'Policy and signer backups'
        : selectedProfile?.kind === 'watch_only'
          ? 'Hardware signer backup'
          : 'Recovery words + wallet passphrase'
    )
  );
  let backupDescription = $derived(
    translate(
      $locale,
      selectedProfile?.kind === 'multisig'
        ? 'Keep the public descriptor and enough signer backups to restore access.'
        : selectedProfile?.kind === 'watch_only'
          ? 'Recovery words remain on the signer. The app PIN only protects local Groot data.'
          : 'Keep both together. Recovery words can be re-presented only in the authenticated native backup flow; the wallet passphrase cannot be displayed or reset.'
    )
  );
  const timeoutOptions = [
    { value: 1, label: '1 minute' },
    { value: 5, label: '5 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' }
  ];
  let inactivityTimeoutLabel = $derived(
    translate(
      $locale,
      timeoutOptions.find((option) => option.value === inactivityTimeoutMinutes)?.label ??
        '5 minutes'
    )
  );
  let nodeOpen = $state(false),
    nodePassword = $state(''),
    walletCredential = $state(''),
    nodeError = $state('');
  let runtime = $state<RuntimePlatform | null>(null);
  let networkSwitchOpen = $state(false),
    networkSwitchTarget = $state<SwitchableNetwork | null>(null),
    networkSwitchError = $state(''),
    networkSwitching = $state(false);
  const localRpcUrl =
    defaultConfig.network === 'regtest'
      ? 'http://127.0.0.1:18443'
      : defaultConfig.network === 'signet'
        ? 'http://127.0.0.1:38332'
        : defaultConfig.network === 'testnet4'
          ? 'http://127.0.0.1:48332'
          : 'http://127.0.0.1:8332';
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
  let selectedNetworkReuseSource = $derived(
    reusableNetworkSetups.find((source) => source.walletId === networkReuseSourceId) ?? null
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
    scanErrorCode = $state(''),
    scanErrorDetails = $state<WalletErrorDetails | null>(null),
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
  let scanOptionsOpen = $state(false),
    scanTip = $state<number | null>(null),
    scanTipLoading = $state(false);
  let scanBirthdayAboveTip = $derived(
    scanTip !== null && Number(scanDraft.birthdayHeight) > scanTip
  );
  let destroyed = false;
  let scanPercent = $derived(
    scanStatus.totalBlocks > 0
      ? Math.min(
          scanning && scanStatus.status === 'running' ? 99 : 100,
          Math.round((scanStatus.processedBlocks / scanStatus.totalBlocks) * 100)
        )
      : 0
  );
  let scanCheckingPending = $derived(
    scanning &&
      scanStatus.status === 'running' &&
      scanStatus.totalBlocks > 0 &&
      scanStatus.processedBlocks >= scanStatus.totalBlocks
  );
  function idleScanStatus(): RecoveryScanStatus {
    return {
      status: 'idle',
      ...scan,
      currentHeight: 0,
      targetHeight: 0,
      processedBlocks: 0,
      totalBlocks: 0,
      startedAt: 0,
      updatedAt: 0
    };
  }
  function runningScanStatus(settings: RecoveryScanSettings): RecoveryScanStatus {
    const targetHeight = Math.max(scanTip ?? settings.birthdayHeight, settings.birthdayHeight);
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      status: 'running',
      ...settings,
      currentHeight: Math.max(settings.birthdayHeight - 1, 0),
      targetHeight,
      processedBlocks: 0,
      totalBlocks: targetHeight - settings.birthdayHeight + 1,
      startedAt: timestamp,
      updatedAt: timestamp
    };
  }
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
  let labelInterchangeOpen = $state(false),
    labelInterchangeBusy = $state(false),
    labelInterchangeResult = $state(''),
    labelInterchangeError = $state('');
  onMount(async () => {
    commandModifier = usesCommandModifier(navigator.platform);
    desktopPlatform = isDesktopPlatform(
      navigator.platform,
      navigator.userAgent,
      navigator.maxTouchPoints
    );
    const generation = ++profileReadGeneration;
    theme = currentTheme();
    const [nextRuntime, registry, session] = await Promise.all([
      walletService.runtimePlatform(),
      walletService.profiles(),
      walletService.session()
    ]);
    if (generation !== profileReadGeneration) return;
    runtime = nextRuntime;
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
    walletUnlocked = session.unlocked;
    inactivityTimeoutMinutes = registry.inactivityTimeoutMinutes;
    const activeProfile = registry.wallets.find(
      (wallet) => wallet.id === registry.selectedWalletId
    );
    if (walletUnlocked && activeProfile?.kind === 'watch_only') {
      const [nextHardwareSignerWallet, nextHealthChecks] = await Promise.all([
        walletService.externalSignerWallet(),
        walletService.hardwareHealthChecks()
      ]);
      hardwareSignerWallet = nextHardwareSignerWallet;
      setHardwareHealthChecks(nextHealthChecks);
    } else {
      setHardwareHealthChecks([]);
    }
    if (walletUnlocked) {
      [node, syncSource, networkSetupSources] = await Promise.all([
        walletService.nodeConfig(),
        walletService.syncSource(),
        walletService.networkSetupSources()
      ]);
      scan = await walletService.recoveryScanSettings();
      scanDraft = { ...scan };
      scanStatus = await walletService.recoveryScanStatus();
      if (page.url.searchParams.get('networkSetup') === '1') {
        if (reusableNetworkSetups.length > 0) openNetworkReuse();
        else openNodeSettings();
        replaceState('/settings', {});
      }
    }
  });

  function openNetworkSwitch(target: SwitchableNetwork) {
    if (!runtime?.networkSwitching || target === defaultConfig.network) return;
    networkSwitchTarget = target;
    networkSwitchError = '';
    networkSwitchOpen = true;
  }

  async function confirmNetworkSwitch() {
    if (!networkSwitchTarget || networkSwitching) return;
    networkSwitching = true;
    networkSwitchError = '';
    let syncPaused = false;
    try {
      await walletShell.pauseAutomaticSync();
      syncPaused = true;
      await walletService.switchNetwork(networkSwitchTarget);
    } catch (cause) {
      networkSwitchError = localizedError(
        cause,
        $locale,
        'Groot could not save the Bitcoin network selection.'
      );
      toast({
        title: 'Network not changed',
        description: networkSwitchError,
        tone: 'danger'
      });
      if (syncPaused) walletShell.resumeAutomaticSync();
      networkSwitching = false;
    }
  }

  async function exportLabels() {
    labelInterchangeBusy = true;
    labelInterchangeError = '';
    try {
      const result = await walletService.exportLabels();
      if (!result.saved) return;
      labelInterchangeResult = translate($locale, 'Saved {count} BIP329 label records.', {
        count: result.recordCount
      });
      toast({
        title: 'Labels exported',
        description: labelInterchangeResult,
        tone: 'success',
        action:
          result.revealToken && result.revealLabel
            ? {
                label: result.revealLabel,
                run: async () => {
                  try {
                    await walletService.revealSavedFile(result.revealToken!);
                  } catch (cause) {
                    toast({
                      title: 'Could not show saved labels',
                      description: localizedError(cause, $locale),
                      tone: 'danger'
                    });
                  }
                }
              }
            : undefined
      });
    } catch (cause) {
      labelInterchangeError = localizedError(cause, $locale, 'Could not export wallet labels.');
      toast({
        title: 'Could not export labels',
        description: labelInterchangeError,
        tone: 'danger'
      });
    } finally {
      labelInterchangeBusy = false;
    }
  }

  async function importLabels() {
    labelInterchangeBusy = true;
    labelInterchangeError = '';
    try {
      const result = await walletService.importLabels();
      if (!result) return;
      labelInterchangeResult = translate(
        $locale,
        'Imported {imported}; {unchanged} already present; {ignored} unsupported; {spendability} coin settings changed.',
        {
          imported: result.importedCount,
          unchanged: result.unchangedCount,
          ignored: result.ignoredCount,
          spendability: result.spendabilityChangeCount
        }
      );
      toast({ title: 'Labels imported', description: labelInterchangeResult, tone: 'success' });
    } catch (cause) {
      labelInterchangeError = localizedError(cause, $locale, 'Could not import wallet labels.');
      toast({
        title: 'Could not import labels',
        description: labelInterchangeError,
        tone: 'danger'
      });
    } finally {
      labelInterchangeBusy = false;
    }
  }
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
  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (timeoutMenuOpen && timeoutMenuRoot && !timeoutMenuRoot.contains(event.target as Node)) {
        timeoutMenuOpen = false;
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (timeoutMenuOpen && event.key === 'Escape') {
        timeoutMenuOpen = false;
        timeoutMenuTrigger?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  });
  function setTheme(next: Theme) {
    theme = next;
    applyTheme(next);
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
        description: result.pruned
          ? translate(
              $locale,
              result.pruneHeight === null
                ? '{blocks} blocks · pruned from an unknown height'
                : '{blocks} blocks · pruned from {height}',
              {
                blocks: formatInteger(result.blocks, $locale),
                height:
                  result.pruneHeight === null ? '' : formatInteger(result.pruneHeight, $locale)
              }
            )
          : translate($locale, '{blocks} blocks · full block history', {
              blocks: formatInteger(result.blocks, $locale)
            }),
        tone: 'success'
      });
    } catch (cause) {
      connected = false;
      toast({
        title: 'Node unavailable',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      checking = false;
    }
  }
  function setNodeLocation(type: 'local_core' | 'remote_core' | 'tor') {
    if (defaultConfig.network === 'mainnet' && type === 'tor') return;
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
  function clearNodeCredentials() {
    nodePassword = '';
    walletCredential = '';
    nodeError = '';
  }
  function openNodeSettings() {
    clearNodeCredentials();
    nodeOpen = true;
  }
  function closeNodeSettings() {
    clearNodeCredentials();
    nodeOpen = false;
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
        description: translate(
          $locale,
          result.pruned
            ? 'Connected at block {block} · pruned.'
            : 'Connected at block {block} · full history.',
          { block: formatInteger(result.blocks, $locale) }
        ),
        tone: 'success'
      });
    } catch (cause) {
      connected = false;
      nodeError = localizedError(cause, $locale, 'Could not save this node.');
    } finally {
      nodePassword = '';
      walletCredential = '';
      busy = false;
    }
  }
  function openNetworkReuse() {
    networkReuseSourceId =
      reusableNetworkSetups.find((source) => source.ready)?.walletId ??
      reusableNetworkSetups[0]?.walletId ??
      '';
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
        description: source
          ? translate($locale, 'Copied from {walletName}.', { walletName: source.walletName })
          : undefined,
        tone: 'success'
      });
    } catch (cause) {
      networkReuseError = localizedError(cause, $locale, 'Could not reuse this setup.');
    } finally {
      networkReuseCredential = '';
      networkReusing = false;
    }
  }
  function openSyncSource() {
    syncSourceType = defaultConfig.network === 'mainnet' ? 'bitcoin_core' : syncSource.type;
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
            ? translate(
                $locale,
                'The next refresh will discover confirmed activity through verified compact block filters.'
              )
            : translate($locale, 'The next refresh will use the configured Bitcoin Core node.'),
        tone: 'success'
      });
    } catch (cause) {
      syncError = localizedError(cause, $locale, 'Could not save the wallet sync source.');
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
        description: translate(
          $locale,
          minutes === 1
            ? 'Every wallet will lock after {minutes} minute of inactivity.'
            : 'Every wallet will lock after {minutes} minutes of inactivity.',
          { minutes: formatInteger(minutes, $locale) }
        ),
        tone: 'success'
      });
    } catch (cause) {
      inactivityTimeoutMinutes = previous;
      toast({
        title: 'Could not update automatic lock',
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      savingInactivityTimeout = false;
    }
  }
  function toggleTimeoutMenu() {
    timeoutMenuOpen = !timeoutMenuOpen;
    if (timeoutMenuOpen) {
      requestAnimationFrame(() => {
        timeoutMenuRoot
          ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
          ?.focus();
      });
    }
  }
  function chooseInactivityTimeout(minutes: number) {
    timeoutMenuOpen = false;
    timeoutMenuTrigger?.focus();
    if (minutes !== inactivityTimeoutMinutes) void saveInactivityTimeout(minutes);
  }
  function handleTimeoutMenuKeydown(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      timeoutMenuRoot?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
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
        description: translate($locale, 'This wallet is now shown as {walletName}.', {
          walletName: renamed.name
        }),
        tone: 'success'
      });
    } catch (cause) {
      renameError = localizedError(cause, $locale, 'Could not rename this wallet.');
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
      signerRenameError = localizedError(cause, $locale, 'Could not rename this hardware signer.');
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
        description: translate($locale, '{signerName} matches this wallet.', {
          signerName: signer.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      const result: CosignerHealthCheck = {
        checkedAt: new Date().toISOString(),
        summary: localizedError(cause, $locale, 'The device could not be verified.'),
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
    scanStatus = runningScanStatus({
      birthdayHeight: Number(scanDraft.birthdayHeight),
      gapLimit: Number(scanDraft.gapLimit)
    });
    scanError = '';
    scanErrorCode = '';
    scanErrorDetails = null;
    let automaticSyncPaused = false;
    try {
      await walletShell.pauseAutomaticSync();
      automaticSyncPaused = true;
      scan = await walletService.saveRecoveryScanSettings(
        Number(scanDraft.birthdayHeight),
        Number(scanDraft.gapLimit),
        scanCredential
      );
      scanDraft = { ...scan };
      scanStatus = runningScanStatus(scan);
      const rescan = walletService.fullRescan(scanCredential);
      void pollFullRescan();
      const snapshot = await rescan;
      try {
        scanStatus = await walletService.recoveryScanStatus();
      } catch {
        // A status refresh is observational. It must not relabel a completed
        // foreground rescan as failed.
      }
      scanOpen = false;
      toast({
        title: 'Full rescan complete',
        description: translate($locale, 'Recovered balance: {balance} {unit}', {
          balance: formatAmount(snapshot.balance.total, $denomination),
          unit: amountUnit($denomination)
        }),
        tone: 'success'
      });
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'scan_cancelled') {
        scanStatus = idleScanStatus();
        scanOpen = false;
        toast({
          title: 'Full rescan cancelled',
          description: 'No scan progress was kept. The next full rescan will start fresh.',
          tone: 'success'
        });
        return;
      }
      scanError = localizedError(cause, $locale, 'The full rescan failed.');
      scanErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      scanErrorDetails = cause instanceof WalletError ? cause.details : null;
      scanStatus = idleScanStatus();
    } finally {
      if (scanPoll) clearTimeout(scanPoll);
      scanPoll = undefined;
      scanCredential = '';
      scanning = false;
      cancellingScan = false;
      if (automaticSyncPaused) walletShell.resumeAutomaticSync();
    }
  }
  async function pollFullRescan() {
    try {
      const status = await walletService.recoveryScanStatus();
      if (status.status === 'running' || status.status === 'cancelling') scanStatus = status;
    } catch {
      /* The foreground result remains authoritative. */
    } finally {
      if (scanning && !destroyed) scanPoll = setTimeout(() => void pollFullRescan(), 250);
    }
  }
  async function cancelFullRescan() {
    cancellingScan = true;
    scanError = '';
    scanErrorCode = '';
    scanErrorDetails = null;
    try {
      scanStatus = await walletService.cancelFullRescan();
    } catch (cause) {
      scanError = localizedError(cause, $locale, 'The recovery scan could not be cancelled.');
      cancellingScan = false;
    }
  }
  async function refreshScanTip() {
    scanTipLoading = true;
    try {
      const cached = await walletService.publicNetworkStatus();
      scanTip = cached.networkTip;
      const current = await walletService.testNodeConnection();
      scanTip = current.blocks;
    } catch {
      // A saved tip is still useful for comparison. Starting the scan performs
      // the authoritative native validation against the live node.
    } finally {
      scanTipLoading = false;
    }
  }
  function openFullRescan() {
    scanCredential = '';
    scanError = '';
    scanErrorCode = '';
    scanErrorDetails = null;
    scanDraft = { ...scan };
    scanOptionsOpen = false;
    if (!['running', 'cancelling'].includes(scanStatus.status)) {
      scanStatus = idleScanStatus();
    }
    scanOpen = true;
    void refreshScanTip();
  }
  function closeFullRescan() {
    if (scanning) return;
    scanCredential = '';
    scanError = '';
    scanErrorCode = '';
    scanErrorDetails = null;
    scanDraft = { ...scan };
    scanOptionsOpen = false;
    scanOpen = false;
  }
  function openDeleteWallet() {
    deleteCredential = '';
    confirmText = '';
    deleting = true;
  }
  function closeDeleteWallet() {
    deleteCredential = '';
    confirmText = '';
    deleting = false;
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
        description: localizedError(cause, $locale),
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
      verifyError = localizedError(cause, $locale, 'Could not verify this recovery backup.');
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
      verifyError = localizedError(cause, $locale, 'Could not reveal this recovery backup.');
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
      hardwareBackupError = localizedError(
        cause,
        $locale,
        'Could not prepare the public descriptor.'
      );
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
                        description: localizedError(cause, $locale),
                        tone: 'danger'
                      });
                    }
                  }
                }
              : undefined
        });
    } catch (cause) {
      hardwareBackupError = localizedError(cause, $locale, 'Could not save the descriptor backup.');
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
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
  }
</script>

<div class="page narrow-page settings-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">
        {translate($locale, walletUnlocked ? 'WALLET SETTINGS' : 'APP SETTINGS')}
      </p>
      <h1>
        {walletUnlocked
          ? (selectedProfile?.name ?? translate($locale, 'Settings'))
          : translate($locale, 'Settings')}
      </h1>
      <p class="subtitle">
        {translate(
          $locale,
          walletUnlocked
            ? 'Security and connection for this wallet.'
            : 'Appearance and Bitcoin network.'
        )}
      </p>
    </div>
  </header>
  {#if walletUnlocked}<section class="settings-group wallet-details">
      <h2>{translate($locale, 'Wallet details')}</h2>
      <div class="settings-list">
        <button
          aria-label={translate($locale, 'Rename {wallet}', {
            wallet: selectedProfile?.name ?? translate($locale, 'wallet')
          })}
          onclick={openRename}
          ><span class="setting-icon"><Pencil size={18} /></span><span
            ><strong>{translate($locale, 'Wallet name')}</strong><small
              >{translate($locale, '{walletName} · Local display name only', {
                walletName: selectedProfile?.name ?? translate($locale, 'Unnamed wallet')
              })}</small
            ></span
          ><ChevronRight size={16} /></button
        >
        {#if hardwareSignerWallet}
          <button
            aria-label={translate($locale, 'Rename hardware signer {signer}', {
              signer: hardwareSignerWallet.signer.label
            })}
            onclick={openSignerRename}
            ><span class="setting-icon"><Cpu size={18} /></span><span
              ><strong>{translate($locale, 'Hardware signer name')}</strong><small
                >{translate($locale, '{signerName} · Used on signing and verification screens', {
                  signerName: hardwareSignerWallet.signer.label
                })}</small
              ></span
            ><ChevronRight size={16} /></button
          >
          <button
            aria-label={translate($locale, 'Inspect {signer} identity and health', {
              signer: hardwareSignerWallet.signer.label
            })}
            onclick={() => (signerDetailsOpen = true)}
          >
            <span class="setting-icon"><HeartPulse size={18} /></span>
            <span
              ><strong>{translate($locale, 'Hardware signer identity & health')}</strong><small
                >{#if signerHealth}{translate($locale, 'Last checked')}
                  <LocalTimestamp value={signerHealth.checkedAt} />{:else}{translate(
                    $locale,
                    'Inspect identity or run a health check'
                  )}{/if}</small
              ></span
            >
            <span class="setting-row-status"
              ><span
                class="info-badge"
                class:healthy={signerHealth?.status === 'healthy'}
                class:attention={signerHealth?.status === 'attention'}
                class:muted={!signerHealth}
                >{translate(
                  $locale,
                  signerHealth?.status === 'healthy'
                    ? 'Checked'
                    : signerHealth?.status === 'attention'
                      ? 'Attention'
                      : 'Not checked'
                )}</span
              ><ChevronRight size={16} /></span
            >
          </button>
        {/if}
      </div>
    </section>
    <section class="settings-group immediate-security">
      <h2>{translate($locale, 'Security')}</h2>
      <div class="settings-list" class:timeout-menu-open={timeoutMenuOpen}>
        <button onclick={lockNow}
          ><span class="setting-icon"><LockKeyhole size={18} /></span><span
            ><strong
              >{translate($locale, 'Lock {walletName} now', {
                walletName: selectedProfile?.name ?? translate($locale, 'wallet')
              })}</strong
            ><small>{translate($locale, 'Lock only this wallet immediately.')}</small></span
          ><ChevronRight size={16} /></button
        >
        <div class="setting-row automatic-lock-row">
          <span class="setting-icon"><Clock3 size={18} /></span><span
            ><strong>{translate($locale, 'Automatic lock')}</strong><small
              >{translate(
                $locale,
                'One global setting; each unlocked wallet tracks its own inactivity.'
              )}</small
            ></span
          >
          <div class="timeout-control" bind:this={timeoutMenuRoot}>
            <button
              bind:this={timeoutMenuTrigger}
              class="timeout-choice"
              type="button"
              aria-label={`${translate($locale, 'Automatic lock inactivity period')}: ${inactivityTimeoutLabel}`}
              aria-haspopup="menu"
              aria-expanded={timeoutMenuOpen}
              disabled={savingInactivityTimeout}
              onclick={toggleTimeoutMenu}
              ><span>{inactivityTimeoutLabel}</span><span class:rotated={timeoutMenuOpen}
                ><ChevronDown size={15} /></span
              ></button
            >{#if timeoutMenuOpen}<div
                class="timeout-menu"
                role="menu"
                tabindex="-1"
                aria-label={translate($locale, 'Automatic lock inactivity period')}
                onkeydown={handleTimeoutMenuKeydown}
              >
                {#each timeoutOptions as option}<button
                    type="button"
                    role="menuitemradio"
                    aria-checked={inactivityTimeoutMinutes === option.value}
                    class:active={inactivityTimeoutMinutes === option.value}
                    onclick={() => chooseInactivityTimeout(option.value)}
                    ><span>{translate($locale, option.label)}</span
                    >{#if inactivityTimeoutMinutes === option.value}<Check size={15} />{/if}</button
                  >{/each}
              </div>{/if}
          </div>
        </div>
      </div>
    </section>
    <section class="settings-group current-wallet-settings">
      <h2>{translate($locale, 'Backup and recovery')}</h2>
      <div class="settings-list">
        {#if isSoftwareWallet && !selectedProfile?.backupVerified}<button
            class="wallet-context-row backup-needs-verification"
            onclick={() => {
              verifyError = '';
              verifyOpen = true;
            }}
            ><span class="setting-icon"><KeyRound size={18} /></span><span
              ><strong>{translate($locale, 'Recovery words not verified')}</strong><small
                >{translate(
                  $locale,
                  'Use your written backup to confirm all 24 words in exact order.'
                )}</small
              ></span
            ><span class="info-badge attention">{translate($locale, 'Verify now')}</span></button
          >{:else}<div class="setting-row wallet-context-row">
            <span class="setting-icon"
              >{#if selectedProfile?.kind === 'multisig'}<ShieldCheck
                  size={18}
                />{:else if selectedProfile?.kind === 'watch_only'}<Cpu size={18} />{:else}<KeyRound
                  size={18}
                />{/if}</span
            ><span><strong>{backupTitle}</strong><small>{backupDescription}</small></span><span
              class="info-badge"
              >{translate($locale, isSoftwareWallet ? 'Verified' : 'Backup required')}</span
            >
          </div>{/if}
        <button onclick={openFullRescan}
          ><span class="setting-icon"><History size={18} /></span><span
            ><strong>{translate($locale, 'Recovery scan')}</strong><small
              >{translate($locale, 'Birthday block')}
              {formatInteger(scan.birthdayHeight, $locale)}
              {translate($locale, '· gap limit')}
              {formatInteger(scan.gapLimit, $locale)}</small
            ></span
          ><ChevronRight size={16} /></button
        >
        {#if selectedProfile?.kind === 'multisig'}<button onclick={() => goto('/multisig/backup')}
            ><span class="setting-icon"><ShieldCheck size={18} /></span><span
              ><strong>{translate($locale, 'Export & test wallet backup')}</strong><small
                >{translate(
                  $locale,
                  'Save the descriptors, then confirm the backup restores this wallet.'
                )}</small
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
              ><strong>{translate($locale, 'Export public descriptor')}</strong><small
                >{translate($locale, 'Save a watch-only backup for independent recovery.')}</small
              ></span
            ><ChevronRight size={16} /></button
          >{/if}
        <button
          onclick={() => {
            labelInterchangeOpen = true;
            labelInterchangeError = '';
          }}
          ><span class="setting-icon"><Upload size={18} /></span><span
            ><strong>{translate($locale, 'Import or export wallet labels')}</strong><small
              >{translate(
                $locale,
                'Use the BIP329 JSONL format with another compatible wallet.'
              )}</small
            ></span
          ><ChevronRight size={16} /></button
        >
      </div>
    </section>
    <section class="settings-group wallet-manager mobile-wallet-manager">
      <h2>
        <span>{translate($locale, 'Wallets')}</span><strong
          >{profiles.length}
          {translate($locale, profiles.length === 1 ? 'wallet' : 'wallets')}</strong
        >
      </h2>
      <div class="settings-list">
        {#each profiles as profile}
          <button
            aria-label={translate(
              $locale,
              profile.id === selectedWalletId ? '{name}, active wallet' : '{name}',
              { name: profile.name }
            )}
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
                >{translate(
                  $locale,
                  profile.kind === 'multisig'
                    ? 'Multisig wallet'
                    : profile.kind === 'watch_only'
                      ? 'Hardware signer'
                      : 'Software wallet'
                )}</small
              ></span
            >
            {#if profile.id === selectedWalletId}<Check size={16} />{:else}<ChevronRight
                size={16}
              />{/if}
          </button>
        {/each}
        <button onclick={() => goto('/welcome?add=1')}
          ><span class="setting-icon"><Plus size={18} /></span><span
            ><strong>{translate($locale, 'Add wallet')}</strong><small
              >{translate($locale, 'Create or recover another isolated wallet.')}</small
            ></span
          ><ChevronRight size={16} /></button
        >
      </div>
    </section>{/if}
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
          ><strong>{translate($locale, 'Amount display')}</strong><small
            >{translate($locale, 'Use one denomination throughout Groot.')}</small
          ></span
        ><span class="theme-choice" aria-label={translate($locale, 'Amount display')}>
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
      <div class="setting-row keyboard-shortcut-row">
        <span class="setting-icon"><Keyboard size={18} /></span><span
          ><strong>{translate($locale, 'Keyboard shortcuts')}</strong><small
            >{translate($locale, 'Navigate and lock without leaving the keyboard.')}</small
          ></span
        >
        <dl class="keyboard-shortcut-grid">
          {#each displayedKeyboardShortcuts as shortcut}
            <div>
              <dt>{translate($locale, shortcut.label)}</dt>
              <dd>
                {#each shortcutKeys(shortcut, commandModifier) as key}<kbd>{key}</kbd>{/each}
              </dd>
            </div>
          {/each}
        </dl>
      </div>
    </div>
  </section>
  <section class="settings-group">
    <h2>{translate($locale, 'Network services')}</h2>
    <div class="settings-list">
      <div class="setting-row bitcoin-network-row">
        <span class="setting-icon"><Network size={18} /></span><span
          ><strong>{translate($locale, 'Bitcoin network')}</strong><small
            >{runtime?.networkSwitching
              ? translate(
                  $locale,
                  'Switching restarts Groot. Each network keeps separate wallets and settings.'
                )
              : translate($locale, 'Fixed to {network}.', {
                  network: networkName(defaultConfig.network)
                })}</small
          ></span
        ><span
          class="theme-choice network-choice"
          role="radiogroup"
          aria-label={translate($locale, 'Bitcoin network')}
        >
          {#each SWITCHABLE_NETWORKS as candidate}<button
              type="button"
              role="radio"
              aria-checked={defaultConfig.network === candidate}
              class:active={defaultConfig.network === candidate}
              disabled={!runtime?.networkSwitching || networkSwitching}
              onclick={() => openNetworkSwitch(candidate)}>{networkName(candidate)}</button
            >{/each}
        </span>
      </div>
      {#if walletUnlocked}<button onclick={openSyncSource}
          ><span class="setting-icon"><RefreshCw size={18} /></span><span
            ><strong>{translate($locale, 'Wallet activity sync')}</strong><small
              >{translate(
                $locale,
                syncSource.type === 'compact_filters'
                  ? 'P2P compact filters · confirmed activity only'
                  : 'Bitcoin Core RPC · confirmed and mempool activity'
              )}</small
            ></span
          ><ChevronRight size={16} /></button
        >
        <button onclick={openNodeSettings}
          ><span class="setting-icon"><Network size={18} /></span><span
            ><strong>{translate($locale, 'Fee and broadcast node')}</strong><small
              >{networkName(defaultConfig.network)}{' · '}{translate(
                $locale,
                node.backend.type === 'local_core' ? 'This Mac' : 'Trusted remote server'
              )}{' · '}<span class="selectable-text">{node.backend.url}</span></small
            ></span
          ><ChevronRight size={16} /></button
        >
        {#if reusableNetworkSetups.length > 0}<button onclick={openNetworkReuse}
            ><span class="setting-icon"><RefreshCw size={18} /></span><span
              ><strong>{translate($locale, 'Use an existing network setup')}</strong><small
                >{translate(
                  $locale,
                  'Copy the node and sync method from another unlocked wallet.'
                )}</small
              ></span
            ><ChevronRight size={16} /></button
          >{/if}
        <button disabled={checking} onclick={checkConnection}
          ><span class="setting-icon"><Check size={18} /></span><span
            ><strong>{translate($locale, 'Test connection')}</strong><small
              >{nodeStatus
                ? translate($locale, '{history} · {size} chain data · filter index {filter}{ibd}', {
                    history: nodeStatus.pruned
                      ? translate($locale, 'Pruned from block {height}', {
                          height:
                            nodeStatus.pruneHeight === null
                              ? translate($locale, 'unknown')
                              : formatInteger(nodeStatus.pruneHeight, $locale)
                        })
                      : translate($locale, 'Full block history'),
                    size: storageSize(nodeStatus.sizeOnDisk),
                    filter: translate($locale, nodeStatus.blockFilterIndex),
                    ibd: nodeStatus.initialBlockDownload
                      ? translate($locale, ' · initial download active')
                      : ''
                  })
                : translate(
                    $locale,
                    'Verify RPC authentication, retained block history, IBD, disk use, and filter-index status.'
                  )}</small
            ></span
          ><span class="badge" class:offline={connected === false}
            >{translate(
              $locale,
              checking
                ? 'Checking…'
                : connected === true
                  ? 'Connected'
                  : connected === false
                    ? 'Offline'
                    : 'Check'
            )}</span
          ></button
        >{:else}<div class="setting-row locked-network-details">
          <span class="setting-icon"><LockKeyhole size={18} /></span><span
            ><strong>{translate($locale, 'Wallet-specific network details are locked')}</strong
            ><small
              >{translate(
                $locale,
                'Unlock the wallet to view its node route, sync source, credentials, or run a live connection check.'
              )}</small
            ></span
          >
        </div>{/if}
    </div>
  </section>
  <section class="settings-group">
    <h2>{translate($locale, 'App logs')}</h2>
    <div class="settings-list">
      <a class="setting-row" href="/diagnostics">
        <span class="setting-icon"><ScrollText size={18} /></span>
        <span
          ><strong>{translate($locale, 'View app logs')}</strong><small
            >{translate(
              $locale,
              'Review and export sanitized app events without wallet identifiers or secrets.'
            )}</small
          ></span
        >
        <ChevronRight size={16} />
      </a>
    </div>
  </section>
  {#if walletUnlocked && selectedProfile?.kind !== 'multisig'}<section
      class="settings-group danger-zone"
    >
      <h2>{translate($locale, 'Wallet deletion')}</h2>
      <div>
        <span
          ><strong>{translate($locale, 'Delete wallet')}</strong><small
            >{translate($locale, 'Remove only {walletName} from this device.', {
              walletName: selectedProfile?.name ?? translate($locale, 'this wallet')
            })}</small
          ></span
        ><Button variant="danger-outline" size="small" onclick={openDeleteWallet}
          ><Trash2 size={15} />{translate($locale, 'Delete')}</Button
        >
      </div>
    </section>{:else if walletUnlocked}<section class="settings-group danger-zone">
      <h2>{translate($locale, 'Wallet deletion')}</h2>
      <div>
        <span
          ><strong>{translate($locale, 'Delete multisig wallet')}</strong><small
            >{translate(
              $locale,
              'Test its backup, then remove this watch-only wallet from this device.'
            )}</small
          ></span
        ><Button variant="danger-outline" size="small" href="/multisig/delete"
          ><Trash2 size={15} />{translate($locale, 'Delete')}</Button
        >
      </div>
    </section>{/if}
  <BuildIdentity placement="settings" />
</div>

<Modal
  open={networkSwitchOpen}
  title={translate($locale, 'Switch to {network}?', {
    network: networkName(networkSwitchTarget ?? defaultConfig.network)
  })}
  description={translate(
    $locale,
    'Groot will restart and open only the wallets and node settings saved for that network.'
  )}
  onclose={() => {
    if (networkSwitching) return;
    networkSwitchOpen = false;
    networkSwitchTarget = null;
    networkSwitchError = '';
  }}
>
  {#if networkSwitchTarget === 'mainnet'}<div class="warning-box">
      <strong>{translate($locale, 'Mainnet uses real bitcoin.')}</strong>
      {translate(
        $locale,
        'Confirm the Bitcoin Core network and every address before receiving, signing, or broadcasting.'
      )}
    </div>{:else}<p class="modal-supporting-copy">
      {translate(
        $locale,
        'The current network stays unchanged on disk. Switching back restores its wallets exactly as they were.'
      )}
    </p>{/if}
  {#if networkSwitchError}<p class="form-error" role="alert">{networkSwitchError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={networkSwitching}
      onclick={() => {
        networkSwitchOpen = false;
        networkSwitchTarget = null;
        networkSwitchError = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!networkSwitchTarget}
      loading={networkSwitching}
      loadingLabel={translate($locale, 'Restarting…')}
      onclick={confirmNetworkSwitch}
      >{translate($locale, 'Restart in {network}', {
        network: networkName(networkSwitchTarget ?? defaultConfig.network)
      })}</Button
    >
  </div>
</Modal>

<Modal
  open={labelInterchangeOpen}
  title={translate($locale, 'BIP329 wallet labels')}
  description={translate(
    $locale,
    'Move compatible labels without changing this wallet’s keys or descriptors.'
  )}
  onclose={() => {
    if (!labelInterchangeBusy) labelInterchangeOpen = false;
  }}
>
  <div class="warning-box">
    <strong>{translate($locale, 'Private financial metadata.')}</strong>
    {translate(
      $locale,
      'The file can expose labels, addresses, transaction references, public account keys, and relationships in your wallet history. Store and transfer it privately, then delete copies you no longer need.'
    )}
  </div>
  <p class="modal-supporting-copy">
    {translate(
      $locale,
      'Import is additive and atomic. Existing permanent labels are never overwritten; a conflict leaves the wallet unchanged.'
    )}
  </p>
  {#if labelInterchangeResult}<div class="ready-panel" role="status">
      <Check size={18} />
      <div>
        <strong>{translate($locale, 'Last label operation')}</strong><small
          >{labelInterchangeResult}</small
        >
      </div>
    </div>{/if}
  {#if labelInterchangeError}<p class="form-error" role="alert">{labelInterchangeError}</p>{/if}
  <div class="modal-footer">
    <Button variant="secondary" disabled={labelInterchangeBusy} onclick={importLabels}
      ><Upload size={15} />{translate($locale, 'Import JSONL')}</Button
    ><Button
      loading={labelInterchangeBusy}
      loadingLabel={translate($locale, 'Working…')}
      onclick={exportLabels}><Download size={15} />{translate($locale, 'Export JSONL')}</Button
    >
  </div>
</Modal>

<Modal
  open={renameOpen}
  title={translate($locale, 'Rename wallet')}
  description={translate($locale, 'Change how this wallet is identified inside Groot.')}
  onclose={() => {
    renameOpen = false;
    renameDraft = '';
    renameError = '';
  }}
>
  <label class="field"
    ><span>{translate($locale, 'Wallet name')}</span><input
      aria-label={translate($locale, 'New wallet name')}
      maxlength="48"
      bind:value={renameDraft}
      autocomplete="off"
    /><FieldCounter
      value={renameDraft}
      max={48}
      hint={translate(
        $locale,
        'This does not change descriptors, signer identity, recovery data, or saved public backups'
      )}
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
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!renameDraft.trim() || renameDraft.trim() === selectedProfile?.name}
      loading={renaming}
      loadingLabel={translate($locale, 'Saving…')}
      onclick={renameWallet}>{translate($locale, 'Save name')}</Button
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
  title={translate($locale, 'Rename hardware signer')}
  description={translate($locale, 'Change the local name shown when this signing key is required.')}
  onclose={() => {
    signerRenameOpen = false;
    signerRenameDraft = '';
    signerRenameError = '';
  }}
>
  <label class="field"
    ><span>{translate($locale, 'Hardware signer name')}</span><input
      aria-label={translate($locale, 'New hardware signer name')}
      maxlength="48"
      bind:value={signerRenameDraft}
      autocomplete="off"
    /><FieldCounter
      value={signerRenameDraft}
      max={48}
      hint={translate(
        $locale,
        'This does not change the device, fingerprint, public keys, descriptors, or saved public backups'
      )}
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
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!signerRenameDraft.trim() ||
        signerRenameDraft.trim() === hardwareSignerWallet?.signer.label}
      loading={signerRenaming}
      loadingLabel={translate($locale, 'Saving…')}
      onclick={renameHardwareSigner}>{translate($locale, 'Save signer name')}</Button
    >
  </div>
</Modal>
<Modal
  open={deleting}
  title={translate($locale, 'Delete this wallet?')}
  description={translate($locale, 'This permanently removes wallet data from this device.')}
  onclose={closeDeleteWallet}
>
  <div class="warning-box danger">
    <strong>{translate($locale, 'Make sure your recovery phrase is backed up.')}</strong>
    {translate($locale, 'Without it, your bitcoin cannot be recovered.')}
  </div>
  <PasswordField
    label={credentialLabel}
    bind:value={deleteCredential}
    autocomplete="current-password"
  />
  <label class="field"
    ><span>{translate($locale, 'Type DELETE to confirm')}</span><input
      bind:value={confirmText}
      placeholder={translate($locale, 'DELETE')}
    /></label
  >
  <div class="modal-footer">
    <Button variant="secondary" onclick={closeDeleteWallet}>{translate($locale, 'Cancel')}</Button
    ><Button
      variant="danger"
      disabled={confirmText !== 'DELETE' || !deleteCredential}
      loading={busy}
      loadingLabel={translate($locale, 'Deleting…')}
      onclick={deleteWallet}>{translate($locale, 'Delete wallet')}</Button
    >
  </div>
</Modal>
<Modal
  open={verifyOpen}
  title={translate($locale, 'Verify recovery backup')}
  description={translate(
    $locale,
    'Use your written 24 words for a private native proof, or reveal them securely first if you still need to make the backup.'
  )}
  onclose={() => {
    verifyOpen = false;
    verifyCredential = '';
    verifyError = '';
  }}
>
  <div class="warning-box verify-backup-warning">
    <strong>{translate($locale, 'Recovery words stay inside the trusted native window.')}</strong>
    {translate($locale, 'Revealing or verifying them\n    never sends the words into the webview.')}
  </div>
  <PasswordField
    label={translate($locale, 'Wallet passphrase')}
    bind:value={verifyCredential}
    autocomplete="current-password"
    hint={translate(
      $locale,
      'Required to decrypt the recovery words only inside trusted Rust code.'
    )}
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
      loadingLabel={translate($locale, 'Opening recovery words…')}
      onclick={revealAndVerifyBackup}>{translate($locale, 'View recovery words first')}</Button
    >
    <Button
      variant="secondary"
      disabled={verifying || revealingBackup}
      onclick={() => {
        verifyOpen = false;
        verifyCredential = '';
        verifyError = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!verifyCredential || revealingBackup}
      loading={verifying}
      loadingLabel={translate($locale, 'Opening verification…')}
      onclick={verifyBackup}>{translate($locale, 'Continue')}</Button
    >
  </div>
</Modal>
<Modal
  open={hardwareBackupOpen}
  title={translate($locale, 'Export public descriptor')}
  description={translate(
    $locale,
    'Recover this watch-only wallet without exposing the Ledger seed.'
  )}
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
        <strong>{translate($locale, 'Public, not harmless.')}</strong>
        {translate(
          $locale,
          'This descriptor cannot spend bitcoin, but it reveals every\n        wallet address and transaction. Store it privately.'
        )}
      </div>
      <PasswordField
        label={translate($locale, 'App PIN')}
        bind:value={hardwareBackupPin}
        autocomplete="current-password"
        hint={translate($locale, 'Re-authenticate before exposing wallet metadata.')}
      />
    </div>
    {#if hardwareBackupError}<p class="form-error" role="alert">{hardwareBackupError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        onclick={() => {
          hardwareBackupOpen = false;
          hardwareBackupPin = '';
        }}>{translate($locale, 'Cancel')}</Button
      ><Button
        disabled={!hardwareBackupPin}
        loading={exportingHardwareBackup}
        loadingLabel={translate($locale, 'Preparing…')}
        onclick={prepareHardwareBackup}>{translate($locale, 'Prepare backup')}</Button
      >
    </div>
  {:else}
    <div class="ready-panel">
      <Check size={18} />
      <div>
        <strong>{translate($locale, 'Public descriptor ready')}</strong><small
          >{translate(
            $locale,
            'Import this file in a clean disposable Groot profile and confirm the first receive\n          address matches.'
          )}</small
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
        }}><Eye size={15} />{translate($locale, 'View descriptor')}</Button
      ><Button onclick={saveHardwareBackup}
        ><Download size={15} />{translate($locale, 'Save descriptor')}</Button
      >
    </div>
  {/if}
</Modal>
<IdentifierDetailsModal
  open={descriptorDetailsOpen}
  value={hardwareBackup}
  title={translate($locale, 'Public wallet descriptor')}
  description={translate(
    $locale,
    'This watch-only descriptor cannot spend bitcoin, but it reveals the wallet’s complete activity.'
  )}
  label={translate($locale, 'Descriptor')}
  onclose={() => {
    descriptorDetailsOpen = false;
    hardwareBackupOpen = true;
  }}
/>
<Modal
  open={syncOpen}
  title={translate($locale, 'Wallet activity sync')}
  description={translate(
    $locale,
    'Choose how this wallet discovers transactions. Fee estimation and broadcast continue to use the separately configured Bitcoin Core service.'
  )}
  onclose={() => {
    if (syncSaving) return;
    syncOpen = false;
    syncCredential = '';
    syncError = '';
  }}
>
  {#if defaultConfig.network !== 'mainnet'}<div class="theme-choice node-location">
      <button
        class:active={syncSourceType === 'bitcoin_core'}
        onclick={() => (syncSourceType = 'bitcoin_core')}>Bitcoin Core</button
      ><button
        class:active={syncSourceType === 'compact_filters'}
        onclick={() => (syncSourceType = 'compact_filters')}
        >{translate($locale, 'Compact filters')}</button
      >
    </div>{/if}
  {#if defaultConfig.network === 'mainnet'}
    <div class="warning-box danger">
      <strong>{translate($locale, 'Mainnet requires an admitted Bitcoin Core node.')}</strong>
      {translate(
        $locale,
        'Compact-filter fallbacks are disabled. Activity, fees, and broadcast use only the Core endpoint you explicitly configure.'
      )}
    </div>
  {:else if syncSourceType === 'compact_filters'}
    <div class="warning-box">
      <strong>{translate($locale, 'Confirmed activity only.')}</strong>
      {translate(
        $locale,
        'BIP157/158 peers provide public filters and matching blocks.\n      Groot validates them locally; pending incoming payments are not discoverable through this source.\n      This build keeps the public chain index in memory, so filters are downloaded again after an app\n      restart; wallet history and checkpoints remain durable.'
      )}
    </div>
    <label class="field"
      ><span>{translate($locale, 'Peer selection')}</span><select
        bind:value={syncDiscoverPeers}
        onchange={(event) => {
          syncDiscoverPeers = event.currentTarget.value === 'true';
          if (syncDiscoverPeers) syncTorProxy = '';
        }}
        ><option value={true}>{translate($locale, 'Public peer discovery')}</option><option
          value={false}>{translate($locale, 'Manual peers only')}</option
        ></select
      ><small
        >{translate($locale, 'Manual mode never falls back to DNS seeds or public peers.')}</small
      ></label
    >
    <label class="field"
      ><span>{translate($locale, 'Required peers')}</span><input
        type="number"
        min={defaultConfig.network === 'regtest' ? 1 : 2}
        max="15"
        step="1"
        bind:value={syncRequiredPeers}
      /><small
        >{translate(
          $locale,
          'Public test networks require at least two independent peers. Regtest permits one local\n        peer.'
        )}</small
      ></label
    >
    <label class="field"
      ><span>{translate($locale, 'Manual peers · one numeric IP:port per line')}</span><textarea
        rows="3"
        bind:value={syncPeers}
        placeholder={translate(
          $locale,
          defaultConfig.network === 'regtest'
            ? '127.0.0.1:18444'
            : '203.0.113.10:38333\n[2001:db8::10]:38333'
        )}></textarea><small
        >{translate($locale, 'Hostnames are rejected so proxy mode cannot leak DNS.')}</small
      ></label
    >
    {#if !syncDiscoverPeers}<label class="field"
        ><span>{translate($locale, 'Optional local Tor SOCKS5 proxy')}</span><input
          bind:value={syncTorProxy}
          placeholder="127.0.0.1:9050"
        /><small
          >{translate(
            $locale,
            'When set, every P2P connection uses this loopback proxy. There is no direct fallback.'
          )}</small
        ></label
      >{/if}
  {:else}
    <div class="warning-box">
      <strong>{translate($locale, 'Bitcoin Core activity sync.')}</strong>
      {' '}
      <span
        >{translate(
          $locale,
          node.backend.type === 'remote_core'
            ? 'Fast remote sync sends this wallet’s public output scripts to the trusted server. The server can associate those scripts and wallet activity with your connection. No private keys, labels, or signing material are sent. Bitcoin Core 29+ and a synced basic block-filter index are required.'
            : 'Local Core sync matches wallet activity on this Mac. A pruned node can sync while it still retains every block newer than this wallet’s checkpoint; an older rescan needs an archival node or a reindex/re-download with enough history.'
        )}</span
      >
    </div>
  {/if}
  <PasswordField
    label={credentialLabel}
    bind:value={syncCredential}
    autocomplete="current-password"
    hint={translate($locale, 'Required to change this wallet’s network privacy boundary.')}
  />
  {#if syncError}<p class="form-error" role="alert">{syncError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        syncOpen = false;
        syncCredential = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!syncCredential ||
        (syncSourceType === 'compact_filters' &&
          (!Number.isInteger(Number(syncRequiredPeers)) ||
            (!syncDiscoverPeers && !syncPeers.trim())))}
      loading={syncSaving}
      loadingLabel={translate($locale, 'Saving…')}
      onclick={saveSyncSource}>{translate($locale, 'Save source')}</Button
    >
  </div>
</Modal>
<Modal
  open={scanOpen}
  title={translate($locale, 'Full wallet rescan')}
  description={translate(
    $locale,
    'Search from the earliest possible payment while deriving a bounded address gap.'
  )}
  onclose={closeFullRescan}
>
  <div class="scan-form">
    <div class="warning-box">
      <strong>{translate($locale, 'Earlier is safer; later is faster.')}</strong>
      {translate(
        $locale,
        'A birthday after the wallet’s first payment\n      can miss funds. A larger gap increases work and memory use.'
      )}
    </div>
    <label class="field"
      ><span class="field-label"
        >{translate($locale, 'Wallet birthday block')}<InsightTip
          label={translate($locale, 'About wallet birthday blocks')}
          text={translate(
            $locale,
            'The first block Groot will inspect. Choose a height at or before the wallet’s first possible payment.'
          )}
        /></span
      ><input
        aria-label={translate($locale, 'Wallet birthday block')}
        type="number"
        min="0"
        step="1"
        bind:value={scanDraft.birthdayHeight}
        disabled={scanning}
      /><small
        >{translate(
          $locale,
          'Use 0 when uncertain. Earlier scans are safer but take longer.'
        )}</small
      >{#if scanTip !== null}<small class="scan-tip"
          >{translate($locale, 'Current {network} chain tip: block {height}', {
            network: networkName(defaultConfig.network),
            height: formatInteger(scanTip, $locale)
          })}</small
        >{:else if scanTipLoading}<small class="scan-tip"
          >{translate($locale, 'Reading current chain tip…')}</small
        >{/if}{#if scanBirthdayAboveTip}<small class="form-error"
          >{translate($locale, 'Birthday block must be at or below the current chain tip.')}</small
        >{/if}</label
    >
    <details class="scan-optional-control" bind:open={scanOptionsOpen}>
      <summary
        ><span>{translate($locale, 'Address discovery options')}</span><ChevronDown
          size={15}
        /></summary
      >
      <label class="field"
        ><span class="field-label"
          >{translate($locale, 'Address gap limit')}<InsightTip
            label={translate($locale, 'About the address gap limit')}
            text={translate(
              $locale,
              'How many consecutive unused addresses Groot derives while searching for wallet activity. Increase it only for wallets that revealed long unused address runs.'
            )}
          /></span
        ><input
          aria-label={translate($locale, 'Address gap limit')}
          type="number"
          min="20"
          max="1000"
          step="1"
          bind:value={scanDraft.gapLimit}
          disabled={scanning}
        /><small
          >{translate(
            $locale,
            '20 is standard. It controls address discovery, not block-scan speed.'
          )}</small
        ></label
      >
    </details>
    <PasswordField
      label={credentialLabel}
      bind:value={scanCredential}
      autocomplete="current-password"
      disabled={scanning}
    />
    {#if scanning || scanStatus.status === 'cancelling'}
      <div class="scan-progress" role="status" aria-live="polite">
        <div>
          <strong
            >{translate(
              $locale,
              scanStatus.status === 'cancelling'
                ? 'Cancelling safely…'
                : scanCheckingPending
                  ? 'Checking pending transactions…'
                  : translate($locale, 'Scanning blocks · {percent}%', {
                      percent: scanPercent
                    })
            )}</strong
          ><small
            >{formatInteger(scanStatus.processedBlocks, $locale)} of {formatInteger(
              scanStatus.totalBlocks,
              $locale
            )}
            {translate($locale, 'blocks processed')}{scanStatus.currentHeight
              ? translate($locale, ' · height {height}', {
                  height: formatInteger(scanStatus.currentHeight, $locale)
                })
              : ''}</small
          >
        </div>
        <progress
          max="100"
          value={scanPercent}
          aria-label={translate($locale, 'Recovery scan progress')}
        ></progress>
      </div>
    {/if}
  </div>
  {#if scanError}<div class="hardware-inline-error scan-error-card" role="alert" aria-live="polite">
      <TriangleAlert size={18} />
      <span>
        <strong
          >{translate(
            $locale,
            scanErrorCode === 'node_history_unavailable'
              ? 'Required block history is unavailable'
              : 'Full rescan failed'
          )}</strong
        >
        <small>{scanError}</small>
        {#if scanErrorDetails}<dl class="scan-error-details">
            {#if scanErrorDetails.requestedBirthdayBlock !== undefined}<div>
                <dt>{translate($locale, 'Requested birthday')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(scanErrorDetails.requestedBirthdayBlock, $locale)
                  })}
                </dd>
              </div>{/if}
            {#if scanErrorDetails.requiredBlock !== undefined}<div>
                <dt>{translate($locale, 'Required anchor')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(scanErrorDetails.requiredBlock, $locale)
                  })}
                </dd>
              </div>{/if}
            {#if scanErrorDetails.earliestRetainedBlock !== undefined}<div>
                <dt>{translate($locale, 'Bitcoin Core retains full blocks from')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(scanErrorDetails.earliestRetainedBlock, $locale)
                  })}
                </dd>
              </div>{/if}
            {#if scanErrorDetails.minimumBirthdayBlock !== undefined}<div>
                <dt>{translate($locale, 'Earliest usable birthday')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(scanErrorDetails.minimumBirthdayBlock, $locale)
                  })}
                </dd>
              </div>{/if}
          </dl>{/if}
      </span>
    </div>{/if}
  <div class="modal-footer">
    {#if scanning}<Button
        variant="secondary"
        disabled={cancellingScan || scanStatus.status === 'cancelling'}
        loading={cancellingScan}
        loadingLabel={translate($locale, 'Requesting…')}
        onclick={cancelFullRescan}>{translate($locale, 'Cancel scan')}</Button
      >{:else}<Button variant="secondary" onclick={closeFullRescan}
        >{translate($locale, 'Close')}</Button
      >{/if}<Button
      disabled={scanning ||
        !scanCredential ||
        scanDraft.gapLimit < 20 ||
        scanDraft.gapLimit > 1000 ||
        scanDraft.birthdayHeight < 0 ||
        scanBirthdayAboveTip}
      loading={scanning}
      loadingLabel={translate($locale, 'Scanning blocks…')}
      onclick={runFullRescan}><RefreshCw size={15} />{translate($locale, 'Save & rescan')}</Button
    >
  </div>
</Modal>
<Modal
  open={networkReuseOpen}
  title={translate($locale, 'Use existing network setup')}
  description={translate(
    $locale,
    'Copy a verified node connection and sync method. Wallet data stays separate.'
  )}
  onclose={() => {
    if (networkReusing) return;
    networkReuseCredential = '';
    networkReuseError = '';
    networkReuseOpen = false;
  }}
>
  <label class="field"
    ><span>{translate($locale, 'Copy from')}</span><select bind:value={networkReuseSourceId}
      >{#each reusableNetworkSetups as source}<option value={source.walletId}
          >{source.walletName} — {translate(
            $locale,
            source.ready ? 'Ready' : 'Unlock first'
          )}</option
        >{/each}</select
    ><small>{translate($locale, 'The RPC password stays inside trusted native code.')}</small
    ></label
  >
  {#if selectedNetworkReuseSource && !selectedNetworkReuseSource.ready}
    <div class="warning-box" role="status">
      <strong>{translate($locale, 'Unlock the source wallet first.')}</strong>
      {' '}
      <span
        >{translate(
          $locale,
          'Open and unlock that wallet, then return here. Its saved credentials never enter this screen.'
        )}</span
      >
    </div>
  {/if}
  <PasswordField
    label={credentialLabel}
    bind:value={networkReuseCredential}
    autocomplete="current-password"
    disabled={!selectedNetworkReuseSource?.ready}
    hint={translate($locale, 'Protects the copied connection for this wallet.')}
  />
  {#if networkReuseError}<p class="form-error" role="alert">{networkReuseError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={networkReusing}
      onclick={() => {
        networkReuseCredential = '';
        networkReuseOpen = false;
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!selectedNetworkReuseSource?.ready || !networkReuseCredential}
      loading={networkReusing}
      loadingLabel={translate($locale, 'Verifying…')}
      onclick={reuseNetworkSetup}>{translate($locale, 'Use setup')}</Button
    >
  </div>
</Modal>
<Modal
  open={nodeOpen}
  title={translate($locale, 'Connect Bitcoin Core')}
  description={translate(
    $locale,
    'Each wallet keeps isolated, encrypted RPC credentials. Use direct TLS or a local Tor SOCKS proxy remotely.'
  )}
  onclose={closeNodeSettings}
>
  <div class="theme-choice node-location">
    <button
      class:active={node.backend.type === 'local_core'}
      onclick={() => setNodeLocation('local_core')}>{translate($locale, 'This Mac')}</button
    ><button
      class:active={node.backend.type === 'remote_core' && !node.torProxy}
      onclick={() => setNodeLocation('remote_core')}>{translate($locale, 'Remote TLS')}</button
    >{#if defaultConfig.network !== 'mainnet'}<button
        class:active={!!node.torProxy}
        onclick={() => setNodeLocation('tor')}>{translate($locale, 'Tor onion')}</button
      >{/if}
  </div>
  <label class="field"
    ><span>{translate($locale, 'RPC URL')}</span><input
      bind:value={node.backend.url}
      placeholder={translate(
        $locale,
        node.backend.type === 'local_core'
          ? localRpcUrl
          : node.torProxy
            ? 'http://your-node.onion:8332'
            : 'https://node.example.com:8332'
      )}
    /><small
      >{translate(
        $locale,
        defaultConfig.network === 'mainnet'
          ? 'Mainnet accepts loopback HTTP or a trusted remote HTTPS endpoint. Credentials in URLs are rejected.'
          : 'Credentials in URLs are rejected. TLS uses system trust roots; Tor accepts only .onion\n      destinations.'
      )}</small
    ></label
  >
  {#if node.torProxy}<label class="field"
      ><span>{translate($locale, 'Local SOCKS5 proxy')}</span><input
        bind:value={node.torProxy}
        placeholder="127.0.0.1:9050"
      /><small
        >{translate(
          $locale,
          'The proxy must listen on loopback. Remote proxies are rejected.'
        )}</small
      ></label
    >{/if}
  {#if node.backend.type === 'local_core'}
    {#if defaultConfig.network === 'regtest'}<div class="credential-warning">
        <ShieldCheck size={16} />
        <p>
          <strong>{translate($locale, 'Automatic cookie authentication')}</strong><span
            >{translate(
              $locale,
              'Uses Groot’s isolated local Regtest cookie. Switch to username/password only for a\n            custom local node.'
            )}</span
          >
        </p>
      </div>{/if}
    <label class="field"
      ><span>{translate($locale, 'Authentication')}</span><select bind:value={node.auth}
        >{#if defaultConfig.network === 'regtest'}<option value="cookie"
            >{translate($locale, 'Local cookie')}</option
          >{/if}<option value="user_pass">{translate($locale, 'Username and password')}</option
        ></select
      ></label
    >
  {/if}
  {#if node.auth === 'user_pass'}<label class="field"
      ><span>{translate($locale, 'RPC username')}</span><input
        value={node.username ?? ''}
        oninput={(event) => (node = { ...node, username: event.currentTarget.value })}
        autocomplete="off"
      /></label
    ><PasswordField
      label={translate($locale, 'RPC password')}
      bind:value={nodePassword}
      autocomplete="new-password"
      hint={translate($locale, 'Encrypted locally; never placed in the URL or public config.')}
    />{/if}
  <PasswordField
    label={credentialLabel}
    bind:value={walletCredential}
    autocomplete="current-password"
    hint={translate($locale, 'Required once to protect this wallet’s RPC credentials.')}
  />
  {#if nodeError}<p class="form-error">{nodeError}</p>{/if}
  <div class="modal-footer">
    <Button variant="secondary" onclick={closeNodeSettings}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!node.backend.url ||
        !walletCredential ||
        (node.auth === 'user_pass' && (!node.username || !nodePassword))}
      loading={busy}
      loadingLabel={translate($locale, 'Testing connection…')}
      onclick={saveNode}>{translate($locale, 'Save & test')}</Button
    >
  </div>
</Modal>
