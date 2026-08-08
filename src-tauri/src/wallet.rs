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
        Address, Amount, FeeRate, Network, NetworkKind, OutPoint, Psbt, Transaction, Txid, Weight,
    },
    chain::{BlockId, ChainPosition, CheckPoint, ConfirmationBlockTime},
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
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::auth::AuthThrottle;
use crate::bsms::{BsmsError, DescriptorRecord};
use crate::external_signer::{
    self, ExternalSignerError, ExternalSignerInput, ExternalSignerWallet, SignerSource,
    SINGLESIG_ACCOUNT_PATH,
};
use crate::hardware::{HardwareError, HardwareTransport, HwiChain, HwiCli};
use crate::multisig::{
    CosignerInput, CosignerSource, MultisigPreviewDto, MultisigWalletDto, PolicyError, PolicyInput,
};
use crate::native_backup;
use crate::network::{ChainBackend, CoreNodeConfig, NetworkConfigError, RpcAuthMode};
use crate::notifications::{self, WalletNotification};
use crate::proposal::{decode_psbt, encode_psbt, merge_signed_psbt, signature_progress};
use crate::recovery::{analyze_template, PolicyAnalysis, RecoveryError, RecoveryTemplate};
use crate::registry::{self, RegistryError, WalletKind, WalletProfile, WalletRegistry};
use crate::secure_store::{self, SecureStoreError};
use crate::ur_transport::{self, UrTransportError};

const NETWORK: Network = Network::Regtest;
const RPC_URL: &str = "http://127.0.0.1:18443";
const MAX_PRIVATE_JSON_BYTES: u64 = 256 * 1024;
const MAX_CREDENTIAL_BYTES: usize = 1_024;
const MAX_MNEMONIC_INPUT_BYTES: usize = 4_096;
const ONBOARDING_SESSION_SECONDS: u64 = 15 * 60;
const HARDWARE_PIN_CHALLENGE_TIMEOUT: Duration = Duration::from_secs(2 * 60);
const MAX_HARDWARE_PIN_POSITIONS: usize = 50;
const MAX_PUBLIC_BACKUP_BYTES: usize = 256 * 1024;

fn validate_public_backup_filename(value: &str) -> ApiResult<&str> {
    let trimmed = value.trim();
    let valid_extension = trimmed.ends_with(".bsms") || trimmed.ends_with(".json");
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.contains(['/', '\\', '\0'])
        || !valid_extension
    {
        return Err(api_error(
            "invalid_backup",
            "Choose a valid .bsms or .json backup name.",
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

#[tauri::command]
pub async fn public_backup_save(
    app: AppHandle,
    suggested_filename: String,
    content: String,
) -> ApiResult<bool> {
    let filename = validate_public_backup_filename(&suggested_filename)?.to_owned();
    if content.is_empty() || content.len() > MAX_PUBLIC_BACKUP_BYTES {
        return Err(api_error(
            "invalid_backup",
            "The public backup has an invalid size.",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let extension = if filename.ends_with(".bsms") {
            "bsms"
        } else {
            "json"
        };
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Satchel public backup", &[extension])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected.into_path().map_err(internal)?;
        let mut options = OpenOptions::new();
        options.create(true).truncate(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(internal)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(internal)?;
        }
        file.write_all(content.as_bytes()).map_err(internal)?;
        file.sync_all().map_err(internal)?;
        Ok(true)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn psbt_file_save(
    app: AppHandle,
    suggested_filename: String,
    psbt: String,
) -> ApiResult<bool> {
    let filename = validate_psbt_filename(&suggested_filename)?.to_owned();
    let content = psbt.trim().to_owned();
    decode_psbt(&content).map_err(proposal_api_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Partially signed Bitcoin transaction", &["psbt"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected.into_path().map_err(internal)?;
        let mut options = OpenOptions::new();
        options.create(true).truncate(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(internal)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(internal)?;
        }
        file.write_all(content.as_bytes()).map_err(internal)?;
        file.sync_all().map_err(internal)?;
        Ok(true)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn public_backup_print(window: WebviewWindow) -> ApiResult<()> {
    window.print().map_err(internal)
}

fn hwi_cli(app: &AppHandle) -> ApiResult<HwiCli> {
    let home = app.path().home_dir().map_err(internal)?;
    HwiCli::for_chain(match NETWORK {
        Network::Bitcoin => HwiChain::Main,
        Network::Testnet | Network::Testnet4 => HwiChain::Test,
        Network::Signet => HwiChain::Signet,
        Network::Regtest => HwiChain::Regtest,
    })
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
        for wallet_id in expired_wallets {
            node_auth.remove(&wallet_id);
        }
        if !authorized {
            node_auth.remove(&selected);
        }
    }
    if authorized {
        return Ok(selected);
    }
    Err(api_error(
        "wallet_locked",
        "Enter your passphrase / PIN to unlock Satchel.",
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
    node_auth: Mutex<HashMap<Uuid, NodeAuthSession>>,
}

struct NodeAuthSession {
    username: String,
    password: Zeroizing<String>,
}

#[derive(Default)]
struct WalletSessions {
    last_activity: HashMap<Uuid, Instant>,
}

impl WalletSessions {
    fn unlock(&mut self, wallet_id: Uuid) {
        self.last_activity.insert(wallet_id, Instant::now());
    }

    fn authorize_at(
        &mut self,
        wallet_id: Uuid,
        record_activity: bool,
        now: Instant,
        idle_timeout: Duration,
    ) -> bool {
        let Some(last_activity) = self.last_activity.get_mut(&wallet_id) else {
            return false;
        };
        if now.duration_since(*last_activity) > idle_timeout {
            self.last_activity.remove(&wallet_id);
            return false;
        }
        if record_activity {
            *last_activity = now;
        }
        true
    }

    fn prune_expired_at(&mut self, now: Instant, idle_timeout: Duration) -> Vec<Uuid> {
        let mut expired = Vec::new();
        self.last_activity.retain(|wallet_id, last_activity| {
            let keep = now.duration_since(*last_activity) <= idle_timeout;
            if !keep {
                expired.push(*wallet_id);
            }
            keep
        });
        expired
    }

    fn lock(&mut self, wallet_id: Uuid) {
        self.last_activity.remove(&wallet_id);
    }
}

#[derive(Debug)]
struct PendingProposal {
    psbt: Psbt,
}

struct PendingMnemonic {
    words: Zeroizing<String>,
    created_at: u64,
}

struct PendingHardwarePin {
    device_type: String,
    device_path: String,
    created_at: Instant,
}

fn onboarding_session_is_fresh(created_at: u64, current_time: u64) -> bool {
    current_time.saturating_sub(created_at) <= ONBOARDING_SESSION_SECONDS
}

fn generate_software_mnemonic() -> ApiResult<Mnemonic> {
    // BIP39 maps 256 bits of entropy to exactly 24 words. Keep the entropy in a
    // fixed-size buffer so it can be erased immediately after construction.
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    let mnemonic = Mnemonic::from_entropy(&entropy).map_err(internal);
    entropy.zeroize();
    mnemonic
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
    label: String,
    created: String,
    status: String,
    derivation_path: String,
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
pub struct NodeStatusDto {
    connected: bool,
    blocks: u64,
    backend: CoreNodeConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScanSettingsDto {
    birthday_height: u32,
    gap_limit: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentProposalDto {
    proposal_id: String,
    recipient: String,
    label: String,
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

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AccelerationMethod {
    Rbf,
    Cpfp,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigProposalDto {
    proposal_id: String,
    recipient: String,
    label: String,
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
    #[serde(default)]
    code: Option<i64>,
    #[serde(default)]
    needs_pin_sent: bool,
    #[serde(default)]
    needs_passphrase_sent: bool,
    #[serde(default)]
    warnings: Vec<Vec<String>>,
}

#[derive(Deserialize)]
struct HwiSuccess {
    success: Option<bool>,
    code: Option<i64>,
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
        Some(-3 | -12) => "The device is locked or another wallet app owns its USB session. Quit Trezor Suite, BitBoxApp, Ledger Live, and other wallet apps completely; reconnect the device, then try again. A locked Trezor Model One can be unlocked from its Satchel device card.",
        Some(-14) => "The action was cancelled on the hardware wallet.",
        Some(-15) => "The hardware wallet is busy. Finish the current action and try again.",
        Some(-8 | -9) => "This hardware wallet does not support the requested operation.",
        Some(-1 | -2 | -4 | -7) => "Satchel could not select the enumerated hardware wallet.",
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
            "BitBox02 did not export the account key. Open and unlock the wallet in BitBoxApp first, then quit BitBoxApp completely and try again in Satchel.",
        ),
        "trezor" | "keepkey" => api_error(
            "hardware_unavailable",
            "Trezor did not export the account key. Complete the PIN or wallet selection shown by Satchel and the device, then try again.",
        ),
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
    let (status, message, action) = if pin_required {
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
    } else if device.fingerprint.is_some() {
        ("ready", "Ready to import the public account key.", "import")
    } else if device_type == "bitbox02" {
        (
            "needs_companion",
            "Finish pairing and unlock in BitBoxApp, quit BitBoxApp completely, reconnect, then scan again.",
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
            "Choose whether this cosigner uses the standard wallet with no passphrase. Satchel will not select it silently.",
        ));
    }
    Ok(())
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
        RegistryError::InvalidInactivityTimeout => api_error(
            "invalid_inactivity_timeout",
            "Automatic lock must be between 1 and 60 minutes.",
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

fn node_config_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    Ok(profile_directory(app, profile.id)?.join("node.json"))
}

fn node_secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    Ok(profile_directory(app, profile.id)?.join("node-secret.json"))
}

fn default_node_config() -> CoreNodeConfig {
    CoreNodeConfig {
        backend: ChainBackend::LocalCore {
            url: RPC_URL.to_owned(),
        },
        auth: RpcAuthMode::Cookie,
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
            "Tor requires an HTTP .onion RPC URL and a loopback SOCKS5 proxy such as 127.0.0.1:9050."
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

fn verify_selected_credential(app: &AppHandle, credential: &str) -> ApiResult<()> {
    match selected_profile(app)?.kind {
        WalletKind::SingleKey => decrypt_mnemonic(app, credential).map(|_| ()),
        WalletKind::Multisig => verify_multisig_credential(app, credential),
        WalletKind::WatchOnly => verify_external_signer_credential(app, credential),
    }
}

fn build_rpc_client(url: &str, auth: Auth, tor_proxy: Option<&str>) -> ApiResult<Client> {
    let (username, password) = auth
        .get_user_pass()
        .map_err(|error| api_error("network_unavailable", error))?;
    if let Some(proxy) = tor_proxy {
        let client = jsonrpc::Client::http_proxy(url, username, password, proxy, None)
            .map_err(|error| api_error("network_unavailable", error))?;
        Ok(Client::from_jsonrpc(client))
    } else {
        let mut builder = jsonrpc::minreq_http::MinreqHttpTransport::builder()
            .url(url)
            .map_err(|error| api_error("network_unavailable", error))?;
        if let Some(username) = username {
            builder = builder.basic_auth(username, password);
        }
        Ok(Client::from_jsonrpc(jsonrpc::Client::with_transport(
            builder.build(),
        )))
    }
}

fn load_node_auth_session(
    app: &AppHandle,
    state: &State<'_, AppState>,
    credential: &str,
) -> ApiResult<()> {
    let config = read_node_config(app)?;
    let profile = selected_profile(app)?;
    let session = if config.auth == RpcAuthMode::UserPass {
        let path = node_secret_path(app)?;
        let plaintext = secure_store::load(&path, credential).map_err(secure_store_error)?;
        let password = Zeroizing::new(String::from_utf8(plaintext).map_err(internal)?);
        if password.is_empty() || password.len() > 1024 {
            return Err(api_error(
                "wallet_corrupt",
                "Protected RPC credentials are invalid.",
            ));
        }
        Some(NodeAuthSession {
            username: config.username.unwrap_or_default(),
            password,
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

fn rpc_client(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<Client> {
    let config = read_node_config(app)?;
    let url = config
        .validate()
        .map_err(network_config_api_error)?
        .to_string();
    let auth = match config.auth {
        RpcAuthMode::Cookie => {
            let cookie = regtest_dir().join("regtest").join(".cookie");
            if !cookie.exists() {
                return Err(api_error(
                    "network_unavailable",
                    "Regtest is not running. Start it with `pnpm regtest:start`.",
                ));
            }
            Auth::CookieFile(cookie)
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
            Auth::UserPass(session.username.clone(), session.password.to_string())
        }
    };
    build_rpc_client(&url, auth, config.tor_proxy.as_deref())
}

fn candidate_rpc_client(config: &CoreNodeConfig, password: &str) -> ApiResult<Client> {
    let url = config
        .validate()
        .map_err(network_config_api_error)?
        .to_string();
    let auth = match config.auth {
        RpcAuthMode::Cookie => {
            let cookie = regtest_dir().join("regtest").join(".cookie");
            if !cookie.exists() {
                return Err(api_error(
                    "network_unavailable",
                    "Regtest is not running. Start it with `pnpm regtest:start`.",
                ));
            }
            Auth::CookieFile(cookie)
        }
        RpcAuthMode::UserPass => Auth::UserPass(
            config.username.clone().unwrap_or_default(),
            password.to_owned(),
        ),
    };
    build_rpc_client(&url, auth, config.tor_proxy.as_deref())
}

fn checked_block_height(client: &Client) -> ApiResult<u64> {
    let info = client
        .get_blockchain_info()
        .map_err(|error| api_error("network_unavailable", error))?;
    if info.chain != NETWORK {
        return Err(api_error(
            "wrong_network",
            "The Bitcoin Core node is not running regtest.",
        ));
    }
    Ok(info.blocks)
}

fn broadcast_transaction(
    app: &AppHandle,
    state: &State<'_, AppState>,
    transaction: &Transaction,
) -> ApiResult<Txid> {
    let expected = transaction.compute_txid();
    let rpc = rpc_client(app, state)?;
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
            label TEXT NOT NULL DEFAULT 'Sent payment',
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
        );
        CREATE TABLE IF NOT EXISTS satchel_recovery_settings (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            birthday_height INTEGER NOT NULL CHECK(birthday_height >= 0),
            gap_limit INTEGER NOT NULL CHECK(gap_limit BETWEEN 20 AND 1000)
        );",
    )
    .map_err(internal)?;
    let has_proposal_label = db
        .prepare("PRAGMA table_info(satchel_proposals)")
        .map_err(internal)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?
        .iter()
        .any(|column| column == "label");
    if !has_proposal_label {
        db.execute(
            "ALTER TABLE satchel_proposals ADD COLUMN label TEXT NOT NULL DEFAULT 'Sent payment'",
            [],
        )
        .map_err(internal)?;
    }
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
        "SELECT birthday_height, gap_limit FROM satchel_recovery_settings WHERE singleton = 1",
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
            gap_limit: 20,
        })
    })
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
        let plaintext = load_legacy_regtest_secret(app, &path, credential, "regtest-wallet")?;
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

fn ur_api_error(error: UrTransportError) -> ApiError {
    let message = match error {
        UrTransportError::Empty => "Scan at least one crypto-psbt UR frame.",
        UrTransportError::TooLarge | UrTransportError::TooManyFrames => {
            "The animated QR payload exceeds Satchel's safety limit."
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
            "Private keys, seeds, and recovery words must never be imported into Satchel."
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
    let expected = format!("satchel-external-signer:{}", metadata.external_descriptor);
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
        load_legacy_regtest_secret(app, &path, credential, "regtest-multisig")?
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

fn proposal_dto(
    row: (String, String, String, u64, u64, f64, String, String, u64),
    wallet: &MultisigWalletDto,
) -> ApiResult<MultisigProposalDto> {
    let (proposal_id, recipient, label, amount, fee, fee_rate, encoded, status, created_at) = row;
    let psbt = decode_psbt(&encoded).map_err(proposal_api_error)?;
    let fingerprints = multisig_fingerprints(wallet)?;
    let progress =
        signature_progress(&psbt, &fingerprints, wallet.threshold).map_err(proposal_api_error)?;
    Ok(MultisigProposalDto {
        proposal_id,
        recipient,
        label,
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
        "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at FROM satchel_proposals WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?)),
    ).map_err(|_| api_error("proposal_not_found", "Payment proposal was not found or is no longer active."))?;
    proposal_dto(row, wallet)
}

fn persist_single_proposal(
    db: &Connection,
    proposal: &PaymentProposalDto,
    psbt: &Psbt,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO satchel_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'collecting',?8)",
        params![
            proposal.proposal_id,
            proposal.recipient,
            proposal.label,
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
            if cfg!(any(target_os = "macos", target_os = "ios")) {
                "macOS Keychain access is unavailable. Enter your PIN again and approve the Satchel system prompt. The wallet stayed locked."
            } else {
                "Protected device storage is unavailable. Enter your PIN again after restoring operating-system storage access. The wallet stayed locked."
            },
        ),
        SecureStoreError::DeviceKeyNotFound => api_error(
            "wallet_corrupt",
            "The device protection key is missing. Restore this wallet from its backup.",
        ),
    }
}

fn load_legacy_regtest_secret(
    app: &AppHandle,
    path: &Path,
    credential: &str,
    legacy_directory: &str,
) -> ApiResult<Vec<u8>> {
    let legacy_path = app_data_dir(app)?
        .join(legacy_directory)
        .join("secret.json");
    secure_store::load_with_legacy_device_key(path, &legacy_path, credential)
        .map_err(secure_store_error)
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
    app: &AppHandle,
    state: &State<'_, AppState>,
    wallet: &mut PersistedWallet<Connection>,
    db: &mut Connection,
) -> ApiResult<()> {
    let rpc = Arc::new(rpc_client(app, state)?);
    checked_block_height(rpc.as_ref())?;
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

fn full_rescan_loaded_wallet(
    app: &AppHandle,
    state: &State<'_, AppState>,
    wallet: &mut PersistedWallet<Connection>,
    db: &mut Connection,
    birthday_height: u32,
) -> ApiResult<()> {
    let rpc = Arc::new(rpc_client(app, state)?);
    let tip = checked_block_height(rpc.as_ref())?;
    if u64::from(birthday_height) > tip {
        return Err(api_error(
            "invalid_scan_settings",
            "Wallet birthday cannot be above the node's current block height.",
        ));
    }
    let genesis = rpc.get_block_hash(0).map_err(internal)?;
    let checkpoint = CheckPoint::new(BlockId {
        height: 0,
        hash: genesis,
    });
    let expected_mempool = wallet
        .transactions()
        .filter(|tx| tx.chain_position.is_unconfirmed());
    let mut emitter = Emitter::new(rpc, checkpoint, birthday_height, expected_mempool);
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
) -> (Option<String>, String) {
    let txid = tx.compute_txid().to_string();
    let outgoing_label = (!received)
        .then(|| {
            db.query_row(
                "SELECT label FROM satchel_proposals WHERE txid = ?1 AND status = 'broadcast'",
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
        let (address, label) = if kind == "self_spend" {
            (None, "Self-spend".to_owned())
        } else {
            tx_counterparty(wallet, db, transaction, is_received)
        };
        transactions.push(TransactionDto {
            id: tx.tx_node.txid.to_string(),
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
pub fn wallet_inactivity_timeout_save(
    app: AppHandle,
    state: State<'_, AppState>,
    minutes: u16,
) -> ApiResult<WalletRegistry> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut registry = load_registry(&app)?;
    registry.inactivity_timeout_minutes = minutes;
    registry.validate().map_err(registry_api_error)?;
    save_registry(&app, &registry)?;

    let timeout = Duration::from_secs(u64::from(minutes) * 60);
    let expired_wallets = state
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .prune_expired_at(Instant::now(), timeout);
    if !expired_wallets.is_empty() {
        let mut node_auth = state.node_auth.lock().map_err(internal)?;
        for wallet_id in expired_wallets {
            node_auth.remove(&wallet_id);
        }
    }
    Ok(registry)
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
    registry
        .wallets
        .into_iter()
        .find(|wallet| wallet.id == id)
        .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))
}

#[tauri::command]
pub fn wallet_generate_mnemonic(app: AppHandle, state: State<'_, AppState>) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let mnemonic = generate_software_mnemonic()?;
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
        WalletKind::WatchOnly => verify_external_signer_credential(&app, credential.as_str()),
    };
    record_auth_result(&app, &state, &result)?;
    result?;
    load_node_auth_session(&app, &state, credential.as_str())?;
    unlock_selected(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn wallet_lock(app: AppHandle, state: State<'_, AppState>) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    state.proposals.lock().map_err(internal)?.clear();
    let selected = selected_profile(&app)?.id;
    lock_wallet(&state, selected)
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
    require_unlocked_for_background_sync(&app, &state)?;
    let mut db = open_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    sync_loaded_wallet(&app, &state, &mut wallet, &mut db)?;
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
    require_unlocked_for_background_sync(&app, &state)?;
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
    require_unlocked_for_background_sync(&app, &state)?;
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
    let mut db = open_db(&app)?;
    set_coin_frozen(&mut db, &outpoint, frozen)
}

fn set_coin_frozen(db: &mut Connection, outpoint: &str, frozen: bool) -> ApiResult<()> {
    let parsed = OutPoint::from_str(outpoint.trim())
        .map_err(|_| api_error("internal_error", "The selected coin outpoint is invalid."))?;
    let wallet = load_wallet(db)?;
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
pub fn multisig_coin_set_frozen(
    app: AppHandle,
    state: State<'_, AppState>,
    outpoint: String,
    frozen: bool,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    set_coin_frozen(&mut db, &outpoint, frozen)
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

#[tauri::command]
pub fn node_config(app: AppHandle, state: State<'_, AppState>) -> ApiResult<CoreNodeConfig> {
    require_unlocked(&app, &state)?;
    read_node_config(&app)
}

#[tauri::command]
pub fn recovery_scan_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<RecoveryScanSettingsDto> {
    require_unlocked(&app, &state)?;
    let profile = selected_profile(&app)?;
    let db = match profile.kind {
        WalletKind::Multisig => open_multisig_db(&app)?,
        WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
    };
    load_recovery_scan_settings(&db)
}

#[tauri::command]
pub fn recovery_scan_settings_save(
    app: AppHandle,
    state: State<'_, AppState>,
    birthday_height: u32,
    gap_limit: u32,
    credential: String,
) -> ApiResult<RecoveryScanSettingsDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    if !(20..=1_000).contains(&gap_limit) {
        return Err(api_error(
            "invalid_scan_settings",
            "Gap limit must be between 20 and 1,000 addresses.",
        ));
    }
    let tip = checked_block_height(&rpc_client(&app, &state)?)?;
    if u64::from(birthday_height) > tip {
        return Err(api_error(
            "invalid_scan_settings",
            "Wallet birthday cannot be above the node's current block height.",
        ));
    }
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let verified = verify_selected_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let profile = selected_profile(&app)?;
    let db = match profile.kind {
        WalletKind::Multisig => open_multisig_db(&app)?,
        WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
    };
    db.execute(
        "INSERT INTO satchel_recovery_settings (singleton, birthday_height, gap_limit) VALUES (1, ?1, ?2)
         ON CONFLICT(singleton) DO UPDATE SET birthday_height = excluded.birthday_height, gap_limit = excluded.gap_limit",
        params![birthday_height, gap_limit],
    )
    .map_err(internal)?;
    Ok(RecoveryScanSettingsDto {
        birthday_height,
        gap_limit,
    })
}

#[tauri::command]
pub fn wallet_full_rescan(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let verified = verify_selected_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let profile = selected_profile(&app)?;
    let (mut db, is_multisig) = match profile.kind {
        WalletKind::Multisig => (open_multisig_db(&app)?, true),
        WalletKind::SingleKey | WalletKind::WatchOnly => (open_db(&app)?, false),
    };
    let settings = load_recovery_scan_settings(&db)?;
    let mut wallet = load_wallet(&mut db)?;
    full_rescan_loaded_wallet(&app, &state, &mut wallet, &mut db, settings.birthday_height)?;
    let snapshot = snapshot_from(&wallet, &db, Some(now().to_string()), is_multisig)?;
    enqueue_snapshot_notifications(&db, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn node_config_save(
    app: AppHandle,
    state: State<'_, AppState>,
    config: CoreNodeConfig,
    password: String,
    credential: String,
) -> ApiResult<NodeStatusDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    config.validate().map_err(network_config_api_error)?;
    let credential = Zeroizing::new(credential);
    let password = Zeroizing::new(password);
    check_auth_throttle(&app, &state)?;
    let verified = verify_selected_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    match config.auth {
        RpcAuthMode::Cookie if !password.is_empty() => {
            return Err(api_error(
                "invalid_node_config",
                "Cookie authentication does not use an RPC password.",
            ));
        }
        RpcAuthMode::UserPass if password.is_empty() || password.len() > 1024 => {
            return Err(api_error(
                "invalid_node_config",
                "Enter an RPC password of at most 1,024 bytes.",
            ));
        }
        _ => {}
    }
    let blocks = checked_block_height(&candidate_rpc_client(&config, password.as_str())?)?;
    if config.auth == RpcAuthMode::UserPass {
        secure_store::store(
            &node_secret_path(&app)?,
            password.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
    } else {
        let path = node_secret_path(&app)?;
        if path.exists() {
            fs::remove_file(path).map_err(internal)?;
        }
    }
    write_private_json(&node_config_path(&app)?, &config)?;
    load_node_auth_session(&app, &state, credential.as_str())?;
    Ok(NodeStatusDto {
        connected: true,
        blocks,
        backend: config,
    })
}

fn node_test(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<NodeStatusDto> {
    let config = read_node_config(app)?;
    let blocks = checked_block_height(&rpc_client(app, state)?)?;
    Ok(NodeStatusDto {
        connected: true,
        blocks,
        backend: config,
    })
}

#[tauri::command]
pub fn node_connection_test(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<NodeStatusDto> {
    require_unlocked(&app, &state)?;
    node_test(&app, &state)
}

fn hardware_api_error(error: HardwareError) -> ApiError {
    let message = match error {
        HardwareError::InvalidArgument => "The hardware wallet request was rejected.",
        HardwareError::Unavailable => "Bitcoin Core HWI is not installed or could not be started.",
        HardwareError::TimedOut => "The hardware wallet did not respond in time.",
        HardwareError::OutputTooLarge => "The hardware wallet returned an oversized response.",
        HardwareError::CommandFailed(code) => match code {
            Some(-3 | -12) => "The device is locked or another wallet app owns its USB session. Quit Trezor Suite, BitBoxApp, Ledger Live, and other wallet apps completely; reconnect the device, then scan again. A locked Trezor Model One can be unlocked from its Satchel device card.",
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
            "Coldcard does not recognize this multisig wallet. Save the wallet policy in Satchel, import it from Settings → Multisig Wallets → Import on Coldcard, verify the threshold and fingerprints, then try again.",
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
            "Quit BitBoxApp completely, reconnect and unlock BitBox02, then scan again. A new BitBox02 must first be paired once in BitBoxApp.",
        );
    }
    hardware_api_error(error)
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

fn verify_connected_hardware_identity(
    hwi: &HwiCli,
    device_id: &str,
    expected_fingerprints: &[String],
) -> ApiResult<String> {
    let encoded = hwi.enumerate().map_err(hardware_api_error)?;
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
pub async fn hardware_list(app: AppHandle) -> ApiResult<Vec<HardwareDeviceDto>> {
    let hwi = hwi_cli(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let encoded = hwi.enumerate().map_err(hardware_api_error)?;
        let devices: Vec<HwiDevice> = serde_json::from_slice(&encoded).map_err(internal)?;
        Ok(devices.into_iter().map(hardware_device_dto).collect())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn hardware_prompt_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
) -> ApiResult<String> {
    let hwi = hwi_cli(&app)?;
    let pending = tauri::async_runtime::spawn_blocking(move || {
        let encoded = hwi.enumerate().map_err(hardware_api_error)?;
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
        if !matches!(
            device.device_type.to_ascii_lowercase().as_str(),
            "trezor" | "keepkey"
        ) || (!device.needs_pin_sent && device.code != Some(-12))
        {
            return Err(api_error(
                "invalid_hardware_request",
                "This device does not need Satchel's PIN-matrix flow.",
            ));
        }
        let output = hwi
            .prompt_pin(&device.device_type, &device.path)
            .map_err(hardware_api_error)?;
        let response: HwiSuccess = serde_json::from_slice(&output).map_err(internal)?;
        if response.success != Some(true) {
            return Err(missing_hwi_value(
                response.code,
                "The hardware wallet did not start its PIN matrix.",
            ));
        }
        Ok(PendingHardwarePin {
            device_type: device.device_type,
            device_path: device.path,
            created_at: Instant::now(),
        })
    })
    .await
    .map_err(internal)??;
    let challenge_id = Uuid::new_v4().to_string();
    let mut challenges = state.pending_hardware_pins.lock().map_err(internal)?;
    challenges.clear();
    challenges.insert(challenge_id.clone(), pending);
    Ok(challenge_id)
}

#[tauri::command]
pub async fn hardware_send_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    challenge_id: String,
    mut pin_positions: String,
) -> ApiResult<()> {
    let valid = !pin_positions.is_empty()
        && pin_positions.len() <= MAX_HARDWARE_PIN_POSITIONS
        && pin_positions
            .bytes()
            .all(|position| matches!(position, b'1'..=b'9'));
    if !valid {
        pin_positions.zeroize();
        return Err(api_error(
            "invalid_hardware_request",
            "Enter only PIN-matrix positions 1 through 9.",
        ));
    }
    let pin = Zeroizing::new(pin_positions.into_bytes());
    let pending = state
        .pending_hardware_pins
        .lock()
        .map_err(internal)?
        .remove(&challenge_id)
        .ok_or_else(|| {
            api_error(
                "hardware_challenge_expired",
                "The PIN request expired. Start the PIN matrix again.",
            )
        })?;
    if pending.created_at.elapsed() > HARDWARE_PIN_CHALLENGE_TIMEOUT {
        return Err(api_error(
            "hardware_challenge_expired",
            "The PIN request expired. Start the PIN matrix again.",
        ));
    }
    let hwi = hwi_cli(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = hwi
            .send_pin(&pending.device_type, &pending.device_path, pin.as_slice())
            .map_err(hardware_api_error)?;
        let response: HwiSuccess = serde_json::from_slice(&output).map_err(internal)?;
        if response.success != Some(true) {
            return Err(api_error(
                "hardware_pin_rejected",
                "Trezor did not accept that matrix entry. Check the remaining attempts on the device, then start a new matrix and tap positions—not PIN digits.",
            ));
        }
        Ok(())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn hardware_check_cosigner(
    app: AppHandle,
    cosigner: CosignerInput,
) -> ApiResult<CosignerHealthDto> {
    cosigner.parse_for_validation().map_err(policy_api_error)?;
    let checked_at = now().to_string();
    match cosigner.source {
        CosignerSource::Usb => {
            let hwi = hwi_cli(&app)?;
            tauri::async_runtime::spawn_blocking(move || {
                let encoded = hwi.enumerate().map_err(hardware_api_error)?;
                let devices: Vec<HwiDevice> =
                    serde_json::from_slice(&encoded).map_err(internal)?;
                let matched = devices.into_iter().any(|device| {
                    device.fingerprint.is_some_and(|fingerprint| {
                        fingerprint.eq_ignore_ascii_case(&cosigner.fingerprint)
                    })
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
            .map_err(internal)?
        }
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
    app: AppHandle,
    device_id: String,
    label: String,
    allow_empty_passphrase: Option<bool>,
) -> ApiResult<crate::multisig::CosignerInput> {
    let label = normalize_label(&label)?;
    let hwi = hwi_cli(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let enumerated = hwi.enumerate().map_err(hardware_api_error)?;
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
        require_explicit_standard_wallet_selection(
            &device,
            allow_empty_passphrase.unwrap_or(false),
        )?;
        let fingerprint = device.fingerprint.ok_or_else(|| {
            api_error(
                "hardware_unavailable",
                "The device did not return a master fingerprint.",
            )
        })?;
        let output = hwi
            .account_xpub(
                &device.device_type,
                &fingerprint,
                crate::multisig::MULTISIG_ACCOUNT_PATH,
            )
            .map_err(|error| {
                hardware_xpub_api_error(
                    error,
                    &device.device_type,
                    crate::multisig::MULTISIG_ACCOUNT_PATH,
                )
            })?;
        let response: HwiXpub = serde_json::from_slice(&output).map_err(internal)?;
        let xpub = response
            .xpub
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                missing_hardware_xpub(
                    &device.device_type,
                    crate::multisig::MULTISIG_ACCOUNT_PATH,
                    response.code,
                    response.error.as_deref(),
                    "The device did not return an account xpub.",
                )
            })?;
        let input = crate::multisig::CosignerInput {
            id: Uuid::new_v4().to_string(),
            label,
            fingerprint,
            xpub,
            derivation_path: crate::multisig::MULTISIG_ACCOUNT_PATH.to_owned(),
            source: crate::multisig::CosignerSource::Usb,
            device_type: Some(device.device_type),
        };
        input.parse_for_validation().map_err(policy_api_error)?;
        Ok(input)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn external_signer_parse_import(
    encoded: String,
    label: String,
    source: SignerSource,
) -> ApiResult<ExternalSignerInput> {
    external_signer::parse_import(&encoded, &label, source).map_err(external_signer_api_error)
}

#[tauri::command]
pub async fn hardware_import_external_signer(
    app: AppHandle,
    device_id: String,
    label: String,
    allow_empty_passphrase: Option<bool>,
) -> ApiResult<ExternalSignerInput> {
    let label = normalize_label(&label)?;
    let hwi = hwi_cli(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let enumerated = hwi.enumerate().map_err(hardware_api_error)?;
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
        require_explicit_standard_wallet_selection(
            &device,
            allow_empty_passphrase.unwrap_or(false),
        )?;
        let fingerprint = device.fingerprint.ok_or_else(|| {
            api_error(
                "hardware_unavailable",
                "Unlock the device and select its passphrase-protected wallet before importing.",
            )
        })?;
        let output = hwi
            .account_xpub(&device.device_type, &fingerprint, SINGLESIG_ACCOUNT_PATH)
            .map_err(|error| {
                hardware_xpub_api_error(error, &device.device_type, SINGLESIG_ACCOUNT_PATH)
            })?;
        let response: HwiXpub = serde_json::from_slice(&output).map_err(internal)?;
        let xpub = response
            .xpub
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                missing_hardware_xpub(
                    &device.device_type,
                    SINGLESIG_ACCOUNT_PATH,
                    response.code,
                    response.error.as_deref(),
                    "The device did not return a BIP84 account xpub.",
                )
            })?;
        let input = ExternalSignerInput {
            label,
            fingerprint,
            xpub,
            derivation_path: SINGLESIG_ACCOUNT_PATH.to_owned(),
            source: SignerSource::Usb,
            device_type: Some(device.device_type),
        };
        input.validate().map_err(external_signer_api_error)?;
        Ok(input)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn external_signer_create(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    signer: ExternalSignerInput,
    credential: String,
) -> ApiResult<ExternalSignerWallet> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 48 {
        return Err(api_error(
            "invalid_wallet_name",
            "Wallet names must contain 1 to 48 characters.",
        ));
    }
    validate_credential(credential.as_str())?;
    signer.validate().map_err(external_signer_api_error)?;
    let (external_descriptor, internal_descriptor) =
        external_signer::descriptors(&signer).map_err(external_signer_api_error)?;
    let metadata = ExternalSignerWallet {
        version: 1,
        name: name.to_owned(),
        signer,
        external_descriptor,
        internal_descriptor,
    };
    let (id, dir) = prepare_profile_directory(&app)?;
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        let wallet = Wallet::create(
            metadata.external_descriptor.clone(),
            metadata.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;
        write_private_json(&dir.join("wallet.json"), &metadata)?;
        let marker = format!("satchel-external-signer:{}", metadata.external_descriptor);
        persist_secret_material(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )?;
        commit_profile(
            &app,
            WalletProfile {
                id,
                name: metadata.name.clone(),
                network: "regtest".to_owned(),
                kind: WalletKind::WatchOnly,
                descriptor_checksum: descriptor_checksum(
                    &wallet.public_descriptor(KeychainKind::External).to_string(),
                )?,
                created_at: now(),
            },
        )
    })();
    if result.is_err() {
        secure_store::forget_device_key(&dir.join("secret.json"));
        let _ = fs::remove_dir_all(&dir);
    }
    result?;
    unlock_selected(&app, &state)?;
    Ok(metadata)
}

#[tauri::command]
pub fn external_signer_wallet(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<ExternalSignerWallet> {
    require_unlocked(&app, &state)?;
    read_external_signer_metadata(&app)
}

fn external_proposal_dto(
    row: (String, String, String, u64, u64, f64, String, String, u64),
    fingerprint: &str,
) -> ApiResult<MultisigProposalDto> {
    let (proposal_id, recipient, label, amount, fee, fee_rate, encoded, status, created_at) = row;
    let psbt = decode_psbt(&encoded).map_err(proposal_api_error)?;
    let fingerprint = fingerprint.parse().map_err(internal)?;
    let progress = signature_progress(&psbt, &[fingerprint], 1).map_err(proposal_api_error)?;
    Ok(MultisigProposalDto {
        proposal_id,
        recipient,
        label,
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
        required: 1,
        can_finalize: progress.can_finalize,
        signed_fingerprints: progress.signed_fingerprints,
        status,
        created_at: created_at.to_string(),
    })
}

fn load_external_proposal(
    db: &Connection,
    metadata: &ExternalSignerWallet,
    proposal_id: &str,
) -> ApiResult<MultisigProposalDto> {
    let row = db.query_row(
        "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at FROM satchel_proposals WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?)),
    ).map_err(|_| api_error("proposal_not_found", "Payment proposal was not found or is no longer active."))?;
    external_proposal_dto(row, &metadata.signer.fingerprint)
}

#[tauri::command]
pub fn external_signer_proposals(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<MultisigProposalDto>> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
    let db = open_db(&app)?;
    let mut statement = db.prepare(
        "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at FROM satchel_proposals WHERE status IN ('collecting','ready') ORDER BY created_at DESC",
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
                row.get(8)?,
            ))
        })
        .map_err(internal)?;
    rows.map(|row| external_proposal_dto(row.map_err(internal)?, &metadata.signer.fingerprint))
        .collect()
}

fn import_external_proposal(
    app: &AppHandle,
    proposal_id: &str,
    signed_psbt: &str,
) -> ApiResult<MultisigProposalDto> {
    let metadata = read_external_signer_metadata(app)?;
    let db = open_db(app)?;
    let current = load_external_proposal(&db, &metadata, proposal_id)?;
    let original_encoded = current.psbt.clone();
    let mut original = decode_psbt(&original_encoded).map_err(proposal_api_error)?;
    let imported = decode_psbt(signed_psbt).map_err(proposal_api_error)?;
    let fingerprint = metadata.signer.fingerprint.parse().map_err(internal)?;
    let progress = merge_signed_psbt(&mut original, imported, &[fingerprint], 1)
        .map_err(proposal_api_error)?;
    if progress.can_finalize {
        let mut validation = original.clone();
        let mut wallet_db = open_db(app)?;
        let wallet = load_wallet(&mut wallet_db)?;
        if !wallet
            .finalize_psbt(&mut validation, SignOptions::default())
            .map_err(internal)?
        {
            return Err(api_error(
                "finalization_failed",
                "The hardware signature does not satisfy this wallet descriptor.",
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
            "The proposal changed while its signature was imported.",
        ));
    }
    load_external_proposal(&db, &metadata, proposal_id)
}

#[tauri::command]
pub fn external_signer_proposal_import(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    signed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    import_external_proposal(&app, &proposal_id, &signed_psbt)
}

#[tauri::command]
pub async fn hardware_sign_external(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    device_id: String,
) -> ApiResult<MultisigProposalDto> {
    require_unlocked(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
    let db = open_db(&app)?;
    let proposal = load_external_proposal(&db, &metadata, &proposal_id)?;
    drop(db);
    let encoded = proposal.psbt;
    let expected = vec![metadata.signer.fingerprint];
    let hwi = hwi_cli(&app)?;
    let signed = tauri::async_runtime::spawn_blocking(move || {
        let device_type = verify_connected_hardware_identity(&hwi, &device_id, &expected)?;
        let output = hwi
            .sign_psbt(&device_type, &device_id, &encoded)
            .map_err(|error| hardware_device_api_error(error, &device_type))?;
        let response: HwiPsbt = serde_json::from_slice(&output).map_err(internal)?;
        response.psbt.ok_or_else(|| {
            drop(response.error);
            missing_hwi_value(response.code, "The device did not return a signed PSBT.")
        })
    })
    .await
    .map_err(internal)??;
    import_external_proposal(&app, &proposal_id, &signed)
}

#[tauri::command]
pub fn external_signer_proposal_broadcast(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    credential: String,
) -> ApiResult<BroadcastResultDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    check_auth_throttle(&app, &state)?;
    let verified = verify_external_signer_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let metadata = read_external_signer_metadata(&app)?;
    let mut db = open_db(&app)?;
    let proposal = load_external_proposal(&db, &metadata, &proposal_id)?;
    if !proposal.can_finalize {
        return Err(api_error(
            "insufficient_signatures",
            "Sign the transaction before broadcasting.",
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
            "The signed transaction does not satisfy the wallet descriptor.",
        ));
    }
    let transaction = psbt.extract_tx().map_err(internal)?;
    let txid = broadcast_transaction(&app, &state, &transaction)?;
    let mut wallet = load_wallet(&mut db)?;
    let sync_pending = sync_loaded_wallet(&app, &state, &mut wallet, &mut db).is_err();
    let snapshot = snapshot_from(
        &wallet,
        &db,
        (!sync_pending).then(|| now().to_string()),
        false,
    )?;
    let persisted = db.transaction().map_err(internal)?;
    let changed = persisted.execute(
        "UPDATE satchel_proposals SET status = 'broadcast', txid = ?1 WHERE proposal_id = ?2 AND status = 'ready'",
        params![txid.to_string(), proposal_id],
    ).map_err(internal)?;
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
pub fn external_signer_proposal_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_db(&app)?;
    let changed = db.execute(
        "UPDATE satchel_proposals SET status = 'cancelled' WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
    ).map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_not_found",
            "The proposal is no longer active.",
        ));
    }
    state
        .proposals
        .lock()
        .map_err(internal)?
        .remove(&proposal_id);
    Ok(())
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
    let hwi = hwi_cli(&app)?;
    let displayed = tauri::async_runtime::spawn_blocking(move || {
        let device_type =
            verify_connected_hardware_identity(&hwi, &device_id, &expected_fingerprints)?;
        hwi.display_descriptor_address(&device_type, &device_id, &descriptor)
            .map_err(|error| hardware_device_api_error(error, &device_type))
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
    authorize_multisig_operation(&app, &state, credential.as_str())?;
    let backup = MultisigBackupDto {
        version: 1,
        network: "regtest".to_owned(),
        wallet: read_multisig_metadata(&app)?,
    };
    serde_json::to_string_pretty(&backup).map_err(internal)
}

#[tauri::command]
pub fn multisig_export_bsms(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<String> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    authorize_multisig_operation(&app, &state, credential.as_str())?;
    let wallet = read_multisig_metadata(&app)?;
    let first_address = first_multisig_address(&wallet)?;
    DescriptorRecord::from_descriptor_pair(
        &wallet.external_descriptor,
        &wallet.internal_descriptor,
        &first_address,
    )
    .map(|record| record.encode())
    .map_err(bsms_api_error)
}

#[tauri::command]
pub fn multisig_bsms_inspect(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
) -> ApiResult<RecoveryDrillDto> {
    let record = DescriptorRecord::parse(&encoded_backup).map_err(bsms_api_error)?;
    let (external_descriptor, internal_descriptor) =
        record.descriptor_pair().map_err(bsms_api_error)?;
    let mut derived = Wallet::create(external_descriptor.clone(), internal_descriptor.clone())
        .network(NETWORK)
        .create_wallet_no_persist()
        .map_err(|_| {
            api_error(
                "invalid_backup",
                "The BSMS descriptors are not valid for this Bitcoin network.",
            )
        })?;
    let derived_first = derived
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string();
    if derived_first != record.first_address {
        return Err(api_error(
            "backup_mismatch",
            "The BSMS first address does not match its descriptor.",
        ));
    }
    let current_wallet = read_multisig_metadata(&app).ok();
    let matches_current_wallet = current_wallet
        .as_ref()
        .map(|wallet| {
            record.matches_descriptor_pair(&wallet.external_descriptor, &wallet.internal_descriptor)
        })
        .transpose()
        .map_err(bsms_api_error)?
        .unwrap_or(false);
    if matches_current_wallet {
        let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
        let descriptor = current_wallet
            .as_ref()
            .map(|wallet| wallet.external_descriptor.clone())
            .ok_or_else(|| api_error("wallet_not_found", "No multisig wallet exists."))?;
        state
            .verified_recovery
            .lock()
            .map_err(internal)?
            .insert(wallet_id, descriptor);
    }
    Ok(RecoveryDrillDto {
        first_address: derived_first,
        matches_current_wallet,
    })
}

#[tauri::command]
pub fn multisig_recover_bsms(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    encoded_backup: String,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let record = DescriptorRecord::parse(&encoded_backup).map_err(bsms_api_error)?;
    let (threshold, keys) = record.standard_policy().map_err(bsms_api_error)?;
    let cosigners = keys
        .into_iter()
        .enumerate()
        .map(|(index, key)| CosignerInput {
            id: format!("bsms-{}", key.fingerprint),
            label: format!("Signer {}", index + 1),
            fingerprint: key.fingerprint.to_string(),
            xpub: key.xpub.to_string(),
            derivation_path: key.derivation_path,
            source: CosignerSource::Manual,
            device_type: None,
        })
        .collect::<Vec<_>>();
    let preview = PolicyInput {
        name,
        threshold,
        cosigners,
    }
    .preview()
    .map_err(policy_api_error)?;
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
    if first_multisig_address(&wallet)? != record.first_address {
        return Err(api_error(
            "backup_mismatch",
            "The BSMS first address does not match its descriptor.",
        ));
    }
    let (id, dir) = prepare_profile_directory(&app)?;
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        Wallet::create(
            wallet.external_descriptor.clone(),
            wallet.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;
        let marker = format!("satchel-multisig:{}", wallet.external_descriptor);
        secure_store::store(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        write_private_json(&dir.join("wallet.json"), &wallet)?;
        commit_multisig_profile(&app, id, &wallet)?;
        Ok(wallet)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    } else {
        unlock_selected(&app, &state)?;
        reset_auth_throttle(&app, &state)?;
    }
    result
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
    lock_wallet(&state, wallet_id)?;
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
    require_unlocked_for_background_sync(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    sync_loaded_wallet(&app, &state, &mut wallet, &mut db)?;
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
    label: String,
    amount: u64,
    fee_rate: f64,
    coin_selection: CoinSelectionInput,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let label = normalize_label(&label)?;
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
    wallet.persist(&mut db).map_err(internal)?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the transaction fee."))?
        .to_sat();
    let proposal_id = Uuid::new_v4().to_string();
    let encoded = encode_psbt(&psbt);
    let created_at = now();
    db.execute(
        "INSERT INTO satchel_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'collecting',?8)",
        params![proposal_id, address.to_string(), label, amount, fee, applied_fee_rate, encoded, created_at],
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
        "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at FROM satchel_proposals WHERE status IN ('collecting','ready') ORDER BY created_at DESC",
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
                row.get(8)?,
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
    let hwi = hwi_cli(&app)?;
    let signed = tauri::async_runtime::spawn_blocking(move || {
        let device_type =
            verify_connected_hardware_identity(&hwi, &device_id, &expected_fingerprints)?;
        let output = hwi
            .sign_psbt(&device_type, &device_id, &encoded)
            .map_err(|error| hardware_device_api_error(error, &device_type))?;
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
    let txid = broadcast_transaction(&app, &state, &transaction)?;
    let mut wallet = load_wallet(&mut db)?;
    let sync_pending = sync_loaded_wallet(&app, &state, &mut wallet, &mut db).is_err();
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
    label: String,
    amount: u64,
    fee_rate: f64,
    coin_selection: CoinSelectionInput,
) -> ApiResult<PaymentProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let label = normalize_label(&label)?;
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
    wallet.persist(&mut db).map_err(internal)?;
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
        label,
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

fn validate_acceleration_rate(fee_rate: f64) -> ApiResult<(f64, FeeRate)> {
    if !fee_rate.is_finite() || fee_rate <= 0.0 || fee_rate > 10_000.0 {
        return Err(api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        ));
    }
    let applied = fee_rate.ceil();
    let rate = FeeRate::from_sat_per_vb(applied as u64)
        .ok_or_else(|| api_error("invalid_amount", "Fee rate must be greater than zero."))?;
    Ok((applied, rate))
}

fn acceleration_error(error: impl ToString) -> ApiError {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("confirmed") {
        api_error(
            "transaction_confirmed",
            "Confirmed transactions cannot be accelerated.",
        )
    } else if lower.contains("irreplaceable") || lower.contains("rbf") {
        api_error(
            "transaction_not_replaceable",
            "This transaction did not signal replace-by-fee. Use CPFP when it has a spendable wallet output.",
        )
    } else if lower.contains("fee") || lower.contains("insufficient") {
        api_error("insufficient_funds", message)
    } else {
        api_error(
            "acceleration_unavailable",
            "This transaction cannot be accelerated right now. Update the wallet and try again.",
        )
    }
}

fn resolve_cpfp_parent_fee(
    wallet_fee: Option<Amount>,
    fetch_mempool_fee: impl FnOnce() -> ApiResult<Amount>,
) -> ApiResult<Amount> {
    match wallet_fee {
        Some(fee) => Ok(fee),
        None => fetch_mempool_fee(),
    }
}

fn cpfp_parent_fee(
    app: &AppHandle,
    state: &State<'_, AppState>,
    wallet: &Wallet,
    parent_txid: Txid,
) -> ApiResult<Amount> {
    let parent = wallet.get_tx(parent_txid).ok_or_else(|| {
        api_error(
            "acceleration_unavailable",
            "Transaction was not found in this wallet.",
        )
    })?;
    let wallet_fee = wallet.calculate_fee(parent.tx_node.tx.as_ref()).ok();
    resolve_cpfp_parent_fee(wallet_fee, || {
        let entry = rpc_client(app, state)?
            .get_mempool_entry(&parent_txid)
            .map_err(|_| {
                api_error(
                    "acceleration_unavailable",
                    "Bitcoin Core could not find this unconfirmed transaction. Update the wallet and try again.",
                )
            })?;
        Ok(entry.fees.base)
    })
}

fn summarize_payment_psbt(
    wallet: &Wallet,
    psbt: &Psbt,
    applied_fee_rate: f64,
    allow_self_spend: bool,
) -> ApiResult<PaymentProposalDto> {
    let external = psbt
        .unsigned_tx
        .output
        .iter()
        .filter(|output| !wallet.is_mine(output.script_pubkey.clone()))
        .collect::<Vec<_>>();
    if external.len() > 1 || (external.is_empty() && !allow_self_spend) {
        return Err(api_error(
            "acceleration_unavailable",
            "Satchel can accelerate only transactions with one external recipient.",
        ));
    }
    let output = external
        .first()
        .copied()
        .or_else(|| psbt.unsigned_tx.output.first())
        .ok_or_else(|| {
            api_error(
                "acceleration_unavailable",
                "The accelerated transaction has no output.",
            )
        })?;
    let recipient = Address::from_script(&output.script_pubkey, NETWORK).map_err(|_| {
        api_error(
            "invalid_address",
            "The transaction recipient is not a standard regtest address.",
        )
    })?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the accelerated transaction fee."))?
        .to_sat();
    Ok(PaymentProposalDto {
        proposal_id: Uuid::new_v4().to_string(),
        recipient: recipient.to_string(),
        label: "Fee acceleration".to_owned(),
        amount: if external.is_empty() {
            0
        } else {
            output.value.to_sat()
        },
        fee,
        fee_rate: applied_fee_rate,
        total: if external.is_empty() {
            fee
        } else {
            output.value.to_sat().saturating_add(fee)
        },
        selected_outpoints: psbt
            .unsigned_tx
            .input
            .iter()
            .map(|input| input.previous_output.to_string())
            .collect(),
    })
}

fn build_cpfp(
    wallet: &mut PersistedWallet<Connection>,
    parent_txid: Txid,
    parent_fee: Amount,
    rate: FeeRate,
) -> ApiResult<Psbt> {
    let parent = wallet.get_tx(parent_txid).ok_or_else(|| {
        api_error(
            "acceleration_unavailable",
            "Transaction was not found in this wallet.",
        )
    })?;
    if parent.chain_position.is_confirmed() {
        return Err(api_error(
            "transaction_confirmed",
            "Confirmed transactions cannot be accelerated.",
        ));
    }
    let parent_tx = parent.tx_node.tx.clone();
    let candidate = wallet
        .list_unspent()
        .filter(|output| output.outpoint.txid == parent_txid)
        .max_by_key(|output| output.txout.value)
        .ok_or_else(|| {
            api_error(
                "acceleration_unavailable",
                "CPFP requires an unspent change or receive output controlled by this wallet.",
            )
        })?;
    let outpoint = candidate.outpoint;
    let keychain = candidate.keychain;
    let drain_script = wallet
        .reveal_next_address(KeychainKind::Internal)
        .address
        .script_pubkey();
    let mut estimate_builder = wallet.build_tx();
    estimate_builder
        .add_utxo(outpoint)
        .map_err(acceleration_error)?
        .manually_selected_only()
        .drain_to(drain_script.clone())
        .fee_rate(rate);
    let estimate = estimate_builder.finish().map_err(acceleration_error)?;
    let satisfaction_weight = wallet
        .public_descriptor(keychain)
        .max_weight_to_satisfy()
        .map_err(acceleration_error)?;
    let child_weight = Weight::from_wu(
        estimate
            .unsigned_tx
            .weight()
            .to_wu()
            .saturating_add(satisfaction_weight.to_wu()),
    );
    let package_weight = Weight::from_wu(
        parent_tx
            .weight()
            .to_wu()
            .saturating_add(child_weight.to_wu()),
    );
    let required_package_fee = rate
        .fee_wu(package_weight)
        .ok_or_else(|| {
            api_error(
                "invalid_amount",
                "The package fee exceeds Bitcoin's amount range.",
            )
        })?
        .to_sat();
    let estimate_fee = estimate
        .fee_amount()
        .ok_or_else(|| internal("Unable to estimate the CPFP fee."))?
        .to_sat();
    let required_child_fee = required_package_fee
        .saturating_sub(parent_fee.to_sat())
        .max(estimate_fee);
    let mut builder = wallet.build_tx();
    builder
        .add_utxo(outpoint)
        .map_err(acceleration_error)?
        .manually_selected_only()
        .drain_to(drain_script)
        .fee_absolute(Amount::from_sat(required_child_fee));
    builder.finish().map_err(acceleration_error)
}

fn build_acceleration_psbt(
    wallet: &mut PersistedWallet<Connection>,
    txid: Txid,
    method: AccelerationMethod,
    cpfp_parent_fee: Option<Amount>,
    rate: FeeRate,
) -> ApiResult<Psbt> {
    match method {
        AccelerationMethod::Rbf => {
            let mut builder = wallet.build_fee_bump(txid).map_err(acceleration_error)?;
            builder.fee_rate(rate);
            builder.finish().map_err(acceleration_error)
        }
        AccelerationMethod::Cpfp => build_cpfp(
            wallet,
            txid,
            cpfp_parent_fee.ok_or_else(|| {
                api_error(
                    "acceleration_unavailable",
                    "The parent transaction fee is unavailable.",
                )
            })?,
            rate,
        ),
    }
}

#[tauri::command]
pub fn tx_acceleration_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    txid: String,
    method: AccelerationMethod,
    fee_rate: f64,
) -> ApiResult<PaymentProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let txid = Txid::from_str(&txid)
        .map_err(|_| api_error("acceleration_unavailable", "Enter a valid transaction ID."))?;
    let (applied, rate) = validate_acceleration_rate(fee_rate)?;
    let mut db = open_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    let parent_fee = if matches!(method, AccelerationMethod::Cpfp) {
        Some(cpfp_parent_fee(&app, &state, &wallet, txid)?)
    } else {
        None
    };
    let psbt = build_acceleration_psbt(&mut wallet, txid, method, parent_fee, rate)?;
    let proposal = summarize_payment_psbt(
        &wallet,
        &psbt,
        applied,
        matches!(method, AccelerationMethod::Cpfp),
    )?;
    persist_single_proposal(&db, &proposal, &psbt)?;
    wallet.persist(&mut db).map_err(internal)?;
    state
        .proposals
        .lock()
        .map_err(internal)?
        .insert(proposal.proposal_id.clone(), PendingProposal { psbt });
    Ok(proposal)
}

#[tauri::command]
pub fn multisig_acceleration_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    txid: String,
    method: AccelerationMethod,
    fee_rate: f64,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let txid = Txid::from_str(&txid)
        .map_err(|_| api_error("acceleration_unavailable", "Enter a valid transaction ID."))?;
    let (applied, rate) = validate_acceleration_rate(fee_rate)?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let mut wallet = load_wallet(&mut db)?;
    let parent_fee = if matches!(method, AccelerationMethod::Cpfp) {
        Some(cpfp_parent_fee(&app, &state, &wallet, txid)?)
    } else {
        None
    };
    let psbt = build_acceleration_psbt(&mut wallet, txid, method, parent_fee, rate)?;
    let proposal = summarize_payment_psbt(
        &wallet,
        &psbt,
        applied,
        matches!(method, AccelerationMethod::Cpfp),
    )?;
    let encoded = encode_psbt(&psbt);
    db.execute(
        "INSERT INTO satchel_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'collecting',?8)",
        params![proposal.proposal_id, proposal.recipient, proposal.label, proposal.amount, proposal.fee, proposal.fee_rate, encoded, now()],
    )
    .map_err(internal)?;
    wallet.persist(&mut db).map_err(internal)?;
    load_multisig_proposal(&db, &metadata, &proposal.proposal_id)
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
    let txid = broadcast_transaction(&app, &state, &transaction)?;
    let mut wallet = load_wallet(&mut db)?;
    let sync_pending = sync_loaded_wallet(&app, &state, &mut wallet, &mut db).is_err();
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
    let profile = selected_profile(&app)?;
    let verified = match profile.kind {
        WalletKind::SingleKey => decrypt_mnemonic(&app, credential.as_str()).map(|_| ()),
        WalletKind::WatchOnly => verify_external_signer_credential(&app, credential.as_str()),
        WalletKind::Multisig => Err(api_error(
            "wrong_wallet_kind",
            "Delete multisig wallets from the vault settings.",
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
    fn pending_balance_includes_trusted_and_untrusted_outputs() {
        assert_eq!(aggregate_pending_balance(100_000, 249_000), 349_000);
        assert_eq!(aggregate_pending_balance(u64::MAX, 1), u64::MAX);
    }

    #[test]
    fn transaction_kind_distinguishes_fee_only_self_spends_from_payments() {
        assert_eq!(transaction_kind(false, false), "self_spend");
        assert_eq!(transaction_kind(false, true), "payment");
        assert_eq!(transaction_kind(true, false), "payment");
        assert_eq!(transaction_kind(true, true), "payment");
    }

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
    fn recovery_scan_settings_default_and_persist_with_safe_bounds() {
        let db = Connection::open_in_memory().unwrap();
        init_app_schema(&db).unwrap();
        assert_eq!(
            load_recovery_scan_settings(&db).unwrap(),
            RecoveryScanSettingsDto {
                birthday_height: 0,
                gap_limit: 20,
            }
        );
        db.execute(
            "INSERT INTO satchel_recovery_settings (singleton, birthday_height, gap_limit) VALUES (1, 840000, 250)",
            [],
        )
        .unwrap();
        assert_eq!(
            load_recovery_scan_settings(&db).unwrap(),
            RecoveryScanSettingsDto {
                birthday_height: 840_000,
                gap_limit: 250,
            }
        );
        assert!(db
            .execute(
                "UPDATE satchel_recovery_settings SET gap_limit = 19 WHERE singleton = 1",
                [],
            )
            .is_err());
        assert!(db
            .execute(
                "UPDATE satchel_recovery_settings SET gap_limit = 1001 WHERE singleton = 1",
                [],
            )
            .is_err());
    }

    #[test]
    fn acceleration_rates_and_error_classes_fail_closed() {
        for invalid in [f64::NAN, f64::INFINITY, -1.0, 0.0, 10_000.1] {
            assert_eq!(
                validate_acceleration_rate(invalid).unwrap_err().code,
                "invalid_amount"
            );
        }
        let (applied, rate) = validate_acceleration_rate(1.01).unwrap();
        assert_eq!(applied, 2.0);
        assert_eq!(rate.to_sat_per_vb_floor(), 2);
        assert_eq!(
            acceleration_error("transaction confirmed").code,
            "transaction_confirmed"
        );
        assert_eq!(
            acceleration_error("transaction is irreplaceable").code,
            "transaction_not_replaceable"
        );
        assert_eq!(
            acceleration_error("insufficient fee").code,
            "insufficient_funds"
        );
        assert_eq!(
            acceleration_error("unknown parent").code,
            "acceleration_unavailable"
        );
    }

    #[test]
    fn cpfp_uses_core_mempool_fee_when_an_incoming_parent_has_unknown_inputs() {
        let fetched = resolve_cpfp_parent_fee(None, || Ok(Amount::from_sat(1_234))).unwrap();
        assert_eq!(fetched, Amount::from_sat(1_234));

        let known = resolve_cpfp_parent_fee(Some(Amount::from_sat(432)), || {
            Err(api_error(
                "internal_error",
                "the mempool must not be queried when BDK knows the fee",
            ))
        })
        .unwrap();
        assert_eq!(known, Amount::from_sat(432));

        let unavailable = resolve_cpfp_parent_fee(None, || {
            Err(api_error(
                "acceleration_unavailable",
                "Bitcoin Core no longer has the parent.",
            ))
        })
        .unwrap_err();
        assert_eq!(unavailable.code, "acceleration_unavailable");
    }

    #[test]
    fn cpfp_builds_from_an_incoming_parent_without_foreign_prevouts() {
        use bdk_wallet::bitcoin::{
            absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxIn,
            TxOut, Witness,
        };

        let mnemonic = Mnemonic::parse(WORDS).unwrap();
        let master = root_key(&mnemonic, "test passphrase").unwrap();
        let mut db = Connection::open_in_memory().unwrap();
        let mut wallet = Wallet::create(
            Bip84(master, KeychainKind::External),
            Bip84(master, KeychainKind::Internal),
        )
        .network(Network::Regtest)
        .create_wallet(&mut db)
        .unwrap();
        let receive = wallet.reveal_next_address(KeychainKind::External);
        let parent = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::from_byte_array([7; 32]), 1),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(100_000),
                script_pubkey: receive.address.script_pubkey(),
            }],
        };
        let parent_txid = parent.compute_txid();
        wallet.apply_unconfirmed_txs([(parent.clone(), 1)]);

        assert!(wallet.calculate_fee(&parent).is_err());
        let child = build_cpfp(
            &mut wallet,
            parent_txid,
            Amount::from_sat(1_000),
            FeeRate::from_sat_per_vb(5).unwrap(),
        )
        .unwrap();
        assert_eq!(child.unsigned_tx.input.len(), 1);
        assert_eq!(child.unsigned_tx.input[0].previous_output.txid, parent_txid);
        assert!(child.fee_amount().unwrap() > Amount::ZERO);
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
        let missing_passphrase = validate_wallet_passphrase("").unwrap_err();
        assert_eq!(missing_passphrase.code, "invalid_credential");
        assert_eq!(
            missing_passphrase.message,
            "A wallet passphrase is required."
        );
        assert!(validate_wallet_passphrase(&"x".repeat(MAX_CREDENTIAL_BYTES)).is_ok());
        let long_passphrase =
            validate_wallet_passphrase(&"x".repeat(MAX_CREDENTIAL_BYTES + 1)).unwrap_err();
        assert_eq!(long_passphrase.code, "invalid_credential");
        assert_eq!(
            long_passphrase.message,
            "The wallet passphrase is too long."
        );
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
            HardwareError::CommandFailed(Some(-12)),
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
        assert_eq!(
            secure_store_error(SecureStoreError::DeviceKeyNotFound).code,
            "wallet_corrupt"
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
            (-3, "another wallet app owns its USB session"),
            (-12, "another wallet app owns its USB session"),
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

        let bitbox = hardware_device_api_error(HardwareError::CommandFailed(Some(-12)), "bitbox02");
        assert_eq!(bitbox.code, "hardware_command_failed");
        assert!(bitbox.message.contains("Quit BitBoxApp completely"));
        assert!(bitbox.message.contains("paired once"));

        let cancelled =
            hardware_device_api_error(HardwareError::CommandFailed(Some(-14)), "bitbox02");
        assert!(cancelled.message.contains("cancelled"));

        let ledger = missing_hardware_xpub("ledger", "m/48'/1'/0'/2'", None, None, "fallback");
        assert_eq!(ledger.code, "hardware_unavailable");
        assert!(ledger.message.contains("approve the public-key export"));
        assert!(!ledger.message.contains("fallback"));

        let bitbox_xpub =
            missing_hardware_xpub("bitbox02", "m/48'/1'/0'/2'", Some(-13), None, "fallback");
        assert!(bitbox_xpub
            .message
            .contains("unlock the wallet in BitBoxApp"));

        let cancelled_xpub =
            missing_hardware_xpub("ledger", "m/84'/1'/0'", Some(-14), None, "fallback");
        assert!(cancelled_xpub.message.contains("cancelled"));

        let ledger_singlesig =
            missing_hardware_xpub("ledger", "m/84'/1'/0'", None, None, "sensitive fallback");
        assert!(ledger_singlesig.message.contains("BIP84 account key"));
        assert!(!ledger_singlesig.message.contains("approve"));
        assert!(!ledger_singlesig.message.contains("sensitive"));

        let ledger_device_failure = missing_hardware_xpub(
            "ledger",
            "m/84'/1'/0'",
            Some(-13),
            Some("Technical problem at /private/device/path"),
            "fallback",
        );
        assert!(ledger_device_failure.message.contains("Bitcoin Test"));
        assert!(!ledger_device_failure
            .message
            .contains("/private/device/path"));

        let ledger_command_failure = hardware_xpub_api_error(
            HardwareError::CommandFailed(Some(-13)),
            "ledger",
            "m/84'/1'/0'",
        );
        assert_eq!(ledger_command_failure.code, "hardware_command_failed");
        assert!(ledger_command_failure.message.contains("Bitcoin Test"));
        assert!(ledger_command_failure.message.contains("not Bitcoin"));

        let mainnet_ledger_failure = hardware_xpub_api_error(
            HardwareError::CommandFailed(Some(-13)),
            "ledger",
            "m/84'/0'/0'",
        );
        assert!(!mainnet_ledger_failure.message.contains("Bitcoin Test"));
    }

    #[test]
    fn not_ready_hardware_remains_visible_with_safe_device_specific_actions() {
        let trezor = hardware_device_dto(HwiDevice {
            fingerprint: None,
            device_type: "trezor".to_owned(),
            model: "trezor_1".to_owned(),
            path: "sensitive-usb-path".to_owned(),
            code: Some(-12),
            needs_pin_sent: true,
            needs_passphrase_sent: false,
            warnings: vec![],
        });
        assert_eq!(trezor.status, "needs_pin");
        assert_eq!(trezor.action, "prompt_pin");
        assert!(trezor.fingerprint.is_none());
        assert!(!trezor.message.contains("sensitive-usb-path"));

        let locked_passphrase_trezor = hardware_device_dto(HwiDevice {
            fingerprint: None,
            device_type: "trezor".to_owned(),
            model: "trezor_1".to_owned(),
            path: "sensitive-usb-path".to_owned(),
            code: Some(-12),
            needs_pin_sent: true,
            needs_passphrase_sent: true,
            warnings: vec![vec![
                "Passphrase enabled; this wallet uses an empty string".to_owned()
            ]],
        });
        assert_eq!(locked_passphrase_trezor.status, "needs_pin");
        assert_eq!(locked_passphrase_trezor.action, "prompt_pin");
        assert!(locked_passphrase_trezor.fingerprint.is_none());

        let bitbox = hardware_device_dto(HwiDevice {
            fingerprint: None,
            device_type: "bitbox02".to_owned(),
            model: "bitbox02_multi".to_owned(),
            path: "sensitive-usb-path".to_owned(),
            code: Some(-12),
            needs_pin_sent: false,
            needs_passphrase_sent: false,
            warnings: vec![],
        });
        assert_eq!(bitbox.status, "needs_companion");
        assert_eq!(bitbox.action, "retry");
        assert!(bitbox.message.contains("BitBoxApp"));

        let jade = hardware_device_dto(HwiDevice {
            fingerprint: None,
            device_type: "jade".to_owned(),
            model: "jade".to_owned(),
            path: "serial-path".to_owned(),
            code: Some(-12),
            needs_pin_sent: false,
            needs_passphrase_sent: false,
            warnings: vec![],
        });
        assert_eq!(jade.status, "needs_device_unlock");
        assert!(jade.message.contains("QR PIN Unlock"));

        for (device_type, expected) in [
            ("ledger", "Bitcoin Test"),
            ("coldcard", "USB communication"),
        ] {
            let device = hardware_device_dto(HwiDevice {
                fingerprint: None,
                device_type: device_type.to_owned(),
                model: device_type.to_owned(),
                path: "device-path".to_owned(),
                code: Some(-12),
                needs_pin_sent: false,
                needs_passphrase_sent: false,
                warnings: vec![],
            });
            assert_eq!(device.status, "needs_device_unlock");
            assert_eq!(device.action, "retry");
            assert!(device.message.contains(expected));
        }

        let keepkey = hardware_device_dto(HwiDevice {
            fingerprint: None,
            device_type: "keepkey".to_owned(),
            model: "keepkey".to_owned(),
            path: "device-path".to_owned(),
            code: Some(-12),
            needs_pin_sent: true,
            needs_passphrase_sent: false,
            warnings: vec![],
        });
        assert_eq!(keepkey.status, "needs_pin");
        assert_eq!(keepkey.action, "prompt_pin");

        let ready = hardware_device_dto(HwiDevice {
            fingerprint: Some("f00dbabe".to_owned()),
            device_type: "coldcard".to_owned(),
            model: "coldcard".to_owned(),
            path: "sensitive-usb-path".to_owned(),
            code: None,
            needs_pin_sent: false,
            needs_passphrase_sent: false,
            warnings: vec![],
        });
        assert_eq!(ready.status, "ready");
        assert_eq!(ready.action, "import");
    }

    #[test]
    fn trezor_passphrase_warning_requires_explicit_standard_wallet_selection() {
        let hwi_device = HwiDevice {
            fingerprint: Some("emptywallet".to_owned()),
            device_type: "trezor".to_owned(),
            model: "trezor_1".to_owned(),
            path: "usb-path".to_owned(),
            code: None,
            needs_pin_sent: false,
            needs_passphrase_sent: false,
            warnings: vec![vec![
                "Passphrase enabled; using default passphrase of the empty string (\"\")"
                    .to_owned(),
            ]],
        };
        assert_eq!(
            require_explicit_standard_wallet_selection(&hwi_device, false)
                .unwrap_err()
                .code,
            "hardware_wallet_selection_required"
        );
        require_explicit_standard_wallet_selection(&hwi_device, true).unwrap();
        let device = hardware_device_dto(hwi_device);
        assert_eq!(device.status, "needs_passphrase");
        assert_eq!(device.action, "confirm_empty_passphrase");
        assert!(device.message.contains("standard wallet"));
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
            device_type: None,
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
    fn software_wallet_generation_always_creates_a_valid_24_word_mnemonic() {
        let mnemonic = generate_software_mnemonic().expect("OS-backed mnemonic generation");
        assert_eq!(mnemonic.word_count(), 24);
        let encoded = Zeroizing::new(mnemonic.to_string());
        let reparsed = Mnemonic::parse(encoded.as_str()).expect("generated words remain valid");
        assert_eq!(reparsed.word_count(), 24);
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
                    device_type: None,
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
    fn synced_snapshots_enqueue_received_and_first_confirmation_events_once() {
        let db = Connection::open_in_memory().unwrap();
        init_app_schema(&db).unwrap();
        let transaction = |id: &str, direction: &str, confirmations: u32| TransactionDto {
            id: id.repeat(64),
            kind: "payment".to_owned(),
            direction: direction.to_owned(),
            amount: 42,
            fee: None,
            status: if confirmations > 0 {
                "confirmed"
            } else {
                "pending"
            }
            .to_owned(),
            confirmations,
            date: "1".to_owned(),
            address: Some("bcrt1qnotificationfixture".to_owned()),
            label: "Test deposit".to_owned(),
            block: (confirmations > 0).then_some(1),
        };
        let snapshot = WalletSnapshotDto {
            network: "regtest",
            balance: BalanceDto {
                confirmed: 84,
                pending: 42,
                trusted_pending: 42,
                total: 126,
            },
            transactions: vec![
                transaction("a", "received", 0),
                transaction("b", "received", 1),
                transaction("c", "sent", 1),
            ],
            utxos: vec![],
            receive_addresses: vec![],
            synced_at: Some("1".to_owned()),
        };

        enqueue_snapshot_notifications(&db, &snapshot).unwrap();
        enqueue_snapshot_notifications(&db, &snapshot).unwrap();
        let events = notifications::pending(&db).unwrap();
        assert_eq!(events.len(), 4);
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event.event, WalletNotification::PaymentReceived { .. }))
                .count(),
            2
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event.event, WalletNotification::FirstConfirmation { .. }))
                .count(),
            2
        );
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
                    label: "Restart fixture".into(),
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

    #[test]
    fn public_backup_filename_is_bounded_and_has_an_interoperable_extension() {
        assert_eq!(
            validate_public_backup_filename("wallet.bsms").unwrap(),
            "wallet.bsms"
        );
        assert_eq!(
            validate_public_backup_filename("wallet.json").unwrap(),
            "wallet.json"
        );
        for invalid in [
            "",
            "wallet.txt",
            "../wallet.json",
            "folder/wallet.bsms",
            "wallet.json\0extra",
        ] {
            assert_eq!(
                validate_public_backup_filename(invalid).unwrap_err().code,
                "invalid_backup"
            );
        }
        assert_eq!(
            validate_public_backup_filename(&format!("{}.json", "a".repeat(129)))
                .unwrap_err()
                .code,
            "invalid_backup"
        );
    }

    #[test]
    fn psbt_filename_is_bounded_and_cannot_escape_the_save_location() {
        assert_eq!(
            validate_psbt_filename("payment.psbt").unwrap(),
            "payment.psbt"
        );
        for invalid in [
            "",
            "payment.txt",
            "../payment.psbt",
            "folder/payment.psbt",
            "payment.psbt\0extra",
        ] {
            assert_eq!(
                validate_psbt_filename(invalid).unwrap_err().code,
                "invalid_backup"
            );
        }
        assert_eq!(
            validate_psbt_filename(&format!("{}.psbt", "a".repeat(129)))
                .unwrap_err()
                .code,
            "invalid_backup"
        );
    }

    #[test]
    fn wallet_sessions_are_independent_across_wallet_switches() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let idle_timeout = Duration::from_secs(5 * 60);
        let mut sessions = WalletSessions::default();

        sessions.unlock(first);
        sessions.unlock(second);
        let now = Instant::now();

        assert!(sessions.authorize_at(first, true, now, idle_timeout));
        assert!(sessions.authorize_at(second, true, now, idle_timeout));
        sessions.lock(second);
        assert!(sessions.authorize_at(first, false, now, idle_timeout));
        assert!(!sessions.authorize_at(second, false, now, idle_timeout));
    }

    #[test]
    fn background_sync_does_not_extend_the_idle_deadline() {
        let wallet_id = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(5 * 60);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(wallet_id, started);

        assert!(sessions.authorize_at(
            wallet_id,
            false,
            started + idle_timeout - Duration::from_secs(1),
            idle_timeout
        ));
        assert!(!sessions.authorize_at(
            wallet_id,
            false,
            started + idle_timeout + Duration::from_secs(1),
            idle_timeout
        ));
    }

    #[test]
    fn user_activity_refreshes_only_the_active_wallet_deadline() {
        let active = Uuid::new_v4();
        let inactive = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(5 * 60);
        let refreshed = started + idle_timeout - Duration::from_secs(1);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(active, started);
        sessions.last_activity.insert(inactive, started);

        assert!(sessions.authorize_at(active, true, refreshed, idle_timeout));
        assert!(sessions.authorize_at(
            active,
            false,
            refreshed + Duration::from_secs(2),
            idle_timeout
        ));
        assert!(!sessions.authorize_at(
            inactive,
            false,
            refreshed + Duration::from_secs(2),
            idle_timeout
        ));
    }

    #[test]
    fn background_heartbeat_prunes_every_expired_wallet_session() {
        let selected = Uuid::new_v4();
        let inactive = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(5 * 60);
        let now = started + idle_timeout + Duration::from_secs(1);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(selected, now);
        sessions.last_activity.insert(inactive, started);

        assert_eq!(sessions.prune_expired_at(now, idle_timeout), vec![inactive]);
        assert!(sessions.authorize_at(selected, false, now, idle_timeout));
        assert!(!sessions.authorize_at(inactive, false, now, idle_timeout));
    }

    #[test]
    fn wallet_sessions_honor_the_configured_global_timeout() {
        let wallet_id = Uuid::new_v4();
        let started = Instant::now();
        let one_minute = Duration::from_secs(60);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(wallet_id, started);

        assert!(sessions.authorize_at(
            wallet_id,
            false,
            started + Duration::from_secs(59),
            one_minute
        ));
        assert!(!sessions.authorize_at(
            wallet_id,
            false,
            started + Duration::from_secs(61),
            one_minute
        ));
    }
}
