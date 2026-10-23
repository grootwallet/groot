use super::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSelection {
    profile: WalletProfile,
    unlocked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletProfileCompatibility {
    pub(crate) supported: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSetupSource {
    wallet_id: String,
    wallet_name: String,
    ready: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareWalletCreation {
    master_fingerprint: String,
    external_descriptor: String,
    internal_descriptor: String,
    network_setup_copied: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MainnetCoreAdmissionPurpose {
    OpenExistingWallet,
    CreateNewWallet,
}

pub(super) fn ensure_mainnet_core_ready_for_admission(
    initial_block_download: bool,
) -> ApiResult<()> {
    if initial_block_download {
        Err(api_error(
            "node_syncing",
            "Bitcoin Core must finish synchronizing before a mainnet wallet can be opened or created.",
        ))
    } else {
        Ok(())
    }
}

fn ensure_sync_source_supported_on_platform(source: &WalletSyncSource) -> ApiResult<()> {
    if cfg!(any(target_os = "ios", target_os = "android"))
        && matches!(source, WalletSyncSource::CompactFilters { .. })
    {
        return Err(api_error(
            "invalid_node_config",
            "Compact-filter sync is experimental and unavailable on mobile. Configure Bitcoin Core instead.",
        ));
    }
    Ok(())
}

pub(crate) fn profile_compatibility_for(
    profile: &WalletProfile,
    directory: &Path,
) -> WalletProfileCompatibility {
    if profile.kind == WalletKind::SingleKey {
        return WalletProfileCompatibility { supported: true };
    }
    WalletProfileCompatibility {
        supported: directory.join("wallet.json").is_file()
            && directory.join("secret.json").is_file(),
    }
}

#[tauri::command]
pub async fn wallet_exists(app: AppHandle) -> ApiResult<bool> {
    // Pairing-storage reconciliation can delete or restore staging state. It
    // must run under the same serialized operation lock as
    // `coordination_mobile_complete`, never concurrently with an in-flight
    // completion that is actively writing the same profile directory.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        super::coordination_commands::reconcile_mobile_pairing_storage(&app)?;
        let registry = load_registry(&app)?;
        Ok(registered_wallets_exist(&registry))
    })
    .await
    .map_err(internal)?
}

pub(crate) fn registered_wallets_exist(registry: &WalletRegistry) -> bool {
    !registry.wallets.is_empty()
}

#[tauri::command]
pub fn wallet_profiles(app: AppHandle) -> ApiResult<WalletRegistry> {
    load_registry(&app)
}

#[tauri::command]
pub fn wallet_session(app: AppHandle, state: State<'_, AppState>) -> ApiResult<WalletSelection> {
    let profile = selected_profile(&app)?;
    let unlocked = match require_unlocked_for_background_sync(&app, &state) {
        Ok(_) => true,
        Err(error) if error.code == "wallet_locked" => false,
        Err(error) => return Err(error),
    };
    Ok(WalletSelection { profile, unlocked })
}

#[tauri::command]
pub fn wallet_profile_compatibility(app: AppHandle) -> ApiResult<WalletProfileCompatibility> {
    let profile = selected_profile(&app)?;
    let directory = profile_directory(&app, profile.id)?;
    Ok(profile_compatibility_for(&profile, &directory))
}

#[tauri::command]
pub fn network_setup_sources(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<NetworkSetupSource>> {
    // This is public source availability, not access to a selected wallet's
    // protected connection. Adoption separately authorizes the exact source.
    let registry = load_registry(&app)?;
    for profile in &registry.wallets {
        authorize_wallet_session(
            &state,
            profile.id,
            false,
            registry.inactivity_timeout_minutes,
        )?;
    }
    let unlocked = state.unlocked_wallets.lock().map_err(internal)?;
    let node_auth = state.node_auth.lock().map_err(internal)?;
    Ok(registry
        .wallets
        .into_iter()
        .filter_map(|profile| {
            let path = node_config_path_for(&app, profile.id).ok()?;
            if !path.is_file() {
                return None;
            }
            let config = read_node_config_for(&app, profile.id).ok()?;
            let ready = unlocked.is_unlocked(profile.id)
                && (!cfg!(any(target_os = "ios", target_os = "android"))
                    || read_sync_source_for(&app, profile.id)
                        .and_then(|source| ensure_sync_source_supported_on_platform(&source))
                        .is_ok())
                && match config.auth {
                    RpcAuthMode::Cookie => true,
                    RpcAuthMode::UserPass => node_auth
                        .get(&profile.id)
                        .is_some_and(|session| session.config == config),
                };
            Some(NetworkSetupSource {
                wallet_id: profile.id.to_string(),
                wallet_name: profile.name,
                ready,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn wallet_rename(app: AppHandle, name: String) -> ApiResult<WalletProfile> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let wallet_id = require_unlocked(&app, &state)?;
        let _operation = metadata_operation_guard(&state, wallet_id)?;
        let mut registry = load_registry(&app)?;
        let renamed = registry
            .rename_selected(&name)
            .map_err(registry_api_error)?;
        save_registry(&app, &registry)?;
        Ok(renamed)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_inactivity_timeout_save(
    app: AppHandle,
    minutes: u16,
) -> ApiResult<WalletRegistry> {
    let expected_wallet_id = load_registry(&app)?.selected_wallet_id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        if load_registry(&app)?.selected_wallet_id != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Retry in the current wallet.",
            ));
        }

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
            let mut authenticated_descriptors = state
                .authenticated_software_descriptors
                .lock()
                .map_err(internal)?;
            for wallet_id in expired_wallets {
                node_auth.remove(&wallet_id);
                authenticated_descriptors.remove(&wallet_id);
            }
        }
        Ok(registry)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_select(app: AppHandle, wallet_id: String) -> ApiResult<WalletSelection> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        state.pending_mnemonic.lock().map_err(internal)?.take();
        let id = Uuid::parse_str(&wallet_id)
            .map_err(|_| api_error("wallet_not_found", "The selected wallet does not exist."))?;
        let mut registry = load_registry(&app)?;
        registry.select(id).map_err(registry_api_error)?;
        save_registry(&app, &registry)?;
        state.proposals.lock().map_err(internal)?.clear();
        let profile = registry
            .wallets
            .into_iter()
            .find(|wallet| wallet.id == id)
            .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))?;
        let unlocked = match require_unlocked_for_background_sync(&app, &state) {
            Ok(_) => true,
            Err(error) if error.code == "wallet_locked" => false,
            Err(error) => return Err(error),
        };
        Ok(WalletSelection { profile, unlocked })
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_generate_mnemonic(
    app: AppHandle,
    supplemental_entropy: Option<SupplementalEntropyDto>,
) -> ApiResult<bool> {
    require_software_key_operation()?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        let supplemental_digest = supplemental_entropy
            .map(supplemental_entropy_digest)
            .transpose()?;
        let mnemonic = generate_software_mnemonic(supplemental_digest.as_deref())?;
        let words = Zeroizing::new(mnemonic.to_string());
        let outcome = native_backup::present(&app, words.as_str()).map_err(internal)?;
        if outcome.cancelled {
            state.pending_mnemonic.lock().map_err(internal)?.take();
            return Err(api_error(
                "onboarding_cancelled",
                "Recovery-word backup was cancelled.",
            ));
        }
        let backup_verified = outcome.verified;
        *state.pending_mnemonic.lock().map_err(internal)? = Some(PendingMnemonic {
            words,
            created_at: now(),
            backup_verified,
        });
        Ok(backup_verified)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_cancel_onboarding(
    app: AppHandle,
    preserve_mainnet_admission: Option<bool>,
) -> ApiResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        state.pending_mnemonic.lock().map_err(internal)?.take();
        if preserve_mainnet_admission != Some(true) {
            clear_mainnet_node_admission(&state)?;
        }
        Ok(())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_create(
    app: AppHandle,
    name: String,
    credential: String,
    network_setup_source_wallet_id: Option<String>,
) -> ApiResult<SoftwareWalletCreation> {
    let credential = Zeroizing::new(credential);
    require_software_key_operation()?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        let _admission_cleanup = clear_new_wallet_admission_on_exit(&state);
        validate_new_wallet_passphrase(credential.as_str())?;
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
        let master_fingerprint =
            software_wallet_master_fingerprint(&mnemonic, credential.as_str())?;
        let authenticated_descriptors =
            software_wallet_descriptors(&mnemonic, credential.as_str())?;
        let network_setup_copied = match create_from_mnemonic(
            &app,
            &state,
            name,
            mnemonic,
            credential.as_str(),
            pending.backup_verified,
            network_setup_source_wallet_id.as_deref(),
        ) {
            Ok(network_setup_copied) => network_setup_copied,
            Err(error) => {
                *state.pending_mnemonic.lock().map_err(internal)? = Some(pending);
                return Err(error);
            }
        };
        let selected = selected_profile_of_kind(&app, WalletKind::SingleKey)?.id;
        state
            .authenticated_software_descriptors
            .lock()
            .map_err(internal)?
            .insert(selected, authenticated_descriptors.clone());
        unlock_selected(&app, &state)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::WalletCreated,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::DiagnosticWalletKind::Software),
                ..Default::default()
            },
            None,
        );
        Ok(SoftwareWalletCreation {
            master_fingerprint,
            external_descriptor: authenticated_descriptors.0,
            internal_descriptor: authenticated_descriptors.1,
            network_setup_copied,
        })
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_recover(app: AppHandle, name: String, credential: String) -> ApiResult<()> {
    let credential = Zeroizing::new(credential);
    require_software_key_operation()?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        let _admission_cleanup = clear_new_wallet_admission_on_exit(&state);
        validate_wallet_passphrase(credential.as_str())?;
        let mnemonic_words = native_backup::recover(&app)
            .map_err(internal)?
            .ok_or_else(|| api_error("onboarding_cancelled", "Wallet recovery was cancelled."))?;
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
                "Groot requires exactly 24 recovery words.",
            ));
        }
        let authenticated_descriptors =
            software_wallet_descriptors(&mnemonic, credential.as_str())?;
        create_from_mnemonic(
            &app,
            &state,
            name,
            mnemonic,
            credential.as_str(),
            true,
            None,
        )?;
        let selected = selected_profile_of_kind(&app, WalletKind::SingleKey)?.id;
        state
            .authenticated_software_descriptors
            .lock()
            .map_err(internal)?
            .insert(selected, authenticated_descriptors);
        unlock_selected(&app, &state)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::WalletRecovered,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                trigger: diagnostics::DiagnosticTrigger::Recovery,
                wallet_kind: Some(diagnostics::DiagnosticWalletKind::Software),
                ..Default::default()
            },
            None,
        );
        Ok(())
    })
    .await
    .map_err(internal)?
}

fn load_backup_mnemonic(
    app: &AppHandle,
    state: &State<'_, AppState>,
    profile: &WalletProfile,
    credential: &str,
) -> ApiResult<Mnemonic> {
    if profile.kind == WalletKind::Multisig {
        return coordination_commands::load_mobile_backup_mnemonic(app, state, profile, credential);
    }
    if profile.kind != WalletKind::SingleKey {
        return Err(api_error(
            "wrong_wallet_kind",
            "This wallet does not hold recovery words.",
        ));
    }
    check_auth_throttle(app, state)?;
    let result = decrypt_mnemonic(app, credential);
    record_auth_result(app, state, &result)?;
    result
}

#[tauri::command]
pub async fn wallet_verify_backup(app: AppHandle, credential: String) -> ApiResult<bool> {
    let credential = Zeroizing::new(credential);
    require_software_key_operation()?;
    let expected_wallet_id = selected_profile(&app)?.id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        if selected_profile(&app)?.id != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Retry in the current wallet.",
            ));
        }

        require_unlocked(&app, &state)?;
        let profile = selected_profile(&app)?;
        if profile.backup_verified {
            return Ok(true);
        }
        let mnemonic = load_backup_mnemonic(&app, &state, &profile, credential.as_str())?;
        let words = Zeroizing::new(mnemonic.to_string());
        if !native_backup::verify(&app, words.as_str()).map_err(internal)? {
            return Ok(false);
        }

        let mut registry = load_registry(&app)?;
        let selected = registry
            .wallets
            .iter_mut()
            .find(|wallet| wallet.id == profile.id)
            .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))?;
        selected.backup_verified = true;
        save_registry(&app, &registry)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::BackupVerified,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::wallet_kind(profile.kind)),
                ..Default::default()
            },
            None,
        );
        Ok(true)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_reveal_and_verify_backup(
    app: AppHandle,
    credential: String,
) -> ApiResult<bool> {
    let credential = Zeroizing::new(credential);
    require_software_key_operation()?;
    let expected_wallet_id = selected_profile(&app)?.id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        if selected_profile(&app)?.id != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Retry in the current wallet.",
            ));
        }

        require_unlocked(&app, &state)?;
        let profile = selected_profile(&app)?;
        if profile.backup_verified {
            return Ok(true);
        }
        let mnemonic = load_backup_mnemonic(&app, &state, &profile, credential.as_str())?;
        let words = Zeroizing::new(mnemonic.to_string());
        let outcome = native_backup::present(&app, words.as_str()).map_err(internal)?;
        if outcome.cancelled || !outcome.verified {
            return Ok(false);
        }

        let mut registry = load_registry(&app)?;
        let selected = registry
            .wallets
            .iter_mut()
            .find(|wallet| wallet.id == profile.id)
            .ok_or_else(|| registry_api_error(RegistryError::UnknownSelection))?;
        selected.backup_verified = true;
        save_registry(&app, &registry)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::BackupVerified,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::wallet_kind(profile.kind)),
                ..Default::default()
            },
            None,
        );
        Ok(true)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_unlock(app: AppHandle, credential: String) -> ApiResult<()> {
    let credential = Zeroizing::new(credential);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        check_auth_throttle(&app, &state)?;
        let result = match selected_profile(&app)?.kind {
            WalletKind::SingleKey => {
                decrypt_mnemonic(&app, credential.as_str()).and_then(|mnemonic| {
                    software_wallet_descriptors(&mnemonic, credential.as_str()).map(Some)
                })
            }
            WalletKind::Multisig => {
                verify_multisig_credential(&app, credential.as_str()).map(|()| None)
            }
            WalletKind::WatchOnly => {
                verify_external_signer_credential(&app, credential.as_str()).map(|()| None)
            }
        };
        record_auth_result(&app, &state, &result)?;
        let authenticated_descriptors = result?;
        provision_managed_mainnet_node_if_missing(&app, &state, credential.as_str())?;
        load_node_auth_session(&app, &state, credential.as_str())?;
        if let Some(descriptors) = authenticated_descriptors {
            let selected = selected_profile_of_kind(&app, WalletKind::SingleKey)?.id;
            state
                .authenticated_software_descriptors
                .lock()
                .map_err(internal)?
                .insert(selected, descriptors);
        }
        unlock_selected(&app, &state)?;
        clear_mainnet_node_admission(&state)?;
        let kind = diagnostics::wallet_kind(selected_profile(&app)?.kind);
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::WalletUnlocked,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(kind),
                ..Default::default()
            },
            None,
        );
        Ok(())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_lock(app: AppHandle) -> ApiResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        state.pending_mnemonic.lock().map_err(internal)?.take();
        state.proposals.lock().map_err(internal)?.clear();
        let profile = selected_profile(&app)?;
        lock_wallet(&state, profile.id)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::WalletLocked,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::wallet_kind(profile.kind)),
                ..Default::default()
            },
            None,
        );
        Ok(())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_lock_all(app: AppHandle) -> ApiResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        state.proposals.lock().map_err(internal)?.clear();
        state.unlocked_wallets.lock().map_err(internal)?.lock_all();
        *state.pending_mnemonic.lock().map_err(internal)? = None;
        state.verified_recovery.lock().map_err(internal)?.clear();
        state
            .pending_hardware_pins
            .lock()
            .map_err(internal)?
            .clear();
        *state.recent_hardware_scan.lock().map_err(internal)? = None;
        state.node_auth.lock().map_err(internal)?.clear();
        state
            .authenticated_software_descriptors
            .lock()
            .map_err(internal)?
            .clear();
        state.saved_files.lock().map_err(internal)?.clear();
        #[cfg(target_os = "macos")]
        state.pending_pdf_exports.lock().map_err(internal)?.clear();
        state
            .pending_policy_verifications
            .lock()
            .map_err(internal)?
            .clear();
        Ok(())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_snapshot(app: AppHandle) -> ApiResult<WalletSnapshotDto> {
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
        require_wallet_read_context(&app, &state, wallet_id, None)?;
        let mut db = if persisted_read {
            open_selected_db_for_persisted_read(&app, false)?
        } else {
            open_db(&app)?
        };
        let wallet = load_wallet(&mut db)?;
        let snapshot = snapshot_for_view(&wallet, &db, None, false, None, false, !persisted_read)?;
        require_wallet_read_context(&app, &state, wallet_id, None)?;
        Ok(snapshot)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_sync(app: AppHandle, automatic: Option<bool>) -> ApiResult<WalletSnapshotDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let profile = selected_profile(&app)?;
        let source = read_sync_source(&app)?;
        let context = diagnostics::DiagnosticContext {
            trigger: if automatic.unwrap_or(false) {
                diagnostics::DiagnosticTrigger::Automatic
            } else {
                diagnostics::DiagnosticTrigger::Manual
            },
            wallet_kind: Some(diagnostics::wallet_kind(profile.kind)),
            sync_source: Some(diagnostics::sync_source(&source)),
            ..Default::default()
        };
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::Sync,
            diagnostics::DiagnosticOutcome::Started,
            context,
            None,
        );
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::Sync,
            diagnostics::DiagnosticOutcome::Progress,
            diagnostics::DiagnosticContext {
                progress_percent: Some(0),
                ..context
            },
            None,
        );
        let result = run_foreground_sync(&app, &state, false).and_then(|snapshot| {
            update_public_network_status(&app, None, Some(snapshot.chain_tip.height.into()))?;
            Ok(snapshot)
        });
        diagnostics::record_result(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::Sync,
            context,
            &result,
        );
        result
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn wallet_sync_cancel(state: State<'_, AppState>) -> ApiResult<()> {
    cancel_foreground_sync(&state).map(|_| ())
}

#[tauri::command]
pub fn wallet_sync_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Option<WalletSyncStatusDto>> {
    let wallet_id = selected_profile(&app)?.id.to_string();
    let status = state.sync_status.lock().map_err(internal)?;
    Ok(status
        .as_ref()
        .filter(|status| status.wallet_id == wallet_id)
        .cloned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPage {
    session_id: Uuid,
    envelopes: Vec<notifications::NotificationEnvelope>,
}

#[tauri::command]
pub async fn wallet_notifications(
    app: AppHandle,
    wallet_id: Uuid,
    multisig: bool,
) -> ApiResult<NotificationPage> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        let session_id = require_wallet_read_context(&app, &state, wallet_id, None)?;
        let db = if multisig {
            open_multisig_db(&app)?
        } else {
            open_db(&app)?
        };
        Ok(NotificationPage {
            session_id,
            envelopes: notifications::pending(&db).map_err(internal)?,
        })
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_notifications_ack(
    app: AppHandle,
    wallet_id: Uuid,
    session_id: Uuid,
    multisig: bool,
    ids: Vec<String>,
) -> ApiResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_wallet_read_context(&app, &state, wallet_id, Some(session_id))?;
        validate_notification_acknowledgements(&ids)?;
        let mut db = if multisig {
            open_multisig_db(&app)?
        } else {
            open_db(&app)?
        };
        notifications::acknowledge(&mut db, &ids).map_err(internal)?;
        Ok(())
    })
    .await
    .map_err(internal)?
}

pub(crate) fn validate_notification_acknowledgements(ids: &[String]) -> ApiResult<()> {
    if ids.len() > 1_000 || ids.iter().any(|id| id.len() > 64) {
        return Err(api_error(
            "internal_error",
            "The notification acknowledgement is invalid.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn address_create(app: AppHandle, labels: Vec<String>) -> ApiResult<ReceiveAddressDto> {
    let expected_wallet_id = load_registry(&app)?.selected_wallet_id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        if load_registry(&app)?.selected_wallet_id != expected_wallet_id {
            return Err(api_error("wallet_selection_changed", "The selected wallet changed. Retry in the current wallet."));
        }
        let wallet_id = require_unlocked(&app, &state)?;
        coordination_commands::require_receive_authority(&app, &selected_profile(&app)?.kind)?;
        let labels = normalize_labels(labels)?;
        let label = labels[0].clone();
        let mut db = open_db(&app)?;
        let mut transaction = db.transaction().map_err(internal)?;
        let mut wallet = Wallet::load()
            .check_network(network())
            .load_wallet(&mut transaction)
            .map_err(internal)?
            .ok_or_else(|| api_error("wallet_not_found", "Wallet database is empty."))?;
        let info = wallet.reveal_next_address(KeychainKind::External);
        enforce_recovery_gap(&transaction, info.index)?;
        let created = now();
        transaction
            .execute(
                "INSERT INTO groot_addresses (idx, address, label, created_at, state) VALUES (?1, ?2, ?3, ?4, 'awaiting')",
                params![info.index, info.address.to_string(), label, created],
            )
            .map_err(internal)?;
        label_provenance::assign_labels(
            &transaction,
            &labels,
            LabelOrigin::Receive,
            "address",
            &info.index.to_string(),
            created,
        )
        .map_err(internal)?;
        wallet.persist(&mut transaction).map_err(internal)?;
        transaction.commit().map_err(internal)?;
        forget_core_mempool_snapshot(&state, wallet_id);
        let response = ReceiveAddressDto {
            id: info.index,
            testnet_alias: regtest_testnet_address_alias(&info.address.to_string()),
            address: info.address.to_string(),
            label,
            labels,
            created: created.to_string(),
            status: "awaiting".to_owned(),
            derivation_path: format!("{}/0/{}", singlesig_account_path(), info.index),
            hardware_verified_at: None,
            hardware_verified_by: None,
        };
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::ReceiveAddressGenerated,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::wallet_kind(selected_profile(&app)?.kind)),
                item_count: u32::try_from(response.labels.len()).ok(),
                ..Default::default()
            },
            None,
        );
        Ok(response)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn address_discard(app: AppHandle, id: u32) -> ApiResult<()> {
    let expected_wallet_id = load_registry(&app)?.selected_wallet_id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

    let _operation = operation_guard(&state)?;
        if load_registry(&app)?.selected_wallet_id != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Retry in the current wallet.",
            ));
        }

    require_unlocked(&app, &state)?;
    let db = open_db(&app)?;
    let changed = db
        .execute(
            "UPDATE groot_addresses SET state = 'discarded' WHERE idx = ?1 AND state = 'awaiting' AND observed = 0",
            params![id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "address_not_discardable",
            "Only an unused address awaiting payment can be discarded.",
        ));
    }
    diagnostics::record(
        &app,
        &state,
        diagnostics::DiagnosticEventKind::ReceiveAddressDiscarded,
        diagnostics::DiagnosticOutcome::Succeeded,
        diagnostics::DiagnosticContext {
            wallet_kind: Some(diagnostics::wallet_kind(selected_profile(&app)?.kind)),
            ..Default::default()
        },
        None,
    );
    Ok(())
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn coin_set_frozen(app: AppHandle, outpoint: String, frozen: bool) -> ApiResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let mut db = open_db(&app)?;
        set_coin_frozen(&mut db, &outpoint, frozen)?;
        diagnostics::record(
            &app,
            &state,
            if frozen {
                diagnostics::DiagnosticEventKind::CoinFrozen
            } else {
                diagnostics::DiagnosticEventKind::CoinUnfrozen
            },
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::wallet_kind(selected_profile(&app)?.kind)),
                ..Default::default()
            },
            None,
        );
        Ok(())
    })
    .await
    .map_err(internal)?
}

pub(crate) fn set_coin_frozen(db: &mut Connection, outpoint: &str, frozen: bool) -> ApiResult<()> {
    let parsed = OutPoint::from_str(outpoint.trim())
        .map_err(|_| api_error("invalid_coin", "The selected coin outpoint is invalid."))?;
    let wallet = load_wallet(db)?;
    if !wallet.list_unspent().any(|coin| coin.outpoint == parsed) {
        return Err(api_error(
            "coin_unavailable",
            "The selected coin is no longer available.",
        ));
    }
    if frozen {
        db.execute(
            "INSERT OR REPLACE INTO groot_frozen_coins (outpoint, frozen_at) VALUES (?1, ?2)",
            params![parsed.to_string(), now()],
        )
        .map_err(internal)?;
    } else {
        db.execute(
            "DELETE FROM groot_frozen_coins WHERE outpoint = ?1",
            params![parsed.to_string()],
        )
        .map_err(internal)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn multisig_coin_set_frozen(
    app: AppHandle,
    outpoint: String,
    frozen: bool,
) -> ApiResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let mut db = open_multisig_db(&app)?;
        set_coin_frozen(&mut db, &outpoint, frozen)?;
        diagnostics::record(
            &app,
            &state,
            if frozen {
                diagnostics::DiagnosticEventKind::CoinFrozen
            } else {
                diagnostics::DiagnosticEventKind::CoinUnfrozen
            },
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                wallet_kind: Some(diagnostics::DiagnosticWalletKind::Multisig),
                ..Default::default()
            },
            None,
        );
        Ok(())
    })
    .await
    .map_err(internal)?
}

pub(crate) fn core_fee_rate(fee_rate: Option<Amount>) -> ApiResult<f64> {
    let sats_per_kvb = fee_rate
        .map(Amount::to_sat)
        .filter(|value| *value > 0)
        .ok_or_else(|| {
            api_error(
                "fee_estimate_unavailable",
                "Bitcoin Core does not have a fee estimate for this target yet. Enter a custom sat/vB rate or try again later.",
            )
        })?;
    let sats_per_vbyte = sats_per_kvb as f64 / 1_000.0;
    if sats_per_vbyte > 10_000.0 {
        return Err(api_error(
            "fee_estimate_unavailable",
            "Bitcoin Core returned a fee estimate outside Groot's safe range. Enter a custom sat/vB rate or try again later.",
        ));
    }
    Ok(sats_per_vbyte)
}

pub(crate) fn estimate_core_fee(
    client: &Client,
    blocks: u16,
    mode: EstimateMode,
) -> ApiResult<f64> {
    let estimate = client
        .estimate_smart_fee(blocks, Some(mode))
        .map_err(|_| {
            api_error(
                "fee_estimate_unavailable",
                "Bitcoin Core fee estimates are unavailable. Enter a custom sat/vB rate or try again later.",
            )
        })?;
    core_fee_rate(estimate.fee_rate)
}

pub(crate) fn ordered_fee_estimates(economy: f64, standard: f64, priority: f64) -> (f64, f64, f64) {
    let standard = standard.max(economy);
    let priority = priority.max(standard);
    (economy, standard, priority)
}

// Missing targets stay unavailable: a longer-target estimate is not a promise
// about confirmation at a shorter target. This DTO is not persisted.
pub(crate) fn partial_fee_estimates(
    economy: Option<f64>,
    standard: Option<f64>,
    priority: Option<f64>,
) -> ApiResult<FeeEstimatesDto> {
    if economy.is_none() && standard.is_none() && priority.is_none() {
        return Err(api_error(
            "fee_estimate_unavailable",
            "Bitcoin Core fee estimates are unavailable. Enter a custom sat/vB rate or try again later.",
        ));
    }
    if let (Some(e), Some(s), Some(p)) = (economy, standard, priority) {
        let (economy, standard, priority) = ordered_fee_estimates(e, s, p);
        return Ok(FeeEstimatesDto {
            economy: Some(economy),
            standard: Some(standard),
            priority: Some(priority),
            source: "Bitcoin Core",
        });
    }
    let standard = standard.map(|rate| rate.max(economy.unwrap_or(rate)));
    let priority = priority.map(|rate| rate.max(standard.or(economy).unwrap_or(rate)));
    Ok(FeeEstimatesDto {
        economy,
        standard,
        priority,
        source: "Bitcoin Core",
    })
}

pub(crate) const SPARSE_MEMPOOL_LIMIT_VBYTES: u64 = 900_000;
pub(crate) const MAX_BACKEND_FEE_RATE_SAT_VB: u64 = 1_000;

pub(crate) fn sparse_mempool_fee_rate(
    entries: impl IntoIterator<Item = (u64, u64)>,
) -> Option<f64> {
    let mut total_vbytes = 0_u64;
    let mut lowest_rate = None;
    for (vsize, modified_fee_sats) in entries {
        if vsize == 0 {
            continue;
        }
        total_vbytes = total_vbytes.checked_add(vsize)?;
        if total_vbytes > SPARSE_MEMPOOL_LIMIT_VBYTES {
            return None;
        }
        let rate = modified_fee_sats.div_ceil(vsize).max(1);
        if rate > MAX_BACKEND_FEE_RATE_SAT_VB {
            return None;
        }
        lowest_rate = Some(lowest_rate.map_or(rate, |current: u64| current.min(rate)));
    }
    lowest_rate.map(|rate| rate as f64)
}

pub(crate) fn current_mempool_fee_rate(
    entries: impl IntoIterator<Item = (u64, u64)>,
    empty_rate: f64,
) -> Option<f64> {
    let mut entries = entries.into_iter().peekable();
    if entries.peek().is_none() {
        return Some(empty_rate);
    }
    sparse_mempool_fee_rate(entries)
}

#[tauri::command]
pub async fn fees_estimate(app: AppHandle) -> ApiResult<FeeEstimatesDto> {
    let expected_wallet_id = if is_regtest() {
        None
    } else {
        Some(selected_profile(&app)?.id)
    };
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        if expected_wallet_id.is_some() && Some(selected_profile(&app)?.id) != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Retry in the current wallet.",
            ));
        }

        if is_regtest() {
            let estimates = FeeEstimatesDto {
                economy: Some(1.0),
                standard: Some(2.0),
                priority: Some(5.0),
                source: "Regtest policy",
            };
            update_public_network_status(&app, estimates.priority, None)?;
            return Ok(estimates);
        }
        require_unlocked(&app, &state)?;
        let client = rpc_client(&app, &state)?;
        checked_chain_identity(&client)?;
        let mut estimates = partial_fee_estimates(
            estimate_core_fee(&client, 144, EstimateMode::Economical).ok(),
            estimate_core_fee(&client, 6, EstimateMode::Economical).ok(),
            estimate_core_fee(&client, 2, EstimateMode::Economical).ok(),
        )?;
        // Retain the existing bounded current-mempool adjustment only when all
        // historical targets are available. Never fill a missing target.
        if let (Some(economy), Some(_), Some(_)) =
            (estimates.economy, estimates.standard, estimates.priority)
        {
            let current = client.get_raw_mempool_verbose().ok().and_then(|entries| {
                current_mempool_fee_rate(
                    entries
                        .into_values()
                        .map(|entry| (entry.vsize, entry.fees.modified.to_sat())),
                    economy,
                )
            });
            if let Some(rate) = current {
                estimates.economy = Some(rate);
                estimates.standard = Some(rate);
                estimates.priority = Some(rate);
            }
        }
        update_public_network_status(&app, estimates.priority, None)?;
        Ok(estimates)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn node_config(app: AppHandle) -> ApiResult<CoreNodeConfig> {
    read_node_config(&app)
}

#[tauri::command]
pub async fn managed_node_configure(
    app: AppHandle,
    credential: String,
) -> ApiResult<NodeStatusDto> {
    let credential = Zeroizing::new(credential);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        if network() != Network::Bitcoin {
            return Err(api_error(
                "invalid_node_config",
                "The Groot managed node is available only on Mainnet.",
            ));
        }
        check_auth_throttle(&app, &state)?;
        let verified = verify_selected_credential(&app, credential.as_str());
        record_auth_result(&app, &state, &verified)?;
        verified?;
        let destination = selected_profile(&app)?.id;
        let pending = managed_mainnet_node_admission(
            MainnetNodeAdmissionScope::ExistingWallet(destination),
        )
        .ok_or_else(|| {
            api_error(
                "network_unavailable",
                "Groot could not provision managed-node access. Check the connection and try again.",
            )
        })?;
        persist_mainnet_node_admission(
            &app,
            &state,
            destination,
            credential.as_str(),
            pending,
        )?;
        let status = node_test(&app, &state)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::NetworkConfigurationChanged,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                sync_source: Some(diagnostics::DiagnosticSyncSource::BitcoinCore),
                ..Default::default()
            },
            None,
        );
        Ok(status)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn network_public_status(app: AppHandle) -> ApiResult<PublicNetworkStatusDto> {
    read_public_network_status(&app)
}

#[tauri::command]
pub async fn mainnet_core_admit(
    app: AppHandle,
    config: CoreNodeConfig,
    password: String,
    purpose: MainnetCoreAdmissionPurpose,
) -> ApiResult<NodeStatusDto> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        clear_mainnet_node_admission(&state)?;
        crate::release_policy::ensure_runtime_network_enabled(network()).map_err(|_| {
            api_error(
                "mainnet_disabled",
                "This Groot build is not authorized to connect a mainnet wallet.",
            )
        })?;
        if network() != Network::Bitcoin
            || config.auth != RpcAuthMode::UserPass
            || password.is_empty()
            || password.len() > 1024
        {
            return Err(api_error(
                "invalid_node_config",
                "Mainnet requires protected RPC credentials for an admitted Bitcoin Core node.",
            ));
        }
        config.validate().map_err(network_config_api_error)?;
        let scope = match purpose {
            MainnetCoreAdmissionPurpose::OpenExistingWallet => {
                let selected = selected_profile(&app)?;
                if read_node_config_for(&app, selected.id)? != config {
                    return Err(api_error(
                        "invalid_node_config",
                        "Enter this wallet's saved Bitcoin Core connection exactly as configured.",
                    ));
                }
                MainnetNodeAdmissionScope::ExistingWallet(selected.id)
            }
            MainnetCoreAdmissionPurpose::CreateNewWallet => MainnetNodeAdmissionScope::NewWallet,
        };
        let result = (|| {
            let client = candidate_rpc_client(&config, password.as_str())?;
            let status = checked_node_status(&client, config.clone())?;
            ensure_mainnet_core_ready_for_admission(status.initial_block_download)?;
            *state
                .pending_mainnet_node_admission
                .lock()
                .map_err(internal)? = Some(PendingMainnetNodeAdmission {
                config,
                password,
                created_at: Instant::now(),
                scope,
            });
            Ok(status)
        })();
        if result.is_err() {
            clear_mainnet_node_admission(&state)?;
        }
        result
    })
    .await
    .map_err(internal)?
}

pub(super) fn persist_mainnet_node_admission_for_new_profile(
    app: &AppHandle,
    state: &State<'_, AppState>,
    destination: Uuid,
    credential: &str,
) -> ApiResult<Option<u32>> {
    if network() != Network::Bitcoin {
        return Ok(None);
    }
    crate::release_policy::ensure_database_open_enabled(network(), true).map_err(|_| {
        api_error(
            "node_admission_required",
            "Connect and verify an approved Bitcoin Core node before creating a mainnet wallet.",
        )
    })?;
    let pending = match current_mainnet_node_admission(state) {
        Ok(pending) => pending,
        Err(error) if error.code == "node_admission_required" => {
            let Some(pending) =
                managed_mainnet_node_admission(MainnetNodeAdmissionScope::NewWallet)
            else {
                return Ok(None);
            };
            pending
        }
        Err(error) => return Err(error),
    };
    if pending.scope != MainnetNodeAdmissionScope::NewWallet {
        return Err(api_error(
            "node_admission_required",
            "Verify the Bitcoin Core node specifically for new mainnet wallet creation.",
        ));
    }
    let birthday_height = u32::try_from(checked_block_height(&candidate_rpc_client(
        &pending.config,
        pending.password.as_str(),
    )?)?)
    .map_err(internal)?;
    persist_mainnet_node_admission(app, state, destination, credential, pending)?;
    Ok(Some(birthday_height))
}

fn provision_managed_mainnet_node_if_missing(
    app: &AppHandle,
    state: &State<'_, AppState>,
    credential: &str,
) -> ApiResult<bool> {
    if network() != Network::Bitcoin {
        return Ok(false);
    }
    let destination = selected_profile(app)?.id;
    if node_config_path_for(app, destination)?.exists() {
        return Ok(false);
    }
    let Some(pending) =
        managed_mainnet_node_admission(MainnetNodeAdmissionScope::ExistingWallet(destination))
    else {
        return Ok(false);
    };
    persist_mainnet_node_admission(app, state, destination, credential, pending)?;
    Ok(true)
}

fn managed_mainnet_node_admission(
    scope: MainnetNodeAdmissionScope,
) -> Option<PendingMainnetNodeAdmission> {
    let managed = crate::managed_gateway::enroll().ok()?;
    if !crate::managed_gateway::is_managed_config(&managed.config) {
        return None;
    }
    let client = candidate_rpc_client(&managed.config, managed.password.as_str()).ok()?;
    let status = checked_node_status(&client, managed.config.clone()).ok()?;
    ensure_mainnet_core_ready_for_admission(status.initial_block_download).ok()?;
    ensure_remote_core_sync_capabilities(&client, true).ok()?;
    Some(PendingMainnetNodeAdmission {
        config: managed.config,
        password: managed.password,
        created_at: Instant::now(),
        scope,
    })
}

fn persist_mainnet_node_admission(
    app: &AppHandle,
    state: &State<'_, AppState>,
    destination: Uuid,
    credential: &str,
    pending: PendingMainnetNodeAdmission,
) -> ApiResult<()> {
    let protected = Zeroizing::new(
        serde_json::to_vec(&ProtectedNodeAuthRef {
            version: PROTECTED_NODE_AUTH_VERSION,
            config: &pending.config,
            password: pending.password.as_str(),
        })
        .map_err(internal)?,
    );
    secure_store::store(
        &node_secret_path_for(app, destination)?,
        protected.as_slice(),
        credential,
        node_auth_context(destination),
    )
    .map_err(secure_store_error)?;
    write_private_json(&node_config_path_for(app, destination)?, &pending.config)?;
    write_private_json(
        &sync_source_path_for(app, destination)?,
        &WalletSyncSource::BitcoinCore,
    )?;
    state.node_auth.lock().map_err(internal)?.insert(
        destination,
        NodeAuthSession {
            config: pending.config,
            password: pending.password,
            mainnet_node_verified: true,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn wallet_sync_source(app: AppHandle) -> ApiResult<WalletSyncSource> {
    read_sync_source(&app)
}

#[tauri::command]
pub async fn wallet_sync_source_save(
    app: AppHandle,
    source: WalletSyncSource,
    credential: String,
) -> ApiResult<WalletSyncSource> {
    let credential = Zeroizing::new(credential);
    let expected_wallet_id = load_registry(&app)?.selected_wallet_id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        let _operation = operation_guard(&state)?;
        if load_registry(&app)?.selected_wallet_id != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Retry in the current wallet.",
            ));
        }

        require_unlocked(&app, &state)?;
        ensure_sync_source_supported_on_platform(&source)?;
        source
            .validate(network())
            .map_err(network_config_api_error)?;
        check_auth_throttle(&app, &state)?;
        let verified = verify_selected_credential(&app, credential.as_str());
        record_auth_result(&app, &state, &verified)?;
        verified?;
        write_private_json(&sync_source_path(&app)?, &source)?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::NetworkConfigurationChanged,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                sync_source: Some(diagnostics::sync_source(&source)),
                ..Default::default()
            },
            None,
        );
        Ok(source)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn node_config_save(
    app: AppHandle,
    config: CoreNodeConfig,
    password: String,
    credential: String,
) -> ApiResult<NodeStatusDto> {
    let credential = Zeroizing::new(credential);
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        #[cfg(mobile)]
        if matches!(
            config.backend,
            crate::network::ChainBackend::LocalCore { .. }
        ) {
            return Err(api_error(
                "invalid_node_config",
                "A mobile device must connect to a remote Bitcoin Core node over TLS or Tor.",
            ));
        }
        config.validate().map_err(network_config_api_error)?;
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
        let status = checked_node_status(
            &candidate_rpc_client(&config, password.as_str())?,
            config.clone(),
        )?;
        let wallet_id = selected_profile(&app)?.id;
        if config.auth == RpcAuthMode::UserPass {
            let protected = Zeroizing::new(
                serde_json::to_vec(&ProtectedNodeAuthRef {
                    version: PROTECTED_NODE_AUTH_VERSION,
                    config: &config,
                    password: password.as_str(),
                })
                .map_err(internal)?,
            );
            secure_store::store(
                &node_secret_path(&app)?,
                protected.as_slice(),
                credential.as_str(),
                node_auth_context(wallet_id),
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
        mark_selected_mainnet_node_verified(&app, &state)?;
        replace_public_network_status(&app, None, Some(status.blocks))?;
        diagnostics::record(
            &app,
            &state,
            diagnostics::DiagnosticEventKind::NetworkConfigurationChanged,
            diagnostics::DiagnosticOutcome::Succeeded,
            diagnostics::DiagnosticContext {
                sync_source: Some(diagnostics::DiagnosticSyncSource::BitcoinCore),
                ..Default::default()
            },
            None,
        );
        Ok(status)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn network_setup_adopt(
    app: AppHandle,
    source_wallet_id: String,
    credential: String,
) -> ApiResult<NodeStatusDto> {
    let credential = Zeroizing::new(credential);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        let destination = require_unlocked(&app, &state)?;
        let source = Uuid::parse_str(&source_wallet_id).map_err(|_| {
            api_error(
                "wallet_not_found",
                "The wallet providing this network setup no longer exists.",
            )
        })?;
        if source == destination {
            return Err(api_error(
                "invalid_node_config",
                "Choose another wallet with a saved network setup.",
            ));
        }
        let registry = load_registry(&app)?;
        if !registry.wallets.iter().any(|profile| profile.id == source) {
            return Err(api_error(
                "wallet_not_found",
                "The wallet providing this network setup no longer exists.",
            ));
        }
        if !node_config_path_for(&app, source)?.is_file() {
            return Err(api_error(
                "invalid_node_config",
                "The selected wallet has no saved Bitcoin Core connection.",
            ));
        }
        if !authorize_wallet_session(&state, source, false, registry.inactivity_timeout_minutes)? {
            return Err(api_error(
                "wallet_locked",
                "Unlock the wallet providing this network setup, then try again.",
            ));
        }

        check_auth_throttle(&app, &state)?;
        let verified = verify_selected_credential(&app, credential.as_str());
        record_auth_result(&app, &state, &verified)?;
        verified?;

        let config = read_node_config_for(&app, source)?;
        let sync_source = read_sync_source_for(&app, source)?;
        ensure_sync_source_supported_on_platform(&sync_source)?;
        let client = match config.auth {
            RpcAuthMode::Cookie => candidate_rpc_client(&config, "")?,
            RpcAuthMode::UserPass => {
                let sessions = state.node_auth.lock().map_err(internal)?;
                let session = sessions.get(&source).ok_or_else(|| {
                    api_error(
                        "wallet_locked",
                        "Unlock the wallet providing this network setup, then try again.",
                    )
                })?;
                if session.config != config {
                    return Err(api_error(
                        "invalid_node_config",
                        "The saved connection changed. Open its wallet and verify the node again.",
                    ));
                }
                candidate_rpc_client(&config, session.password.as_str())?
            }
        };
        let status = checked_node_status(&client, config.clone())?;

        if config.auth == RpcAuthMode::UserPass {
            let protected = {
                let sessions = state.node_auth.lock().map_err(internal)?;
                let session = sessions.get(&source).ok_or_else(|| {
                    api_error(
                        "wallet_locked",
                        "Unlock the wallet providing this network setup, then try again.",
                    )
                })?;
                Zeroizing::new(
                    serde_json::to_vec(&ProtectedNodeAuthRef {
                        version: PROTECTED_NODE_AUTH_VERSION,
                        config: &config,
                        password: session.password.as_str(),
                    })
                    .map_err(internal)?,
                )
            };
            secure_store::store(
                &node_secret_path_for(&app, destination)?,
                protected.as_slice(),
                credential.as_str(),
                node_auth_context(destination),
            )
            .map_err(secure_store_error)?;
        } else {
            let path = node_secret_path_for(&app, destination)?;
            if path.exists() {
                fs::remove_file(path).map_err(internal)?;
            }
        }
        write_private_json(&node_config_path_for(&app, destination)?, &config)?;
        write_private_json(&sync_source_path_for(&app, destination)?, &sync_source)?;
        load_node_auth_session(&app, &state, credential.as_str())?;
        mark_selected_mainnet_node_verified(&app, &state)?;
        replace_public_network_status(&app, None, Some(status.blocks))?;
        Ok(status)
    })
    .await
    .map_err(internal)?
}

pub(super) fn adopt_network_setup_for_new_profile(
    app: &AppHandle,
    state: &State<'_, AppState>,
    source_wallet_id: &str,
    destination: Uuid,
    credential: &str,
) -> ApiResult<u32> {
    let source = Uuid::parse_str(source_wallet_id).map_err(|_| {
        api_error(
            "wallet_not_found",
            "The wallet providing this network setup no longer exists.",
        )
    })?;
    if source == destination {
        return Err(api_error(
            "invalid_node_config",
            "Choose another wallet with a saved network setup.",
        ));
    }
    let registry = load_registry(app)?;
    if !registry.wallets.iter().any(|profile| profile.id == source) {
        return Err(api_error(
            "wallet_not_found",
            "The wallet providing this network setup no longer exists.",
        ));
    }
    if !node_config_path_for(app, source)?.is_file() {
        return Err(api_error(
            "invalid_node_config",
            "The selected wallet has no saved Bitcoin Core connection.",
        ));
    }
    if !authorize_wallet_session(state, source, false, registry.inactivity_timeout_minutes)? {
        return Err(api_error(
            "wallet_locked",
            "Unlock the wallet providing this network setup, then try again.",
        ));
    }

    let config = read_node_config_for(app, source)?;
    let sync_source = read_sync_source_for(app, source)?;
    ensure_sync_source_supported_on_platform(&sync_source)?;
    let (password, status) = match config.auth {
        RpcAuthMode::Cookie => {
            let status = checked_node_status(&candidate_rpc_client(&config, "")?, config.clone())?;
            (None, status)
        }
        RpcAuthMode::UserPass => {
            let password = {
                let sessions = state.node_auth.lock().map_err(internal)?;
                let session = sessions.get(&source).ok_or_else(|| {
                    api_error(
                        "wallet_locked",
                        "Unlock the wallet providing this network setup, then try again.",
                    )
                })?;
                if session.config != config {
                    return Err(api_error(
                        "invalid_node_config",
                        "The saved connection changed. Open its wallet and verify the node again.",
                    ));
                }
                Zeroizing::new(session.password.to_string())
            };
            let status = checked_node_status(
                &candidate_rpc_client(&config, password.as_str())?,
                config.clone(),
            )?;
            (Some(password), status)
        }
    };

    if let Some(password) = password.as_ref() {
        let protected = Zeroizing::new(
            serde_json::to_vec(&ProtectedNodeAuthRef {
                version: PROTECTED_NODE_AUTH_VERSION,
                config: &config,
                password: password.as_str(),
            })
            .map_err(internal)?,
        );
        secure_store::store(
            &node_secret_path_for(app, destination)?,
            protected.as_slice(),
            credential,
            node_auth_context(destination),
        )
        .map_err(secure_store_error)?;
    }
    write_private_json(&node_config_path_for(app, destination)?, &config)?;
    write_private_json(&sync_source_path_for(app, destination)?, &sync_source)?;

    let mut sessions = state.node_auth.lock().map_err(internal)?;
    if let Some(password) = password {
        sessions.insert(
            destination,
            NodeAuthSession {
                config,
                password,
                mainnet_node_verified: true,
            },
        );
    } else {
        sessions.remove(&destination);
    }
    u32::try_from(status.blocks).map_err(internal)
}

pub(super) struct NewProfileNetworkSetup {
    pub(super) copied: bool,
    pub(super) birthday_height: Option<u32>,
}

pub(super) fn copy_network_setup_before_profile_commit(
    app: &AppHandle,
    state: &State<'_, AppState>,
    source_wallet_id: Option<&str>,
    destination: Uuid,
    credential: &str,
) -> ApiResult<NewProfileNetworkSetup> {
    if let Some(source_wallet_id) = source_wallet_id {
        let adoption = adopt_network_setup_for_new_profile(
            app,
            state,
            source_wallet_id,
            destination,
            credential,
        );
        if let Ok(birthday_height) = adoption {
            return Ok(NewProfileNetworkSetup {
                copied: true,
                birthday_height: Some(birthday_height),
            });
        }
        diagnostics::record(
            app,
            state,
            diagnostics::DiagnosticEventKind::NetworkConfigurationChanged,
            diagnostics::DiagnosticOutcome::Failed,
            diagnostics::DiagnosticContext {
                sync_source: Some(diagnostics::DiagnosticSyncSource::BitcoinCore),
                ..Default::default()
            },
            adoption.as_ref().err(),
        );
        for path in [
            node_config_path_for(app, destination)?,
            node_secret_path_for(app, destination)?,
            sync_source_path_for(app, destination)?,
        ] {
            if path.exists() {
                fs::remove_file(path).map_err(internal)?;
            }
        }
        state
            .node_auth
            .lock()
            .map_err(internal)?
            .remove(&destination);
        return Ok(NewProfileNetworkSetup {
            copied: false,
            birthday_height: None,
        });
    }

    if network() == Network::Bitcoin {
        let birthday_height =
            persist_mainnet_node_admission_for_new_profile(app, state, destination, credential)?;
        return Ok(NewProfileNetworkSetup {
            copied: birthday_height.is_some(),
            birthday_height,
        });
    }
    Ok(NewProfileNetworkSetup {
        copied: true,
        birthday_height: None,
    })
}

pub(crate) fn node_test(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<NodeStatusDto> {
    let config = read_node_config(app)?;
    let client = rpc_client_with_timeout(app, state, NODE_HEALTH_RPC_TIMEOUT)?;
    let status = checked_node_status(&client, config.clone())?;
    if matches!(&config.backend, ChainBackend::RemoteCore { .. })
        && matches!(read_sync_source(app)?, WalletSyncSource::BitcoinCore)
    {
        ensure_remote_core_sync_capabilities(
            &client,
            crate::managed_gateway::is_managed_config(&config),
        )?;
    }
    mark_selected_mainnet_node_verified(app, state)?;
    update_public_network_status(app, None, Some(status.blocks))?;
    Ok(status)
}

fn mark_selected_mainnet_node_verified(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> ApiResult<()> {
    if network() != Network::Bitcoin {
        return Ok(());
    }
    let profile = selected_profile(app)?;
    let saved_config = read_node_config_for(app, profile.id)?;
    let mut sessions = state.node_auth.lock().map_err(internal)?;
    let session = sessions.get_mut(&profile.id).ok_or_else(|| {
        api_error(
            "wallet_locked",
            "Unlock the wallet again to load its protected RPC credentials.",
        )
    })?;
    if session.config != saved_config {
        return Err(api_error(
            "invalid_node_config",
            "The Bitcoin Core connection changed after unlock. Review and save it again before connecting.",
        ));
    }
    session.mainnet_node_verified = true;
    Ok(())
}

#[tauri::command]
pub async fn node_connection_test(app: AppHandle) -> ApiResult<NodeStatusDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        require_unlocked(&app, &state)?;
        node_test(&app, &state)
    })
    .await
    .map_err(internal)?
}

#[cfg(test)]
pub(crate) use super::recovery_commands::{
    validate_recovery_birthday, validate_recovery_gap_limit,
};
