//! Recovery settings and scan commands; authentication and transaction ordering are unchanged.
use super::*;

#[tauri::command]
pub async fn recovery_scan_settings(app: AppHandle) -> ApiResult<RecoveryScanSettingsDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        require_unlocked(&app, &state)?;
        let profile = selected_profile(&app)?;
        let db = match profile.kind {
            WalletKind::Multisig => open_multisig_db(&app)?,
            WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
        };
        load_recovery_scan_settings(&db)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn recovery_scan_settings_save(
    app: AppHandle,
    birthday_height: u32,
    gap_limit: u32,
    credential: String,
    expected_wallet_id: Option<Uuid>,
) -> ApiResult<RecoveryScanSettingsDto> {
    let credential = Zeroizing::new(credential);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        validate_recovery_gap_limit(gap_limit)?;
        if birthday_height != 0 {
            let tip = checked_block_height(&rpc_client(&app, &state)?)?;
            validate_recovery_birthday(birthday_height, tip)?;
        }
        let profile = selected_profile(&app)?;
        if expected_wallet_id.is_some_and(|id| id != profile.id) { return Err(api_error("wallet_selection_changed", "The selected wallet changed. Approve its scan again.")); }
        let mut db = match profile.kind {
            WalletKind::Multisig => open_multisig_db(&app)?,
            WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
        };
        if credential.is_empty() {
            validate_credential_free_scan_settings(has_completed_sync(&db)?, expected_wallet_id.is_some(), birthday_height)?;
        } else {
            check_auth_throttle(&app, &state)?;
            let verified = verify_selected_credential(&app, credential.as_str());
            record_auth_result(&app, &state, &verified)?;
            verified?;
        }
        let external_required = required_recovery_gap(&db, None)?;
        let wallet = load_wallet(&mut db)?;
        let internal_required = wallet
            .derivation_index(KeychainKind::Internal)
            .map(|index| required_keychain_gap(&wallet, KeychainKind::Internal, index))
            .transpose()?
            .unwrap_or(0);
        let required = external_required.max(internal_required);
        let gap_limit = if credential.is_empty() && expected_wallet_id.is_some() {
            let effective = gap_limit.max(required);
            validate_recovery_gap_limit(effective)?;
            effective
        } else { gap_limit };
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
        state.approved_initial_scans.lock().map_err(internal)?.insert(profile.id);
        Ok(RecoveryScanSettingsDto {
            birthday_height,
            gap_limit,
        })
    })
    .await
    .map_err(internal)?
}

pub(crate) fn validate_recovery_gap_limit(gap_limit: u32) -> ApiResult<()> {
    if !(MIN_RECOVERY_GAP_LIMIT..=MAX_RECOVERY_GAP_LIMIT).contains(&gap_limit) {
        return Err(api_error(
            "invalid_scan_settings",
            "Gap limit must be between 20 and 1,000 addresses.",
        ));
    }
    Ok(())
}

pub(crate) fn validate_recovery_birthday(birthday_height: u32, tip: u64) -> ApiResult<()> {
    if u64::from(birthday_height) > tip {
        return Err(api_error(
            "invalid_scan_settings",
            "Wallet birthday cannot be above the node's current block height.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn recovery_scan_status(app: AppHandle) -> ApiResult<RecoveryScanStatusDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
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
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_full_rescan_cancel(app: AppHandle) -> ApiResult<RecoveryScanStatusDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
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
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn wallet_full_rescan(
    app: AppHandle,
    credential: String,
    expected_wallet_id: Option<Uuid>,
) -> ApiResult<WalletSnapshotDto> {
    let credential = Zeroizing::new(credential);
    let diagnostic_app = app.clone();
    let context = diagnostics::DiagnosticContext {
        trigger: diagnostics::DiagnosticTrigger::Recovery,
        ..Default::default()
    };
    diagnostics::record(
        &app,
        &app.state::<AppState>(),
        diagnostics::DiagnosticEventKind::RecoveryScan,
        diagnostics::DiagnosticOutcome::Started,
        context,
        None,
    );
    diagnostics::record(
        &app,
        &app.state::<AppState>(),
        diagnostics::DiagnosticEventKind::RecoveryScan,
        diagnostics::DiagnosticOutcome::Progress,
        diagnostics::DiagnosticContext {
            progress_percent: Some(0),
            ..context
        },
        None,
    );
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let (
            profile,
            mut db,
            mut wallet,
            is_multisig,
            settings,
            run_id,
            cancel,
            rpc,
            remote_scan_rpc,
            managed_history,
            delayed_policy,
        ) = {
            let _operation = operation_guard(&state)?;
            require_unlocked(&app, &state)?;
            let profile = selected_profile(&app)?;
            if expected_wallet_id.is_some_and(|id| id != profile.id) { return Err(api_error("wallet_selection_changed", "The selected wallet changed. Approve its scan again.")); }
            let (mut db, is_multisig) = match profile.kind {
                WalletKind::Multisig => (open_multisig_db(&app)?, true),
                WalletKind::SingleKey | WalletKind::WatchOnly => (open_db(&app)?, false),
            };
            if credential.is_empty() {
                if has_completed_sync(&db)? && expected_wallet_id.is_none() {
                    return Err(api_error(
                        "invalid_credential",
                        "Enter the wallet credential before starting another full rescan.",
                    ));
                }
                if !state.approved_initial_scans.lock().map_err(internal)?.contains(&profile.id) {
                    return Err(api_error("initial_scan_required", "Approve the first wallet-history scan before sending wallet scripts to the configured node."));
                }
                if !has_saved_recovery_scan_settings(&db)? {
                    return Err(api_error(
                        "initial_scan_required",
                        "Choose where wallet history begins before starting the first scan.",
                    ));
                }
            } else {
                check_auth_throttle(&app, &state)?;
                let verified = verify_selected_credential(&app, credential.as_str());
                record_auth_result(&app, &state, &verified)?;
                verified?;
            }
            let settings = load_recovery_scan_settings(&db)?;
            let run_id = Uuid::new_v4().to_string();
            let cancel = Arc::new(AtomicBool::new(false));
            let rpc = Arc::new(rpc_client(&app, &state)?);
            let node_config = read_node_config(&app)?;
            let remote_core = matches!(&node_config.backend, ChainBackend::RemoteCore { .. });
            let managed_history =
                remote_core && crate::managed_gateway::is_managed_config(&node_config);
            if remote_core {
                ensure_remote_core_sync_capabilities(rpc.as_ref(), managed_history)?;
            }
            let remote_scan_rpc = if remote_core {
                Some(rpc_client_with_timeout(
                    &app,
                    &state,
                    REMOTE_CORE_SCAN_RPC_TIMEOUT,
                )?)
            } else {
                None
            };
            let wallet = load_wallet(&mut db)?;
            let delayed_policy = if is_multisig {
                selected_delayed_policy_context(&app)?
            } else {
                None
            };
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
            (
                profile,
                db,
                wallet,
                is_multisig,
                settings,
                run_id,
                cancel,
                rpc,
                remote_scan_rpc,
                managed_history,
                delayed_policy,
            )
        };
        let scan_result: ApiResult<WalletSnapshotDto> = (|| {
            let remote_core = remote_scan_rpc.is_some();
            let remote_history = remote_scan_rpc.as_ref().map(|scan_rpc| {
                if managed_history {
                    RemoteHistorySource::Managed
                } else {
                    RemoteHistorySource::CoreScan(scan_rpc)
                }
            });
            let mempool_snapshot = full_rescan_loaded_wallet(
                rpc,
                remote_history,
                &mut wallet,
                &mut db,
                &settings,
                &run_id,
                &cancel,
            )?;
            if remote_core {
                forget_core_mempool_snapshot(&state, profile.id);
            } else {
                remember_core_mempool_snapshot(&state, profile.id, Some(mempool_snapshot));
            }
            let persisted = db.transaction().map_err(internal)?;
            let reconciled = reconcile_broadcast_proposals(&wallet, &persisted)?;
            let snapshot = snapshot_from(
                &wallet,
                &persisted,
                Some(now().to_string()),
                is_multisig,
                delayed_policy.as_ref(),
            )?;
            enqueue_snapshot_notifications(&persisted, &snapshot)?;
            enqueue_reconciled_broadcasts(&persisted, &reconciled, snapshot.balance.total)?;
            persisted.commit().map_err(internal)?;
            Ok(snapshot)
        })();
        let finish_result = load_recovery_scan_record(&db).and_then(|record| {
            if record.is_some_and(|record| record.run_id == run_id) {
                match &scan_result {
                    Ok(_) => finish_recovery_scan_record(&db, &run_id, "completed"),
                    Err(_) => discard_recovery_scan_record(&db, &run_id),
                }
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
    .map_err(internal)?;
    let state = diagnostic_app.state::<AppState>();
    diagnostics::record_result(
        &diagnostic_app,
        &state,
        diagnostics::DiagnosticEventKind::RecoveryScan,
        context,
        &result,
    );
    result
}
