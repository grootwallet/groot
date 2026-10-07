use super::*;
use std::sync::{Condvar, OnceLock};

const HARDWARE_SCAN_CACHE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const HARDWARE_UNLOCK_OBSERVATION_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const MAX_TARGET_DEVICE_TYPES: usize = 8;
const MAX_DISCOVERED_DEVICES: usize = 64;
const BITBOX_ACCOUNT_KEY_ATTEMPTS: usize = 3;
#[cfg(not(test))]
const BITBOX_ACCOUNT_KEY_RETRY_DELAY: Duration = Duration::from_millis(750);
#[cfg(test)]
const BITBOX_ACCOUNT_KEY_RETRY_DELAY: Duration = Duration::from_millis(5);
const SUPPORTED_HWI_DEVICE_TYPES: &[&str] = &["bitbox02", "coldcard", "jade", "ledger", "trezor"];

pub(super) fn require_external_proposal_inputs_available(inputs_available: bool) -> ApiResult<()> {
    if inputs_available {
        Ok(())
    } else {
        Err(api_error(
            "coin_unavailable",
            "This payment uses coins no longer available in the wallet. Sync, then cancel it and prepare a new payment; no signatures were changed.",
        ))
    }
}

fn hardware_admission_key(
    fingerprint: &str,
    xpub: &str,
    derivation_path: &str,
    device_type: Option<&str>,
) -> Option<String> {
    let device_type = device_type?.trim().to_ascii_lowercase();
    (!device_type.is_empty()).then(|| {
        format!(
            "{}|{}|{}|{}",
            fingerprint.trim().to_ascii_lowercase(),
            xpub.trim(),
            derivation_path.trim(),
            device_type
        )
    })
}

fn remember_mainnet_hardware_admission(
    state: &AppState,
    fingerprint: &str,
    xpub: &str,
    derivation_path: &str,
    device_type: Option<&str>,
) -> ApiResult<()> {
    remember_hardware_admission_for_network(
        state,
        network(),
        fingerprint,
        xpub,
        derivation_path,
        device_type,
    )
}

fn remember_hardware_admission_for_network(
    state: &AppState,
    network: Network,
    fingerprint: &str,
    xpub: &str,
    derivation_path: &str,
    device_type: Option<&str>,
) -> ApiResult<()> {
    if network != Network::Bitcoin {
        return Ok(());
    }
    let key = hardware_admission_key(fingerprint, xpub, derivation_path, device_type).ok_or_else(
        || {
            api_error(
                "hardware_not_approved",
                "This signer has no approved live hardware identity.",
            )
        },
    )?;
    let mut admissions = state.pending_hardware_admissions.lock().map_err(internal)?;
    admissions.retain(|_, created_at| created_at.elapsed() <= HARDWARE_SCAN_CACHE_TIMEOUT);
    admissions.insert(key, Instant::now());
    Ok(())
}

fn require_mainnet_hardware_admission(
    state: &AppState,
    fingerprint: &str,
    xpub: &str,
    derivation_path: &str,
    device_type: Option<&str>,
) -> ApiResult<()> {
    require_hardware_admission_for_network(
        state,
        network(),
        fingerprint,
        xpub,
        derivation_path,
        device_type,
    )
}

fn require_hardware_admission_for_network(
    state: &AppState,
    network: Network,
    fingerprint: &str,
    xpub: &str,
    derivation_path: &str,
    device_type: Option<&str>,
) -> ApiResult<()> {
    if network != Network::Bitcoin {
        return Ok(());
    }
    let key = hardware_admission_key(fingerprint, xpub, derivation_path, device_type).ok_or_else(
        || {
            api_error(
                "hardware_not_approved",
                "Use a live approved hardware signer for mainnet wallet creation.",
            )
        },
    )?;
    let mut admissions = state.pending_hardware_admissions.lock().map_err(internal)?;
    admissions.retain(|_, created_at| created_at.elapsed() <= HARDWARE_SCAN_CACHE_TIMEOUT);
    if admissions.contains_key(&key) {
        Ok(())
    } else {
        Err(api_error(
            "hardware_not_approved",
            "Scan and import this exact approved hardware signer again before creating a mainnet wallet.",
        ))
    }
}

pub(super) fn reconcile_mainnet_recovery_cosigners(
    state: &AppState,
    cosigners: &[crate::multisig::CosignerInput],
) -> ApiResult<Vec<crate::multisig::CosignerInput>> {
    reconcile_recovery_cosigners_for_network(state, network(), cosigners)
}

fn reconcile_recovery_cosigners_for_network(
    state: &AppState,
    network: Network,
    cosigners: &[crate::multisig::CosignerInput],
) -> ApiResult<Vec<crate::multisig::CosignerInput>> {
    if network != Network::Bitcoin {
        return Ok(cosigners.to_vec());
    }
    let mut admissions = state.pending_hardware_admissions.lock().map_err(internal)?;
    admissions.retain(|_, created_at| created_at.elapsed() <= HARDWARE_SCAN_CACHE_TIMEOUT);
    cosigners
        .iter()
        .map(|cosigner| {
            let prefix = format!(
                "{}|{}|{}|",
                cosigner.fingerprint.trim().to_ascii_lowercase(),
                cosigner.xpub.trim(),
                cosigner.derivation_path.trim()
            );
            let mut device_types = admissions
                .keys()
                .filter_map(|key| key.strip_prefix(&prefix))
                .filter(|device_type| !device_type.is_empty());
            let device_type = device_types.next().ok_or_else(|| {
                api_error(
                    "hardware_not_approved",
                    "Scan and import every signer in this mainnet recovery before creating the wallet.",
                )
            })?;
            if device_types.next().is_some() {
                return Err(api_error(
                    "hardware_not_approved",
                    "A recovered signer has an ambiguous live hardware identity.",
                ));
            }
            let mut reconciled = cosigner.clone();
            reconciled.source = crate::multisig::CosignerSource::Usb;
            reconciled.device_type = Some(device_type.to_owned());
            Ok(reconciled)
        })
        .collect()
}

fn approved_hwi_model(network: Network, device_type: &str, model: &str) -> bool {
    let device_type = device_type.trim().to_ascii_lowercase();
    let model = model.trim().to_ascii_lowercase();
    if network != Network::Bitcoin {
        return SUPPORTED_HWI_DEVICE_TYPES.contains(&device_type.as_str());
    }
    match device_type.as_str() {
        "ledger" => model == "ledger_nano_s_plus",
        // HWI normally forms this identifier from Trezor's protocol-level
        // model code. Safe 3 revision A reports T2B1 and revision B reports
        // T3B1, while firmware observed with the same pinned HWI 3.2.0 can
        // expose the exact retail string `Safe 3`. Admit only those three
        // exact representations; do not normalize arbitrary Trezor names.
        "trezor" => matches!(
            model.as_str(),
            "trezor_1" | "trezor_t2b1" | "trezor_t3b1" | "trezor_safe 3"
        ),
        "bitbox02" => matches!(model.as_str(), "bitbox02_btconly" | "bitbox02_nova_btconly"),
        // ADR 0054 deliberately approves HWI 3.2.0's family-level identities
        // for Coldcard and Jade. Physical evidence remains model-specific,
        // but the trusted runtime cannot distinguish models inside either
        // family and therefore admits only these exact family records.
        "coldcard" => model == "coldcard",
        "jade" => model == "jade",
        _ => false,
    }
}

#[tauri::command]
pub async fn hardware_cancel_operations(
    state: State<'_, AppState>,
    preserve_mainnet_admission: Option<bool>,
) -> ApiResult<()> {
    state
        .pending_hardware_pins
        .lock()
        .map_err(internal)?
        .clear();
    // Advance the epoch before terminating the native operation. A canceled
    // enumerate process that finishes concurrently must never repopulate the
    // cache with capabilities the user just invalidated.
    forget_hardware_scan(&state)?;
    if preserve_mainnet_admission != Some(true) {
        state
            .pending_hardware_admissions
            .lock()
            .map_err(internal)?
            .clear();
        clear_mainnet_node_admission(&state)?;
    }
    tauri::async_runtime::spawn_blocking(crate::hardware::cancel_hardware_operations_and_wait)
        .await
        .map_err(internal)?
        .map_err(hardware_api_error)?;
    Ok(())
}

fn validated_target_device_types(device_types: Vec<String>) -> ApiResult<Vec<String>> {
    if device_types.is_empty() || device_types.len() > MAX_TARGET_DEVICE_TYPES {
        return Err(api_error(
            "invalid_hardware_request",
            "Choose at least one supported hardware-signer type.",
        ));
    }
    let mut validated = Vec::with_capacity(device_types.len());
    for device_type in device_types {
        let device_type = device_type.trim().to_ascii_lowercase();
        if !SUPPORTED_HWI_DEVICE_TYPES.contains(&device_type.as_str()) {
            return Err(api_error(
                "invalid_hardware_request",
                "The requested hardware-signer type is not supported.",
            ));
        }
        if !validated.contains(&device_type) {
            validated.push(device_type);
        }
    }
    Ok(validated)
}

fn retain_requested_hwi_devices(
    mut devices: Vec<HwiDevice>,
    requested_device_types: &[String],
) -> Vec<HwiDevice> {
    devices.retain(|device| {
        requested_device_types
            .iter()
            .any(|requested| device.device_type.eq_ignore_ascii_case(requested))
    });
    devices
}

#[derive(Default)]
struct DiscoveryFlightState {
    running: bool,
    generation: u64,
    waiters: usize,
    completions: HashMap<u64, SharedDiscoveryCompletion>,
}

type SharedDiscoveryResult = ApiResult<(u64, Vec<HwiDevice>)>;

struct SharedDiscoveryCompletion {
    result: SharedDiscoveryResult,
    remaining_waiters: usize,
}

struct DiscoveryFlight {
    state: Mutex<DiscoveryFlightState>,
    finished: Condvar,
}

static DISCOVERY_FLIGHT: OnceLock<DiscoveryFlight> = OnceLock::new();

fn discovery_flight() -> &'static DiscoveryFlight {
    DISCOVERY_FLIGHT.get_or_init(|| DiscoveryFlight {
        state: Mutex::new(DiscoveryFlightState::default()),
        finished: Condvar::new(),
    })
}

fn validate_discovered_devices(devices: Vec<HwiDevice>) -> ApiResult<Vec<HwiDevice>> {
    validate_discovered_devices_for_network(devices, network())
}

fn validate_discovered_devices_for_network(
    mut devices: Vec<HwiDevice>,
    active_network: Network,
) -> ApiResult<Vec<HwiDevice>> {
    if devices.len() > MAX_DISCOVERED_DEVICES {
        return Err(api_error(
            "hardware_response_too_large",
            "The hardware inventory returned too many signer records.",
        ));
    }
    let mut paths = std::collections::HashSet::new();
    for device in &mut devices {
        device.device_type = device.device_type.trim().to_ascii_lowercase();
        if device.path.len() > 1024
            || device.model.chars().count() > 256
            || device.path.chars().any(char::is_control)
            || device.model.chars().any(char::is_control)
        {
            return Err(api_error(
                "invalid_hardware_response",
                "The hardware inventory returned an invalid signer record.",
            ));
        }
    }
    // Passive inventory reports every recognized connected family. An otherwise
    // valid but out-of-scope model must not prevent an approved signer from
    // being discovered. Drop it before issuing a capability or caching its
    // private path; selected-device commands therefore remain limited to the
    // exact Mainnet allowlist.
    devices.retain(|device| {
        SUPPORTED_HWI_DEVICE_TYPES.contains(&device.device_type.as_str())
            && approved_hwi_model(active_network, &device.device_type, &device.model)
    });
    for device in &mut devices {
        device.fingerprint = match device.fingerprint.take() {
            Some(fingerprint) if !fingerprint.trim().is_empty() => {
                let fingerprint = fingerprint.trim().to_ascii_lowercase();
                Fingerprint::from_str(&fingerprint).map_err(|_| {
                    api_error(
                        "invalid_hardware_response",
                        "The hardware inventory returned an invalid signer identity.",
                    )
                })?;
                Some(fingerprint)
            }
            _ => None,
        };
        if !device.path.is_empty() && !paths.insert(device.path.clone()) {
            return Err(api_error(
                "hardware_ambiguous",
                "The hardware inventory returned conflicting devices for one connection. Disconnect extra signers and scan again.",
            ));
        }
    }
    Ok(devices)
}

fn passive_hwi_devices() -> ApiResult<Vec<HwiDevice>> {
    let devices = passive_hardware_inventory(network())
        .map_err(hardware_api_error)?
        .into_iter()
        .map(|candidate| HwiDevice {
            passive: true,
            device_type: candidate.device_type,
            model: candidate.model,
            path: candidate.path,
            ..HwiDevice::default()
        })
        .collect();
    validate_discovered_devices(devices)
}

fn discover_hardware_singleflight<S, F>(
    scan: S,
    begin_scan: F,
) -> ApiResult<(u64, u64, Vec<HwiDevice>)>
where
    S: FnOnce() -> ApiResult<Vec<HwiDevice>>,
    F: FnOnce() -> ApiResult<u64>,
{
    let flight = discovery_flight();
    let mut state = flight.state.lock().map_err(internal)?;
    if state.running {
        let generation = state.generation;
        state.waiters = state.waiters.saturating_add(1);
        while state.running && state.generation == generation {
            state = flight.finished.wait(state).map_err(internal)?;
        }
        let (result, remove_completion) = {
            let completion = state
                .completions
                .get_mut(&generation)
                .ok_or_else(|| internal("The shared hardware scan did not produce a result."))?;
            let result = completion.result.clone();
            completion.remaining_waiters = completion.remaining_waiters.saturating_sub(1);
            (result, completion.remaining_waiters == 0)
        };
        if remove_completion {
            state.completions.remove(&generation);
        }
        return result.map(|(request_epoch, devices)| (generation, request_epoch, devices));
    }
    state.generation = state.generation.wrapping_add(1);
    let generation = state.generation;
    state.running = true;
    state.waiters = 0;
    drop(state);

    // Only the leader invalidates the prior cache. Followers join both the
    // native inventory call and its request epoch so every coalesced caller
    // can publish the same capabilities without superseding its peers.
    let result =
        begin_scan().and_then(|request_epoch| scan().map(|devices| (request_epoch, devices)));

    let mut state = flight.state.lock().map_err(internal)?;
    state.running = false;
    if state.waiters > 0 {
        let remaining_waiters = state.waiters;
        state.completions.insert(
            generation,
            SharedDiscoveryCompletion {
                result: result.clone(),
                remaining_waiters,
            },
        );
    }
    state.waiters = 0;
    flight.finished.notify_all();
    result.map(|(request_epoch, devices)| (generation, request_epoch, devices))
}

fn saved_hwi_device(
    devices: Vec<HwiDevice>,
    requested_device_type: &str,
    requested_fingerprint: &str,
) -> ApiResult<Option<HwiDevice>> {
    let eligible = devices.into_iter().filter(|device| {
        !device.path.is_empty()
            && device
                .device_type
                .eq_ignore_ascii_case(requested_device_type)
    });
    let (matching, unidentified): (Vec<_>, Vec<_>) = eligible.partition(|device| {
        device
            .fingerprint
            .as_deref()
            .is_some_and(|fingerprint| fingerprint.eq_ignore_ascii_case(requested_fingerprint))
    });
    if matching.len() > 1 {
        return Err(api_error(
            "hardware_ambiguous",
            "More than one connected device reports the saved signer identity. Disconnect the extra device and scan again.",
        ));
    }
    if let Some(device) = matching.into_iter().next() {
        return Ok(Some(device));
    }
    if !supports_locked_interactive_identity(requested_device_type) {
        return Ok(None);
    }
    let unidentified = unidentified
        .into_iter()
        .filter(|device| device.fingerprint.is_none())
        .collect::<Vec<_>>();
    if unidentified.len() > 1 {
        return Err(api_error(
            "hardware_ambiguous",
            "More than one locked device of the saved signer type is connected. Disconnect the extra device and scan again.",
        ));
    }
    // This is only an opaque path hint. The interactive caller must derive and
    // match the complete saved identity before health, display, or signing.
    Ok(unidentified.into_iter().next())
}

fn supports_locked_interactive_identity(device_type: &str) -> bool {
    SUPPORTED_HWI_DEVICE_TYPES.contains(&device_type.to_ascii_lowercase().as_str())
}

pub(super) fn saved_cosigner_candidates_for_device(
    cosigners: &[CosignerInput],
    device: &HwiDevice,
) -> ApiResult<Vec<CosignerInput>> {
    if let Some(fingerprint) = device.fingerprint.as_deref() {
        return cosigners
            .iter()
            .find(|signer| signer.fingerprint.eq_ignore_ascii_case(fingerprint))
            .cloned()
            .map(|signer| vec![signer])
            .ok_or_else(unknown_hardware_signer);
    }
    if !supports_locked_interactive_identity(&device.device_type) {
        return Err(missing_hardware_fingerprint(&device.device_type));
    }
    let candidates = cosigners
        .iter()
        .filter(|signer| {
            signer
                .device_type
                .as_deref()
                .is_none_or(|saved_type| saved_type.eq_ignore_ascii_case(&device.device_type))
        })
        .cloned()
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return Err(unknown_hardware_signer());
    }
    Ok(candidates)
}

fn same_cosigner_identity(left: &CosignerInput, right: &CosignerInput) -> bool {
    left.fingerprint.eq_ignore_ascii_case(&right.fingerprint)
        && left.xpub == right.xpub
        && left.derivation_path == right.derivation_path
        && left.device_type == right.device_type
}

fn discover_saved_hardware_device<S, F>(
    scan: S,
    device_type: &str,
    fingerprint: &str,
    begin_scan: F,
) -> ApiResult<(u64, u64, HwiDevice)>
where
    S: FnOnce() -> ApiResult<Vec<HwiDevice>>,
    F: FnOnce() -> ApiResult<u64>,
{
    let (generation, request_epoch, discovered) = discover_hardware_singleflight(scan, begin_scan)?;
    let device = saved_hwi_device(discovered, device_type, fingerprint)?.ok_or_else(|| {
        api_error(
            "hardware_unavailable",
            "The saved hardware signer was not found. Keep that signer connected and unlocked, then try again.",
        )
    })?;
    Ok((generation, request_epoch, device))
}

fn remember_hardware_scan(
    state: &AppState,
    request_epoch: u64,
    generation: u64,
    devices: &mut [HwiDevice],
) -> ApiResult<()> {
    let mut scans = state.recent_hardware_scan.lock().map_err(internal)?;
    if state.hardware_scan_epoch.load(Ordering::SeqCst) != request_epoch {
        return Err(api_error(
            "hardware_scan_superseded",
            "A newer hardware scan replaced this result. Use the latest scan.",
        ));
    }
    let connected_paths = devices
        .iter()
        .map(|device| device.path.clone())
        .collect::<std::collections::HashSet<_>>();
    let mut unlocked_paths = state
        .recently_unlocked_hardware_paths
        .lock()
        .map_err(internal)?;
    unlocked_paths.retain(|path, observed_at| {
        observed_at.elapsed() <= HARDWARE_UNLOCK_OBSERVATION_TIMEOUT
            && connected_paths.contains(path)
    });
    for device in devices.iter_mut() {
        device.observed_unlocked = unlocked_paths.contains_key(&device.path);
    }
    drop(unlocked_paths);
    let prior_capabilities = scans
        .as_ref()
        .filter(|scan| scan.generation == Some(generation))
        .map(|scan| {
            scan.devices
                .values()
                .map(|device| (device.path.clone(), device.capability.clone()))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();
    for device in devices.iter_mut() {
        device.capability = prior_capabilities
            .get(&device.path)
            .cloned()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
    }
    let devices = devices
        .iter()
        .filter(|device| !device.path.is_empty())
        .map(|device| (device.capability.clone(), device.clone()))
        .collect();
    *scans = Some(RecentHardwareScan {
        devices,
        created_at: Instant::now(),
        generation: Some(generation),
    });
    Ok(())
}

fn remember_unlocked_hardware_path(state: &AppState, path: &str) -> ApiResult<()> {
    let mut unlocked_paths = state
        .recently_unlocked_hardware_paths
        .lock()
        .map_err(internal)?;
    unlocked_paths
        .retain(|_, observed_at| observed_at.elapsed() <= HARDWARE_UNLOCK_OBSERVATION_TIMEOUT);
    unlocked_paths.insert(path.to_owned(), Instant::now());
    Ok(())
}

fn remember_hardware_devices(state: &AppState, devices: &mut [HwiDevice]) -> ApiResult<()> {
    let mut scans = state.recent_hardware_scan.lock().map_err(internal)?;
    remember_hardware_devices_in_scan(&mut scans, devices);
    Ok(())
}

fn remember_hardware_devices_in_scan(
    scans: &mut Option<RecentHardwareScan>,
    devices: &mut [HwiDevice],
) {
    let scan = scans.get_or_insert_with(|| RecentHardwareScan {
        devices: HashMap::new(),
        created_at: Instant::now(),
        generation: None,
    });
    for device in devices.iter_mut().filter(|device| !device.path.is_empty()) {
        if let Some((capability, _)) = scan
            .devices
            .iter()
            .find(|(_, cached)| cached.path == device.path)
        {
            device.capability = capability.clone();
        } else {
            device.capability = Uuid::new_v4().to_string();
        }
        scan.devices
            .insert(device.capability.clone(), device.clone());
    }
    scan.created_at = Instant::now();
    scan.generation = None;
}

fn forget_hardware_scan(state: &AppState) -> ApiResult<u64> {
    let mut scans = state.recent_hardware_scan.lock().map_err(internal)?;
    let request_epoch = state
        .hardware_scan_epoch
        .fetch_add(1, Ordering::SeqCst)
        .wrapping_add(1);
    *scans = None;
    Ok(request_epoch)
}

pub(super) fn recently_scanned_hardware_device(
    state: &AppState,
    device_id: &str,
) -> ApiResult<HwiDevice> {
    let scans = state.recent_hardware_scan.lock().map_err(internal)?;
    let scan = scans.as_ref().ok_or_else(|| {
        api_error(
            "hardware_scan_expired",
            "Scan for hardware signers again before continuing.",
        )
    })?;
    if scan.created_at.elapsed() > HARDWARE_SCAN_CACHE_TIMEOUT {
        return Err(api_error(
            "hardware_scan_expired",
            "The hardware scan expired. Scan again before continuing.",
        ));
    }
    scan.devices.get(device_id).cloned().ok_or_else(|| {
        api_error(
            "hardware_unavailable",
            "That hardware signer was not present in the latest scan. Scan again.",
        )
    })
}

#[tauri::command]
pub async fn hardware_list(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<HardwareDeviceDto>> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    let app_for_scan = app.clone();
    let (generation, request_epoch, mut devices) =
        tauri::async_runtime::spawn_blocking(move || {
            let native_state = app_for_scan.state::<AppState>();
            discover_hardware_singleflight(passive_hwi_devices, || {
                forget_hardware_scan(&native_state)
            })
        })
        .await
        .map_err(internal)??;
    remember_hardware_scan(&state, request_epoch, generation, &mut devices)?;
    Ok(devices.into_iter().map(hardware_device_dto).collect())
}

#[tauri::command]
pub async fn hardware_list_for_device_types(
    app: AppHandle,
    state: State<'_, AppState>,
    device_types: Vec<String>,
) -> ApiResult<Vec<HardwareDeviceDto>> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    let device_types = validated_target_device_types(device_types)?;
    let app_for_scan = app.clone();
    let devices = tauri::async_runtime::spawn_blocking(move || {
        let native_state = app_for_scan.state::<AppState>();
        let (generation, request_epoch, discovered) =
            discover_hardware_singleflight(passive_hwi_devices, || {
                forget_hardware_scan(&native_state)
            })?;
        Ok::<_, ApiError>((
            generation,
            request_epoch,
            discovered.clone(),
            retain_requested_hwi_devices(discovered, &device_types),
        ))
    })
    .await
    .map_err(internal)??;
    let (generation, request_epoch, mut all_devices, mut devices) = devices;
    remember_hardware_scan(&state, request_epoch, generation, &mut all_devices)?;
    let capabilities = all_devices
        .iter()
        .map(|device| (device.path.clone(), device.capability.clone()))
        .collect::<HashMap<_, _>>();
    for device in &mut devices {
        device.capability = capabilities.get(&device.path).cloned().unwrap_or_default();
    }
    Ok(devices.into_iter().map(hardware_device_dto).collect())
}

#[tauri::command]
pub async fn hardware_find_saved_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_type: String,
    fingerprint: String,
    derivation_path: String,
    account_xpub: String,
) -> ApiResult<HardwareDeviceDto> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    let device_type = validated_target_device_types(vec![device_type])?
        .into_iter()
        .next()
        .ok_or_else(|| internal("The saved hardware device type is unavailable."))?;
    let fingerprint = fingerprint.trim().to_ascii_lowercase();
    Fingerprint::from_str(&fingerprint).map_err(|_| {
        api_error(
            "invalid_fingerprint",
            "The saved hardware signer fingerprint is invalid.",
        )
    })?;
    DerivationPath::from_str(derivation_path.trim()).map_err(|_| {
        api_error(
            "invalid_derivation_path",
            "The saved hardware signer account path is invalid.",
        )
    })?;
    let expected_xpub = Xpub::from_str(account_xpub.trim()).map_err(|_| {
        api_error(
            "invalid_descriptor",
            "The saved hardware signer account key is invalid.",
        )
    })?;
    if expected_xpub.network != parameters().extended_key_network {
        return Err(api_error(
            "wrong_network",
            "The saved hardware signer account key is for the wrong network.",
        ));
    }

    // This command resolves only an opaque path hint. The following health,
    // display, or signing command must freshly prove the complete account
    // identity and perform its action under one exclusive native lease.
    // It must not erase the other exact live admissions collected for this
    // multisig setup; every admission remains identity-bound and time-bounded.
    let requested_type = device_type.clone();
    let requested_fingerprint = fingerprint.clone();
    let app_for_scan = app.clone();
    let (generation, request_epoch, device) = tauri::async_runtime::spawn_blocking(move || {
        let native_state = app_for_scan.state::<AppState>();
        discover_saved_hardware_device(
            passive_hwi_devices,
            &requested_type,
            &requested_fingerprint,
            || forget_hardware_scan(&native_state),
        )
    })
    .await
    .map_err(internal)??;
    let mut remembered = [device];
    remember_hardware_scan(&state, request_epoch, generation, &mut remembered)?;
    let device = remembered
        .into_iter()
        .next()
        .expect("one remembered device");
    Ok(hardware_device_dto(device))
}

#[cfg(test)]
mod targeted_scan_tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering as AtomicOrdering},
        Arc,
    };
    use std::thread;

    static PASSIVE_SCAN_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn fake_passive_scan(count: Arc<AtomicUsize>) -> impl FnOnce() -> ApiResult<Vec<HwiDevice>> {
        move || {
            count.fetch_add(1, AtomicOrdering::SeqCst);
            thread::sleep(Duration::from_millis(50));
            Ok(vec![HwiDevice {
                passive: true,
                device_type: "jade".into(),
                model: "jade".into(),
                path: "fake-path".into(),
                fingerprint: Some("a1b2c3d4".into()),
                ..HwiDevice::default()
            }])
        }
    }

    #[test]
    fn targeted_device_types_are_bounded_supported_and_deduplicated() {
        assert_eq!(
            validated_target_device_types(vec![" Trezor ".into(), "trezor".into()]).unwrap(),
            ["trezor"]
        );
        assert!(validated_target_device_types(vec![]).is_err());
        assert!(validated_target_device_types(vec!["unknown".into()]).is_err());
        assert!(validated_target_device_types(vec!["keepkey".into()]).is_err());
        assert!(validated_target_device_types(vec!["digitalbitbox".into()]).is_err());
        assert!(validated_target_device_types(vec!["trezor".into(); 9]).is_err());
    }

    #[test]
    fn targeted_scan_ignores_unrelated_device_families() {
        let requested = HwiDevice {
            device_type: "jade".into(),
            path: "requested-device".into(),
            ..HwiDevice::default()
        };
        let unrelated = HwiDevice {
            device_type: "trezor".into(),
            path: "unrelated-device".into(),
            ..HwiDevice::default()
        };

        assert_eq!(
            retain_requested_hwi_devices(vec![unrelated, requested.clone()], &["JADE".into()]),
            [requested]
        );
    }

    #[test]
    fn targeted_scan_does_not_substitute_an_unrelated_device() {
        let unrelated = HwiDevice {
            device_type: "bitbox02".into(),
            path: "unrelated-device".into(),
            ..HwiDevice::default()
        };

        assert!(retain_requested_hwi_devices(vec![unrelated], &["jade".into()]).is_empty());
    }

    #[test]
    fn trezor_pin_errors_distinguish_rejection_from_session_failures() {
        let rejected = hardware_pin_response_error(HwiSuccess {
            success: None,
            error: Some("Failure_PinInvalid".into()),
            code: Some(-13),
        });
        assert_eq!(rejected.code, "hardware_pin_rejected");

        let stale = hardware_pin_response_error(HwiSuccess {
            success: None,
            error: Some("The PIN has already been sent to this device".into()),
            code: Some(-11),
        });
        assert_eq!(stale.code, "hardware_unavailable");
        assert!(stale.message.contains("another client session"));

        let generic = hardware_pin_response_error(HwiSuccess {
            success: None,
            error: Some("Unexpected message".into()),
            code: Some(-13),
        });
        assert_eq!(generic.code, "hardware_unavailable");
        assert!(!generic.message.to_ascii_lowercase().contains("wrong pin"));
    }

    #[test]
    fn successful_trezor_pin_observation_survives_rescan_only_for_the_connected_path() {
        let state = AppState::default();
        let path = "webusb:007:4";
        remember_unlocked_hardware_path(&state, path).unwrap();

        let request_epoch = forget_hardware_scan(&state).unwrap();
        let mut connected = [HwiDevice {
            passive: true,
            device_type: "trezor".into(),
            model: "trezor_1".into(),
            path: path.into(),
            ..HwiDevice::default()
        }];
        remember_hardware_scan(&state, request_epoch, 1, &mut connected).unwrap();
        assert!(connected[0].observed_unlocked);
        let ready = hardware_device_dto(connected[0].clone());
        assert_eq!(ready.status, "ready");
        assert_eq!(ready.action, "prompt_pin");

        let request_epoch = forget_hardware_scan(&state).unwrap();
        let mut disconnected = [];
        remember_hardware_scan(&state, request_epoch, 2, &mut disconnected).unwrap();

        let request_epoch = forget_hardware_scan(&state).unwrap();
        let mut reconnected = [HwiDevice {
            passive: true,
            device_type: "trezor".into(),
            model: "trezor_1".into(),
            path: path.into(),
            ..HwiDevice::default()
        }];
        remember_hardware_scan(&state, request_epoch, 3, &mut reconnected).unwrap();
        assert!(!reconnected[0].observed_unlocked);
    }

    #[test]
    fn three_or_all_family_requests_and_concurrent_callers_each_use_one_inventory_call() {
        let _guard = PASSIVE_SCAN_TEST_LOCK.lock().unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let state = AppState::default();
        let three = vec!["jade".into(), "ledger".into(), "trezor".into()];
        let (_, _, discovered) =
            discover_hardware_singleflight(fake_passive_scan(Arc::clone(&count)), || {
                forget_hardware_scan(&state)
            })
            .unwrap();
        assert_eq!(retain_requested_hwi_devices(discovered, &three).len(), 1);
        assert_eq!(count.load(AtomicOrdering::SeqCst), 1);

        let all = SUPPORTED_HWI_DEVICE_TYPES
            .iter()
            .map(|value| (*value).to_owned())
            .collect::<Vec<_>>();
        let (_, _, discovered) =
            discover_hardware_singleflight(fake_passive_scan(Arc::clone(&count)), || {
                forget_hardware_scan(&state)
            })
            .unwrap();
        assert_eq!(retain_requested_hwi_devices(discovered, &all).len(), 1);
        assert_eq!(count.load(AtomicOrdering::SeqCst), 2);

        let shared_state = Arc::new(AppState::default());
        let first_count = Arc::clone(&count);
        let second_count = Arc::clone(&count);
        let first_state = Arc::clone(&shared_state);
        let left = thread::spawn(move || {
            discover_hardware_singleflight(fake_passive_scan(first_count), || {
                forget_hardware_scan(&first_state)
            })
        });
        thread::sleep(Duration::from_millis(10));
        let second_state = Arc::clone(&shared_state);
        let right = thread::spawn(move || {
            discover_hardware_singleflight(fake_passive_scan(second_count), || {
                forget_hardware_scan(&second_state)
            })
        });
        let (left_generation, left_epoch, mut left_devices) = left.join().unwrap().unwrap();
        let (right_generation, right_epoch, mut right_devices) = right.join().unwrap().unwrap();
        assert_eq!(left_generation, right_generation);
        assert_eq!(left_epoch, right_epoch);
        assert_eq!(left_devices, right_devices);
        remember_hardware_scan(
            &shared_state,
            left_epoch,
            left_generation,
            &mut left_devices,
        )
        .unwrap();
        remember_hardware_scan(
            &shared_state,
            right_epoch,
            right_generation,
            &mut right_devices,
        )
        .unwrap();
        assert_eq!(left_devices[0].capability, right_devices[0].capability);
        assert_eq!(
            recently_scanned_hardware_device(&shared_state, &left_devices[0].capability)
                .unwrap()
                .path,
            "fake-path"
        );
        let flight_state = discovery_flight().state.lock().unwrap();
        assert!(!flight_state.running);
        assert_eq!(flight_state.waiters, 0);
        assert!(!flight_state.completions.contains_key(&left_generation));
        drop(flight_state);
        assert_eq!(count.load(AtomicOrdering::SeqCst), 3);
    }

    #[test]
    fn each_saved_device_rescan_performs_fresh_inventory() {
        let _guard = PASSIVE_SCAN_TEST_LOCK.lock().unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let state = AppState::default();

        discover_saved_hardware_device(
            fake_passive_scan(Arc::clone(&count)),
            "jade",
            "a1b2c3d4",
            || forget_hardware_scan(&state),
        )
        .unwrap();
        discover_saved_hardware_device(
            fake_passive_scan(Arc::clone(&count)),
            "jade",
            "a1b2c3d4",
            || forget_hardware_scan(&state),
        )
        .unwrap();

        assert_eq!(count.load(AtomicOrdering::SeqCst), 2);
    }

    #[test]
    fn scan_capabilities_are_opaque_redeemable_and_stable_only_within_one_flight() {
        let state = AppState::default();
        let mut first = [HwiDevice {
            device_type: "jade".into(),
            path: "private-native-path".into(),
            ..HwiDevice::default()
        }];
        let first_epoch = forget_hardware_scan(&state).unwrap();
        remember_hardware_scan(&state, first_epoch, 42, &mut first).unwrap();
        let first_capability = first[0].capability.clone();
        assert!(!first_capability.is_empty());
        assert_ne!(first_capability, first[0].path);
        assert_eq!(
            recently_scanned_hardware_device(&state, &first_capability)
                .unwrap()
                .path,
            first[0].path
        );

        let mut coalesced = [HwiDevice {
            device_type: "jade".into(),
            path: first[0].path.clone(),
            ..HwiDevice::default()
        }];
        remember_hardware_scan(&state, first_epoch, 42, &mut coalesced).unwrap();
        assert_eq!(coalesced[0].capability, first_capability);

        let mut later = [HwiDevice {
            device_type: "jade".into(),
            path: first[0].path.clone(),
            ..HwiDevice::default()
        }];
        let later_epoch = forget_hardware_scan(&state).unwrap();
        remember_hardware_scan(&state, later_epoch, 43, &mut later).unwrap();
        assert_ne!(later[0].capability, first_capability);
        assert!(recently_scanned_hardware_device(&state, &first_capability).is_err());

        forget_hardware_scan(&state).unwrap();
        assert!(recently_scanned_hardware_device(&state, &later[0].capability).is_err());
    }

    #[test]
    fn newer_explicit_scan_rejects_a_late_older_cache_write() {
        let state = AppState::default();
        let older_epoch = forget_hardware_scan(&state).unwrap();
        let newer_epoch = forget_hardware_scan(&state).unwrap();
        let mut older = vec![HwiDevice {
            device_type: "jade".to_owned(),
            model: "Jade".to_owned(),
            path: "usb:older".to_owned(),
            fingerprint: Some("a1b2c3d4".to_owned()),
            ..HwiDevice::default()
        }];

        let error = remember_hardware_scan(&state, older_epoch, 1, &mut older).unwrap_err();
        assert_eq!(error.code, "hardware_scan_superseded");

        let mut newer = older.clone();
        newer[0].path = "usb:newer".to_owned();
        remember_hardware_scan(&state, newer_epoch, 2, &mut newer).unwrap();
        assert!(recently_scanned_hardware_device(&state, &newer[0].capability).is_ok());
    }

    #[test]
    fn same_family_devices_keep_distinct_redeemable_capabilities() {
        let state = AppState::default();
        let mut devices = [
            HwiDevice {
                device_type: "bitbox02".into(),
                path: "private-bitbox-original-path".into(),
                ..HwiDevice::default()
            },
            HwiDevice {
                device_type: "bitbox02".into(),
                path: "private-bitbox-nova-path".into(),
                ..HwiDevice::default()
            },
        ];
        let epoch = forget_hardware_scan(&state).unwrap();
        remember_hardware_scan(&state, epoch, 8, &mut devices).unwrap();
        assert_ne!(devices[0].capability, devices[1].capability);
        for device in devices {
            assert_eq!(
                recently_scanned_hardware_device(&state, &device.capability)
                    .unwrap()
                    .path,
                device.path
            );
        }
    }

    #[test]
    fn duplicate_non_empty_paths_fail_closed_before_cache_or_ui() {
        let duplicate = HwiDevice {
            device_type: "jade".into(),
            path: "same-path".into(),
            ..HwiDevice::default()
        };
        let error = validate_discovered_devices(vec![duplicate.clone(), duplicate]).unwrap_err();
        assert_eq!(error.code, "hardware_ambiguous");
    }

    #[test]
    fn unapproved_hwi_devices_are_omitted_before_cache_or_ui() {
        for device_type in ["keepkey", "digitalbitbox"] {
            let devices = validate_discovered_devices(vec![HwiDevice {
                device_type: device_type.into(),
                model: device_type.into(),
                path: format!("{device_type}-path"),
                ..HwiDevice::default()
            }])
            .unwrap();
            assert!(devices.is_empty(), "{device_type}");
        }
    }

    #[test]
    fn an_unapproved_model_cannot_hide_an_approved_safe_3() {
        let devices = validate_discovered_devices_for_network(
            vec![
                HwiDevice {
                    device_type: "ledger".into(),
                    model: "ledger_nano_x".into(),
                    path: "ledger-path".into(),
                    fingerprint: Some("11223344".into()),
                    ..HwiDevice::default()
                },
                HwiDevice {
                    device_type: "trezor".into(),
                    model: "trezor_t3b1".into(),
                    path: "trezor-path".into(),
                    fingerprint: Some("a1b2c3d4".into()),
                    ..HwiDevice::default()
                },
            ],
            Network::Bitcoin,
        )
        .unwrap();

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].device_type, "trezor");
        assert_eq!(devices[0].model, "trezor_t3b1");
    }

    #[test]
    fn cancelled_policy_verification_cannot_append_saved_or_draft_evidence() {
        let hwi = HwiCli::for_test_program(PathBuf::from("/usr/bin/false"));
        for evidence_kind in ["saved", "draft"] {
            let operation = hwi.begin_interactive_operation().unwrap();
            let cancellation = thread::spawn(crate::hardware::cancel_hardware_operations_and_wait);
            let wait_started = Instant::now();
            while !operation.cancelled_for_test() && wait_started.elapsed() < Duration::from_secs(5)
            {
                thread::sleep(Duration::from_millis(10));
            }
            assert!(operation.cancelled_for_test(), "{evidence_kind}");

            let mut evidence = Vec::new();
            let error = complete_policy_verification_if_active(&operation, || {
                evidence.push(evidence_kind);
                Ok(())
            })
            .unwrap_err();
            assert_eq!(error.code, "hardware_cancelled", "{evidence_kind}");
            assert!(evidence.is_empty(), "{evidence_kind}");

            drop(operation);
            assert_eq!(cancellation.join().unwrap(), Ok(()), "{evidence_kind}");
        }
    }

    #[test]
    fn mainnet_discovery_accepts_exact_models_and_approved_family_records() {
        assert!(approved_hwi_model(Network::Testnet4, "trezor", ""));
        assert!(approved_hwi_model(
            Network::Bitcoin,
            "ledger",
            "ledger_nano_s_plus"
        ));
        assert!(approved_hwi_model(Network::Bitcoin, "trezor", "trezor_1"));
        assert!(approved_hwi_model(
            Network::Bitcoin,
            "trezor",
            "trezor_t2b1"
        ));
        assert!(approved_hwi_model(
            Network::Bitcoin,
            "trezor",
            "trezor_t3b1"
        ));
        assert!(approved_hwi_model(
            Network::Bitcoin,
            "trezor",
            "trezor_safe 3"
        ));
        assert!(approved_hwi_model(
            Network::Bitcoin,
            "bitbox02",
            "bitbox02_nova_btconly"
        ));
        assert!(approved_hwi_model(Network::Bitcoin, "coldcard", "coldcard"));
        assert!(approved_hwi_model(Network::Bitcoin, "jade", "jade"));
        for (device_type, model) in [
            ("ledger", "ledger_nano_x"),
            ("trezor", "trezor_safe_3"),
            ("trezor", "trezor_safe-3"),
            ("trezor", "trezor_safe 5"),
            ("trezor", "trezor_t3t1"),
            ("coldcard", "coldcard_q"),
            ("jade", "jade_plus"),
            ("bitbox02", "bitbox02_nova_multi"),
        ] {
            assert!(!approved_hwi_model(Network::Bitcoin, device_type, model));
        }
    }

    #[test]
    fn mainnet_wallet_admission_requires_matching_recent_live_hwi_identity() {
        let state = AppState::default();
        assert!(require_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "approved-xpub",
            singlesig_account_path(),
            Some("trezor")
        )
        .is_err());
        remember_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "approved-xpub",
            singlesig_account_path(),
            Some("trezor"),
        )
        .unwrap();
        assert!(require_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "approved-xpub",
            singlesig_account_path(),
            Some("trezor")
        )
        .is_ok());
        assert!(require_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "renderer-substituted-xpub",
            singlesig_account_path(),
            Some("trezor")
        )
        .is_err());
        forget_hardware_scan(&state).unwrap();
        assert!(require_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "approved-xpub",
            singlesig_account_path(),
            Some("trezor")
        )
        .is_ok());
        state.pending_hardware_admissions.lock().unwrap().clear();
        assert!(require_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "approved-xpub",
            singlesig_account_path(),
            Some("trezor")
        )
        .is_err());
    }

    #[test]
    fn saved_signer_lookup_scan_preserves_exact_multisig_admissions() {
        let state = AppState::default();
        for (fingerprint, xpub) in [("a1b2c3d4", "first-xpub"), ("deadbeef", "second-xpub")] {
            remember_hardware_admission_for_network(
                &state,
                Network::Bitcoin,
                fingerprint,
                xpub,
                crate::multisig::multisig_account_path(),
                Some("ledger"),
            )
            .unwrap();
        }

        forget_hardware_scan(&state).unwrap();

        for (fingerprint, xpub) in [("a1b2c3d4", "first-xpub"), ("deadbeef", "second-xpub")] {
            assert!(require_hardware_admission_for_network(
                &state,
                Network::Bitcoin,
                fingerprint,
                xpub,
                crate::multisig::multisig_account_path(),
                Some("ledger")
            )
            .is_ok());
        }
        assert!(require_hardware_admission_for_network(
            &state,
            Network::Bitcoin,
            "a1b2c3d4",
            "substituted-xpub",
            crate::multisig::multisig_account_path(),
            Some("ledger")
        )
        .is_err());
    }

    #[test]
    fn mainnet_recovery_requires_and_enriches_every_live_cosigner_admission() {
        use crate::multisig::{CosignerInput, CosignerSource};

        let state = AppState::default();
        let cosigners = ["first-xpub", "second-xpub"].map(|xpub| CosignerInput {
            id: xpub.to_owned(),
            label: "Signer".to_owned(),
            fingerprint: if xpub == "first-xpub" {
                "a1b2c3d4".to_owned()
            } else {
                "b1c2d3e4".to_owned()
            },
            xpub: xpub.to_owned(),
            derivation_path: multisig_account_path().to_owned(),
            source: CosignerSource::Manual,
            device_type: None,
        });
        assert!(
            reconcile_recovery_cosigners_for_network(&state, Network::Bitcoin, &cosigners).is_err()
        );
        for (cosigner, device_type) in cosigners.iter().zip(["trezor", "ledger"]) {
            remember_hardware_admission_for_network(
                &state,
                Network::Bitcoin,
                &cosigner.fingerprint,
                &cosigner.xpub,
                &cosigner.derivation_path,
                Some(device_type),
            )
            .unwrap();
        }
        let recovered =
            reconcile_recovery_cosigners_for_network(&state, Network::Bitcoin, &cosigners).unwrap();
        assert_eq!(recovered[0].source, CosignerSource::Usb);
        assert_eq!(recovered[0].device_type.as_deref(), Some("trezor"));
        assert_eq!(recovered[1].device_type.as_deref(), Some("ledger"));
        let rehearsal = reconcile_recovery_cosigners_for_network(
            &AppState::default(),
            Network::Testnet4,
            &cosigners,
        )
        .unwrap();
        assert_eq!(rehearsal[0].source, CosignerSource::Manual);
    }

    #[test]
    fn saved_health_check_selects_exact_jade_with_unlocked_other_devices() {
        let ledger = HwiDevice {
            fingerprint: Some("11111111".into()),
            device_type: "ledger".into(),
            path: "usb-ledger".into(),
            ..HwiDevice::default()
        };
        let bitbox = HwiDevice {
            fingerprint: Some("22222222".into()),
            device_type: "bitbox02".into(),
            path: "usb-bitbox".into(),
            ..HwiDevice::default()
        };
        let jade = HwiDevice {
            fingerprint: Some("a1b2c3d4".into()),
            device_type: "jade".into(),
            path: "usb-jade".into(),
            ..HwiDevice::default()
        };

        assert_eq!(
            saved_hwi_device(vec![ledger, bitbox, jade.clone()], "JADE", "A1B2C3D4").unwrap(),
            Some(jade)
        );
    }

    #[test]
    fn saved_health_check_does_not_substitute_another_jade() {
        let other_jade = HwiDevice {
            fingerprint: Some("11111111".into()),
            device_type: "jade".into(),
            path: "usb-other-jade".into(),
            ..HwiDevice::default()
        };

        assert!(saved_hwi_device(vec![other_jade], "jade", "a1b2c3d4")
            .unwrap()
            .is_none());
    }

    #[test]
    fn saved_device_can_redeem_one_locked_same_type_hint_for_live_binding() {
        let locked_jade = HwiDevice {
            fingerprint: None,
            device_type: "jade".into(),
            path: "usb-locked-jade".into(),
            ..HwiDevice::default()
        };
        assert_eq!(
            saved_hwi_device(vec![locked_jade.clone()], "jade", "a1b2c3d4").unwrap(),
            Some(locked_jade)
        );
    }

    #[test]
    fn saved_device_prefers_exact_identity_over_locked_same_type_hint() {
        let exact = HwiDevice {
            fingerprint: Some("a1b2c3d4".into()),
            device_type: "jade".into(),
            path: "usb-ready-jade".into(),
            ..HwiDevice::default()
        };
        let locked = HwiDevice {
            fingerprint: None,
            device_type: "jade".into(),
            path: "usb-locked-jade".into(),
            ..HwiDevice::default()
        };
        assert_eq!(
            saved_hwi_device(vec![locked, exact.clone()], "jade", "a1b2c3d4").unwrap(),
            Some(exact)
        );
    }

    #[test]
    fn saved_device_rejects_ambiguous_locked_same_type_hints() {
        let locked = |path: &str| HwiDevice {
            fingerprint: None,
            device_type: "jade".into(),
            path: path.into(),
            ..HwiDevice::default()
        };
        let error = saved_hwi_device(
            vec![locked("usb-locked-jade-1"), locked("usb-locked-jade-2")],
            "jade",
            "a1b2c3d4",
        )
        .unwrap_err();
        assert_eq!(error.code, "hardware_ambiguous");
    }

    #[test]
    fn saved_device_redeems_one_passive_path_for_every_supported_family() {
        for device_type in SUPPORTED_HWI_DEVICE_TYPES {
            let locked = HwiDevice {
                fingerprint: None,
                device_type: (*device_type).into(),
                path: format!("usb-{device_type}"),
                ..HwiDevice::default()
            };
            assert_eq!(
                saved_hwi_device(vec![locked.clone()], device_type, "a1b2c3d4").unwrap(),
                Some(locked)
            );
        }
    }
}
#[tauri::command]
pub async fn hardware_prompt_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
) -> ApiResult<HardwarePinPromptDto> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let selected_path = device.path.clone();
    let pending = tauri::async_runtime::spawn_blocking(move || {
        if !hardware_pin_prompt_required(&device) {
            return Err(api_error(
                "invalid_hardware_request",
                "This device does not need Groot's PIN-matrix flow.",
            ));
        }
        let output = match hwi.prompt_pin(&device.device_type, &device.path) {
            Ok(output) => output,
            // Passive inventory deliberately does not open Trezor to learn its
            // lock state. Probe only the selected exact path; HWI's typed
            // already-unlocked result means the caller can continue directly.
            Err(HardwareError::CommandFailed(Some(-11))) if device.passive => return Ok(None),
            Err(error) => return Err(hardware_api_error(error)),
        };
        let response: HwiSuccess = serde_json::from_slice(&output).map_err(internal)?;
        if response.success != Some(true) {
            return Err(missing_hwi_value(
                response.code,
                "The hardware signer did not start its PIN matrix.",
            ));
        }
        Ok(Some(PendingHardwarePin {
            device_type: device.device_type,
            device_path: device.path,
            created_at: Instant::now(),
        }))
    })
    .await
    .map_err(internal)??;
    let Some(pending) = pending else {
        state
            .pending_hardware_pins
            .lock()
            .map_err(internal)?
            .clear();
        remember_unlocked_hardware_path(&state, &selected_path)?;
        return Ok(HardwarePinPromptDto {
            challenge_id: None,
            pin_required: false,
        });
    };
    let challenge_id = Uuid::new_v4().to_string();
    let mut challenges = state.pending_hardware_pins.lock().map_err(internal)?;
    challenges.clear();
    challenges.insert(challenge_id.clone(), pending);
    Ok(HardwarePinPromptDto {
        challenge_id: Some(challenge_id),
        pin_required: true,
    })
}

#[tauri::command]
pub async fn hardware_send_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    challenge_id: String,
    pin_positions: String,
) -> ApiResult<()> {
    let pin_positions = Zeroizing::new(pin_positions);
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    let valid = !pin_positions.is_empty()
        && pin_positions.len() <= MAX_HARDWARE_PIN_POSITIONS
        && pin_positions
            .bytes()
            .all(|position| matches!(position, b'1'..=b'9'));
    if !valid {
        return Err(api_error(
            "invalid_hardware_request",
            "Enter only PIN-matrix positions 1 through 9.",
        ));
    }
    let pin = Zeroizing::new(pin_positions.as_bytes().to_vec());
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
    let unlocked_path = pending.device_path.clone();
    let hwi = hwi_cli(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = hwi
            .send_pin(&pending.device_type, &pending.device_path, pin.as_slice())
            .map_err(hardware_api_error)?;
        let response: HwiSuccess = serde_json::from_slice(&output).map_err(internal)?;
        if response.success != Some(true) {
            return Err(hardware_pin_response_error(response));
        }
        Ok(())
    })
    .await
    .map_err(internal)??;
    remember_unlocked_hardware_path(&state, &unlocked_path)
}

fn hardware_pin_response_error(response: HwiSuccess) -> ApiError {
    let detail = response.error.unwrap_or_default().to_ascii_lowercase();
    // HWI 3.2.0 maps Trezor protocol failures to its generic -13 code. Only
    // the explicit PinInvalid failure is evidence that the entered matrix was
    // rejected. A stale client session, another wallet app owning USB, or a
    // disconnect must never be presented as a wrong PIN.
    if response.code == Some(-13)
        && detail.contains("pin")
        && (detail.contains("invalid") || detail.contains("wrong"))
    {
        return api_error(
            "hardware_pin_rejected",
            "Trezor did not accept that matrix entry. Check the remaining attempts on the device, then start a new matrix and tap positions—not PIN digits.",
        );
    }
    match response.code {
        Some(-3) => api_error(
            "hardware_unavailable",
            "The Trezor connection was lost. Reconnect it, quit other wallet apps, and start a new Groot PIN matrix.",
        ),
        Some(-11) => api_error(
            "hardware_unavailable",
            "Trezor was unlocked in another client session. Quit other wallet apps, then scan and unlock it inside Groot.",
        ),
        Some(-14) => api_error(
            "hardware_cancelled",
            "The Trezor unlock was cancelled. Start a new PIN matrix when you are ready.",
        ),
        Some(-15) => api_error(
            "hardware_busy",
            "Trezor is busy in another wallet app. Quit that app, then start a new Groot PIN matrix.",
        ),
        _ => api_error(
            "hardware_unavailable",
            "Trezor could not complete this unlock session. Quit other wallet apps, reconnect it, and start a new Groot PIN matrix.",
        ),
    }
}

// Setup has no wallet database yet. A live public-key proof must not read or
// persist health against whichever unrelated wallet happens to be selected.
fn check_draft_cosigner(
    hwi: &HwiCli,
    device: &HwiDevice,
    cosigner: &CosignerInput,
) -> ApiResult<CosignerHealthDto> {
    cosigner.parse_for_validation().map_err(policy_api_error)?;
    let operation = hwi
        .begin_interactive_operation()
        .map_err(hardware_api_error)?;
    prove_live_cosigner_identity(hwi, &operation, device, cosigner)?;
    operation
        .complete_if_active(|| {
            Ok(CosignerHealthDto {
                status: "healthy",
                checked_at: now().to_string(),
                summary: "Signer matches this wallet.".to_owned(),
            })
        })
        .map_err(hardware_api_error)?
}

#[tauri::command]
pub async fn hardware_identify_saved_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
) -> ApiResult<HardwareIdentityDto> {
    let (initiating_wallet_id, _activity) = begin_unlocked_user_operation(&app, &state)?;
    let selected = selected_profile(&app)?;
    if selected.id != initiating_wallet_id {
        return Err(api_error(
            "wallet_selection_changed",
            "The selected wallet changed during device identification.",
        ));
    }
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let hwi = hwi_cli(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let native_state = app.state::<AppState>();
        let _wallet_operation = operation_guard(&native_state)?;
        if selected_profile(&app)?.id != selected.id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed during device identification.",
            ));
        }
        let operation = hwi
            .begin_interactive_operation()
            .map_err(hardware_api_error)?;
        let (identity, label) = match selected.kind {
            WalletKind::Multisig => {
                let saved = read_multisig_metadata(&app)?;
                let candidates = saved_cosigner_candidates_for_device(&saved.cosigners, &device)?;
                let identity = prove_live_cosigner_identity_for_candidates(
                    &hwi,
                    &operation,
                    &device,
                    &candidates,
                )?;
                let label = candidates
                    .iter()
                    .find(|candidate| {
                        candidate
                            .fingerprint
                            .eq_ignore_ascii_case(&identity.fingerprint)
                    })
                    .map(|candidate| candidate.label.clone())
                    .ok_or_else(unknown_hardware_signer)?;
                (identity, label)
            }
            WalletKind::WatchOnly => {
                let saved = read_external_signer_metadata(&app)?.signer;
                let identity =
                    prove_live_external_signer_identity(&hwi, &operation, &device, &saved)?;
                (identity, saved.label)
            }
            WalletKind::SingleKey => {
                return Err(api_error(
                    "wrong_wallet_kind",
                    "The selected wallet has no saved hardware signer.",
                ));
            }
        };
        operation
            .complete_if_active(|| {
                if selected_profile(&app)?.id != selected.id {
                    return Err(api_error(
                        "wallet_selection_changed",
                        "The selected wallet changed during device identification.",
                    ));
                }
                Ok(HardwareIdentityDto {
                    fingerprint: identity.fingerprint,
                    label,
                })
            })
            .map_err(hardware_api_error)?
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn hardware_check_cosigner(
    app: AppHandle,
    state: State<'_, AppState>,
    cosigner: CosignerInput,
    device_id: String,
    draft: Option<bool>,
) -> ApiResult<CosignerHealthDto> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    cosigner.parse_for_validation().map_err(policy_api_error)?;
    if draft.unwrap_or(false) {
        let selection = load_registry(&app)?.selected_wallet_id;
        let hwi = hwi_cli(&app)?;
        let device = recently_scanned_hardware_device(&state, &device_id)?;
        return tauri::async_runtime::spawn_blocking(move || {
            let native_state = app.state::<AppState>();
            let _wallet_operation = operation_guard(&native_state)?;
            if load_registry(&app)?.selected_wallet_id != selection {
                return Err(api_error(
                    "wallet_selection_changed",
                    "The selected wallet changed during the signer check.",
                ));
            }
            check_draft_cosigner(&hwi, &device, &cosigner)
        })
        .await
        .map_err(internal)?;
    }
    let selected = selected_profile(&app)?;
    let authoritative = if selected.kind == WalletKind::Multisig {
        read_multisig_metadata(&app)?
            .cosigners
            .into_iter()
            .find(|saved| {
                saved
                    .fingerprint
                    .eq_ignore_ascii_case(&cosigner.fingerprint)
            })
            .filter(|saved| same_cosigner_identity(saved, &cosigner))
    } else {
        None
    };
    let expected = authoritative.clone().unwrap_or(cosigner);
    let checked_at = now().to_string();
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let app_for_check = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let native_state = app_for_check.state::<AppState>();
        let _wallet_operation = operation_guard(&native_state)?;
        let current = selected_profile(&app_for_check)?;
        if current.id != selected.id
            || (authoritative.is_some() && current.kind != WalletKind::Multisig)
        {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed during the signer check.",
            ));
        }
        let operation = hwi
            .begin_interactive_operation()
            .map_err(hardware_api_error)?;
        let proof = prove_live_cosigner_identity(&hwi, &operation, &device, &expected);
        if let Err(error) = proof {
            if authoritative.is_some() && selected_profile(&app_for_check)?.id == selected.id {
                let record = HardwareHealthCheckRecordDto {
                    signer_fingerprint: expected.fingerprint.to_ascii_lowercase(),
                    status: "attention".to_owned(),
                    checked_at,
                    summary: error.message.clone(),
                };
                upsert_hardware_health_check(&open_multisig_db(&app_for_check)?, &record)?;
            }
            return Err(error);
        }
        let result = CosignerHealthDto {
            status: "healthy",
            checked_at: checked_at.clone(),
            summary: "Signer matches this wallet.".to_owned(),
        };
        if authoritative.is_some() {
            let current = selected_profile(&app_for_check)?;
            if current.id != selected.id || current.kind != WalletKind::Multisig {
                return Err(api_error(
                    "wallet_selection_changed",
                    "The selected wallet changed during the signer check.",
                ));
            }
            let record = HardwareHealthCheckRecordDto {
                signer_fingerprint: expected.fingerprint.to_ascii_lowercase(),
                status: result.status.to_owned(),
                checked_at,
                summary: result.summary.clone(),
            };
            upsert_hardware_health_check(&open_multisig_db(&app_for_check)?, &record)?;
        }
        Ok(result)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn hardware_check_external_signer(
    app: AppHandle,
    state: State<'_, AppState>,
    signer: ExternalSignerInput,
    device_id: String,
) -> ApiResult<CosignerHealthDto> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    signer.validate().map_err(external_signer_api_error)?;
    let selected = selected_profile(&app)?;
    if selected.kind != WalletKind::WatchOnly {
        return Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not use an external hardware signer.",
        ));
    }
    let authoritative = read_external_signer_metadata(&app)?.signer;
    if authoritative != signer {
        return Err(unknown_hardware_signer());
    }
    let checked_at = now().to_string();
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let app_for_check = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let native_state = app_for_check.state::<AppState>();
        let _wallet_operation = operation_guard(&native_state)?;
        let current = selected_profile(&app_for_check)?;
        if current.id != selected.id || current.kind != WalletKind::WatchOnly {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed during the signer check.",
            ));
        }
        let operation = hwi
            .begin_interactive_operation()
            .map_err(hardware_api_error)?;
        let proof = prove_live_external_signer_identity(&hwi, &operation, &device, &authoritative);
        if let Err(error) = proof {
            if selected_profile(&app_for_check)?.id == selected.id {
                let record = HardwareHealthCheckRecordDto {
                    signer_fingerprint: authoritative.fingerprint.to_ascii_lowercase(),
                    status: "attention".to_owned(),
                    checked_at,
                    summary: error.message.clone(),
                };
                upsert_hardware_health_check(&open_db(&app_for_check)?, &record)?;
            }
            return Err(error);
        }
        let result = CosignerHealthDto {
            status: "healthy",
            checked_at: checked_at.clone(),
            summary: "Signer matches this wallet.".to_owned(),
        };
        let current = selected_profile(&app_for_check)?;
        if current.id != selected.id || current.kind != WalletKind::WatchOnly {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed during the signer check.",
            ));
        }
        let record = HardwareHealthCheckRecordDto {
            signer_fingerprint: authoritative.fingerprint.to_ascii_lowercase(),
            status: result.status.to_owned(),
            checked_at,
            summary: result.summary.clone(),
        };
        upsert_hardware_health_check(&open_db(&app_for_check)?, &record)?;
        Ok(result)
    })
    .await
    .map_err(internal)?
}

fn open_hardware_health_db(app: &AppHandle) -> ApiResult<Connection> {
    match selected_profile(app)?.kind {
        WalletKind::Multisig => open_multisig_db(app),
        WalletKind::WatchOnly => open_db(app),
        WalletKind::SingleKey => Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not use an external hardware signer.",
        )),
    }
}

fn upsert_hardware_health_check(
    db: &Connection,
    record: &HardwareHealthCheckRecordDto,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO groot_hardware_health_checks(signer_fingerprint, status, checked_at, summary) VALUES(?1, ?2, ?3, ?4)\
         ON CONFLICT(signer_fingerprint) DO UPDATE SET status = excluded.status, checked_at = excluded.checked_at, summary = excluded.summary",
        params![
            record.signer_fingerprint,
            record.status,
            record.checked_at,
            record.summary
        ],
    )
    .map_err(internal)?;
    Ok(())
}

fn read_hardware_health_checks(db: &Connection) -> ApiResult<Vec<HardwareHealthCheckRecordDto>> {
    let mut statement = db
        .prepare(
            "SELECT signer_fingerprint, status, checked_at, summary FROM groot_hardware_health_checks ORDER BY signer_fingerprint",
        )
        .map_err(internal)?;
    let records = statement
        .query_map([], |row| {
            Ok(HardwareHealthCheckRecordDto {
                signer_fingerprint: row.get(0)?,
                status: row.get(1)?,
                checked_at: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    Ok(records)
}

#[tauri::command]
pub async fn hardware_health_checks(
    app: AppHandle,
) -> ApiResult<Vec<HardwareHealthCheckRecordDto>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let wallet_id = require_unlocked(&app, &state)?;
        let _persisted_guard = foreground_persisted_read_guard(&state, wallet_id)?;
        let persisted_read = _persisted_guard.is_some();
        let _operation = if persisted_read {
            None
        } else {
            Some(operation_guard(&state)?)
        };
        let profile = selected_profile(&app)?;
        let db = if persisted_read {
            open_selected_db_for_persisted_read(&app, profile.kind == WalletKind::Multisig)?
        } else {
            open_hardware_health_db(&app)?
        };
        read_hardware_health_checks(&db)
    })
    .await
    .map_err(internal)?
}

fn parse_hwi_account_xpub(output: &[u8], device_type: &str) -> ApiResult<String> {
    let value: serde_json::Value = serde_json::from_slice(output).map_err(internal)?;
    let xpub = value
        .get("xpub")
        .and_then(serde_json::Value::as_str)
        .filter(|xpub| !xpub.trim().is_empty())
        .ok_or_else(|| {
            missing_hardware_xpub(
                device_type,
                "the requested account path",
                value.get("code").and_then(serde_json::Value::as_i64),
                value.get("error").and_then(serde_json::Value::as_str),
                "The device did not return its public account key.",
            )
        })?;
    let parsed = Xpub::from_str(xpub)
        .map_err(|_| api_error("invalid_descriptor", "HWI returned an invalid account key."))?;
    if parsed.network != parameters().extended_key_network {
        return Err(api_error(
            "wrong_network",
            "The hardware signer returned an account key for the wrong network.",
        ));
    }
    Ok(xpub.to_owned())
}

fn parse_hwi_account_keypool(
    output: &[u8],
    expected_path: &str,
    device_type: &str,
) -> ApiResult<(String, String)> {
    let value: serde_json::Value = serde_json::from_slice(output).map_err(internal)?;
    let descriptor = value
        .as_array()
        .and_then(|entries| entries.first())
        .and_then(|entry| entry.get("desc"))
        .and_then(serde_json::Value::as_str)
        .filter(|descriptor| !descriptor.trim().is_empty())
        .ok_or_else(|| {
            missing_hardware_xpub(
                device_type,
                expected_path,
                value.get("code").and_then(serde_json::Value::as_i64),
                value.get("error").and_then(serde_json::Value::as_str),
                "The device did not return its account descriptor.",
            )
        })?;
    let canonical = Descriptor::<DescriptorPublicKey>::from_str(descriptor)
        .map_err(|_| api_error("invalid_descriptor", "HWI returned an invalid descriptor."))?
        .to_string();
    let origin_start = canonical.find('[').ok_or_else(|| {
        api_error(
            "invalid_descriptor",
            "HWI returned a descriptor without a key origin.",
        )
    })? + 1;
    let origin_end = canonical[origin_start..]
        .find(']')
        .map(|offset| origin_start + offset)
        .ok_or_else(|| api_error("invalid_descriptor", "HWI returned an invalid key origin."))?;
    let (fingerprint, derivation) = canonical[origin_start..origin_end]
        .split_once('/')
        .ok_or_else(|| api_error("invalid_descriptor", "HWI returned an invalid key origin."))?;
    let derivation = format!("m/{}", derivation.replace(['h', 'H'], "'"));
    if derivation != expected_path {
        return Err(api_error(
            "invalid_derivation_path",
            "The hardware signer returned a different account path than Groot requested.",
        ));
    }
    Fingerprint::from_str(fingerprint).map_err(|_| {
        api_error(
            "invalid_fingerprint",
            "HWI returned an invalid fingerprint.",
        )
    })?;
    let key_tail = &canonical[origin_end + 1..];
    let xpub_end = key_tail.find('/').ok_or_else(|| {
        api_error(
            "invalid_descriptor",
            "HWI returned a descriptor without an account key.",
        )
    })?;
    let xpub = &key_tail[..xpub_end];
    let parsed = Xpub::from_str(xpub)
        .map_err(|_| api_error("invalid_descriptor", "HWI returned an invalid account key."))?;
    if parsed.network != parameters().extended_key_network {
        return Err(api_error(
            "wrong_network",
            "The hardware signer returned an account key for the wrong network.",
        ));
    }
    Ok((fingerprint.to_ascii_lowercase(), xpub.to_owned()))
}

pub(super) fn prove_live_cosigner_identity(
    hwi: &HwiCli,
    operation: &crate::hardware::HardwareOperation,
    device: &HwiDevice,
    expected: &CosignerInput,
) -> ApiResult<VerifiedHardwareIdentity> {
    prove_live_cosigner_identity_for_candidates(
        hwi,
        operation,
        device,
        std::slice::from_ref(expected),
    )
}

pub(super) fn prove_live_cosigner_identity_for_candidates(
    hwi: &HwiCli,
    operation: &crate::hardware::HardwareOperation,
    device: &HwiDevice,
    expected: &[CosignerInput],
) -> ApiResult<VerifiedHardwareIdentity> {
    let first = expected.first().ok_or_else(unknown_hardware_signer)?;
    require_matching_policy_device_type(first.device_type.as_deref(), &device.device_type)?;
    if expected.iter().any(|signer| {
        signer.derivation_path != first.derivation_path
            || signer
                .device_type
                .as_deref()
                .is_some_and(|device_type| !device_type.eq_ignore_ascii_case(&device.device_type))
    }) {
        return Err(api_error(
            "invalid_hardware_request",
            "The saved signer candidates do not share one hardware account boundary.",
        ));
    }

    // HWI's Jade login is initiated while opening an exact-path public-key
    // request. Discovery can return Jade (and some other interactive families)
    // before it has a fingerprint, so use the same getxpub operation that has
    // completed physical certification to unlock and bind that signer. The
    // complete live account key selects exactly one saved full identity; no
    // fingerprint supplied by the renderer is trusted.
    if device.fingerprint.is_none() && supports_locked_interactive_identity(&device.device_type) {
        let output = hwi
            .account_xpub_in_operation(
                operation,
                &device.device_type,
                &device.path,
                &first.derivation_path,
            )
            .map_err(|error| {
                hardware_xpub_api_error(error, &device.device_type, &first.derivation_path)
            })?;
        let xpub = parse_hwi_account_xpub(&output, &device.device_type)?;
        let matching = expected
            .iter()
            .filter(|signer| signer.xpub == xpub)
            .collect::<Vec<_>>();
        if matching.len() != 1 {
            return Err(unknown_hardware_signer());
        }
        return Ok(VerifiedHardwareIdentity {
            device_type: device.device_type.clone(),
            fingerprint: matching[0].fingerprint.to_ascii_lowercase(),
        });
    }

    let output = hwi
        .account_keypool_in_operation(
            operation,
            &device.device_type,
            &device.path,
            &first.derivation_path,
        )
        .map_err(|error| {
            hardware_xpub_api_error(error, &device.device_type, &first.derivation_path)
        })?;
    let (fingerprint, xpub) =
        parse_hwi_account_keypool(&output, &first.derivation_path, &device.device_type)?;
    if !expected
        .iter()
        .any(|signer| fingerprint.eq_ignore_ascii_case(&signer.fingerprint) && xpub == signer.xpub)
    {
        return Err(unknown_hardware_signer());
    }
    Ok(VerifiedHardwareIdentity {
        device_type: device.device_type.clone(),
        fingerprint,
    })
}

fn prove_live_external_signer_identity(
    hwi: &HwiCli,
    operation: &crate::hardware::HardwareOperation,
    device: &HwiDevice,
    expected: &ExternalSignerInput,
) -> ApiResult<VerifiedHardwareIdentity> {
    let expected_device_type = expected.device_type.as_deref().ok_or_else(|| {
        api_error(
            "invalid_hardware_request",
            "This signer has no saved interactive USB device type.",
        )
    })?;
    require_matching_policy_device_type(Some(expected_device_type), &device.device_type)?;
    if device.fingerprint.is_none() && supports_locked_interactive_identity(&device.device_type) {
        let output = hwi
            .account_xpub_in_operation(
                operation,
                &device.device_type,
                &device.path,
                &expected.derivation_path,
            )
            .map_err(|error| {
                hardware_xpub_api_error(error, &device.device_type, &expected.derivation_path)
            })?;
        let xpub = parse_hwi_account_xpub(&output, &device.device_type)?;
        if xpub != expected.xpub {
            return Err(unknown_hardware_signer());
        }
        return Ok(VerifiedHardwareIdentity {
            device_type: device.device_type.clone(),
            fingerprint: expected.fingerprint.to_ascii_lowercase(),
        });
    }
    let output = hwi
        .account_keypool_in_operation(
            operation,
            &device.device_type,
            &device.path,
            &expected.derivation_path,
        )
        .map_err(|error| {
            hardware_xpub_api_error(error, &device.device_type, &expected.derivation_path)
        })?;
    let (fingerprint, xpub) =
        parse_hwi_account_keypool(&output, &expected.derivation_path, &device.device_type)?;
    if !fingerprint.eq_ignore_ascii_case(&expected.fingerprint) || xpub != expected.xpub {
        return Err(unknown_hardware_signer());
    }
    Ok(VerifiedHardwareIdentity {
        device_type: device.device_type.clone(),
        fingerprint,
    })
}

fn read_hardware_account_identity(
    hwi: &HwiCli,
    device: &HwiDevice,
    derivation_path: &str,
    compare_with_saved_identity: bool,
) -> ApiResult<(String, String)> {
    // Reading an account identity can require a person to unlock or approve on
    // the device. Keep discovery bounded separately, but give this interactive
    // step the same user-review budget as display and signing operations.
    let operation = hwi
        .begin_interactive_operation()
        .map_err(hardware_api_error)?;
    if compare_with_saved_identity {
        let fingerprint = device
            .fingerprint
            .clone()
            .ok_or_else(|| missing_hardware_fingerprint(&device.device_type))?;
        Fingerprint::from_str(&fingerprint).map_err(|_| {
            api_error(
                "invalid_fingerprint",
                "HWI returned an invalid fingerprint.",
            )
        })?;
        let output = hwi
            .account_xpub_in_operation(
                &operation,
                &device.device_type,
                &device.path,
                derivation_path,
            )
            .map_err(|error| {
                hardware_xpub_api_error(error, &device.device_type, derivation_path)
            })?;
        return Ok((
            fingerprint.to_ascii_lowercase(),
            parse_hwi_account_xpub(&output, &device.device_type)?,
        ));
    }

    let is_bitbox_singlesig = device.device_type.eq_ignore_ascii_case("bitbox02")
        && derivation_path == singlesig_account_path();
    if is_bitbox_singlesig {
        return read_bitbox_account_identity(hwi, &operation, device, derivation_path);
    }

    // Initial import must bind the fingerprint and account key returned by the
    // same open HWI client. A cached enumerate fingerprint plus a later xpub
    // would introduce a device-swap window before Groot has a saved identity.
    let output = hwi
        .account_keypool_in_operation(
            &operation,
            &device.device_type,
            &device.path,
            derivation_path,
        )
        .map_err(|error| hardware_xpub_api_error(error, &device.device_type, derivation_path))?;
    parse_hwi_account_keypool(&output, derivation_path, &device.device_type)
}

fn read_bitbox_account_identity(
    hwi: &HwiCli,
    operation: &crate::hardware::HardwareOperation,
    device: &HwiDevice,
    derivation_path: &str,
) -> ApiResult<(String, String)> {
    // Keep every retry bound to the opaque path selected from the latest scan.
    // A type-only HWI command performs aggregate enumeration internally and
    // can open an unselected BitBox or another connected signer.
    for attempt in 0..BITBOX_ACCOUNT_KEY_ATTEMPTS {
        let output = match hwi.account_keypool_in_operation(
            operation,
            &device.device_type,
            &device.path,
            derivation_path,
        ) {
            Ok(output) => output,
            Err(error)
                if attempt + 1 < BITBOX_ACCOUNT_KEY_ATTEMPTS
                    && matches!(
                        error,
                        HardwareError::CommandFailed(Some(code))
                            if bitbox_account_key_code_is_retryable(code)
                    ) =>
            {
                std::thread::sleep(BITBOX_ACCOUNT_KEY_RETRY_DELAY);
                continue;
            }
            Err(error) => {
                return Err(hardware_xpub_api_error(
                    error,
                    &device.device_type,
                    derivation_path,
                ));
            }
        };
        let retryable_response = bitbox_account_key_response_is_retryable(&output);
        match parse_hwi_account_keypool(&output, derivation_path, &device.device_type) {
            Ok(identity) => return Ok(identity),
            Err(_) if retryable_response && attempt + 1 < BITBOX_ACCOUNT_KEY_ATTEMPTS => {
                // HWI closes its discovery client before this exact-path
                // selected-device command. Nova can briefly report the same HID
                // path as busy/not ready during that handoff. Retry
                // only those typed transient results; cancellation, identity,
                // path, network, and descriptor failures remain terminal.
                std::thread::sleep(BITBOX_ACCOUNT_KEY_RETRY_DELAY);
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("the bounded BitBox account-key loop always returns")
}

fn bitbox_account_key_response_is_retryable(output: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(output) else {
        return false;
    };
    let pairing_required = value
        .get("error")
        .and_then(serde_json::Value::as_str)
        .map(str::to_ascii_lowercase)
        .is_some_and(|message| {
            message.contains("device not paired yet")
                || message.contains("pair using the bitboxapp")
        });
    !pairing_required
        && value
            .get("code")
            .and_then(serde_json::Value::as_i64)
            .is_some_and(bitbox_account_key_code_is_retryable)
}

fn bitbox_account_key_code_is_retryable(code: i64) -> bool {
    // HWI 3.2.0's BitBox adapter maps the vendor's non-granular generic
    // reconnect failure to UnavailableAction (-9). Initial import requests
    // only Groot's fixed BIP84/BIP48 paths, so retry that overloaded result
    // only here, on the same selected capability. Parsing and complete live
    // identity binding remain mandatory before any result is accepted.
    matches!(code, -3 | -9 | -12 | -15)
}

#[cfg(test)]
fn verify_cosigner_identity(expected: &CosignerInput, connected: &CosignerInput) -> ApiResult<()> {
    let invalid_xpub = |_| {
        api_error(
            "invalid_descriptor",
            "The saved signer account key is invalid.",
        )
    };
    let expected_xpub = Xpub::from_str(expected.xpub.trim()).map_err(invalid_xpub)?;
    let connected_xpub = Xpub::from_str(connected.xpub.trim()).map_err(invalid_xpub)?;
    if !expected
        .fingerprint
        .eq_ignore_ascii_case(&connected.fingerprint)
        || expected.derivation_path != connected.derivation_path
        || expected_xpub != connected_xpub
    {
        return Err(api_error(
            "unknown_signer",
            "The connected device does not hold this signer’s saved BIP48 account key.",
        ));
    }
    Ok(())
}

#[cfg(test)]
fn verify_external_signer_identity(
    expected: &ExternalSignerInput,
    connected: &ExternalSignerInput,
) -> ApiResult<()> {
    let invalid_xpub = |_| {
        api_error(
            "invalid_descriptor",
            "The saved signer account key is invalid.",
        )
    };
    let expected_xpub = Xpub::from_str(expected.xpub.trim()).map_err(invalid_xpub)?;
    let connected_xpub = Xpub::from_str(connected.xpub.trim()).map_err(invalid_xpub)?;
    if !expected
        .fingerprint
        .eq_ignore_ascii_case(&connected.fingerprint)
        || expected.derivation_path != connected.derivation_path
        || expected_xpub != connected_xpub
    {
        return Err(api_error(
            "unknown_signer",
            "The connected device does not hold this signer’s saved BIP84 account key.",
        ));
    }
    Ok(())
}

fn read_hardware_cosigner(
    hwi: &HwiCli,
    device: HwiDevice,
    label: &str,
    allow_empty_passphrase: bool,
    compare_with_saved_identity: bool,
) -> ApiResult<crate::multisig::CosignerInput> {
    require_explicit_standard_wallet_selection(&device, allow_empty_passphrase)?;
    let (fingerprint, xpub) = read_hardware_account_identity(
        hwi,
        &device,
        crate::multisig::multisig_account_path(),
        compare_with_saved_identity,
    )?;
    let input = crate::multisig::CosignerInput {
        id: Uuid::new_v4().to_string(),
        label: label.to_owned(),
        fingerprint: fingerprint.to_ascii_lowercase(),
        xpub,
        derivation_path: crate::multisig::multisig_account_path().to_owned(),
        source: crate::multisig::CosignerSource::Usb,
        device_type: Some(device.device_type),
    };
    input.parse_for_validation().map_err(policy_api_error)?;
    Ok(input)
}

#[tauri::command]
pub async fn hardware_import_cosigner(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    label: String,
    allow_empty_passphrase: Option<bool>,
) -> ApiResult<crate::multisig::CosignerInput> {
    let label = normalize_label(&label)?;
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let input = tauri::async_runtime::spawn_blocking(move || {
        read_hardware_cosigner(
            &hwi,
            device,
            &label,
            allow_empty_passphrase.unwrap_or(false),
            false,
        )
    })
    .await
    .map_err(internal)??;
    remember_mainnet_hardware_admission(
        &state,
        &input.fingerprint,
        &input.xpub,
        &input.derivation_path,
        input.device_type.as_deref(),
    )?;
    Ok(input)
}

#[tauri::command]
pub fn external_signer_parse_import(
    encoded: String,
    label: String,
    source: SignerSource,
) -> ApiResult<ExternalSignerInput> {
    if encoded.len() > external_signer::MAX_IMPORT_BYTES {
        return Err(external_signer_api_error(
            external_signer::ExternalSignerError::TooLarge,
        ));
    }
    validate_external_signer_import_network(&encoded)?;
    external_signer::parse_import(&encoded, &label, source).map_err(external_signer_api_error)
}

pub(crate) fn validate_external_signer_import_network(encoded: &str) -> ApiResult<()> {
    let trimmed = encoded.trim();
    if !trimmed.starts_with('{') {
        return Ok(());
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return Ok(());
    };
    let is_groot_backup = value.get("version").and_then(|value| value.as_u64()) == Some(1)
        && value.get("descriptor").is_some()
        && value.get("network").is_some();
    if !is_groot_backup {
        return Ok(());
    }
    if value.get("network").and_then(|value| value.as_str()) == Some(network_name()) {
        Ok(())
    } else {
        Err(api_error(
            "wrong_network",
            "This Groot signer backup belongs to a different Bitcoin network.",
        ))
    }
}

#[tauri::command]
pub async fn hardware_import_external_signer(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    label: String,
    allow_empty_passphrase: Option<bool>,
) -> ApiResult<ExternalSignerInput> {
    let label = normalize_label(&label)?;
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let input = tauri::async_runtime::spawn_blocking(move || {
        read_hardware_external_signer(
            &hwi,
            device,
            &label,
            allow_empty_passphrase.unwrap_or(false),
            false,
        )
    })
    .await
    .map_err(internal)??;
    remember_mainnet_hardware_admission(
        &state,
        &input.fingerprint,
        &input.xpub,
        &input.derivation_path,
        input.device_type.as_deref(),
    )?;
    Ok(input)
}

fn read_hardware_external_signer(
    hwi: &HwiCli,
    device: HwiDevice,
    label: &str,
    allow_empty_passphrase: bool,
    compare_with_saved_identity: bool,
) -> ApiResult<ExternalSignerInput> {
    require_explicit_standard_wallet_selection(&device, allow_empty_passphrase)?;
    let (fingerprint, xpub) = read_hardware_account_identity(
        hwi,
        &device,
        singlesig_account_path(),
        compare_with_saved_identity,
    )?;
    let input = ExternalSignerInput {
        label: label.to_owned(),
        fingerprint: fingerprint.to_ascii_lowercase(),
        xpub,
        derivation_path: singlesig_account_path().to_owned(),
        source: SignerSource::Usb,
        device_type: Some(device.device_type),
    };
    input.validate().map_err(external_signer_api_error)?;
    Ok(input)
}

#[tauri::command]
pub fn external_signer_create(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    signer: ExternalSignerInput,
    credential: String,
) -> ApiResult<ExternalSignerWallet> {
    let credential = Zeroizing::new(credential);
    let _operation = operation_guard(&state)?;
    let _admission_cleanup = clear_new_wallet_admission_on_exit(&state);
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 48 {
        return Err(api_error(
            "invalid_wallet_name",
            "Wallet names must contain 1 to 48 characters.",
        ));
    }
    validate_label_formatting(&signer.label)?;
    validate_credential(credential.as_str())?;
    signer.validate().map_err(external_signer_api_error)?;
    require_mainnet_hardware_admission(
        &state,
        &signer.fingerprint,
        &signer.xpub,
        &signer.derivation_path,
        signer.device_type.as_deref(),
    )?;
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
        let permit = database_open_permit_for_new_wallet(&state)?;
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"), &permit)?;
        init_app_schema(&db)?;
        let wallet = Wallet::create(
            metadata.external_descriptor.clone(),
            metadata.internal_descriptor.clone(),
        )
        .network(network())
        .create_wallet(&mut db)
        .map_err(internal)?;
        write_private_json(&dir.join("wallet.json"), &metadata)?;
        let marker = format!("groot-external-signer:{}", metadata.external_descriptor);
        persist_secret_material(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
            id,
        )?;
        profile_commands::persist_mainnet_node_admission_for_new_profile(
            &app,
            &state,
            id,
            credential.as_str(),
        )?;
        // Unlike a Groot-generated seed, an imported hardware signer may have
        // received bitcoin at any point in the chain. Start from genesis unless
        // the user later narrows the saved birthday explicitly.
        persist_initial_recovery_scan_settings(&db, 0)?;
        commit_profile(
            &app,
            WalletProfile {
                id,
                name: metadata.name.clone(),
                network: network_name().to_owned(),
                kind: WalletKind::WatchOnly,
                descriptor_checksum: descriptor_checksum(
                    &wallet.public_descriptor(KeychainKind::External).to_string(),
                )?,
                created_at: now(),
                backup_verified: true,
            },
            &metadata.external_descriptor,
        )
    })();
    finish_new_profile_attempt(&state, id, &dir, result.is_ok())?;
    result?;
    unlock_selected(&app, &state)?;
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::WalletCreated,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::DiagnosticWalletKind::Hardware),
            ..Default::default()
        },
        None,
    );
    Ok(metadata)
}

#[tauri::command]
pub async fn external_signer_wallet(app: AppHandle) -> ApiResult<ExternalSignerWallet> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let wallet_id = require_unlocked(&app, &state)?;
        let _operation = metadata_operation_guard(&state, wallet_id)?;
        read_external_signer_metadata(&app)
    })
    .await
    .map_err(internal)?
}

pub(crate) fn normalize_external_signer_label(value: &str) -> ApiResult<String> {
    validate_label_formatting(value)?;
    let normalized = normalize_label_text(value);
    if normalized.is_empty() || normalized.chars().count() > 48 {
        return Err(api_error(
            "invalid_label",
            "Hardware signer names must contain 1 to 48 characters.",
        ));
    }
    Ok(normalized)
}

#[tauri::command]
pub async fn external_signer_rename(
    app: AppHandle,
    label: String,
) -> ApiResult<ExternalSignerWallet> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let wallet_id = require_unlocked(&app, &state)?;
        let _operation = metadata_operation_guard(&state, wallet_id)?;
        let mut metadata = read_external_signer_metadata(&app)?;
        metadata.signer.label = normalize_external_signer_label(&label)?;
        metadata
            .signer
            .validate()
            .map_err(external_signer_api_error)?;
        write_private_json(&external_signer_metadata_path(&app)?, &metadata)?;
        Ok(metadata)
    })
    .await
    .map_err(internal)?
}

pub(crate) fn external_signer_backup(descriptor: String) -> ApiResult<ExternalSignerBackupDto> {
    let content = serde_json::to_string_pretty(&ExternalSignerBackupRecord {
        version: 1,
        network: network_name(),
        descriptor: &descriptor,
    })
    .map_err(internal)?;
    Ok(ExternalSignerBackupDto {
        descriptor,
        content,
    })
}

#[tauri::command]
pub fn external_signer_export_descriptor(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<ExternalSignerBackupDto> {
    let credential = Zeroizing::new(credential);
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    check_auth_throttle(&app, &state)?;
    let verified = verify_external_signer_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let backup = external_signer_backup(read_external_signer_metadata(&app)?.external_descriptor)?;
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::BackupExported,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::DiagnosticWalletKind::Hardware),
            ..Default::default()
        },
        None,
    );
    Ok(backup)
}

pub(crate) fn external_proposal_dto(
    row: StoredProposalRow,
    fingerprint: &str,
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
    let fingerprint = fingerprint.parse().map_err(internal)?;
    let progress = signature_progress(&psbt, &[fingerprint], 1).map_err(proposal_api_error)?;
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
    let acceleration = super::load_acceleration_review(db, &proposal_id, fee, fee_rate)?;
    let inputs_available = acceleration.is_some() || proposal_inputs_available(wallet, &psbt);
    Ok(MultisigProposalDto {
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
        inputs_available,
        inputs,
        locktime,
        rbf,
        network: network_name(),
        psbt: encoded,
        signed: progress.signed,
        required: 1,
        can_finalize: progress.can_finalize,
        signed_fingerprints: progress.signed_fingerprints,
        spend_path: "primary".to_owned(),
        eligible_signer_fingerprints: vec![fingerprint.to_string()],
        status,
        created_at: created_at.to_string(),
        selection_impact,
        acceleration,
    })
}

pub(crate) fn load_external_proposal(
    db: &mut Connection,
    metadata: &ExternalSignerWallet,
    proposal_id: &str,
) -> ApiResult<MultisigProposalDto> {
    let wallet = load_wallet(db)?;
    let row = db.query_row(
        "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy, fee_difference_vs_private FROM groot_proposals WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?)),
    ).map_err(|_| api_error("proposal_not_found", "Payment proposal was not found or is no longer active."))?;
    external_proposal_dto(row, &metadata.signer.fingerprint, &wallet, db)
}

#[tauri::command]
pub async fn external_signer_proposals(app: AppHandle) -> ApiResult<Vec<MultisigProposalDto>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let metadata = read_external_signer_metadata(&app)?;
        let mut db = open_db(&app)?;
        let wallet = load_wallet(&mut db)?;
        let mut statement = db.prepare(
            "SELECT proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy, fee_difference_vs_private FROM groot_proposals WHERE status IN ('collecting','ready') ORDER BY created_at DESC",
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
                    row.get(9)?,
                    row.get(10)?,
                ))
            })
            .map_err(internal)?;
        rows.map(|row| {
            external_proposal_dto(
                row.map_err(internal)?,
                &metadata.signer.fingerprint,
                &wallet,
                &db,
            )
        })
        .collect()
    })
    .await
    .map_err(internal)?
}

fn import_external_proposal_in_db(
    db: &mut Connection,
    metadata: &ExternalSignerWallet,
    proposal_id: &str,
    signed_psbt: &str,
) -> ApiResult<MultisigProposalDto> {
    // This is the authoritative post-device check. Hardware interaction is
    // deliberately performed without the wallet-operation lock, so the
    // wallet may change while the user confirms on the device. Reload the
    // proposal under that lock and reject stale coins before decoding,
    // merging, finalizing, or persisting any returned signature.
    let current = load_external_proposal(db, metadata, proposal_id)?;
    require_external_proposal_inputs_available(current.inputs_available)?;
    let original_encoded = current.psbt.clone();
    let mut original = decode_psbt(&original_encoded).map_err(proposal_api_error)?;
    let imported = decode_psbt(signed_psbt).map_err(proposal_api_error)?;
    let fingerprint = metadata.signer.fingerprint.parse().map_err(internal)?;
    let progress = merge_signed_psbt(&mut original, imported, &[fingerprint], 1)
        .map_err(proposal_api_error)?;
    if progress.can_finalize {
        let mut validation = original.clone();
        let wallet = load_wallet(db)?;
        bind_psbt_inputs_to_wallet(&wallet, &mut validation)?;
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
        "UPDATE groot_proposals SET psbt = ?1, status = ?2 WHERE proposal_id = ?3 AND status IN ('collecting','ready') AND psbt = ?4",
        params![encode_psbt(&original), status, proposal_id, original_encoded],
    ).map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while its signature was imported.",
        ));
    }
    load_external_proposal(db, metadata, proposal_id)
}

#[tauri::command]
pub fn external_signer_proposal_import(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    reviewed_psbt: String,
    signed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
    let mut db = open_db(&app)?;
    let current = load_external_proposal(&mut db, &metadata, &proposal_id)?;
    require_external_proposal_inputs_available(current.inputs_available)?;
    require_reviewed_psbt_unchanged(
        &current.psbt,
        &reviewed_psbt,
        "The proposal changed after review. Reload it before importing a signature.",
    )?;
    import_external_proposal_in_db(&mut db, &metadata, &proposal_id, &signed_psbt)
}

#[tauri::command]
pub fn external_signer_proposal_discard_signature(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    reviewed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
    let mut db = open_db(&app)?;
    let current = load_external_proposal(&mut db, &metadata, &proposal_id)?;
    require_reviewed_psbt_unchanged(
        &current.psbt,
        &reviewed_psbt,
        "The proposal changed after review. Reload it before discarding the signature.",
    )?;

    let signer = metadata.signer.fingerprint.parse().map_err(internal)?;
    let mut psbt = decode_psbt(&current.psbt).map_err(proposal_api_error)?;
    let progress =
        discard_signer_signature(&mut psbt, signer, &[signer], 1).map_err(proposal_api_error)?;
    if progress.signed != 0 || progress.can_finalize {
        return Err(api_error(
            "signature_not_found",
            "The hardware signature could not be removed safely. No proposal state was changed.",
        ));
    }
    let changed = db
        .execute(
            "UPDATE groot_proposals SET psbt = ?1, status = 'collecting' WHERE proposal_id = ?2 AND status IN ('collecting','ready') AND psbt = ?3",
            params![encode_psbt(&psbt), proposal_id, reviewed_psbt],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while the signature was being discarded. Reload it and try again.",
        ));
    }
    load_external_proposal(&mut db, &metadata, &proposal_id)
}

#[tauri::command]
pub async fn hardware_sign_external(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    device_id: String,
    reviewed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    let context = diagnostics::DiagnosticContext {
        wallet_kind: Some(diagnostics::DiagnosticWalletKind::Hardware),
        ..Default::default()
    };
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::TransactionSigned,
        diagnostics::DiagnosticOutcome::Started,
        context,
        None,
    );
    let result = async {
        let (_wallet_id, _activity) = begin_unlocked_user_operation(&app, &state)?;
        let metadata = read_external_signer_metadata(&app)?;
        let mut db = open_db(&app)?;
        let proposal = load_external_proposal(&mut db, &metadata, &proposal_id)?;
        require_external_proposal_inputs_available(proposal.inputs_available)?;
        require_reviewed_psbt_unchanged(
            &proposal.psbt,
            &reviewed_psbt,
            "The proposal changed after review. Reload it before signing.",
        )?;
        drop(db);
        let reviewed = decode_psbt(&proposal.psbt).map_err(proposal_api_error)?;
        let encoded = proposal.psbt;
        let expected_signer = metadata.signer;
        let hwi = hwi_cli(&app)?;
        let device = recently_scanned_hardware_device(&state, &device_id)?;
        let signed = tauri::async_runtime::spawn_blocking(move || {
            let operation = hwi.begin_signing_operation().map_err(hardware_api_error)?;
            let identity =
                prove_live_external_signer_identity(&hwi, &operation, &device, &expected_signer)?;
            let output = hwi
                .sign_psbt_in_operation(&operation, &identity.device_type, &device.path, &encoded)
                .map_err(|error| hardware_signing_api_error(error, &identity.device_type, false))?;
            let response: HwiPsbt = serde_json::from_slice(&output).map_err(internal)?;
            response.psbt.ok_or_else(|| {
                drop(response.error);
                missing_hardware_psbt(
                    &identity.device_type,
                    response.code,
                    "The device did not return a signed PSBT.",
                    false,
                )
            })
        })
        .await
        .map_err(internal)??;
        let returned = decode_psbt(&signed).map_err(proposal_api_error)?;
        let signatures_only =
            hardware_signature_response(&reviewed, returned).map_err(proposal_api_error)?;
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let metadata = read_external_signer_metadata(&app)?;
        let mut db = open_db(&app)?;
        import_external_proposal_in_db(
            &mut db,
            &metadata,
            &proposal_id,
            &encode_psbt(&signatures_only),
        )
    }
    .await;
    diagnostics::record_result(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::TransactionSigned,
        context,
        &result,
    );
    result
}

#[tauri::command]
pub async fn external_signer_proposal_broadcast(
    app: AppHandle,
    proposal_id: String,
    reviewed_psbt: String,
    credential: String,
) -> ApiResult<BroadcastResultDto> {
    let credential = Zeroizing::new(credential);
    let diagnostic_app = app.clone();
    let context = diagnostics::DiagnosticContext {
        wallet_kind: Some(diagnostics::DiagnosticWalletKind::Hardware),
        ..Default::default()
    };
    diagnostics::record(
        &app,
        &app.state::<AppState>(),
        diagnostics::DiagnosticEventKind::TransactionBroadcast,
        diagnostics::DiagnosticOutcome::Started,
        context,
        None,
    );
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        check_auth_throttle(&app, &state)?;
        let verified = verify_external_signer_credential(&app, credential.as_str());
        record_auth_result(&app, &state, &verified)?;
        verified?;
        let metadata = read_external_signer_metadata(&app)?;
        let mut db = open_db(&app)?;
        let proposal = load_external_proposal(&mut db, &metadata, &proposal_id)?;
        require_external_proposal_inputs_available(proposal.inputs_available)?;
        require_reviewed_psbt_unchanged(
            &proposal.psbt,
            &reviewed_psbt,
            "The signed proposal changed after review. Reload it before broadcast.",
        )?;
        if !proposal.can_finalize {
            return Err(api_error(
                "insufficient_signatures",
                "Sign the transaction before broadcasting.",
            ));
        }
        let mut psbt = decode_psbt(&proposal.psbt).map_err(proposal_api_error)?;
        let wallet = load_wallet(&mut db)?;
        bind_psbt_inputs_to_wallet(&wallet, &mut psbt)?;
        let acceleration = proposal_acceleration_method(&db, &proposal_id)?;
        if matches!(acceleration, Some(AccelerationMethod::Rbf)) {
            validate_rbf_original_intent(
                &db,
                &wallet,
                &proposal_id,
                &proposal.recipient,
                proposal.amount,
            )?;
        }
        validate_release_spend(
            &wallet,
            &psbt,
            &proposal.recipient,
            proposal.amount,
            acceleration,
        )?;
        validate_psbt_excludes_frozen(&psbt, &frozen_outpoints(&db)?)?;
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
        let txid = broadcast_transaction(&app, &state, &db, &proposal_id, &transaction)?;
        let mut persisted = db.transaction().map_err(internal)?;
        let mut wallet = load_wallet_transaction(&mut persisted)?;
        apply_locally_broadcast_transaction(&mut wallet, &transaction);
        let changed = persisted.execute(
            "UPDATE groot_proposals SET status = 'broadcast', txid = ?1 WHERE proposal_id = ?2 AND status = 'ready'",
            params![txid.to_string(), proposal_id],
        ).map_err(internal)?;
        if changed != 1 {
            return Err(api_error(
                "proposal_mismatch",
                "The proposal changed while it was being broadcast.",
            ));
        }
        label_provenance::bind_broadcast_transaction(
            &persisted,
            &proposal_id,
            &txid.to_string(),
            now(),
        )
        .map_err(internal)?;
        record_replacement(&persisted, &proposal_id, &txid)?;
        let snapshot = snapshot_from(&wallet, &persisted, None, false, None)?;
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
        let (snapshot, sync_pending) =
            match sync_wallet_atomically(&app, &state, &mut db, false, None) {
                Ok(snapshot) => (snapshot, false),
                Err(_) => (snapshot, true),
            };
        Ok(BroadcastResultDto {
            txid: txid.to_string(),
            snapshot,
            sync_pending,
        })
    })
    .await
    .map_err(internal)?;
    let state = diagnostic_app.state::<AppState>();
    diagnostics::record_result(
        &diagnostic_app,
        &state,
        diagnostics::DiagnosticEventKind::TransactionBroadcast,
        context,
        &result,
    );
    result
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
        "UPDATE groot_proposals SET status = 'cancelled' WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
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
) -> ApiResult<ReceiveAddressDto> {
    let (initiating_wallet_id, _activity) = begin_unlocked_user_operation(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    require_hwi_supported_multisig_policy(&metadata)?;
    let initiating_external_descriptor = metadata.external_descriptor.clone();
    let initiating_internal_descriptor = metadata.internal_descriptor.clone();
    let mut db = open_multisig_db(&app)?;
    let expected: String = db
        .query_row(
            "SELECT address FROM groot_addresses WHERE idx = ?1 AND state != 'discarded'",
            params![address_id],
            |row| row.get(0),
        )
        .map_err(|_| api_error("address_not_found", "The receive address was not found."))?;
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&metadata.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(address_id)
        .map_err(internal)?
        .to_string();
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let expected_signers = saved_cosigner_candidates_for_device(&metadata.cosigners, &device)?;
    let (displayed, identity, hardware_operation) =
        tauri::async_runtime::spawn_blocking(move || {
            let operation = hwi
                .begin_interactive_operation()
                .map_err(hardware_api_error)?;
            let identity = prove_live_cosigner_identity_for_candidates(
                &hwi,
                &operation,
                &device,
                &expected_signers,
            )?;
            let displayed = hwi
                .display_descriptor_address_in_operation(
                    &operation,
                    &identity.device_type,
                    &device.path,
                    &descriptor,
                )
                .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
            Ok::<_, ApiError>((displayed, identity, operation))
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
    if !hardware_display_matches_expected_address(&expected, &actual) {
        return Err(api_error(
            "hardware_address_mismatch",
            "The address returned by the device does not match this wallet.",
        ));
    }
    let _operation = operation_guard(&state)?;
    let current_wallet_id = require_unlocked(&app, &state)?;
    let current_metadata = read_multisig_metadata(&app)?;
    ensure_hardware_verification_context(
        initiating_wallet_id,
        current_wallet_id,
        &initiating_external_descriptor,
        &initiating_internal_descriptor,
        &current_metadata,
    )?;
    db = open_multisig_db(&app)?;
    let current_expected: String = db
        .query_row(
            "SELECT address FROM groot_addresses WHERE idx = ?1 AND state != 'discarded'",
            params![address_id],
            |row| row.get(0),
        )
        .map_err(|_| api_error("address_not_found", "The receive address was not found."))?;
    if current_expected != expected {
        return Err(api_error(
            "address_context_changed",
            "The receive address changed during hardware verification. Verify it again.",
        ));
    }
    let verified = hardware_operation
        .complete_if_active(|| {
            record_address_verification(&mut db, address_id, &identity, &actual, true)
        })
        .map_err(hardware_api_error)??;
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::ReceiveAddressVerified,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::DiagnosticWalletKind::Multisig),
            ..Default::default()
        },
        None,
    );
    Ok(verified)
}

#[tauri::command]
pub async fn multisig_signer_policy_verifications(
    app: AppHandle,
) -> ApiResult<Vec<SignerPolicyVerificationDto>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let metadata = read_multisig_metadata(&app)?;
        let known = metadata
            .cosigners
            .iter()
            .map(|cosigner| cosigner.fingerprint.to_ascii_lowercase())
            .collect::<std::collections::HashSet<_>>();
        let db = open_multisig_db(&app)?;
        Ok(signer_policy_verification_rows(&db)?
            .into_iter()
            .filter(|verification| known.contains(&verification.signer_fingerprint))
            .collect())
    })
    .await
    .map_err(internal)?
}

pub(crate) fn policy_verification_address(
    wallet: &MultisigWalletDto,
) -> ApiResult<PolicyVerificationAddressDto> {
    let canonical_address = first_multisig_address(wallet)?;
    Ok(PolicyVerificationAddressDto {
        testnet_alias: regtest_testnet_address_alias(&canonical_address),
        canonical_address,
    })
}

#[tauri::command]
pub fn multisig_policy_verification_address(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<PolicyVerificationAddressDto> {
    require_unlocked(&app, &state)?;
    policy_verification_address(&read_multisig_metadata(&app)?)
}

#[tauri::command]
pub fn multisig_draft_policy_verification_address(
    policy: PolicyInput,
) -> ApiResult<PolicyVerificationAddressDto> {
    reject_virtual_cosigners(&policy.cosigners)?;
    let preview = policy.preview().map_err(policy_api_error)?;
    policy_verification_address(&MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: preview.name,
        threshold: preview.threshold,
        cosigners: preview.cosigners,
        external_descriptor: preview.external_descriptor,
        internal_descriptor: preview.internal_descriptor,
        created_at: String::new(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: Vec::new(),
    })
}

pub(crate) fn bitbox_policy_address_error(
    device_type: &str,
    code: Option<i64>,
    error: Option<&str>,
) -> Option<ApiError> {
    if !device_type.eq_ignore_ascii_case("bitbox02") || code != Some(-13) {
        return None;
    }
    let normalized = error.unwrap_or_default().to_ascii_lowercase();
    if normalized.contains("multisig account configuration with this name already exists") {
        return Some(api_error(
            "hardware_policy_name_conflict",
            "That account name is already used by another multisig policy on BitBox02. Start the review again and enter a new unique name on the device, such as “Groot 2of3 B”.",
        ));
    }
    Some(api_error(
        "hardware_command_failed",
        "BitBox02 did not finish wallet registration. Start the review again, enter a new unique account name on the device, approve the policy, then verify the first address.",
    ))
}

fn missing_policy_address(device_type: &str, response: HwiAddress) -> ApiError {
    let code = response.code;
    if let Some(error) = bitbox_policy_address_error(device_type, code, response.error.as_deref()) {
        return error;
    }
    drop(response.error);
    missing_hwi_value(
        code,
        "The device did not return the policy verification address.",
    )
}

fn display_multisig_policy_address(
    hwi: &HwiCli,
    device: HwiDevice,
    expected_signer: &CosignerInput,
    descriptor: &str,
) -> ApiResult<(
    Vec<u8>,
    VerifiedHardwareIdentity,
    HwiDevice,
    crate::hardware::HardwareOperation,
)> {
    let operation = hwi
        .begin_interactive_operation()
        .map_err(hardware_api_error)?;
    let identity = prove_live_cosigner_identity(hwi, &operation, &device, expected_signer)?;
    if !records_interactive_policy_verification(&identity.device_type) {
        return Err(api_error(
            "invalid_hardware_request",
            "This signer does not require interactive policy verification.",
        ));
    }
    // The identity proof and trusted-display action remain on the exact path
    // selected by the user, under one exclusive operation lease.
    let displayed = hwi
        .display_descriptor_address_in_operation(
            &operation,
            &identity.device_type,
            &device.path,
            descriptor,
        )
        .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
    Ok((displayed, identity, device, operation))
}

pub(crate) fn ensure_hardware_verification_context(
    initiating_wallet_id: Uuid,
    current_wallet_id: Uuid,
    initiating_external_descriptor: &str,
    initiating_internal_descriptor: &str,
    current_metadata: &MultisigWalletDto,
) -> ApiResult<()> {
    if current_wallet_id != initiating_wallet_id {
        return Err(api_error(
            "wallet_selection_changed",
            "The selected wallet changed during hardware verification. Select the original wallet and verify again.",
        ));
    }
    if current_metadata.external_descriptor != initiating_external_descriptor
        || current_metadata.internal_descriptor != initiating_internal_descriptor
    {
        return Err(api_error(
            "wallet_policy_changed",
            "The multisig policy changed during hardware verification. Verify the current policy again.",
        ));
    }
    Ok(())
}

fn complete_policy_verification_if_active<T>(
    operation: &crate::hardware::HardwareOperation,
    persist: impl FnOnce() -> ApiResult<T>,
) -> ApiResult<T> {
    operation
        .complete_if_active(persist)
        .map_err(hardware_api_error)?
}

#[tauri::command]
pub async fn hardware_verify_multisig_policy(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    signer_fingerprint: String,
) -> ApiResult<SignerPolicyVerificationDto> {
    let (initiating_wallet_id, _activity) = begin_unlocked_user_operation(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    require_hwi_supported_multisig_policy(&metadata)?;
    let initiating_external_descriptor = metadata.external_descriptor.clone();
    let initiating_internal_descriptor = metadata.internal_descriptor.clone();
    let signer = metadata
        .cosigners
        .iter()
        .find(|cosigner| {
            cosigner
                .fingerprint
                .eq_ignore_ascii_case(&signer_fingerprint)
        })
        .ok_or_else(unknown_hardware_signer)?;
    let expected_signer = signer.clone();
    let expected = first_multisig_address(&metadata)?;
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&metadata.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(0)
        .map_err(internal)?
        .to_string();
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let (displayed, identity, device, hardware_operation) =
        tauri::async_runtime::spawn_blocking(move || {
            display_multisig_policy_address(&hwi, device, &expected_signer, &descriptor)
        })
        .await
        .map_err(internal)??;
    let mut remembered = [device];
    remember_hardware_devices(&state, &mut remembered)?;
    let response: HwiAddress = serde_json::from_slice(&displayed).map_err(internal)?;
    let actual = response
        .address
        .clone()
        .ok_or_else(|| missing_policy_address(&identity.device_type, response))?;
    if !hardware_display_matches_expected_address(&expected, &actual) {
        return Err(api_error(
            "hardware_address_mismatch",
            "The first address returned by the device does not match this wallet policy.",
        ));
    }
    let _operation = operation_guard(&state)?;
    let current_wallet_id = require_unlocked(&app, &state)?;
    let current_metadata = read_multisig_metadata(&app)?;
    ensure_hardware_verification_context(
        initiating_wallet_id,
        current_wallet_id,
        &initiating_external_descriptor,
        &initiating_internal_descriptor,
        &current_metadata,
    )?;
    let db = open_multisig_db(&app)?;
    complete_policy_verification_if_active(&hardware_operation, || {
        record_signer_policy_verification(&db, &identity, &actual)
    })
}

#[tauri::command]
pub async fn hardware_verify_multisig_draft_policy(
    app: AppHandle,
    state: State<'_, AppState>,
    policy: PolicyInput,
    device_id: String,
    signer_fingerprint: String,
) -> ApiResult<SignerPolicyVerificationDto> {
    let _activity = begin_optional_unlocked_user_operation(&app, &state)?;
    reject_virtual_cosigners(&policy.cosigners)?;
    let preview = policy.preview().map_err(policy_api_error)?;
    let wallet = MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: preview.name,
        threshold: preview.threshold,
        cosigners: preview.cosigners,
        external_descriptor: preview.external_descriptor,
        internal_descriptor: preview.internal_descriptor,
        created_at: String::new(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: Vec::new(),
    };
    let signer = wallet
        .cosigners
        .iter()
        .find(|cosigner| {
            cosigner
                .fingerprint
                .eq_ignore_ascii_case(&signer_fingerprint)
        })
        .ok_or_else(unknown_hardware_signer)?;
    let expected_signer = signer.clone();
    let admission_xpub = expected_signer.xpub.clone();
    let admission_path = expected_signer.derivation_path.clone();
    let expected = first_multisig_address(&wallet)?;
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&wallet.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(0)
        .map_err(internal)?
        .to_string();
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let (displayed, identity, device, hardware_operation) =
        tauri::async_runtime::spawn_blocking(move || {
            display_multisig_policy_address(&hwi, device, &expected_signer, &descriptor)
        })
        .await
        .map_err(internal)??;
    let mut remembered = [device];
    remember_hardware_devices(&state, &mut remembered)?;
    let response: HwiAddress = serde_json::from_slice(&displayed).map_err(internal)?;
    let actual = response
        .address
        .clone()
        .ok_or_else(|| missing_policy_address(&identity.device_type, response))?;
    if !hardware_display_matches_expected_address(&expected, &actual) {
        return Err(api_error(
            "hardware_address_mismatch",
            "The first address returned by the device does not match this wallet policy.",
        ));
    }
    let verification = SignerPolicyVerificationDto {
        signer_fingerprint: identity.fingerprint.to_ascii_lowercase(),
        device_type: identity.device_type.to_ascii_lowercase(),
        verified_at: now().to_string(),
        scope: "policy_and_address",
        displayed_address: Some(actual),
    };
    let key = policy_verification_key(&wallet, &verification.signer_fingerprint)?;
    let verification = complete_policy_verification_if_active(&hardware_operation, || {
        state
            .pending_policy_verifications
            .lock()
            .map_err(internal)?
            .insert(key, verification.clone());
        Ok(verification)
    })?;
    // Policy registration and on-device address review can legitimately take
    // longer than the discovery capability lifetime. This successful live
    // identity-and-address proof is stronger and more recent than the original
    // import, so renew the exact in-memory Mainnet admission instead of making
    // the user disconnect and import the same signer again at final creation.
    remember_mainnet_hardware_admission(
        &state,
        &verification.signer_fingerprint,
        &admission_xpub,
        &admission_path,
        Some(&verification.device_type),
    )?;
    Ok(verification)
}

#[tauri::command]
pub async fn hardware_verify_external_address(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    address_id: u32,
) -> ApiResult<ReceiveAddressDto> {
    let (initiating_wallet_id, _activity) = begin_unlocked_user_operation(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
    let initiating_metadata = metadata.clone();
    let mut db = open_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    let expected: String = db
        .query_row(
            "SELECT address FROM groot_addresses WHERE idx = ?1 AND state != 'discarded'",
            params![address_id],
            |row| row.get(0),
        )
        .map_err(|_| api_error("address_not_found", "The receive address was not found."))?;
    let (keychain, derived_index) = wallet
        .derivation_of_spk(
            Address::from_str(&expected)
                .map_err(|_| api_error("wallet_corrupt", "The stored receive address is invalid."))?
                .require_network(network())
                .map_err(|_| {
                    api_error(
                        "wallet_corrupt",
                        "The stored receive address is on the wrong network.",
                    )
                })?
                .script_pubkey(),
        )
        .ok_or_else(|| {
            api_error(
                "wallet_corrupt",
                "The stored receive address does not belong to this wallet database.",
            )
        })?;
    if keychain != KeychainKind::External || derived_index != address_id {
        return Err(api_error(
            "wallet_corrupt",
            "The stored receive address derivation does not match its wallet index.",
        ));
    }
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&metadata.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(address_id)
        .map_err(internal)?
        .to_string();
    let expected_signer = metadata.signer;
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let (displayed, identity, hardware_operation) =
        tauri::async_runtime::spawn_blocking(move || {
            let operation = hwi
                .begin_interactive_operation()
                .map_err(hardware_api_error)?;
            let identity =
                prove_live_external_signer_identity(&hwi, &operation, &device, &expected_signer)?;
            let displayed = hwi
                .display_descriptor_address_in_operation(
                    &operation,
                    &identity.device_type,
                    &device.path,
                    &descriptor,
                )
                .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
            Ok::<_, ApiError>((displayed, identity, operation))
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
    if !hardware_display_matches_expected_address(&expected, &actual) {
        return Err(api_error(
            "hardware_address_mismatch",
            "The address returned by the device does not match this wallet.",
        ));
    }
    let _operation = operation_guard(&state)?;
    let current_wallet_id = require_unlocked(&app, &state)?;
    if current_wallet_id != initiating_wallet_id {
        return Err(api_error(
            "wallet_selection_changed",
            "The selected wallet changed during hardware verification. Select the original wallet and verify again.",
        ));
    }
    if read_external_signer_metadata(&app)? != initiating_metadata {
        return Err(api_error(
            "wallet_policy_changed",
            "The external-signer policy changed during hardware verification. Verify the current policy again.",
        ));
    }
    db = open_db(&app)?;
    let current_expected: String = db
        .query_row(
            "SELECT address FROM groot_addresses WHERE idx = ?1 AND state != 'discarded'",
            params![address_id],
            |row| row.get(0),
        )
        .map_err(|_| api_error("address_not_found", "The receive address was not found."))?;
    if current_expected != expected {
        return Err(api_error(
            "address_context_changed",
            "The receive address changed during hardware verification. Verify it again.",
        ));
    }
    let verified = hardware_operation
        .complete_if_active(|| {
            record_address_verification(&mut db, address_id, &identity, &actual, false)
        })
        .map_err(hardware_api_error)??;
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::ReceiveAddressVerified,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::DiagnosticWalletKind::Hardware),
            ..Default::default()
        },
        None,
    );
    Ok(verified)
}

#[cfg(test)]
mod health_check_tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv},
        secp256k1::Secp256k1,
    };

    fn signer_from_seed(seed_byte: u8) -> CosignerInput {
        let secp = Secp256k1::new();
        let master = Xpriv::new_master(parameters().network, &[seed_byte; 32]).unwrap();
        let path = DerivationPath::from_str(multisig_account_path()).unwrap();
        let account = master.derive_priv(&secp, &path).unwrap();
        CosignerInput {
            id: format!("signer-{seed_byte}"),
            label: "Coldcard".to_owned(),
            fingerprint: master.fingerprint(&secp).to_string(),
            xpub: Xpub::from_priv(&secp, &account).to_string(),
            derivation_path: multisig_account_path().to_owned(),
            source: CosignerSource::File,
            device_type: Some("coldcard".to_owned()),
        }
    }

    fn external_signer_from_seed(seed_byte: u8) -> ExternalSignerInput {
        let secp = Secp256k1::new();
        let master = Xpriv::new_master(parameters().network, &[seed_byte; 32]).unwrap();
        let path = DerivationPath::from_str(singlesig_account_path()).unwrap();
        let account = master.derive_priv(&secp, &path).unwrap();
        ExternalSignerInput {
            label: "Trezor Safe 3".to_owned(),
            fingerprint: master.fingerprint(&secp).to_string(),
            xpub: Xpub::from_priv(&secp, &account).to_string(),
            derivation_path: singlesig_account_path().to_owned(),
            source: SignerSource::Usb,
            device_type: Some("trezor".to_owned()),
        }
    }

    #[cfg(unix)]
    #[test]
    fn policy_display_uses_proven_bitbox_fingerprint_and_keeps_other_paths() {
        use std::os::unix::fs::PermissionsExt as _;

        let suffix = format!("{}-{:?}", std::process::id(), std::thread::current().id());
        let script = std::env::temp_dir().join(format!("groot-policy-reopen-{suffix}"));
        let log = std::env::temp_dir().join(format!("groot-policy-reopen-log-{suffix}"));
        let mut expected = signer_from_seed(43);
        let response = serde_json::to_string(&serde_json::json!([{
            "desc": format!("wpkh([{}/{}]{}/0/*)", expected.fingerprint,
                expected.derivation_path.trim_start_matches("m/"), expected.xpub)
        }]))
        .unwrap()
        .replace('\'', "'\"'\"'");
        std::fs::write(&script, format!(
            "#!/bin/sh\nIFS= read -r command\nprintf '%s\\n' \"$command\" >> '{}'\ncase \"$command\" in *getkeypool*) printf '%s\\n' '{response}' ;; *displayaddress*) printf '%s\\n' '{{\"address\":\"fixture\"}}' ;; *) exit 2 ;; esac\n",
            log.display()
        )).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let hwi = HwiCli::for_test_program(script.clone());
        for family in ["bitbox02", "jade"] {
            std::fs::write(&log, "").unwrap();
            expected.device_type = Some(family.to_owned());
            let device = HwiDevice {
                device_type: family.to_owned(),
                path: "fixture-private-path".to_owned(),
                fingerprint: Some(expected.fingerprint.clone()),
                ..HwiDevice::default()
            };
            let result = display_multisig_policy_address(
                &hwi,
                device.clone(),
                &expected,
                "wsh(sortedmulti(fixture))",
            )
            .unwrap();
            assert_eq!(result.1.fingerprint, expected.fingerprint);
            drop(result);
            let commands = std::fs::read_to_string(&log).unwrap();
            let commands = commands.lines().collect::<Vec<_>>();
            assert_eq!(commands.len(), 2);
            assert!(commands[0].contains("getkeypool"));
            assert!(commands[0].contains("fixture-private-path"));
            assert!(commands[1].contains("displayaddress"));
            assert!(commands[1].contains("--device-path"));
            assert!(commands[1].contains("fixture-private-path"));
            assert!(!commands[1].contains("--fingerprint"));

            std::fs::write(&log, "").unwrap();
            let mut wrong = signer_from_seed(44);
            wrong.device_type = Some(family.to_owned());
            assert!(display_multisig_policy_address(
                &hwi,
                device,
                &wrong,
                "wsh(sortedmulti(fixture))"
            )
            .is_err());
            let commands = std::fs::read_to_string(&log).unwrap();
            assert_eq!(commands.lines().count(), 1);
            assert!(!commands.contains("displayaddress"));
        }
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(log).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn draft_health_proves_each_live_identity_without_a_wallet_database() {
        use std::os::unix::fs::PermissionsExt as _;
        let mut signer = signer_from_seed(41);
        let other = signer_from_seed(42);
        let response = serde_json::to_string(&serde_json::json!([{
            "desc": format!("wpkh([{}/{}]{}/0/*)", signer.fingerprint,
                signer.derivation_path.trim_start_matches("m/"), signer.xpub)
        }]))
        .unwrap()
        .replace('\'', "'\"'\"'");
        let script = std::env::temp_dir().join(format!(
            "groot-draft-health-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(&script, format!("#!/bin/sh\nprintf '%s\\n' '{response}'\n")).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let hwi = HwiCli::for_test_program(script.clone());
        for family in ["coldcard", "bitbox02", "ledger"] {
            signer.device_type = Some(family.to_owned());
            let device = HwiDevice {
                device_type: family.to_owned(),
                path: "fixture-only".to_owned(),
                fingerprint: Some(signer.fingerprint.clone()),
                ..HwiDevice::default()
            };
            assert_eq!(
                check_draft_cosigner(&hwi, &device, &signer).unwrap().status,
                "healthy"
            );
            let mut wrong_key = signer.clone();
            wrong_key.xpub = other.xpub.clone();
            assert_eq!(
                check_draft_cosigner(&hwi, &device, &wrong_key)
                    .err()
                    .unwrap()
                    .code,
                "unknown_signer"
            );
            let mut wrong_fingerprint = signer.clone();
            wrong_fingerprint.fingerprint = other.fingerprint.clone();
            assert_eq!(
                check_draft_cosigner(&hwi, &device, &wrong_fingerprint)
                    .err()
                    .unwrap()
                    .code,
                "unknown_signer"
            );
        }
        std::fs::remove_file(script).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn initial_bitbox_import_retries_only_the_exact_selected_path_via_stdin() {
        use std::os::unix::fs::PermissionsExt as _;

        let expected = external_signer_from_seed(21);
        let descriptor = format!(
            "wpkh([{}/84h/1h/0h]{}/0/*)",
            expected.fingerprint, expected.xpub
        );
        let keypool_response =
            serde_json::to_string(&serde_json::json!([{ "desc": descriptor }])).unwrap();
        let suffix = format!("{}-{:?}", std::process::id(), std::thread::current().id());
        let script = std::env::temp_dir().join(format!("groot-bitbox-reopen-{suffix}"));
        let count = std::env::temp_dir().join(format!("groot-bitbox-reopen-count-{suffix}"));
        let command_log =
            std::env::temp_dir().join(format!("groot-bitbox-reopen-command-{suffix}"));
        let shell_keypool = keypool_response.replace('\'', "'\"'\"'");
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nIFS= read -r command\nprintf '%s\\n' \"$command\" >> '{command_log}'\nvalue=0\nif [ -f '{count}' ]; then IFS= read -r value < '{count}'; fi\nvalue=$((value + 1))\nprintf '%s\\n' \"$value\" > '{count}'\nif [ \"$value\" -eq 1 ]; then printf '%s\\n' '{{\"error\":\"unavailable action\",\"code\":-9}}'; elif [ \"$value\" -eq 2 ]; then printf '%s\\n' '{{\"error\":\"busy\",\"code\":-15}}'; else printf '%s\\n' '{shell_keypool}'; fi\n",
                count = count.display(),
                command_log = command_log.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let hwi = HwiCli::for_test_program(script.clone());
        let device = HwiDevice {
            device_type: "bitbox02".to_owned(),
            path: "opaque-nova-path".to_owned(),
            ..HwiDevice::default()
        };

        let identity =
            read_hardware_account_identity(&hwi, &device, singlesig_account_path(), false).unwrap();
        assert_eq!(
            identity,
            (expected.fingerprint.clone(), expected.xpub.clone())
        );

        assert_eq!(std::fs::read_to_string(&count).unwrap().trim(), "3");
        let commands = std::fs::read_to_string(&command_log).unwrap();
        assert!(commands
            .lines()
            .all(|command| command.contains("getkeypool")));
        assert!(commands
            .lines()
            .all(|command| command.contains("--device-path")));
        assert!(commands
            .lines()
            .all(|command| command.contains("opaque-nova-path")));
        assert!(commands.lines().all(|command| command.contains("--path")));
        assert!(commands
            .lines()
            .all(|command| command.contains("m/84") && command.contains("/0/*")));
        assert!(commands
            .lines()
            .all(|command| !command.contains("--fingerprint")));
        assert!(commands
            .lines()
            .all(|command| command.contains("--chain") && command.contains("test")));
        assert!(commands
            .lines()
            .all(|command| command.contains("--device-type") && command.contains("bitbox02")));
        assert!(bitbox_account_key_response_is_retryable(
            b"{\"error\":\"unavailable action\",\"code\":-9}"
        ));
        assert!(bitbox_account_key_response_is_retryable(
            b"{\"error\":\"busy\",\"code\":-15}"
        ));
        assert!(!bitbox_account_key_response_is_retryable(
            b"{\"error\":\"Device not paired yet. Please pair using the BitBoxApp, then close the BitBoxApp and try again.\",\"code\":-3}"
        ));
        assert!(!bitbox_account_key_response_is_retryable(
            b"{\"error\":\"cancelled\",\"code\":-14}"
        ));
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(count).unwrap();
        std::fs::remove_file(command_log).unwrap();
    }

    #[test]
    fn locked_interactive_device_uses_saved_same_family_candidates() {
        let mut first = signer_from_seed(10);
        first.device_type = Some("jade".to_owned());
        let mut second = signer_from_seed(11);
        second.device_type = Some("jade".to_owned());
        let mut unrelated = signer_from_seed(12);
        unrelated.device_type = Some("ledger".to_owned());
        let locked_jade = HwiDevice {
            device_type: "jade".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            ..HwiDevice::default()
        };

        let candidates = saved_cosigner_candidates_for_device(
            &[first.clone(), unrelated, second.clone()],
            &locked_jade,
        )
        .unwrap();
        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].fingerprint, first.fingerprint);
        assert_eq!(candidates[1].fingerprint, second.fingerprint);
    }

    #[test]
    fn public_key_import_can_be_a_candidate_for_exact_live_identity_proof() {
        let mut manual = signer_from_seed(26);
        manual.device_type = None;
        let mut other_family = signer_from_seed(27);
        other_family.device_type = Some("trezor".to_owned());
        let jade = HwiDevice {
            device_type: "jade".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            ..HwiDevice::default()
        };
        let candidates =
            saved_cosigner_candidates_for_device(&[other_family, manual.clone()], &jade).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].fingerprint, manual.fingerprint);
        assert_eq!(candidates[0].xpub, manual.xpub);
    }

    #[test]
    fn identified_device_cannot_fall_back_to_another_same_family_signer() {
        let mut expected = signer_from_seed(13);
        expected.device_type = Some("jade".to_owned());
        let mut other = signer_from_seed(14);
        other.device_type = Some("jade".to_owned());
        let identified_jade = HwiDevice {
            device_type: "jade".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            fingerprint: Some(expected.fingerprint.clone()),
            ..HwiDevice::default()
        };

        let candidates =
            saved_cosigner_candidates_for_device(&[other, expected.clone()], &identified_jade)
                .unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].fingerprint, expected.fingerprint);
    }

    #[test]
    fn fingerprintless_device_yields_only_saved_same_family_candidates() {
        let mut saved = signer_from_seed(15);
        saved.device_type = Some("coldcard".to_owned());
        let locked_coldcard = HwiDevice {
            device_type: "coldcard".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            ..HwiDevice::default()
        };

        let candidates =
            saved_cosigner_candidates_for_device(&[saved.clone()], &locked_coldcard).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].fingerprint, saved.fingerprint);
        assert_eq!(candidates[0].xpub, saved.xpub);
    }

    #[cfg(unix)]
    #[test]
    fn locked_jade_xpub_request_unlocks_and_selects_only_the_matching_full_identity() {
        use std::os::unix::fs::PermissionsExt as _;

        let mut wrong = signer_from_seed(16);
        wrong.device_type = Some("jade".to_owned());
        let mut expected = signer_from_seed(17);
        expected.device_type = None;
        let response =
            serde_json::to_string(&serde_json::json!({ "xpub": expected.xpub })).unwrap();
        let shell_response = response.replace('\'', "'\"'\"'");
        let script = std::env::temp_dir().join(format!(
            "groot-locked-jade-proof-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nIFS= read -r command\ncase \"$command\" in *getxpub*) printf '%s\\n' '{shell_response}' ;; *) exit 2 ;; esac\n"
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let hwi = HwiCli::for_test_program(script.clone());
        let operation = hwi.begin_interactive_operation().unwrap();
        let locked_jade = HwiDevice {
            device_type: "jade".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            ..HwiDevice::default()
        };

        let identity = prove_live_cosigner_identity_for_candidates(
            &hwi,
            &operation,
            &locked_jade,
            &[wrong, expected.clone()],
        )
        .unwrap();
        assert_eq!(identity.fingerprint, expected.fingerprint);
        std::fs::remove_file(script).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn locked_device_rejects_an_unmatched_live_account_key() {
        use std::os::unix::fs::PermissionsExt as _;

        let mut saved = signer_from_seed(18);
        saved.device_type = Some("jade".to_owned());
        let mut different = signer_from_seed(19);
        different.device_type = Some("jade".to_owned());
        let response =
            serde_json::to_string(&serde_json::json!({ "xpub": different.xpub })).unwrap();
        let shell_response = response.replace('\'', "'\"'\"'");
        let script = std::env::temp_dir().join(format!(
            "groot-locked-jade-mismatch-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nIFS= read -r command\ncase \"$command\" in *getxpub*) printf '%s\\n' '{shell_response}' ;; *) exit 2 ;; esac\n"
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let hwi = HwiCli::for_test_program(script.clone());
        let operation = hwi.begin_interactive_operation().unwrap();
        let locked_jade = HwiDevice {
            device_type: "jade".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            ..HwiDevice::default()
        };

        let error =
            prove_live_cosigner_identity_for_candidates(&hwi, &operation, &locked_jade, &[saved])
                .unwrap_err();
        assert_eq!(error.code, "unknown_signer");
        std::fs::remove_file(script).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn locked_external_jade_uses_the_certified_xpub_unlock_request() {
        use std::os::unix::fs::PermissionsExt as _;

        let mut expected = external_signer_from_seed(20);
        expected.device_type = Some("jade".to_owned());
        let response =
            serde_json::to_string(&serde_json::json!({ "xpub": expected.xpub })).unwrap();
        let shell_response = response.replace('\'', "'\"'\"'");
        let script = std::env::temp_dir().join(format!(
            "groot-locked-external-jade-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nIFS= read -r command\ncase \"$command\" in *getxpub*) printf '%s\\n' '{shell_response}' ;; *) exit 2 ;; esac\n"
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let hwi = HwiCli::for_test_program(script.clone());
        let operation = hwi.begin_interactive_operation().unwrap();
        let locked_jade = HwiDevice {
            device_type: "jade".to_owned(),
            path: "opaque-resolved-path".to_owned(),
            ..HwiDevice::default()
        };

        let identity =
            prove_live_external_signer_identity(&hwi, &operation, &locked_jade, &expected).unwrap();
        assert_eq!(identity.fingerprint, expected.fingerprint);
        std::fs::remove_file(script).unwrap();
    }

    #[test]
    fn health_check_requires_the_connected_bip48_account_key() {
        let expected = signer_from_seed(1);
        let mut connected = expected.clone();
        connected.source = CosignerSource::Usb;
        assert!(verify_cosigner_identity(&expected, &connected).is_ok());

        connected.xpub = signer_from_seed(2).xpub;
        let error = verify_cosigner_identity(&expected, &connected).unwrap_err();
        assert_eq!(error.code, "unknown_signer");
        assert!(error.message.contains("saved BIP48 account key"));
    }

    #[test]
    fn external_signer_health_check_requires_the_connected_bip84_account_key() {
        let expected = external_signer_from_seed(3);
        let mut connected = expected.clone();
        assert!(verify_external_signer_identity(&expected, &connected).is_ok());

        connected.xpub = external_signer_from_seed(4).xpub;
        let error = verify_external_signer_identity(&expected, &connected).unwrap_err();
        assert_eq!(error.code, "unknown_signer");
        assert!(error.message.contains("saved BIP84 account key"));
    }

    #[test]
    fn account_xpub_response_is_validated_for_network_and_encoding() {
        let signer = signer_from_seed(7);
        let output = serde_json::to_vec(&serde_json::json!({ "xpub": signer.xpub })).unwrap();
        let xpub = parse_hwi_account_xpub(&output, "trezor").unwrap();
        assert_eq!(xpub, signer.xpub);

        let error = parse_hwi_account_xpub(b"{\"xpub\":\"not-an-xpub\"}", "trezor").unwrap_err();
        assert_eq!(error.code, "invalid_descriptor");

        let secp = Secp256k1::new();
        let mainnet = Xpriv::new_master(Network::Bitcoin, &[17_u8; 32]).unwrap();
        let wrong_xpub = Xpub::from_priv(&secp, &mainnet).to_string();
        let output = serde_json::to_vec(&serde_json::json!({ "xpub": wrong_xpub })).unwrap();
        assert_eq!(
            parse_hwi_account_xpub(&output, "trezor").unwrap_err().code,
            "wrong_network"
        );
    }

    #[test]
    fn initial_keypool_response_atomically_binds_fingerprint_xpub_and_requested_path() {
        let signer = signer_from_seed(8);
        let origin = multisig_account_path().trim_start_matches("m/");
        let output = serde_json::to_vec(&serde_json::json!([{
            "desc": format!(
                "wpkh([{}/{}]{}/0/*)",
                signer.fingerprint, origin, signer.xpub
            )
        }]))
        .unwrap();

        let (fingerprint, xpub) =
            parse_hwi_account_keypool(&output, multisig_account_path(), "trezor").unwrap();
        assert_eq!(fingerprint, signer.fingerprint);
        assert_eq!(xpub, signer.xpub);

        let error =
            parse_hwi_account_keypool(&output, singlesig_account_path(), "trezor").unwrap_err();
        assert_eq!(error.code, "invalid_derivation_path");

        let secp = Secp256k1::new();
        let master = Xpriv::new_master(Network::Bitcoin, &[18_u8; 32]).unwrap();
        let account = master
            .derive_priv(
                &secp,
                &DerivationPath::from_str(multisig_account_path()).unwrap(),
            )
            .unwrap();
        let wrong_xpub = Xpub::from_priv(&secp, &account);
        let wrong = serde_json::to_vec(&serde_json::json!([{
            "desc": format!(
                "wpkh([{}/{}]{}/0/*)",
                signer.fingerprint, origin, wrong_xpub
            )
        }]))
        .unwrap();
        assert_eq!(
            parse_hwi_account_keypool(&wrong, multisig_account_path(), "trezor")
                .unwrap_err()
                .code,
            "wrong_network"
        );
    }

    #[test]
    fn health_check_persistence_keeps_only_the_latest_result_per_signer() {
        let db = Connection::open_in_memory().unwrap();
        init_app_schema(&db).unwrap();
        let first = HardwareHealthCheckRecordDto {
            signer_fingerprint: "a1b2c3d4".to_owned(),
            status: "attention".to_owned(),
            checked_at: "2026-08-16T06:00:00.000Z".to_owned(),
            summary: "Unlock the signer.".to_owned(),
        };
        upsert_hardware_health_check(&db, &first).unwrap();
        let latest = HardwareHealthCheckRecordDto {
            signer_fingerprint: "a1b2c3d4".to_owned(),
            status: "healthy".to_owned(),
            checked_at: "2026-08-16T07:00:00.000Z".to_owned(),
            summary: "Signer matches.".to_owned(),
        };
        upsert_hardware_health_check(&db, &latest).unwrap();

        assert_eq!(read_hardware_health_checks(&db).unwrap(), vec![latest]);
    }
}
