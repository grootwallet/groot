use super::*;

#[tauri::command]
pub fn wallet_exists(app: AppHandle) -> ApiResult<bool> {
    let registry = load_registry(&app)?;
    let Some(selected) = registry.selected_wallet_id else {
        return Ok(false);
    };
    let directory = profile_directory(&app, selected)?;
    Ok(directory.join("wallet.sqlite").exists() && directory.join("secret.json").exists())
}

#[tauri::command]
pub fn wallet_profiles(app: AppHandle) -> ApiResult<WalletRegistry> {
    load_registry(&app)
}

#[tauri::command]
pub fn wallet_rename(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> ApiResult<WalletProfile> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut registry = load_registry(&app)?;
    let renamed = registry
        .rename_selected(&name)
        .map_err(registry_api_error)?;
    save_registry(&app, &registry)?;
    Ok(renamed)
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
pub fn wallet_generate_mnemonic(
    app: AppHandle,
    state: State<'_, AppState>,
    supplemental_entropy: Option<SupplementalEntropyDto>,
) -> ApiResult<bool> {
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
    let authenticated_descriptors = software_wallet_descriptors(&mnemonic, credential.as_str())?;
    if let Err(error) = create_from_mnemonic(
        &app,
        name,
        mnemonic,
        credential.as_str(),
        pending.backup_verified,
    ) {
        *state.pending_mnemonic.lock().map_err(internal)? = Some(pending);
        return Err(error);
    }
    let selected = selected_profile_of_kind(&app, WalletKind::SingleKey)?.id;
    state
        .authenticated_software_descriptors
        .lock()
        .map_err(internal)?
        .insert(selected, authenticated_descriptors);
    unlock_selected(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn wallet_recover(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    credential: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let mnemonic_words = native_backup::recover(&app)
        .map_err(internal)?
        .ok_or_else(|| api_error("onboarding_cancelled", "Wallet recovery was cancelled."))?;
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
            "Groot requires exactly 24 recovery words.",
        ));
    }
    let authenticated_descriptors = software_wallet_descriptors(&mnemonic, credential.as_str())?;
    create_from_mnemonic(&app, name, mnemonic, credential.as_str(), true)?;
    let selected = selected_profile_of_kind(&app, WalletKind::SingleKey)?.id;
    state
        .authenticated_software_descriptors
        .lock()
        .map_err(internal)?
        .insert(selected, authenticated_descriptors);
    unlock_selected(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn wallet_verify_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<bool> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let profile = selected_profile_of_kind(&app, WalletKind::SingleKey)?;
    if profile.backup_verified {
        return Ok(true);
    }
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let credential_result = decrypt_mnemonic(&app, credential.as_str());
    record_auth_result(&app, &state, &credential_result)?;
    let mnemonic = credential_result?;
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
    Ok(true)
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
        WalletKind::SingleKey => decrypt_mnemonic(&app, credential.as_str()).and_then(|mnemonic| {
            software_wallet_descriptors(&mnemonic, credential.as_str()).map(Some)
        }),
        WalletKind::Multisig => {
            verify_multisig_credential(&app, credential.as_str()).map(|()| None)
        }
        WalletKind::WatchOnly => {
            verify_external_signer_credential(&app, credential.as_str()).map(|()| None)
        }
    };
    record_auth_result(&app, &state, &result)?;
    let authenticated_descriptors = result?;
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
    let wallet_id = require_unlocked_for_background_sync(&app, &state)?;
    let mut db = open_db(&app)?;
    sync_wallet_with_status(&app, &state, &mut db, false, wallet_id)
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
    enforce_recovery_gap(&transaction, info.index)?;
    let created = now();
    transaction
        .execute(
            "INSERT INTO groot_addresses (idx, address, label, created_at, state) VALUES (?1, ?2, ?3, ?4, 'awaiting')",
            params![info.index, info.address.to_string(), label, created],
        )
        .map_err(internal)?;
    label_provenance::assign_new_label(
        &transaction,
        &label,
        LabelOrigin::Receive,
        "address",
        &info.index.to_string(),
        created,
    )
    .map_err(|error| {
        if error.sqlite_error_code() == Some(bdk_wallet::rusqlite::ErrorCode::ConstraintViolation) {
            api_error(
                "invalid_label",
                "Permanent labels cannot be reused. Choose a unique label.",
            )
        } else {
            internal(error)
        }
    })?;
    wallet.persist(&mut transaction).map_err(internal)?;
    transaction.commit().map_err(internal)?;
    Ok(ReceiveAddressDto {
        id: info.index,
        testnet_alias: regtest_testnet_address_alias(&info.address.to_string()),
        address: info.address.to_string(),
        label,
        created: created.to_string(),
        status: "awaiting".to_owned(),
        derivation_path: format!("{SINGLESIG_ACCOUNT_PATH}/0/{}", info.index),
        hardware_verified_at: None,
        hardware_verified_by: None,
    })
}

#[tauri::command]
pub fn address_discard(app: AppHandle, state: State<'_, AppState>, id: u32) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
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
    let sats_per_vbyte = sats_per_kvb.div_ceil(1_000);
    if sats_per_vbyte > 10_000 {
        return Err(api_error(
            "fee_estimate_unavailable",
            "Bitcoin Core returned a fee estimate outside Groot's safe range. Enter a custom sat/vB rate or try again later.",
        ));
    }
    Ok(sats_per_vbyte as f64)
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

#[tauri::command]
pub fn fees_estimate(app: AppHandle, state: State<'_, AppState>) -> ApiResult<FeeEstimatesDto> {
    if IS_REGTEST {
        return Ok(FeeEstimatesDto {
            economy: 1.0,
            standard: 2.0,
            priority: 5.0,
            source: "Regtest policy",
        });
    }
    require_unlocked(&app, &state)?;
    let client = rpc_client(&app, &state)?;
    checked_chain_identity(&client)?;
    let (economy, standard, priority) = ordered_fee_estimates(
        estimate_core_fee(&client, 144, EstimateMode::Economical)?,
        estimate_core_fee(&client, 6, EstimateMode::Conservative)?,
        estimate_core_fee(&client, 2, EstimateMode::Conservative)?,
    );
    Ok(FeeEstimatesDto {
        economy,
        standard,
        priority,
        source: "Bitcoin Core estimatesmartfee",
    })
}

#[tauri::command]
pub fn node_config(app: AppHandle, state: State<'_, AppState>) -> ApiResult<CoreNodeConfig> {
    require_unlocked(&app, &state)?;
    read_node_config(&app)
}

#[tauri::command]
pub fn wallet_sync_source(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<WalletSyncSource> {
    require_unlocked(&app, &state)?;
    read_sync_source(&app)
}

#[tauri::command]
pub fn wallet_sync_source_save(
    app: AppHandle,
    state: State<'_, AppState>,
    source: WalletSyncSource,
    credential: String,
) -> ApiResult<WalletSyncSource> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    source.validate(NETWORK).map_err(network_config_api_error)?;
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let verified = verify_selected_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    write_private_json(&sync_source_path(&app)?, &source)?;
    Ok(source)
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
    if !(MIN_RECOVERY_GAP_LIMIT..=MAX_RECOVERY_GAP_LIMIT).contains(&gap_limit) {
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
    let mut db = match profile.kind {
        WalletKind::Multisig => open_multisig_db(&app)?,
        WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
    };
    let external_required = required_recovery_gap(&db, None)?;
    let wallet = load_wallet(&mut db)?;
    let internal_required = wallet
        .derivation_index(KeychainKind::Internal)
        .map(|index| required_keychain_gap(&wallet, KeychainKind::Internal, index))
        .transpose()?
        .unwrap_or(0);
    let required = external_required.max(internal_required);
    if gap_limit < required {
        return Err(api_error(
            "invalid_scan_settings",
            format!(
                "This wallet has revealed addresses that require a gap limit of at least {required}."
            ),
        ));
    }
    db.execute(
        "INSERT INTO groot_recovery_settings (singleton, birthday_height, gap_limit) VALUES (1, ?1, ?2)
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
pub fn recovery_scan_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<RecoveryScanStatusDto> {
    require_unlocked(&app, &state)?;
    let profile = selected_profile(&app)?;
    let db = match profile.kind {
        WalletKind::Multisig => open_multisig_db(&app)?,
        WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
    };
    let settings = load_recovery_scan_settings(&db)?;
    let active_run_id = state
        .recovery_scans
        .lock()
        .map_err(internal)?
        .get(&profile.id)
        .map(|active| active.run_id.clone());
    let Some(record) = reconcile_recovery_scan_record(&db, active_run_id.as_deref())? else {
        return Ok(idle_recovery_scan_status(&settings));
    };
    Ok(record.status)
}

#[tauri::command]
pub fn wallet_full_rescan_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<RecoveryScanStatusDto> {
    require_unlocked(&app, &state)?;
    let profile = selected_profile(&app)?;
    let (run_id, cancel) = {
        let scans = state.recovery_scans.lock().map_err(internal)?;
        let active = scans.get(&profile.id).ok_or_else(|| {
            api_error(
                "scan_not_running",
                "There is no active recovery scan to cancel.",
            )
        })?;
        (active.run_id.clone(), Arc::clone(&active.cancel))
    };
    cancel.store(true, Ordering::Release);
    let db = match profile.kind {
        WalletKind::Multisig => open_multisig_db(&app)?,
        WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
    };
    db.execute(
        "UPDATE groot_recovery_scans SET status = 'cancelling', updated_at = ?1
         WHERE singleton = 1 AND run_id = ?2 AND status = 'running'",
        params![now(), run_id],
    )
    .map_err(internal)?;
    load_recovery_scan_record(&db)?
        .map(|record| record.status)
        .ok_or_else(|| internal("The recovery scan status is unavailable."))
}

#[tauri::command]
pub async fn wallet_full_rescan(
    app: AppHandle,
    credential: String,
) -> ApiResult<WalletSnapshotDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
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
        let run_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut scans = state.recovery_scans.lock().map_err(internal)?;
            if scans.contains_key(&profile.id) {
                return Err(api_error(
                    "scan_in_progress",
                    "A recovery scan is already running for this wallet.",
                ));
            }
            scans.insert(
                profile.id,
                ActiveRecoveryScan {
                    run_id: run_id.clone(),
                    cancel: Arc::clone(&cancel),
                },
            );
        }
        let scan_result: ApiResult<WalletSnapshotDto> = (|| {
            let rpc = Arc::new(rpc_client(&app, &state)?);
            let mut wallet = load_wallet(&mut db)?;
            full_rescan_loaded_wallet(rpc, &mut wallet, &mut db, &settings, &run_id, &cancel)?;
            let snapshot = snapshot_from(&wallet, &db, Some(now().to_string()), is_multisig)?;
            enqueue_snapshot_notifications(&db, &snapshot)?;
            Ok(snapshot)
        })();
        let terminal_status = match &scan_result {
            Ok(_) => "completed",
            Err(error) if error.code == "scan_cancelled" => "cancelled",
            Err(_) => "failed",
        };
        let finish_result = load_recovery_scan_record(&db).and_then(|record| {
            if record.is_some_and(|record| record.run_id == run_id) {
                finish_recovery_scan_record(&db, &run_id, terminal_status)
            } else {
                Ok(())
            }
        });
        state
            .recovery_scans
            .lock()
            .map_err(internal)?
            .remove(&profile.id);
        match (scan_result, finish_result) {
            (Ok(snapshot), Ok(())) => Ok(snapshot),
            (Err(error), _) => Err(error),
            (Ok(_), Err(error)) => Err(error),
        }
    })
    .await
    .map_err(internal)?
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
    let status = checked_node_status(
        &candidate_rpc_client(&config, password.as_str())?,
        config.clone(),
    )?;
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
    Ok(status)
}

pub(crate) fn node_test(app: &AppHandle, state: &State<'_, AppState>) -> ApiResult<NodeStatusDto> {
    let config = read_node_config(app)?;
    checked_node_status(&rpc_client(app, state)?, config)
}

#[tauri::command]
pub fn node_connection_test(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<NodeStatusDto> {
    require_unlocked(&app, &state)?;
    node_test(&app, &state)
}
