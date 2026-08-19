use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_bitcoind_rpc::{
    bitcoincore_rpc::{json::EstimateMode, Auth, Client, RpcApi},
    Emitter,
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
    descriptor::{Descriptor, DescriptorPublicKey},
    error::CreateTxError,
    psbt::PsbtUtils,
    rusqlite::{
        config::DbConfig, params, Connection, OptionalExtension, Transaction as SqliteTransaction,
    },
    template::{Bip84, Bip84Public},
    KeychainKind, PersistedWallet, SignOptions, Update, Wallet,
};
use bip39::Mnemonic;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::auth::AuthThrottle;
use crate::bsms::{BsmsError, DescriptorRecord, PublicDescriptorPair};
use crate::build_network::{
    DEFAULT_RPC_URL, IS_REGTEST, NAME as NETWORK_NAME, NETWORK, PARAMETERS,
};
use crate::external_signer::{
    self, ExternalSignerError, ExternalSignerInput, ExternalSignerWallet, SignerSource,
    SINGLESIG_ACCOUNT_PATH,
};
use crate::hardware::{HardwareError, HardwareTransport, HwiChain, HwiCli};
use crate::label_provenance::{
    self, LabelOrigin, PermanentLabelDto, ProvenanceState, ProvenanceSummaryDto,
};
use crate::multisig::{
    CosignerInput, CosignerSource, MultisigPreviewDto, MultisigWalletDto, PolicyError, PolicyInput,
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
use crate::recovery::{analyze_template, PolicyAnalysis, RecoveryError, RecoveryTemplate};
use crate::registry::{self, RegistryError, WalletKind, WalletProfile, WalletRegistry};
use crate::secure_store::{self, SecureStoreError};
use crate::session::WalletSessions;
use crate::ur_transport::{self, UrTransportError};

const MAX_PRIVATE_JSON_BYTES: u64 = 256 * 1024;
const MAX_CREDENTIAL_BYTES: usize = 1_024;
const MAX_MNEMONIC_INPUT_BYTES: usize = 4_096;
const ONBOARDING_SESSION_SECONDS: u64 = 15 * 60;
const HARDWARE_PIN_CHALLENGE_TIMEOUT: Duration = Duration::from_secs(2 * 60);
const MAX_HARDWARE_PIN_POSITIONS: usize = 50;
const MAX_PUBLIC_BACKUP_BYTES: usize = 256 * 1024;
const REGTEST_APP_DATA_OVERRIDE: &str = "GROOT_REGTEST_APP_DATA_DIR";
const MIN_RECOVERY_GAP_LIMIT: u32 = 20;
const MAX_RECOVERY_GAP_LIMIT: u32 = 1_000;
const MIN_SUPPLEMENTAL_COIN_FLIPS: usize = 128;
const MAX_SUPPLEMENTAL_COIN_FLIPS: usize = 256;
const MIN_SUPPLEMENTAL_DICE_ROLLS: usize = 50;
const MAX_SUPPLEMENTAL_DICE_ROLLS: usize = 100;
const SUPPLEMENTAL_TRANSCRIPT_DOMAIN: &[u8] = b"Groot supplemental entropy transcript v1";
const SUPPLEMENTAL_MIX_DOMAIN: &[u8] = b"Groot BIP39 entropy mix v1";
const SAVED_FILE_REVEAL_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const RPC_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFileDto {
    pub saved: bool,
    pub reveal_token: Option<String>,
    pub reveal_label: Option<String>,
}

fn validate_public_backup_filename(value: &str) -> ApiResult<&str> {
    let trimmed = value.trim();
    let valid_extension =
        trimmed.ends_with(".bsms") || trimmed.ends_with(".json") || trimmed.ends_with(".txt");
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.contains(['/', '\\', '\0'])
        || !valid_extension
    {
        return Err(api_error(
            "invalid_backup",
            "Choose a valid .bsms, .json, or .txt backup name.",
        ));
    }
    Ok(trimmed)
}

fn validate_psbt_filename(value: &str) -> ApiResult<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.contains(['/', '\\', '\0'])
        || !trimmed.ends_with(".psbt")
    {
        return Err(api_error(
            "invalid_backup",
            "Choose a valid .psbt filename.",
        ));
    }
    Ok(trimmed)
}

fn write_public_export(path: &Path, content: &[u8]) -> ApiResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| internal("The selected export path has no parent directory."))?;
    let temp = parent.join(format!(".groot-export-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(internal)?;
        file.write_all(content).map_err(internal)?;
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

#[tauri::command]
pub async fn public_backup_save(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
    content: String,
) -> ApiResult<SavedFileDto> {
    let filename = validate_public_backup_filename(&suggested_filename)?.to_owned();
    if content.is_empty() || content.len() > MAX_PUBLIC_BACKUP_BYTES {
        return Err(api_error(
            "invalid_backup",
            "The public backup has an invalid size.",
        ));
    }
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        let extension = if filename.ends_with(".bsms") {
            "bsms"
        } else if filename.ends_with(".txt") {
            "txt"
        } else {
            "json"
        };
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Groot public backup", &[extension])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(internal)?;
        write_public_export(&path, content.as_bytes())?;
        Ok(Some(path))
    })
    .await
    .map_err(internal)??;
    saved_file_result(&state, saved_path)
}

#[tauri::command]
pub async fn psbt_file_save(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
    psbt: String,
) -> ApiResult<SavedFileDto> {
    let filename = validate_psbt_filename(&suggested_filename)?.to_owned();
    let content = psbt.trim().to_owned();
    decode_psbt(&content).map_err(proposal_api_error)?;
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Partially signed Bitcoin transaction", &["psbt"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(internal)?;
        write_public_export(&path, content.as_bytes())?;
        Ok(Some(path))
    })
    .await
    .map_err(internal)??;
    saved_file_result(&state, saved_path)
}

fn saved_file_result(state: &AppState, saved_path: Option<PathBuf>) -> ApiResult<SavedFileDto> {
    let Some(path) = saved_path else {
        return Ok(SavedFileDto {
            saved: false,
            reveal_token: None,
            reveal_label: None,
        });
    };

    #[cfg(target_os = "macos")]
    {
        let token = Uuid::new_v4().to_string();
        let now = Instant::now();
        let mut saved_files = state.saved_files.lock().map_err(internal)?;
        saved_files
            .retain(|_, saved| now.duration_since(saved.saved_at) <= SAVED_FILE_REVEAL_TIMEOUT);
        if saved_files.len() >= 16 {
            saved_files.clear();
        }
        saved_files.insert(
            token.clone(),
            SavedFileReveal {
                path,
                saved_at: now,
            },
        );
        Ok(SavedFileDto {
            saved: true,
            reveal_token: Some(token),
            reveal_label: Some("Show in Finder".to_owned()),
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        let _ = path;
        Ok(SavedFileDto {
            saved: true,
            reveal_token: None,
            reveal_label: None,
        })
    }
}

#[tauri::command]
pub async fn psbt_file_reveal(
    app: AppHandle,
    state: State<'_, AppState>,
    reveal_token: String,
) -> ApiResult<()> {
    Uuid::parse_str(&reveal_token).map_err(|_| {
        api_error(
            "file_reveal_unavailable",
            "This saved-file shortcut is no longer available.",
        )
    })?;
    let saved = state
        .saved_files
        .lock()
        .map_err(internal)
        .and_then(|mut saved_files| {
            consume_saved_file_token(&mut saved_files, &reveal_token, Instant::now()).ok_or_else(
                || {
                    api_error(
                        "file_reveal_unavailable",
                        "This saved-file shortcut expired. The file remains saved.",
                    )
                },
            )
        })?;
    if !saved.path.is_file() {
        return Err(api_error(
            "file_reveal_unavailable",
            "The file was moved or is no longer available at its saved location.",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || reveal_saved_file(&app, saved.path))
        .await
        .map_err(internal)?
}

fn consume_saved_file_token(
    saved_files: &mut HashMap<String, SavedFileReveal>,
    reveal_token: &str,
    now: Instant,
) -> Option<SavedFileReveal> {
    if Uuid::parse_str(reveal_token).is_err() {
        return None;
    }
    saved_files.retain(|_, saved| now.duration_since(saved.saved_at) <= SAVED_FILE_REVEAL_TIMEOUT);
    saved_files.remove(reveal_token)
}

#[cfg(target_os = "macos")]
fn reveal_saved_file(app: &AppHandle, path: PathBuf) -> ApiResult<()> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;
    use std::sync::mpsc::sync_channel;

    let parent = path
        .parent()
        .ok_or_else(|| internal("The saved file has no parent directory."))?
        .to_owned();
    let full_path = path.to_string_lossy().into_owned();
    let parent_path = parent.to_string_lossy().into_owned();
    let (sender, receiver) = sync_channel(1);
    app.run_on_main_thread(move || {
        let revealed = autoreleasepool(|_| {
            NSWorkspace::sharedWorkspace().selectFile_inFileViewerRootedAtPath(
                Some(&NSString::from_str(&full_path)),
                &NSString::from_str(&parent_path),
            )
        });
        let _ = sender.send(revealed);
    })
    .map_err(internal)?;
    if receiver.recv().map_err(internal)? {
        Ok(())
    } else {
        Err(api_error(
            "file_reveal_unavailable",
            "Finder could not reveal the saved file.",
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn reveal_saved_file(_app: &AppHandle, _path: PathBuf) -> ApiResult<()> {
    Err(api_error(
        "file_reveal_unavailable",
        "Showing saved files is not available on this platform yet.",
    ))
}

#[tauri::command]
pub fn public_backup_print(window: WebviewWindow) -> ApiResult<()> {
    window.print().map_err(internal)
}

fn hwi_cli(app: &AppHandle) -> ApiResult<HwiCli> {
    let home = app.path().home_dir().map_err(internal)?;
    HwiCli::for_chain(HwiChain::for_network(NETWORK))
        .with_home(home)
        .map_err(hardware_api_error)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    code: &'static str,
    message: String,
}

type ApiResult<T> = Result<T, ApiError>;

const RPC_UNAVAILABLE_MESSAGE: &str = "Could not connect to Bitcoin Core. Check that the node is running and review the RPC address, authentication, and network settings.";

fn api_error(code: &'static str, message: impl ToString) -> ApiError {
    ApiError {
        code,
        message: message.to_string(),
    }
}

fn rpc_unavailable() -> ApiError {
    api_error("network_unavailable", RPC_UNAVAILABLE_MESSAGE)
}

fn compact_filter_unavailable() -> ApiError {
    api_error(
        "network_unavailable",
        "Could not sync from the configured Bitcoin peers. Check the peer and proxy settings, then try again.",
    )
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
    let idle_timeout = Duration::from_secs(u64::from(registry.inactivity_timeout_minutes) * 60);
    let now = Instant::now();
    let (expired_wallets, authorized) = {
        let mut sessions = state.unlocked_wallets.lock().map_err(internal)?;
        let expired_wallets = sessions.prune_expired_at(now, idle_timeout);
        let authorized = sessions.authorize_at(selected, record_activity, now, idle_timeout);
        (expired_wallets, authorized)
    };
    if !expired_wallets.is_empty() || !authorized {
        let mut node_auth = state.node_auth.lock().map_err(internal)?;
        let mut authenticated_descriptors = state
            .authenticated_software_descriptors
            .lock()
            .map_err(internal)?;
        for wallet_id in expired_wallets {
            node_auth.remove(&wallet_id);
            authenticated_descriptors.remove(&wallet_id);
        }
        if !authorized {
            node_auth.remove(&selected);
            authenticated_descriptors.remove(&selected);
        }
    }
    if authorized {
        return Ok(selected);
    }
    Err(api_error(
        "wallet_locked",
        "Enter your passphrase / PIN to unlock Groot.",
    ))
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
    Ok(())
}

#[derive(Default)]
pub struct AppState {
    operations: Mutex<()>,
    proposals: Mutex<HashMap<String, PendingProposal>>,
    unlocked_wallets: Mutex<WalletSessions>,
    pending_mnemonic: Mutex<Option<PendingMnemonic>>,
    verified_recovery: Mutex<HashMap<Uuid, String>>,
    pending_hardware_pins: Mutex<HashMap<String, PendingHardwarePin>>,
    recent_hardware_scan: Mutex<Option<RecentHardwareScan>>,
    node_auth: Mutex<HashMap<Uuid, NodeAuthSession>>,
    authenticated_software_descriptors: Mutex<HashMap<Uuid, (String, String)>>,
    saved_files: Mutex<HashMap<String, SavedFileReveal>>,
    recovery_scans: Mutex<HashMap<Uuid, ActiveRecoveryScan>>,
    runtime_auth_retry_at: Mutex<HashMap<Uuid, Instant>>,
    pending_policy_verifications: Mutex<HashMap<String, SignerPolicyVerificationDto>>,
    sync_status: Arc<Mutex<Option<WalletSyncStatusDto>>>,
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
    current.state = if result.is_ok() {
        "completed"
    } else {
        "failed"
    };
    current.last_verified_height = verified_height;
    current.updated_at = now();
}

struct ActiveRecoveryScan {
    run_id: String,
    cancel: Arc<AtomicBool>,
}

struct SavedFileReveal {
    path: PathBuf,
    saved_at: Instant,
}

struct NodeAuthSession {
    config: CoreNodeConfig,
    password: Zeroizing<String>,
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
    if actual == expected {
        return true;
    }
    if !IS_REGTEST {
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
    input_count: Option<usize>,
    output_count: Option<usize>,
    fee_rate: Option<f64>,
    wallet_input_amount: Option<u64>,
    wallet_output_amount: Option<u64>,
    locktime: Option<u32>,
    rbf: Option<bool>,
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSnapshotDto {
    network: &'static str,
    balance: BalanceDto,
    transactions: Vec<TransactionDto>,
    utxos: Vec<UtxoDto>,
    receive_addresses: Vec<ReceiveAddressDto>,
    synced_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeEstimatesDto {
    economy: f64,
    standard: f64,
    priority: f64,
    source: &'static str,
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

#[tauri::command]
pub fn payjoin_uri_inspect(
    value: String,
) -> ApiResult<crate::payjoin_support::PayjoinUriInspection> {
    crate::payjoin_support::inspect_uri(&value, NETWORK)
        .map_err(|error| api_error("invalid_payjoin_uri", error))
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
    label: String,
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

#[derive(Debug, Clone, Copy, Deserialize)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareHealthCheckInput {
    status: String,
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
    label: String,
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
    status: String,
    created_at: String,
    selection_impact: SelectionImpactDto,
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
        Some(-3 | -12) => "The device is locked or another wallet app owns its USB session. Follow the unlock prompt shown by Groot or the device. If another wallet app is open, quit it, reconnect, then try again. A locked Trezor Model One can be unlocked from its Groot device card.",
        Some(-14) => "The action was cancelled on the hardware wallet.",
        Some(-15) => "The hardware wallet is busy. Finish the current action and try again.",
        Some(-8 | -9) => "This hardware wallet does not support the requested operation.",
        Some(-1 | -2 | -4 | -7) => "Groot could not select the enumerated hardware wallet.",
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
    if matches!(code, Some(-3 | -12 | -14 | -15 | -8 | -9)) {
        return missing_hwi_value(code, fallback);
    }
    match device_type.to_ascii_lowercase().as_str() {
        "ledger" => {
            let safe_detail = hwi_message.unwrap_or_default().to_ascii_lowercase();
            let message = if code == Some(-7) || safe_detail.contains("bad argument") {
                "Ledger rejected this test-chain account path. Open the Bitcoin Test app—not the main Bitcoin app—then reconnect and try again."
            } else if code == Some(-13)
                || safe_detail.contains("technical problem")
                || safe_detail.contains("device failure")
            {
                "Ledger is in the wrong app for this Regtest wallet. Quit Ledger Live, open Bitcoin Test—not Bitcoin—then reconnect and try again."
            } else if safe_detail.contains("bitcoin test")
                || safe_detail.contains("not in either the bitcoin")
            {
                "Open the Bitcoin or Bitcoin Test app on Ledger, keep Ledger Live closed, then try again."
            } else if derivation_path.starts_with("m/48'") {
                "Ledger did not return the Regtest multisig account key. Keep Ledger Live closed, open Bitcoin Test, try again, then approve the public-key export if Ledger asks."
            } else {
                "Ledger did not return the Regtest BIP84 account key. Keep Ledger Live closed, open Bitcoin Test—not Bitcoin—reconnect, then try again."
            };
            api_error("hardware_unavailable", message)
        }
        "bitbox02" => api_error(
            "hardware_unavailable",
            "BitBox02 did not export the account key. Reconnect it, scan again, and enter the device password when prompted. If BitBoxApp is open, quit it so Groot can use USB. Use BitBoxApp only if Groot reports that first-time pairing is required.",
        ),
        "trezor" | "keepkey" => {
            let safe_detail = hwi_message.unwrap_or_default().to_ascii_lowercase();
            let message = if code == Some(-13)
                && safe_detail.contains("unsupported trezor model")
            {
                "The installed Bitcoin Core HWI does not support this Trezor model. Install Groot's reviewed HWI 3.2.0 boundary, restart Groot, then scan again."
            } else {
                "Trezor did not export the account key. Complete the PIN or wallet selection shown by Groot and the device, then try again."
            };
            api_error("hardware_unavailable", message)
        }
        "jade" => api_error(
            "hardware_unavailable",
            "Jade did not export the account key. Log in on-device, keep Jade unlocked and connected, then try again.",
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
    let pin_required = matches!(device_type.as_str(), "trezor" | "keepkey")
        && (device.needs_pin_sent || (device.code == Some(-12) && !device.needs_passphrase_sent));
    let unsupported_trezor_model = matches!(device_type.as_str(), "trezor" | "keepkey")
        && device.code == Some(-13)
        && device
            .error
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .contains("unsupported trezor model");
    let (status, message, action) = if unsupported_trezor_model {
        (
            "not_ready",
            "The installed Bitcoin Core HWI does not support this Trezor model. Install Groot's reviewed HWI 3.2.0 boundary, restart Groot, then scan again.",
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
            "needs_companion",
            "Reconnect BitBox02, scan again, and enter the device password when prompted. If Groot reports that first-time pairing is required, complete that pairing in BitBoxApp, quit it, then rescan.",
            "retry",
        )
    } else if device_type == "jade" {
        (
            "needs_device_unlock",
            "Log in on Jade using Recovery Phrase Login or QR PIN Unlock, then keep it connected and scan again.",
            "retry",
        )
    } else if device_type == "ledger" {
        (
            "needs_device_unlock",
            "For Regtest, unlock Ledger and open Bitcoin Test—not Bitcoin—then scan again.",
            "retry",
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
        id: device.path,
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

fn registry_api_error(error: RegistryError) -> ApiError {
    match error {
        RegistryError::Missing => api_error("wallet_not_found", "No wallet exists on this device."),
        RegistryError::UnknownSelection => {
            api_error("wallet_not_found", "Select an available wallet first.")
        }
        RegistryError::InvalidName => api_error(
            "invalid_wallet_name",
            "Wallet names must contain 1 to 48 characters.",
        ),
        RegistryError::InvalidInactivityTimeout => api_error(
            "invalid_inactivity_timeout",
            "Automatic lock must be 1, 5, 15, 30, or 60 minutes.",
        ),
        RegistryError::DuplicateIdentity => api_error(
            "wallet_already_exists",
            "This descriptor wallet already exists on this device.",
        ),
        RegistryError::Corrupt | RegistryError::UnsupportedVersion => api_error(
            "wallet_corrupt",
            "The wallet registry is corrupt or unsupported. No wallet was opened.",
        ),
        _ => api_error(
            "internal_error",
            "The wallet registry could not be updated.",
        ),
    }
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
    directory: &Path,
    id: Uuid,
    kind: WalletKind,
) -> ApiResult<WalletProfile> {
    let (name, checksum) = match kind {
        WalletKind::SingleKey => {
            let mut db = open_wallet_database(&directory.join("wallet.sqlite"))?;
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
        registry
            .add(profile_from_directory(&legacy_directory, id, kind)?)
            .map_err(registry_api_error)?;
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

fn open_wallet_database(path: &Path) -> ApiResult<Connection> {
    crate::release_policy::ensure_runtime_network_enabled(NETWORK)
        .map_err(|_| internal("This build is not authorized to open a mainnet wallet database."))?;
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

fn commit_profile(app: &AppHandle, profile: WalletProfile) -> ApiResult<()> {
    let mut registry = load_registry(app)?;
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
    )
}

fn regtest_dir() -> ApiResult<PathBuf> {
    if let Some(path) = std::env::var_os("GROOT_REGTEST_DIR") {
        return Ok(PathBuf::from(path));
    }

    default_regtest_dir()
}

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

fn node_config_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    Ok(profile_directory(app, profile.id)?.join("node.json"))
}

fn node_secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    Ok(profile_directory(app, profile.id)?.join("node-secret.json"))
}

fn sync_source_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    Ok(profile_directory(app, profile.id)?.join("sync-source.json"))
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

fn network_config_api_error(error: NetworkConfigError) -> ApiError {
    let message = match error {
        NetworkConfigError::InvalidUrl => "Enter a valid node URL and RPC username.",
        NetworkConfigError::InsecureRemote => {
            "Local nodes must use loopback. Remote nodes require HTTPS and username/password authentication."
        }
        NetworkConfigError::CredentialsInUrl => {
            "Do not place RPC credentials in the URL. Use the protected credential fields."
        }
        NetworkConfigError::UnsupportedScheme => "This build supports Bitcoin Core RPC backends only.",
        NetworkConfigError::UnknownPreset => "The selected backend preset is not recognized.",
        NetworkConfigError::InvalidProxy => {
            "Tor requires an HTTP v3 .onion RPC URL and a loopback SOCKS5 proxy such as 127.0.0.1:9050."
        }
        NetworkConfigError::InvalidPeerConfiguration => {
            "Enter valid numeric IP:port peers and require no more peers than manual mode provides."
        }
        NetworkConfigError::InsufficientPeerDiversity => {
            "Public test networks require at least two compact-filter peers."
        }
        NetworkConfigError::ProxyDnsLeak => {
            "Tor compact-filter sync requires manual numeric peers with public discovery disabled to prevent local DNS leaks."
        }
    };
    api_error("invalid_node_config", message)
}

fn read_node_config(app: &AppHandle) -> ApiResult<CoreNodeConfig> {
    let path = node_config_path(app)?;
    if !path.exists() {
        return Ok(default_node_config());
    }
    let config: CoreNodeConfig =
        serde_json::from_str(&read_private_text(&path)?).map_err(internal)?;
    config.validate().map_err(network_config_api_error)?;
    Ok(config)
}

fn read_sync_source(app: &AppHandle) -> ApiResult<WalletSyncSource> {
    let path = sync_source_path(app)?;
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

fn network_config_api_error_from_url(_: url::ParseError) -> ApiError {
    network_config_api_error(NetworkConfigError::InvalidUrl)
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
        let plaintext =
            Zeroizing::new(secure_store::load(&path, credential).map_err(secure_store_error)?);
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
        Some(NodeAuthSession { config, password })
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
    let url = config
        .validate()
        .map_err(network_config_api_error)?
        .to_string();
    match config.auth {
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
    }
}

fn candidate_rpc_client(config: &CoreNodeConfig, password: &str) -> ApiResult<Client> {
    let url = config
        .validate()
        .map_err(network_config_api_error)?
        .to_string();
    match config.auth {
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
    }
}

fn checked_chain_identity(client: &Client) -> ApiResult<(u64, BlockHash)> {
    let info = client
        .get_blockchain_info()
        .map_err(|_| rpc_unavailable())?;
    ensure_expected_network(info.chain)?;
    let observed_genesis = client.get_block_hash(0).map_err(|_| rpc_unavailable())?;
    ensure_expected_genesis(NETWORK, observed_genesis)?;
    Ok((info.blocks, observed_genesis))
}

fn checked_block_height(client: &Client) -> ApiResult<u64> {
    checked_chain_identity(client).map(|(height, _)| height)
}

fn checked_node_status(client: &Client, backend: CoreNodeConfig) -> ApiResult<NodeStatusDto> {
    let info = client
        .get_blockchain_info()
        .map_err(|_| rpc_unavailable())?;
    ensure_expected_network(info.chain)?;
    let observed_genesis = client.get_block_hash(0).map_err(|_| rpc_unavailable())?;
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

fn normalize_label(label: &str) -> ApiResult<String> {
    let label = label.trim();
    if label.is_empty() {
        return Err(api_error("invalid_label", "A permanent label is required."));
    }
    if label.chars().count() > 48 {
        return Err(api_error(
            "invalid_label",
            "The permanent label must be 48 characters or fewer.",
        ));
    }
    Ok(label.to_owned())
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
        );",
    )
    .map_err(internal)?;
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

fn open_auth_db(app: &AppHandle) -> ApiResult<Connection> {
    let profile = selected_profile(app)?;
    let path = profile_directory(app, profile.id)?.join("wallet.sqlite");
    if !path.is_file() {
        return Err(api_error(
            "wallet_not_found",
            "The selected wallet database could not be found.",
        ));
    }
    let db = open_wallet_database(&path)?;
    init_app_schema(&db)?;
    Ok(db)
}

fn load_auth_throttle(db: &Connection) -> ApiResult<AuthThrottle> {
    let persisted = db
        .query_row(
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

fn save_auth_throttle(db: &mut Connection, throttle: &AuthThrottle) -> ApiResult<()> {
    let (failures, retry_at) = throttle.snapshot();
    db.execute(
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
    let mut db = open_wallet_database(&path)?;
    init_app_schema(&db)?;
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
    let mut db = open_wallet_database(&path)?;
    init_app_schema(&db)?;
    validate_selected_wallet_database_identity(app, &mut db, WalletKind::Multisig)?;
    Ok(db)
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

fn load_recovery_scan_settings(db: &Connection) -> ApiResult<RecoveryScanSettingsDto> {
    db.query_row(
        "SELECT birthday_height, gap_limit FROM groot_recovery_settings WHERE singleton = 1",
        [],
        |row| {
            Ok(RecoveryScanSettingsDto {
                birthday_height: row.get(0)?,
                gap_limit: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(internal)
    .map(|settings| {
        settings.unwrap_or(RecoveryScanSettingsDto {
            birthday_height: 0,
            gap_limit: MIN_RECOVERY_GAP_LIMIT,
        })
    })
}

struct RecoveryScanRecord {
    run_id: String,
    status: RecoveryScanStatusDto,
}

fn idle_recovery_scan_status(settings: &RecoveryScanSettingsDto) -> RecoveryScanStatusDto {
    RecoveryScanStatusDto {
        status: "idle".to_owned(),
        birthday_height: settings.birthday_height,
        gap_limit: settings.gap_limit,
        current_height: 0,
        target_height: 0,
        processed_blocks: 0,
        total_blocks: 0,
        started_at: 0,
        updated_at: 0,
    }
}

fn load_recovery_scan_record(db: &Connection) -> ApiResult<Option<RecoveryScanRecord>> {
    db.query_row(
        "SELECT run_id, status, birthday_height, gap_limit, current_height, target_height,
                processed_blocks, total_blocks, started_at, updated_at
         FROM groot_recovery_scans WHERE singleton = 1",
        [],
        |row| {
            Ok(RecoveryScanRecord {
                run_id: row.get(0)?,
                status: RecoveryScanStatusDto {
                    status: row.get(1)?,
                    birthday_height: row.get(2)?,
                    gap_limit: row.get(3)?,
                    current_height: row.get(4)?,
                    target_height: row.get(5)?,
                    processed_blocks: row.get(6)?,
                    total_blocks: row.get(7)?,
                    started_at: row.get(8)?,
                    updated_at: row.get(9)?,
                },
            })
        },
    )
    .optional()
    .map_err(internal)
}

fn reconcile_recovery_scan_record(
    db: &Connection,
    active_run_id: Option<&str>,
) -> ApiResult<Option<RecoveryScanRecord>> {
    let Some(mut record) = load_recovery_scan_record(db)? else {
        return Ok(None);
    };
    if matches!(record.status.status.as_str(), "running" | "cancelling")
        && active_run_id != Some(record.run_id.as_str())
    {
        let updated_at = now();
        let changed = db
            .execute(
                "UPDATE groot_recovery_scans SET status = 'interrupted', updated_at = ?1
                 WHERE singleton = 1 AND run_id = ?2 AND status IN ('running', 'cancelling')",
                params![updated_at, record.run_id],
            )
            .map_err(internal)?;
        if changed == 1 {
            record.status.status = "interrupted".to_owned();
            record.status.updated_at = updated_at;
        } else {
            return load_recovery_scan_record(db);
        }
    }
    Ok(Some(record))
}

fn start_recovery_scan_record(
    db: &Connection,
    run_id: &str,
    settings: &RecoveryScanSettingsDto,
    target_height: u32,
) -> ApiResult<RecoveryScanStatusDto> {
    let started_at = now();
    let total_blocks = target_height
        .saturating_sub(settings.birthday_height)
        .saturating_add(1);
    let status = RecoveryScanStatusDto {
        status: "running".to_owned(),
        birthday_height: settings.birthday_height,
        gap_limit: settings.gap_limit,
        current_height: settings.birthday_height.saturating_sub(1),
        target_height,
        processed_blocks: 0,
        total_blocks,
        started_at,
        updated_at: started_at,
    };
    db.execute(
        "INSERT INTO groot_recovery_scans
         (singleton, run_id, status, birthday_height, gap_limit, current_height, target_height,
          processed_blocks, total_blocks, started_at, updated_at)
         VALUES (1, ?1, 'running', ?2, ?3, ?4, ?5, 0, ?6, ?7, ?7)
         ON CONFLICT(singleton) DO UPDATE SET
           run_id = excluded.run_id, status = excluded.status,
           birthday_height = excluded.birthday_height, gap_limit = excluded.gap_limit,
           current_height = excluded.current_height, target_height = excluded.target_height,
           processed_blocks = excluded.processed_blocks, total_blocks = excluded.total_blocks,
           started_at = excluded.started_at, updated_at = excluded.updated_at",
        params![
            run_id,
            status.birthday_height,
            status.gap_limit,
            status.current_height,
            status.target_height,
            status.total_blocks,
            status.started_at,
        ],
    )
    .map_err(internal)?;
    Ok(status)
}

fn update_recovery_scan_progress(
    db: &Connection,
    run_id: &str,
    current_height: u32,
    processed_blocks: u32,
) -> ApiResult<()> {
    let changed = db
        .execute(
            "UPDATE groot_recovery_scans
             SET current_height = ?1, processed_blocks = ?2, updated_at = ?3
             WHERE singleton = 1 AND run_id = ?4 AND status IN ('running', 'cancelling')",
            params![current_height, processed_blocks, now(), run_id],
        )
        .map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "scan_interrupted",
            "Recovery scan state changed unexpectedly. Start the scan again.",
        ))
    }
}

fn finish_recovery_scan_record(db: &Connection, run_id: &str, status: &str) -> ApiResult<()> {
    let changed = db
        .execute(
            "UPDATE groot_recovery_scans SET status = ?1, updated_at = ?2
             WHERE singleton = 1 AND run_id = ?3 AND status IN ('running', 'cancelling')",
            params![status, now(), run_id],
        )
        .map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "scan_interrupted",
            "Recovery scan state changed unexpectedly. Start the scan again.",
        ))
    }
}

/// Returns the minimum stop-gap needed to rediscover every address Groot has
/// revealed, including late payments to currently unused or discarded requests.
/// A used address resets the unused run exactly as a descriptor scan would.
fn required_recovery_gap(db: &Connection, prospective_index: Option<u32>) -> ApiResult<u32> {
    let mut statement = db
        .prepare("SELECT idx, observed FROM groot_addresses ORDER BY idx")
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, u32>(0)?, row.get::<_, bool>(1)?))
        })
        .map_err(internal)?;
    let mut previous_observed = None;
    let mut required = 0_u32;
    let mut highest = None;
    for row in rows {
        let (index, observed) = row.map_err(internal)?;
        if highest.is_some_and(|value| index <= value) {
            return Err(internal(
                "Address derivation indexes are not strictly increasing.",
            ));
        }
        highest = Some(index);
        required = required.max(match previous_observed {
            Some(previous) => index
                .checked_sub(previous)
                .ok_or_else(|| internal("Address derivation indexes are invalid."))?,
            None => index
                .checked_add(1)
                .ok_or_else(|| internal("Address derivation index overflowed."))?,
        });
        if observed {
            previous_observed = Some(index);
        }
    }
    if let Some(index) = prospective_index {
        if highest.is_some_and(|value| index <= value) {
            return Err(internal(
                "The next address derivation index did not advance.",
            ));
        }
        required = required.max(match previous_observed {
            Some(previous) => index
                .checked_sub(previous)
                .ok_or_else(|| internal("Address derivation indexes are invalid."))?,
            None => index
                .checked_add(1)
                .ok_or_else(|| internal("Address derivation index overflowed."))?,
        });
    }
    Ok(required)
}

fn enforce_recovery_gap(db: &Connection, prospective_index: u32) -> ApiResult<()> {
    let configured = load_recovery_scan_settings(db)?.gap_limit;
    let required = required_recovery_gap(db, Some(prospective_index))?;
    if required > configured {
        return Err(api_error(
            "address_gap_limit_reached",
            format!(
                "Creating this address would exceed the configured recovery gap limit of {configured}. Increase the gap limit in Settings or wait for an existing address to receive bitcoin."
            ),
        ));
    }
    Ok(())
}

fn required_keychain_gap(
    wallet: &Wallet,
    keychain: KeychainKind,
    prospective_index: u32,
) -> ApiResult<u32> {
    let mut observed = wallet
        .list_output()
        .filter(|output| output.keychain == keychain)
        .map(|output| output.derivation_index)
        .collect::<Vec<_>>();
    observed.sort_unstable();
    observed.dedup();
    let mut previous = None;
    let mut required = 0_u32;
    for index in observed {
        required = required.max(match previous {
            Some(value) => index
                .checked_sub(value)
                .ok_or_else(|| internal("Change derivation indexes are invalid."))?,
            None => index
                .checked_add(1)
                .ok_or_else(|| internal("Change derivation index overflowed."))?,
        });
        previous = Some(index);
    }
    required = required.max(match previous {
        Some(value) if prospective_index > value => prospective_index - value,
        Some(_) => 0,
        None => prospective_index
            .checked_add(1)
            .ok_or_else(|| internal("Change derivation index overflowed."))?,
    });
    Ok(required)
}

fn enforce_change_recovery_gap(db: &Connection, wallet: &Wallet, psbt: &Psbt) -> ApiResult<()> {
    let highest_internal = psbt
        .unsigned_tx
        .output
        .iter()
        .filter_map(|output| wallet.derivation_of_spk(output.script_pubkey.clone()))
        .filter_map(|(keychain, index)| (keychain == KeychainKind::Internal).then_some(index))
        .max();
    let Some(index) = highest_internal else {
        return Ok(());
    };
    let configured = load_recovery_scan_settings(db)?.gap_limit;
    let required = required_keychain_gap(wallet, KeychainKind::Internal, index)?;
    if required > configured {
        return Err(api_error(
            "address_gap_limit_reached",
            format!(
                "This transaction would use a change index beyond the configured recovery gap limit of {configured}. Increase the gap limit in Settings before preparing it."
            ),
        ));
    }
    Ok(())
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
        .hash_password_into(credential.as_bytes(), &salt, &mut key)
        .map_err(internal)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(internal)?;
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

fn decrypt_payload(secret: EncryptedSecret, credential: &str) -> ApiResult<Vec<u8>> {
    if secret.version != 1 {
        return Err(internal("Unsupported encrypted secret version."));
    }
    let salt = BASE64.decode(secret.salt).map_err(internal)?;
    let nonce = BASE64.decode(secret.nonce).map_err(internal)?;
    if salt.len() != 16 || nonce.len() != 12 {
        return Err(internal("The encrypted wallet secret is malformed."));
    }
    let ciphertext = BASE64.decode(secret.ciphertext).map_err(internal)?;
    let mut key = [0_u8; 32];
    Argon2::default()
        .hash_password_into(credential.as_bytes(), &salt, &mut key)
        .map_err(internal)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(internal)?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| api_error("invalid_credential", "Incorrect passphrase / PIN."))?;
    key.zeroize();
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

fn parse_mnemonic_bytes(plaintext: Vec<u8>) -> ApiResult<Mnemonic> {
    let mut words = String::from_utf8(plaintext).map_err(internal)?;
    let mnemonic = Mnemonic::parse(&words).map_err(internal);
    words.zeroize();
    mnemonic
}

fn policy_api_error(error: PolicyError) -> ApiError {
    let message = match error {
        PolicyError::InvalidName => "Enter a wallet name and labels for every signer.",
        PolicyError::InvalidCosignerCount => "V1 requires between 3 and 7 signers.",
        PolicyError::UnsafeThreshold => "At least 2 signatures are required and the threshold cannot exceed the number of signers.",
        PolicyError::DuplicateFingerprint => "Every signer must have a unique master fingerprint.",
        PolicyError::DuplicateXpub => "Every signer must have a unique account xpub.",
        PolicyError::InvalidDescriptor => "A key or descriptor is invalid. Use a regtest BIP48 account tpub.",
    };
    api_error(error.code(), message)
}

fn bsms_api_error(error: BsmsError) -> ApiError {
    let message = match error {
        BsmsError::TooLarge => "BSMS descriptor records must be 256 KiB or smaller.",
        BsmsError::PrivateMaterial => {
            "A BSMS descriptor record must never contain private key material."
        }
        BsmsError::UnsupportedVersion => "Only the BIP129 BSMS 1.0 descriptor record is supported.",
        BsmsError::UnsupportedPaths => {
            "This wallet requires the standard BSMS receive/change paths /0/* and /1/*."
        }
        BsmsError::DescriptorMismatch => {
            "The receive and change descriptors do not describe the same wallet."
        }
        BsmsError::InvalidEncoding | BsmsError::InvalidDescriptor => {
            "Enter a valid public BSMS 1.0 descriptor record."
        }
    };
    api_error(error.code(), message)
}

fn public_descriptor_api_error(error: BsmsError) -> ApiError {
    let message = match error {
        BsmsError::TooLarge => "Public descriptor backups must be 256 KiB or smaller.",
        BsmsError::PrivateMaterial => {
            "A public descriptor backup must never contain private key material."
        }
        BsmsError::UnsupportedVersion => "This descriptor backup version is not supported.",
        BsmsError::UnsupportedPaths => {
            "The backup must contain standard receive/change paths /0/* and /1/*."
        }
        BsmsError::DescriptorMismatch => {
            "The receive and change descriptors do not describe the same wallet."
        }
        BsmsError::InvalidEncoding | BsmsError::InvalidDescriptor => {
            "Enter a valid BSMS, Groot JSON, or public descriptor backup."
        }
    };
    api_error(error.code(), message)
}

fn ur_api_error(error: UrTransportError) -> ApiError {
    let message = match error {
        UrTransportError::Empty => "Scan at least one crypto-psbt UR frame.",
        UrTransportError::TooLarge | UrTransportError::TooManyFrames => {
            "The animated QR payload exceeds Groot's safety limit."
        }
        UrTransportError::WrongType => "Scan a crypto-psbt UR, not a different QR payload type.",
        UrTransportError::Incomplete => "Keep scanning. More animated QR frames are required.",
        UrTransportError::InvalidPsbt => "The QR payload is not a valid PSBT.",
        UrTransportError::InvalidFrame | UrTransportError::InvalidCbor => {
            "The animated QR frame is malformed."
        }
    };
    api_error(error.code(), message)
}

#[tauri::command]
pub fn ur_encode_psbt(psbt: String, fragment_bytes: usize) -> ApiResult<Vec<String>> {
    ur_transport::encode_psbt(&psbt, fragment_bytes).map_err(ur_api_error)
}

#[tauri::command]
pub fn ur_decode_psbt(frames: Vec<String>) -> ApiResult<String> {
    ur_transport::decode_psbt(&frames).map_err(ur_api_error)
}

fn external_signer_api_error(error: ExternalSignerError) -> ApiError {
    let message = match error {
        ExternalSignerError::TooLarge => "Signer imports must be 256 KiB or smaller.",
        ExternalSignerError::PrivateMaterial => {
            "Private keys, seeds, and recovery words must never be imported into Groot."
        }
        ExternalSignerError::InvalidFormat => {
            "Use a BIP84 descriptor or a supported public-key JSON export."
        }
        ExternalSignerError::InvalidLabel => "Enter a signer label of 1 to 48 characters.",
        ExternalSignerError::InvalidFingerprint => {
            "The signer fingerprint must contain exactly 8 hexadecimal characters."
        }
        ExternalSignerError::InvalidDerivation => {
            "Use the test-chain BIP84 account path m/84'/1'/0'."
        }
        ExternalSignerError::WrongNetwork => "Use a test-chain account tpub, not a mainnet xpub.",
        ExternalSignerError::InvalidDescriptor => {
            "The descriptor must be canonical public-only BIP84 single-sig."
        }
    };
    api_error(error.code(), message)
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

fn proposal_api_error(error: crate::proposal::ProposalError) -> ApiError {
    use crate::proposal::ProposalError;

    let message = match error {
        ProposalError::MalformedPsbt => "The PSBT is malformed.",
        ProposalError::PsbtTooLarge => "The PSBT exceeds Groot's size limit.",
        ProposalError::ProposalMismatch => {
            "The PSBT does not match the transaction you reviewed. No signatures were changed."
        }
        ProposalError::UnknownSigner => {
            "The PSBT contains a signature from an unknown signer. No signatures were changed."
        }
        ProposalError::UnsupportedSighash => {
            "The PSBT uses an unsupported signature type. Groot accepts only SIGHASH_ALL. No signatures were changed."
        }
        ProposalError::InvalidSignature => {
            "The PSBT contains an invalid signature. No signatures were changed."
        }
        ProposalError::PrematureFinalization => {
            "The PSBT was finalized outside Groot. Import a partially signed PSBT instead."
        }
        ProposalError::NoInputs => "The PSBT has no transaction inputs.",
        ProposalError::NoNewSignatures => {
            "This signer has already signed this proposal. No signatures were changed."
        }
        ProposalError::SignatureNotFound => {
            "This signer has no complete signature in the current proposal. No signatures were changed."
        }
        ProposalError::MergeFailed => {
            "Groot could not safely merge the signed PSBT. No signatures were changed."
        }
    };
    api_error(error.code(), message)
}

fn recovery_api_error(error: RecoveryError) -> ApiError {
    api_error(error.code(), error)
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
                recovery_policy_type(template),
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
    let fingerprints = multisig_fingerprints(metadata)?;
    let progress =
        signature_progress(&psbt, &fingerprints, metadata.threshold).map_err(proposal_api_error)?;
    let (change, change_addresses) = proposal_change_details(wallet, &psbt, &recipient, amount)?;
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(&psbt, &change_addresses)?;
    let (inputs, fee_rate, locktime, rbf) = proposal_transaction_details(wallet, &psbt, fee)?;
    let selection_impact =
        selection_impact(db, wallet, &psbt, &strategy, fee_difference_vs_private)?;
    Ok(MultisigProposalDto {
        proposal_id,
        recipient,
        recipient_testnet_alias,
        label,
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
        status,
        created_at: created_at.to_string(),
        selection_impact,
    })
}

fn proposal_change_details(
    wallet: &Wallet,
    psbt: &Psbt,
    recipient: &str,
    amount: u64,
) -> ApiResult<(u64, Vec<String>)> {
    let recipient_script = Address::from_str(recipient)
        .map_err(|_| internal("The stored proposal recipient is invalid."))?
        .require_network(NETWORK)
        .map_err(|_| internal("The stored proposal recipient is on the wrong network."))?
        .script_pubkey();
    let self_spend = amount == 0;
    let mut recipient_matches = 0_usize;
    let mut change = 0_u64;
    let mut change_addresses = Vec::new();
    for output in &psbt.unsigned_tx.output {
        let matches_recipient = output.script_pubkey == recipient_script
            && (self_spend || output.value.to_sat() == amount);
        if matches_recipient {
            recipient_matches += 1;
        }
        if self_spend || !matches_recipient {
            if !wallet.is_mine(output.script_pubkey.clone()) {
                return Err(api_error(
                    "proposal_mismatch",
                    "A non-recipient proposal output is not controlled by this wallet.",
                ));
            }
            change = change
                .checked_add(output.value.to_sat())
                .ok_or_else(|| internal("The proposal output total overflowed."))?;
            change_addresses.push(
                Address::from_script(&output.script_pubkey, NETWORK)
                    .map_err(|_| internal("A proposal change output has no displayable address."))?
                    .to_string(),
            );
        }
    }
    if recipient_matches != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The stored proposal recipient does not match exactly one transaction output.",
        ));
    }
    Ok((change, change_addresses))
}

fn proposal_change_derivation_paths(
    psbt: &Psbt,
    change_addresses: &[String],
) -> ApiResult<Vec<Vec<String>>> {
    change_addresses
        .iter()
        .map(|address| {
            let script = Address::from_str(address)
                .map_err(|_| internal("A proposal change address is invalid."))?
                .require_network(NETWORK)
                .map_err(|_| internal("A proposal change address is on the wrong network."))?
                .script_pubkey();
            let output_index = psbt
                .unsigned_tx
                .output
                .iter()
                .position(|output| output.script_pubkey == script)
                .ok_or_else(|| {
                    internal("A proposal change address is missing from the transaction.")
                })?;
            let output = psbt
                .outputs
                .get(output_index)
                .ok_or_else(|| internal("A proposal change output is missing PSBT metadata."))?;
            Ok(unique_derivation_paths(
                output
                    .bip32_derivation
                    .values()
                    .map(|(_, path)| path.to_string()),
            ))
        })
        .collect()
}

fn unique_derivation_paths(paths: impl Iterator<Item = String>) -> Vec<String> {
    paths
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn validate_proposal_fee(psbt: &Psbt, expected_fee: u64) -> ApiResult<()> {
    let actual = proposal_fee_amount(psbt)?;
    if actual != expected_fee {
        return Err(api_error(
            "proposal_mismatch",
            "The stored proposal fee does not match the transaction.",
        ));
    }
    Ok(())
}

fn proposal_fee_amount(psbt: &Psbt) -> ApiResult<u64> {
    let mut input_total = 0_u64;
    for index in 0..psbt.unsigned_tx.input.len() {
        let value = psbt
            .get_utxo_for(index)
            .ok_or_else(|| {
                api_error(
                    "proposal_mismatch",
                    "A proposal input is missing its authenticated previous output.",
                )
            })?
            .value
            .to_sat();
        input_total = input_total.checked_add(value).ok_or_else(|| {
            api_error("proposal_mismatch", "The proposal input total overflowed.")
        })?;
    }
    let output_total = psbt
        .unsigned_tx
        .output
        .iter()
        .try_fold(0_u64, |total, output| {
            total.checked_add(output.value.to_sat()).ok_or_else(|| {
                api_error("proposal_mismatch", "The proposal output total overflowed.")
            })
        })?;
    input_total.checked_sub(output_total).ok_or_else(|| {
        api_error(
            "proposal_mismatch",
            "The proposal spends more than its authenticated inputs.",
        )
    })
}

fn proposal_transaction_details(
    wallet: &Wallet,
    psbt: &Psbt,
    fee: u64,
) -> ApiResult<(Vec<ProposalInputDto>, f64, u32, bool)> {
    if psbt.unsigned_tx.input.is_empty() || psbt.inputs.len() != psbt.unsigned_tx.input.len() {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal has no complete input set.",
        ));
    }
    let mut seen = std::collections::HashSet::new();
    let mut satisfaction_weight = Weight::ZERO;
    let mut inputs = Vec::with_capacity(psbt.unsigned_tx.input.len());
    for (index, txin) in psbt.unsigned_tx.input.iter().enumerate() {
        if !seen.insert(txin.previous_output) {
            return Err(api_error(
                "proposal_mismatch",
                "The proposal contains a duplicate input.",
            ));
        }
        let utxo = psbt.get_utxo_for(index).ok_or_else(|| {
            api_error(
                "proposal_mismatch",
                "A proposal input is missing its authenticated previous output.",
            )
        })?;
        let (keychain, _) = wallet
            .derivation_of_spk(utxo.script_pubkey)
            .ok_or_else(|| {
                api_error(
                    "proposal_mismatch",
                    "A proposal input is not controlled by this wallet.",
                )
            })?;
        satisfaction_weight = satisfaction_weight
            .checked_add(
                wallet
                    .public_descriptor(keychain)
                    .max_weight_to_satisfy()
                    .map_err(internal)?,
            )
            .ok_or_else(|| internal("The proposal weight overflowed."))?;
        inputs.push(ProposalInputDto {
            outpoint: txin.previous_output.to_string(),
            amount: utxo.value.to_sat(),
            sequence: txin.sequence.to_consensus_u32(),
            derivation_paths: unique_derivation_paths(
                psbt.inputs[index]
                    .bip32_derivation
                    .values()
                    .map(|(_, path)| path.to_string()),
            ),
        });
    }
    let signed_weight = psbt
        .unsigned_tx
        .weight()
        .checked_add(satisfaction_weight)
        .ok_or_else(|| internal("The proposal weight overflowed."))?;
    let vbytes = signed_weight.to_vbytes_ceil();
    if vbytes == 0 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal has an invalid signed size.",
        ));
    }
    let fee_rate = ((fee as f64 / vbytes as f64) * 100.0).round() / 100.0;
    Ok((
        inputs,
        fee_rate,
        psbt.unsigned_tx.lock_time.to_consensus_u32(),
        psbt.unsigned_tx
            .input
            .iter()
            .any(|input| input.sequence.is_rbf()),
    ))
}

fn checked_payment_total(amount: u64, fee: u64) -> ApiResult<u64> {
    amount.checked_add(fee).ok_or_else(|| {
        api_error(
            "invalid_amount",
            "The payment total exceeds the amount range.",
        )
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
    inherit_payment_intent: bool,
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
    label_provenance::assign_payment_intent(
        db,
        &proposal.label,
        &proposal.proposal_id,
        created_at,
        inherit_payment_intent,
    )
    .map(|_| ())
    .map_err(|error| {
        if error.sqlite_error_code() == Some(bdk_wallet::rusqlite::ErrorCode::ConstraintViolation) {
            api_error(
                "invalid_label",
                "Permanent labels cannot be reused for a different payment.",
            )
        } else {
            internal(error)
        }
    })
}

fn persist_acceleration(
    db: &Connection,
    proposal_id: &str,
    method: AccelerationMethod,
    original: &TransactionDto,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO groot_accelerations (
            proposal_id, method, original_txid, original_kind, original_direction,
            original_amount, original_fee, original_date, original_address, original_label, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            proposal_id,
            method.as_str(),
            original.id,
            original.kind,
            original.direction,
            original.amount,
            original.fee,
            original.date,
            original.address,
            original.label,
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
        persist_acceleration(transaction, &proposal.proposal_id, method, original)?;
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
    let snapshot = snapshot_from(&wallet, &persisted, synced_at, true)?;
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
            "SELECT original_txid, replacement_txid, original_kind, original_direction,
                    original_amount, original_fee, original_date, original_address, original_label
             FROM groot_accelerations
             WHERE method = 'rbf' AND replacement_txid IS NOT NULL
             ORDER BY created_at DESC",
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
                fee: row.get(5)?,
                status: "replaced".to_owned(),
                confirmations: 0,
                date: row.get(6)?,
                address: row.get(7)?,
                label: row.get(8)?,
                intent_label: None,
                provenance: ProvenanceSummaryDto::unknown("funding"),
                block: None,
                input_count: None,
                output_count: None,
                fee_rate: None,
                wallet_input_amount: None,
                wallet_output_amount: None,
                locktime: None,
                rbf: None,
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
        if let Some(existing) = transactions.iter_mut().find(|tx| tx.id == replacement.id) {
            existing.status = "replaced".to_owned();
            existing.confirmations = 0;
            existing.block = None;
            existing.replaced_by = replacement.replaced_by;
        } else {
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
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(&psbt, &change_addresses)?;
    let (inputs, fee_rate, locktime, rbf) = proposal_transaction_details(wallet, &psbt, fee)?;
    let selection_impact =
        selection_impact(db, wallet, &psbt, &strategy, fee_difference_vs_private)?;
    Ok(PaymentProposalDto {
        proposal_id,
        recipient,
        recipient_testnet_alias,
        label,
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
    })
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

fn secure_store_error(error: SecureStoreError) -> ApiError {
    match error {
        SecureStoreError::InvalidCredential => {
            api_error("invalid_credential", "Incorrect passphrase / PIN.")
        }
        SecureStoreError::Corrupt => api_error(
            "wallet_corrupt",
            "The protected wallet secret is corrupt. Restore from your backup.",
        ),
        SecureStoreError::Unavailable => api_error(
            "secure_storage_unavailable",
            "Encrypted wallet storage is unavailable. Check access to Groot's application data and try again. The wallet stayed locked.",
        ),
    }
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
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        let wallet = Wallet::create(external, internal_template)
            .network(NETWORK)
            .create_wallet(&mut db)
            .map_err(internal)?;
        let words = Zeroizing::new(mnemonic.to_string());
        persist_secret_material(&dir.join("secret.json"), words.as_bytes(), credential)?;
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
        )
    })();
    if result.is_err() {
        cleanup_failed_profile(&dir)?;
    }
    result
}

fn sync_wallet_atomically(
    app: &AppHandle,
    state: &State<'_, AppState>,
    db: &mut Connection,
    multisig: bool,
) -> ApiResult<WalletSnapshotDto> {
    match read_sync_source(app)? {
        WalletSyncSource::BitcoinCore => sync_wallet_with_core(app, state, db, multisig),
        source @ WalletSyncSource::CompactFilters { .. } => {
            sync_wallet_with_compact_filters(app, state, db, multisig, &source)
        }
    }
}

fn sync_wallet_with_status(
    app: &AppHandle,
    state: &State<'_, AppState>,
    db: &mut Connection,
    multisig: bool,
    wallet_id: Uuid,
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
    let result = sync_wallet_atomically(app, state, db, multisig);
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
) -> ApiResult<WalletSnapshotDto> {
    let rpc = Arc::new(rpc_client(app, state)?);
    checked_block_height(rpc.as_ref())?;
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    let wallet_tip = wallet.latest_checkpoint();
    let mut emitter = Emitter::new(
        rpc,
        wallet_tip,
        0,
        wallet
            .transactions()
            .filter(|tx| tx.chain_position.is_unconfirmed()),
    );
    while let Some(block) = emitter.next_block().map_err(internal)? {
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .map_err(internal)?;
    }
    let mempool = emitter.mempool().map_err(internal)?;
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    mark_observed_addresses(&wallet, &transaction)?;
    label_provenance::reconcile_wallet_outputs(&wallet, &transaction, now()).map_err(internal)?;
    let snapshot = snapshot_from(&wallet, &transaction, Some(now().to_string()), multisig)?;
    enqueue_snapshot_notifications(&transaction, &snapshot)?;
    wallet.persist(&mut transaction).map_err(internal)?;
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
        move |progress| update_compact_filter_sync_status(&status, progress),
    )
    .map_err(|_| compact_filter_unavailable())?;
    drop(wallet);
    if let Ok(mut status) = state.sync_status.lock() {
        if let Some(current) = status.as_mut() {
            current.state = "applying";
            current.progress_percent = Some(100);
            current.updated_at = now();
        }
    }
    apply_compact_filter_update(db, multisig, update)
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
) -> ApiResult<WalletSnapshotDto> {
    apply_compact_filter_update_with_hook(db, multisig, update, |_| Ok(()))
}

fn apply_compact_filter_update_with_hook<F>(
    db: &mut Connection,
    multisig: bool,
    update: Update,
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
    let snapshot = snapshot_from(&wallet, &transaction, Some(now().to_string()), multisig)?;
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
    let (tip, genesis) = checked_chain_identity(rpc.as_ref())?;
    if u64::from(settings.birthday_height) > tip {
        return Err(api_error(
            "invalid_scan_settings",
            "Wallet birthday cannot be above the node's current block height.",
        ));
    }
    let target_height = u32::try_from(tip)
        .map_err(|_| internal("The node height exceeds the supported recovery range."))?;
    start_recovery_scan_record(db, run_id, settings, target_height)?;
    let checkpoint = CheckPoint::new(BlockId {
        height: 0,
        hash: genesis,
    });
    let expected_mempool = wallet
        .transactions()
        .filter(|tx| tx.chain_position.is_unconfirmed());
    let mut emitter = Emitter::new(rpc, checkpoint, settings.birthday_height, expected_mempool);
    let mut processed_blocks = 0_u32;
    while let Some(block) = emitter.next_block().map_err(internal)? {
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
    let mempool = emitter.mempool().map_err(internal)?;
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
) -> (u32, Option<u32>, String) {
    match position {
        ChainPosition::Confirmed { anchor, .. } => (
            tip.saturating_sub(anchor.block_id.height).saturating_add(1),
            Some(anchor.block_id.height),
            anchor.confirmation_time.to_string(),
        ),
        ChainPosition::Unconfirmed { first_seen, .. } => {
            (0, None, first_seen.unwrap_or_else(now).to_string())
        }
    }
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

fn address_rows(db: &Connection, multisig: bool) -> ApiResult<Vec<ReceiveAddressDto>> {
    let mut statement = db
        .prepare(
            "SELECT a.idx, a.address, a.label, a.created_at, a.state,
                    verification.verified_at, verification.signer_fingerprint
             FROM groot_addresses a
             LEFT JOIN groot_address_verifications verification
               ON verification.id = (
                 SELECT latest.id
                 FROM groot_address_verifications latest
                 WHERE latest.address_idx = a.idx
                 ORDER BY latest.verified_at DESC, latest.id DESC
                 LIMIT 1
               )
             ORDER BY a.idx DESC",
        )
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            let address: String = row.get(1)?;
            Ok(ReceiveAddressDto {
                id: row.get(0)?,
                testnet_alias: regtest_testnet_address_alias(&address),
                address,
                label: row.get(2)?,
                created: row.get::<_, u64>(3)?.to_string(),
                status: row.get(4)?,
                derivation_path: if multisig {
                    format!("{MULTISIG_ACCOUNT_PATH}/0/{}", row.get::<_, u32>(0)?)
                } else {
                    format!("{SINGLESIG_ACCOUNT_PATH}/0/{}", row.get::<_, u32>(0)?)
                },
                hardware_verified_at: row.get::<_, Option<u64>>(5)?.map(|value| value.to_string()),
                hardware_verified_by: row.get(6)?,
            })
        })
        .map_err(internal)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(internal)
}

fn record_address_verification(
    db: &mut Connection,
    address_id: u32,
    identity: &VerifiedHardwareIdentity,
    displayed_address: &str,
    multisig: bool,
) -> ApiResult<ReceiveAddressDto> {
    let verified_at = now();
    let transaction = db.transaction().map_err(internal)?;
    transaction
        .execute(
            "INSERT INTO groot_address_verifications
                (address_idx, signer_fingerprint, device_type, displayed_address, verified_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                address_id,
                identity.fingerprint.to_ascii_lowercase(),
                identity.device_type.to_ascii_lowercase(),
                displayed_address,
                verified_at
            ],
        )
        .map_err(internal)?;
    transaction.commit().map_err(internal)?;
    address_rows(db, multisig)?
        .into_iter()
        .find(|address| address.id == address_id)
        .ok_or_else(|| internal("Verified address disappeared from wallet storage."))
}

fn records_interactive_policy_verification(device_type: &str) -> bool {
    matches!(
        device_type.to_ascii_lowercase().as_str(),
        "ledger" | "bitbox02" | "jade"
    )
}

fn require_matching_policy_device_type(
    expected_device_type: Option<&str>,
    actual_device_type: &str,
) -> ApiResult<()> {
    let Some(expected) = expected_device_type else {
        return Ok(());
    };
    if records_interactive_policy_verification(expected)
        && !expected.eq_ignore_ascii_case(actual_device_type)
    {
        return Err(api_error(
            "unknown_signer",
            "The connected hardware model does not match this saved signer.",
        ));
    }
    Ok(())
}

fn record_signer_policy_verification(
    db: &Connection,
    identity: &VerifiedHardwareIdentity,
    displayed_address: &str,
) -> ApiResult<SignerPolicyVerificationDto> {
    if !records_interactive_policy_verification(&identity.device_type) {
        return Err(api_error(
            "invalid_hardware_request",
            "This signer does not use Groot's interactive wallet-policy verification flow.",
        ));
    }
    let verified_at = now();
    let signer_fingerprint = identity.fingerprint.to_ascii_lowercase();
    let device_type = identity.device_type.to_ascii_lowercase();
    db.execute(
        "INSERT INTO groot_signer_policy_verifications
            (signer_fingerprint, device_type, scope, displayed_address, verified_at)
         VALUES (?1, ?2, 'policy_and_address', ?3, ?4)",
        params![
            signer_fingerprint,
            device_type,
            displayed_address,
            verified_at
        ],
    )
    .map_err(internal)?;
    Ok(SignerPolicyVerificationDto {
        signer_fingerprint,
        device_type,
        verified_at: verified_at.to_string(),
        scope: "policy_and_address",
        displayed_address: Some(displayed_address.to_owned()),
    })
}

fn policy_verification_key(wallet: &MultisigWalletDto, fingerprint: &str) -> ApiResult<String> {
    Ok(format!(
        "{}:{}",
        descriptor_checksum(&wallet.external_descriptor)?,
        fingerprint.to_ascii_lowercase()
    ))
}

fn signer_policy_verification_rows(db: &Connection) -> ApiResult<Vec<SignerPolicyVerificationDto>> {
    let mut statement = db
        .prepare(
            "SELECT signer_fingerprint, device_type, verified_at, displayed_address
             FROM groot_signer_policy_verifications verification
             WHERE verification.id = (
               SELECT latest.id
               FROM groot_signer_policy_verifications latest
               WHERE latest.signer_fingerprint = verification.signer_fingerprint
               ORDER BY latest.verified_at DESC, latest.id DESC
               LIMIT 1
             )
             ORDER BY signer_fingerprint ASC",
        )
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok(SignerPolicyVerificationDto {
                signer_fingerprint: row.get(0)?,
                device_type: row.get(1)?,
                verified_at: row.get::<_, u64>(2)?.to_string(),
                scope: "policy_and_address",
                displayed_address: Some(row.get(3)?),
            })
        })
        .map_err(internal)?;
    let mut verifications = rows.collect::<Result<Vec<_>, _>>().map_err(internal)?;
    let mut acknowledgements = db
        .prepare(
            "SELECT signer_fingerprint, device_type, acknowledged_at
             FROM groot_signer_policy_acknowledgements acknowledgement
             WHERE acknowledgement.id = (
               SELECT latest.id
               FROM groot_signer_policy_acknowledgements latest
               WHERE latest.signer_fingerprint = acknowledgement.signer_fingerprint
               ORDER BY latest.acknowledged_at DESC, latest.id DESC
               LIMIT 1
             )
             ORDER BY signer_fingerprint ASC",
        )
        .map_err(internal)?;
    let rows = acknowledgements
        .query_map([], |row| {
            Ok(SignerPolicyVerificationDto {
                signer_fingerprint: row.get(0)?,
                device_type: row.get(1)?,
                verified_at: row.get::<_, u64>(2)?.to_string(),
                scope: "policy_file_acknowledgement",
                displayed_address: None,
            })
        })
        .map_err(internal)?;
    verifications.extend(rows.collect::<Result<Vec<_>, _>>().map_err(internal)?);
    Ok(verifications)
}

fn has_signer_policy_verification(
    verifications: &[SignerPolicyVerificationDto],
    identity: &VerifiedHardwareIdentity,
) -> bool {
    verifications.iter().any(|verification| {
        verification.scope == "policy_and_address"
            && verification
                .signer_fingerprint
                .eq_ignore_ascii_case(&identity.fingerprint)
            && verification
                .device_type
                .eq_ignore_ascii_case(&identity.device_type)
    })
}

fn has_coldcard_policy_acknowledgement(
    verifications: &[SignerPolicyVerificationDto],
    identity: &VerifiedHardwareIdentity,
) -> bool {
    identity.device_type.eq_ignore_ascii_case("coldcard")
        && verifications.iter().any(|verification| {
            verification.scope == "policy_file_acknowledgement"
                && verification
                    .signer_fingerprint
                    .eq_ignore_ascii_case(&identity.fingerprint)
                && verification.device_type.eq_ignore_ascii_case("coldcard")
        })
}

fn supports_coldcard_policy_acknowledgement(signer: &CosignerInput) -> bool {
    signer
        .device_type
        .as_deref()
        .is_some_and(|device_type| device_type.eq_ignore_ascii_case("coldcard"))
        || (signer.device_type.is_none() && signer.source == CosignerSource::File)
}

#[tauri::command]
pub fn multisig_acknowledge_coldcard_policy(
    app: AppHandle,
    state: State<'_, AppState>,
    signer_fingerprint: String,
) -> ApiResult<SignerPolicyVerificationDto> {
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
) -> ApiResult<WalletSnapshotDto> {
    label_provenance::reconcile_wallet_outputs(wallet, db, now()).map_err(internal)?;
    let provenance_context = label_provenance::summary_context(db).map_err(internal)?;
    let balance = wallet.balance();
    let tip = wallet.latest_checkpoint().height();
    let addresses = address_rows(db, multisig)?;

    let mut transactions = Vec::new();
    for tx in wallet.transactions_sort_by(|a, b| b.chain_position.cmp(&a.chain_position)) {
        let transaction = tx.tx_node.tx.as_ref();
        let (sent, received) = wallet.sent_and_received(transaction);
        let is_received = received > sent;
        let transaction_fee = wallet.calculate_fee(transaction).ok();
        let transaction_vbytes = transaction.weight().to_vbytes_ceil();
        let fee_rate = transaction_fee.and_then(|fee| {
            (transaction_vbytes > 0).then(|| {
                ((fee.to_sat() as f64 / transaction_vbytes as f64) * 100.0).round() / 100.0
            })
        });
        let has_external_value_output = transaction.output.iter().any(|output| {
            output.value > Amount::ZERO
                && wallet
                    .derivation_of_spk(output.script_pubkey.clone())
                    .is_none()
        });
        let kind = transaction_kind(is_received, has_external_value_output);
        let amount = if kind == "self_spend" {
            transaction_fee.unwrap_or(Amount::ZERO)
        } else if is_received {
            received - sent
        } else {
            (sent - received)
                .checked_sub(transaction_fee.unwrap_or(Amount::ZERO))
                .unwrap_or(Amount::ZERO)
        };
        let (confirmations, block, date) = confirmations(&tx.chain_position, tip);
        let txid = tx.tx_node.txid.to_string();
        let intent_label = (!is_received)
            .then(|| label_provenance::payment_label_for_txid(db, &txid).map_err(internal))
            .transpose()?
            .flatten();
        let provenance_outpoints = if is_received {
            transaction
                .output
                .iter()
                .enumerate()
                .filter(|(_, output)| {
                    wallet
                        .derivation_of_spk(output.script_pubkey.clone())
                        .is_some()
                })
                .map(|(vout, _)| format!("{}:{vout}", tx.tx_node.txid))
                .collect::<Vec<_>>()
        } else {
            transaction
                .input
                .iter()
                .map(|input| input.previous_output.to_string())
                .collect::<Vec<_>>()
        };
        let mut provenance = label_provenance::funding_summary_with_context(
            db,
            &provenance_outpoints,
            &provenance_context,
        )
        .map_err(internal)?;
        provenance.context = if is_received { "received" } else { "funding" }.to_owned();
        let (address, fallback_label) = tx_counterparty(wallet, db, transaction, is_received);
        let label = if let Some(intent) = &intent_label {
            intent.text.clone()
        } else if is_received && provenance.labels.len() == 1 {
            provenance.labels[0].text.clone()
        } else if is_received && provenance.labels.len() > 1 {
            format!("Received to {} labels", provenance.labels.len())
        } else if kind == "self_spend" {
            "Self-spend".to_owned()
        } else {
            fallback_label
        };
        transactions.push(TransactionDto {
            id: txid,
            kind: kind.to_owned(),
            direction: if is_received { "received" } else { "sent" }.to_owned(),
            amount: amount.to_sat(),
            fee: if is_received {
                None
            } else {
                transaction_fee.map(Amount::to_sat)
            },
            status: if confirmations > 0 {
                "confirmed"
            } else {
                "pending"
            }
            .to_owned(),
            confirmations,
            date,
            address,
            label,
            intent_label,
            provenance,
            block,
            replaced_by: None,
            input_count: Some(transaction.input.len()),
            output_count: Some(transaction.output.len()),
            fee_rate,
            wallet_input_amount: (sent > Amount::ZERO).then(|| sent.to_sat()),
            wallet_output_amount: (received > Amount::ZERO).then(|| received.to_sat()),
            locktime: Some(transaction.lock_time.to_consensus_u32()),
            rbf: Some(
                transaction
                    .input
                    .iter()
                    .any(|input| input.sequence.is_rbf()),
            ),
        });
    }
    apply_replacement_history(db, &mut transactions)?;

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
        let (output_confirmations, _, _) = confirmations(&output.chain_position, tip);
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
        utxos.push(UtxoDto {
            outpoint: output.outpoint.to_string(),
            amount: output.txout.value.to_sat(),
            confirmations: output_confirmations,
            address,
            label,
            primary_label,
            provenance,
            frozen: frozen.contains(&output.outpoint.to_string()),
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
        synced_at,
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

fn hardware_api_error(error: HardwareError) -> ApiError {
    let message = match error {
        HardwareError::InvalidArgument => "The hardware wallet request was rejected.",
        HardwareError::Unavailable => "Bitcoin Core HWI is not installed or could not be started.",
        HardwareError::TimedOut => "The hardware wallet did not respond in time.",
        HardwareError::OutputTooLarge => "The hardware wallet returned an oversized response.",
        HardwareError::CommandFailed(code) => match code {
            Some(-3 | -12) => "The device is locked or another wallet app owns its USB session. Follow the unlock prompt shown by Groot or the device. If another wallet app is open, quit it, reconnect, then scan again. A locked Trezor Model One can be unlocked from its Groot device card.",
            Some(-14) => "The action was cancelled on the hardware wallet.",
            Some(-15) => "The hardware wallet is busy. Close its companion app and try again.",
            Some(-8 | -9) => "This hardware wallet does not support the requested operation.",
            _ => "The hardware wallet rejected the request.",
        },
        HardwareError::Io => "Communication with the hardware wallet failed.",
    };
    api_error(error.code(), message)
}

fn hardware_device_api_error(error: HardwareError, device_type: &str) -> ApiError {
    if device_type.eq_ignore_ascii_case("coldcard")
        && matches!(error, HardwareError::CommandFailed(Some(-7)))
    {
        return api_error(
            error.code(),
            "Coldcard does not recognize this multisig wallet. Save the wallet policy in Groot, import it from Settings → Multisig Wallets → Import on Coldcard, verify the threshold and fingerprints, then try again.",
        );
    }
    if device_type.eq_ignore_ascii_case("bitbox02")
        && matches!(error, HardwareError::CommandFailed(Some(-8 | -9)))
    {
        return api_error(
            error.code(),
            "BitBox02 did not finish wallet registration. Enter a short account name on the device, approve the multisig policy, then verify the first address.",
        );
    }
    if device_type.eq_ignore_ascii_case("bitbox02")
        && matches!(
            error,
            HardwareError::CommandFailed(None | Some(-3 | -12 | -13 | -15))
        )
    {
        return api_error(
            error.code(),
            "Reconnect BitBox02, scan again, and enter the device password when prompted. If BitBoxApp is open, quit it so Groot can use USB. Use BitBoxApp only if Groot reports that first-time pairing is required.",
        );
    }
    hardware_api_error(error)
}

fn missing_hardware_fingerprint(device_type: &str) -> ApiError {
    let message = match device_type.to_ascii_lowercase().as_str() {
        "ledger" => {
            "Unlock Ledger and open Bitcoin Test—not Bitcoin—for this Regtest wallet, then scan again."
        }
        "bitbox02" => {
            "Reconnect BitBox02, scan again, and enter the device password when prompted. Use BitBoxApp only if Groot reports that first-time pairing is required."
        }
        "jade" => {
            "Log in on Jade using Recovery Phrase Login or QR PIN Unlock, then scan again."
        }
        "coldcard" => "Unlock Coldcard and enable USB communication, then scan again.",
        "trezor" | "keepkey" => {
            "Unlock the device using Groot's PIN-matrix flow, then scan again."
        }
        _ => "Unlock the hardware wallet and put it in its Bitcoin app, then scan again.",
    };
    api_error("hardware_unavailable", message)
}

fn unknown_hardware_signer() -> ApiError {
    api_error(
        "unknown_signer",
        "The connected device does not match any saved signer for this wallet.",
    )
}

fn missing_hardware_psbt(device_type: &str, code: Option<i64>, fallback: &str) -> ApiError {
    match code {
        Some(code) => {
            hardware_device_api_error(HardwareError::CommandFailed(Some(code)), device_type)
        }
        None => missing_hwi_value(None, fallback),
    }
}

fn hardware_xpub_api_error(
    error: HardwareError,
    device_type: &str,
    derivation_path: &str,
) -> ApiError {
    if device_type.eq_ignore_ascii_case("ledger")
        && derivation_path.contains("/1'")
        && matches!(error, HardwareError::CommandFailed(Some(-7 | -13)))
    {
        return api_error(
            error.code(),
            "Ledger is in the wrong app for this test-chain wallet. Quit Ledger Live, open Bitcoin Test—not Bitcoin—then reconnect and try again.",
        );
    }
    hardware_device_api_error(error, device_type)
}

#[derive(Debug)]
struct VerifiedHardwareIdentity {
    device_type: String,
    fingerprint: String,
}

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

fn verify_connected_hardware_identity(
    device: HwiDevice,
    expected_fingerprints: &[String],
) -> ApiResult<String> {
    Ok(connected_hardware_identity(device, expected_fingerprints)?.device_type)
}

#[path = "wallet/hardware_commands.rs"]
pub(crate) mod hardware_commands;

#[path = "wallet/multisig_setup_commands.rs"]
pub(crate) mod multisig_setup_commands;

fn create_tx_api_error(error: CreateTxError) -> ApiError {
    match error {
        CreateTxError::OutputBelowDustLimit(_) => api_error(
            "invalid_amount",
            "The recipient amount is below Bitcoin's dust limit.",
        ),
        CreateTxError::CoinSelection(_)
        | CreateTxError::NoUtxosSelected
        | CreateTxError::UnknownUtxo => api_error("insufficient_funds", error),
        error => internal(error),
    }
}

fn validate_manual_outpoints(values: &[String], frozen: &[OutPoint]) -> ApiResult<Vec<OutPoint>> {
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

struct AutomaticPaymentOptions<'a> {
    recipient: &'a Address,
    amount: u64,
    rate: FeeRate,
    frozen: Vec<OutPoint>,
    strategy: AutomaticSelectionStrategy,
    privacy: std::collections::HashMap<String, crate::privacy_selection::CoinPrivacy>,
    global_xpubs: bool,
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
    } = options;
    let mut builder = wallet
        .build_tx()
        .coin_selection(PrivacyAwareCoinSelection::new(strategy, privacy));
    builder
        .add_recipient(recipient.script_pubkey(), Amount::from_sat(amount))
        .fee_rate(rate)
        .unspendable(frozen);
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

#[path = "wallet/transaction_commands.rs"]
pub(crate) mod transaction_commands;

#[tauri::command]
pub fn wallet_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
    confirmation: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    if confirmation != "DELETE" {
        return Err(api_error(
            "confirmation_mismatch",
            "Type DELETE exactly to remove this wallet.",
        ));
    }
    let credential = Zeroizing::new(credential);
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
