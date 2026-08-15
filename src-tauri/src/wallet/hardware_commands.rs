use super::*;

const HARDWARE_SCAN_CACHE_TIMEOUT: Duration = Duration::from_secs(2 * 60);

fn remember_hardware_scan(state: &AppState, devices: &[HwiDevice]) -> ApiResult<()> {
    let devices = devices
        .iter()
        .filter(|device| !device.path.is_empty())
        .map(|device| (device.path.clone(), device.clone()))
        .collect();
    *state.recent_hardware_scan.lock().map_err(internal)? = Some(RecentHardwareScan {
        devices,
        created_at: Instant::now(),
    });
    Ok(())
}

fn recently_scanned_hardware_device(state: &AppState, device_id: &str) -> ApiResult<HwiDevice> {
    let scans = state.recent_hardware_scan.lock().map_err(internal)?;
    let scan = scans.as_ref().ok_or_else(|| {
        api_error(
            "hardware_scan_expired",
            "Scan for hardware wallets again before continuing.",
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
            "That hardware wallet was not present in the latest scan. Scan again.",
        )
    })
}

#[tauri::command]
pub async fn hardware_list(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<HardwareDeviceDto>> {
    let hwi = hwi_cli(&app)?;
    let devices = tauri::async_runtime::spawn_blocking(move || {
        let encoded = hwi.enumerate().map_err(hardware_api_error)?;
        let devices: Vec<HwiDevice> = serde_json::from_slice(&encoded).map_err(internal)?;
        Ok::<_, ApiError>(devices)
    })
    .await
    .map_err(internal)??;
    remember_hardware_scan(&state, &devices)?;
    Ok(devices.into_iter().map(hardware_device_dto).collect())
}
#[tauri::command]
pub async fn hardware_prompt_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
) -> ApiResult<String> {
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    let pending = tauri::async_runtime::spawn_blocking(move || {
        if !matches!(
            device.device_type.to_ascii_lowercase().as_str(),
            "trezor" | "keepkey"
        ) || (!device.needs_pin_sent && device.code != Some(-12))
        {
            return Err(api_error(
                "invalid_hardware_request",
                "This device does not need Groot's PIN-matrix flow.",
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
    state: State<'_, AppState>,
    cosigner: CosignerInput,
    device_id: String,
) -> ApiResult<CosignerHealthDto> {
    cosigner.parse_for_validation().map_err(policy_api_error)?;
    let checked_at = now().to_string();
    let hwi = hwi_cli(&app)?;
    let device = recently_scanned_hardware_device(&state, &device_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let connected = read_hardware_cosigner(&hwi, device, &cosigner.label, true)?;
        verify_cosigner_identity(&cosigner, &connected)?;
        Ok(CosignerHealthDto {
            status: "healthy",
            checked_at,
            summary: format!(
                "Connected device matches fingerprint {} and the saved BIP48 account key.",
                cosigner.fingerprint
            ),
        })
    })
    .await
    .map_err(internal)?
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
            "The hardware wallet returned a different account path than Groot requested.",
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
    if parsed.network.is_mainnet() {
        return Err(api_error(
            "wrong_network",
            "The hardware wallet returned a mainnet account key for this non-mainnet wallet.",
        ));
    }
    Ok((fingerprint.to_ascii_lowercase(), xpub.to_owned()))
}

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

fn read_hardware_cosigner(
    hwi: &HwiCli,
    device: HwiDevice,
    label: &str,
    allow_empty_passphrase: bool,
) -> ApiResult<crate::multisig::CosignerInput> {
    require_explicit_standard_wallet_selection(&device, allow_empty_passphrase)?;
    let output = hwi
        .account_keypool(
            &device.device_type,
            &device.path,
            crate::multisig::MULTISIG_ACCOUNT_PATH,
        )
        .map_err(|error| {
            hardware_xpub_api_error(
                error,
                &device.device_type,
                crate::multisig::MULTISIG_ACCOUNT_PATH,
            )
        })?;
    let (fingerprint, xpub) = parse_hwi_account_keypool(
        &output,
        crate::multisig::MULTISIG_ACCOUNT_PATH,
        &device.device_type,
    )?;
    let input = crate::multisig::CosignerInput {
        id: Uuid::new_v4().to_string(),
        label: label.to_owned(),
        fingerprint,
        xpub,
        derivation_path: crate::multisig::MULTISIG_ACCOUNT_PATH.to_owned(),
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
    tauri::async_runtime::spawn_blocking(move || {
        read_hardware_cosigner(
            &hwi,
            device,
            &label,
            allow_empty_passphrase.unwrap_or(false),
        )
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
    if value.get("network").and_then(|value| value.as_str()) == Some(NETWORK_NAME) {
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
    tauri::async_runtime::spawn_blocking(move || {
        require_explicit_standard_wallet_selection(
            &device,
            allow_empty_passphrase.unwrap_or(false),
        )?;
        let output = hwi
            .account_keypool(&device.device_type, &device.path, SINGLESIG_ACCOUNT_PATH)
            .map_err(|error| {
                hardware_xpub_api_error(error, &device.device_type, SINGLESIG_ACCOUNT_PATH)
            })?;
        let (fingerprint, xpub) =
            parse_hwi_account_keypool(&output, SINGLESIG_ACCOUNT_PATH, &device.device_type)?;
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
        let marker = format!("groot-external-signer:{}", metadata.external_descriptor);
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
                network: NETWORK_NAME.to_owned(),
                kind: WalletKind::WatchOnly,
                descriptor_checksum: descriptor_checksum(
                    &wallet.public_descriptor(KeychainKind::External).to_string(),
                )?,
                created_at: now(),
                backup_verified: true,
            },
        )
    })();
    if result.is_err() {
        cleanup_failed_profile(&dir)?;
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

pub(crate) fn normalize_external_signer_label(value: &str) -> ApiResult<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() || normalized.chars().count() > 48 {
        return Err(api_error(
            "invalid_label",
            "Hardware signer names must contain 1 to 48 characters.",
        ));
    }
    Ok(normalized)
}

#[tauri::command]
pub fn external_signer_rename(
    app: AppHandle,
    state: State<'_, AppState>,
    label: String,
) -> ApiResult<ExternalSignerWallet> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut metadata = read_external_signer_metadata(&app)?;
    metadata.signer.label = normalize_external_signer_label(&label)?;
    metadata
        .signer
        .validate()
        .map_err(external_signer_api_error)?;
    write_private_json(&external_signer_metadata_path(&app)?, &metadata)?;
    Ok(metadata)
}

pub(crate) fn external_signer_backup(descriptor: String) -> ApiResult<ExternalSignerBackupDto> {
    let content = serde_json::to_string_pretty(&ExternalSignerBackupRecord {
        version: 1,
        network: NETWORK_NAME,
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
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let verified = verify_external_signer_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    external_signer_backup(read_external_signer_metadata(&app)?.external_descriptor)
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
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(&psbt, &change_addresses)?;
    let (inputs, fee_rate, locktime, rbf) = proposal_transaction_details(wallet, &psbt, fee)?;
    let selection_impact =
        selection_impact(db, wallet, &psbt, &strategy, fee_difference_vs_private)?;
    Ok(MultisigProposalDto {
        proposal_id,
        recipient,
        recipient_testnet_alias,
        label,
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
        inputs,
        locktime,
        rbf,
        network: NETWORK_NAME,
        psbt: encoded,
        signed: progress.signed,
        required: 1,
        can_finalize: progress.can_finalize,
        signed_fingerprints: progress.signed_fingerprints,
        status,
        created_at: created_at.to_string(),
        selection_impact,
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
pub fn external_signer_proposals(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<MultisigProposalDto>> {
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
}

pub(crate) fn import_external_proposal(
    app: &AppHandle,
    proposal_id: &str,
    signed_psbt: &str,
) -> ApiResult<MultisigProposalDto> {
    let metadata = read_external_signer_metadata(app)?;
    let mut db = open_db(app)?;
    let current = load_external_proposal(&mut db, &metadata, proposal_id)?;
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
        "UPDATE groot_proposals SET psbt = ?1, status = ?2 WHERE proposal_id = ?3 AND status IN ('collecting','ready') AND psbt = ?4",
        params![encode_psbt(&original), status, proposal_id, original_encoded],
    ).map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while its signature was imported.",
        ));
    }
    load_external_proposal(&mut db, &metadata, proposal_id)
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
    if current.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed after review. Reload it before importing a signature.",
        ));
    }
    drop(db);
    import_external_proposal(&app, &proposal_id, &signed_psbt)
}

#[tauri::command]
pub async fn hardware_sign_external(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    device_id: String,
    reviewed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    require_unlocked(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
    let mut db = open_db(&app)?;
    let proposal = load_external_proposal(&mut db, &metadata, &proposal_id)?;
    if proposal.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed after review. Reload it before signing.",
        ));
    }
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
            missing_hardware_psbt(
                &device_type,
                response.code,
                "The device did not return a signed PSBT.",
            )
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
    reviewed_psbt: String,
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
    let proposal = load_external_proposal(&mut db, &metadata, &proposal_id)?;
    if proposal.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The signed proposal changed after review. Reload it before broadcast.",
        ));
    }
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
    let snapshot = snapshot_from(&wallet, &persisted, None, false)?;
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
    let (snapshot, sync_pending) = match sync_wallet_atomically(&app, &state, &mut db, false) {
        Ok(snapshot) => (snapshot, false),
        Err(_) => (snapshot, true),
    };
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
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
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
    let expected_fingerprints = metadata
        .cosigners
        .iter()
        .map(|cosigner| cosigner.fingerprint.clone())
        .collect::<Vec<_>>();
    let hwi = hwi_cli(&app)?;
    let (displayed, identity) = tauri::async_runtime::spawn_blocking(move || {
        let identity = connected_hardware_identity(&hwi, &device_id, &expected_fingerprints)?;
        let displayed = hwi
            .display_descriptor_address(&identity.device_type, &device_id, &descriptor)
            .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
        Ok::<_, ApiError>((displayed, identity))
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
    record_address_verification(&mut db, address_id, &identity, &actual, true)
}

#[tauri::command]
pub fn multisig_signer_policy_verifications(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<SignerPolicyVerificationDto>> {
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

#[tauri::command]
pub async fn hardware_verify_multisig_policy(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    signer_fingerprint: String,
) -> ApiResult<SignerPolicyVerificationDto> {
    let initiating_wallet_id = require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
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
    let expected_fingerprint = signer.fingerprint.clone();
    let expected_device_type = signer.device_type.clone();
    let expected = first_multisig_address(&metadata)?;
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&metadata.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(0)
        .map_err(internal)?
        .to_string();
    let hwi = hwi_cli(&app)?;
    let (displayed, identity) = tauri::async_runtime::spawn_blocking(move || {
        let identity = connected_hardware_identity(&hwi, &device_id, &[expected_fingerprint])?;
        if !records_interactive_policy_verification(&identity.device_type) {
            return Err(api_error(
                "invalid_hardware_request",
                "This signer does not require Groot's interactive wallet-policy verification flow.",
            ));
        }
        require_matching_policy_device_type(
            expected_device_type.as_deref(),
            &identity.device_type,
        )?;
        let displayed = hwi
            .display_descriptor_address(&identity.device_type, &device_id, &descriptor)
            .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
        Ok::<_, ApiError>((displayed, identity))
    })
    .await
    .map_err(internal)??;
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
    record_signer_policy_verification(&db, &identity, &actual)
}

#[tauri::command]
pub async fn hardware_verify_multisig_draft_policy(
    app: AppHandle,
    state: State<'_, AppState>,
    policy: PolicyInput,
    device_id: String,
    signer_fingerprint: String,
) -> ApiResult<SignerPolicyVerificationDto> {
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
    let expected_fingerprint = signer.fingerprint.clone();
    let expected_device_type = signer.device_type.clone();
    let expected = first_multisig_address(&wallet)?;
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(&wallet.external_descriptor)
        .map_err(internal)?
        .at_derivation_index(0)
        .map_err(internal)?
        .to_string();
    let hwi = hwi_cli(&app)?;
    let (displayed, identity) = tauri::async_runtime::spawn_blocking(move || {
        let identity = connected_hardware_identity(&hwi, &device_id, &[expected_fingerprint])?;
        if !records_interactive_policy_verification(&identity.device_type) {
            return Err(api_error(
                "invalid_hardware_request",
                "This signer does not require Groot's interactive wallet-policy verification flow.",
            ));
        }
        require_matching_policy_device_type(
            expected_device_type.as_deref(),
            &identity.device_type,
        )?;
        let displayed = hwi
            .display_descriptor_address(&identity.device_type, &device_id, &descriptor)
            .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
        Ok::<_, ApiError>((displayed, identity))
    })
    .await
    .map_err(internal)??;
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
    state
        .pending_policy_verifications
        .lock()
        .map_err(internal)?
        .insert(key, verification.clone());
    Ok(verification)
}

#[tauri::command]
pub async fn hardware_verify_external_address(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    address_id: u32,
) -> ApiResult<ReceiveAddressDto> {
    require_unlocked(&app, &state)?;
    let metadata = read_external_signer_metadata(&app)?;
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
                .require_network(NETWORK)
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
    let expected_fingerprints = vec![metadata.signer.fingerprint];
    let hwi = hwi_cli(&app)?;
    let (displayed, identity) = tauri::async_runtime::spawn_blocking(move || {
        let identity = connected_hardware_identity(&hwi, &device_id, &expected_fingerprints)?;
        let displayed = hwi
            .display_descriptor_address(&identity.device_type, &device_id, &descriptor)
            .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
        Ok::<_, ApiError>((displayed, identity))
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
    record_address_verification(&mut db, address_id, &identity, &actual, false)
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
        let master = Xpriv::new_master(PARAMETERS.network, &[seed_byte; 32]).unwrap();
        let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
        let account = master.derive_priv(&secp, &path).unwrap();
        CosignerInput {
            id: format!("signer-{seed_byte}"),
            label: "Coldcard".to_owned(),
            fingerprint: master.fingerprint(&secp).to_string(),
            xpub: Xpub::from_priv(&secp, &account).to_string(),
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            source: CosignerSource::File,
            device_type: Some("coldcard".to_owned()),
        }
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
    fn keypool_response_binds_fingerprint_xpub_and_requested_path() {
        let signer = signer_from_seed(7);
        let origin = MULTISIG_ACCOUNT_PATH.trim_start_matches("m/");
        let output = serde_json::to_vec(&serde_json::json!([{
            "desc": format!(
                "wpkh([{}/{}]{}/0/*)",
                signer.fingerprint, origin, signer.xpub
            )
        }]))
        .unwrap();

        let (fingerprint, xpub) =
            parse_hwi_account_keypool(&output, MULTISIG_ACCOUNT_PATH, "trezor").unwrap();
        assert_eq!(fingerprint, signer.fingerprint);
        assert_eq!(xpub, signer.xpub);

        let error =
            parse_hwi_account_keypool(&output, SINGLESIG_ACCOUNT_PATH, "trezor").unwrap_err();
        assert_eq!(error.code, "invalid_derivation_path");
    }
}
