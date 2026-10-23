//! Existing wallet orchestration, extracted without changing storage or authorization.
use super::*;

pub(super) fn load_registry(app: &AppHandle) -> ApiResult<WalletRegistry> {
    ensure_registry_migrated(app)?;
    let registry = registry::load(&registry_path(app)?).map_err(registry_api_error)?;
    ensure_registry_network(&registry)?;
    Ok(registry)
}

pub(super) fn ensure_registry_network(registry: &WalletRegistry) -> ApiResult<()> {
    if registry
        .wallets
        .iter()
        .all(|wallet| wallet.network == network_name())
    {
        Ok(())
    } else {
        Err(api_error(
            "wrong_network",
            format!(
                "This wallet registry does not belong to the active {} network. No wallet was opened.",
                network_name()
            ),
        ))
    }
}

pub(super) fn save_registry(app: &AppHandle, registry: &WalletRegistry) -> ApiResult<()> {
    registry::save_atomic(&registry_path(app)?, registry).map_err(registry_api_error)
}

pub(super) fn profile_directory(app: &AppHandle, id: Uuid) -> ApiResult<PathBuf> {
    Ok(wallets_root(app)?.join(id.to_string()))
}

pub(super) fn selected_profile(app: &AppHandle) -> ApiResult<WalletProfile> {
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

pub(super) fn selected_profile_of_kind(
    app: &AppHandle,
    expected: WalletKind,
) -> ApiResult<WalletProfile> {
    let profile = selected_profile(app)?;
    if profile.kind != expected {
        return Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not support this operation.",
        ));
    }
    Ok(profile)
}

pub(super) fn wallet_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile(app)?;
    if !matches!(profile.kind, WalletKind::SingleKey | WalletKind::WatchOnly) {
        return Err(api_error(
            "wrong_wallet_kind",
            "The selected wallet does not support this operation.",
        ));
    }
    profile_directory(app, profile.id)
}

pub(super) fn db_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(wallet_dir(app)?.join("wallet.sqlite"))
}

pub(super) fn secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(wallet_dir(app)?.join("secret.json"))
}

pub(super) fn wallet_secret_context(wallet_id: Uuid) -> secure_store::SecureStoreContext {
    secure_store::SecureStoreContext::new(wallet_id, secure_store::SecureStorePurpose::WalletSecret)
}

pub(super) fn node_auth_context(wallet_id: Uuid) -> secure_store::SecureStoreContext {
    secure_store::SecureStoreContext::new(wallet_id, secure_store::SecureStorePurpose::NodeAuth)
}

pub(super) fn external_signer_metadata_path(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile_of_kind(app, WalletKind::WatchOnly)?;
    Ok(profile_directory(app, profile.id)?.join("wallet.json"))
}

pub(super) fn multisig_dir(app: &AppHandle) -> ApiResult<PathBuf> {
    let profile = selected_profile_of_kind(app, WalletKind::Multisig)?;
    profile_directory(app, profile.id)
}

pub(super) fn multisig_metadata_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(multisig_dir(app)?.join("wallet.json"))
}

pub(super) fn multisig_secret_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(multisig_dir(app)?.join("secret.json"))
}

pub(super) fn multisig_db_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(multisig_dir(app)?.join("wallet.sqlite"))
}

pub(super) fn profile_from_directory(
    directory: &Path,
    id: Uuid,
    kind: WalletKind,
) -> ApiResult<WalletProfile> {
    let (name, checksum) = match kind {
        WalletKind::SingleKey => {
            let permit = database_open_permit_for_offline_identity_inspection()?;
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
        network: network_name().to_owned(),
        kind,
        descriptor_checksum: checksum,
        created_at: now(),
        backup_verified: true,
    })
}

pub(super) fn ensure_registry_migrated(app: &AppHandle) -> ApiResult<()> {
    let app_data = app_data_dir(app)?;
    ensure_private_directory(&app_data)?;
    ensure_private_directory(&wallets_root(app)?)?;
    let path = registry_path(app)?;
    if path.exists() {
        let registry = registry::load(&path).map_err(registry_api_error)?;
        ensure_registry_network(&registry)?;
        return Ok(());
    }
    if !is_regtest() {
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
        let profile = profile_from_directory(&legacy_directory, id, kind)?;
        let (external_descriptor, _) = descriptor_pair_from_directory(&legacy_directory, &profile)?;
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

pub(super) fn ensure_private_directory(path: &Path) -> ApiResult<()> {
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

pub(super) fn migrate_directories_with_rollback(
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

pub(super) fn prepare_profile_directory(app: &AppHandle) -> ApiResult<(Uuid, PathBuf)> {
    let id = Uuid::new_v4();
    let directory = prepare_profile_directory_with_id(app, id)?;
    Ok((id, directory))
}

pub(super) fn prepare_profile_directory_with_id(app: &AppHandle, id: Uuid) -> ApiResult<PathBuf> {
    ensure_registry_migrated(app)?;
    let directory = profile_directory(app, id)?;
    ensure_private_directory(&wallets_root(app)?)?;
    if directory.exists() {
        return Err(internal(
            "The new wallet storage identity is already in use.",
        ));
    }
    ensure_private_directory(&directory)?;
    Ok(directory)
}

pub(super) fn profile_descriptor_pair(
    app: &AppHandle,
    profile: &WalletProfile,
) -> ApiResult<(String, String)> {
    let directory = profile_directory(app, profile.id)?;
    descriptor_pair_from_directory(&directory, profile)
}

pub(super) fn descriptor_pair_from_directory(
    directory: &Path,
    profile: &WalletProfile,
) -> ApiResult<(String, String)> {
    let permit = database_open_permit_for_offline_identity_inspection()?;
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

pub(super) fn find_exact_descriptor_profile(
    app: &AppHandle,
    registry: &WalletRegistry,
    external_descriptor: &str,
) -> ApiResult<Option<WalletProfile>> {
    find_exact_descriptor_profile_with(registry, external_descriptor, |profile| {
        profile_descriptor_pair(app, profile).map(|(external, _)| external)
    })
}

pub(super) fn find_exact_descriptor_profile_with(
    registry: &WalletRegistry,
    external_descriptor: &str,
    mut read_external_descriptor: impl FnMut(&WalletProfile) -> ApiResult<String>,
) -> ApiResult<Option<WalletProfile>> {
    descriptor_checksum(external_descriptor)?;
    let mut matched = None;
    for profile in registry
        .wallets
        .iter()
        .filter(|profile| profile.network == network_name())
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

pub(super) fn exact_descriptor_identity_matches(
    candidate_external: &str,
    existing_external: &str,
) -> bool {
    candidate_external == existing_external
}

pub(super) fn commit_profile(
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

pub(super) fn commit_multisig_profile(
    app: &AppHandle,
    id: Uuid,
    wallet: &MultisigWalletDto,
) -> ApiResult<()> {
    commit_profile(
        app,
        WalletProfile {
            id,
            name: wallet.name.clone(),
            network: network_name().to_owned(),
            kind: WalletKind::Multisig,
            descriptor_checksum: descriptor_checksum(&wallet.external_descriptor)?,
            created_at: now(),
            backup_verified: true,
        },
        &wallet.external_descriptor,
    )
}

pub(super) fn cleanup_failed_profile(dir: &Path) -> ApiResult<()> {
    // A registry rename can become visible before its directory fsync fails.
    // Never infer "unregistered" from the caller's error alone: deleting such
    // a profile would leave a committed registry pointing at missing secrets.
    let wallet_id = dir
        .file_name()
        .and_then(|value| value.to_str())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| internal("Invalid failed-profile storage identity."))?;
    let wallets = dir
        .parent()
        .filter(|parent| parent.file_name().is_some_and(|name| name == "wallets"))
        .ok_or_else(|| internal("Invalid failed-profile storage root."))?;
    let root = wallets
        .parent()
        .ok_or_else(|| internal("Missing profile storage root."))?;
    let registry =
        registry::load(&root.join("wallet-registry.json")).map_err(registry_api_error)?;
    if registry
        .wallets
        .iter()
        .any(|profile| profile.id == wallet_id)
    {
        return Err(internal("Wallet registration is visible. Local files were preserved; reopen the wallet before retrying."));
    }
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(internal(error)),
    }
}

pub(super) fn finish_new_profile_attempt(
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

pub(super) fn read_private_text(path: &Path) -> ApiResult<String> {
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
