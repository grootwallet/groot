use super::{
    api_error, internal, now, ApiError, ApiErrorDetails, ApiResult, AppState, SavedFileDto,
};
use crate::{network::WalletSyncSource, registry::WalletKind};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt as _;

const LOG_FILENAME: &str = "diagnostics-v1.jsonl";
const MAX_LOG_BYTES: u64 = 16 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 2_048;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticEventKind {
    AppStarted,
    WalletCreated,
    WalletRecovered,
    WalletRemoved,
    WalletUnlocked,
    WalletLocked,
    Sync,
    RecoveryScan,
    TransactionPrepared,
    TransactionSigned,
    TransactionBroadcast,
    ReceiveAddressGenerated,
    ReceiveAddressDiscarded,
    ReceiveAddressVerified,
    CoinFrozen,
    CoinUnfrozen,
    BackupExported,
    BackupImported,
    BackupVerified,
    RecoveryTested,
    NetworkConfigurationChanged,
    DiagnosticsExported,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticOutcome {
    Started,
    Progress,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticTrigger {
    Automatic,
    #[default]
    Manual,
    Startup,
    Recovery,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticWalletKind {
    Software,
    Hardware,
    Multisig,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticSyncSource {
    BitcoinCore,
    CompactFilters,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticExportFormat {
    Json,
    Csv,
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct DiagnosticContext {
    pub trigger: DiagnosticTrigger,
    pub wallet_kind: Option<DiagnosticWalletKind>,
    pub sync_source: Option<DiagnosticSyncSource>,
    pub progress_percent: Option<u8>,
    pub item_count: Option<u32>,
    pub export_format: Option<DiagnosticExportFormat>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRecordDto {
    schema_version: u8,
    timestamp: u64,
    event: DiagnosticEventKind,
    outcome: DiagnosticOutcome,
    trigger: DiagnosticTrigger,
    #[serde(skip_serializing_if = "Option::is_none")]
    wallet_kind: Option<DiagnosticWalletKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sync_source: Option<DiagnosticSyncSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress_percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    item_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    export_format: Option<DiagnosticExportFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_details: Option<ApiErrorDetails>,
    app_version: String,
    build_commit: String,
    compiled_network: String,
    platform: String,
}

fn platform() -> &'static str {
    if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

fn safe_error_code(code: &str) -> &'static str {
    match code {
        "address_not_discardable" => "address_not_discardable",
        "backup_verification_failed" => "backup_verification_failed",
        "hardware_rejected" => "hardware_rejected",
        "hardware_signature_missing" => "hardware_signature_missing",
        "hardware_unavailable" => "hardware_unavailable",
        "initial_scan_required" => "initial_scan_required",
        "insufficient_funds" => "insufficient_funds",
        "insufficient_signatures" => "insufficient_signatures",
        "invalid_address" => "invalid_address",
        "invalid_amount" => "invalid_amount",
        "invalid_coin" => "invalid_coin",
        "invalid_credential" => "invalid_credential",
        "invalid_fee_rate" => "invalid_fee_rate",
        "invalid_node_config" => "invalid_node_config",
        "network_unavailable" => "network_unavailable",
        "node_admission_required" => "node_admission_required",
        "node_history_unavailable" => "node_history_unavailable",
        "proposal_not_found" => "proposal_not_found",
        "rate_limited" => "rate_limited",
        "scan_cancelled" => "scan_cancelled",
        "scan_in_progress" => "scan_in_progress",
        "sync_cancelled" => "sync_cancelled",
        "sync_in_progress" => "sync_in_progress",
        "wallet_locked" => "wallet_locked",
        "wallet_corrupt" => "wallet_corrupt",
        "wallet_not_found" => "wallet_not_found",
        "wallet_selection_changed" => "wallet_selection_changed",
        _ => "internal_error",
    }
}

fn safe_error_message(code: &str) -> &'static str {
    match code {
        "address_not_discardable" => "Only an unused receive address that is still awaiting payment can be discarded.",
        "backup_verification_failed" => "The supplied recovery backup did not reproduce the expected wallet.",
        "hardware_rejected" => "The signer rejected the requested action on the device.",
        "hardware_signature_missing" => "The signer returned without adding the required transaction signature.",
        "hardware_unavailable" => "The expected hardware signer could not be reached or was not ready.",
        "initial_scan_required" => "Wallet history must be scanned before this operation can continue.",
        "insufficient_funds" => "The wallet does not have enough spendable bitcoin for the payment and fee.",
        "insufficient_signatures" => "The proposal does not yet contain enough valid signatures to finalize.",
        "invalid_address" => "The recipient address is invalid for the compiled Bitcoin network.",
        "invalid_amount" => "The requested amount is outside the accepted transaction range.",
        "invalid_coin" => "The selected coin is invalid or no longer available for this operation.",
        "invalid_credential" => "Wallet authentication failed; the wallet remained locked.",
        "invalid_fee_rate" => "The requested fee rate is outside the accepted range.",
        "invalid_node_config" => "The Bitcoin Core configuration or RPC permissions are incomplete or invalid.",
        "network_unavailable" => "The configured network service could not be reached or verified.",
        "node_admission_required" => "This wallet has no currently admitted Bitcoin Core connection. Configure or copy a verified same-network setup before reading wallet data.",
        "node_history_unavailable" => "Bitcoin Core has pruned a block required by this scan. The attached block heights identify the unavailable range and earliest usable birthday.",
        "proposal_not_found" => "The saved payment proposal no longer exists or is no longer active.",
        "rate_limited" => "This wallet temporarily rejected another authentication attempt after repeated failures.",
        "scan_cancelled" => "The recovery scan was cancelled without applying a partial result.",
        "scan_in_progress" => "A recovery scan is already active for this wallet.",
        "sync_cancelled" => "The wallet sync was cancelled without applying a partial result.",
        "sync_in_progress" => "A wallet sync is already active for this wallet.",
        "wallet_locked" => "The selected wallet must be unlocked before this operation can continue.",
        "wallet_corrupt" => "Required local wallet data or protected node credentials are missing, invalid, or unsupported.",
        "wallet_not_found" => "The wallet or setup source required by this operation is no longer available.",
        "wallet_selection_changed" => "The selected wallet changed before the operation completed.",
        _ => "Groot encountered an unexpected internal failure. Retry the operation and export these app logs if it repeats.",
    }
}

fn sanitized_error_fields(error: &ApiError) -> (String, String, Option<ApiErrorDetails>) {
    let code = safe_error_code(error.code);
    let details = (code == error.code).then_some(error.details).flatten();
    (
        code.to_owned(),
        safe_error_message(code).to_owned(),
        details,
    )
}

fn log_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(internal)?
        .join(LOG_FILENAME))
}

#[cfg(unix)]
fn secure_open(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt as _;
    OpenOptions::new()
        .create(true)
        .append(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
}

#[cfg(not(unix))]
fn secure_open(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

pub(crate) fn record(
    app: &AppHandle,
    state: &AppState,
    event: DiagnosticEventKind,
    outcome: DiagnosticOutcome,
    mut context: DiagnosticContext,
    error: Option<&ApiError>,
) {
    context.progress_percent = context.progress_percent.map(|value| value.min(100));
    let safe_error = error.map(sanitized_error_fields);
    let record = DiagnosticRecordDto {
        schema_version: 1,
        timestamp: now(),
        event,
        outcome,
        trigger: context.trigger,
        wallet_kind: context.wallet_kind,
        sync_source: context.sync_source,
        progress_percent: context.progress_percent,
        item_count: context.item_count,
        export_format: context.export_format,
        error_code: safe_error.as_ref().map(|(code, _, _)| code.clone()),
        error_message: safe_error.as_ref().map(|(_, message, _)| message.clone()),
        error_details: safe_error.and_then(|(_, _, details)| details),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        build_commit: env!("GROOT_BUILD_COMMIT").to_owned(),
        compiled_network: crate::build_network::NAME.to_owned(),
        platform: platform().to_owned(),
    };
    let Ok(_guard) = state.diagnostic_log.lock() else {
        return;
    };
    let Ok(path) = log_path(app) else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    if path
        .metadata()
        .is_ok_and(|metadata| metadata.len() >= MAX_LOG_BYTES)
    {
        return;
    }
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink() || !metadata.is_file())
    {
        return;
    }
    let Ok(mut encoded) = serde_json::to_vec(&record) else {
        return;
    };
    if encoded.len() > MAX_RECORD_BYTES {
        return;
    }
    encoded.push(b'\n');
    if let Ok(mut file) = secure_open(&path) {
        let _ = file.write_all(&encoded).and_then(|()| file.sync_data());
    }
}

pub(crate) fn wallet_kind(kind: WalletKind) -> DiagnosticWalletKind {
    match kind {
        WalletKind::SingleKey => DiagnosticWalletKind::Software,
        WalletKind::WatchOnly => DiagnosticWalletKind::Hardware,
        WalletKind::Multisig => DiagnosticWalletKind::Multisig,
    }
}

pub(crate) fn sync_source(source: &WalletSyncSource) -> DiagnosticSyncSource {
    match source {
        WalletSyncSource::BitcoinCore => DiagnosticSyncSource::BitcoinCore,
        WalletSyncSource::CompactFilters { .. } => DiagnosticSyncSource::CompactFilters,
    }
}

pub(crate) fn record_result<T>(
    app: &AppHandle,
    state: &AppState,
    event: DiagnosticEventKind,
    mut context: DiagnosticContext,
    result: &ApiResult<T>,
) {
    let (outcome, error) = match result {
        Ok(_) => {
            if matches!(
                event,
                DiagnosticEventKind::Sync | DiagnosticEventKind::RecoveryScan
            ) {
                context.progress_percent = Some(100);
            }
            (DiagnosticOutcome::Succeeded, None)
        }
        Err(error)
            if matches!(
                error.code,
                "sync_cancelled" | "scan_cancelled" | "onboarding_cancelled"
            ) =>
        {
            (DiagnosticOutcome::Cancelled, Some(error))
        }
        Err(error) => (DiagnosticOutcome::Failed, Some(error)),
    };
    record(app, state, event, outcome, context, error);
}

fn read_records(app: &AppHandle, state: &AppState) -> ApiResult<Vec<DiagnosticRecordDto>> {
    let _guard = state.diagnostic_log.lock().map_err(internal)?;
    let path = log_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let metadata = fs::symlink_metadata(&path).map_err(internal)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_LOG_BYTES {
        return Err(api_error(
            "diagnostics_unavailable",
            "The diagnostic log is unavailable or exceeds its safe size limit.",
        ));
    }
    let mut records = Vec::new();
    for line in BufReader::new(File::open(path).map_err(internal)?).lines() {
        let line = line.map_err(internal)?;
        if line.len() > MAX_RECORD_BYTES {
            return Err(api_error(
                "diagnostics_unavailable",
                "The diagnostic log contains an invalid record.",
            ));
        }
        records.push(serde_json::from_str(&line).map_err(|_| {
            api_error(
                "diagnostics_unavailable",
                "The diagnostic log contains an invalid record.",
            )
        })?);
    }
    Ok(records)
}

#[tauri::command]
pub fn diagnostics_list(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<DiagnosticRecordDto>> {
    read_records(&app, &state)
}

fn csv_cell(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn enum_text<T: Serialize>(value: T) -> ApiResult<String> {
    serde_json::to_value(value)
        .map_err(internal)?
        .as_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| internal("Unable to serialize a diagnostic enum."))
}

fn export_bytes(
    records: &[DiagnosticRecordDto],
    format: DiagnosticExportFormat,
) -> ApiResult<Vec<u8>> {
    match format {
        DiagnosticExportFormat::Json => serde_json::to_vec_pretty(records).map_err(internal),
        DiagnosticExportFormat::Csv => {
            let mut output = String::from("schema_version,timestamp_unix_seconds,event,outcome,trigger,wallet_kind,sync_source,progress_percent,item_count,export_format,error_code,error_message,requested_birthday_block,required_block,earliest_retained_block,minimum_birthday_block,app_version,build_commit,compiled_network,platform\n");
            for record in records {
                let row = [
                    record.schema_version.to_string(),
                    record.timestamp.to_string(),
                    enum_text(record.event)?,
                    enum_text(record.outcome)?,
                    enum_text(record.trigger)?,
                    record
                        .wallet_kind
                        .map(enum_text)
                        .transpose()?
                        .unwrap_or_default(),
                    record
                        .sync_source
                        .map(enum_text)
                        .transpose()?
                        .unwrap_or_default(),
                    record
                        .progress_percent
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .item_count
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .export_format
                        .map(enum_text)
                        .transpose()?
                        .unwrap_or_default(),
                    record.error_code.clone().unwrap_or_default(),
                    record.error_message.clone().unwrap_or_default(),
                    record
                        .error_details
                        .and_then(|details| details.requested_birthday_block)
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .error_details
                        .and_then(|details| details.required_block)
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .error_details
                        .and_then(|details| details.earliest_retained_block)
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .error_details
                        .and_then(|details| details.minimum_birthday_block)
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record.app_version.clone(),
                    record.build_commit.clone(),
                    record.compiled_network.clone(),
                    record.platform.clone(),
                ];
                output.push_str(
                    &row.iter()
                        .map(|value| csv_cell(value))
                        .collect::<Vec<_>>()
                        .join(","),
                );
                output.push('\n');
            }
            Ok(output.into_bytes())
        }
    }
}

#[tauri::command]
pub async fn diagnostics_export(
    app: AppHandle,
    format: DiagnosticExportFormat,
) -> ApiResult<SavedFileDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let records = read_records(&app, &state)?;
        let (filename, extension) = match format {
            DiagnosticExportFormat::Json => ("groot-diagnostics.json", "json"),
            DiagnosticExportFormat::Csv => ("groot-diagnostics.csv", "csv"),
        };
        let selected = app
            .dialog()
            .file()
            .set_file_name(filename)
            .add_filter("Groot diagnostics", &[extension])
            .blocking_save_file();
        let Some(selected) = selected else {
            return super::export_commands::saved_file_result(&state, None);
        };
        let path = selected.into_path().map_err(internal)?;
        super::export_commands::write_public_export(&path, &export_bytes(&records, format)?)?;
        let saved = super::export_commands::saved_file_result(&state, Some(path))?;
        record(
            &app,
            &state,
            DiagnosticEventKind::DiagnosticsExported,
            DiagnosticOutcome::Succeeded,
            DiagnosticContext {
                item_count: u32::try_from(records.len()).ok(),
                export_format: Some(format),
                ..Default::default()
            },
            None,
        );
        Ok(saved)
    })
    .await
    .map_err(internal)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_codes_are_strictly_allowlisted() {
        assert_eq!(safe_error_code("invalid_credential"), "invalid_credential");
        assert_eq!(
            safe_error_code("node_admission_required"),
            "node_admission_required"
        );
        assert_eq!(
            safe_error_code("secret=correct horse battery staple"),
            "internal_error"
        );
        assert_eq!(safe_error_code("bc1qfulladdress"), "internal_error");
    }

    #[test]
    fn unknown_errors_drop_free_form_messages_and_structured_details() {
        let error = super::super::api_error_with_details(
            "secret=correct horse battery staple",
            "private RPC and device output",
            ApiErrorDetails {
                required_block: Some(42),
                ..Default::default()
            },
        );
        let (code, message, details) = sanitized_error_fields(&error);
        assert_eq!(code, "internal_error");
        assert_eq!(message, safe_error_message("internal_error"));
        assert!(details.is_none());
        assert!(!message.contains("private RPC"));
    }

    #[test]
    fn allowlisted_scan_errors_keep_safe_block_details() {
        let details = ApiErrorDetails {
            requested_birthday_block: Some(96_600),
            required_block: Some(96_599),
            earliest_retained_block: Some(960_062),
            minimum_birthday_block: Some(960_063),
        };
        let error = super::super::api_error_with_details(
            "node_history_unavailable",
            "unpersisted backend message",
            details,
        );
        let (code, message, persisted_details) = sanitized_error_fields(&error);
        assert_eq!(code, "node_history_unavailable");
        assert!(message.contains("pruned a block"));
        assert_eq!(persisted_details.unwrap().required_block, Some(96_599));
    }

    #[test]
    fn record_schema_has_no_free_form_diagnostic_fields() {
        let record = DiagnosticRecordDto {
            schema_version: 1,
            timestamp: 1,
            event: DiagnosticEventKind::TransactionPrepared,
            outcome: DiagnosticOutcome::Failed,
            trigger: DiagnosticTrigger::Manual,
            wallet_kind: Some(DiagnosticWalletKind::Software),
            sync_source: None,
            progress_percent: None,
            item_count: None,
            export_format: None,
            error_code: Some(safe_error_code("not-allowlisted").to_owned()),
            error_message: Some(safe_error_message("internal_error").to_owned()),
            error_details: None,
            app_version: "1.0.0".to_owned(),
            build_commit: "deadbeef".to_owned(),
            compiled_network: "signet".to_owned(),
            platform: "macos".to_owned(),
        };
        let value = serde_json::to_value(record).unwrap();
        let object = value.as_object().unwrap();
        assert_eq!(object.get("errorCode").unwrap(), "internal_error");
        for forbidden in [
            "credential",
            "mnemonic",
            "seed",
            "descriptor",
            "psbt",
            "transaction",
            "address",
            "txid",
            "outpoint",
            "deviceId",
            "rpc",
        ] {
            assert!(!object.contains_key(forbidden));
        }
    }

    #[test]
    fn csv_export_is_deterministic_and_quotes_every_field() {
        let records = vec![DiagnosticRecordDto {
            schema_version: 1,
            timestamp: 42,
            event: DiagnosticEventKind::Sync,
            outcome: DiagnosticOutcome::Failed,
            trigger: DiagnosticTrigger::Automatic,
            wallet_kind: Some(DiagnosticWalletKind::Multisig),
            sync_source: Some(DiagnosticSyncSource::BitcoinCore),
            progress_percent: Some(100),
            item_count: None,
            export_format: None,
            error_code: Some("node_history_unavailable".to_owned()),
            error_message: Some(safe_error_message("node_history_unavailable").to_owned()),
            error_details: Some(ApiErrorDetails {
                requested_birthday_block: Some(96_600),
                required_block: Some(96_599),
                earliest_retained_block: Some(960_062),
                minimum_birthday_block: Some(960_063),
            }),
            app_version: "1.0.0".to_owned(),
            build_commit: "abc".to_owned(),
            compiled_network: "regtest".to_owned(),
            platform: "linux".to_owned(),
        }];
        let first = export_bytes(&records, DiagnosticExportFormat::Csv).unwrap();
        let second = export_bytes(&records, DiagnosticExportFormat::Csv).unwrap();
        assert_eq!(first, second);
        assert!(String::from_utf8(first)
            .unwrap()
            .contains("\"42\",\"sync\""));
        let csv = String::from_utf8(second).unwrap();
        assert!(csv.contains("error_message,requested_birthday_block,required_block"));
        assert!(csv.contains("\"96600\",\"96599\",\"960062\",\"960063\""));
    }
}
