use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_bitcoind_rpc::{
    bitcoincore_rpc::{Auth, Client, RpcApi},
    Emitter,
};
use bdk_wallet::{
    bip39::Mnemonic,
    bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        Address, Amount, FeeRate, Network, NetworkKind, OutPoint, Psbt, Transaction, Txid,
    },
    chain::{ChainPosition, ConfirmationBlockTime},
    descriptor::{Descriptor, DescriptorPublicKey},
    psbt::PsbtUtils,
    rusqlite::{config::DbConfig, params, Connection, OptionalExtension},
    template::{Bip84, Bip84Public},
    KeychainKind, PersistedWallet, SignOptions, Wallet,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::auth::AuthThrottle;
use crate::hardware::{HardwareError, HardwareTransport, HwiChain, HwiCli};
use crate::multisig::{
    CosignerInput, CosignerSource, MultisigPreviewDto, MultisigWalletDto, PolicyError, PolicyInput,
};
use crate::native_backup;
use crate::notifications::{self, WalletNotification};
use crate::proposal::{decode_psbt, encode_psbt, merge_signed_psbt, signature_progress};
use crate::recovery::{analyze_template, PolicyAnalysis, RecoveryError, RecoveryTemplate};
use crate::registry::{self, RegistryError, WalletKind, WalletProfile, WalletRegistry};
use crate::secure_store::{self, SecureStoreError};

const NETWORK: Network = Network::Regtest;
const RPC_URL: &str = "http://127.0.0.1:18443";
const MAX_PRIVATE_JSON_BYTES: u64 = 256 * 1024;
const MAX_CREDENTIAL_BYTES: usize = 1_024;
const MAX_MNEMONIC_INPUT_BYTES: usize = 4_096;
const ONBOARDING_SESSION_SECONDS: u64 = 15 * 60;
const UNLOCK_IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);

fn hwi_cli() -> HwiCli {
    HwiCli::for_chain(if NETWORK == Network::Bitcoin {
        HwiChain::Main
    } else {
        HwiChain::Test
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    code: &'static str,
    message: String,
}

type ApiResult<T> = Result<T, ApiError>;

fn api_error(code: &'static str, message: impl ToString) -> ApiError {
    ApiError {
        code,
        message: message.to_string(),
    }
}

fn internal(error: impl ToString) -> ApiError {
    api_error("internal_error", error)
}

fn operation_guard<'a>(state: &'a State<'_, AppState>) -> ApiResult<MutexGuard<'a, ()>> {
    state.operations.lock().map_err(internal)
}

fn require_unlocked(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<Uuid> {
    let selected = selected_profile(app)?.id;
    let mut unlocked = state.unlocked_wallet.lock().map_err(internal)?;
    if let Some(session) = unlocked.as_mut() {
        if session.wallet_id == selected && session.last_activity.elapsed() <= UNLOCK_IDLE_TIMEOUT {
            session.last_activity = Instant::now();
            return Ok(selected);
        }
    }
    *unlocked = None;
    Err(api_error(
        "wallet_locked",
        "Enter your passphrase / PIN to unlock Satchel.",
    ))
}

fn unlock_selected(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<()> {
    let selected = selected_profile(app)?.id;
    *state.unlocked_wallet.lock().map_err(internal)? = Some(UnlockedSession {
        wallet_id: selected,
        last_activity: Instant::now(),
    });
    Ok(())
}

fn lock_wallet(state: &State<'_, AppState>) -> ApiResult<()> {
    *state.unlocked_wallet.lock().map_err(internal)? = None;
    Ok(())
}

#[derive(Default)]
pub struct AppState {
    operations: Mutex<()>,
    proposals: Mutex<HashMap<String, PendingProposal>>,
    unlocked_wallet: Mutex<Option<UnlockedSession>>,
    pending_mnemonic: Mutex<Option<PendingMnemonic>>,
    verified_recovery: Mutex<HashMap<Uuid, String>>,
}

struct UnlockedSession {
    wallet_id: Uuid,
    last_activity: Instant,
}

#[derive(Debug)]
struct PendingProposal {
    psbt: Psbt,
}

struct PendingMnemonic {
    words: Zeroizing<String>,
    created_at: u64,
}

fn onboarding_session_is_fresh(created_at: u64, current_time: u64) -> bool {
    current_time.saturating_sub(created_at) <= ONBOARDING_SESSION_SECONDS
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
    trusted_pending: u64,
    total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveAddressDto {
    id: u32,
    address: String,
    label: String,
    created: String,
    status: String,
    derivation_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDto {
    id: String,
    direction: String,
    amount: u64,
    fee: Option<u64>,
    status: String,
    confirmations: u32,
    date: String,
    address: String,
    label: String,
    block: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UtxoDto {
    outpoint: String,
    amount: u64,
    confirmations: u32,
    address: String,
    label: String,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentProposalDto {
    proposal_id: String,
    recipient: String,
    amount: u64,
    fee: u64,
    fee_rate: f64,
    total: u64,
    selected_outpoints: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum CoinSelectionInput {
    Auto,
    Manual { outpoints: Vec<String> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastResultDto {
    txid: String,
    snapshot: WalletSnapshotDto,
    sync_pending: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareDeviceDto {
    id: String,
    label: String,
    model: String,
    fingerprint: Option<String>,
    connected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CosignerHealthDto {
    status: &'static str,
    checked_at: String,
    summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigProposalDto {
    proposal_id: String,
    recipient: String,
    amount: u64,
    fee: u64,
    fee_rate: f64,
    total: u64,
    selected_outpoints: Vec<String>,
    psbt: String,
    signed: usize,
    required: usize,
    can_finalize: bool,
    signed_fingerprints: Vec<String>,
    status: String,
    created_at: String,
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
pub struct RecoveryDrillDto {
    first_address: String,
    matches_current_wallet: bool,
}

#[derive(Deserialize)]
struct HwiDevice {
    #[serde(default)]
    fingerprint: Option<String>,
    #[serde(default, rename = "type")]
    device_type: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    path: String,
}

#[derive(Deserialize)]
struct HwiXpub {
    xpub: Option<String>,
    error: Option<String>,
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
        Some(-3 | -12) => "Reconnect and unlock the device, then try again.",
        Some(-14) => "The action was cancelled on the hardware wallet.",
        Some(-15) => "The hardware wallet is busy. Finish the current action and try again.",
        Some(-8 | -9) => "This hardware wallet does not support the requested operation.",
        Some(-1 | -2 | -4 | -7) => "Satchel could not select the enumerated hardware wallet.",
        _ => value,
    };
    api_error("hardware_unavailable", message)
}

fn app_data_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    app.path().app_data_dir().map_err(internal)
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
    registry::load(&registry_path(app)?).map_err(registry_api_error)
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
    let profile = selected_profile_of_kind(app, WalletKind::SingleKey)?;
    profile_directory(app, profile.id)
}

fn db_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(wallet_dir(app)?.join("wallet.sqlite"))
}

fn secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(wallet_dir(app)?.join("secret.json"))
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
            return Err(internal("Legacy watch-only migration is not supported."));
        }
    };
    Ok(WalletProfile {
        id,
        name,
        network: "regtest".to_owned(),
        kind,
        descriptor_checksum: checksum,
        created_at: now(),
    })
}

fn ensure_registry_migrated(app: &AppHandle) -> ApiResult<()> {
    let app_data = app_data_dir(app)?;
    ensure_private_directory(&app_data)?;
    ensure_private_directory(&wallets_root(app)?)?;
    let path = registry_path(app)?;
    if path.exists() {
        registry::load(&path).map_err(registry_api_error)?;
        return Ok(());
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
            network: "regtest".to_owned(),
            kind: WalletKind::Multisig,
            descriptor_checksum: descriptor_checksum(&wallet.external_descriptor)?,
            created_at: now(),
        },
    )
}

fn regtest_dir() -> PathBuf {
    std::env::var_os("SATCHEL_REGTEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("src-tauri must have a project parent")
                .join(".regtest")
        })
}

fn rpc_client() -> ApiResult<Client> {
    let cookie = regtest_dir().join("regtest").join(".cookie");
    if !cookie.exists() {
        return Err(api_error(
            "network_unavailable",
            "Regtest is not running. Start it with `pnpm regtest:start`.",
        ));
    }
    Client::new(RPC_URL, Auth::CookieFile(cookie))
        .map_err(|error| api_error("network_unavailable", error))
}

fn broadcast_transaction(transaction: &Transaction) -> ApiResult<Txid> {
    let expected = transaction.compute_txid();
    let rpc = rpc_client()?;
    match rpc.send_raw_transaction(transaction) {
        Ok(txid) if txid == expected => Ok(txid),
        Ok(_) => Err(internal(
            "Bitcoin Core returned a transaction ID that did not match the signed transaction.",
        )),
        Err(_) if rpc.get_raw_transaction_info(&expected, None).is_ok() => Ok(expected),
        Err(error) => Err(api_error("broadcast_failed", error)),
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

fn init_app_schema(db: &Connection) -> ApiResult<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS satchel_addresses (
            idx INTEGER PRIMARY KEY,
            address TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('awaiting', 'used', 'discarded')),
            observed INTEGER NOT NULL DEFAULT 0 CHECK(observed IN (0, 1))
        );
        CREATE TABLE IF NOT EXISTS satchel_proposals (
            proposal_id TEXT PRIMARY KEY,
            recipient TEXT NOT NULL,
            amount INTEGER NOT NULL,
            fee INTEGER NOT NULL,
            fee_rate REAL NOT NULL,
            psbt TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('collecting', 'ready', 'broadcast', 'cancelled')),
            created_at INTEGER NOT NULL,
            txid TEXT
        );
        CREATE TABLE IF NOT EXISTS satchel_frozen_coins (
            outpoint TEXT PRIMARY KEY,
            frozen_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS satchel_auth_throttle (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            failures INTEGER NOT NULL CHECK(failures >= 0),
            retry_at INTEGER NOT NULL CHECK(retry_at >= 0)
        );",
    )
    .map_err(internal)?;
    notifications::init(db).map_err(internal)
}

fn frozen_outpoints(db: &Connection) -> ApiResult<Vec<OutPoint>> {
    let mut statement = db
        .prepare("SELECT outpoint FROM satchel_frozen_coins")
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
    let _ = state;
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
    let _ = state;
    let mut db = open_auth_db(app)?;
    let mut throttle = load_auth_throttle(&db)?;
    match result {
        Ok(_) => throttle.succeeded(),
        Err(error) if error.code == "invalid_credential" => {
            throttle.failed(now());
        }
        Err(_) => {}
    }
    save_auth_throttle(&mut db, &throttle)
}

fn reset_auth_throttle(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<()> {
    let _ = state;
    let mut db = open_auth_db(app)?;
    let mut throttle = AuthThrottle::default();
    throttle.succeeded();
    save_auth_throttle(&mut db, &throttle)
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
            "SELECT failures, retry_at FROM satchel_auth_throttle WHERE singleton = 1",
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
        "INSERT INTO satchel_auth_throttle(singleton, failures, retry_at) VALUES(1, ?1, ?2)\
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
    let db = open_wallet_database(&path)?;
    init_app_schema(&db)?;
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
    let db = open_wallet_database(&path)?;
    init_app_schema(&db)?;
    Ok(db)
}

fn load_wallet(db: &mut Connection) -> ApiResult<PersistedWallet<Connection>> {
    Wallet::load()
        .check_network(NETWORK)
        .load_wallet(db)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_not_found", "Wallet database is empty."))
}

fn root_key(mnemonic: &Mnemonic, credential: &str) -> ApiResult<Xpriv> {
    let seed = Zeroizing::new(mnemonic.to_seed(credential));
    Xpriv::new_master(NetworkKind::Test, seed.as_ref()).map_err(internal)
}

fn watch_templates(
    mnemonic: &Mnemonic,
    credential: &str,
) -> ApiResult<(Bip84Public<Xpub>, Bip84Public<Xpub>)> {
    let master = root_key(mnemonic, credential)?;
    let secp = Secp256k1::new();
    let fingerprint = master.fingerprint(&secp);
    let account_path = DerivationPath::from_str("m/84'/1'/0'").map_err(internal)?;
    let account_private = master.derive_priv(&secp, &account_path).map_err(internal)?;
    let account_public = Xpub::from_priv(&secp, &account_private);
    Ok((
        Bip84Public(account_public, fingerprint, KeychainKind::External),
        Bip84Public(account_public, fingerprint, KeychainKind::Internal),
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
    if version == Some(2) {
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
        PolicyError::InvalidName => "Enter a wallet name and labels for every cosigner.",
        PolicyError::InvalidCosignerCount => "V1 requires between 3 and 7 cosigners.",
        PolicyError::UnsafeThreshold => "At least 2 signatures are required and the threshold cannot exceed the number of cosigners.",
        PolicyError::DuplicateFingerprint => "Every cosigner must have a unique master fingerprint.",
        PolicyError::DuplicateXpub => "Every cosigner must have a unique account xpub.",
        PolicyError::InvalidDescriptor => "A key or descriptor is invalid. Use a regtest BIP48 account tpub.",
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
            "Virtual cosigners are available only in the browser prototype.",
        ));
    }
    Ok(())
}

fn proposal_api_error(error: crate::proposal::ProposalError) -> ApiError {
    api_error(error.code(), error)
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
        .map_err(|_| api_error("invalid_backup", "Enter a valid Satchel descriptor backup."))?;
    if backup.version != 1 || backup.network != "regtest" || backup.wallet.kind != "multisig" {
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
            "The descriptors do not match the included cosigner policy.",
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
    let mut plaintext = if version == Some(2) {
        secure_store::load(&path, credential).map_err(secure_store_error)?
    } else {
        let secret: EncryptedSecret = serde_json::from_str(&encoded).map_err(internal)?;
        let plaintext = decrypt_payload(secret, credential)?;
        secure_store::store(&path, &plaintext, credential).map_err(secure_store_error)?;
        plaintext
    };
    let metadata = read_multisig_metadata(app)?;
    let expected = format!("satchel-multisig:{}", metadata.external_descriptor);
    let matches = plaintext.as_slice() == expected.as_bytes();
    plaintext.zeroize();
    if matches {
        Ok(())
    } else {
        Err(api_error("invalid_credential", "Incorrect app PIN."))
    }
}

fn proposal_dto(
    row: (String, String, u64, u64, f64, String, String, u64),
    wallet: &MultisigWalletDto,
) -> ApiResult<MultisigProposalDto> {
    let (proposal_id, recipient, amount, fee, fee_rate, encoded, status, created_at) = row;
    let psbt = decode_psbt(&encoded).map_err(proposal_api_error)?;
    let fingerprints = multisig_fingerprints(wallet)?;
    let progress =
        signature_progress(&psbt, &fingerprints, wallet.threshold).map_err(proposal_api_error)?;
    Ok(MultisigProposalDto {
        proposal_id,
        recipient,
        amount,
        fee,
        fee_rate,
        total: amount.saturating_add(fee),
        selected_outpoints: psbt
            .unsigned_tx
            .input
            .iter()
            .map(|input| input.previous_output.to_string())
            .collect(),
        psbt: encoded,
        signed: progress.signed,
        required: progress.required,
        can_finalize: progress.can_finalize,
        signed_fingerprints: progress.signed_fingerprints,
        status,
        created_at: created_at.to_string(),
    })
}

fn load_multisig_proposal(
    db: &Connection,
    wallet: &MultisigWalletDto,
    proposal_id: &str,
) -> ApiResult<MultisigProposalDto> {
    let row = db.query_row(
        "SELECT proposal_id, recipient, amount, fee, fee_rate, psbt, status, created_at FROM satchel_proposals WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
    ).map_err(|_| api_error("proposal_not_found", "Payment proposal was not found or is no longer active."))?;
    proposal_dto(row, wallet)
}

fn persist_single_proposal(
    db: &Connection,
    proposal: &PaymentProposalDto,
    psbt: &Psbt,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO satchel_proposals (proposal_id, recipient, amount, fee, fee_rate, psbt, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,'collecting',?7)",
        params![
            proposal.proposal_id,
            proposal.recipient,
            proposal.amount,
            proposal.fee,
            proposal.fee_rate,
            encode_psbt(psbt),
            now()
        ],
    )
    .map(|_| ())
    .map_err(internal)
}

fn load_single_proposal(db: &Connection, proposal_id: &str) -> ApiResult<PendingProposal> {
    let encoded = db
        .query_row(
            "SELECT psbt FROM satchel_proposals WHERE proposal_id = ?1 AND status = 'collecting'",
            params![proposal_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| {
            api_error(
                "proposal_not_found",
                "Payment proposal expired or was not found.",
            )
        })?;
    Ok(PendingProposal {
        psbt: decode_psbt(&encoded).map_err(proposal_api_error)?,
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
    let temp = parent.join(format!(".satchel-{}.tmp", Uuid::new_v4()));
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
            "Protected device storage is unavailable. The wallet was not opened.",
        ),
    }
}

fn persist_secret_material(path: &Path, material: &[u8], credential: &str) -> ApiResult<()> {
    secure_store::store(path, material, credential).map_err(secure_store_error)
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
) -> ApiResult<()> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 48 {
        return Err(api_error(
            "invalid_wallet_name",
            "Wallet names must contain 1 to 48 characters.",
        ));
    }
    validate_credential(credential)?;
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
                network: "regtest".to_owned(),
                kind: WalletKind::SingleKey,
                descriptor_checksum: descriptor_checksum(
                    &wallet.public_descriptor(KeychainKind::External).to_string(),
                )?,
                created_at: now(),
            },
        )
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

fn sync_loaded_wallet(
    wallet: &mut PersistedWallet<Connection>,
    db: &mut Connection,
) -> ApiResult<()> {
    let rpc = Arc::new(rpc_client()?);
    rpc.get_blockchain_info()
        .map_err(|error| api_error("network_unavailable", error))?;
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
        wallet.persist(db).map_err(internal)?;
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
                "UPDATE satchel_addresses SET observed = 1, state = 'used' WHERE idx = ?1",
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
        "SELECT address, label FROM satchel_addresses WHERE idx = ?1",
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
) -> (String, String) {
    if received {
        for output in &tx.output {
            if let Some((keychain, index)) = wallet.derivation_of_spk(output.script_pubkey.clone())
            {
                if keychain == KeychainKind::External {
                    if let Some(metadata) = address_metadata(db, index) {
                        return metadata;
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
                    return (address.to_string(), "Sent payment".to_owned());
                }
            }
        }
    }
    (
        "Unknown".to_owned(),
        if received { "Received" } else { "Sent payment" }.to_owned(),
    )
}

fn address_rows(db: &Connection, multisig: bool) -> ApiResult<Vec<ReceiveAddressDto>> {
    let mut statement = db
        .prepare(
            "SELECT idx, address, label, created_at, state FROM satchel_addresses ORDER BY idx DESC",
        )
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok(ReceiveAddressDto {
                id: row.get(0)?,
                address: row.get(1)?,
                label: row.get(2)?,
                created: row.get::<_, u64>(3)?.to_string(),
                status: row.get(4)?,
                derivation_path: if multisig {
                    format!("m/48'/1'/0'/2'/0/{}", row.get::<_, u32>(0)?)
                } else {
                    format!("m/84'/1'/0'/0/{}", row.get::<_, u32>(0)?)
                },
            })
        })
        .map_err(internal)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(internal)
}

fn snapshot_from(
    wallet: &Wallet,
    db: &Connection,
    synced_at: Option<String>,
    multisig: bool,
) -> ApiResult<WalletSnapshotDto> {
    let balance = wallet.balance();
    let tip = wallet.latest_checkpoint().height();
    let addresses = address_rows(db, multisig)?;

    let mut transactions = Vec::new();
    for tx in wallet.transactions_sort_by(|a, b| b.chain_position.cmp(&a.chain_position)) {
        let transaction = tx.tx_node.tx.as_ref();
        let (sent, received) = wallet.sent_and_received(transaction);
        let is_received = received > sent;
        let transaction_fee = wallet.calculate_fee(transaction).ok();
        let amount = if is_received {
            received - sent
        } else {
            (sent - received)
                .checked_sub(transaction_fee.unwrap_or(Amount::ZERO))
                .unwrap_or(Amount::ZERO)
        };
        let (confirmations, block, date) = confirmations(&tx.chain_position, tip);
        let (address, label) = tx_counterparty(wallet, db, transaction, is_received);
        transactions.push(TransactionDto {
            id: tx.tx_node.txid.to_string(),
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
            block,
        });
    }

    let mut utxos = Vec::new();
    let frozen = {
        let mut statement = db
            .prepare("SELECT outpoint FROM satchel_frozen_coins")
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
        utxos.push(UtxoDto {
            outpoint: output.outpoint.to_string(),
            amount: output.txout.value.to_sat(),
            confirmations: output_confirmations,
            address,
            label,
            frozen: frozen.contains(&output.outpoint.to_string()),
        });
    }

    Ok(WalletSnapshotDto {
        network: "regtest",
        balance: BalanceDto {
            confirmed: balance.confirmed.to_sat(),
            trusted_pending: balance.trusted_pending.to_sat(),
            total: balance.total().to_sat(),
        },
        transactions,
        utxos,
        receive_addresses: addresses,
        synced_at,
    })
}

fn enqueue_snapshot_notifications(db: &Connection, snapshot: &WalletSnapshotDto) -> ApiResult<()> {
    for transaction in &snapshot.transactions {
        if transaction.direction == "received" {
            notifications::enqueue(
                db,
                &WalletNotification::PaymentReceived {
                    txid: transaction.id.clone(),
                    amount: transaction.amount,
                    balance: snapshot.balance.total,
                },
                now(),
            )
            .map_err(internal)?;
        }
        if transaction.confirmations > 0 {
            notifications::enqueue(
                db,
                &WalletNotification::FirstConfirmation {
                    txid: transaction.id.clone(),
                    balance: snapshot.balance.total,
                },
                now(),
            )
            .map_err(internal)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn wallet_exists(app: AppHandle) -> ApiResult<bool> {
    ensure_registry_migrated(&app)?;
    let registry = registry::load(&registry_path(&app)?).map_err(registry_api_error)?;
    let Some(selected) = registry.selected_wallet_id else {
        return Ok(false);
    };
    let directory = profile_directory(&app, selected)?;
    Ok(directory.join("wallet.sqlite").exists() && directory.join("secret.json").exists())
}

#[tauri::command]
pub fn wallet_profiles(app: AppHandle) -> ApiResult<WalletRegistry> {
    ensure_registry_migrated(&app)?;
    registry::load(&registry_path(&app)?).map_err(registry_api_error)
}

#[tauri::command]
pub fn wallet_select(
    app: AppHandle,
    state: State<'_, AppState>,
    wallet_id: String,
) -> ApiResult<WalletProfile> {
    let _operation = operation_guard(&state)?;
    let id = Uuid::parse_str(&wallet_id)
        .map_err(|_| api_error("wallet_not_found", "The selected wallet does not exist."))?;
    let mut registry = load_registry(&app)?;
    registry.select(id).map_err(registry_api_error)?;
    save_registry(&app, &registry)?;
    state.proposals.lock().map_err(internal)?.clear();
    lock_wallet(&state)?;
    registry
        .wallets
        .into_iter()
        .find(|wallet| wallet.id == id)
        .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))
}

#[tauri::command]
pub fn wallet_generate_mnemonic(app: AppHandle, state: State<'_, AppState>) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    let mnemonic = Mnemonic::from_entropy(&entropy).map_err(internal)?;
    entropy.zeroize();
    let words = Zeroizing::new(mnemonic.to_string());
    let confirmed = native_backup::present(&app, words.as_str()).map_err(internal)?;
    if !confirmed {
        state.pending_mnemonic.lock().map_err(internal)?.take();
        return Err(api_error(
            "onboarding_cancelled",
            "Recovery-word backup was cancelled.",
        ));
    }
    *state.pending_mnemonic.lock().map_err(internal)? = Some(PendingMnemonic {
        words,
        created_at: now(),
    });
    Ok(())
}

#[tauri::command]
pub fn wallet_cancel_onboarding(state: State<'_, AppState>) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    state.pending_mnemonic.lock().map_err(internal)?.take();
    Ok(())
}

#[tauri::command]
pub fn wallet_create(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    credential: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    let pending = state
        .pending_mnemonic
        .lock()
        .map_err(internal)?
        .take()
        .ok_or_else(|| {
            api_error(
                "onboarding_expired",
                "Generate and confirm a new recovery-word backup first.",
            )
        })?;
    if !onboarding_session_is_fresh(pending.created_at, now()) {
        return Err(api_error(
            "onboarding_expired",
            "Recovery-word confirmation expired. Generate a new wallet again.",
        ));
    }
    let mnemonic = Mnemonic::parse(pending.words.as_str()).map_err(internal)?;
    if let Err(error) = create_from_mnemonic(&app, name, mnemonic, credential.as_str()) {
        *state.pending_mnemonic.lock().map_err(internal)? = Some(pending);
        return Err(error);
    }
    unlock_selected(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn wallet_recover(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    mnemonic: String,
    credential: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let mnemonic_words = Zeroizing::new(mnemonic);
    let credential = Zeroizing::new(credential);
    if mnemonic_words.len() > MAX_MNEMONIC_INPUT_BYTES {
        return Err(api_error(
            "invalid_mnemonic",
            "Enter a valid 24-word recovery phrase.",
        ));
    }
    let mnemonic = Mnemonic::parse(mnemonic_words.trim())
        .map_err(|_| api_error("invalid_mnemonic", "Enter a valid 24-word recovery phrase."))?;
    if mnemonic.word_count() != 24 {
        return Err(api_error(
            "invalid_mnemonic",
            "Satchel requires exactly 24 recovery words.",
        ));
    }
    create_from_mnemonic(&app, name, mnemonic, credential.as_str())?;
    unlock_selected(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn wallet_unlock(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let result = match selected_profile(&app)?.kind {
        WalletKind::SingleKey => decrypt_mnemonic(&app, credential.as_str()).map(|_| ()),
        WalletKind::Multisig => verify_multisig_credential(&app, credential.as_str()),
        WalletKind::WatchOnly => Ok(()),
    };
    record_auth_result(&app, &state, &result)?;
    result?;
    unlock_selected(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn wallet_lock(state: State<'_, AppState>) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    state.proposals.lock().map_err(internal)?.clear();
    lock_wallet(&state)
}

#[tauri::command]
pub fn wallet_snapshot(app: AppHandle, state: State<'_, AppState>) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    snapshot_from(&wallet, &db, None, false)
}

#[tauri::command]
pub fn wallet_sync(app: AppHandle, state: State<'_, AppState>) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    sync_loaded_wallet(&mut wallet, &mut db)?;
    let snapshot = snapshot_from(&wallet, &db, Some(now().to_string()), false)?;
    enqueue_snapshot_notifications(&db, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn wallet_notifications(
    app: AppHandle,
    state: State<'_, AppState>,
    multisig: bool,
) -> ApiResult<Vec<notifications::NotificationEnvelope>> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = if multisig {
        open_multisig_db(&app)?
    } else {
        open_db(&app)?
    };
    notifications::pending(&db).map_err(internal)
}

#[tauri::command]
pub fn wallet_notifications_ack(
    app: AppHandle,
    state: State<'_, AppState>,
    multisig: bool,
    ids: Vec<i64>,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    if ids.len() > 1_000 || ids.iter().any(|id| *id <= 0) {
        return Err(api_error(
            "internal_error",
            "The notification acknowledgement is invalid.",
        ));
    }
    let mut db = if multisig {
        open_multisig_db(&app)?
    } else {
        open_db(&app)?
    };
    notifications::acknowledge(&mut db, &ids).map_err(internal)?;
    Ok(())
}

#[tauri::command]
pub fn address_create(
    app: AppHandle,
    state: State<'_, AppState>,
    label: String,
) -> ApiResult<ReceiveAddressDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let label = normalize_label(&label)?;
    let mut db = open_db(&app)?;
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = Wallet::load()
        .check_network(NETWORK)
        .load_wallet(&mut transaction)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_not_found", "Wallet database is empty."))?;
    let info = wallet.reveal_next_address(KeychainKind::External);
    let created = now();
    transaction
        .execute(
            "INSERT INTO satchel_addresses (idx, address, label, created_at, state) VALUES (?1, ?2, ?3, ?4, 'awaiting')",
            params![info.index, info.address.to_string(), label, created],
        )
        .map_err(internal)?;
    wallet.persist(&mut transaction).map_err(internal)?;
    transaction.commit().map_err(internal)?;
    Ok(ReceiveAddressDto {
        id: info.index,
        address: info.address.to_string(),
        label,
        created: created.to_string(),
        status: "awaiting".to_owned(),
        derivation_path: format!("m/84'/1'/0'/0/{}", info.index),
    })
}

#[tauri::command]
pub fn address_discard(app: AppHandle, state: State<'_, AppState>, id: u32) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_db(&app)?;
    let changed = db
        .execute(
            "UPDATE satchel_addresses SET state = 'discarded' WHERE idx = ?1 AND state = 'awaiting' AND observed = 0",
            params![id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "address_not_discardable",
            "Only an unused address awaiting payment can be discarded.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn coin_set_frozen(
    app: AppHandle,
    state: State<'_, AppState>,
    outpoint: String,
    frozen: bool,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let parsed = OutPoint::from_str(outpoint.trim())
        .map_err(|_| api_error("internal_error", "The selected coin outpoint is invalid."))?;
    let mut db = open_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    if !wallet.list_unspent().any(|coin| coin.outpoint == parsed) {
        return Err(api_error(
            "internal_error",
            "The selected coin is no longer available.",
        ));
    }
    if frozen {
        db.execute(
            "INSERT OR REPLACE INTO satchel_frozen_coins (outpoint, frozen_at) VALUES (?1, ?2)",
            params![parsed.to_string(), now()],
        )
        .map_err(internal)?;
    } else {
        db.execute(
            "DELETE FROM satchel_frozen_coins WHERE outpoint = ?1",
            params![parsed.to_string()],
        )
        .map_err(internal)?;
    }
    Ok(())
}

#[tauri::command]
pub fn fees_estimate() -> FeeEstimatesDto {
    FeeEstimatesDto {
        economy: 1.0,
        standard: 2.0,
        priority: 5.0,
        source: "Regtest policy",
    }
}

fn hardware_api_error(error: HardwareError) -> ApiError {
    let message = match error {
        HardwareError::InvalidArgument => "The hardware wallet request was rejected.",
        HardwareError::Unavailable => "Bitcoin Core HWI is not installed or could not be started.",
        HardwareError::TimedOut => "The hardware wallet did not respond in time.",
        HardwareError::OutputTooLarge => "The hardware wallet returned an oversized response.",
        HardwareError::CommandFailed => "The hardware wallet rejected the request.",
        HardwareError::Io => "Communication with the hardware wallet failed.",
    };
    api_error(error.code(), message)
}

fn verify_connected_hardware_identity(
    device_id: &str,
    expected_fingerprints: &[String],
) -> ApiResult<String> {
    let encoded = hwi_cli().enumerate().map_err(hardware_api_error)?;
    let devices: Vec<HwiDevice> = serde_json::from_slice(&encoded).map_err(internal)?;
    let device = devices
        .into_iter()
        .find(|device| device.path == device_id)
        .ok_or_else(|| {
            api_error(
                "hardware_unavailable",
                "The selected device is no longer connected.",
            )
        })?;
    let fingerprint = device.fingerprint.ok_or_else(|| {
        api_error(
            "hardware_unavailable",
            "The device did not return a master fingerprint.",
        )
    })?;
    if !expected_fingerprints
        .iter()
        .any(|expected| expected.eq_ignore_ascii_case(&fingerprint))
    {
        return Err(api_error(
            "unknown_signer",
            "The connected device is not a cosigner in this wallet policy.",
        ));
    }
    Ok(device.device_type)
}

#[tauri::command]
pub async fn hardware_list() -> ApiResult<Vec<HardwareDeviceDto>> {
    tauri::async_runtime::spawn_blocking(|| {
        let encoded = hwi_cli().enumerate().map_err(hardware_api_error)?;
        let devices: Vec<HwiDevice> = serde_json::from_slice(&encoded).map_err(internal)?;
        Ok(devices
            .into_iter()
            .filter(|device| device.fingerprint.is_some())
            .map(|device| HardwareDeviceDto {
                id: device.path,
                label: if device.model.is_empty() {
                    device.device_type.clone()
                } else {
                    device.model.clone()
                },
                model: device.device_type,
                fingerprint: device.fingerprint,
                connected: true,
            })
            .collect())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn hardware_check_cosigner(cosigner: CosignerInput) -> ApiResult<CosignerHealthDto> {
    cosigner.parse_for_validation().map_err(policy_api_error)?;
    let checked_at = now().to_string();
    match cosigner.source {
        CosignerSource::Usb => tauri::async_runtime::spawn_blocking(move || {
            let encoded = hwi_cli().enumerate().map_err(hardware_api_error)?;
            let devices: Vec<HwiDevice> = serde_json::from_slice(&encoded).map_err(internal)?;
            let matched = devices.into_iter().any(|device| {
                device
                    .fingerprint
                    .is_some_and(|fingerprint| fingerprint.eq_ignore_ascii_case(&cosigner.fingerprint))
            });
            if !matched {
                return Err(api_error(
                    "hardware_unavailable",
                    "Connect and unlock this device, then keep it ready over USB.",
                ));
            }
            Ok(CosignerHealthDto {
                status: "healthy",
                checked_at,
                summary: format!("Connected identity matches {}.", cosigner.fingerprint),
            })
        })
        .await
        .map_err(internal)?,
        CosignerSource::Virtual => Err(api_error(
            "hardware_unavailable",
            "Virtual devices are available only in the browser prototype.",
        )),
        CosignerSource::Qr | CosignerSource::File | CosignerSource::Manual => {
            Ok(CosignerHealthDto {
                status: "record_valid",
                checked_at,
                summary: "Public key, fingerprint, and derivation path are complete. Physical presence cannot be checked for an offline key.".to_owned(),
            })
        }
    }
}

#[tauri::command]
pub async fn hardware_import_cosigner(
    device_id: String,
    label: String,
) -> ApiResult<crate::multisig::CosignerInput> {
    let label = normalize_label(&label)?;
    tauri::async_runtime::spawn_blocking(move || {
        let enumerated = hwi_cli().enumerate().map_err(hardware_api_error)?;
        let devices: Vec<HwiDevice> = serde_json::from_slice(&enumerated).map_err(internal)?;
        let device = devices
            .into_iter()
            .find(|device| device.path == device_id)
            .ok_or_else(|| {
                api_error(
                    "hardware_unavailable",
                    "The selected device is no longer connected.",
                )
            })?;
        let fingerprint = device.fingerprint.ok_or_else(|| {
            api_error(
                "hardware_unavailable",
                "The device did not return a master fingerprint.",
            )
        })?;
        let output = hwi_cli()
            .account_xpub(
                &device.device_type,
                &device_id,
                crate::multisig::MULTISIG_ACCOUNT_PATH,
            )
            .map_err(hardware_api_error)?;
        let response: HwiXpub = serde_json::from_slice(&output).map_err(internal)?;
        let xpub = response.xpub.ok_or_else(|| {
            drop(response.error);
            missing_hwi_value(response.code, "The device did not return an account xpub.")
        })?;
        let input = crate::multisig::CosignerInput {
            id: Uuid::new_v4().to_string(),
            label,
            fingerprint,
            xpub,
            derivation_path: crate::multisig::MULTISIG_ACCOUNT_PATH.to_owned(),
            source: crate::multisig::CosignerSource::Usb,
        };
        input.parse_for_validation().map_err(policy_api_error)?;
        Ok(input)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn hardware_verify_multisig_address(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    address_id: u32,
) -> ApiResult<()> {
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let db = open_multisig_db(&app)?;
    let expected: String = db
        .query_row(
            "SELECT address FROM satchel_addresses WHERE idx = ?1 AND state != 'discarded'",
            params![address_id],
            |row| row.get(0),
        )
        .map_err(|_| api_error("address_not_found", "The receive address was not found."))?;
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&metadata.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(address_id)
        .map_err(internal)?
        .to_string();
    let expected_fingerprints = metadata
        .cosigners
        .iter()
        .map(|cosigner| cosigner.fingerprint.clone())
        .collect::<Vec<_>>();
    let displayed = tauri::async_runtime::spawn_blocking(move || {
        let device_type = verify_connected_hardware_identity(&device_id, &expected_fingerprints)?;
        hwi_cli()
            .display_descriptor_address(&device_type, &device_id, &descriptor)
            .map_err(hardware_api_error)
    })
    .await
    .map_err(internal)??;
    let response: HwiAddress = serde_json::from_slice(&displayed).map_err(internal)?;
    let actual = response.address.ok_or_else(|| {
        drop(response.error);
        missing_hwi_value(
            response.code,
            "The device did not return the displayed address.",
        )
    })?;
    if actual != expected {
        return Err(api_error(
            "hardware_address_mismatch",
            "The address returned by the device does not match this wallet.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn multisig_preview(policy: PolicyInput) -> ApiResult<MultisigPreviewDto> {
    reject_virtual_cosigners(&policy.cosigners)?;
    policy.preview().map_err(policy_api_error)
}

#[tauri::command]
pub fn recovery_policy_analyze(
    template: RecoveryTemplate,
    cosigners: Vec<crate::multisig::CosignerInput>,
) -> ApiResult<PolicyAnalysis> {
    reject_virtual_cosigners(&cosigners)?;
    analyze_template(&template, &cosigners).map_err(recovery_api_error)
}

#[tauri::command]
pub fn multisig_wallet(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Option<MultisigWalletDto>> {
    let _operation = operation_guard(&state)?;
    ensure_registry_migrated(&app)?;
    let registry = registry::load(&registry_path(&app)?).map_err(registry_api_error)?;
    let Some(selected) = registry.selected_wallet_id else {
        return Ok(None);
    };
    let Some(profile) = registry.wallets.iter().find(|wallet| wallet.id == selected) else {
        return Err(registry_api_error(RegistryError::UnknownSelection));
    };
    if profile.kind != WalletKind::Multisig {
        return Ok(None);
    }
    let path = multisig_metadata_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let encoded = read_private_text(&path)?;
    serde_json::from_str(&encoded).map(Some).map_err(internal)
}

#[tauri::command]
pub fn multisig_export(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<String> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    check_auth_throttle(&app, &state)?;
    let verified = verify_multisig_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let backup = MultisigBackupDto {
        version: 1,
        network: "regtest".to_owned(),
        wallet: read_multisig_metadata(&app)?,
    };
    serde_json::to_string_pretty(&backup).map_err(internal)
}

#[tauri::command]
pub fn multisig_recovery_drill(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
) -> ApiResult<RecoveryDrillDto> {
    let _operation = operation_guard(&state)?;
    let backup = validate_multisig_backup(&encoded_backup)?;
    let first_address = first_multisig_address(&backup.wallet)?;
    let matches_current_wallet = read_multisig_metadata(&app)
        .and_then(|wallet| first_multisig_address(&wallet))
        .map(|current| current == first_address)
        .unwrap_or(false);
    if matches_current_wallet {
        let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
        state
            .verified_recovery
            .lock()
            .map_err(internal)?
            .insert(wallet_id, backup.wallet.external_descriptor.clone());
    }
    Ok(RecoveryDrillDto {
        first_address,
        matches_current_wallet,
    })
}

#[tauri::command]
pub fn multisig_recover(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let backup = validate_multisig_backup(&encoded_backup)?;
    let (id, dir) = prepare_profile_directory(&app)?;
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        Wallet::create(
            backup.wallet.external_descriptor.clone(),
            backup.wallet.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;
        let marker = format!("satchel-multisig:{}", backup.wallet.external_descriptor);
        secure_store::store(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        write_private_json(&dir.join("wallet.json"), &backup.wallet)?;
        commit_multisig_profile(&app, id, &backup.wallet)?;
        Ok(backup.wallet)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    } else {
        unlock_selected(&app, &state)?;
    }
    result
}

#[tauri::command]
pub fn multisig_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
    confirmation: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    let wallet = read_multisig_metadata(&app)?;
    let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
    let drill_verified = state
        .verified_recovery
        .lock()
        .map_err(internal)?
        .get(&wallet_id)
        .is_some_and(|descriptor| descriptor == &wallet.external_descriptor);
    if !drill_verified {
        return Err(api_error(
            "backup_mismatch",
            "Run a successful recovery drill before deleting this coordinator.",
        ));
    }
    if confirmation != wallet.name {
        return Err(api_error(
            "confirmation_mismatch",
            "Type the exact wallet name to delete this coordinator.",
        ));
    }
    check_auth_throttle(&app, &state)?;
    let verified = verify_multisig_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let dir = profile_directory(&app, wallet_id)?;
    delete_registered_wallet(&app, wallet_id, &dir)?;
    state
        .verified_recovery
        .lock()
        .map_err(internal)?
        .remove(&wallet_id);
    lock_wallet(&state)?;
    Ok(())
}

#[tauri::command]
pub fn multisig_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    snapshot_from(&wallet, &db, None, true)
}

#[tauri::command]
pub fn multisig_sync(app: AppHandle, state: State<'_, AppState>) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    sync_loaded_wallet(&mut wallet, &mut db)?;
    let snapshot = snapshot_from(&wallet, &db, Some(now().to_string()), true)?;
    enqueue_snapshot_notifications(&db, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn multisig_address_create(
    app: AppHandle,
    state: State<'_, AppState>,
    label: String,
) -> ApiResult<ReceiveAddressDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let label = normalize_label(&label)?;
    let mut db = open_multisig_db(&app)?;
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = Wallet::load()
        .check_network(NETWORK)
        .load_wallet(&mut transaction)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_not_found", "Multisig wallet database is empty."))?;
    let info = wallet.reveal_next_address(KeychainKind::External);
    let created = now();
    transaction
        .execute(
            "INSERT INTO satchel_addresses (idx, address, label, created_at, state) VALUES (?1, ?2, ?3, ?4, 'awaiting')",
            params![info.index, info.address.to_string(), label, created],
        )
        .map_err(internal)?;
    wallet.persist(&mut transaction).map_err(internal)?;
    transaction.commit().map_err(internal)?;
    Ok(ReceiveAddressDto {
        id: info.index,
        address: info.address.to_string(),
        label,
        created: created.to_string(),
        status: "awaiting".to_owned(),
        derivation_path: format!("m/48'/1'/0'/2'/0/{}", info.index),
    })
}

#[tauri::command]
pub fn multisig_address_discard(
    app: AppHandle,
    state: State<'_, AppState>,
    id: u32,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_multisig_db(&app)?;
    let changed = db
        .execute(
            "UPDATE satchel_addresses SET state = 'discarded' WHERE idx = ?1 AND state = 'awaiting' AND observed = 0",
            params![id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "address_not_discardable",
            "Only an unused address awaiting payment can be discarded.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn multisig_tx_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    recipient: String,
    amount: u64,
    fee_rate: f64,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    if amount == 0 {
        return Err(api_error(
            "invalid_amount",
            "Amount must be greater than zero.",
        ));
    }
    if !fee_rate.is_finite() || fee_rate <= 0.0 || fee_rate > 10_000.0 {
        return Err(api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        ));
    }
    let unchecked = Address::from_str(recipient.trim())
        .map_err(|_| api_error("invalid_address", "Enter a valid regtest Bitcoin address."))?;
    let address = unchecked
        .require_network(NETWORK)
        .map_err(|_| api_error("invalid_address", "The address is not for regtest."))?;
    let applied_fee_rate = fee_rate.ceil();
    let rate = FeeRate::from_sat_per_vb(applied_fee_rate as u64)
        .ok_or_else(|| api_error("invalid_amount", "Fee rate must be greater than zero."))?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    let mut builder = wallet.build_tx();
    builder
        .add_recipient(address.script_pubkey(), Amount::from_sat(amount))
        .fee_rate(rate);
    let psbt = builder.finish().map_err(|error| {
        let message = error.to_string();
        if message.to_lowercase().contains("insufficient") {
            api_error("insufficient_funds", message)
        } else {
            internal(message)
        }
    })?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the transaction fee."))?
        .to_sat();
    let proposal_id = Uuid::new_v4().to_string();
    let encoded = encode_psbt(&psbt);
    let created_at = now();
    db.execute(
        "INSERT INTO satchel_proposals (proposal_id, recipient, amount, fee, fee_rate, psbt, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,'collecting',?7)",
        params![proposal_id, address.to_string(), amount, fee, applied_fee_rate, encoded, created_at],
    ).map_err(internal)?;
    load_multisig_proposal(&db, &metadata, &proposal_id)
}

#[tauri::command]
pub fn multisig_proposals(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<MultisigProposalDto>> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let db = open_multisig_db(&app)?;
    let mut statement = db.prepare(
        "SELECT proposal_id, recipient, amount, fee, fee_rate, psbt, status, created_at FROM satchel_proposals WHERE status IN ('collecting','ready') ORDER BY created_at DESC",
    ).map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
            ))
        })
        .map_err(internal)?;
    rows.map(|row| {
        row.map_err(internal)
            .and_then(|row| proposal_dto(row, &metadata))
    })
    .collect()
}

fn import_multisig_proposal(
    app: &AppHandle,
    proposal_id: &str,
    signed_psbt: &str,
) -> ApiResult<MultisigProposalDto> {
    let metadata = read_multisig_metadata(app)?;
    let mut db = open_multisig_db(app)?;
    let current = load_multisig_proposal(&db, &metadata, proposal_id)?;
    let original_encoded = current.psbt.clone();
    let mut original = decode_psbt(&original_encoded).map_err(proposal_api_error)?;
    let imported = decode_psbt(signed_psbt).map_err(proposal_api_error)?;
    let fingerprints = multisig_fingerprints(&metadata)?;
    let progress = merge_signed_psbt(&mut original, imported, &fingerprints, metadata.threshold)
        .map_err(proposal_api_error)?;
    if progress.can_finalize {
        let wallet = load_wallet(&mut db)?;
        let mut validation = original.clone();
        if !wallet
            .finalize_psbt(&mut validation, SignOptions::default())
            .map_err(internal)?
        {
            return Err(api_error(
                "finalization_failed",
                "The collected signatures do not validly satisfy this wallet policy.",
            ));
        }
    }
    let status = if progress.can_finalize {
        "ready"
    } else {
        "collecting"
    };
    let changed = db.execute(
        "UPDATE satchel_proposals SET psbt = ?1, status = ?2 WHERE proposal_id = ?3 AND status IN ('collecting','ready') AND psbt = ?4",
        params![encode_psbt(&original), status, proposal_id, original_encoded],
    ).map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while signatures were being merged. Reload it and try again.",
        ));
    }
    load_multisig_proposal(&db, &metadata, proposal_id)
}

#[tauri::command]
pub fn multisig_proposal_import(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    signed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    import_multisig_proposal(&app, &proposal_id, &signed_psbt)
}

#[tauri::command]
pub async fn hardware_sign_multisig(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    device_id: String,
) -> ApiResult<MultisigProposalDto> {
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let db = open_multisig_db(&app)?;
    let proposal = load_multisig_proposal(&db, &metadata, &proposal_id)?;
    drop(db);
    let encoded = proposal.psbt;
    let expected_fingerprints = metadata
        .cosigners
        .iter()
        .map(|cosigner| cosigner.fingerprint.clone())
        .collect::<Vec<_>>();
    let signed = tauri::async_runtime::spawn_blocking(move || {
        let device_type = verify_connected_hardware_identity(&device_id, &expected_fingerprints)?;
        let output = hwi_cli()
            .sign_psbt(&device_type, &device_id, &encoded)
            .map_err(hardware_api_error)?;
        let response: HwiPsbt = serde_json::from_slice(&output).map_err(internal)?;
        response.psbt.ok_or_else(|| {
            drop(response.error);
            missing_hwi_value(response.code, "The device did not return a signed PSBT.")
        })
    })
    .await
    .map_err(internal)??;
    import_multisig_proposal(&app, &proposal_id, &signed)
}

#[tauri::command]
pub fn multisig_proposal_broadcast(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    credential: String,
) -> ApiResult<BroadcastResultDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    check_auth_throttle(&app, &state)?;
    let credential_result = verify_multisig_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &credential_result)?;
    credential_result?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let proposal = load_multisig_proposal(&db, &metadata, &proposal_id)?;
    if !proposal.can_finalize {
        return Err(api_error(
            "insufficient_signatures",
            "Collect the required signatures before broadcasting.",
        ));
    }
    let mut psbt = decode_psbt(&proposal.psbt).map_err(proposal_api_error)?;
    let wallet = load_wallet(&mut db)?;
    if !wallet
        .finalize_psbt(&mut psbt, SignOptions::default())
        .map_err(internal)?
    {
        return Err(api_error(
            "finalization_failed",
            "The signed transaction does not satisfy the wallet policy.",
        ));
    }
    let transaction = psbt.extract_tx().map_err(internal)?;
    let txid = broadcast_transaction(&transaction)?;
    let mut wallet = load_wallet(&mut db)?;
    let sync_pending = sync_loaded_wallet(&mut wallet, &mut db).is_err();
    let snapshot = snapshot_from(
        &wallet,
        &db,
        (!sync_pending).then(|| now().to_string()),
        true,
    )?;
    let persisted = db.transaction().map_err(internal)?;
    let changed = persisted
        .execute(
            "UPDATE satchel_proposals SET status = 'broadcast', txid = ?1 WHERE proposal_id = ?2 AND status IN ('collecting','ready')",
            params![txid.to_string(), proposal_id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while it was being broadcast.",
        ));
    }
    notifications::enqueue(
        &persisted,
        &WalletNotification::TransactionBroadcast {
            txid: txid.to_string(),
            balance: snapshot.balance.total,
        },
        now(),
    )
    .map_err(internal)?;
    persisted.commit().map_err(internal)?;
    Ok(BroadcastResultDto {
        txid: txid.to_string(),
        snapshot,
        sync_pending,
    })
}

#[tauri::command]
pub fn multisig_proposal_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_multisig_db(&app)?;
    let changed = db.execute(
        "UPDATE satchel_proposals SET status = 'cancelled' WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
    ).map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "proposal_not_found",
            "Payment proposal was not found or is no longer active.",
        ))
    }
}

#[tauri::command]
pub fn multisig_create(
    app: AppHandle,
    state: State<'_, AppState>,
    policy: PolicyInput,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    reject_virtual_cosigners(&policy.cosigners)?;
    let preview = policy.preview().map_err(policy_api_error)?;
    let (id, dir) = prepare_profile_directory(&app)?;
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        Wallet::create(
            preview.external_descriptor.clone(),
            preview.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;

        let marker = format!("satchel-multisig:{}", preview.external_descriptor);
        secure_store::store(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        let wallet = MultisigWalletDto {
            kind: "multisig".to_owned(),
            name: preview.name,
            threshold: preview.threshold,
            cosigners: preview.cosigners,
            external_descriptor: preview.external_descriptor,
            internal_descriptor: preview.internal_descriptor,
            created_at: now().to_string(),
            policy_type: "standard".to_owned(),
            recovery_template: None,
            spending_paths: Vec::new(),
        };
        write_private_json(&dir.join("wallet.json"), &wallet)?;
        commit_multisig_profile(&app, id, &wallet)?;
        Ok(wallet)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    if result.is_ok() {
        unlock_selected(&app, &state)?;
        reset_auth_throttle(&app, &state)?;
    }
    result
}

#[tauri::command]
pub fn multisig_recovery_create(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    template: RecoveryTemplate,
    cosigners: Vec<crate::multisig::CosignerInput>,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    reject_virtual_cosigners(&cosigners)?;
    let policy = PolicyInput {
        name: name.clone(),
        threshold: 2,
        cosigners: cosigners.clone(),
    };
    policy.preview().map_err(policy_api_error)?;
    let analysis = analyze_template(&template, &cosigners).map_err(recovery_api_error)?;
    let threshold = analysis
        .paths
        .first()
        .map(|path| path.threshold)
        .unwrap_or(2);
    let (id, dir) = prepare_profile_directory(&app)?;
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        Wallet::create(
            analysis.external_descriptor.clone(),
            analysis.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;
        let marker = format!("satchel-multisig:{}", analysis.external_descriptor);
        secure_store::store(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        let wallet = MultisigWalletDto {
            kind: "multisig".to_owned(),
            name,
            threshold,
            cosigners,
            external_descriptor: analysis.external_descriptor,
            internal_descriptor: analysis.internal_descriptor,
            created_at: now().to_string(),
            policy_type: recovery_policy_type(&template).to_owned(),
            recovery_template: Some(template),
            spending_paths: analysis.paths,
        };
        write_private_json(&dir.join("wallet.json"), &wallet)?;
        commit_multisig_profile(&app, id, &wallet)?;
        Ok(wallet)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    if result.is_ok() {
        unlock_selected(&app, &state)?;
        reset_auth_throttle(&app, &state)?;
    }
    result
}

#[tauri::command]
pub fn tx_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    recipient: String,
    amount: u64,
    fee_rate: f64,
    coin_selection: CoinSelectionInput,
) -> ApiResult<PaymentProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    if amount == 0 {
        return Err(api_error(
            "invalid_amount",
            "Amount must be greater than zero.",
        ));
    }
    if !fee_rate.is_finite() || fee_rate <= 0.0 || fee_rate > 10_000.0 {
        return Err(api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        ));
    }
    let unchecked = Address::from_str(recipient.trim())
        .map_err(|_| api_error("invalid_address", "Enter a valid regtest Bitcoin address."))?;
    let address = unchecked
        .require_network(NETWORK)
        .map_err(|_| api_error("invalid_address", "The address is not for regtest."))?;
    let applied_fee_rate = fee_rate.ceil();
    let rate = FeeRate::from_sat_per_vb(applied_fee_rate as u64)
        .ok_or_else(|| api_error("invalid_amount", "Fee rate must be greater than zero."))?;
    let mut db = open_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    let mut builder = wallet.build_tx();
    builder
        .add_recipient(address.script_pubkey(), Amount::from_sat(amount))
        .fee_rate(rate);
    let frozen = frozen_outpoints(&db)?;
    match coin_selection {
        CoinSelectionInput::Auto => {
            builder.unspendable(frozen);
        }
        CoinSelectionInput::Manual { outpoints } => {
            if outpoints.is_empty() {
                return Err(api_error(
                    "invalid_amount",
                    "Select at least one available coin.",
                ));
            }
            let selected = outpoints
                .iter()
                .map(|value| {
                    OutPoint::from_str(value).map_err(|_| {
                        api_error("internal_error", "A selected coin outpoint is invalid.")
                    })
                })
                .collect::<ApiResult<Vec<_>>>()?;
            if selected.iter().any(|item| frozen.contains(item)) {
                return Err(api_error(
                    "insufficient_funds",
                    "Unfreeze selected coins before spending them.",
                ));
            }
            builder
                .add_utxos(&selected)
                .map_err(internal)?
                .manually_selected_only();
        }
    }
    let psbt = builder.finish().map_err(|error| {
        let message = error.to_string();
        if message.to_lowercase().contains("insufficient") {
            api_error("insufficient_funds", message)
        } else {
            internal(message)
        }
    })?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the transaction fee."))?
        .to_sat();
    let selected_outpoints = psbt
        .unsigned_tx
        .input
        .iter()
        .map(|input| input.previous_output.to_string())
        .collect();
    let proposal_id = Uuid::new_v4().to_string();
    let proposal = PaymentProposalDto {
        proposal_id: proposal_id.clone(),
        recipient: address.to_string(),
        amount,
        fee,
        fee_rate: applied_fee_rate,
        total: amount.saturating_add(fee),
        selected_outpoints,
    };
    persist_single_proposal(&db, &proposal, &psbt)?;
    state
        .proposals
        .lock()
        .map_err(internal)?
        .insert(proposal_id.clone(), PendingProposal { psbt });
    Ok(proposal)
}

#[tauri::command]
pub fn tx_sign_and_broadcast(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    credential: String,
) -> ApiResult<BroadcastResultDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    check_auth_throttle(&app, &state)?;
    let credential_result = decrypt_mnemonic(&app, credential.as_str());
    record_auth_result(&app, &state, &credential_result)?;
    let mnemonic = credential_result?;
    let master = root_key(&mnemonic, credential.as_str())?;
    let mut db = open_db(&app)?;
    let mut proposal = state
        .proposals
        .lock()
        .map_err(internal)?
        .remove(&proposal_id)
        .map(Ok)
        .unwrap_or_else(|| load_single_proposal(&db, &proposal_id))?;
    let signing_wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(NETWORK)
    .create_wallet_no_persist()
    .map_err(internal)?;
    let finalized = signing_wallet
        .sign(
            &mut proposal.psbt,
            SignOptions {
                // The PSBT was built and retained inside this trusted Rust process.
                trust_witness_utxo: true,
                ..SignOptions::default()
            },
        )
        .map_err(internal)?;
    if !finalized {
        return Err(internal("The transaction could not be fully signed."));
    }
    let transaction = proposal.psbt.extract_tx().map_err(internal)?;
    let txid = broadcast_transaction(&transaction)?;
    let mut wallet = load_wallet(&mut db)?;
    let sync_pending = sync_loaded_wallet(&mut wallet, &mut db).is_err();
    let snapshot = snapshot_from(
        &wallet,
        &db,
        (!sync_pending).then(|| now().to_string()),
        false,
    )?;
    let persisted = db.transaction().map_err(internal)?;
    let changed = persisted
        .execute(
            "UPDATE satchel_proposals SET status = 'broadcast', txid = ?1 WHERE proposal_id = ?2 AND status = 'collecting'",
            params![txid.to_string(), proposal_id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while it was being broadcast.",
        ));
    }
    notifications::enqueue(
        &persisted,
        &WalletNotification::TransactionBroadcast {
            txid: txid.to_string(),
            balance: snapshot.balance.total,
        },
        now(),
    )
    .map_err(internal)?;
    persisted.commit().map_err(internal)?;
    Ok(BroadcastResultDto {
        txid: txid.to_string(),
        snapshot,
        sync_pending,
    })
}

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
    let verified = decrypt_mnemonic(&app, credential.as_str()).map(|_| ());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    state.proposals.lock().map_err(internal)?.clear();
    let profile = selected_profile_of_kind(&app, WalletKind::SingleKey)?;
    let dir = profile_directory(&app, profile.id)?;
    delete_registered_wallet(&app, profile.id, &dir)?;
    lock_wallet(&state)?;
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
    lock_wallet(&state)?;
    Ok(())
}

fn validate_regtest_reset_confirmation(confirmation: &str) -> ApiResult<()> {
    if confirmation == "RESET REGTEST" {
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
    let tombstone = parent.join(format!(".satchel-deleting-{}", Uuid::new_v4()));
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
    let tombstone = parent.join(format!(".satchel-deleting-{}", Uuid::new_v4()));
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
    secure_store::forget_device_key(&path.join("secret.json"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::multisig::{CosignerInput, CosignerSource, MULTISIG_ACCOUNT_PATH};
    use crate::recovery::{SpendingPath, TimedSpendingPath};

    const WORDS: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

    #[test]
    fn authentication_throttle_round_trips_through_wallet_storage() {
        let mut db = Connection::open_in_memory().unwrap();
        init_app_schema(&db).unwrap();
        let mut throttle = AuthThrottle::default();
        for _ in 0..7 {
            throttle.failed(100);
        }
        save_auth_throttle(&mut db, &throttle).unwrap();
        let restored = load_auth_throttle(&db).unwrap();
        assert_eq!(restored.snapshot(), throttle.snapshot());
        assert!(restored.check(100).is_err());
    }

    #[test]
    fn credential_and_mnemonic_inputs_are_bounded() {
        assert_eq!(
            validate_credential("").unwrap_err().code,
            "invalid_credential"
        );
        assert!(validate_credential(&"x".repeat(MAX_CREDENTIAL_BYTES)).is_ok());
        assert_eq!(
            validate_credential(&"x".repeat(MAX_CREDENTIAL_BYTES + 1))
                .unwrap_err()
                .code,
            "invalid_credential"
        );
        assert!(WORDS.len() < MAX_MNEMONIC_INPUT_BYTES);
    }

    #[test]
    fn command_boundary_error_translation_is_complete_and_stable() {
        let registry_cases = [
            (RegistryError::Missing, "wallet_not_found"),
            (RegistryError::UnknownSelection, "wallet_not_found"),
            (RegistryError::InvalidName, "invalid_wallet_name"),
            (RegistryError::DuplicateIdentity, "wallet_already_exists"),
            (RegistryError::Corrupt, "wallet_corrupt"),
            (RegistryError::UnsupportedVersion, "wallet_corrupt"),
            (RegistryError::InvalidNetwork, "internal_error"),
            (RegistryError::InvalidChecksum, "internal_error"),
            (RegistryError::DuplicateId, "internal_error"),
            (RegistryError::Io, "internal_error"),
        ];
        for (error, code) in registry_cases {
            assert_eq!(registry_api_error(error).code, code);
        }

        for error in [
            PolicyError::InvalidName,
            PolicyError::InvalidCosignerCount,
            PolicyError::UnsafeThreshold,
            PolicyError::DuplicateFingerprint,
            PolicyError::DuplicateXpub,
            PolicyError::InvalidDescriptor,
        ] {
            assert_eq!(policy_api_error(error).code, error.code());
        }

        for error in [
            HardwareError::InvalidArgument,
            HardwareError::Unavailable,
            HardwareError::TimedOut,
            HardwareError::OutputTooLarge,
            HardwareError::CommandFailed,
            HardwareError::Io,
        ] {
            assert_eq!(hardware_api_error(error).code, error.code());
        }

        assert_eq!(
            secure_store_error(SecureStoreError::InvalidCredential).code,
            "invalid_credential"
        );
        assert_eq!(
            secure_store_error(SecureStoreError::Corrupt).code,
            "wallet_corrupt"
        );
        assert_eq!(
            secure_store_error(SecureStoreError::Unavailable).code,
            "secure_storage_unavailable"
        );
    }

    #[test]
    fn descriptor_and_recovery_metadata_helpers_fail_closed() {
        assert_eq!(
            descriptor_checksum("wpkh(key)#12345678").unwrap(),
            "12345678"
        );
        assert_eq!(
            descriptor_checksum("wpkh(key)#short").unwrap_err().code,
            "internal_error"
        );
        assert_eq!(
            descriptor_checksum("wpkh(key)").unwrap_err().code,
            "internal_error"
        );

        let immediate = SpendingPath::new(2, ["a", "b"]);
        let delayed = TimedSpendingPath::new(144, 1, ["c"]);
        assert_eq!(
            recovery_policy_type(&RecoveryTemplate::Recovery {
                immediate,
                recovery: delayed.clone(),
            }),
            "recovery"
        );
        assert_eq!(
            recovery_policy_type(&RecoveryTemplate::Decaying {
                stages: vec![delayed.clone()],
            }),
            "decaying"
        );
        assert_eq!(
            recovery_policy_type(&RecoveryTemplate::Expanding {
                stages: vec![delayed],
            }),
            "expanding"
        );
    }

    #[test]
    fn hwi_response_codes_become_safe_actionable_errors() {
        let cases = [
            (-3, "Reconnect and unlock"),
            (-12, "Reconnect and unlock"),
            (-14, "cancelled"),
            (-15, "busy"),
            (-8, "does not support"),
            (-9, "does not support"),
            (-1, "could not select"),
            (-2, "could not select"),
            (-4, "could not select"),
            (-7, "could not select"),
        ];
        for (code, expected) in cases {
            let error = missing_hwi_value(Some(code), "fallback");
            assert_eq!(error.code, "hardware_unavailable");
            assert!(error.message.contains(expected));
        }
        assert_eq!(missing_hwi_value(None, "fallback").message, "fallback");
    }

    #[test]
    fn native_boundary_rejects_browser_only_virtual_cosigners() {
        let cosigner = CosignerInput {
            id: "virtual-1".to_owned(),
            label: "Browser fixture".to_owned(),
            fingerprint: "00000000".to_owned(),
            xpub: "fixture".to_owned(),
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            source: CosignerSource::Virtual,
        };

        let error = reject_virtual_cosigners(&[cosigner]).expect_err("must reject fixture key");
        assert_eq!(error.code, "hardware_unavailable");
    }

    #[test]
    fn locked_regtest_reset_requires_exact_confirmation() {
        assert!(validate_regtest_reset_confirmation("RESET REGTEST").is_ok());
        for value in ["", "reset regtest", "RESET", " RESET REGTEST"] {
            assert_eq!(
                validate_regtest_reset_confirmation(value).unwrap_err().code,
                "confirmation_mismatch"
            );
        }
    }

    #[test]
    fn pending_mnemonic_session_has_a_bounded_lifetime() {
        assert!(onboarding_session_is_fresh(100, 100));
        assert!(onboarding_session_is_fresh(
            100,
            100 + ONBOARDING_SESSION_SECONDS
        ));
        assert!(!onboarding_session_is_fresh(
            100,
            101 + ONBOARDING_SESSION_SECONDS
        ));
        assert!(onboarding_session_is_fresh(200, 100));
    }

    #[test]
    fn mnemonic_encryption_rejects_the_wrong_credential() {
        let mnemonic = Mnemonic::parse(WORDS).expect("valid public test mnemonic");
        let secret = encrypt_mnemonic(&mnemonic, "correct horse").expect("encrypt");
        let error = decrypt_encrypted_mnemonic(secret, "wrong horse").expect_err("must reject");
        assert_eq!(error.code, "invalid_credential");
    }

    #[test]
    fn persisted_descriptors_are_watch_only() {
        let mnemonic = Mnemonic::parse(WORDS).expect("valid public test mnemonic");
        let (external, internal_template) =
            watch_templates(&mnemonic, "public-regtest-pin").expect("templates");
        let wallet = Wallet::create(external, internal_template)
            .network(NETWORK)
            .create_wallet_no_persist()
            .expect("wallet");
        for keychain in [KeychainKind::External, KeychainKind::Internal] {
            let descriptor = wallet.public_descriptor(keychain).to_string();
            assert!(descriptor.contains("tpub"));
            assert!(!descriptor.contains("prv"));
        }
    }

    #[test]
    fn labels_are_mandatory_and_bounded() {
        assert_eq!(normalize_label("  Invoice 42  ").unwrap(), "Invoice 42");
        assert_eq!(normalize_label("   ").unwrap_err().code, "invalid_label");
        assert_eq!(
            normalize_label(&"x".repeat(49)).unwrap_err().code,
            "invalid_label"
        );
    }

    fn descriptor_backup() -> MultisigBackupDto {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
        let cosigners = (1_u8..=4)
            .map(|index| {
                let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).unwrap();
                let account = master.derive_priv(&secp, &path).unwrap();
                CosignerInput {
                    id: format!("key-{index}"),
                    label: format!("Key {index}"),
                    fingerprint: master.fingerprint(&secp).to_string(),
                    xpub: Xpub::from_priv(&secp, &account).to_string(),
                    derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
                    source: CosignerSource::Manual,
                }
            })
            .collect::<Vec<_>>();
        let preview = PolicyInput {
            name: "Recovery test".to_owned(),
            threshold: 2,
            cosigners,
        }
        .preview()
        .unwrap();
        MultisigBackupDto {
            version: 1,
            network: "regtest".to_owned(),
            wallet: MultisigWalletDto {
                kind: "multisig".to_owned(),
                name: preview.name,
                threshold: preview.threshold,
                cosigners: preview.cosigners,
                external_descriptor: preview.external_descriptor,
                internal_descriptor: preview.internal_descriptor,
                created_at: "1".to_owned(),
                policy_type: "standard".to_owned(),
                recovery_template: None,
                spending_paths: Vec::new(),
            },
        }
    }

    #[test]
    fn descriptor_backup_round_trips_and_reconstructs_a_stable_address() {
        let backup = descriptor_backup();
        let encoded = serde_json::to_string(&backup).unwrap();
        let validated = validate_multisig_backup(&encoded).unwrap();
        assert_eq!(
            first_multisig_address(&validated.wallet).unwrap(),
            first_multisig_address(&backup.wallet).unwrap()
        );
    }

    #[test]
    fn recovery_descriptor_backup_recompiles_the_persisted_template() {
        use crate::recovery::{SpendingPath, TimedSpendingPath};

        let mut backup = descriptor_backup();
        let ids = backup
            .wallet
            .cosigners
            .iter()
            .map(|key| key.id.clone())
            .collect::<Vec<_>>();
        let template = RecoveryTemplate::Recovery {
            immediate: SpendingPath::new(2, ids[..3].to_vec()),
            recovery: TimedSpendingPath::new(4_320, 1, [ids[3].clone()]),
        };
        let analysis = analyze_template(&template, &backup.wallet.cosigners).unwrap();
        backup.wallet.external_descriptor = analysis.external_descriptor;
        backup.wallet.internal_descriptor = analysis.internal_descriptor;
        backup.wallet.policy_type = "recovery".to_owned();
        backup.wallet.recovery_template = Some(template);
        backup.wallet.spending_paths = analysis.paths;

        let validated = validate_multisig_backup(&serde_json::to_string(&backup).unwrap()).unwrap();
        assert_eq!(validated.wallet.policy_type, "recovery");
        assert_eq!(validated.wallet.spending_paths.len(), 2);
        assert_eq!(
            first_multisig_address(&validated.wallet).unwrap(),
            first_multisig_address(&backup.wallet).unwrap()
        );
    }

    #[test]
    fn descriptor_backup_rejects_oversize_network_and_policy_tampering() {
        assert_eq!(
            validate_multisig_backup(&"x".repeat(256 * 1024 + 1))
                .unwrap_err()
                .code,
            "backup_too_large"
        );
        let mut wrong_network = descriptor_backup();
        wrong_network.network = "signet".to_owned();
        assert_eq!(
            validate_multisig_backup(&serde_json::to_string(&wrong_network).unwrap())
                .unwrap_err()
                .code,
            "invalid_backup"
        );
        let mut tampered = descriptor_backup();
        tampered.wallet.threshold = 3;
        assert_eq!(
            validate_multisig_backup(&serde_json::to_string(&tampered).unwrap())
                .unwrap_err()
                .code,
            "backup_mismatch"
        );
        assert_eq!(
            validate_multisig_backup("not json").unwrap_err().code,
            "invalid_backup"
        );
    }

    #[test]
    fn private_json_is_atomic_owner_only_and_bounded() {
        let dir = std::env::temp_dir().join(format!("satchel-secret-test-{}", Uuid::new_v4()));
        let path = dir.join("secret.json");
        let secret = EncryptedSecret {
            version: 1,
            salt: "salt".into(),
            nonce: "nonce".into(),
            ciphertext: "ciphertext".into(),
        };
        write_private_json(&path, &secret).unwrap();
        let decoded: EncryptedSecret =
            serde_json::from_str(&read_private_text(&path).unwrap()).unwrap();
        assert_eq!(decoded.version, 1);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        fs::write(&path, vec![b'x'; MAX_PRIVATE_JSON_BYTES as usize + 1]).unwrap();
        assert_eq!(read_private_text(&path).unwrap_err().code, "internal_error");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn wallet_database_is_owner_only_and_uses_defensive_settings() {
        let dir = std::env::temp_dir().join(format!("satchel-db-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("wallet.sqlite");
        let db = open_wallet_database(&path).unwrap();
        assert!(db.db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE).unwrap());
        assert!(db.db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_FKEY).unwrap());
        let trusted: bool = db
            .query_row("PRAGMA trusted_schema", [], |row| row.get(0))
            .unwrap();
        assert!(!trusted);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        drop(db);
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn wallet_database_rejects_symlink_storage() {
        use std::os::unix::fs::symlink;

        let dir = std::env::temp_dir().join(format!("satchel-db-link-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("target.sqlite");
        Connection::open(&target).unwrap();
        let link = dir.join("wallet.sqlite");
        symlink(&target, &link).unwrap();
        assert_eq!(
            open_wallet_database(&link).unwrap_err().code,
            "internal_error"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn frozen_coin_schema_persists_and_corrupt_rows_fail_closed() {
        let db = Connection::open_in_memory().unwrap();
        init_app_schema(&db).unwrap();
        let outpoint = format!("{}:0", "01".repeat(32));
        db.execute(
            "INSERT INTO satchel_frozen_coins (outpoint, frozen_at) VALUES (?1, ?2)",
            params![outpoint, 1_u64],
        )
        .unwrap();
        let stored: String = db
            .query_row("SELECT outpoint FROM satchel_frozen_coins", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(OutPoint::from_str(&stored).is_ok());
        db.execute("UPDATE satchel_frozen_coins SET outpoint = 'corrupt'", [])
            .unwrap();
        assert_eq!(frozen_outpoints(&db).unwrap_err().code, "internal_error");
    }

    #[test]
    fn restart_restores_proposals_frozen_coins_and_acknowledged_notifications() {
        use bdk_wallet::bitcoin::{absolute::LockTime, transaction::Version, Transaction};

        let directory = std::env::temp_dir().join(format!("satchel-restart-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("wallet.sqlite");
        let proposal_id = Uuid::new_v4().to_string();
        let outpoint = format!("{}:0", "11".repeat(32));
        {
            let db = Connection::open(&path).unwrap();
            init_app_schema(&db).unwrap();
            db.execute(
                "INSERT INTO satchel_frozen_coins (outpoint, frozen_at) VALUES (?1, 1)",
                params![outpoint],
            )
            .unwrap();
            let psbt = Psbt::from_unsigned_tx(Transaction {
                version: Version::TWO,
                lock_time: LockTime::ZERO,
                input: vec![],
                output: vec![],
            })
            .unwrap();
            persist_single_proposal(
                &db,
                &PaymentProposalDto {
                    proposal_id: proposal_id.clone(),
                    recipient: "bcrt1qrestartfixture".into(),
                    amount: 10,
                    fee: 1,
                    fee_rate: 1.0,
                    total: 11,
                    selected_outpoints: vec![outpoint.clone()],
                },
                &psbt,
            )
            .unwrap();
            notifications::enqueue(
                &db,
                &WalletNotification::TransactionBroadcast {
                    txid: "22".repeat(32),
                    balance: 99,
                },
                1,
            )
            .unwrap();
        }

        let mut restarted_db = Connection::open(&path).unwrap();
        init_app_schema(&restarted_db).unwrap();
        assert_eq!(
            frozen_outpoints(&restarted_db).unwrap()[0].to_string(),
            outpoint
        );
        assert_eq!(
            load_single_proposal(&restarted_db, &proposal_id)
                .unwrap()
                .psbt
                .unsigned_tx
                .version,
            Version::TWO
        );
        let pending = notifications::pending(&restarted_db).unwrap();
        assert_eq!(pending.len(), 1);
        notifications::acknowledge(
            &mut restarted_db,
            &pending.iter().map(|event| event.id).collect::<Vec<_>>(),
        )
        .unwrap();
        assert!(notifications::pending(&restarted_db).unwrap().is_empty());

        restarted_db
            .execute(
                "UPDATE satchel_proposals SET psbt = 'corrupt' WHERE proposal_id = ?1",
                params![proposal_id],
            )
            .unwrap();
        assert_eq!(
            load_single_proposal(&restarted_db, &proposal_id)
                .unwrap_err()
                .code,
            "malformed_psbt"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn legacy_directory_migration_commits_or_rolls_back_as_a_unit() {
        let directory = std::env::temp_dir().join(format!("satchel-migration-{}", Uuid::new_v4()));
        let first = directory.join("regtest-wallet");
        let second = directory.join("regtest-multisig");
        let first_destination = directory.join("wallets/one");
        let second_destination = directory.join("wallets/two");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::create_dir_all(directory.join("wallets")).unwrap();
        let moves = vec![
            (first.clone(), first_destination.clone()),
            (second.clone(), second_destination.clone()),
        ];
        let error = migrate_directories_with_rollback(&moves, || {
            Err(api_error(
                "internal_error",
                "simulated registry interruption",
            ))
        })
        .unwrap_err();
        assert_eq!(error.code, "internal_error");
        assert!(first.exists() && second.exists());
        assert!(!first_destination.exists() && !second_destination.exists());

        migrate_directories_with_rollback(&moves, || Ok(())).unwrap();
        assert!(!first.exists() && !second.exists());
        assert!(first_destination.exists() && second_destination.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn wallet_directory_deletion_is_idempotent_and_rejects_non_directories() {
        let root = std::env::temp_dir().join(format!("satchel-delete-test-{}", Uuid::new_v4()));
        let wallet = root.join("wallet");
        fs::create_dir_all(&wallet).unwrap();
        fs::write(wallet.join("secret.json"), b"encrypted").unwrap();
        delete_wallet_directory(&wallet).unwrap();
        assert!(!wallet.exists());
        delete_wallet_directory(&wallet).unwrap();
        let file = root.join("not-a-wallet");
        fs::write(&file, b"keep").unwrap();
        assert_eq!(
            delete_wallet_directory(&file).unwrap_err().code,
            "internal_error"
        );
        assert!(file.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
