use super::*;

pub(super) fn pending_mobile_pairings_directory(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app_data_dir(app)?.join("pending-mobile-pairings"))
}

pub(super) fn staging_session_uuid(session_id: &str) -> ApiResult<Uuid> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))
}

/// Process-local PIN throttle for the encrypted pending-mobile-pairing
/// staging envelope. The durable per-wallet throttle cannot serve these
/// commands because the wallet profile does not exist yet; the staging
/// envelope itself is a passphrase oracle, so online attempts get the same
/// bounded backoff policy, keyed by the pairing session and measured on a
/// monotonic clock. A successful clear or an abandoned process resets it.
pub(super) fn check_staging_auth_throttle(state: &AppState, session: Uuid) -> ApiResult<()> {
    let retry_at = state
        .staging_auth_retry_at
        .lock()
        .map_err(internal)?
        .get(&session)
        .copied();
    if let Some(retry_at) = retry_at {
        let now_instant = Instant::now();
        if now_instant < retry_at {
            let remaining = retry_at.duration_since(now_instant).as_secs().max(1);
            return Err(api_error(
                "rate_limited",
                format!("Too many incorrect attempts. Try again in {remaining} seconds."),
            ));
        }
        state
            .staging_auth_retry_at
            .lock()
            .map_err(internal)?
            .remove(&session);
    }
    Ok(())
}

/// Count only credential failures: a corrupt or unavailable staging envelope
/// is not a guessing oracle and must not lock out its owner.
pub(super) fn record_staging_attempt(
    state: &AppState,
    session: Uuid,
    result: &Result<Zeroizing<Vec<u8>>, crate::secure_store::SecureStoreError>,
) -> ApiResult<()> {
    if result.is_ok() {
        state
            .staging_auth_failures
            .lock()
            .map_err(internal)?
            .remove(&session);
        state
            .staging_auth_retry_at
            .lock()
            .map_err(internal)?
            .remove(&session);
        return Ok(());
    }
    if !matches!(
        result,
        Err(crate::secure_store::SecureStoreError::InvalidCredential)
    ) {
        return Ok(());
    }
    let failures = {
        let mut map = state.staging_auth_failures.lock().map_err(internal)?;
        let entry = map.entry(session).or_insert(0);
        let mut throttle = AuthThrottle::restore(*entry, 0);
        let delay = throttle.failed(now());
        *entry = throttle.snapshot().0;
        if delay.is_zero() {
            None
        } else {
            Instant::now().checked_add(delay)
        }
    };
    if let Some(retry_at) = failures {
        state
            .staging_auth_retry_at
            .lock()
            .map_err(internal)?
            .insert(session, retry_at);
    }
    Ok(())
}

pub(super) fn pending_mobile_secret_path(app: &AppHandle, session_id: &str) -> ApiResult<PathBuf> {
    let directory = pending_mobile_pairings_directory(app)?;
    ensure_private_directory(&directory)?;
    pending_mobile_secret_path_in(&directory, session_id)
}

pub(super) fn pending_mobile_secret_path_in(
    directory: &Path,
    session_id: &str,
) -> ApiResult<PathBuf> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))?;
    Ok(directory.join(format!("{session_id}.json")))
}

pub(super) fn consuming_mobile_secret_path_in(
    directory: &Path,
    session_id: &str,
    wallet_id: Uuid,
) -> ApiResult<PathBuf> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))?;
    Ok(directory.join(format!(".consuming-{session_id}--{wallet_id}.json")))
}

pub(super) fn parse_consuming_mobile_secret_name(name: &str) -> Option<(&str, Uuid)> {
    let value = name.strip_prefix(".consuming-")?.strip_suffix(".json")?;
    let (session_id, wallet_id) = value.split_once("--")?;
    Uuid::parse_str(session_id).ok()?;
    Some((session_id, Uuid::parse_str(wallet_id).ok()?))
}

pub(super) fn consuming_mobile_secret_paths_for_session(
    directory: &Path,
    session_id: &str,
) -> ApiResult<Vec<PathBuf>> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))?;
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(internal(error)),
    };
    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry.map_err(internal)?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some((candidate, _)) = parse_consuming_mobile_secret_name(&name) else {
            continue;
        };
        if candidate == session_id {
            let metadata = fs::symlink_metadata(entry.path()).map_err(internal)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(api_error(
                    "wallet_corrupt",
                    "Mobile pairing recovery storage is not a regular file.",
                ));
            }
            paths.push(entry.path());
        }
    }
    paths.sort();
    Ok(paths)
}

pub(super) fn transition_mobile_pairing_to_consuming(
    app: &AppHandle,
    session_id: &str,
    wallet_id: Uuid,
) -> ApiResult<PathBuf> {
    let directory = pending_mobile_pairings_directory(app)?;
    let active = pending_mobile_secret_path_in(&directory, session_id)?;
    if !consuming_mobile_secret_paths_for_session(&directory, session_id)?.is_empty() {
        return Err(api_error(
            "pairing_in_progress",
            "This mobile pairing is already being completed.",
        ));
    }
    let consuming = consuming_mobile_secret_path_in(&directory, session_id, wallet_id)?;
    fs::rename(&active, &consuming).map_err(internal)?;
    sync_private_directory(&directory)?;
    Ok(consuming)
}

pub(super) fn restore_consuming_mobile_pairing(
    directory: &Path,
    session_id: &str,
    wallet_id: Uuid,
) -> ApiResult<()> {
    let active = pending_mobile_secret_path_in(directory, session_id)?;
    let consuming = consuming_mobile_secret_path_in(directory, session_id, wallet_id)?;
    if !consuming.exists() {
        return Ok(());
    }
    if active.exists() {
        return Err(api_error(
            "wallet_corrupt",
            "Conflicting mobile pairing recovery files were found.",
        ));
    }
    fs::rename(consuming, active).map_err(internal)?;
    sync_private_directory(directory)
}

pub(super) fn remove_file_if_present(path: &Path) -> ApiResult<bool> {
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(internal(error)),
    }
}

pub(super) fn cancel_mobile_pairing_storage(directory: &Path, session_id: &str) -> ApiResult<()> {
    let active = pending_mobile_secret_path_in(directory, session_id)?;
    let mut changed = remove_file_if_present(&active)?;
    for consuming in consuming_mobile_secret_paths_for_session(directory, session_id)? {
        changed |= remove_file_if_present(&consuming)?;
    }
    if changed && directory.exists() {
        sync_private_directory(directory)?;
    }
    Ok(())
}

pub(super) fn active_mobile_pairing_sessions(directory: &Path) -> ApiResult<Vec<String>> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(internal(error)),
    };
    let mut sessions = Vec::new();
    for entry in entries {
        let entry = entry.map_err(internal)?;
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        let Some(session_id) = name.strip_suffix(".json") else {
            continue;
        };
        if name.starts_with('.') || Uuid::parse_str(session_id).is_err() {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path()).map_err(internal)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(api_error(
                "wallet_corrupt",
                "Mobile pairing storage is not a regular file.",
            ));
        }
        sessions.push(session_id.to_owned());
    }
    sessions.sort();
    Ok(sessions)
}

pub(super) fn reconcile_mobile_pairing_storage_impl(app: &AppHandle) -> ApiResult<()> {
    let directory = pending_mobile_pairings_directory(app)?;
    if !directory.exists() {
        return Ok(());
    }
    let registry = load_registry(app)?;
    let registered_wallets = registry
        .wallets
        .iter()
        .map(|profile| profile.id)
        .collect::<HashSet<_>>();
    let mut committed_pairings = HashSet::new();
    for profile in registry.wallets {
        let path = profile_directory(app, profile.id)?.join("coordination.json");
        if !path.is_file() {
            continue;
        }
        let metadata: CoordinationMetadata = serde_json::from_str(&read_private_text(&path)?)
            .map_err(|_| api_error("wallet_corrupt", "The coordination metadata is malformed."))?;
        if metadata.role == DeviceRole::MobileCosigner {
            if let Some(session_id) = metadata.pairing_session_id {
                Uuid::parse_str(&session_id).map_err(|_| {
                    api_error(
                        "wallet_corrupt",
                        "The coordinated wallet has an invalid pairing session identifier.",
                    )
                })?;
                committed_pairings.insert((session_id, profile.id));
            }
        }
    }
    reconcile_mobile_pairing_directory(
        &directory,
        &wallets_root(app)?,
        &registered_wallets,
        &committed_pairings,
    )
}

pub(super) fn reconcile_mobile_pairing_directory(
    directory: &Path,
    wallets_directory: &Path,
    registered_wallets: &HashSet<Uuid>,
    committed_pairings: &HashSet<(String, Uuid)>,
) -> ApiResult<()> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(internal(error)),
    };
    let committed_sessions = committed_pairings
        .iter()
        .map(|(session_id, _)| session_id.as_str())
        .collect::<HashSet<_>>();
    let mut active_sessions = HashSet::new();
    let mut active_files = Vec::new();
    let mut consuming_files = Vec::new();
    let mut temporary_files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(internal)?;
        let path = entry.path();
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        let active_session = name
            .strip_suffix(".json")
            .filter(|session| !name.starts_with('.') && Uuid::parse_str(session).is_ok());
        let consuming = parse_consuming_mobile_secret_name(&name);
        let secure_temporary = name
            .strip_prefix(".secure-")
            .and_then(|value| value.strip_suffix(".tmp"))
            .is_some_and(|value| Uuid::parse_str(value).is_ok());
        if active_session.is_none() && consuming.is_none() && !secure_temporary {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(internal)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(api_error(
                "wallet_corrupt",
                "Mobile pairing recovery storage is not a regular file.",
            ));
        }
        if secure_temporary {
            temporary_files.push(path);
        } else if let Some(session_id) = active_session {
            active_sessions.insert(session_id.to_owned());
            active_files.push((session_id.to_owned(), path));
        } else if let Some((session_id, wallet_id)) = consuming {
            consuming_files.push((session_id.to_owned(), wallet_id, path));
        }
    }
    let mut consuming_sessions = HashSet::new();
    for (session_id, wallet_id, _) in &consuming_files {
        if active_sessions.contains(session_id) || !consuming_sessions.insert(session_id.clone()) {
            return Err(api_error(
                "wallet_corrupt",
                "Conflicting mobile pairing recovery files were found.",
            ));
        }
        if registered_wallets.contains(wallet_id)
            && !committed_pairings.contains(&(session_id.clone(), *wallet_id))
        {
            return Err(api_error(
                "wallet_corrupt",
                "A mobile pairing recovery file conflicts with a registered wallet.",
            ));
        }
        let orphan = wallets_directory.join(wallet_id.to_string());
        if !registered_wallets.contains(wallet_id) && orphan.exists() {
            let metadata = fs::symlink_metadata(&orphan).map_err(internal)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(api_error(
                    "wallet_corrupt",
                    "Interrupted mobile wallet storage is not a regular directory.",
                ));
            }
        }
    }
    let mut pairing_changed = false;
    for path in temporary_files {
        fs::remove_file(path).map_err(internal)?;
        pairing_changed = true;
    }
    for (session_id, path) in active_files {
        if committed_sessions.contains(session_id.as_str()) {
            fs::remove_file(path).map_err(internal)?;
            pairing_changed = true;
        }
    }
    let mut wallets_changed = false;
    for (session_id, wallet_id, path) in consuming_files {
        if committed_pairings.contains(&(session_id.clone(), wallet_id)) {
            fs::remove_file(path).map_err(internal)?;
        } else {
            let orphan = wallets_directory.join(wallet_id.to_string());
            if orphan.exists() {
                fs::remove_dir_all(orphan).map_err(internal)?;
                wallets_changed = true;
            }
            fs::rename(path, pending_mobile_secret_path_in(directory, &session_id)?)
                .map_err(internal)?;
        }
        pairing_changed = true;
    }
    if wallets_changed && wallets_directory.exists() {
        sync_private_directory(wallets_directory)?;
    }
    if pairing_changed {
        sync_private_directory(directory)?;
    }
    Ok(())
}

pub(super) fn sync_private_directory(directory: &Path) -> ApiResult<()> {
    #[cfg(unix)]
    File::open(directory)
        .and_then(|value| value.sync_all())
        .map_err(internal)?;
    Ok(())
}

pub(super) fn coordination_metadata_path(app: &AppHandle, wallet_id: Uuid) -> ApiResult<PathBuf> {
    Ok(profile_directory(app, wallet_id)?.join("coordination.json"))
}

pub(super) fn read_coordination_metadata(
    app: &AppHandle,
    wallet_id: Uuid,
) -> ApiResult<CoordinationMetadata> {
    let encoded =
        read_private_text(&coordination_metadata_path(app, wallet_id)?).map_err(|_| {
            api_error(
                "signing_unavailable",
                "This wallet has no mobile signing identity on this device.",
            )
        })?;
    serde_json::from_str(&encoded)
        .map_err(|_| api_error("wallet_corrupt", "The coordination metadata is malformed."))
}
