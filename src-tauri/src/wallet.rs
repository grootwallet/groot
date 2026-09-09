use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_bitcoind_rpc::{
    bitcoincore_rpc::{
        json::{EstimateMode, GetBlockchainInfoResult},
        jsonrpc, Auth, Client, Error as CoreRpcError, RpcApi,
    },
    BitcoindRpcErrorExt, Emitter,
};
use bdk_wallet::{
    bitcoin::{
        bip32::{DerivationPath, Fingerprint, Xpriv, Xpub},
        constants::genesis_block,
        hashes::{sha256, Hash as _, HashEngine},
        secp256k1::Secp256k1,
        Address, Amount, BlockHash, FeeRate, Network, OutPoint, Psbt, Transaction, TxIn, Txid,
        Weight,
    },
    chain::{BlockId, ChainPosition, CheckPoint, ConfirmationBlockTime},
    descriptor::{policy::SatisfiableItem, Descriptor, DescriptorPublicKey},
    psbt::PsbtUtils,
    rusqlite::{
        config::DbConfig, params, Connection, OpenFlags, OptionalExtension,
        Transaction as SqliteTransaction,
    },
    template::{Bip84, Bip84Public},
    KeychainKind, PersistedWallet, SignOptions, Update, Wallet,
};
use bip39::Mnemonic;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(not(target_os = "macos"))]
use tauri::WebviewWindow;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::auth::AuthThrottle;
use crate::bsms::{DescriptorRecord, PublicDescriptorPair};
use crate::build_network::{
    DEFAULT_RPC_URL, IS_REGTEST, NAME as NETWORK_NAME, NETWORK, PARAMETERS,
};
use crate::external_signer::{
    self, ExternalSignerInput, ExternalSignerWallet, SignerSource, SINGLESIG_ACCOUNT_PATH,
};
use crate::hardware::{HardwareError, HardwareTransport, HwiChain, HwiCli};
use crate::label_provenance::{
    self, LabelOrigin, LabelSuggestionDto, PermanentLabelDto, ProvenanceState, ProvenanceSummaryDto,
};
use crate::multisig::{
    CosignerInput, CosignerSource, MultisigPreviewDto, MultisigWalletDto, PolicyInput,
    MULTISIG_ACCOUNT_PATH,
};
use crate::native_backup;
use crate::network::{
    ChainBackend, CoreNodeConfig, NetworkConfigError, RpcAuthMode, WalletSyncSource,
};
use crate::notifications::{self, WalletNotification};
use crate::privacy_selection::{AutomaticSelectionStrategy, PrivacyAwareCoinSelection};
use crate::proposal::{
    decode_psbt, discard_signer_signature, encode_psbt, hardware_signature_response,
    merge_signed_psbt, signature_progress,
};
use crate::recovery::{
    analyze_template, calculate_maturity, MaturityState, PolicyAnalysis, RecoveryTemplate,
};
use crate::registry::{self, RegistryError, WalletKind, WalletProfile, WalletRegistry};
use crate::secure_store;
use crate::session::WalletSessions;
use crate::ur_transport;

#[path = "wallet/error_translation.rs"]
mod error_translation;
use error_translation::*;
#[path = "wallet/recovery_scan.rs"]
mod recovery_scan;
use recovery_scan::*;
#[path = "wallet/verification_evidence.rs"]
mod verification_evidence;
use verification_evidence::*;
#[path = "wallet/proposal_review.rs"]
mod proposal_review;
use proposal_review::*;
#[path = "wallet/activity.rs"]
pub(crate) mod activity;

const MAX_PRIVATE_JSON_BYTES: u64 = 256 * 1024;
const MAX_CREDENTIAL_BYTES: usize = 1_024;
const MIN_NEW_WALLET_PASSPHRASE_CHARACTERS: usize = 16;
const MAX_MNEMONIC_INPUT_BYTES: usize = 4_096;
const ONBOARDING_SESSION_SECONDS: u64 = 15 * 60;
const HARDWARE_PIN_CHALLENGE_TIMEOUT: Duration = Duration::from_secs(2 * 60);
const MAX_HARDWARE_PIN_POSITIONS: usize = 50;
const REGTEST_APP_DATA_OVERRIDE: &str = "GROOT_REGTEST_APP_DATA_DIR";
const MIN_RECOVERY_GAP_LIMIT: u32 = 20;
const MAX_RECOVERY_GAP_LIMIT: u32 = 1_000;
const MIN_SUPPLEMENTAL_COIN_FLIPS: usize = 128;
const MAX_SUPPLEMENTAL_COIN_FLIPS: usize = 256;
const MIN_SUPPLEMENTAL_DICE_ROLLS: usize = 50;
const MAX_SUPPLEMENTAL_DICE_ROLLS: usize = 100;
const SUPPLEMENTAL_TRANSCRIPT_DOMAIN: &[u8] = b"Groot supplemental entropy transcript v1";
const SUPPLEMENTAL_MIX_DOMAIN: &[u8] = b"Groot BIP39 entropy mix v1";
const RPC_TIMEOUT: Duration = Duration::from_secs(15);
const NODE_HEALTH_ATTEMPTS: usize = 3;
const NODE_HEALTH_RETRY_DELAY: Duration = Duration::from_millis(200);
const MAINNET_NODE_ADMISSION_LIFETIME: Duration = Duration::from_secs(15 * 60);

#[path = "wallet/diagnostics.rs"]
pub mod diagnostics;
#[path = "wallet/export_commands.rs"]
mod export_commands;
#[cfg(any(target_os = "macos", test))]
use export_commands::PendingPdfExport;
use export_commands::SavedFileReveal;
#[cfg(test)]
use export_commands::{
    consume_pending_pdf_export, consume_saved_file_token, validate_psbt_filename,
    validate_public_backup_filename, validate_public_backup_pdf_filename, write_public_export,
    PENDING_PDF_EXPORT_TIMEOUT, SAVED_FILE_REVEAL_TIMEOUT,
};
pub use export_commands::{PendingPdfExportDto, SavedFileDto};

#[tauri::command]
pub async fn public_backup_save(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
    content: String,
) -> ApiResult<SavedFileDto> {
    export_commands::public_backup_save(app, state, suggested_filename, content).await
}

#[tauri::command]
pub async fn psbt_file_save(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
    psbt: String,
) -> ApiResult<SavedFileDto> {
    export_commands::psbt_file_save(app, state, suggested_filename, psbt).await
}

#[tauri::command]
pub async fn psbt_file_reveal(
    app: AppHandle,
    state: State<'_, AppState>,
    reveal_token: String,
) -> ApiResult<()> {
    export_commands::psbt_file_reveal(app, state, reveal_token).await
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn public_backup_pdf_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
) -> ApiResult<PendingPdfExportDto> {
    export_commands::public_backup_pdf_prepare(app, state, suggested_filename).await
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn public_backup_pdf_save(
    app: AppHandle,
    state: State<'_, AppState>,
    save_token: String,
    markup: String,
) -> ApiResult<SavedFileDto> {
    export_commands::public_backup_pdf_save(app, state, save_token, markup).await
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn public_backup_pdf_prepare(
    window: WebviewWindow,
    suggested_filename: String,
) -> ApiResult<PendingPdfExportDto> {
    export_commands::public_backup_pdf_prepare(window, suggested_filename)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn public_backup_pdf_save(save_token: String, markup: String) -> ApiResult<SavedFileDto> {
    export_commands::public_backup_pdf_save(save_token, markup)
}

fn hwi_cli(app: &AppHandle) -> ApiResult<HwiCli> {
    let home = app.path().home_dir().map_err(internal)?;
    let chain = HwiChain::for_network(NETWORK);
    #[cfg(target_os = "macos")]
    let cli = if let Some(resource_name) = option_env!("GROOT_BUNDLED_HWI_RESOURCE") {
        let resource_dir = app.path().resource_dir().map_err(internal)?;
        HwiCli::for_bundled_resource(chain, &resource_dir, resource_name)
    } else {
        Ok(HwiCli::for_chain(chain))
    };
    #[cfg(not(target_os = "macos"))]
    let cli = Ok(HwiCli::for_chain(chain));

    cli.and_then(|cli| cli.with_home(home))
        .map_err(hardware_api_error)
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    requested_birthday_block: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    required_block: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    earliest_retained_block: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    minimum_birthday_block: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    existing_wallet_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<ApiErrorDetails>,
}

type ApiResult<T> = Result<T, ApiError>;

const RECENT_CHECKPOINT_WINDOW: u32 = 2_016;
const PERIODIC_CHECKPOINT_INTERVAL: u32 = 2_016;
const CHECKPOINT_COMPACTION_THRESHOLD: u32 = 4_096;

fn api_error(code: &'static str, message: impl ToString) -> ApiError {
    ApiError {
        code,
        message: message.to_string(),
        existing_wallet_id: None,
        details: None,
    }
}

fn api_error_with_details(
    code: &'static str,
    message: impl ToString,
    details: ApiErrorDetails,
) -> ApiError {
    ApiError {
        code,
        message: message.to_string(),
        existing_wallet_id: None,
        details: Some(details),
    }
}

fn wallet_already_exists(profile: &WalletProfile) -> ApiError {
    ApiError {
        code: "wallet_already_exists",
        message: "This exact descriptor wallet already exists on this device.".to_owned(),
        existing_wallet_id: Some(profile.id),
        details: None,
    }
}

fn get_blockchain_info(client: &Client) -> Result<GetBlockchainInfoResult, CoreRpcError> {
    // RpcApi::get_blockchain_info performs an extra getnetworkinfo call only
    // to decode pre-0.19 Core responses. Groot's supported Core versions use
    // the modern response, so calling the typed RPC directly preserves the
    // node's least-privilege whitelist.
    client.call("getblockchaininfo", &[])
}

fn internal(error: impl ToString) -> ApiError {
    api_error("internal_error", error)
}

fn operation_guard<'a>(state: &'a State<'_, AppState>) -> ApiResult<MutexGuard<'a, ()>> {
    state.operations.lock().map_err(internal)
}

fn require_unlocked_with_activity(
    app: &AppHandle,
    state: &State<'_, AppState>,
    record_activity: bool,
) -> ApiResult<Uuid> {
    let registry = load_registry(app)?;
    let selected = registry
        .selected_wallet_id
        .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))?;
    let authorized = authorize_wallet_session(
        state,
        selected,
        record_activity,
        registry.inactivity_timeout_minutes,
    )?;
    if authorized {
        return Ok(selected);
    }
    Err(api_error(
        "wallet_locked",
        "Enter your passphrase / PIN to unlock Groot.",
    ))
}

fn authorize_wallet_session(
    state: &State<'_, AppState>,
    wallet_id: Uuid,
    record_activity: bool,
    inactivity_timeout_minutes: u16,
) -> ApiResult<bool> {
    let idle_timeout = Duration::from_secs(u64::from(inactivity_timeout_minutes) * 60);
    let now = Instant::now();
    let (expired_wallets, authorized) = {
        let mut sessions = state.unlocked_wallets.lock().map_err(internal)?;
        let expired_wallets = sessions.prune_expired_at(now, idle_timeout);
        let authorized = sessions.authorize_at(wallet_id, record_activity, now, idle_timeout);
        (expired_wallets, authorized)
    };
    if !expired_wallets.is_empty() || !authorized {
        let mut node_auth = state.node_auth.lock().map_err(internal)?;
        let mut authenticated_descriptors = state
            .authenticated_software_descriptors
            .lock()
            .map_err(internal)?;
        for expired in expired_wallets {
            node_auth.remove(&expired);
            authenticated_descriptors.remove(&expired);
        }
        if !authorized {
            node_auth.remove(&wallet_id);
            authenticated_descriptors.remove(&wallet_id);
        }
    }
    Ok(authorized)
}

fn require_unlocked(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<Uuid> {
    require_unlocked_with_activity(app, state, true)
}

fn require_unlocked_for_background_sync(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> ApiResult<Uuid> {
    require_unlocked_with_activity(app, state, false)
}

// Call under operation_guard, before opening any selected-wallet database.
fn require_wallet_read_context(
    app: &AppHandle,
    state: &State<'_, AppState>,
    wallet_id: Uuid,
    session_id: Option<Uuid>,
) -> ApiResult<Uuid> {
    validate_read_wallet(selected_profile(app)?.id, wallet_id)?;
    require_unlocked_for_background_sync(app, state)?;
    let current = state
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .identity(wallet_id);
    validate_read_session(current, session_id)
}

fn validate_read_wallet(current: Uuid, expected: Uuid) -> ApiResult<()> {
    if current != expected {
        return Err(api_error(
            "wallet_selection_changed",
            "The selected wallet changed. Retry from the current wallet.",
        ));
    }
    Ok(())
}

fn validate_read_session(current: Option<Uuid>, expected: Option<Uuid>) -> ApiResult<Uuid> {
    let current = current
        .ok_or_else(|| api_error("wallet_locked", "Unlock the wallet before continuing."))?;
    if expected.is_some_and(|expected| expected != current) {
        return Err(api_error(
            "wallet_selection_changed",
            "The wallet session changed. Retry from the current wallet.",
        ));
    }
    Ok(current)
}

fn unlock_selected(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<()> {
    let selected = selected_profile(app)?.id;
    state
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .unlock(selected);
    Ok(())
}

fn lock_wallet(state: &State<'_, AppState>, wallet_id: Uuid) -> ApiResult<()> {
    state
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .lock(wallet_id);
    state.node_auth.lock().map_err(internal)?.remove(&wallet_id);
    state
        .authenticated_software_descriptors
        .lock()
        .map_err(internal)?
        .remove(&wallet_id);
    clear_mainnet_node_admission(state)?;
    Ok(())
}

#[derive(Default)]
pub struct AppState {
    operations: Mutex<()>,
    foreground_sync: Mutex<Option<ActiveForegroundSync>>,
    proposals: Mutex<HashMap<String, PendingProposal>>,
    unlocked_wallets: Mutex<WalletSessions>,
    pending_mnemonic: Mutex<Option<PendingMnemonic>>,
    verified_recovery: Mutex<HashMap<Uuid, String>>,
    pending_hardware_pins: Mutex<HashMap<String, PendingHardwarePin>>,
    recent_hardware_scan: Mutex<Option<RecentHardwareScan>>,
    pending_hardware_admissions: Mutex<HashMap<String, Instant>>,
    hardware_scan_epoch: AtomicU64,
    node_auth: Mutex<HashMap<Uuid, NodeAuthSession>>,
    pending_mainnet_node_admission: Mutex<Option<PendingMainnetNodeAdmission>>,
    authenticated_software_descriptors: Mutex<HashMap<Uuid, (String, String)>>,
    saved_files: Mutex<HashMap<String, SavedFileReveal>>,
    #[cfg(target_os = "macos")]
    pending_pdf_exports: Mutex<HashMap<String, PendingPdfExport>>,
    recovery_scans: Mutex<HashMap<Uuid, ActiveRecoveryScan>>,
    runtime_auth_retry_at: Mutex<HashMap<Uuid, Instant>>,
    pending_policy_verifications: Mutex<HashMap<String, SignerPolicyVerificationDto>>,
    sync_status: Arc<Mutex<Option<WalletSyncStatusDto>>>,
    diagnostic_log: Mutex<()>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSyncStatusDto {
    wallet_id: String,
    source: &'static str,
    state: &'static str,
    progress_percent: Option<u8>,
    chain_height: Option<u32>,
    last_verified_height: u32,
    connected_peers: Option<usize>,
    required_peers: Option<usize>,
    failure_code: Option<&'static str>,
    updated_at: u64,
}

fn set_sync_status(
    state: &State<'_, AppState>,
    wallet_id: Uuid,
    source: &'static str,
    stage: &'static str,
    last_verified_height: u32,
) -> ApiResult<()> {
    *state.sync_status.lock().map_err(internal)? = Some(WalletSyncStatusDto {
        wallet_id: wallet_id.to_string(),
        source,
        state: stage,
        progress_percent: None,
        chain_height: None,
        last_verified_height,
        connected_peers: None,
        required_peers: None,
        failure_code: None,
        updated_at: now(),
    });
    Ok(())
}

fn update_compact_filter_sync_status(
    status: &Arc<Mutex<Option<WalletSyncStatusDto>>>,
    progress: crate::compact_filters::SyncProgress,
) {
    let Ok(mut status) = status.lock() else {
        return;
    };
    let Some(current) = status.as_mut() else {
        return;
    };
    if current.source != "compact_filters"
        || !matches!(current.state, "connecting" | "syncing" | "checking_matches")
    {
        return;
    }
    current.updated_at = now();
    match progress {
        crate::compact_filters::SyncProgress::Connecting {
            connected,
            required,
        } => {
            current.state = "connecting";
            current.connected_peers = Some(connected);
            current.required_peers = Some(required);
        }
        crate::compact_filters::SyncProgress::Connected => {
            current.state = "syncing";
            current.connected_peers = None;
            current.required_peers = None;
        }
        crate::compact_filters::SyncProgress::Scanning {
            percent,
            chain_height,
        } => {
            current.state = "syncing";
            current.progress_percent = Some(percent.round().clamp(0.0, 100.0) as u8);
            current.chain_height = Some(chain_height);
        }
        crate::compact_filters::SyncProgress::CheckingMatch => {
            current.state = "checking_matches";
        }
        crate::compact_filters::SyncProgress::Degraded => {
            current.state = "connecting";
        }
    }
}

fn core_sync_progress_percent(start_height: u32, current_height: u32, target_height: u32) -> u8 {
    if target_height <= start_height {
        return 100;
    }
    let completed = current_height
        .clamp(start_height, target_height)
        .saturating_sub(start_height);
    let total = target_height.saturating_sub(start_height);
    u8::try_from(u64::from(completed) * 100 / u64::from(total)).unwrap_or(100)
}

fn update_core_sync_status(
    status: &Arc<Mutex<Option<WalletSyncStatusDto>>>,
    start_height: u32,
    current_height: u32,
    target_height: u32,
) {
    let Ok(mut status) = status.lock() else {
        return;
    };
    let Some(current) = status.as_mut() else {
        return;
    };
    if current.source != "bitcoin_core" || current.state != "syncing" {
        return;
    }
    let percent = core_sync_progress_percent(start_height, current_height, target_height);
    current.chain_height = Some(target_height);
    if current.progress_percent != Some(percent) {
        current.progress_percent = Some(percent);
        current.updated_at = now();
    }
}

fn finish_sync_status(
    state: &State<'_, AppState>,
    wallet_id: Uuid,
    result: &ApiResult<WalletSnapshotDto>,
    verified_height: u32,
) {
    let Ok(mut status) = state.sync_status.lock() else {
        return;
    };
    let Some(current) = status.as_mut() else {
        return;
    };
    if current.wallet_id != wallet_id.to_string() {
        return;
    }
    current.state = match result {
        Ok(_) => "completed",
        Err(error) if error.code == "sync_cancelled" => "cancelled",
        Err(_) => "failed",
    };
    current.failure_code = result.as_ref().err().map(|error| error.code);
    current.last_verified_height = verified_height;
    current.updated_at = now();
}

struct ActiveRecoveryScan {
    run_id: String,
    cancel: Arc<AtomicBool>,
}

struct ActiveForegroundSync {
    wallet_id: Uuid,
    cancel: Arc<AtomicBool>,
}

struct NodeAuthSession {
    config: CoreNodeConfig,
    password: Zeroizing<String>,
    mainnet_node_verified: bool,
}

#[derive(Clone)]
struct PendingMainnetNodeAdmission {
    config: CoreNodeConfig,
    password: Zeroizing<String>,
    created_at: Instant,
    scope: MainnetNodeAdmissionScope,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MainnetNodeAdmissionScope {
    ExistingWallet(Uuid),
    NewWallet,
}

struct DatabaseOpenPermit {
    issued_at: Instant,
}

struct AuthenticationDatabaseOpenPermit {
    issued_at: Instant,
}

struct AuthenticationDatabase(Connection);

struct NewWalletAdmissionCleanup<'a> {
    state: &'a AppState,
}

impl Drop for NewWalletAdmissionCleanup<'_> {
    fn drop(&mut self) {
        if let Ok(mut admission) = self.state.pending_mainnet_node_admission.lock() {
            admission.take();
        }
    }
}

fn clear_new_wallet_admission_on_exit(state: &AppState) -> NewWalletAdmissionCleanup<'_> {
    NewWalletAdmissionCleanup { state }
}

#[derive(Deserialize)]
struct ProtectedNodeAuth {
    version: u8,
    config: CoreNodeConfig,
    password: String,
}

impl Drop for ProtectedNodeAuth {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

#[derive(Serialize)]
struct ProtectedNodeAuthRef<'a> {
    version: u8,
    config: &'a CoreNodeConfig,
    password: &'a str,
}

const PROTECTED_NODE_AUTH_VERSION: u8 = 1;

fn decode_protected_node_auth(
    plaintext: &[u8],
    current_config: &CoreNodeConfig,
) -> ApiResult<Option<ProtectedNodeAuth>> {
    let Ok(protected) = serde_json::from_slice::<ProtectedNodeAuth>(plaintext) else {
        // Legacy secrets contained only the password. Never combine one with a
        // mutable public endpoint; leave the wallet unlocked so it can be
        // migrated by explicitly re-saving the node connection.
        return Ok(None);
    };
    if protected.version != PROTECTED_NODE_AUTH_VERSION || protected.config != *current_config {
        return Err(api_error(
            "invalid_node_config",
            "The Bitcoin Core connection no longer matches the protected RPC credentials. Review and save it again.",
        ));
    }
    Ok(Some(protected))
}

#[derive(Debug)]
struct PendingProposal {
    psbt: Psbt,
    recipient: String,
    amount: u64,
    fee: u64,
}

struct PendingMnemonic {
    words: Zeroizing<String>,
    created_at: u64,
    backup_verified: bool,
}

struct PendingHardwarePin {
    device_type: String,
    device_path: String,
    created_at: Instant,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplementalEntropyDto {
    source: String,
    outcomes: String,
}

fn onboarding_session_is_fresh(created_at: u64, current_time: u64) -> bool {
    current_time.saturating_sub(created_at) <= ONBOARDING_SESSION_SECONDS
}

fn supplemental_entropy_digest(
    supplemental: SupplementalEntropyDto,
) -> ApiResult<Zeroizing<[u8; 32]>> {
    let outcomes = Zeroizing::new(supplemental.outcomes);
    let (source_tag, minimum, maximum) = match supplemental.source.as_str() {
        "coin" => (
            b"coin".as_slice(),
            MIN_SUPPLEMENTAL_COIN_FLIPS,
            MAX_SUPPLEMENTAL_COIN_FLIPS,
        ),
        "dice" => (
            b"dice".as_slice(),
            MIN_SUPPLEMENTAL_DICE_ROLLS,
            MAX_SUPPLEMENTAL_DICE_ROLLS,
        ),
        _ => {
            return Err(api_error(
                "invalid_supplemental_entropy",
                "Choose coin flips or six-sided dice for supplemental entropy.",
            ))
        }
    };
    if outcomes.len() < minimum || outcomes.len() > maximum {
        return Err(api_error(
            "invalid_supplemental_entropy",
            format!(
                "Enter between {minimum} and {maximum} physical outcomes for this supplemental entropy source."
            ),
        ));
    }
    let valid = match supplemental.source.as_str() {
        "coin" => outcomes
            .bytes()
            .all(|outcome| matches!(outcome, b'H' | b'T')),
        "dice" => outcomes
            .bytes()
            .all(|outcome| matches!(outcome, b'1'..=b'6')),
        _ => false,
    };
    if !valid {
        return Err(api_error(
            "invalid_supplemental_entropy",
            "Supplemental entropy contains an invalid physical outcome.",
        ));
    }

    let mut engine = sha256::Hash::engine();
    engine.input(SUPPLEMENTAL_TRANSCRIPT_DOMAIN);
    engine.input(&[source_tag.len() as u8]);
    engine.input(source_tag);
    engine.input(&(outcomes.len() as u32).to_be_bytes());
    engine.input(outcomes.as_bytes());
    Ok(Zeroizing::new(
        sha256::Hash::from_engine(engine).to_byte_array(),
    ))
}

fn mix_supplemental_entropy(
    os_entropy: &[u8; 32],
    supplemental_digest: &[u8; 32],
) -> Zeroizing<[u8; 32]> {
    let mut engine = sha256::Hash::engine();
    engine.input(SUPPLEMENTAL_MIX_DOMAIN);
    engine.input(&(os_entropy.len() as u32).to_be_bytes());
    engine.input(os_entropy);
    engine.input(&(supplemental_digest.len() as u32).to_be_bytes());
    engine.input(supplemental_digest);
    Zeroizing::new(sha256::Hash::from_engine(engine).to_byte_array())
}

fn generate_software_mnemonic_with(
    fill_entropy: impl FnOnce(&mut [u8]) -> ApiResult<()>,
    supplemental_digest: Option<&[u8; 32]>,
) -> ApiResult<Mnemonic> {
    // BIP39 maps 256 bits of entropy to exactly 24 words. Zeroizing also covers
    // an entropy-source or mnemonic-construction error, including partial fills.
    let mut entropy = Zeroizing::new([0_u8; 32]);
    fill_entropy(&mut entropy[..])?;
    if let Some(supplemental_digest) = supplemental_digest {
        let mixed = mix_supplemental_entropy(&entropy, supplemental_digest);
        Mnemonic::from_entropy(&mixed[..]).map_err(internal)
    } else {
        Mnemonic::from_entropy(&entropy[..]).map_err(internal)
    }
}

fn generate_software_mnemonic(supplemental_digest: Option<&[u8; 32]>) -> ApiResult<Mnemonic> {
    generate_software_mnemonic_with(
        |entropy| {
            // OsRng delegates to the target operating system's CSPRNG. Never fall
            // back to time, browser randomness, a user-space PRNG, or partial data.
            OsRng.try_fill_bytes(entropy).map_err(|_| {
                api_error(
                    "entropy_unavailable",
                    "Secure operating-system randomness is unavailable. Wallet creation stopped without generating key material.",
                )
            })
        },
        supplemental_digest,
    )
}

#[derive(Serialize, Deserialize)]
struct EncryptedSecret {
    version: u8,
    salt: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceDto {
    confirmed: u64,
    pending: u64,
    trusted_pending: u64,
    total: u64,
}

fn aggregate_pending_balance(trusted_pending: u64, untrusted_pending: u64) -> u64 {
    trusted_pending.saturating_add(untrusted_pending)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveAddressDto {
    id: u32,
    address: String,
    testnet_alias: Option<String>,
    label: String,
    labels: Vec<String>,
    created: String,
    status: String,
    derivation_path: String,
    hardware_verified_at: Option<String>,
    hardware_verified_by: Option<String>,
}

fn regtest_testnet_address_alias(address: &str) -> Option<String> {
    if !IS_REGTEST {
        return None;
    }
    let address = Address::from_str(address)
        .ok()?
        .require_network(Network::Regtest)
        .ok()?;
    Address::from_script(&address.script_pubkey(), Network::Testnet)
        .ok()
        .map(|alias| alias.to_string())
}

fn proposal_testnet_aliases(
    recipient: &str,
    change_addresses: &[String],
) -> (Option<String>, Vec<Option<String>>) {
    (
        regtest_testnet_address_alias(recipient),
        change_addresses
            .iter()
            .map(|address| regtest_testnet_address_alias(address))
            .collect(),
    )
}

fn hardware_display_matches_expected_address(expected: &str, actual: &str) -> bool {
    hardware_display_matches_expected_address_for_network(NETWORK, expected, actual)
}

fn hardware_display_matches_expected_address_for_network(
    network: Network,
    expected: &str,
    actual: &str,
) -> bool {
    if actual == expected {
        return true;
    }
    if network != Network::Regtest {
        return false;
    }
    let Some(expected) = Address::from_str(expected)
        .ok()
        .and_then(|address| address.require_network(Network::Regtest).ok())
    else {
        return false;
    };
    let Some(actual) = Address::from_str(actual)
        .ok()
        .and_then(|address| address.require_network(Network::Testnet).ok())
    else {
        return false;
    };
    expected.script_pubkey() == actual.script_pubkey()
}

fn validated_hardware_verification_metadata(
    network: Network,
    wallet_address: &str,
    displayed_address: Option<&str>,
    verified_at: Option<u64>,
    signer_fingerprint: Option<String>,
) -> (Option<String>, Option<String>) {
    if displayed_address.is_some_and(|displayed| {
        hardware_display_matches_expected_address_for_network(network, wallet_address, displayed)
    }) {
        (
            verified_at.map(|value| value.to_string()),
            signer_fingerprint,
        )
    } else {
        (None, None)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RbfHistoryDto {
    original_txid: String,
    replacement_txid: String,
    original_fee_rate: Option<f64>,
    replacement_fee_rate: Option<f64>,
    outcome: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDto {
    id: String,
    kind: String,
    direction: String,
    amount: u64,
    fee: Option<u64>,
    status: String,
    confirmations: u32,
    date: String,
    address: Option<String>,
    label: String,
    intent_label: Option<PermanentLabelDto>,
    provenance: ProvenanceSummaryDto,
    block: Option<u32>,
    replaced_by: Option<String>,
    replaces: Option<String>,
    input_count: Option<usize>,
    output_count: Option<usize>,
    fee_rate: Option<f64>,
    wallet_input_amount: Option<u64>,
    wallet_output_amount: Option<u64>,
    locktime: Option<u32>,
    rbf: Option<bool>,
    rbf_history: Option<RbfHistoryDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UtxoDto {
    outpoint: String,
    amount: u64,
    confirmations: u32,
    address: String,
    label: String,
    primary_label: Option<PermanentLabelDto>,
    provenance: ProvenanceSummaryDto,
    frozen: bool,
    policy_maturity: Option<PolicyMaturityDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyMaturityDto {
    state: MaturityState,
    policy_type: String,
    delay_blocks: u32,
    age_blocks: u32,
    remaining_blocks: Option<u32>,
    approaching_at_blocks: u32,
    maturity_height: Option<u32>,
    approximate_seconds_remaining: Option<u64>,
    delayed_spend_supported: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainTipDto {
    height: u32,
    observed_at: Option<String>,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSnapshotDto {
    network: &'static str,
    balance: BalanceDto,
    transactions: Vec<TransactionDto>,
    utxos: Vec<UtxoDto>,
    receive_addresses: Vec<ReceiveAddressDto>,
    label_suggestions: Vec<LabelSuggestionDto>,
    synced_at: Option<String>,
    chain_tip: ChainTipDto,
}

#[derive(Debug, Clone)]
struct DelayedPolicyContext {
    policy_type: String,
    delay_blocks: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeEstimatesDto {
    economy: f64,
    standard: f64,
    priority: f64,
    source: &'static str,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicNetworkStatusDto {
    priority_fee: Option<f64>,
    network_tip: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaxSpendDto {
    pub amount: u64,
    pub fee: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatusDto {
    connected: bool,
    blocks: u64,
    backend: CoreNodeConfig,
    pruned: bool,
    prune_height: Option<u64>,
    initial_block_download: bool,
    size_on_disk: u64,
    block_filter_index: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScanSettingsDto {
    birthday_height: u32,
    gap_limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScanStatusDto {
    status: String,
    birthday_height: u32,
    gap_limit: u32,
    current_height: u32,
    target_height: u32,
    processed_blocks: u32,
    total_blocks: u32,
    started_at: u64,
    updated_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentProposalDto {
    proposal_id: String,
    recipient: String,
    recipient_testnet_alias: Option<String>,
    recipient_is_wallet_owned: bool,
    wallet_controlled_output_amount: Option<u64>,
    recipient_derivation_paths: Vec<String>,
    label: String,
    labels: Vec<String>,
    amount: u64,
    fee: u64,
    fee_rate: f64,
    total: u64,
    change: u64,
    change_addresses: Vec<String>,
    change_testnet_aliases: Vec<Option<String>>,
    change_derivation_paths: Vec<Vec<String>>,
    output_count: usize,
    selected_outpoints: Vec<String>,
    inputs: Vec<ProposalInputDto>,
    locktime: u32,
    rbf: bool,
    network: &'static str,
    selection_impact: SelectionImpactDto,
    acceleration: Option<AccelerationReviewDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelerationReviewDto {
    method: AccelerationMethod,
    original_txid: String,
    original_fee_rate: f64,
    minimum_fee_rate: f64,
    target_fee_rate: f64,
    incremental_fee: u64,
    recommendation_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelerationQuoteDto {
    method: AccelerationMethod,
    original_txid: String,
    original_fee: u64,
    original_vsize: u64,
    original_effective_fee_rate: f64,
    minimum_fee_rate: f64,
    target_fee_rate: f64,
    estimated_replacement_fee: u64,
    incremental_fee: u64,
    resulting_effective_fee_rate: f64,
    replacement_vsize: u64,
    recommendation_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpfpAccelerationQuoteDto {
    method: AccelerationMethod,
    original_txid: String,
    parent_fee: u64,
    parent_vsize: u64,
    parent_effective_fee_rate: f64,
    minimum_fee_rate: f64,
    target_fee_rate: f64,
    child_fee: u64,
    child_vsize: u64,
    package_fee: u64,
    package_vsize: u64,
    resulting_package_fee_rate: f64,
    recommendation_source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionImpactDto {
    strategy: String,
    selected_input_count: usize,
    estimated_input_weight: u64,
    funding_labels: Vec<PermanentLabelDto>,
    provenance_state: ProvenanceState,
    existing_cluster_count: usize,
    new_cluster_links: usize,
    has_unknown_provenance: bool,
    has_address_reuse: bool,
    fee_difference_vs_private: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinSelectionPreviewDto {
    selected_amount: u64,
    selected_input_count: usize,
    estimated_input_weight: u64,
    funding_labels: Vec<PermanentLabelDto>,
    provenance_state: ProvenanceState,
    existing_cluster_count: usize,
    new_cluster_links: usize,
    has_unknown_provenance: bool,
    has_address_reuse: bool,
    one_existing_group_can_fund: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalInputDto {
    outpoint: String,
    amount: u64,
    sequence: u32,
    derivation_paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum CoinSelectionInput {
    Auto {
        #[serde(default)]
        strategy: AutomaticSelectionStrategy,
    },
    Manual {
        outpoints: Vec<String>,
    },
}

impl CoinSelectionInput {
    fn strategy_name(&self) -> &'static str {
        match self {
            Self::Auto { strategy } => strategy.as_str(),
            Self::Manual { .. } => "manual",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastResultDto {
    txid: String,
    snapshot: WalletSnapshotDto,
    sync_pending: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AccelerationMethod {
    Rbf,
    Cpfp,
}

impl AccelerationMethod {
    fn as_str(self) -> &'static str {
        match self {
            Self::Rbf => "rbf",
            Self::Cpfp => "cpfp",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareDeviceDto {
    id: String,
    label: String,
    model: String,
    fingerprint: Option<String>,
    connected: bool,
    status: &'static str,
    message: String,
    action: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CosignerHealthDto {
    status: &'static str,
    checked_at: String,
    summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareHealthCheckRecordDto {
    signer_fingerprint: String,
    status: String,
    checked_at: String,
    summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerPolicyVerificationDto {
    signer_fingerprint: String,
    device_type: String,
    verified_at: String,
    scope: &'static str,
    displayed_address: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyVerificationAddressDto {
    canonical_address: String,
    testnet_alias: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigProposalDto {
    proposal_id: String,
    recipient: String,
    recipient_testnet_alias: Option<String>,
    recipient_is_wallet_owned: bool,
    wallet_controlled_output_amount: Option<u64>,
    recipient_derivation_paths: Vec<String>,
    label: String,
    labels: Vec<String>,
    amount: u64,
    fee: u64,
    fee_rate: f64,
    total: u64,
    change: u64,
    change_addresses: Vec<String>,
    change_testnet_aliases: Vec<Option<String>>,
    change_derivation_paths: Vec<Vec<String>>,
    output_count: usize,
    selected_outpoints: Vec<String>,
    inputs: Vec<ProposalInputDto>,
    locktime: u32,
    rbf: bool,
    network: &'static str,
    psbt: String,
    signed: usize,
    required: usize,
    can_finalize: bool,
    signed_fingerprints: Vec<String>,
    spend_path: String,
    eligible_signer_fingerprints: Vec<String>,
    status: String,
    created_at: String,
    selection_impact: SelectionImpactDto,
    acceleration: Option<AccelerationReviewDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigBackupDto {
    version: u8,
    network: String,
    wallet: MultisigWalletDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSignerBackupDto {
    descriptor: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ExternalSignerBackupRecord<'a> {
    version: u8,
    network: &'static str,
    descriptor: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDrillDto {
    first_address: String,
    matches_current_wallet: bool,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
struct HwiDevice {
    #[serde(skip)]
    capability: String,
    #[serde(default)]
    fingerprint: Option<String>,
    #[serde(default, rename = "type")]
    device_type: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    code: Option<i64>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    needs_pin_sent: bool,
    #[serde(default)]
    needs_passphrase_sent: bool,
    #[serde(default)]
    warnings: Vec<Vec<String>>,
}

#[derive(Debug)]
struct RecentHardwareScan {
    devices: HashMap<String, HwiDevice>,
    created_at: Instant,
    generation: Option<u64>,
}

#[derive(Deserialize)]
struct HwiSuccess {
    success: Option<bool>,
    code: Option<i64>,
}

#[derive(Deserialize)]
struct HwiPsbt {
    psbt: Option<String>,
    error: Option<String>,
    code: Option<i64>,
}

#[derive(Deserialize)]
struct HwiAddress {
    address: Option<String>,
    error: Option<String>,
    code: Option<i64>,
}

fn missing_hwi_value(code: Option<i64>, value: &str) -> ApiError {
    let message = match code {
        Some(-3 | -12) => "Unlock the signer and quit other wallet apps, then try again.",
        Some(-14) => "The action was cancelled on the hardware signer.",
        Some(-15) => "The hardware signer is busy. Finish the current action and try again.",
        Some(-8 | -9) => "This hardware signer does not support the requested operation.",
        Some(-1 | -2 | -4 | -7) => "Groot could not select the enumerated hardware signer.",
        _ => value,
    };
    api_error("hardware_unavailable", message)
}

fn missing_hardware_xpub(
    device_type: &str,
    derivation_path: &str,
    code: Option<i64>,
    hwi_message: Option<&str>,
    fallback: &str,
) -> ApiError {
    let safe_detail = hwi_message.unwrap_or_default().to_ascii_lowercase();
    if device_type.eq_ignore_ascii_case("bitbox02")
        && (safe_detail.contains("device not paired yet")
            || safe_detail.contains("pair using the bitboxapp"))
    {
        return api_error(
            "hardware_pairing_required",
            "Pair this BitBox in BitBoxApp, confirm that BitBoxApp can open it, then fully quit BitBoxApp and scan again in Groot.",
        );
    }
    if matches!(code, Some(-3 | -12 | -14 | -15 | -8 | -9)) {
        return missing_hwi_value(code, fallback);
    }
    match device_type.to_ascii_lowercase().as_str() {
        "ledger" => {
            let ledger_app = if NETWORK == Network::Bitcoin {
                "Bitcoin"
            } else {
                "Bitcoin Test—not Bitcoin"
            };
            let message = if code == Some(-7) || safe_detail.contains("bad argument") {
                format!("Ledger rejected this {NETWORK_NAME} account path. Open the {ledger_app} app, then reconnect and try again.")
            } else if code == Some(-13)
                || safe_detail.contains("technical problem")
                || safe_detail.contains("device failure")
            {
                format!("Ledger is in the wrong app for this {NETWORK_NAME} wallet. Quit Ledger Live, open {ledger_app}, then reconnect and try again.")
            } else if safe_detail.contains("bitcoin test")
                || safe_detail.contains("not in either the bitcoin")
            {
                format!("Open {ledger_app} on Ledger, keep Ledger Live closed, then try again.")
            } else if derivation_path.starts_with("m/48'") {
                format!("Ledger did not return the {NETWORK_NAME} multisig account key. Keep Ledger Live closed, open {ledger_app}, try again, then approve the public-key export if Ledger asks.")
            } else {
                format!("Ledger did not return the {NETWORK_NAME} BIP84 account key. Keep Ledger Live closed, open {ledger_app}, reconnect, then try again.")
            };
            api_error("hardware_unavailable", message)
        }
        "bitbox02" => api_error(
            "hardware_unavailable",
            "BitBox may request its password again for this new secure connection. Check its screen, enter the password on BitBox if asked, and try again.",
        ),
        "trezor" => {
            let safe_detail = hwi_message.unwrap_or_default().to_ascii_lowercase();
            let message = if code == Some(-13)
                && safe_detail.contains("unsupported trezor model")
            {
                "This Groot release's bundled HWI 3.2.0 does not support this Trezor model. Update Groot when a reviewed release adds support, then scan again."
            } else {
                "Trezor did not export the account key. Complete the PIN or wallet selection shown by Groot and the device, then try again."
            };
            api_error("hardware_unavailable", message)
        }
        "jade" => api_error(
            "hardware_unavailable",
            "Jade did not unlock. Try again and enter your PIN on Jade when prompted.",
        ),
        "coldcard" => api_error(
            "hardware_unavailable",
            "Coldcard did not export the account key. Sign in, enable USB communication, keep it at the main menu, then try again.",
        ),
        _ => missing_hwi_value(code, fallback),
    }
}

fn hwi_warns_about_empty_passphrase(device: &HwiDevice) -> bool {
    device.needs_passphrase_sent
        || device.warnings.iter().flatten().any(|warning| {
            let warning = warning.to_ascii_lowercase();
            warning.contains("passphrase") && warning.contains("empty string")
        })
}

fn hardware_device_dto(device: HwiDevice) -> HardwareDeviceDto {
    let device_type = device.device_type.to_ascii_lowercase();
    let label = if device.model.is_empty() {
        device.device_type.clone()
    } else {
        device.model.clone()
    };
    // A locked Trezor can report both PIN and passphrase requirements. PIN must
    // be resolved first because no wallet fingerprint exists until it is unlocked.
    let pin_required = device_type == "trezor"
        && (device.needs_pin_sent || (device.code == Some(-12) && !device.needs_passphrase_sent));
    let unsupported_trezor_model = device_type == "trezor"
        && device.code == Some(-13)
        && device
            .error
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .contains("unsupported trezor model");
    let (status, message, action) = if matches!(device_type.as_str(), "keepkey" | "digitalbitbox") {
        (
            "not_ready",
            "This hardware signer is not supported by Groot.",
            "retry",
        )
    } else if unsupported_trezor_model {
        (
            "not_ready",
            "This Groot release's bundled HWI 3.2.0 does not support this Trezor model. Update Groot when a reviewed release adds support, then scan again.",
            "retry",
        )
    } else if pin_required {
        (
            "needs_pin",
            "Locked. Start the PIN matrix, then tap the blank cells matching the locations shown on the device.",
            "prompt_pin",
        )
    } else if hwi_warns_about_empty_passphrase(&device) {
        (
            "needs_passphrase",
            "Passphrase protection is enabled. Choose the standard wallet with no passphrase, or select a hidden wallet on-device when supported.",
            "confirm_empty_passphrase",
        )
    } else if device.fingerprint.is_some() && device_type == "ledger" {
        (
            "detected",
            "Detected. Groot verifies that Bitcoin Test is open when it reads the public account key.",
            "import",
        )
    } else if device.fingerprint.is_some() {
        ("ready", "Ready to import the public account key.", "import")
    } else if device_type == "bitbox02" {
        (
            "detected",
            "Detected. Continue to read and verify the public account key. BitBox may request its password again for the new secure connection.",
            "import",
        )
    } else if device_type == "jade" {
        (
            "needs_device_unlock",
            "Select this signer. Groot will ask Jade to unlock; enter your PIN on Jade when prompted.",
            "unlock",
        )
    } else if device_type == "ledger" {
        (
            "needs_device_unlock",
            "Select this signer, unlock Ledger, and open Bitcoin Test—not Bitcoin—to continue.",
            "unlock",
        )
    } else if device_type == "coldcard" {
        (
            "needs_device_unlock",
            "Unlock Coldcard and enable USB communication, then scan again.",
            "retry",
        )
    } else {
        (
            "not_ready",
            "Detected, but not ready. Finish setup and unlock the device, then scan again.",
            "retry",
        )
    };
    HardwareDeviceDto {
        id: device.capability,
        label,
        model: device.device_type,
        fingerprint: device.fingerprint,
        connected: true,
        status,
        message: message.to_owned(),
        action,
    }
}

fn require_explicit_standard_wallet_selection(
    device: &HwiDevice,
    allow_empty_passphrase: bool,
) -> ApiResult<()> {
    if hwi_warns_about_empty_passphrase(device) && !allow_empty_passphrase {
        return Err(api_error(
            "hardware_wallet_selection_required",
            "Choose whether this signer uses the standard wallet with no passphrase. Groot will not select it silently.",
        ));
    }
    Ok(())
}

fn validate_regtest_app_data_override(path: PathBuf) -> ApiResult<PathBuf> {
    if !IS_REGTEST || !path.is_absolute() {
        return Err(internal("The regtest app-data override is unavailable."));
    }
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| internal("The regtest app-data override is invalid."))?;
    let parent = path
        .parent()
        .ok_or_else(|| internal("The regtest app-data override is invalid."))?
        .canonicalize()
        .map_err(internal)?;
    #[cfg(unix)]
    let temporary_root = Path::new("/tmp").canonicalize().map_err(internal)?;
    #[cfg(not(unix))]
    let temporary_root = std::env::temp_dir().canonicalize().map_err(internal)?;
    if parent != temporary_root || !filename.starts_with("groot-regtest-") {
        return Err(internal(
            "The regtest app-data override must be a groot-regtest-* directory directly under the system temporary directory.",
        ));
    }
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(internal(
                "The regtest app-data override is not a regular directory.",
            ));
        }
    }
    Ok(path)
}

pub(crate) fn app_data_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    match std::env::var_os(REGTEST_APP_DATA_OVERRIDE) {
        Some(path) => validate_regtest_app_data_override(PathBuf::from(path)),
        None => app.path().app_data_dir().map_err(internal),
    }
}

fn registry_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app_data_dir(app)?.join("wallet-registry.json"))
}

fn wallets_root(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app_data_dir(app)?.join("wallets"))
}

fn descriptor_checksum(descriptor: &str) -> ApiResult<String> {
    descriptor
        .rsplit_once('#')
        .map(|(_, checksum)| checksum.to_owned())
        .filter(|checksum| checksum.len() == 8)
        .ok_or_else(|| internal("A canonical descriptor checksum is missing."))
}

fn load_registry(app: &AppHandle) -> ApiResult<WalletRegistry> {
    ensure_registry_migrated(app)?;
    let registry = registry::load(&registry_path(app)?).map_err(registry_api_error)?;
    ensure_registry_network(&registry)?;
    Ok(registry)
}

fn ensure_registry_network(registry: &WalletRegistry) -> ApiResult<()> {
    if registry
        .wallets
        .iter()
        .all(|wallet| wallet.network == NETWORK_NAME)
    {
        Ok(())
    } else {
        Err(api_error(
            "wrong_network",
            format!(
                "This wallet registry does not belong to the compiled {NETWORK_NAME} network. No wallet was opened."
            ),
        ))
    }
}

fn save_registry(app: &AppHandle, registry: &WalletRegistry) -> ApiResult<()> {
    registry::save_atomic(&registry_path(app)?, registry).map_err(registry_api_error)
}

fn profile_directory(app: &AppHandle, id: Uuid) -> ApiResult<PathBuf> {
    Ok(wallets_root(app)?.join(id.to_string()))
}

fn selected_profile(app: &AppHandle) -> ApiResult<WalletProfile> {
    let registry = load_registry(app)?;
    let selected = registry
        .selected_wallet_id
        .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))?;
    registry
        .wallets
        .into_iter()
        .find(|wallet| wallet.id == selected)
        .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))
}

fn selected_profile_of_kind(app: &AppHandle, expected: WalletKind) -> ApiResult<WalletProfile> {
    let profile = selected_profile(app)?;
    if profile.kind != expected {
        return Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not support this operation.",
        ));
    }
    Ok(profile)
}

fn wallet_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    if !matches!(profile.kind, WalletKind::SingleKey | WalletKind::WatchOnly) {
        return Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not support this operation.",
        ));
    }
    profile_directory(app, profile.id)
}

fn db_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(wallet_dir(app)?.join("wallet.sqlite"))
}

fn secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(wallet_dir(app)?.join("secret.json"))
}

fn external_signer_metadata_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile_of_kind(app, WalletKind::WatchOnly)?;
    Ok(profile_directory(app, profile.id)?.join("wallet.json"))
}

fn multisig_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile_of_kind(app, WalletKind::Multisig)?;
    profile_directory(app, profile.id)
}

fn multisig_metadata_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(multisig_dir(app)?.join("wallet.json"))
}

fn multisig_secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(multisig_dir(app)?.join("secret.json"))
}

fn multisig_db_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(multisig_dir(app)?.join("wallet.sqlite"))
}

fn profile_from_directory(
    app: &AppHandle,
    directory: &Path,
    id: Uuid,
    kind: WalletKind,
) -> ApiResult<WalletProfile> {
    let (name, checksum) = match kind {
        WalletKind::SingleKey => {
            let permit = database_open_permit_for_identity_inspection(app)?;
            let mut db = open_wallet_database(&directory.join("wallet.sqlite"), &permit)?;
            let wallet = load_wallet(&mut db)?;
            (
                "Primary wallet".to_owned(),
                descriptor_checksum(&wallet.public_descriptor(KeychainKind::External).to_string())?,
            )
        }
        WalletKind::Multisig => {
            let encoded = read_private_text(&directory.join("wallet.json"))?;
            let wallet: MultisigWalletDto = serde_json::from_str(&encoded).map_err(internal)?;
            (
                wallet.name,
                descriptor_checksum(&wallet.external_descriptor)?,
            )
        }
        WalletKind::WatchOnly => {
            let encoded = read_private_text(&directory.join("wallet.json"))?;
            let wallet: ExternalSignerWallet = serde_json::from_str(&encoded).map_err(internal)?;
            (
                wallet.name,
                descriptor_checksum(&wallet.external_descriptor)?,
            )
        }
    };
    Ok(WalletProfile {
        id,
        name,
        network: NETWORK_NAME.to_owned(),
        kind,
        descriptor_checksum: checksum,
        created_at: now(),
        backup_verified: true,
    })
}

fn ensure_registry_migrated(app: &AppHandle) -> ApiResult<()> {
    let app_data = app_data_dir(app)?;
    ensure_private_directory(&app_data)?;
    ensure_private_directory(&wallets_root(app)?)?;
    let path = registry_path(app)?;
    if path.exists() {
        let registry = registry::load(&path).map_err(registry_api_error)?;
        ensure_registry_network(&registry)?;
        return Ok(());
    }
    if !IS_REGTEST {
        return save_registry(app, &WalletRegistry::default());
    }
    let legacy = [
        (app_data.join("regtest-wallet"), WalletKind::SingleKey),
        (app_data.join("regtest-multisig"), WalletKind::Multisig),
    ];
    let mut registry = WalletRegistry::default();
    let mut moves = Vec::<(PathBuf, PathBuf)>::new();
    let mut legacy_identities = Vec::<(String, WalletProfile)>::new();
    for (legacy_directory, kind) in legacy {
        if !legacy_directory.exists() {
            continue;
        }
        let metadata = fs::symlink_metadata(&legacy_directory).map_err(internal)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(internal(
                "Legacy wallet storage is not a regular directory.",
            ));
        }
        let id = Uuid::new_v4();
        let profile = profile_from_directory(app, &legacy_directory, id, kind)?;
        let (external_descriptor, _) =
            descriptor_pair_from_directory(app, &legacy_directory, &profile)?;
        if let Some((_, existing)) = legacy_identities
            .iter()
            .find(|(existing_descriptor, _)| existing_descriptor == &external_descriptor)
        {
            return Err(wallet_already_exists(existing));
        }
        legacy_identities.push((external_descriptor, profile.clone()));
        registry.add(profile).map_err(registry_api_error)?;
        moves.push((legacy_directory, profile_directory(app, id)?));
    }
    migrate_directories_with_rollback(&moves, || save_registry(app, &registry))
}

fn ensure_private_directory(path: &Path) -> ApiResult<()> {
    fs::create_dir_all(path).map_err(internal)?;
    let metadata = fs::symlink_metadata(path).map_err(internal)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(internal("Private storage is not a regular directory."));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(internal)?;
    }
    Ok(())
}

fn migrate_directories_with_rollback(
    moves: &[(PathBuf, PathBuf)],
    commit: impl FnOnce() -> ApiResult<()>,
) -> ApiResult<()> {
    let mut completed = 0;
    for (source, destination) in moves {
        if let Err(error) = fs::rename(source, destination) {
            for (rollback_source, rollback_destination) in moves[..completed].iter().rev() {
                let _ = fs::rename(rollback_destination, rollback_source);
            }
            return Err(internal(error));
        }
        completed += 1;
    }
    if let Err(error) = commit() {
        for (source, destination) in moves[..completed].iter().rev() {
            let _ = fs::rename(destination, source);
        }
        return Err(error);
    }
    Ok(())
}

fn prepare_profile_directory(app: &AppHandle) -> ApiResult<(Uuid, PathBuf)> {
    ensure_registry_migrated(app)?;
    let id = Uuid::new_v4();
    let directory = profile_directory(app, id)?;
    ensure_private_directory(&wallets_root(app)?)?;
    ensure_private_directory(&directory)?;
    Ok((id, directory))
}

fn current_mainnet_node_admission(state: &AppState) -> ApiResult<PendingMainnetNodeAdmission> {
    let mut admission = state
        .pending_mainnet_node_admission
        .lock()
        .map_err(internal)?;
    if admission.as_ref().is_some_and(|record| {
        mainnet_node_admission_is_current_at(record.created_at, Instant::now())
    }) {
        return Ok(admission.as_ref().expect("checked admission").clone());
    }
    admission.take();
    Err(api_error(
        "node_admission_required",
        "Connect and verify an approved Bitcoin Core node before opening a mainnet wallet.",
    ))
}

fn mainnet_node_admission_is_current_at(created_at: Instant, now: Instant) -> bool {
    now.checked_duration_since(created_at)
        .is_some_and(|age| age <= MAINNET_NODE_ADMISSION_LIFETIME)
}

fn clear_mainnet_node_admission(state: &AppState) -> ApiResult<()> {
    state
        .pending_mainnet_node_admission
        .lock()
        .map_err(internal)?
        .take();
    Ok(())
}

fn database_admission_error(error: crate::release_policy::ReleasePolicyError) -> ApiError {
    match error {
        crate::release_policy::ReleasePolicyError::BackendAdmissionRequired => api_error(
            "node_admission_required",
            "Connect and verify an approved Bitcoin Core node before opening a mainnet wallet.",
        ),
        _ => internal("This build is not authorized to open a mainnet wallet database."),
    }
}

fn admission_allows_new_wallet(admission: &PendingMainnetNodeAdmission) -> bool {
    admission.scope == MainnetNodeAdmissionScope::NewWallet
}

fn admission_allows_selected_wallet(
    admission: &PendingMainnetNodeAdmission,
    selected_wallet: Uuid,
    saved_config: &CoreNodeConfig,
) -> bool {
    admission.scope == MainnetNodeAdmissionScope::ExistingWallet(selected_wallet)
        && admission.config == *saved_config
}

fn node_auth_session_allows_database_open(
    session: &NodeAuthSession,
    saved_config: &CoreNodeConfig,
) -> bool {
    session.config == *saved_config && session.mainnet_node_verified
}

fn database_open_permit_for_new_wallet(state: &AppState) -> ApiResult<DatabaseOpenPermit> {
    if NETWORK != Network::Bitcoin {
        return Ok(DatabaseOpenPermit {
            issued_at: Instant::now(),
        });
    }
    let admission = current_mainnet_node_admission(state)?;
    if !admission_allows_new_wallet(&admission) {
        return Err(api_error(
            "node_admission_required",
            "Verify the Bitcoin Core node specifically for new mainnet wallet creation.",
        ));
    }
    crate::release_policy::ensure_database_open_enabled(NETWORK, true)
        .map_err(database_admission_error)?;
    Ok(DatabaseOpenPermit {
        issued_at: Instant::now(),
    })
}

fn database_open_permit_for_selected_wallet(app: &AppHandle) -> ApiResult<DatabaseOpenPermit> {
    if NETWORK != Network::Bitcoin {
        return Ok(DatabaseOpenPermit {
            issued_at: Instant::now(),
        });
    }
    let state = app.state::<AppState>();
    let selected = selected_profile(app)?;
    let saved_config = read_node_config_for(app, selected.id)?;
    let pending_matches = current_mainnet_node_admission(&state).is_ok_and(|admission| {
        admission_allows_selected_wallet(&admission, selected.id, &saved_config)
    });
    let active_matches = state
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .is_unlocked(selected.id)
        && state
            .node_auth
            .lock()
            .map_err(internal)?
            .get(&selected.id)
            .is_some_and(|session| node_auth_session_allows_database_open(session, &saved_config));
    if !pending_matches && !active_matches {
        return Err(api_error(
            "node_admission_required",
            "Verify this wallet's saved Bitcoin Core connection before reading wallet data.",
        ));
    }
    crate::release_policy::ensure_database_open_enabled(NETWORK, true)
        .map_err(database_admission_error)?;
    Ok(DatabaseOpenPermit {
        issued_at: Instant::now(),
    })
}

fn database_open_permit_for_identity_inspection(app: &AppHandle) -> ApiResult<DatabaseOpenPermit> {
    if NETWORK == Network::Bitcoin {
        let state = app.state::<AppState>();
        let pending = current_mainnet_node_admission(&state).is_ok();
        let authenticated_wallets = state
            .node_auth
            .lock()
            .map_err(internal)?
            .keys()
            .copied()
            .collect::<Vec<_>>();
        let sessions = state.unlocked_wallets.lock().map_err(internal)?;
        let active = authenticated_wallets
            .iter()
            .any(|wallet_id| sessions.is_unlocked(*wallet_id));
        if !pending && !active {
            return Err(api_error(
                "node_admission_required",
                "Connect and verify an approved Bitcoin Core node before inspecting mainnet wallet identities.",
            ));
        }
    }
    crate::release_policy::ensure_database_open_enabled(NETWORK, NETWORK == Network::Bitcoin)
        .map_err(database_admission_error)?;
    Ok(DatabaseOpenPermit {
        issued_at: Instant::now(),
    })
}

fn validate_database_open_permit(permit: &DatabaseOpenPermit) -> ApiResult<()> {
    let current = NETWORK != Network::Bitcoin
        || permit.issued_at.elapsed() <= MAINNET_NODE_ADMISSION_LIFETIME;
    crate::release_policy::ensure_database_open_enabled(NETWORK, current)
        .map_err(database_admission_error)
}

fn authentication_database_open_permit() -> ApiResult<AuthenticationDatabaseOpenPermit> {
    crate::release_policy::ensure_runtime_network_enabled(NETWORK)
        .map_err(database_admission_error)?;
    Ok(AuthenticationDatabaseOpenPermit {
        issued_at: Instant::now(),
    })
}

fn validate_authentication_database_open_permit(
    permit: &AuthenticationDatabaseOpenPermit,
) -> ApiResult<()> {
    if permit.issued_at.elapsed() > MAINNET_NODE_ADMISSION_LIFETIME {
        return Err(internal("The authentication database permit expired."));
    }
    crate::release_policy::ensure_runtime_network_enabled(NETWORK).map_err(database_admission_error)
}

#[cfg(test)]
fn database_open_permit_for_test() -> DatabaseOpenPermit {
    DatabaseOpenPermit {
        issued_at: Instant::now(),
    }
}

fn open_wallet_database(path: &Path, permit: &DatabaseOpenPermit) -> ApiResult<Connection> {
    validate_database_open_permit(permit)?;
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(internal("Wallet database storage is not a regular file."));
        }
    }
    let db = Connection::open(path).map_err(internal)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(internal)?;
    }
    db.busy_timeout(Duration::from_secs(5)).map_err(internal)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
        .map_err(internal)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_FKEY, true)
        .map_err(internal)?;
    db.execute_batch("PRAGMA trusted_schema = OFF;")
        .map_err(internal)?;
    Ok(db)
}

fn open_authentication_database(
    path: &Path,
    permit: &AuthenticationDatabaseOpenPermit,
) -> ApiResult<AuthenticationDatabase> {
    validate_authentication_database_open_permit(permit)?;
    let metadata = fs::symlink_metadata(path).map_err(internal)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(internal("Wallet database storage is not a regular file."));
    }
    let db = Connection::open(path).map_err(internal)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(internal)?;
    }
    db.busy_timeout(Duration::from_secs(5)).map_err(internal)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
        .map_err(internal)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_FKEY, true)
        .map_err(internal)?;
    db.execute_batch("PRAGMA trusted_schema = OFF;")
        .map_err(internal)?;
    Ok(AuthenticationDatabase(db))
}

fn open_existing_wallet_database_read_only(
    path: &Path,
    permit: &DatabaseOpenPermit,
) -> ApiResult<Connection> {
    validate_database_open_permit(permit)?;
    let metadata = fs::symlink_metadata(path).map_err(internal)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(internal("Wallet database storage is not a regular file."));
    }
    let db =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(internal)?;
    db.busy_timeout(Duration::from_secs(5)).map_err(internal)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
        .map_err(internal)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_FKEY, true)
        .map_err(internal)?;
    db.execute_batch("PRAGMA trusted_schema = OFF;")
        .map_err(internal)?;
    Ok(db)
}

fn profile_descriptor_pair(
    app: &AppHandle,
    profile: &WalletProfile,
) -> ApiResult<(String, String)> {
    let directory = profile_directory(app, profile.id)?;
    descriptor_pair_from_directory(app, &directory, profile)
}

fn descriptor_pair_from_directory(
    app: &AppHandle,
    directory: &Path,
    profile: &WalletProfile,
) -> ApiResult<(String, String)> {
    let permit = database_open_permit_for_identity_inspection(app)?;
    let mut db =
        open_existing_wallet_database_read_only(&directory.join("wallet.sqlite"), &permit)?;
    let wallet = load_wallet(&mut db)?;
    let external = wallet.public_descriptor(KeychainKind::External).to_string();
    let internal_descriptor = wallet.public_descriptor(KeychainKind::Internal).to_string();
    let expected = match profile.kind {
        WalletKind::SingleKey => None,
        WalletKind::WatchOnly => {
            let encoded = read_private_text(&directory.join("wallet.json"))?;
            let metadata: ExternalSignerWallet =
                serde_json::from_str(&encoded).map_err(internal)?;
            metadata
                .signer
                .validate()
                .map_err(external_signer_api_error)?;
            let derived = external_signer::descriptors(&metadata.signer)
                .map_err(external_signer_api_error)?;
            if metadata.version != 1
                || metadata.external_descriptor != derived.0
                || metadata.internal_descriptor != derived.1
            {
                return Err(api_error(
                    "wallet_corrupt",
                    "External-signer metadata does not match its public wallet identity.",
                ));
            }
            Some((metadata.external_descriptor, metadata.internal_descriptor))
        }
        WalletKind::Multisig => {
            let encoded = read_private_text(&directory.join("wallet.json"))?;
            let metadata: MultisigWalletDto = serde_json::from_str(&encoded).map_err(internal)?;
            Some((metadata.external_descriptor, metadata.internal_descriptor))
        }
    };
    validate_loaded_descriptors(
        profile,
        &external,
        &internal_descriptor,
        expected
            .as_ref()
            .map(|(external, internal)| (external.as_str(), internal.as_str())),
    )?;
    Ok((external, internal_descriptor))
}

fn find_exact_descriptor_profile(
    app: &AppHandle,
    registry: &WalletRegistry,
    external_descriptor: &str,
) -> ApiResult<Option<WalletProfile>> {
    find_exact_descriptor_profile_with(registry, external_descriptor, |profile| {
        profile_descriptor_pair(app, profile).map(|(external, _)| external)
    })
}

fn find_exact_descriptor_profile_with(
    registry: &WalletRegistry,
    external_descriptor: &str,
    mut read_external_descriptor: impl FnMut(&WalletProfile) -> ApiResult<String>,
) -> ApiResult<Option<WalletProfile>> {
    descriptor_checksum(external_descriptor)?;
    let mut matched = None;
    for profile in registry
        .wallets
        .iter()
        .filter(|profile| profile.network == NETWORK_NAME)
    {
        let existing_external = read_external_descriptor(profile)?;
        if exact_descriptor_identity_matches(external_descriptor, &existing_external) {
            if matched.is_some() {
                return Err(api_error(
                    "wallet_corrupt",
                    "The wallet registry contains the same exact descriptor identity more than once.",
                ));
            }
            matched = Some(profile.clone());
        }
    }
    Ok(matched)
}

fn exact_descriptor_identity_matches(candidate_external: &str, existing_external: &str) -> bool {
    candidate_external == existing_external
}

fn commit_profile(
    app: &AppHandle,
    profile: WalletProfile,
    external_descriptor: &str,
) -> ApiResult<()> {
    let mut registry = load_registry(app)?;
    if let Some(existing) = find_exact_descriptor_profile(app, &registry, external_descriptor)? {
        return Err(wallet_already_exists(&existing));
    }
    registry.add(profile.clone()).map_err(registry_api_error)?;
    registry.select(profile.id).map_err(registry_api_error)?;
    save_registry(app, &registry)
}

fn commit_multisig_profile(app: &AppHandle, id: Uuid, wallet: &MultisigWalletDto) -> ApiResult<()> {
    commit_profile(
        app,
        WalletProfile {
            id,
            name: wallet.name.clone(),
            network: NETWORK_NAME.to_owned(),
            kind: WalletKind::Multisig,
            descriptor_checksum: descriptor_checksum(&wallet.external_descriptor)?,
            created_at: now(),
            backup_verified: true,
        },
        &wallet.external_descriptor,
    )
}

fn regtest_dir() -> ApiResult<PathBuf> {
    if let Some(path) = std::env::var_os("GROOT_REGTEST_DIR") {
        return Ok(PathBuf::from(path));
    }

    default_regtest_dir()
}

#[cfg(groot_network = "regtest")]
fn default_regtest_dir() -> ApiResult<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repository_root = manifest_dir.parent().ok_or_else(|| {
        api_error(
            "internal_error",
            "The Regtest repository directory could not be resolved.",
        )
    })?;
    Ok(repository_root.join(".regtest"))
}

#[cfg(not(groot_network = "regtest"))]
fn default_regtest_dir() -> ApiResult<PathBuf> {
    Err(api_error(
        "invalid_node_config",
        "Automatic cookie discovery is unavailable in this public-network build.",
    ))
}

fn node_config_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    node_config_path_for(app, profile.id)
}

fn node_config_path_for(app: &AppHandle, wallet_id: Uuid) -> ApiResult<PathBuf> {
    Ok(profile_directory(app, wallet_id)?.join("node.json"))
}

fn node_secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    node_secret_path_for(app, profile.id)
}

fn node_secret_path_for(app: &AppHandle, wallet_id: Uuid) -> ApiResult<PathBuf> {
    Ok(profile_directory(app, wallet_id)?.join("node-secret.json"))
}

fn sync_source_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    sync_source_path_for(app, profile.id)
}

fn sync_source_path_for(app: &AppHandle, wallet_id: Uuid) -> ApiResult<PathBuf> {
    Ok(profile_directory(app, wallet_id)?.join("sync-source.json"))
}

fn public_network_status_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    Ok(profile_directory(app, profile.id)?.join("network-status.json"))
}

fn read_public_network_status(app: &AppHandle) -> ApiResult<PublicNetworkStatusDto> {
    let path = public_network_status_path(app)?;
    if !path.exists() {
        return Ok(PublicNetworkStatusDto::default());
    }
    let status: PublicNetworkStatusDto =
        serde_json::from_str(&read_private_text(&path)?).map_err(internal)?;
    if status
        .priority_fee
        .is_some_and(|rate| !rate.is_finite() || rate <= 0.0)
    {
        return Err(internal("Saved public network status is invalid."));
    }
    Ok(status)
}

fn update_public_network_status(
    app: &AppHandle,
    priority_fee: Option<f64>,
    network_tip: Option<u64>,
) -> ApiResult<()> {
    let mut status = read_public_network_status(app)?;
    if let Some(priority_fee) = priority_fee {
        status.priority_fee = Some(priority_fee);
    }
    if let Some(network_tip) = network_tip {
        status.network_tip = Some(network_tip);
    }
    write_public_network_status(app, &status)
}

fn replace_public_network_status(
    app: &AppHandle,
    priority_fee: Option<f64>,
    network_tip: Option<u64>,
) -> ApiResult<()> {
    write_public_network_status(
        app,
        &PublicNetworkStatusDto {
            priority_fee,
            network_tip,
        },
    )
}

fn write_public_network_status(app: &AppHandle, status: &PublicNetworkStatusDto) -> ApiResult<()> {
    write_private_json(&public_network_status_path(app)?, status)
}

fn compact_filter_cache_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app_data_dir(app)?
        .join("compact-filters")
        .join(NETWORK_NAME))
}

fn default_node_config() -> CoreNodeConfig {
    CoreNodeConfig {
        backend: ChainBackend::LocalCore {
            url: DEFAULT_RPC_URL.to_owned(),
        },
        auth: if IS_REGTEST {
            RpcAuthMode::Cookie
        } else {
            RpcAuthMode::UserPass
        },
        username: None,
        tor_proxy: None,
    }
}

fn read_node_config(app: &AppHandle) -> ApiResult<CoreNodeConfig> {
    read_node_config_for(app, selected_profile(app)?.id)
}

fn read_node_config_for(app: &AppHandle, wallet_id: Uuid) -> ApiResult<CoreNodeConfig> {
    let path = node_config_path_for(app, wallet_id)?;
    if !path.exists() {
        return Ok(default_node_config());
    }
    let config: CoreNodeConfig =
        serde_json::from_str(&read_private_text(&path)?).map_err(internal)?;
    config.validate().map_err(network_config_api_error)?;
    Ok(config)
}

fn read_sync_source(app: &AppHandle) -> ApiResult<WalletSyncSource> {
    read_sync_source_for(app, selected_profile(app)?.id)
}

fn read_sync_source_for(app: &AppHandle, wallet_id: Uuid) -> ApiResult<WalletSyncSource> {
    let path = sync_source_path_for(app, wallet_id)?;
    if !path.exists() {
        return Ok(WalletSyncSource::BitcoinCore);
    }
    let source: WalletSyncSource =
        serde_json::from_str(&read_private_text(&path)?).map_err(internal)?;
    source.validate(NETWORK).map_err(network_config_api_error)?;
    Ok(source)
}

fn verify_selected_credential(app: &AppHandle, credential: &str) -> ApiResult<()> {
    match selected_profile(app)?.kind {
        WalletKind::SingleKey => decrypt_mnemonic(app, credential).map(|_| ()),
        WalletKind::Multisig => verify_multisig_credential(app, credential),
        WalletKind::WatchOnly => verify_external_signer_credential(app, credential),
    }
}

fn build_rpc_client(url: &str, auth: Auth, tor_proxy: Option<&str>) -> ApiResult<Client> {
    build_rpc_client_with_timeout(url, auth, tor_proxy, RPC_TIMEOUT)
}

fn build_rpc_client_with_timeout(
    url: &str,
    auth: Auth,
    tor_proxy: Option<&str>,
    timeout: Duration,
) -> ApiResult<Client> {
    let (username, password) = auth.get_user_pass().map_err(|_| rpc_unavailable())?;
    build_rpc_client_with_credentials(
        url,
        username.as_deref(),
        password.as_deref(),
        tor_proxy,
        timeout,
    )
}

fn build_rpc_client_with_credentials(
    url: &str,
    username: Option<&str>,
    password: Option<&str>,
    tor_proxy: Option<&str>,
    timeout: Duration,
) -> ApiResult<Client> {
    if let Some(proxy) = tor_proxy {
        let endpoint = url::Url::parse(url).map_err(network_config_api_error_from_url)?;
        let proxy = proxy
            .parse::<std::net::SocketAddr>()
            .map_err(|_| network_config_api_error(NetworkConfigError::InvalidProxy))?;
        let transport = crate::tor_rpc::TorRpcTransport::new(
            &endpoint,
            username.unwrap_or_default(),
            password.unwrap_or_default(),
            proxy,
            timeout,
        )
        .map_err(|_| rpc_unavailable())?;
        Ok(Client::from_jsonrpc(jsonrpc::Client::with_transport(
            transport,
        )))
    } else {
        let transport =
            crate::direct_rpc::DirectRpcTransport::new(url, username, password, timeout);
        Ok(Client::from_jsonrpc(jsonrpc::Client::with_transport(
            transport,
        )))
    }
}

fn load_node_auth_session(
    app: &AppHandle,
    state: &State<'_, AppState>,
    credential: &str,
) -> ApiResult<()> {
    let has_saved_config = node_config_path(app)?.exists();
    let config = read_node_config(app)?;
    let profile = selected_profile(app)?;
    let session = if config.auth == RpcAuthMode::UserPass {
        let path = node_secret_path(app)?;
        if !saved_userpass_config_has_required_secret(has_saved_config, path.exists())? {
            state
                .node_auth
                .lock()
                .map_err(internal)?
                .remove(&profile.id);
            return Ok(());
        }
        let plaintext = secure_store::load(&path, credential).map_err(secure_store_error)?;
        let Some(mut protected) = decode_protected_node_auth(&plaintext, &config)? else {
            state
                .node_auth
                .lock()
                .map_err(internal)?
                .remove(&profile.id);
            return Ok(());
        };
        let password = Zeroizing::new(std::mem::take(&mut protected.password));
        if password.is_empty() || password.len() > 1024 {
            return Err(api_error(
                "wallet_corrupt",
                "Protected RPC credentials are invalid.",
            ));
        }
        Some(NodeAuthSession {
            config,
            password,
            mainnet_node_verified: false,
        })
    } else {
        None
    };
    let mut sessions = state.node_auth.lock().map_err(internal)?;
    if let Some(session) = session {
        sessions.insert(profile.id, session);
    } else {
        sessions.remove(&profile.id);
    }
    Ok(())
}

fn saved_userpass_config_has_required_secret(
    has_saved_config: bool,
    secret_exists: bool,
) -> ApiResult<bool> {
    if secret_exists {
        Ok(true)
    } else if has_saved_config {
        Err(api_error(
            "wallet_corrupt",
            "The saved Bitcoin Core credentials are missing. Reconnect this wallet to Bitcoin Core.",
        ))
    } else {
        Ok(false)
    }
}

fn rpc_client(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<Client> {
    let config = read_node_config(app)?;
    validate_first_mainnet_rpc_endpoint(&config.backend)?;
    let url = config
        .validate()
        .map_err(network_config_api_error)?
        .to_string();
    let client = match config.auth {
        RpcAuthMode::Cookie => {
            if !IS_REGTEST {
                return Err(api_error(
                    "invalid_node_config",
                    "Automatic cookie discovery is available only in Regtest builds. Configure explicit protected RPC credentials for this public-network rehearsal.",
                ));
            }
            let cookie = regtest_dir()?.join("regtest").join(".cookie");
            if !cookie.exists() {
                return Err(api_error(
                    "network_unavailable",
                    "Groot cannot find the Regtest authentication cookie. Confirm the configured Regtest data directory and that Bitcoin Core is running.",
                ));
            }
            build_rpc_client(&url, Auth::CookieFile(cookie), config.tor_proxy.as_deref())
        }
        RpcAuthMode::UserPass => {
            let selected = selected_profile(app)?.id;
            let sessions = state.node_auth.lock().map_err(internal)?;
            let session = sessions.get(&selected).ok_or_else(|| {
                api_error(
                    "wallet_locked",
                    "Unlock the wallet again to load its protected RPC credentials.",
                )
            })?;
            if session.config != config {
                return Err(api_error(
                    "invalid_node_config",
                    "The Bitcoin Core connection changed after unlock. Review and save it again before connecting.",
                ));
            }
            build_rpc_client_with_credentials(
                &url,
                session.config.username.as_deref(),
                Some(session.password.as_str()),
                config.tor_proxy.as_deref(),
                RPC_TIMEOUT,
            )
        }
    }?;
    validate_first_mainnet_rpc_backend(&client, &config.backend)?;
    Ok(client)
}

fn candidate_rpc_client(config: &CoreNodeConfig, password: &str) -> ApiResult<Client> {
    validate_first_mainnet_rpc_endpoint(&config.backend)?;
    let url = config
        .validate()
        .map_err(network_config_api_error)?
        .to_string();
    let client = match config.auth {
        RpcAuthMode::Cookie => {
            if !IS_REGTEST {
                return Err(api_error(
                    "invalid_node_config",
                    "Automatic cookie discovery is available only in Regtest builds. Configure explicit protected RPC credentials for this public-network rehearsal.",
                ));
            }
            let cookie = regtest_dir()?.join("regtest").join(".cookie");
            if !cookie.exists() {
                return Err(api_error(
                    "network_unavailable",
                    "Groot cannot find the Regtest authentication cookie. Confirm the configured Regtest data directory and that Bitcoin Core is running.",
                ));
            }
            build_rpc_client(&url, Auth::CookieFile(cookie), config.tor_proxy.as_deref())
        }
        RpcAuthMode::UserPass => build_rpc_client_with_credentials(
            &url,
            config.username.as_deref(),
            Some(password),
            config.tor_proxy.as_deref(),
            RPC_TIMEOUT,
        ),
    }?;
    validate_first_mainnet_rpc_backend(&client, &config.backend)?;
    Ok(client)
}

fn validate_first_mainnet_rpc_endpoint(backend: &ChainBackend) -> ApiResult<()> {
    if NETWORK != Network::Bitcoin {
        return Ok(());
    }
    crate::release_policy::validate_first_mainnet_backend_endpoint(backend).map_err(|_| {
        api_error(
            "invalid_node_config",
            "Mainnet requires either loopback Bitcoin Core or a trusted remote HTTPS Core endpoint.",
        )
    })
}

fn validate_first_mainnet_rpc_backend(client: &Client, backend: &ChainBackend) -> ApiResult<()> {
    if NETWORK != Network::Bitcoin {
        return Ok(());
    }
    let observed_genesis = client.get_block_hash(0).map_err(rpc_api_error)?;
    crate::release_policy::validate_first_mainnet_backend(backend, observed_genesis).map_err(|_| {
        api_error(
            "invalid_node_config",
            "Mainnet requires an admitted Bitcoin Core endpoint on the exact Bitcoin genesis chain.",
        )
    })
}

fn checked_chain_identity(client: &Client) -> ApiResult<(u64, BlockHash)> {
    let (info, observed_genesis) = checked_core_chain(client)?;
    Ok((info.blocks, observed_genesis))
}

fn checked_core_chain(client: &Client) -> ApiResult<(GetBlockchainInfoResult, BlockHash)> {
    let info = get_blockchain_info(client).map_err(rpc_api_error)?;
    ensure_expected_network(info.chain)?;
    let observed_genesis = client.get_block_hash(0).map_err(rpc_api_error)?;
    ensure_expected_genesis(NETWORK, observed_genesis)?;
    Ok((info, observed_genesis))
}

fn checked_block_height(client: &Client) -> ApiResult<u64> {
    checked_chain_identity(client).map(|(height, _)| height)
}

fn ensure_core_ready_for_wallet_history(
    node_height: u64,
    initial_block_download: bool,
    last_verified_height: u32,
) -> ApiResult<()> {
    if initial_block_download || node_height < u64::from(last_verified_height) {
        return Err(api_error(
            "node_syncing",
            "Bitcoin Core is still syncing and has not reached this wallet's last verified block. Wait for Core to finish syncing, then try again.",
        ));
    }
    Ok(())
}

fn ensure_core_history_available(
    pruned: bool,
    prune_height: Option<u64>,
    first_required_height: u32,
) -> ApiResult<()> {
    if pruned && prune_height.is_some_and(|height| u64::from(first_required_height) < height) {
        return Err(api_error_with_details(
            "node_history_unavailable",
            "Bitcoin Core no longer stores the blocks needed for this scan. Use a birthday at or above the retained block height, or connect an archival node.",
            ApiErrorDetails {
                required_block: Some(first_required_height),
                earliest_retained_block: prune_height.and_then(|height| u32::try_from(height).ok()),
                ..Default::default()
            },
        ));
    }
    Ok(())
}

fn recovery_scan_anchor_height(birthday_height: u32) -> u32 {
    birthday_height.saturating_sub(1)
}

fn ensure_recovery_scan_history_available(
    pruned: bool,
    prune_height: Option<u64>,
    birthday_height: u32,
) -> ApiResult<()> {
    let anchor_height = recovery_scan_anchor_height(birthday_height);
    if pruned && prune_height.is_some_and(|height| u64::from(anchor_height) < height) {
        return Err(api_error_with_details(
            "node_history_unavailable",
            RPC_PRUNED_HISTORY_MESSAGE,
            ApiErrorDetails {
                requested_birthday_block: Some(birthday_height),
                required_block: Some(anchor_height),
                earliest_retained_block: prune_height.and_then(|height| u32::try_from(height).ok()),
                minimum_birthday_block: prune_height
                    .and_then(|height| u32::try_from(height).ok())
                    .and_then(|height| height.checked_add(1)),
            },
        ));
    }
    Ok(())
}

fn recovery_scan_checkpoint(
    client: &Client,
    genesis: BlockHash,
    birthday_height: u32,
) -> ApiResult<CheckPoint> {
    let anchor_height = recovery_scan_anchor_height(birthday_height);
    let genesis_checkpoint = CheckPoint::new(BlockId {
        height: 0,
        hash: genesis,
    });
    if anchor_height == 0 {
        return Ok(genesis_checkpoint);
    }
    let anchor_hash = retry_transient_core_rpc(
        || client.get_block_hash(u64::from(anchor_height)),
        std::thread::sleep,
    )?;
    genesis_checkpoint
        .push(BlockId {
            height: anchor_height,
            hash: anchor_hash,
        })
        .map_err(|_| internal("The recovery scan checkpoint could not be constructed."))
}

fn rewind_stale_core_checkpoints(
    client: &Client,
    wallet: &Wallet,
) -> ApiResult<(CheckPoint, bool)> {
    let original_tip = wallet.latest_checkpoint().height();
    let mut agreement = None;
    for checkpoint in wallet.latest_checkpoint().iter() {
        match client.get_block_info(&checkpoint.hash()) {
            Ok(block) if block.confirmations >= 0 => {
                agreement = Some(checkpoint);
                break;
            }
            Ok(_) => {}
            Err(error) if error.is_not_found_error() => {}
            Err(error) => return Err(rpc_api_error(error)),
        }
    }
    let agreement = agreement.ok_or_else(|| {
        api_error(
            "wrong_network",
            "The Bitcoin Core chain does not share Groot's verified genesis checkpoint.",
        )
    })?;
    let rewound = agreement.height() < original_tip;
    Ok((agreement, rewound))
}

fn retry_transient_node_health<T>(
    mut operation: impl FnMut() -> ApiResult<T>,
    mut pause: impl FnMut(Duration),
) -> ApiResult<T> {
    for attempt in 0..NODE_HEALTH_ATTEMPTS {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error)
                if error.code == "network_unavailable" && attempt + 1 < NODE_HEALTH_ATTEMPTS =>
            {
                pause(NODE_HEALTH_RETRY_DELAY);
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("node health attempts are non-zero")
}

fn retry_transient_core_rpc<T>(
    mut operation: impl FnMut() -> Result<T, CoreRpcError>,
    mut pause: impl FnMut(Duration),
) -> ApiResult<T> {
    for attempt in 0..NODE_HEALTH_ATTEMPTS {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) => {
                let error = rpc_api_error(error);
                if error.code == "network_unavailable" && attempt + 1 < NODE_HEALTH_ATTEMPTS {
                    pause(NODE_HEALTH_RETRY_DELAY);
                    continue;
                }
                return Err(error);
            }
        }
    }
    unreachable!("Core RPC attempts are non-zero")
}

fn checked_node_status_once(client: &Client, backend: CoreNodeConfig) -> ApiResult<NodeStatusDto> {
    let info = get_blockchain_info(client).map_err(rpc_api_error)?;
    ensure_expected_network(info.chain)?;
    let observed_genesis = client.get_block_hash(0).map_err(rpc_api_error)?;
    ensure_expected_genesis(NETWORK, observed_genesis)?;
    let block_filter_index = match client.get_index_info() {
        Ok(indexes) => indexes
            .basic_block_filter_index
            .map_or(
                "disabled",
                |index| {
                    if index.synced {
                        "synced"
                    } else {
                        "building"
                    }
                },
            ),
        Err(_) => "unknown",
    };
    Ok(NodeStatusDto {
        connected: true,
        blocks: info.blocks,
        backend,
        pruned: info.pruned,
        prune_height: info.prune_height,
        initial_block_download: info.initial_block_download,
        size_on_disk: info.size_on_disk,
        block_filter_index,
    })
}

fn checked_node_status(client: &Client, backend: CoreNodeConfig) -> ApiResult<NodeStatusDto> {
    retry_transient_node_health(
        || checked_node_status_once(client, backend.clone()),
        std::thread::sleep,
    )
}

fn ensure_expected_network(network: Network) -> ApiResult<()> {
    if network == NETWORK {
        Ok(())
    } else {
        Err(api_error(
            "wrong_network",
            format!("The Bitcoin Core node is not running {NETWORK_NAME}."),
        ))
    }
}

fn ensure_expected_genesis(network: Network, observed: BlockHash) -> ApiResult<()> {
    if observed == genesis_block(network).block_hash() {
        Ok(())
    } else {
        Err(api_error(
            "wrong_network",
            "The Bitcoin Core genesis block does not match the selected network.",
        ))
    }
}

fn broadcast_transaction(
    app: &AppHandle,
    state: &State<'_, AppState>,
    transaction: &Transaction,
) -> ApiResult<Txid> {
    let rpc = rpc_client(app, state)?;
    checked_chain_identity(&rpc)?;
    broadcast_transaction_with_rpc(&rpc, transaction)
}

fn broadcast_transaction_with_rpc(rpc: &Client, transaction: &Transaction) -> ApiResult<Txid> {
    let expected = transaction.compute_txid();
    match rpc.send_raw_transaction(transaction) {
        Ok(txid) if txid == expected => Ok(txid),
        Ok(_) => Err(internal(
            "Bitcoin Core returned a transaction ID that did not match the signed transaction.",
        )),
        Err(_) => {
            let in_mempool = rpc.get_mempool_entry(&expected).is_ok();
            let confirmed_in_active_chain = rpc
                .get_raw_transaction_info(&expected, None)
                .is_ok_and(|transaction| {
                    transaction.confirmations.unwrap_or_default() > 0
                        && transaction.in_active_chain.unwrap_or(true)
                });
            if in_mempool || confirmed_in_active_chain {
                Ok(expected)
            } else {
                Err(api_error(
                    "broadcast_failed",
                    "Bitcoin Core did not accept the transaction. The reviewed payment remains saved and can be retried safely.",
                ))
            }
        }
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn normalize_label_text(label: &str) -> String {
    label.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_label(label: &str) -> ApiResult<String> {
    let label = normalize_label_text(label);
    if label.is_empty() {
        return Err(api_error("invalid_label", "A permanent label is required."));
    }
    if label.chars().count() > 48 {
        return Err(api_error(
            "invalid_label",
            "The permanent label must be 48 characters or fewer.",
        ));
    }
    Ok(label)
}

// Explicit receive and payment drafts stay intentionally compact. Existing persisted and
// provenance-derived records may still expose more labels and remain fully readable.
const MAX_PERMANENT_LABELS: usize = 5;

fn normalize_labels(labels: Vec<String>) -> ApiResult<Vec<String>> {
    if labels.is_empty() || labels.len() > MAX_PERMANENT_LABELS {
        return Err(api_error(
            "invalid_label",
            format!("Choose between 1 and {MAX_PERMANENT_LABELS} permanent labels."),
        ));
    }
    let mut normalized = Vec::with_capacity(labels.len());
    let mut seen = HashSet::with_capacity(labels.len());
    for label in labels {
        let label = normalize_label(&label)?;
        let reuse_guard = label.to_lowercase();
        if !seen.insert(reuse_guard) {
            return Err(api_error(
                "invalid_label",
                "Each permanent label can be selected only once.",
            ));
        }
        normalized.push(label);
    }
    Ok(normalized)
}

fn validate_credential(credential: &str) -> ApiResult<()> {
    if credential.is_empty() {
        return Err(api_error(
            "invalid_credential",
            "A passphrase / PIN is required.",
        ));
    }
    if credential.len() > MAX_CREDENTIAL_BYTES {
        return Err(api_error(
            "invalid_credential",
            "The passphrase / PIN is too long.",
        ));
    }
    Ok(())
}

fn validate_wallet_passphrase(passphrase: &str) -> ApiResult<()> {
    if passphrase.is_empty() {
        return Err(api_error(
            "invalid_credential",
            "A wallet passphrase is required.",
        ));
    }
    if passphrase.len() > MAX_CREDENTIAL_BYTES {
        return Err(api_error(
            "invalid_credential",
            "The wallet passphrase is too long.",
        ));
    }
    Ok(())
}

fn validate_new_wallet_passphrase(passphrase: &str) -> ApiResult<()> {
    validate_wallet_passphrase(passphrase)?;
    if passphrase.chars().count() < MIN_NEW_WALLET_PASSPHRASE_CHARACTERS {
        return Err(api_error(
            "invalid_credential",
            "New wallet passphrases must contain at least 16 characters.",
        ));
    }
    Ok(())
}

fn init_app_schema(db: &Connection) -> ApiResult<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS groot_addresses (
            idx INTEGER PRIMARY KEY,
            address TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('awaiting', 'used', 'discarded')),
            observed INTEGER NOT NULL DEFAULT 0 CHECK(observed IN (0, 1))
        );
        CREATE TABLE IF NOT EXISTS groot_address_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address_idx INTEGER NOT NULL REFERENCES groot_addresses(idx),
            signer_fingerprint TEXT NOT NULL CHECK(length(signer_fingerprint) = 8),
            device_type TEXT NOT NULL,
            displayed_address TEXT NOT NULL,
            verified_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS groot_address_verifications_address_time
            ON groot_address_verifications(address_idx, verified_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS groot_signer_policy_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signer_fingerprint TEXT NOT NULL CHECK(length(signer_fingerprint) = 8),
            device_type TEXT NOT NULL,
            scope TEXT NOT NULL CHECK(scope = 'policy_and_address'),
            displayed_address TEXT NOT NULL,
            verified_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS groot_signer_policy_verifications_signer_time
            ON groot_signer_policy_verifications(signer_fingerprint, verified_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS groot_signer_policy_acknowledgements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signer_fingerprint TEXT NOT NULL CHECK(length(signer_fingerprint) = 8),
            device_type TEXT NOT NULL CHECK(device_type = 'coldcard'),
            scope TEXT NOT NULL CHECK(scope = 'policy_file_acknowledgement'),
            acknowledged_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS groot_signer_policy_acknowledgements_signer_time
            ON groot_signer_policy_acknowledgements(signer_fingerprint, acknowledged_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS groot_hardware_health_checks (
            signer_fingerprint TEXT PRIMARY KEY CHECK(length(signer_fingerprint) = 8),
            status TEXT NOT NULL CHECK(status IN ('healthy', 'attention')),
            checked_at TEXT NOT NULL,
            summary TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_proposals (
            proposal_id TEXT PRIMARY KEY,
            recipient TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT 'Sent payment',
            amount INTEGER NOT NULL,
            fee INTEGER NOT NULL,
            fee_rate REAL NOT NULL,
            psbt TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('collecting', 'ready', 'broadcast', 'cancelled')),
            created_at INTEGER NOT NULL,
            txid TEXT,
            selection_strategy TEXT NOT NULL DEFAULT 'balanced',
            fee_difference_vs_private INTEGER
        );
        CREATE TABLE IF NOT EXISTS groot_proposal_spend_paths (
            proposal_id TEXT PRIMARY KEY REFERENCES groot_proposals(proposal_id) ON DELETE CASCADE,
            spend_path TEXT NOT NULL CHECK(spend_path IN ('primary', 'delayed'))
        );
        CREATE TABLE IF NOT EXISTS groot_frozen_coins (
            outpoint TEXT PRIMARY KEY,
            frozen_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_auth_throttle (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            failures INTEGER NOT NULL CHECK(failures >= 0),
            retry_at INTEGER NOT NULL CHECK(retry_at >= 0)
        );
        CREATE TABLE IF NOT EXISTS groot_recovery_settings (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            birthday_height INTEGER NOT NULL CHECK(birthday_height >= 0),
            gap_limit INTEGER NOT NULL CHECK(gap_limit BETWEEN 20 AND 1000)
        );
        CREATE TABLE IF NOT EXISTS groot_accelerations (
            proposal_id TEXT PRIMARY KEY REFERENCES groot_proposals(proposal_id) ON DELETE CASCADE,
            method TEXT NOT NULL CHECK(method IN ('rbf', 'cpfp')),
            original_txid TEXT NOT NULL,
            replacement_txid TEXT UNIQUE,
            original_kind TEXT NOT NULL CHECK(original_kind IN ('payment', 'self_spend')),
            original_direction TEXT NOT NULL CHECK(original_direction IN ('received', 'sent')),
            original_amount INTEGER NOT NULL,
            original_fee INTEGER,
            original_date TEXT NOT NULL,
            original_address TEXT,
            original_label TEXT NOT NULL,
            original_fee_rate REAL,
            minimum_fee_rate REAL,
            target_fee_rate REAL,
            recommendation_source TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_recovery_scans (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            run_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('running', 'cancelling', 'cancelled', 'completed', 'interrupted', 'failed')),
            birthday_height INTEGER NOT NULL CHECK(birthday_height >= 0),
            gap_limit INTEGER NOT NULL CHECK(gap_limit BETWEEN 20 AND 1000),
            current_height INTEGER NOT NULL CHECK(current_height >= 0),
            target_height INTEGER NOT NULL CHECK(target_height >= 0),
            processed_blocks INTEGER NOT NULL CHECK(processed_blocks >= 0),
            total_blocks INTEGER NOT NULL CHECK(total_blocks >= 0),
            started_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_chain_observation (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            height INTEGER NOT NULL CHECK(height >= 0),
            observed_at INTEGER NOT NULL CHECK(observed_at >= 0)
        );",
    )
    .map_err(internal)?;
    for (column, definition) in [
        ("original_fee_rate", "REAL"),
        ("minimum_fee_rate", "REAL"),
        ("target_fee_rate", "REAL"),
        ("recommendation_source", "TEXT"),
    ] {
        let exists = db
            .prepare("PRAGMA table_info(groot_accelerations)")
            .map_err(internal)?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(internal)?
            .iter()
            .any(|name| name == column);
        if !exists {
            db.execute(
                &format!("ALTER TABLE groot_accelerations ADD COLUMN {column} {definition}"),
                [],
            )
            .map_err(internal)?;
        }
    }
    let has_proposal_label = db
        .prepare("PRAGMA table_info(groot_proposals)")
        .map_err(internal)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?
        .iter()
        .any(|column| column == "label");
    if !has_proposal_label {
        db.execute(
            "ALTER TABLE groot_proposals ADD COLUMN label TEXT NOT NULL DEFAULT 'Sent payment'",
            [],
        )
        .map_err(internal)?;
    }
    let has_selection_strategy = db
        .prepare("PRAGMA table_info(groot_proposals)")
        .map_err(internal)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?
        .iter()
        .any(|column| column == "selection_strategy");
    if !has_selection_strategy {
        db.execute(
            "ALTER TABLE groot_proposals ADD COLUMN selection_strategy TEXT NOT NULL DEFAULT 'balanced'",
            [],
        )
        .map_err(internal)?;
    }
    let has_fee_difference_vs_private = db
        .prepare("PRAGMA table_info(groot_proposals)")
        .map_err(internal)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?
        .iter()
        .any(|column| column == "fee_difference_vs_private");
    if !has_fee_difference_vs_private {
        db.execute(
            "ALTER TABLE groot_proposals ADD COLUMN fee_difference_vs_private INTEGER",
            [],
        )
        .map_err(internal)?;
    }
    label_provenance::init_schema(db).map_err(internal)?;
    reconcile_active_acceleration_proposals(db)?;
    notifications::init(db).map_err(internal)
}

fn frozen_outpoints(db: &Connection) -> ApiResult<Vec<OutPoint>> {
    let mut statement = db
        .prepare("SELECT outpoint FROM groot_frozen_coins")
        .map_err(internal)?;
    let outpoints = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(internal)?
        .map(|value| {
            value
                .map_err(internal)
                .and_then(|value| OutPoint::from_str(&value).map_err(internal))
        })
        .collect();
    outpoints
}

fn check_auth_throttle(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<()> {
    let selected = selected_profile(app)?.id;
    let monotonic_now = Instant::now();
    let mut runtime = state.runtime_auth_retry_at.lock().map_err(internal)?;
    if let Some(retry_at) = runtime.get(&selected).copied() {
        if monotonic_now < retry_at {
            let remaining = retry_at.duration_since(monotonic_now).as_secs().max(1);
            return Err(api_error(
                "rate_limited",
                format!("Too many incorrect attempts. Try again in {remaining} seconds."),
            ));
        }
        runtime.remove(&selected);
    }
    drop(runtime);
    let db = open_auth_db(app)?;
    let throttle = load_auth_throttle(&db)?;
    if let Err(remaining) = throttle.check(now()) {
        return Err(api_error(
            "rate_limited",
            format!(
                "Too many incorrect attempts. Try again in {} seconds.",
                remaining.as_secs()
            ),
        ));
    }
    Ok(())
}

fn record_auth_result<T>(
    app: &AppHandle,
    state: &State<'_, AppState>,
    result: &ApiResult<T>,
) -> ApiResult<()> {
    let selected = selected_profile(app)?.id;
    let mut db = open_auth_db(app)?;
    let mut throttle = load_auth_throttle(&db)?;
    match result {
        Ok(_) => {
            throttle.succeeded();
            state
                .runtime_auth_retry_at
                .lock()
                .map_err(internal)?
                .remove(&selected);
        }
        Err(error) if error.code == "invalid_credential" => {
            let delay = throttle.failed(now());
            if !delay.is_zero() {
                if let Some(retry_at) = Instant::now().checked_add(delay) {
                    state
                        .runtime_auth_retry_at
                        .lock()
                        .map_err(internal)?
                        .insert(selected, retry_at);
                }
            }
        }
        Err(_) => {}
    }
    save_auth_throttle(&mut db, &throttle)
}

fn reset_auth_throttle(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<()> {
    let selected = selected_profile(app)?.id;
    let mut db = open_auth_db(app)?;
    let mut throttle = AuthThrottle::default();
    throttle.succeeded();
    save_auth_throttle(&mut db, &throttle)?;
    state
        .runtime_auth_retry_at
        .lock()
        .map_err(internal)?
        .remove(&selected);
    Ok(())
}

fn open_auth_db(app: &AppHandle) -> ApiResult<AuthenticationDatabase> {
    let profile = selected_profile(app)?;
    let path = profile_directory(app, profile.id)?.join("wallet.sqlite");
    if !path.is_file() {
        return Err(api_error(
            "wallet_not_found",
            "The selected wallet database could not be found.",
        ));
    }
    let permit = authentication_database_open_permit()?;
    let db = open_authentication_database(&path, &permit)?;
    db.0.execute_batch(
        "CREATE TABLE IF NOT EXISTS groot_auth_throttle (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            failures INTEGER NOT NULL CHECK(failures >= 0),
            retry_at INTEGER NOT NULL CHECK(retry_at >= 0)
        );",
    )
    .map_err(internal)?;
    Ok(db)
}

fn load_auth_throttle(db: &AuthenticationDatabase) -> ApiResult<AuthThrottle> {
    let persisted =
        db.0.query_row(
            "SELECT failures, retry_at FROM groot_auth_throttle WHERE singleton = 1",
            [],
            |row| Ok((row.get::<_, u32>(0)?, row.get::<_, u64>(1)?)),
        )
        .optional()
        .map_err(internal)?;
    Ok(persisted
        .map(|(failures, retry_at)| AuthThrottle::restore(failures, retry_at))
        .unwrap_or_default())
}

fn save_auth_throttle(db: &mut AuthenticationDatabase, throttle: &AuthThrottle) -> ApiResult<()> {
    let (failures, retry_at) = throttle.snapshot();
    db.0
        .execute(
        "INSERT INTO groot_auth_throttle(singleton, failures, retry_at) VALUES(1, ?1, ?2)\
         ON CONFLICT(singleton) DO UPDATE SET failures = excluded.failures, retry_at = excluded.retry_at",
        params![failures, retry_at],
        )
        .map_err(internal)?;
    Ok(())
}

fn open_db(app: &AppHandle) -> ApiResult<Connection> {
    let path = db_path(app)?;
    if !path.exists() {
        return Err(api_error(
            "wallet_not_found",
            "No wallet exists on this device.",
        ));
    }
    let permit = database_open_permit_for_selected_wallet(app)?;
    let mut db = open_wallet_database(&path, &permit)?;
    init_app_schema(&db)?;
    compact_persisted_checkpoints(&mut db)?;
    validate_selected_wallet_database_identity(app, &mut db, WalletKind::SingleKey)?;
    Ok(db)
}

fn open_multisig_db(app: &AppHandle) -> ApiResult<Connection> {
    let path = multisig_db_path(app)?;
    if !path.exists() {
        return Err(api_error(
            "wallet_not_found",
            "No multisig wallet exists on this device.",
        ));
    }
    let permit = database_open_permit_for_selected_wallet(app)?;
    let mut db = open_wallet_database(&path, &permit)?;
    init_app_schema(&db)?;
    compact_persisted_checkpoints(&mut db)?;
    validate_selected_wallet_database_identity(app, &mut db, WalletKind::Multisig)?;
    Ok(db)
}

fn compact_persisted_checkpoints(db: &mut Connection) -> ApiResult<()> {
    let (count, tip): (u32, Option<u32>) = db
        .query_row(
            "SELECT COUNT(*), MAX(block_height) FROM bdk_blocks",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(internal)?;
    if count <= CHECKPOINT_COMPACTION_THRESHOLD {
        return Ok(());
    }
    let Some(tip) = tip else {
        return Ok(());
    };
    let keep_from = tip.saturating_sub(RECENT_CHECKPOINT_WINDOW.saturating_sub(1));
    let transaction = db.transaction().map_err(internal)?;
    transaction
        .execute(
            "DELETE FROM bdk_blocks
             WHERE block_height < ?1
               AND (block_height % ?2) != 0
               AND NOT EXISTS (
                   SELECT 1 FROM bdk_anchors
                   WHERE bdk_anchors.block_height = bdk_blocks.block_height
               )",
            params![keep_from, PERIODIC_CHECKPOINT_INTERVAL],
        )
        .map_err(internal)?;
    transaction.commit().map_err(internal)
}

fn validate_selected_wallet_database_identity(
    app: &AppHandle,
    db: &mut Connection,
    ordinary_kind: WalletKind,
) -> ApiResult<()> {
    let profile = selected_profile(app)?;
    let expected_kind = if ordinary_kind == WalletKind::SingleKey {
        match profile.kind {
            WalletKind::SingleKey | WalletKind::WatchOnly => profile.kind.clone(),
            _ => ordinary_kind,
        }
    } else {
        ordinary_kind
    };
    if profile.kind != expected_kind {
        return Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not support this operation.",
        ));
    }
    let wallet = load_wallet(db)?;
    let external = wallet.public_descriptor(KeychainKind::External).to_string();
    let internal_descriptor = wallet.public_descriptor(KeychainKind::Internal).to_string();
    let expected_descriptors = match profile.kind {
        WalletKind::WatchOnly => {
            let metadata = read_external_signer_metadata(app)?;
            Some((metadata.external_descriptor, metadata.internal_descriptor))
        }
        WalletKind::Multisig => {
            let metadata = read_multisig_metadata(app)?;
            Some((metadata.external_descriptor, metadata.internal_descriptor))
        }
        WalletKind::SingleKey => None,
    };
    let authenticated_software_descriptors = if profile.kind == WalletKind::SingleKey {
        let state = app.state::<AppState>();
        let descriptors = state
            .authenticated_software_descriptors
            .lock()
            .map_err(internal)?;
        Some(descriptors.get(&profile.id).cloned().ok_or_else(|| {
            api_error(
                "wallet_locked",
                "Unlock the wallet before opening its authenticated descriptors.",
            )
        })?)
    } else {
        None
    };
    validate_loaded_descriptors(
        &profile,
        &external,
        &internal_descriptor,
        authenticated_software_descriptors
            .as_ref()
            .or(expected_descriptors.as_ref())
            .map(|(external, internal)| (external.as_str(), internal.as_str())),
    )
}

fn validate_loaded_descriptors(
    profile: &WalletProfile,
    external: &str,
    internal_descriptor: &str,
    expected_descriptors: Option<(&str, &str)>,
) -> ApiResult<()> {
    if descriptor_checksum(external)? != profile.descriptor_checksum {
        return Err(api_error(
            "wallet_corrupt",
            "The wallet database does not match the registered wallet identity.",
        ));
    }
    if expected_descriptors.is_some_and(|(expected_external, expected_internal)| {
        external != expected_external || internal_descriptor != expected_internal
    }) {
        return Err(api_error(
            "wallet_corrupt",
            "The wallet database descriptors do not match the authenticated wallet identity.",
        ));
    }
    Ok(())
}

fn load_wallet(db: &mut Connection) -> ApiResult<PersistedWallet<Connection>> {
    let gap_limit = load_recovery_scan_settings(db)?.gap_limit;
    Wallet::load()
        .check_network(NETWORK)
        .lookahead(gap_limit)
        .load_wallet(db)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_not_found", "Wallet database is empty."))
}

fn load_wallet_transaction<'db>(
    db: &mut SqliteTransaction<'db>,
) -> ApiResult<PersistedWallet<SqliteTransaction<'db>>> {
    let gap_limit = load_recovery_scan_settings(db)?.gap_limit;
    Wallet::load()
        .check_network(NETWORK)
        .lookahead(gap_limit)
        .load_wallet(db)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_not_found", "Wallet database is empty."))
}

fn root_key(mnemonic: &Mnemonic, credential: &str) -> ApiResult<Xpriv> {
    let seed = Zeroizing::new(mnemonic.to_seed(credential));
    Xpriv::new_master(PARAMETERS.extended_key_network, seed.as_ref()).map_err(internal)
}

fn watch_templates(
    mnemonic: &Mnemonic,
    credential: &str,
) -> ApiResult<(Bip84Public<Xpub>, Bip84Public<Xpub>)> {
    let master = root_key(mnemonic, credential)?;
    let secp = Secp256k1::new();
    let fingerprint = master.fingerprint(&secp);
    let account_path = DerivationPath::from_str(SINGLESIG_ACCOUNT_PATH).map_err(internal)?;
    let account_private = master.derive_priv(&secp, &account_path).map_err(internal)?;
    let account_public = Xpub::from_priv(&secp, &account_private);
    Ok((
        Bip84Public(account_public, fingerprint, KeychainKind::External),
        Bip84Public(account_public, fingerprint, KeychainKind::Internal),
    ))
}

fn software_wallet_descriptors(
    mnemonic: &Mnemonic,
    credential: &str,
) -> ApiResult<(String, String)> {
    let (external, internal_template) = watch_templates(mnemonic, credential)?;
    let wallet = Wallet::create(external, internal_template)
        .network(NETWORK)
        .create_wallet_no_persist()
        .map_err(internal)?;
    Ok((
        wallet.public_descriptor(KeychainKind::External).to_string(),
        wallet.public_descriptor(KeychainKind::Internal).to_string(),
    ))
}

#[cfg(test)]
fn encrypt_payload(payload: &[u8], credential: &str) -> ApiResult<EncryptedSecret> {
    let mut salt = [0_u8; 16];
    let mut nonce = [0_u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    let mut key = [0_u8; 32];
    Argon2::default()
        .hash_password_into(credential.as_bytes(), &salt, key.as_mut())
        .map_err(internal)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(internal)?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), payload)
        .map_err(|_| internal("Unable to encrypt wallet secret."))?;
    key.zeroize();
    Ok(EncryptedSecret {
        version: 1,
        salt: BASE64.encode(salt),
        nonce: BASE64.encode(nonce),
        ciphertext: BASE64.encode(ciphertext),
    })
}

#[cfg(test)]
fn encrypt_mnemonic(mnemonic: &Mnemonic, credential: &str) -> ApiResult<EncryptedSecret> {
    let words = Zeroizing::new(mnemonic.to_string());
    encrypt_payload(words.as_bytes(), credential)
}

fn decrypt_payload(secret: EncryptedSecret, credential: &str) -> ApiResult<Zeroizing<Vec<u8>>> {
    if secret.version != 1 {
        return Err(internal("Unsupported encrypted secret version."));
    }
    let salt = BASE64.decode(secret.salt).map_err(internal)?;
    let nonce = BASE64.decode(secret.nonce).map_err(internal)?;
    if salt.len() != 16 || nonce.len() != 12 {
        return Err(internal("The encrypted wallet secret is malformed."));
    }
    let ciphertext = BASE64.decode(secret.ciphertext).map_err(internal)?;
    let mut key = Zeroizing::new([0_u8; 32]);
    Argon2::default()
        .hash_password_into(credential.as_bytes(), &salt, key.as_mut())
        .map_err(internal)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(internal)?;
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| api_error("invalid_credential", "Incorrect passphrase / PIN."))?,
    );
    Ok(plaintext)
}

fn decrypt_mnemonic(app: &AppHandle, credential: &str) -> ApiResult<Mnemonic> {
    validate_credential(credential)?;
    let path = secret_path(app)?;
    let encoded = read_private_text(&path).map_err(|_| {
        api_error(
            "wallet_not_found",
            "The encrypted wallet secret could not be found.",
        )
    })?;
    let version = serde_json::from_str::<serde_json::Value>(&encoded)
        .ok()
        .and_then(|value| value.get("version").and_then(|version| version.as_u64()));
    if matches!(version, Some(2 | 3)) {
        let plaintext = secure_store::load(&path, credential).map_err(secure_store_error)?;
        return parse_mnemonic_bytes(plaintext);
    }
    let secret: EncryptedSecret = serde_json::from_str(&encoded).map_err(internal)?;
    let mnemonic = decrypt_encrypted_mnemonic(secret, credential)?;
    let words = Zeroizing::new(mnemonic.to_string());
    persist_secret_material(&path, words.as_bytes(), credential)?;
    Ok(mnemonic)
}

fn decrypt_encrypted_mnemonic(secret: EncryptedSecret, credential: &str) -> ApiResult<Mnemonic> {
    parse_mnemonic_bytes(decrypt_payload(secret, credential)?)
}

fn parse_mnemonic_bytes(plaintext: Zeroizing<Vec<u8>>) -> ApiResult<Mnemonic> {
    let words = std::str::from_utf8(&plaintext).map_err(internal)?;
    Mnemonic::parse(words).map_err(internal)
}

#[tauri::command]
pub fn ur_encode_psbt(psbt: String, fragment_bytes: usize) -> ApiResult<Vec<String>> {
    ur_transport::encode_psbt(&psbt, fragment_bytes).map_err(ur_api_error)
}

#[tauri::command]
pub fn ur_decode_psbt(frames: Vec<String>) -> ApiResult<String> {
    ur_transport::decode_psbt(&frames).map_err(ur_api_error)
}

fn reject_virtual_cosigners(cosigners: &[CosignerInput]) -> ApiResult<()> {
    if cosigners
        .iter()
        .any(|cosigner| cosigner.source == CosignerSource::Virtual)
    {
        return Err(api_error(
            "hardware_unavailable",
            "Virtual signers are available only in the browser prototype.",
        ));
    }
    Ok(())
}

fn read_multisig_metadata(app: &AppHandle) -> ApiResult<MultisigWalletDto> {
    let encoded = read_private_text(&multisig_metadata_path(app)?).map_err(|_| {
        api_error(
            "wallet_not_found",
            "No multisig wallet exists on this device.",
        )
    })?;
    let wallet: MultisigWalletDto = serde_json::from_str(&encoded).map_err(internal)?;
    let profile = selected_profile_of_kind(app, WalletKind::Multisig)?;
    if descriptor_checksum(&wallet.external_descriptor)? != profile.descriptor_checksum {
        return Err(api_error(
            "wallet_corrupt",
            "The multisig wallet metadata does not match the registered wallet identity.",
        ));
    }
    Ok(wallet)
}

fn read_external_signer_metadata(app: &AppHandle) -> ApiResult<ExternalSignerWallet> {
    let encoded = read_private_text(&external_signer_metadata_path(app)?).map_err(|_| {
        api_error(
            "wallet_not_found",
            "No external-signer wallet exists on this device.",
        )
    })?;
    let wallet: ExternalSignerWallet = serde_json::from_str(&encoded).map_err(internal)?;
    wallet
        .signer
        .validate()
        .map_err(external_signer_api_error)?;
    let (external, internal_descriptor) =
        external_signer::descriptors(&wallet.signer).map_err(external_signer_api_error)?;
    let profile = selected_profile_of_kind(app, WalletKind::WatchOnly)?;
    if wallet.version != 1
        || external != wallet.external_descriptor
        || internal_descriptor != wallet.internal_descriptor
        || descriptor_checksum(&external)? != profile.descriptor_checksum
    {
        return Err(api_error(
            "wallet_corrupt",
            "External-signer metadata does not match the registered wallet identity.",
        ));
    }
    Ok(wallet)
}

fn verify_external_signer_credential(app: &AppHandle, credential: &str) -> ApiResult<()> {
    validate_credential(credential)?;
    let metadata = read_external_signer_metadata(app)?;
    let mut plaintext =
        secure_store::load(&secret_path(app)?, credential).map_err(secure_store_error)?;
    let expected = format!("groot-external-signer:{}", metadata.external_descriptor);
    let matches = plaintext.as_slice() == expected.as_bytes();
    plaintext.zeroize();
    if matches {
        Ok(())
    } else {
        Err(api_error("invalid_credential", "Incorrect app PIN."))
    }
}

fn recovery_policy_type(template: &RecoveryTemplate) -> &'static str {
    match template {
        RecoveryTemplate::Recovery { .. } => "recovery",
        RecoveryTemplate::Decaying { .. } => "decaying",
        RecoveryTemplate::Expanding { .. } => "expanding",
    }
}

fn verified_recovery_policy_type(
    template: &RecoveryTemplate,
    paths: &[crate::recovery::TimedSpendingPath],
) -> &'static str {
    if matches!(template, RecoveryTemplate::Recovery { .. })
        && paths
            .iter()
            .any(|path| path.available_after_blocks == 52_560)
    {
        "inheritance"
    } else {
        recovery_policy_type(template)
    }
}

fn hwi_supports_multisig_policy(policy_type: &str) -> bool {
    policy_type.is_empty() || policy_type == "standard"
}

fn hardware_policy_unsupported() -> ApiError {
    api_error(
        "hardware_policy_unsupported",
        "USB hardware signing and address display are not available for this delayed Miniscript policy with Groot's pinned HWI release. Use the offline PSBT workflow.",
    )
}

fn require_hwi_supported_multisig_policy(wallet: &MultisigWalletDto) -> ApiResult<()> {
    if hwi_supports_multisig_policy(&wallet.policy_type) && wallet.recovery_template.is_none() {
        Ok(())
    } else {
        Err(hardware_policy_unsupported())
    }
}

fn reject_usb_cosigners_for_delayed_policy(cosigners: &[CosignerInput]) -> ApiResult<()> {
    if cosigners
        .iter()
        .any(|cosigner| cosigner.source == CosignerSource::Usb)
    {
        Err(hardware_policy_unsupported())
    } else {
        Ok(())
    }
}

fn delayed_policy_context(wallet: &MultisigWalletDto) -> ApiResult<Option<DelayedPolicyContext>> {
    let Some(template @ RecoveryTemplate::Recovery { .. }) = wallet.recovery_template.as_ref()
    else {
        return Ok(None);
    };
    let analysis = analyze_template(template, &wallet.cosigners).map_err(recovery_api_error)?;
    if analysis.external_descriptor != wallet.external_descriptor
        || analysis.internal_descriptor != wallet.internal_descriptor
        || analysis.paths != wallet.spending_paths
        || analysis.paths.len() != 2
        || analysis.paths[0].available_after_blocks != 0
        || analysis.paths[1].available_after_blocks == 0
    {
        return Err(api_error(
            "wallet_corrupt",
            "The delayed-policy metadata does not match the wallet descriptors.",
        ));
    }
    let delay_blocks = analysis.paths[1].available_after_blocks;
    let policy_type = match wallet.policy_type.as_str() {
        "inheritance" if delay_blocks == 52_560 => "inheritance",
        "inheritance" => {
            return Err(api_error(
                "wallet_corrupt",
                "The legacy inheritance policy does not match its verified block delay.",
            ))
        }
        "recovery" => "recovery",
        "" if delay_blocks == 52_560 => "inheritance",
        "" => "recovery",
        _ => {
            return Err(api_error(
                "wallet_corrupt",
                "The delayed-policy type is not supported.",
            ))
        }
    };
    Ok(Some(DelayedPolicyContext {
        policy_type: policy_type.to_owned(),
        delay_blocks,
    }))
}

fn selected_delayed_policy_context(app: &AppHandle) -> ApiResult<Option<DelayedPolicyContext>> {
    delayed_policy_context(&read_multisig_metadata(app)?)
}

fn validate_multisig_backup(encoded: &str) -> ApiResult<MultisigBackupDto> {
    if encoded.len() > 256 * 1024 {
        return Err(api_error(
            "backup_too_large",
            "The descriptor backup is too large.",
        ));
    }
    let mut backup: MultisigBackupDto = serde_json::from_str(encoded)
        .map_err(|_| api_error("invalid_backup", "Enter a valid Groot descriptor backup."))?;
    if backup.version != 1 || backup.network != NETWORK_NAME || backup.wallet.kind != "multisig" {
        return Err(api_error(
            "invalid_backup",
            "This backup version or network is not supported.",
        ));
    }
    let policy = PolicyInput {
        name: backup.wallet.name.clone(),
        threshold: backup.wallet.threshold,
        cosigners: backup.wallet.cosigners.clone(),
    };
    reject_virtual_cosigners(&policy.cosigners)?;
    let (expected_external, expected_internal, expected_policy_type, expected_paths) =
        if let Some(template) = &backup.wallet.recovery_template {
            let analysis =
                analyze_template(template, &backup.wallet.cosigners).map_err(recovery_api_error)?;
            (
                analysis.external_descriptor,
                analysis.internal_descriptor,
                verified_recovery_policy_type(template, &analysis.paths),
                analysis.paths,
            )
        } else {
            let preview = policy.preview().map_err(policy_api_error)?;
            (
                preview.external_descriptor,
                preview.internal_descriptor,
                "standard",
                Vec::new(),
            )
        };
    if expected_external != backup.wallet.external_descriptor
        || expected_internal != backup.wallet.internal_descriptor
    {
        return Err(api_error(
            "backup_mismatch",
            "The descriptors do not match the included signer policy.",
        ));
    }
    let expected_threshold = expected_paths
        .first()
        .map(|path| path.threshold)
        .unwrap_or(backup.wallet.threshold);
    if backup.wallet.policy_type != expected_policy_type
        || backup.wallet.spending_paths != expected_paths
        || backup.wallet.threshold != expected_threshold
    {
        return Err(api_error(
            "backup_mismatch",
            "The displayed policy metadata does not match the verified descriptors.",
        ));
    }
    backup.wallet.policy_type = expected_policy_type.to_owned();
    backup.wallet.spending_paths = expected_paths;
    backup.wallet.threshold = expected_threshold;
    for encoded_descriptor in [
        &backup.wallet.external_descriptor,
        &backup.wallet.internal_descriptor,
    ] {
        let descriptor = Descriptor::<DescriptorPublicKey>::from_str(encoded_descriptor)
            .map_err(|_| api_error("invalid_backup", "A backup descriptor is invalid."))?;
        descriptor.sanity_check().map_err(|_| {
            api_error(
                "invalid_backup",
                "A backup descriptor failed its safety checks.",
            )
        })?;
        if descriptor.to_string() != *encoded_descriptor || encoded_descriptor.contains("prv") {
            return Err(api_error(
                "invalid_backup",
                "Descriptors must be checksummed, canonical, and public-only.",
            ));
        }
    }
    Ok(backup)
}

fn first_multisig_address(wallet: &MultisigWalletDto) -> ApiResult<String> {
    let mut derived = Wallet::create(
        wallet.external_descriptor.clone(),
        wallet.internal_descriptor.clone(),
    )
    .network(NETWORK)
    .create_wallet_no_persist()
    .map_err(internal)?;
    Ok(derived
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string())
}

fn multisig_fingerprints(
    wallet: &MultisigWalletDto,
) -> ApiResult<Vec<bdk_wallet::bitcoin::bip32::Fingerprint>> {
    wallet
        .cosigners
        .iter()
        .map(|key| key.fingerprint.parse().map_err(internal))
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProposalSpendPath {
    Primary,
    Delayed,
}

impl ProposalSpendPath {
    fn as_str(self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::Delayed => "delayed",
        }
    }
}

#[derive(Debug, Clone)]
struct ProposalSigningContext {
    spend_path: ProposalSpendPath,
    fingerprints: Vec<Fingerprint>,
    fingerprint_strings: Vec<String>,
    required: usize,
}

fn signer_fingerprints_for_ids(
    metadata: &MultisigWalletDto,
    signer_ids: &[String],
) -> ApiResult<(Vec<Fingerprint>, Vec<String>)> {
    let mut fingerprints = Vec::with_capacity(signer_ids.len());
    let mut fingerprint_strings = Vec::with_capacity(signer_ids.len());
    for signer_id in signer_ids {
        let signer = metadata
            .cosigners
            .iter()
            .find(|signer| signer.id == *signer_id)
            .ok_or_else(|| {
                api_error(
                    "wallet_corrupt",
                    "The wallet spending path references an unknown signer.",
                )
            })?;
        let fingerprint = Fingerprint::from_str(signer.fingerprint.trim()).map_err(internal)?;
        fingerprints.push(fingerprint);
        fingerprint_strings.push(fingerprint.to_string());
    }
    Ok((fingerprints, fingerprint_strings))
}

fn proposal_signing_context(
    db: &Connection,
    metadata: &MultisigWalletDto,
    proposal_id: &str,
) -> ApiResult<ProposalSigningContext> {
    let stored = db
        .query_row(
            "SELECT spend_path FROM groot_proposal_spend_paths WHERE proposal_id = ?1",
            params![proposal_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(internal)?;
    let spend_path = match stored.as_deref() {
        None | Some("primary") => ProposalSpendPath::Primary,
        Some("delayed") => ProposalSpendPath::Delayed,
        Some(_) => {
            return Err(api_error(
                "wallet_corrupt",
                "The saved proposal spending path is invalid.",
            ))
        }
    };

    let Some(RecoveryTemplate::Recovery {
        immediate,
        recovery,
    }) = metadata.recovery_template.as_ref()
    else {
        if spend_path == ProposalSpendPath::Delayed {
            return Err(api_error(
                "wallet_corrupt",
                "A delayed proposal is not valid for this wallet.",
            ));
        }
        let fingerprints = multisig_fingerprints(metadata)?;
        return Ok(ProposalSigningContext {
            spend_path,
            fingerprint_strings: fingerprints.iter().map(ToString::to_string).collect(),
            fingerprints,
            required: metadata.threshold,
        });
    };

    delayed_policy_context(metadata)?.ok_or_else(|| {
        api_error(
            "wallet_corrupt",
            "The delayed wallet policy could not be verified.",
        )
    })?;
    let (required, signer_ids) = match spend_path {
        ProposalSpendPath::Primary => (immediate.threshold, immediate.signer_ids.as_slice()),
        ProposalSpendPath::Delayed => (recovery.threshold, recovery.signer_ids.as_slice()),
    };
    let (fingerprints, fingerprint_strings) = signer_fingerprints_for_ids(metadata, signer_ids)?;
    if required == 0 || required > fingerprints.len() {
        return Err(api_error(
            "wallet_corrupt",
            "The wallet spending path has an invalid signature threshold.",
        ));
    }
    Ok(ProposalSigningContext {
        spend_path,
        fingerprints,
        fingerprint_strings,
        required,
    })
}

fn add_multisig_global_xpubs(psbt: &mut Psbt, metadata: &MultisigWalletDto) -> ApiResult<()> {
    for cosigner in &metadata.cosigners {
        let xpub = Xpub::from_str(cosigner.xpub.trim()).map_err(internal)?;
        let fingerprint = Fingerprint::from_str(cosigner.fingerprint.trim()).map_err(internal)?;
        let derivation_path =
            DerivationPath::from_str(cosigner.derivation_path.trim()).map_err(internal)?;
        match psbt.xpub.get(&xpub) {
            Some(existing) if existing != &(fingerprint, derivation_path.clone()) => {
                return Err(api_error(
                    "proposal_mismatch",
                    "The PSBT global public-key origin conflicts with the saved wallet policy.",
                ));
            }
            Some(_) => {}
            None => {
                psbt.xpub.insert(xpub, (fingerprint, derivation_path));
            }
        }
    }
    Ok(())
}

fn verify_multisig_credential(app: &AppHandle, credential: &str) -> ApiResult<()> {
    validate_credential(credential)?;
    let path = multisig_secret_path(app)?;
    let encoded = read_private_text(&path).map_err(|_| {
        api_error(
            "wallet_not_found",
            "The multisig PIN verifier could not be found.",
        )
    })?;
    let version = serde_json::from_str::<serde_json::Value>(&encoded)
        .ok()
        .and_then(|value| value.get("version").and_then(|version| version.as_u64()));
    let mut plaintext = if matches!(version, Some(2 | 3)) {
        secure_store::load(&path, credential).map_err(secure_store_error)?
    } else {
        let secret: EncryptedSecret = serde_json::from_str(&encoded).map_err(internal)?;
        let plaintext = decrypt_payload(secret, credential)?;
        secure_store::store(&path, &plaintext, credential).map_err(secure_store_error)?;
        plaintext
    };
    let metadata = read_multisig_metadata(app)?;
    let expected = format!("groot-multisig:{}", metadata.external_descriptor);
    let matches = plaintext.as_slice() == expected.as_bytes();
    plaintext.zeroize();
    if matches {
        Ok(())
    } else {
        Err(api_error("invalid_credential", "Incorrect app PIN."))
    }
}

/// Re-authenticates a credential-bearing multisig operation independently of the
/// idle UI session. A correct PIN is sufficient authorization and refreshes the
/// selected wallet session; an expired session must not mask credential errors.
fn authorize_multisig_operation(
    app: &AppHandle,
    state: &State<'_, AppState>,
    credential: &str,
) -> ApiResult<()> {
    check_auth_throttle(app, state)?;
    let verified = verify_multisig_credential(app, credential);
    record_auth_result(app, state, &verified)?;
    verified?;
    unlock_selected(app, state)
}

type StoredProposalRow = (
    String,
    String,
    String,
    u64,
    u64,
    f64,
    String,
    String,
    u64,
    String,
    Option<i64>,
);

fn proposal_dto(
    row: StoredProposalRow,
    metadata: &MultisigWalletDto,
    wallet: &Wallet,
    db: &Connection,
) -> ApiResult<MultisigProposalDto> {
    let (
        proposal_id,
        recipient,
        label,
        amount,
        fee,
        _fee_rate,
        encoded,
        status,
        created_at,
        strategy,
        fee_difference_vs_private,
    ) = row;
    let psbt = decode_psbt(&encoded).map_err(proposal_api_error)?;
    validate_proposal_fee(&psbt, fee)?;
    let signing = proposal_signing_context(db, metadata, &proposal_id)?;
    let progress = signature_progress(&psbt, &signing.fingerprints, signing.required)
        .map_err(proposal_api_error)?;
    let (change, change_addresses) = proposal_change_details(wallet, &psbt, &recipient, amount)?;
    let (recipient_is_wallet_owned, recipient_derivation_paths) =
        proposal_recipient_wallet_details(wallet, &psbt, &recipient, amount)?;
    let wallet_controlled_output_amount =
        proposal_wallet_controlled_output_amount(wallet, &psbt, recipient_is_wallet_owned)?;
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(&psbt, &change_addresses)?;
    let (inputs, fee_rate, locktime, rbf) = proposal_transaction_details(wallet, &psbt, fee)?;
    let selection_impact =
        selection_impact(db, wallet, &psbt, &strategy, fee_difference_vs_private)?;
    let labels = label_provenance::labels_for_subject(db, "transaction_intent", &proposal_id)
        .map_err(internal)?
        .into_iter()
        .map(|label| label.text)
        .collect();
    let acceleration = load_acceleration_review(db, &proposal_id, fee, fee_rate)?;
    Ok(MultisigProposalDto {
        proposal_id,
        recipient,
        recipient_testnet_alias,
        recipient_is_wallet_owned,
        wallet_controlled_output_amount,
        recipient_derivation_paths,
        label,
        labels,
        amount,
        fee,
        fee_rate,
        total: checked_payment_total(amount, fee)?,
        change,
        change_addresses,
        change_testnet_aliases,
        change_derivation_paths,
        output_count: psbt.unsigned_tx.output.len(),
        selected_outpoints: psbt
            .unsigned_tx
            .input
            .iter()
            .map(|input| input.previous_output.to_string())
            .collect(),
        inputs,
        locktime,
        rbf,
        network: NETWORK_NAME,
        psbt: encoded,
        signed: progress.signed,
        required: progress.required,
        can_finalize: progress.can_finalize,
        signed_fingerprints: progress.signed_fingerprints,
        spend_path: signing.spend_path.as_str().to_owned(),
        eligible_signer_fingerprints: signing.fingerprint_strings,
        status,
        created_at: created_at.to_string(),
        selection_impact,
        acceleration,
    })
}

fn selection_impact(
    db: &Connection,
    wallet: &Wallet,
    psbt: &Psbt,
    strategy: &str,
    fee_difference_vs_private: Option<i64>,
) -> ApiResult<SelectionImpactDto> {
    let outpoints = psbt
        .unsigned_tx
        .input
        .iter()
        .map(|input| input.previous_output.to_string())
        .collect::<Vec<_>>();
    let summary = label_provenance::funding_summary(db, &outpoints).map_err(internal)?;
    let estimated_input_weight =
        psbt.unsigned_tx
            .input
            .iter()
            .enumerate()
            .try_fold(Weight::ZERO, |total, (index, _)| {
                let output = psbt.get_utxo_for(index).ok_or_else(|| {
                    api_error(
                        "proposal_mismatch",
                        "A proposal input is missing its authenticated previous output.",
                    )
                })?;
                let (keychain, _) = wallet
                    .derivation_of_spk(output.script_pubkey.clone())
                    .ok_or_else(|| {
                        api_error(
                            "proposal_mismatch",
                            "A proposal input is not controlled by this wallet.",
                        )
                    })?;
                let satisfaction = wallet
                    .public_descriptor(keychain)
                    .max_weight_to_satisfy()
                    .map_err(internal)?;
                total
                    .checked_add(TxIn::default().segwit_weight())
                    .and_then(|weight| weight.checked_add(satisfaction))
                    .ok_or_else(|| internal("Proposal input weight overflowed."))
            })?;
    Ok(SelectionImpactDto {
        strategy: strategy.to_owned(),
        selected_input_count: outpoints.len(),
        estimated_input_weight: estimated_input_weight.to_wu(),
        funding_labels: summary.labels,
        provenance_state: summary.state,
        existing_cluster_count: summary.cluster_count,
        new_cluster_links: summary.cluster_count.saturating_sub(1),
        has_unknown_provenance: matches!(summary.state, ProvenanceState::Unknown),
        has_address_reuse: summary.address_reused,
        fee_difference_vs_private,
    })
}

fn manual_selection_preview(
    db: &Connection,
    wallet: &Wallet,
    values: &[String],
    amount: u64,
) -> ApiResult<CoinSelectionPreviewDto> {
    let frozen = frozen_outpoints(db)?;
    let selected = validate_manual_outpoints(values, &frozen)?;
    let mut selected_amount = 0_u64;
    let mut estimated_input_weight = Weight::ZERO;
    for outpoint in &selected {
        let output = wallet.get_utxo(*outpoint).ok_or_else(|| {
            api_error(
                "coin_unavailable",
                "A selected coin is not available in this wallet.",
            )
        })?;
        selected_amount = selected_amount
            .checked_add(output.txout.value.to_sat())
            .ok_or_else(|| internal("Selected coin amount overflowed."))?;
        let satisfaction = wallet
            .public_descriptor(output.keychain)
            .max_weight_to_satisfy()
            .map_err(internal)?;
        estimated_input_weight = estimated_input_weight
            .checked_add(TxIn::default().segwit_weight())
            .and_then(|weight| weight.checked_add(satisfaction))
            .ok_or_else(|| internal("Selected input weight overflowed."))?;
    }
    let selected_strings = selected.iter().map(ToString::to_string).collect::<Vec<_>>();
    let summary = label_provenance::funding_summary(db, &selected_strings).map_err(internal)?;
    let privacy = label_provenance::coin_privacy_map(db).map_err(internal)?;
    let frozen = frozen.into_iter().collect::<std::collections::HashSet<_>>();
    let mut group_amounts = std::collections::HashMap::<String, u64>::new();
    for output in wallet
        .list_unspent()
        .filter(|output| !frozen.contains(&output.outpoint))
    {
        let metadata = privacy.get(&output.outpoint.to_string());
        if let Some(metadata) = metadata {
            if metadata.cluster_ids.len() == 1 && !metadata.unknown {
                let cluster = metadata.cluster_ids.iter().next().expect("one cluster");
                let total = group_amounts.entry(cluster.clone()).or_default();
                *total = total
                    .checked_add(output.txout.value.to_sat())
                    .ok_or_else(|| internal("Privacy group amount overflowed."))?;
            }
        }
    }
    Ok(CoinSelectionPreviewDto {
        selected_amount,
        selected_input_count: selected.len(),
        estimated_input_weight: estimated_input_weight.to_wu(),
        funding_labels: summary.labels,
        provenance_state: summary.state,
        existing_cluster_count: summary.cluster_count,
        new_cluster_links: summary.cluster_count.saturating_sub(1),
        has_unknown_provenance: matches!(summary.state, ProvenanceState::Unknown),
        has_address_reuse: summary.address_reused,
        one_existing_group_can_fund: group_amounts.values().any(|value| *value >= amount),
    })
}

fn load_multisig_proposal(
    db: &mut Connection,
    metadata: &MultisigWalletDto,
    proposal_id: &str,
) -> ApiResult<MultisigProposalDto> {
    let wallet = load_wallet(db)?;
    let row = db.query_row(
        "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy, fee_difference_vs_private FROM groot_proposals WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?)),
    ).map_err(|_| api_error("proposal_not_found", "Payment proposal was not found or is no longer active."))?;
    proposal_dto(row, metadata, &wallet, db)
}

fn persist_proposal(
    db: &Connection,
    proposal: &PaymentProposalDto,
    psbt: &Psbt,
    _inherit_payment_intent: bool,
) -> ApiResult<()> {
    let created_at = now();
    db.execute(
        "INSERT INTO groot_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy, fee_difference_vs_private) VALUES (?1,?2,?3,?4,?5,?6,?7,'collecting',?8,?9,?10)",
        params![
            proposal.proposal_id,
            proposal.recipient,
            proposal.label,
            proposal.amount,
            proposal.fee,
            proposal.fee_rate,
            encode_psbt(psbt),
            created_at,
            proposal.selection_impact.strategy,
            proposal.selection_impact.fee_difference_vs_private
        ],
    )
    .map_err(internal)?;
    label_provenance::assign_labels(
        db,
        &proposal.labels,
        LabelOrigin::Payment,
        "transaction_intent",
        &proposal.proposal_id,
        created_at,
    )
    .map(|_| ())
    .map_err(internal)
}

fn persist_acceleration(
    db: &Connection,
    proposal: &PaymentProposalDto,
    method: AccelerationMethod,
    original: &TransactionDto,
) -> ApiResult<()> {
    let review = proposal.acceleration.as_ref();
    db.execute(
        "INSERT INTO groot_accelerations (
            proposal_id, method, original_txid, original_kind, original_direction,
            original_amount, original_fee, original_date, original_address, original_label,
            original_fee_rate, minimum_fee_rate, target_fee_rate, recommendation_source, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            proposal.proposal_id,
            method.as_str(),
            original.id,
            original.kind,
            original.direction,
            original.amount,
            original.fee,
            original.date,
            original.address,
            original.label,
            review.map(|value| value.original_fee_rate),
            review.map(|value| value.minimum_fee_rate),
            review.map(|value| value.target_fee_rate),
            review.map(|value| value.recommendation_source.as_str()),
            now(),
        ],
    )
    .map(|_| ())
    .map_err(internal)
}

fn persist_prepared_state<'db>(
    transaction: &mut SqliteTransaction<'db>,
    wallet: &mut PersistedWallet<SqliteTransaction<'db>>,
    proposal: &PaymentProposalDto,
    psbt: &Psbt,
    acceleration: Option<(AccelerationMethod, &TransactionDto)>,
) -> ApiResult<()> {
    persist_proposal(transaction, proposal, psbt, acceleration.is_some())?;
    if let Some((method, original)) = acceleration {
        persist_acceleration(transaction, proposal, method, original)?;
    }
    wallet.persist(transaction).map_err(internal)?;
    Ok(())
}

fn reconcile_active_acceleration_proposals(db: &Connection) -> ApiResult<()> {
    db.execute(
        "UPDATE groot_proposals
         SET status = 'cancelled'
         WHERE status IN ('collecting', 'ready')
           AND proposal_id IN (
             SELECT acceleration.proposal_id
             FROM groot_accelerations acceleration
             WHERE EXISTS (
               SELECT 1
               FROM groot_accelerations completed
               WHERE completed.original_txid = acceleration.original_txid
                 AND completed.method = acceleration.method
                 AND completed.replacement_txid IS NOT NULL
             ) OR EXISTS (
               SELECT 1
               FROM groot_accelerations newer
               JOIN groot_proposals newer_proposal
                 ON newer_proposal.proposal_id = newer.proposal_id
               WHERE newer.original_txid = acceleration.original_txid
                 AND newer.method = acceleration.method
                 AND newer_proposal.status IN ('collecting', 'ready')
                 AND newer.rowid > acceleration.rowid
             )
           )",
        [],
    )
    .map(|_| ())
    .map_err(internal)
}

fn active_acceleration_proposal_id(
    db: &Connection,
    original_txid: &Txid,
    method: AccelerationMethod,
) -> ApiResult<Option<String>> {
    db.query_row(
        "SELECT acceleration.proposal_id
         FROM groot_accelerations acceleration
         JOIN groot_proposals proposal ON proposal.proposal_id = acceleration.proposal_id
         WHERE acceleration.original_txid = ?1
           AND acceleration.method = ?2
           AND proposal.status IN ('collecting', 'ready')
         ORDER BY acceleration.rowid DESC
         LIMIT 1",
        params![original_txid.to_string(), method.as_str()],
        |row| row.get(0),
    )
    .optional()
    .map_err(internal)
}

fn record_replacement(
    db: &Connection,
    proposal_id: &str,
    replacement_txid: &Txid,
) -> ApiResult<()> {
    db.execute(
        "UPDATE groot_accelerations SET replacement_txid = ?1
         WHERE proposal_id = ?2 AND method = 'rbf' AND replacement_txid IS NULL",
        params![replacement_txid.to_string(), proposal_id],
    )
    .map(|_| ())
    .map_err(internal)
}

fn apply_locally_broadcast_transaction(wallet: &mut Wallet, transaction: &Transaction) {
    wallet.apply_unconfirmed_txs([(transaction.clone(), now())]);
}

fn commit_multisig_broadcast(
    db: &mut Connection,
    transaction: &Transaction,
    proposal_id: &str,
    txid: &Txid,
    synced_at: Option<String>,
    delayed_policy: Option<&DelayedPolicyContext>,
) -> ApiResult<WalletSnapshotDto> {
    let mut persisted = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut persisted)?;
    apply_locally_broadcast_transaction(&mut wallet, transaction);
    let changed = persisted
        .execute(
            "UPDATE groot_proposals SET status = 'broadcast', txid = ?1 WHERE proposal_id = ?2 AND status IN ('collecting','ready')",
            params![txid.to_string(), proposal_id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while it was being broadcast.",
        ));
    }
    label_provenance::bind_broadcast_transaction(&persisted, proposal_id, &txid.to_string(), now())
        .map_err(internal)?;
    record_replacement(&persisted, proposal_id, txid)?;
    let snapshot = snapshot_from(&wallet, &persisted, synced_at, true, delayed_policy)?;
    notifications::enqueue(
        &persisted,
        &WalletNotification::TransactionBroadcast {
            txid: txid.to_string(),
            balance: snapshot.balance.total,
        },
        now(),
    )
    .map_err(internal)?;
    wallet.persist(&mut persisted).map_err(internal)?;
    drop(wallet);
    persisted.commit().map_err(internal)?;
    Ok(snapshot)
}

fn apply_replacement_history(
    db: &Connection,
    transactions: &mut Vec<TransactionDto>,
) -> ApiResult<()> {
    let mut statement = db
        .prepare(
            "SELECT acceleration.original_txid, acceleration.replacement_txid,
                    acceleration.original_kind, acceleration.original_direction,
                    acceleration.original_amount, acceleration.original_fee,
                    acceleration.original_date, acceleration.original_address,
                    acceleration.original_label, acceleration.original_fee_rate,
                    proposal.fee_rate, proposal.created_at, proposal.fee
             FROM groot_accelerations acceleration
             JOIN groot_proposals proposal ON proposal.proposal_id = acceleration.proposal_id
             WHERE acceleration.method = 'rbf' AND acceleration.replacement_txid IS NOT NULL
             ORDER BY acceleration.created_at DESC",
        )
        .map_err(internal)?;
    let replacements = statement
        .query_map([], |row| {
            Ok(TransactionDto {
                id: row.get(0)?,
                replaced_by: row.get(1)?,
                kind: row.get(2)?,
                direction: row.get(3)?,
                amount: row.get(4)?,
                fee: row.get(12)?,
                status: "replaced".to_owned(),
                confirmations: 0,
                date: row.get::<_, u64>(11)?.to_string(),
                address: row.get(7)?,
                label: row.get(8)?,
                intent_label: None,
                provenance: ProvenanceSummaryDto::unknown("funding"),
                block: None,
                input_count: None,
                replaces: None,
                output_count: None,
                fee_rate: None,
                wallet_input_amount: None,
                wallet_output_amount: None,
                locktime: None,
                rbf: None,
                rbf_history: Some(RbfHistoryDto {
                    original_txid: row.get(0)?,
                    replacement_txid: row.get(1)?,
                    original_fee_rate: row.get(9)?,
                    replacement_fee_rate: row.get(10)?,
                    outcome: "replacement_broadcast".to_owned(),
                }),
            })
        })
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;

    for mut replacement in replacements {
        replacement.intent_label =
            label_provenance::payment_label_for_txid(db, &replacement.id).map_err(internal)?;
        replacement.provenance =
            label_provenance::transaction_funding_summary(db, &replacement.id).map_err(internal)?;
        let original_txid = replacement.id.clone();
        let replacement_txid = replacement.replaced_by.clone();
        let original_position = transactions
            .iter()
            .position(|transaction| transaction.id == original_txid);
        let replacement_position = replacement_txid.as_deref().and_then(|txid| {
            transactions
                .iter()
                .position(|transaction| transaction.id == txid)
        });
        let original_confirmed =
            original_position.is_some_and(|position| transactions[position].status == "confirmed");

        if original_confirmed {
            let mut history = replacement
                .rbf_history
                .take()
                .expect("RBF history is constructed above");
            history.outcome = "original_confirmed".to_owned();
            if let Some(position) = original_position {
                history.original_fee_rate = transactions[position]
                    .fee_rate
                    .or(history.original_fee_rate);
                transactions[position].rbf_history = Some(history);
            }
            if let Some(txid) = replacement_txid.as_deref() {
                transactions.retain(|transaction| transaction.id != txid);
            }
        } else if let Some(position) = replacement_position {
            let mut history = replacement
                .rbf_history
                .take()
                .expect("RBF history is constructed above");
            history.outcome = if transactions[position].status == "confirmed" {
                "replacement_confirmed".to_owned()
            } else {
                "replacement_broadcast".to_owned()
            };
            history.replacement_fee_rate = transactions[position]
                .fee_rate
                .or(history.replacement_fee_rate);
            if let Some(original_position) = original_position {
                history.original_fee_rate = transactions[original_position]
                    .fee_rate
                    .or(history.original_fee_rate);
            }
            transactions[position].replaces = Some(original_txid.clone());
            transactions[position].rbf_history = Some(history);
            transactions.retain(|transaction| transaction.id != original_txid);
        } else if let Some(position) = original_position {
            let mut history = replacement
                .rbf_history
                .take()
                .expect("RBF history is constructed above");
            history.outcome = "replacement_broadcast".to_owned();
            history.original_fee_rate = transactions[position]
                .fee_rate
                .or(history.original_fee_rate);
            transactions[position].rbf_history = Some(history);
        } else {
            // Broadcast persistence can precede the replacement appearing in BDK's graph.
            // Present one pending payment row for the replacement and keep the original
            // exclusively inside its lineage instead of double-counting the payment.
            replacement.id = replacement_txid.expect("completed RBF rows have a replacement id");
            replacement.status = "pending".to_owned();
            replacement.replaces = Some(original_txid);
            replacement.replaced_by = None;
            replacement.fee_rate = replacement
                .rbf_history
                .as_ref()
                .and_then(|history| history.replacement_fee_rate);
            transactions.push(replacement);
        }
    }
    transactions.sort_by_key(|transaction| {
        std::cmp::Reverse(transaction.date.parse::<u64>().unwrap_or_default())
    });
    Ok(())
}

fn load_single_proposal(db: &Connection, proposal_id: &str) -> ApiResult<PendingProposal> {
    let (encoded, recipient, amount, fee) = db
        .query_row(
            "SELECT psbt, recipient, amount, fee FROM groot_proposals WHERE proposal_id = ?1 AND status = 'collecting'",
            params![proposal_id],
            |row| Ok((row.get::<_, String>(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| {
            api_error(
                "proposal_not_found",
                "Payment proposal expired or was not found.",
            )
        })?;
    Ok(PendingProposal {
        psbt: decode_psbt(&encoded).map_err(proposal_api_error)?,
        recipient,
        amount,
        fee,
    })
}

fn load_acceleration_review(
    db: &Connection,
    proposal_id: &str,
    replacement_fee: u64,
    resulting_fee_rate: f64,
) -> ApiResult<Option<AccelerationReviewDto>> {
    db.query_row(
        "SELECT method, original_txid, original_fee, original_fee_rate,
                minimum_fee_rate, target_fee_rate, recommendation_source
         FROM groot_accelerations WHERE proposal_id = ?1",
        params![proposal_id],
        |row| {
            let method = match row.get::<_, String>(0)?.as_str() {
                "rbf" => AccelerationMethod::Rbf,
                "cpfp" => AccelerationMethod::Cpfp,
                _ => return Err(bdk_wallet::rusqlite::Error::InvalidQuery),
            };
            let original_fee = row.get::<_, Option<u64>>(2)?.unwrap_or(0);
            Ok(AccelerationReviewDto {
                method,
                original_txid: row.get(1)?,
                original_fee_rate: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                minimum_fee_rate: row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
                target_fee_rate: row.get::<_, Option<f64>>(5)?.unwrap_or(resulting_fee_rate),
                incremental_fee: if method == AccelerationMethod::Cpfp {
                    replacement_fee
                } else {
                    replacement_fee.saturating_sub(original_fee)
                },
                recommendation_source: row
                    .get::<_, Option<String>>(6)?
                    .unwrap_or_else(|| "legacy".to_owned()),
            })
        },
    )
    .optional()
    .map_err(internal)
}

fn proposal_acceleration_method(
    db: &Connection,
    proposal_id: &str,
) -> ApiResult<Option<AccelerationMethod>> {
    db.query_row(
        "SELECT method FROM groot_accelerations WHERE proposal_id = ?1",
        params![proposal_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(internal)?
    .map(|method| match method.as_str() {
        "rbf" => Ok(AccelerationMethod::Rbf),
        "cpfp" => Ok(AccelerationMethod::Cpfp),
        _ => Err(api_error(
            "proposal_mismatch",
            "The stored acceleration method is invalid.",
        )),
    })
    .transpose()
}

fn validate_rbf_original_intent(
    db: &Connection,
    wallet: &Wallet,
    proposal_id: &str,
    recipient: &str,
    amount: u64,
) -> ApiResult<()> {
    let original_txid = db
        .query_row(
            "SELECT original_txid FROM groot_accelerations WHERE proposal_id = ?1 AND method = 'rbf'",
            params![proposal_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(internal)?;
    let Some(original_txid) = original_txid else {
        return Ok(());
    };
    let txid = Txid::from_str(&original_txid).map_err(|_| {
        api_error(
            "proposal_mismatch",
            "The stored replacement transaction reference is invalid.",
        )
    })?;
    let original = wallet.get_tx(txid).ok_or_else(|| {
        api_error(
            "proposal_mismatch",
            "The original transaction is unavailable for replacement verification.",
        )
    })?;
    let external = original
        .tx_node
        .tx
        .output
        .iter()
        .filter(|output| !wallet.is_mine(output.script_pubkey.clone()))
        .collect::<Vec<_>>();
    let valid = external.len() == 1
        && external[0].value.to_sat() == amount
        && Address::from_script(&external[0].script_pubkey, NETWORK)
            .is_ok_and(|address| address.to_string() == recipient);
    if !valid {
        return Err(api_error(
            "proposal_mismatch",
            "The replacement no longer matches the original recipient and payment amount.",
        ));
    }
    Ok(())
}

fn load_payment_proposal_dto(
    db: &Connection,
    wallet: &Wallet,
    proposal_id: &str,
) -> ApiResult<PaymentProposalDto> {
    let (proposal_id, recipient, label, amount, fee, encoded, strategy, fee_difference_vs_private) = db
        .query_row(
            "SELECT proposal_id, recipient, label, amount, fee, psbt, selection_strategy, fee_difference_vs_private
             FROM groot_proposals
             WHERE proposal_id = ?1 AND status IN ('collecting', 'ready')",
            params![proposal_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u64>(3)?,
                    row.get::<_, u64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                ))
            },
        )
        .map_err(|_| {
            api_error(
                "proposal_not_found",
                "Payment proposal was not found or is no longer active.",
            )
        })?;
    let psbt = decode_psbt(&encoded).map_err(proposal_api_error)?;
    validate_proposal_fee(&psbt, fee)?;
    let (change, change_addresses) = proposal_change_details(wallet, &psbt, &recipient, amount)?;
    let (recipient_is_wallet_owned, recipient_derivation_paths) =
        proposal_recipient_wallet_details(wallet, &psbt, &recipient, amount)?;
    let wallet_controlled_output_amount =
        proposal_wallet_controlled_output_amount(wallet, &psbt, recipient_is_wallet_owned)?;
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(&psbt, &change_addresses)?;
    let (inputs, fee_rate, locktime, rbf) = proposal_transaction_details(wallet, &psbt, fee)?;
    let selection_impact =
        selection_impact(db, wallet, &psbt, &strategy, fee_difference_vs_private)?;
    let labels = label_provenance::labels_for_subject(db, "transaction_intent", &proposal_id)
        .map_err(internal)?
        .into_iter()
        .map(|label| label.text)
        .collect();
    Ok(PaymentProposalDto {
        proposal_id: proposal_id.clone(),
        recipient,
        recipient_testnet_alias,
        recipient_is_wallet_owned,
        wallet_controlled_output_amount,
        recipient_derivation_paths,
        label,
        labels,
        amount,
        fee,
        fee_rate,
        total: checked_payment_total(amount, fee)?,
        change,
        change_addresses,
        change_testnet_aliases,
        change_derivation_paths,
        output_count: psbt.unsigned_tx.output.len(),
        selected_outpoints: psbt
            .unsigned_tx
            .input
            .iter()
            .map(|input| input.previous_output.to_string())
            .collect(),
        inputs,
        locktime,
        rbf,
        network: NETWORK_NAME,
        selection_impact,
        acceleration: load_acceleration_review(db, &proposal_id, fee, fee_rate)?,
    })
}

fn active_payment_proposal_ids(db: &Connection) -> ApiResult<Vec<String>> {
    let mut statement = db
        .prepare(
            "SELECT proposal_id FROM groot_proposals
             WHERE status IN ('collecting', 'ready')
             ORDER BY created_at DESC, proposal_id DESC",
        )
        .map_err(internal)?;
    let proposal_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    Ok(proposal_ids)
}

fn write_private_json(path: &Path, value: &impl Serialize) -> ApiResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| internal("Private storage path has no parent."))?;
    fs::create_dir_all(parent).map_err(internal)?;
    let encoded = serde_json::to_vec_pretty(value).map_err(internal)?;
    if encoded.len() as u64 > MAX_PRIVATE_JSON_BYTES {
        return Err(internal("Private storage payload is too large."));
    }
    let temp = parent.join(format!(".groot-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(internal)?;
        file.write_all(&encoded).map_err(internal)?;
        file.sync_all().map_err(internal)?;
        fs::rename(&temp, path).map_err(internal)?;
        #[cfg(unix)]
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(internal)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn persist_secret_material(path: &Path, material: &[u8], credential: &str) -> ApiResult<()> {
    secure_store::store(path, material, credential).map_err(secure_store_error)
}

fn cleanup_failed_profile(dir: &Path) -> ApiResult<()> {
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(internal(error)),
    }
}

fn finish_new_profile_attempt(
    state: &AppState,
    wallet_id: Uuid,
    directory: &Path,
    succeeded: bool,
) -> ApiResult<()> {
    let cleanup = if succeeded {
        Ok(())
    } else {
        state.node_auth.lock().map_err(internal)?.remove(&wallet_id);
        cleanup_failed_profile(directory)
    };
    cleanup
}

fn read_private_text(path: &Path) -> ApiResult<String> {
    let metadata = fs::symlink_metadata(path).map_err(internal)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(internal("Private storage is not a regular file."));
    }
    let file = File::open(path).map_err(internal)?;
    if metadata.len() > MAX_PRIVATE_JSON_BYTES {
        return Err(internal("Private storage payload is too large."));
    }
    let mut encoded = String::new();
    file.take(MAX_PRIVATE_JSON_BYTES + 1)
        .read_to_string(&mut encoded)
        .map_err(internal)?;
    if encoded.len() as u64 > MAX_PRIVATE_JSON_BYTES {
        return Err(internal("Private storage payload is too large."));
    }
    Ok(encoded)
}

fn create_from_mnemonic(
    app: &AppHandle,
    state: &State<'_, AppState>,
    name: String,
    mnemonic: Mnemonic,
    credential: &str,
    backup_verified: bool,
) -> ApiResult<()> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 48 {
        return Err(api_error(
            "invalid_wallet_name",
            "Wallet names must contain 1 to 48 characters.",
        ));
    }
    validate_wallet_passphrase(credential)?;
    let (id, dir) = prepare_profile_directory(app)?;
    let result = (|| {
        let (external, internal_template) = watch_templates(&mnemonic, credential)?;
        let permit = database_open_permit_for_new_wallet(state)?;
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"), &permit)?;
        init_app_schema(&db)?;
        let wallet = Wallet::create(external, internal_template)
            .network(NETWORK)
            .create_wallet(&mut db)
            .map_err(internal)?;
        let words = Zeroizing::new(mnemonic.to_string());
        persist_secret_material(&dir.join("secret.json"), words.as_bytes(), credential)?;
        profile_commands::persist_mainnet_node_admission_for_new_profile(
            app, state, id, credential,
        )?;
        commit_profile(
            app,
            WalletProfile {
                id,
                name: name.to_owned(),
                network: NETWORK_NAME.to_owned(),
                kind: WalletKind::SingleKey,
                descriptor_checksum: descriptor_checksum(
                    &wallet.public_descriptor(KeychainKind::External).to_string(),
                )?,
                created_at: now(),
                backup_verified,
            },
            &wallet.public_descriptor(KeychainKind::External).to_string(),
        )
    })();
    finish_new_profile_attempt(state, id, &dir, result.is_ok())?;
    result
}

fn sync_wallet_atomically(
    app: &AppHandle,
    state: &State<'_, AppState>,
    db: &mut Connection,
    multisig: bool,
    cancel: Option<&AtomicBool>,
) -> ApiResult<WalletSnapshotDto> {
    match read_sync_source(app)? {
        WalletSyncSource::BitcoinCore => sync_wallet_with_core(app, state, db, multisig, cancel),
        source @ WalletSyncSource::CompactFilters { .. } => {
            ensure_foreground_sync_not_cancelled(cancel)?;
            sync_wallet_with_compact_filters(app, state, db, multisig, &source, cancel)
        }
    }
}

fn ensure_foreground_sync_not_cancelled(cancel: Option<&AtomicBool>) -> ApiResult<()> {
    if cancel.is_some_and(|cancel| cancel.load(Ordering::Acquire)) {
        Err(api_error(
            "sync_cancelled",
            "Wallet refresh paused for a foreground action.",
        ))
    } else {
        Ok(())
    }
}

fn cancel_foreground_sync(state: &AppState) -> ApiResult<bool> {
    let active = state.foreground_sync.lock().map_err(internal)?;
    let Some(active) = active.as_ref() else {
        return Ok(false);
    };
    active.cancel.store(true, Ordering::Release);
    Ok(true)
}

fn run_foreground_sync(
    app: &AppHandle,
    state: &State<'_, AppState>,
    multisig: bool,
) -> ApiResult<WalletSnapshotDto> {
    let wallet_id = require_unlocked_for_background_sync(app, state)?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.foreground_sync.lock().map_err(internal)?;
        if active.is_some() {
            return Err(api_error(
                "sync_in_progress",
                "A wallet refresh is already running.",
            ));
        }
        *active = Some(ActiveForegroundSync {
            wallet_id,
            cancel: Arc::clone(&cancel),
        });
    }

    let result = (|| {
        let _operation = operation_guard(state)?;
        ensure_foreground_sync_not_cancelled(Some(cancel.as_ref()))?;
        let selected = require_unlocked_for_background_sync(app, state)?;
        if selected != wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed before refresh could begin.",
            ));
        }
        let mut db = if multisig {
            open_multisig_db(app)?
        } else {
            open_db(app)?
        };
        if state
            .recovery_scans
            .lock()
            .map_err(internal)?
            .contains_key(&wallet_id)
        {
            return Err(api_error(
                "scan_in_progress",
                "A resumable wallet-history scan is already running.",
            ));
        }
        if matches!(read_sync_source(app)?, WalletSyncSource::BitcoinCore)
            && !has_completed_sync(&db)?
        {
            return Err(api_error(
                "initial_scan_required",
                "Choose a wallet birthday before the first Bitcoin Core history scan.",
            ));
        }
        sync_wallet_with_status(
            app,
            state,
            &mut db,
            multisig,
            wallet_id,
            Some(cancel.as_ref()),
        )
    })();

    if let Ok(mut active) = state.foreground_sync.lock() {
        if active.as_ref().is_some_and(|active| {
            active.wallet_id == wallet_id && Arc::ptr_eq(&active.cancel, &cancel)
        }) {
            *active = None;
        }
    }
    result
}

fn sync_wallet_with_status(
    app: &AppHandle,
    state: &State<'_, AppState>,
    db: &mut Connection,
    multisig: bool,
    wallet_id: Uuid,
    cancel: Option<&AtomicBool>,
) -> ApiResult<WalletSnapshotDto> {
    let source = read_sync_source(app)?;
    let last_verified_height = load_wallet(db)?.latest_checkpoint().height();
    let (source_name, initial_state) = match source {
        WalletSyncSource::BitcoinCore => ("bitcoin_core", "syncing"),
        WalletSyncSource::CompactFilters { .. } => ("compact_filters", "connecting"),
    };
    set_sync_status(
        state,
        wallet_id,
        source_name,
        initial_state,
        last_verified_height,
    )?;
    let result = sync_wallet_atomically(app, state, db, multisig, cancel);
    let verified_height = if result.is_ok() {
        load_wallet(db)
            .map(|wallet| wallet.latest_checkpoint().height())
            .unwrap_or(last_verified_height)
    } else {
        last_verified_height
    };
    finish_sync_status(state, wallet_id, &result, verified_height);
    result
}

fn sync_wallet_with_core(
    app: &AppHandle,
    state: &State<'_, AppState>,
    db: &mut Connection,
    multisig: bool,
    cancel: Option<&AtomicBool>,
) -> ApiResult<WalletSnapshotDto> {
    ensure_foreground_sync_not_cancelled(cancel)?;
    let rpc = Arc::new(rpc_client(app, state)?);
    let mut wallet = load_wallet(db)?;
    let (chain, _) = checked_core_chain(rpc.as_ref())?;
    ensure_core_ready_for_wallet_history(
        chain.blocks,
        chain.initial_block_download,
        wallet.latest_checkpoint().height(),
    )?;
    let target_height = u32::try_from(chain.blocks)
        .map_err(|_| internal("The node height exceeds the supported sync range."))?;
    let (wallet_tip, _) = rewind_stale_core_checkpoints(rpc.as_ref(), &wallet)?;
    let start_height = wallet_tip.height();
    ensure_core_history_available(
        chain.pruned,
        chain.prune_height,
        start_height.saturating_add(1),
    )?;
    let scan_birthday = load_recovery_scan_settings(db)?.birthday_height;
    update_core_sync_status(
        &state.sync_status,
        start_height,
        start_height,
        target_height,
    );
    let mut emitter = Emitter::new(
        rpc,
        wallet_tip,
        scan_birthday,
        wallet
            .transactions()
            .filter(|tx| tx.chain_position.is_unconfirmed()),
    );
    loop {
        ensure_foreground_sync_not_cancelled(cancel)?;
        let Some(block) = retry_transient_core_rpc(|| emitter.next_block(), std::thread::sleep)?
        else {
            break;
        };
        ensure_foreground_sync_not_cancelled(cancel)?;
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .map_err(internal)?;
        update_core_sync_status(
            &state.sync_status,
            start_height,
            block.block_height(),
            target_height,
        );
    }
    ensure_foreground_sync_not_cancelled(cancel)?;
    let mempool = retry_transient_core_rpc(|| emitter.mempool(), std::thread::sleep)?;
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    update_core_sync_status(
        &state.sync_status,
        start_height,
        target_height,
        target_height,
    );
    ensure_foreground_sync_not_cancelled(cancel)?;
    let transaction = db.transaction().map_err(internal)?;
    mark_observed_addresses(&wallet, &transaction)?;
    label_provenance::reconcile_wallet_outputs(&wallet, &transaction, now()).map_err(internal)?;
    let delayed_policy = if multisig {
        selected_delayed_policy_context(app)?
    } else {
        None
    };
    let snapshot = snapshot_from(
        &wallet,
        &transaction,
        Some(now().to_string()),
        multisig,
        delayed_policy.as_ref(),
    )?;
    enqueue_snapshot_notifications(&transaction, &snapshot)?;
    if let Some(changeset) = wallet.take_staged() {
        changeset
            .persist_to_sqlite(&transaction)
            .map_err(internal)?;
    }
    drop(wallet);
    transaction.commit().map_err(internal)?;
    Ok(snapshot)
}

fn sync_wallet_with_compact_filters(
    app: &AppHandle,
    state: &State<'_, AppState>,
    db: &mut Connection,
    multisig: bool,
    source: &WalletSyncSource,
    cancel: Option<&AtomicBool>,
) -> ApiResult<WalletSnapshotDto> {
    let config = source
        .validate(NETWORK)
        .map_err(network_config_api_error)?
        .ok_or_else(|| internal("The compact-filter sync source was not selected."))?;
    let cache_dir = compact_filter_cache_dir(app)?;
    let wallet = load_wallet(db)?;
    let status = Arc::clone(&state.sync_status);
    let update = crate::compact_filters::sync_with_progress(
        &wallet,
        NETWORK,
        &cache_dir,
        &config,
        cancel,
        move |progress| update_compact_filter_sync_status(&status, progress),
    )
    .map_err(|error| match error {
        crate::compact_filters::CompactFilterError::Cancelled => api_error(
            "sync_cancelled",
            "Wallet refresh paused for a foreground action.",
        ),
        _ => compact_filter_unavailable(),
    })?;
    drop(wallet);
    ensure_foreground_sync_not_cancelled(cancel)?;
    if let Ok(mut status) = state.sync_status.lock() {
        if let Some(current) = status.as_mut() {
            current.state = "applying";
            current.progress_percent = Some(100);
            current.updated_at = now();
        }
    }
    let delayed_policy = if multisig {
        selected_delayed_policy_context(app)?
    } else {
        None
    };
    apply_compact_filter_update(db, multisig, update, delayed_policy.as_ref())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CompactFilterCommitStage {
    UpdateApplied,
    AddressesMarked,
    ProvenanceReconciled,
    SnapshotBuilt,
    NotificationsEnqueued,
    WalletPersisted,
}

fn apply_compact_filter_update(
    db: &mut Connection,
    multisig: bool,
    update: Update,
    delayed_policy: Option<&DelayedPolicyContext>,
) -> ApiResult<WalletSnapshotDto> {
    apply_compact_filter_update_with_hook(db, multisig, update, delayed_policy, |_| Ok(()))
}

fn apply_compact_filter_update_with_hook<F>(
    db: &mut Connection,
    multisig: bool,
    update: Update,
    delayed_policy: Option<&DelayedPolicyContext>,
    mut after_stage: F,
) -> ApiResult<WalletSnapshotDto>
where
    F: FnMut(CompactFilterCommitStage) -> ApiResult<()>,
{
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    wallet.apply_update(update).map_err(internal)?;
    after_stage(CompactFilterCommitStage::UpdateApplied)?;
    mark_observed_addresses(&wallet, &transaction)?;
    after_stage(CompactFilterCommitStage::AddressesMarked)?;
    label_provenance::reconcile_wallet_outputs(&wallet, &transaction, now()).map_err(internal)?;
    after_stage(CompactFilterCommitStage::ProvenanceReconciled)?;
    let snapshot = snapshot_from(
        &wallet,
        &transaction,
        Some(now().to_string()),
        multisig,
        delayed_policy,
    )?;
    after_stage(CompactFilterCommitStage::SnapshotBuilt)?;
    enqueue_snapshot_notifications(&transaction, &snapshot)?;
    after_stage(CompactFilterCommitStage::NotificationsEnqueued)?;
    wallet.persist(&mut transaction).map_err(internal)?;
    after_stage(CompactFilterCommitStage::WalletPersisted)?;
    drop(wallet);
    transaction.commit().map_err(internal)?;
    Ok(snapshot)
}

fn full_rescan_loaded_wallet(
    rpc: Arc<Client>,
    wallet: &mut PersistedWallet<Connection>,
    db: &mut Connection,
    settings: &RecoveryScanSettingsDto,
    run_id: &str,
    cancel: &AtomicBool,
) -> ApiResult<()> {
    let (chain, genesis) = checked_core_chain(rpc.as_ref())?;
    let tip = chain.blocks;
    ensure_core_ready_for_wallet_history(
        tip,
        chain.initial_block_download,
        wallet.latest_checkpoint().height(),
    )?;
    if u64::from(settings.birthday_height) > tip {
        return Err(api_error(
            "invalid_scan_settings",
            "Wallet birthday cannot be above the node's current block height.",
        ));
    }
    ensure_recovery_scan_history_available(
        chain.pruned,
        chain.prune_height,
        settings.birthday_height,
    )?;
    let target_height = u32::try_from(tip)
        .map_err(|_| internal("The node height exceeds the supported recovery range."))?;
    let previous = reconcile_recovery_scan_record(db, None)?.map(|record| record.status);
    let resumable = previous.as_ref().filter(|status| {
        matches!(
            status.status.as_str(),
            "cancelled" | "interrupted" | "failed"
        ) && status.birthday_height == settings.birthday_height
            && status.gap_limit == settings.gap_limit
            && status.processed_blocks > 0
            && status.current_height <= target_height
    });
    let resume_checkpoint = resumable.and_then(|status| {
        wallet
            .latest_checkpoint()
            .get(status.current_height)
            .map(|checkpoint| (status, checkpoint))
    });
    let resume_checkpoint = match resume_checkpoint {
        Some((status, checkpoint)) => {
            let current_hash = retry_transient_core_rpc(
                || rpc.get_block_hash(u64::from(status.current_height)),
                std::thread::sleep,
            )?;
            (current_hash == checkpoint.hash()).then_some((status, checkpoint))
        }
        None => None,
    };
    let (checkpoint, start_height, mut processed_blocks) =
        if let Some((status, checkpoint)) = resume_checkpoint {
            resume_recovery_scan_record(db, run_id, status, target_height)?;
            (
                checkpoint,
                status.current_height.saturating_add(1).min(target_height),
                status.processed_blocks,
            )
        } else {
            start_recovery_scan_record(db, run_id, settings, target_height)?;
            (
                recovery_scan_checkpoint(rpc.as_ref(), genesis, settings.birthday_height)?,
                settings.birthday_height,
                0,
            )
        };
    db.execute(
        "DELETE FROM bdk_blocks WHERE block_height > ?1",
        params![checkpoint.height()],
    )
    .map_err(internal)?;
    *wallet = load_wallet(db)?;
    wallet
        .apply_update(Update {
            chain: Some(checkpoint.clone()),
            ..Default::default()
        })
        .map_err(internal)?;
    let expected_mempool = wallet
        .transactions()
        .filter(|tx| tx.chain_position.is_unconfirmed());
    let mut emitter = Emitter::new(rpc, checkpoint, start_height, expected_mempool);
    while let Some(block) = retry_transient_core_rpc(|| emitter.next_block(), std::thread::sleep)? {
        if cancel.load(Ordering::Acquire) {
            return Err(api_error(
                "scan_cancelled",
                "Recovery scan cancelled. Saved progress remains safe; start it again to continue.",
            ));
        }
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .map_err(internal)?;
        wallet.persist(db).map_err(internal)?;
        processed_blocks = processed_blocks.saturating_add(1);
        update_recovery_scan_progress(db, run_id, block.block_height(), processed_blocks)?;
    }
    if cancel.load(Ordering::Acquire) {
        return Err(api_error(
            "scan_cancelled",
            "Recovery scan cancelled. Saved progress remains safe; start it again to continue.",
        ));
    }
    let mempool = retry_transient_core_rpc(|| emitter.mempool(), std::thread::sleep)?;
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    wallet.persist(db).map_err(internal)?;
    mark_observed_addresses(wallet, db)
}

fn mark_observed_addresses(wallet: &Wallet, db: &Connection) -> ApiResult<()> {
    for output in wallet.list_output() {
        if output.keychain == KeychainKind::External {
            db.execute(
                "UPDATE groot_addresses SET observed = 1, state = 'used' WHERE idx = ?1",
                params![output.derivation_index],
            )
            .map_err(internal)?;
        }
    }
    Ok(())
}

fn confirmations(
    position: &ChainPosition<ConfirmationBlockTime>,
    tip: u32,
    fallback_first_seen: Option<u64>,
) -> (u32, Option<u32>, String) {
    match position {
        ChainPosition::Confirmed { anchor, .. } => (
            tip.saturating_sub(anchor.block_id.height).saturating_add(1),
            Some(anchor.block_id.height),
            anchor.confirmation_time.to_string(),
        ),
        ChainPosition::Unconfirmed { first_seen, .. } => (
            0,
            None,
            first_seen
                .or(fallback_first_seen)
                .unwrap_or_else(now)
                .to_string(),
        ),
    }
}

fn transaction_observed_at(db: &Connection, txid: &str) -> ApiResult<Option<u64>> {
    db.query_row(
        "SELECT MIN(created_at) FROM groot_notifications
         WHERE txid = ?1 AND kind IN ('payment_received','transaction_broadcast')",
        params![txid],
        |row| row.get(0),
    )
    .map_err(internal)
}

fn address_metadata(db: &Connection, index: u32) -> Option<(String, String)> {
    db.query_row(
        "SELECT address, label FROM groot_addresses WHERE idx = ?1",
        params![index],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok()
}

fn tx_counterparty(
    wallet: &Wallet,
    db: &Connection,
    tx: &bdk_wallet::bitcoin::Transaction,
    received: bool,
) -> (Option<String>, String) {
    let txid = tx.compute_txid().to_string();
    let outgoing_label = (!received)
        .then(|| {
            db.query_row(
                "SELECT label FROM groot_proposals WHERE txid = ?1 AND status = 'broadcast'",
                params![txid],
                |row| row.get::<_, String>(0),
            )
            .ok()
        })
        .flatten();
    if received {
        for output in &tx.output {
            if let Some((keychain, index)) = wallet.derivation_of_spk(output.script_pubkey.clone())
            {
                if keychain == KeychainKind::External {
                    if let Some(metadata) = address_metadata(db, index) {
                        return (Some(metadata.0), metadata.1);
                    }
                }
            }
        }
    } else {
        for output in &tx.output {
            if wallet
                .derivation_of_spk(output.script_pubkey.clone())
                .is_none()
            {
                if let Ok(address) = Address::from_script(&output.script_pubkey, NETWORK) {
                    return (
                        Some(address.to_string()),
                        outgoing_label
                            .clone()
                            .unwrap_or_else(|| "Sent payment".to_owned()),
                    );
                }
            }
        }
    }
    (
        None,
        if received {
            "Received".to_owned()
        } else {
            outgoing_label.unwrap_or_else(|| "Sent payment".to_owned())
        },
    )
}

fn transaction_kind(received: bool, has_external_value_output: bool) -> &'static str {
    if !received && !has_external_value_output {
        "self_spend"
    } else {
        "payment"
    }
}

#[tauri::command]
pub fn multisig_acknowledge_coldcard_policy(
    app: AppHandle,
    state: State<'_, AppState>,
    signer_fingerprint: String,
) -> ApiResult<SignerPolicyVerificationDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let signer_fingerprint = signer_fingerprint.trim().to_ascii_lowercase();
    if signer_fingerprint.len() != 8
        || !signer_fingerprint
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(api_error(
            "invalid_fingerprint",
            "A signer fingerprint must contain exactly eight hexadecimal characters.",
        ));
    }
    let metadata = read_multisig_metadata(&app)?;
    let signer = metadata
        .cosigners
        .iter()
        .find(|signer| signer.fingerprint.eq_ignore_ascii_case(&signer_fingerprint))
        .ok_or_else(|| {
            api_error(
                "unknown_signer",
                "This fingerprint is not part of the wallet.",
            )
        })?;
    if !supports_coldcard_policy_acknowledgement(signer) {
        return Err(api_error(
            "invalid_hardware_request",
            "This signer was saved as a different hardware type and cannot use Coldcard policy setup.",
        ));
    }
    let acknowledged_at = now();
    let db = open_multisig_db(&app)?;
    db.execute(
        "INSERT INTO groot_signer_policy_acknowledgements
            (signer_fingerprint, device_type, scope, acknowledged_at)
         VALUES (?1, 'coldcard', 'policy_file_acknowledgement', ?2)",
        params![signer_fingerprint, acknowledged_at],
    )
    .map_err(internal)?;
    Ok(SignerPolicyVerificationDto {
        signer_fingerprint,
        device_type: "coldcard".to_owned(),
        verified_at: acknowledged_at.to_string(),
        scope: "policy_file_acknowledgement",
        displayed_address: None,
    })
}

fn snapshot_from(
    wallet: &Wallet,
    db: &Connection,
    synced_at: Option<String>,
    multisig: bool,
    delayed_policy: Option<&DelayedPolicyContext>,
) -> ApiResult<WalletSnapshotDto> {
    snapshot_for_view(wallet, db, synced_at, multisig, delayed_policy, false)
}

// The overview-only intermediate is projected to WalletOverviewDto before IPC;
// it is never returned to a full-snapshot consumer such as coin selection.
fn snapshot_for_view(
    wallet: &Wallet,
    db: &Connection,
    synced_at: Option<String>,
    multisig: bool,
    delayed_policy: Option<&DelayedPolicyContext>,
    overview_only: bool,
) -> ApiResult<WalletSnapshotDto> {
    label_provenance::reconcile_wallet_outputs(wallet, db, now()).map_err(internal)?;
    let provenance_context = label_provenance::summary_context(db).map_err(internal)?;
    let balance = wallet.balance();
    let tip = wallet.latest_checkpoint().height();
    let chain_tip = chain_tip_dto(db, tip, synced_at.as_deref())?;
    let addresses = if overview_only {
        Vec::new()
    } else {
        address_rows(db, multisig)?
    };

    let transactions = activity::transactions_from(wallet, db, &provenance_context)?;

    let mut utxos = Vec::new();
    let frozen = {
        let mut statement = db
            .prepare("SELECT outpoint FROM groot_frozen_coins")
            .map_err(internal)?;
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(internal)?
            .collect::<Result<std::collections::HashSet<_>, _>>()
            .map_err(internal)?;
        values
    };
    for output in wallet.list_unspent() {
        let (output_confirmations, _, _) = confirmations(&output.chain_position, tip, None);
        let address = Address::from_script(&output.txout.script_pubkey, NETWORK)
            .map(|address| address.to_string())
            .unwrap_or_else(|_| "Unknown".to_owned());
        let label = if output.keychain == KeychainKind::External {
            address_metadata(db, output.derivation_index)
                .map(|(_, label)| label)
                .unwrap_or_else(|| "Received".to_owned())
        } else {
            "Change".to_owned()
        };
        let provenance = label_provenance::output_summary_with_context(
            db,
            &output.outpoint.to_string(),
            &provenance_context,
        )
        .map_err(internal)?;
        let primary_label = provenance.labels.first().cloned();
        let label = primary_label
            .as_ref()
            .map(|label| label.text.clone())
            .unwrap_or_else(|| match provenance.state {
                ProvenanceState::Mixed => "Mixed change".to_owned(),
                ProvenanceState::Unknown if output.keychain == KeychainKind::Internal => {
                    "Change · source unknown".to_owned()
                }
                _ => label,
            });
        let policy_maturity = delayed_policy
            .map(|policy| {
                let calculation = calculate_maturity(policy.delay_blocks, output_confirmations)
                    .map_err(recovery_api_error)?;
                let maturity_height = if output_confirmations == 0 {
                    None
                } else {
                    tip.checked_sub(output_confirmations.saturating_sub(1))
                        .and_then(|height| height.checked_add(policy.delay_blocks))
                };
                if output_confirmations > 0 && maturity_height.is_none() {
                    return Err(api_error(
                        "wallet_corrupt",
                        "A coin's delayed-policy height is outside the supported range.",
                    ));
                }
                Ok(PolicyMaturityDto {
                    state: calculation.state,
                    policy_type: policy.policy_type.clone(),
                    delay_blocks: policy.delay_blocks,
                    age_blocks: calculation.age_blocks,
                    remaining_blocks: calculation.remaining_blocks,
                    approaching_at_blocks: calculation.approaching_at_blocks,
                    maturity_height,
                    approximate_seconds_remaining: calculation.approximate_seconds_remaining,
                    delayed_spend_supported: true,
                })
            })
            .transpose()?;
        utxos.push(UtxoDto {
            outpoint: output.outpoint.to_string(),
            amount: output.txout.value.to_sat(),
            confirmations: output_confirmations,
            address,
            label,
            primary_label,
            provenance,
            frozen: frozen.contains(&output.outpoint.to_string()),
            policy_maturity,
        });
    }

    Ok(WalletSnapshotDto {
        network: NETWORK_NAME,
        balance: BalanceDto {
            confirmed: balance.confirmed.to_sat(),
            pending: aggregate_pending_balance(
                balance.trusted_pending.to_sat(),
                balance.untrusted_pending.to_sat(),
            ),
            trusted_pending: balance.trusted_pending.to_sat(),
            total: balance.total().to_sat(),
        },
        transactions,
        utxos,
        receive_addresses: addresses,
        label_suggestions: if overview_only {
            Vec::new()
        } else {
            label_provenance::label_suggestions(db, None).map_err(internal)?
        },
        synced_at: chain_tip.observed_at.clone(),
        chain_tip,
    })
}

const CHAIN_TIP_RECENT_SECONDS: u64 = 30 * 60;

fn chain_tip_dto(db: &Connection, height: u32, synced_at: Option<&str>) -> ApiResult<ChainTipDto> {
    if let Some(value) = synced_at {
        let observed_at = value
            .parse::<u64>()
            .map_err(|_| api_error("wallet_corrupt", "The verified chain-tip time is invalid."))?;
        db.execute(
            "INSERT INTO groot_chain_observation(singleton,height,observed_at) VALUES(1,?1,?2)
             ON CONFLICT(singleton) DO UPDATE SET height=excluded.height,observed_at=excluded.observed_at",
            params![height, observed_at],
        )
        .map_err(internal)?;
    }
    let observation = db
        .query_row(
            "SELECT height,observed_at FROM groot_chain_observation WHERE singleton=1",
            [],
            |row| Ok((row.get::<_, u32>(0)?, row.get::<_, u64>(1)?)),
        )
        .optional()
        .map_err(internal)?;
    let Some((observed_height, observed_at)) = observation else {
        return Ok(ChainTipDto {
            height,
            observed_at: None,
            status: "unknown",
        });
    };
    let current_time = now();
    if observed_height != height || observed_at > current_time.saturating_add(300) {
        return Err(api_error(
            "wallet_corrupt",
            "The saved chain-tip observation does not match the wallet state.",
        ));
    }
    Ok(ChainTipDto {
        height,
        observed_at: Some(observed_at.to_string()),
        status: if current_time.saturating_sub(observed_at) <= CHAIN_TIP_RECENT_SECONDS {
            "recent"
        } else {
            "stale"
        },
    })
}

fn snapshot_notifications(snapshot: &WalletSnapshotDto) -> Vec<WalletNotification> {
    let mut events = Vec::new();
    for transaction in &snapshot.transactions {
        if transaction.direction == "received" {
            events.push(WalletNotification::PaymentReceived {
                txid: transaction.id.clone(),
                amount: transaction.amount,
                balance: snapshot.balance.total,
            });
        }
        if transaction.confirmations > 0 {
            events.push(WalletNotification::FirstConfirmation {
                txid: transaction.id.clone(),
                balance: snapshot.balance.total,
            });
        }
    }
    events
}

fn enqueue_snapshot_notifications(db: &Connection, snapshot: &WalletSnapshotDto) -> ApiResult<()> {
    let maturity_observations = snapshot
        .utxos
        .iter()
        .filter_map(|coin| {
            coin.policy_maturity.as_ref().map(|maturity| {
                let rank = match maturity.state {
                    MaturityState::Unconfirmed | MaturityState::Immature => 0,
                    MaturityState::Approaching => 1,
                    MaturityState::Mature => 2,
                };
                notifications::PolicyMaturityObservation {
                    outpoint: coin.outpoint.clone(),
                    rank,
                    remaining_blocks: maturity.remaining_blocks,
                    policy_type: maturity.policy_type.clone(),
                }
            })
        })
        .collect::<Vec<_>>();
    notifications::reconcile_policy_maturity(db, &maturity_observations, now())
        .map_err(internal)?;
    let events = snapshot_notifications(snapshot);
    if !notifications::history_initialized(db).map_err(internal)? {
        notifications::seed_history_in_transaction(db, &events, now()).map_err(internal)?;
        return Ok(());
    }
    for event in &events {
        notifications::enqueue(db, event, now()).map_err(internal)?;
    }
    Ok(())
}

#[path = "wallet/profile_commands.rs"]
pub(crate) mod profile_commands;

#[derive(Debug)]
struct VerifiedHardwareIdentity {
    device_type: String,
    fingerprint: String,
}

#[cfg(test)]
fn connected_hardware_identity(
    device: HwiDevice,
    expected_fingerprints: &[String],
) -> ApiResult<VerifiedHardwareIdentity> {
    let fingerprint = device
        .fingerprint
        .ok_or_else(|| missing_hardware_fingerprint(&device.device_type))?;
    if !expected_fingerprints
        .iter()
        .any(|expected| expected.eq_ignore_ascii_case(&fingerprint))
    {
        return Err(unknown_hardware_signer());
    }
    Ok(VerifiedHardwareIdentity {
        device_type: device.device_type,
        fingerprint,
    })
}

#[path = "wallet/hardware_commands.rs"]
pub(crate) mod hardware_commands;

#[path = "wallet/multisig_setup_commands.rs"]
pub(crate) mod multisig_setup_commands;

fn validate_manual_outpoints(values: &[String], frozen: &[OutPoint]) -> ApiResult<Vec<OutPoint>> {
    // A 10,000-input transaction is already far beyond normal wallet use and
    // remains below Bitcoin's absolute block-weight envelope. This cap bounds
    // parsing, hashing, and BDK work after Tauri has decoded the request.
    const MAX_MANUAL_OUTPOINTS: usize = 10_000;
    if values.len() > MAX_MANUAL_OUTPOINTS {
        return Err(api_error(
            "invalid_coin",
            "Too many coins were selected for one payment.",
        ));
    }
    if values.is_empty() {
        return Err(api_error(
            "invalid_coin",
            "Select at least one available coin.",
        ));
    }
    let selected = values
        .iter()
        .map(|value| {
            OutPoint::from_str(value)
                .map_err(|_| api_error("invalid_coin", "A selected coin outpoint is invalid."))
        })
        .collect::<ApiResult<Vec<_>>>()?;
    if selected.iter().collect::<HashSet<_>>().len() != selected.len() {
        return Err(api_error(
            "invalid_coin",
            "A coin cannot be selected more than once.",
        ));
    }
    if selected.iter().any(|item| frozen.contains(item)) {
        return Err(api_error(
            "coin_unavailable",
            "Unfreeze selected coins before spending them.",
        ));
    }
    Ok(selected)
}

type PolicyPath = BTreeMap<String, Vec<usize>>;
type KeychainPolicyPath = (KeychainKind, PolicyPath);

struct AutomaticPaymentOptions<'a> {
    recipient: &'a Address,
    amount: u64,
    rate: FeeRate,
    frozen: Vec<OutPoint>,
    strategy: AutomaticSelectionStrategy,
    privacy: std::collections::HashMap<String, crate::privacy_selection::CoinPrivacy>,
    global_xpubs: bool,
    policy_paths: Vec<KeychainPolicyPath>,
}

fn policy_contains_relative_timelock(item: &SatisfiableItem) -> bool {
    match item {
        SatisfiableItem::RelativeTimelock { .. } => true,
        SatisfiableItem::Thresh { items, .. } => items
            .iter()
            .any(|policy| policy_contains_relative_timelock(&policy.item)),
        _ => false,
    }
}

fn immediate_policy_path(wallet: &Wallet, keychain: KeychainKind) -> ApiResult<PolicyPath> {
    let policy = wallet
        .policies(keychain)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_corrupt", "The wallet spending policy is missing."))?;
    let SatisfiableItem::Thresh { items, threshold } = &policy.item else {
        return Err(api_error(
            "wallet_corrupt",
            "The delayed wallet spending policy is not selectable.",
        ));
    };
    if *threshold != 1 || items.len() != 2 {
        return Err(api_error(
            "wallet_corrupt",
            "The delayed wallet spending policy has an unexpected branch shape.",
        ));
    }
    let candidates = items
        .iter()
        .enumerate()
        .filter(|(_, item)| !policy_contains_relative_timelock(&item.item))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if candidates.len() != 1 {
        return Err(api_error(
            "wallet_corrupt",
            "The immediate wallet spending branch is ambiguous.",
        ));
    }
    Ok([(policy.id, vec![candidates[0]])].into_iter().collect())
}

fn immediate_policy_paths(wallet: &Wallet) -> ApiResult<Vec<KeychainPolicyPath>> {
    [KeychainKind::External, KeychainKind::Internal]
        .into_iter()
        .map(|keychain| immediate_policy_path(wallet, keychain).map(|path| (keychain, path)))
        .collect()
}

fn delayed_policy_path(wallet: &Wallet, keychain: KeychainKind) -> ApiResult<PolicyPath> {
    let policy = wallet
        .policies(keychain)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_corrupt", "The wallet spending policy is missing."))?;
    let SatisfiableItem::Thresh { items, threshold } = &policy.item else {
        return Err(api_error(
            "wallet_corrupt",
            "The delayed wallet spending policy is not selectable.",
        ));
    };
    if *threshold != 1 || items.len() != 2 {
        return Err(api_error(
            "wallet_corrupt",
            "The delayed wallet spending policy has an unexpected branch shape.",
        ));
    }
    let candidates = items
        .iter()
        .enumerate()
        .filter(|(_, item)| policy_contains_relative_timelock(&item.item))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if candidates.len() != 1 {
        return Err(api_error(
            "wallet_corrupt",
            "The delayed wallet spending branch is ambiguous.",
        ));
    }
    Ok([(policy.id, vec![candidates[0]])].into_iter().collect())
}

fn delayed_policy_paths(wallet: &Wallet) -> ApiResult<Vec<KeychainPolicyPath>> {
    [KeychainKind::External, KeychainKind::Internal]
        .into_iter()
        .map(|keychain| delayed_policy_path(wallet, keychain).map(|path| (keychain, path)))
        .collect()
}

fn build_automatic_payment(
    wallet: &mut Wallet,
    options: AutomaticPaymentOptions<'_>,
) -> ApiResult<Psbt> {
    let AutomaticPaymentOptions {
        recipient,
        amount,
        rate,
        frozen,
        strategy,
        privacy,
        global_xpubs,
        policy_paths,
    } = options;
    let mut builder = wallet
        .build_tx()
        .coin_selection(PrivacyAwareCoinSelection::new(strategy, privacy));
    builder
        .add_recipient(recipient.script_pubkey(), Amount::from_sat(amount))
        .fee_rate(rate)
        .unspendable(frozen);
    for (keychain, path) in policy_paths {
        builder.policy_path(path, keychain);
    }
    if global_xpubs {
        builder.add_global_xpubs();
    }
    builder.finish().map_err(create_tx_api_error)
}

fn fee_difference(fee: u64, private_fee: Option<u64>) -> ApiResult<Option<i64>> {
    private_fee
        .map(|private_fee| {
            let fee = i64::try_from(fee).map_err(|_| internal("Fee exceeds comparison range."))?;
            let private_fee = i64::try_from(private_fee)
                .map_err(|_| internal("Private candidate fee exceeds comparison range."))?;
            fee.checked_sub(private_fee)
                .ok_or_else(|| internal("Fee comparison overflowed."))
        })
        .transpose()
}

#[tauri::command]
pub fn coin_selection_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    outpoints: Vec<String>,
    amount: u64,
) -> ApiResult<CoinSelectionPreviewDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    manual_selection_preview(&db, &wallet, &outpoints, amount)
}

#[tauri::command]
pub fn multisig_coin_selection_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    outpoints: Vec<String>,
    amount: u64,
) -> ApiResult<CoinSelectionPreviewDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    manual_selection_preview(&db, &wallet, &outpoints, amount)
}

#[path = "wallet/multisig_proposal_commands.rs"]
pub(crate) mod multisig_proposal_commands;

pub(crate) mod explorer_commands;
pub(crate) mod label_interchange;
#[path = "wallet/transaction_commands.rs"]
pub(crate) mod transaction_commands;

#[path = "wallet/payment_draft_commands.rs"]
pub(crate) mod payment_draft_commands;

#[tauri::command]
pub fn wallet_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
    confirmation: String,
) -> ApiResult<()> {
    let credential = Zeroizing::new(credential);
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    if confirmation != "DELETE" {
        return Err(api_error(
            "confirmation_mismatch",
            "Type DELETE exactly to remove this wallet.",
        ));
    }
    check_auth_throttle(&app, &state)?;
    let profile = selected_profile(&app)?;
    let verified = match profile.kind {
        WalletKind::SingleKey => decrypt_mnemonic(&app, credential.as_str()).map(|_| ()),
        WalletKind::WatchOnly => verify_external_signer_credential(&app, credential.as_str()),
        WalletKind::Multisig => Err(api_error(
            "wrong_wallet_kind",
            "Delete multisig wallets from the wallet settings.",
        )),
    };
    record_auth_result(&app, &state, &verified)?;
    verified?;
    state.proposals.lock().map_err(internal)?.clear();
    let dir = profile_directory(&app, profile.id)?;
    delete_registered_wallet(&app, profile.id, &dir)?;
    lock_wallet(&state, profile.id)?;
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::WalletRemoved,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::wallet_kind(profile.kind)),
            ..Default::default()
        },
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn wallet_reset_regtest(
    app: AppHandle,
    state: State<'_, AppState>,
    confirmation: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    validate_regtest_reset_confirmation(&confirmation)?;
    state.proposals.lock().map_err(internal)?.clear();
    let profile = selected_profile(&app)?;
    delete_registered_wallet(&app, profile.id, &profile_directory(&app, profile.id)?)?;
    lock_wallet(&state, profile.id)?;
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::WalletRemoved,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::wallet_kind(profile.kind)),
            ..Default::default()
        },
        None,
    );
    Ok(())
}

fn validate_regtest_reset_confirmation(confirmation: &str) -> ApiResult<()> {
    validate_regtest_reset_confirmation_for(IS_REGTEST, confirmation)
}

fn validate_regtest_reset_confirmation_for(is_regtest: bool, confirmation: &str) -> ApiResult<()> {
    if !is_regtest {
        Err(api_error(
            "wrong_network",
            "Disposable wallet reset is available only in Regtest builds.",
        ))
    } else if confirmation == "RESET REGTEST" {
        Ok(())
    } else {
        Err(api_error(
            "confirmation_mismatch",
            "Type RESET REGTEST exactly.",
        ))
    }
}

#[cfg(test)]
fn delete_wallet_directory(path: &Path) -> ApiResult<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(internal(error)),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(internal("Wallet storage is not a regular directory."));
    }
    let parent = path
        .parent()
        .ok_or_else(|| internal("Wallet storage path has no parent."))?;
    let tombstone = parent.join(format!(".groot-deleting-{}", Uuid::new_v4()));
    fs::rename(path, &tombstone).map_err(internal)?;
    fs::remove_dir_all(tombstone).map_err(internal)
}

fn delete_registered_wallet(app: &AppHandle, id: Uuid, path: &Path) -> ApiResult<()> {
    let metadata = fs::symlink_metadata(path).map_err(internal)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(internal("Wallet storage is not a regular directory."));
    }
    let parent = path
        .parent()
        .ok_or_else(|| internal("Wallet storage path has no parent."))?;
    let tombstone = parent.join(format!(".groot-deleting-{}", Uuid::new_v4()));
    let original_registry = load_registry(app)?;
    let mut updated_registry = original_registry.clone();
    updated_registry.remove(id).map_err(registry_api_error)?;
    fs::rename(path, &tombstone).map_err(internal)?;
    if let Err(error) = save_registry(app, &updated_registry) {
        let _ = fs::rename(&tombstone, path);
        return Err(error);
    }
    if let Err(error) = fs::remove_dir_all(&tombstone) {
        let _ = save_registry(app, &original_registry);
        let _ = fs::rename(&tombstone, path);
        return Err(internal(error));
    }
    Ok(())
}

#[cfg(test)]
#[path = "wallet/funded_acceleration_tests.rs"]
mod funded_acceleration_tests;

#[cfg(test)]
#[path = "wallet/performance_tests.rs"]
mod performance_tests;
#[cfg(test)]
mod tests;
