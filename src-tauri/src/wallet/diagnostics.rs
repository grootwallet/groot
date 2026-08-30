use super::{api_error, internal, now, ApiResult, AppState, SavedFileDto};
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
        "node_history_unavailable" => "node_history_unavailable",
        "proposal_not_found" => "proposal_not_found",
        "rate_limited" => "rate_limited",
        "scan_cancelled" => "scan_cancelled",
        "scan_in_progress" => "scan_in_progress",
        "sync_cancelled" => "sync_cancelled",
        "sync_in_progress" => "sync_in_progress",
        "wallet_locked" => "wallet_locked",
        "wallet_selection_changed" => "wallet_selection_changed",
        _ => "internal_error",
    }
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
    error_code: Option<&str>,
) {
    context.progress_percent = context.progress_percent.map(|value| value.min(100));
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
        error_code: error_code.map(|code| safe_error_code(code).to_owned()),
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
            (DiagnosticOutcome::Cancelled, Some(error.code))
        }
        Err(error) => (DiagnosticOutcome::Failed, Some(error.code)),
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
            let mut output = String::from("schema_version,timestamp_unix_seconds,event,outcome,trigger,wallet_kind,sync_source,progress_percent,item_count,export_format,error_code,app_version,build_commit,compiled_network,platform\n");
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
            safe_error_code("secret=correct horse battery staple"),
            "internal_error"
        );
        assert_eq!(safe_error_code("bc1qfulladdress"), "internal_error");
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
            outcome: DiagnosticOutcome::Succeeded,
            trigger: DiagnosticTrigger::Automatic,
            wallet_kind: Some(DiagnosticWalletKind::Multisig),
            sync_source: Some(DiagnosticSyncSource::BitcoinCore),
            progress_percent: Some(100),
            item_count: None,
            export_format: None,
            error_code: None,
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
    }
}
