use super::*;

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
    let registry = load_registry(&app)?;
    let Some(selected) = registry.selected_wallet_id else {
        return Ok(None);
    };
    let Some(profile) = registry.wallets.iter().find(|wallet| wallet.id == selected) else {
        return Err(registry_api_error(RegistryError::UnknownSelection));
    };
    if profile.kind != WalletKind::Multisig {
        return Ok(None);
    }
    require_unlocked(&app, &state)?;
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
        network: NETWORK_NAME.to_owned(),
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

pub(crate) fn parse_public_descriptor_record(encoded: &str) -> ApiResult<DescriptorRecord> {
    if encoded.trim_start().starts_with("BSMS 1.0") {
        return DescriptorRecord::parse(encoded).map_err(bsms_api_error);
    }
    let pair = PublicDescriptorPair::parse(encoded).map_err(public_descriptor_api_error)?;
    let mut wallet = Wallet::create(
        pair.external_descriptor.clone(),
        pair.internal_descriptor.clone(),
    )
    .network(NETWORK)
    .create_wallet_no_persist()
    .map_err(|_| {
        api_error(
            "invalid_backup",
            "The public descriptors are not valid for this Bitcoin network.",
        )
    })?;
    let first_address = wallet
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string();
    DescriptorRecord::from_descriptor_pair(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        &first_address,
    )
    .map_err(public_descriptor_api_error)
}

#[tauri::command]
pub fn multisig_bsms_inspect(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
) -> ApiResult<RecoveryDrillDto> {
    let record = parse_public_descriptor_record(&encoded_backup)?;
    let (external_descriptor, internal_descriptor) =
        record.descriptor_pair().map_err(bsms_api_error)?;
    let mut derived = Wallet::create(external_descriptor.clone(), internal_descriptor.clone())
        .network(NETWORK)
        .create_wallet_no_persist()
        .map_err(|_| {
            api_error(
                "invalid_backup",
                "The public descriptors are not valid for this Bitcoin network.",
            )
        })?;
    let derived_first = derived
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string();
    if derived_first != record.first_address {
        return Err(api_error(
            "backup_mismatch",
            "The backup's first address does not match its descriptor.",
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
    let record = parse_public_descriptor_record(&encoded_backup)?;
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
            "The backup's first address does not match its descriptor.",
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

        let marker = format!("groot-multisig:{}", wallet.external_descriptor);
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
        cleanup_failed_profile(&dir)?;
    }
    let wallet = result?;
    unlock_selected(&app, &state)?;
    reset_auth_throttle(&app, &state)?;
    Ok(wallet)
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
        let marker = format!("groot-multisig:{}", backup.wallet.external_descriptor);
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
        cleanup_failed_profile(&dir)?;
    }
    let wallet = result?;
    unlock_selected(&app, &state)?;
    Ok(wallet)
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
    let wallet_id = require_unlocked_for_background_sync(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    sync_wallet_with_status(&app, &state, &mut db, true, wallet_id)
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
        derivation_path: format!("{MULTISIG_ACCOUNT_PATH}/0/{}", info.index),
        hardware_verified_at: None,
        hardware_verified_by: None,
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
