use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigCreationDto {
    wallet: MultisigWalletDto,
    network_setup_copied: bool,
}

fn copy_network_setup_before_profile_commit(
    app: &AppHandle,
    state: &State<'_, AppState>,
    source_wallet_id: Option<&str>,
    destination: Uuid,
    credential: &str,
) -> ApiResult<bool> {
    let Some(source_wallet_id) = source_wallet_id else {
        return Ok(true);
    };
    if profile_commands::adopt_network_setup_for_new_profile(
        app,
        state,
        source_wallet_id,
        destination,
        credential,
    )
    .is_ok()
    {
        return Ok(true);
    }
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
    Ok(false)
}

#[tauri::command]
pub fn multisig_tx_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    recipient: String,
    label: String,
    amount: u64,
    fee_rate: f64,
    coin_selection: CoinSelectionInput,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    crate::release_policy::validate_spend(NETWORK, 1, amount)
        .map_err(|_| api_error("invalid_amount", "This spend is blocked by release policy."))?;
    let label = normalize_label(&label)?;
    if amount == 0 {
        return Err(api_error(
            "invalid_amount",
            "Amount must be greater than zero.",
        ));
    }
    if !fee_rate.is_finite() || fee_rate <= 0.0 || fee_rate > 10_000.0 {
        return Err(api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        ));
    }
    let unchecked = Address::from_str(recipient.trim()).map_err(|_| {
        api_error(
            "invalid_address",
            format!("Enter a valid {NETWORK_NAME} Bitcoin address."),
        )
    })?;
    let address = unchecked.require_network(NETWORK).map_err(|_| {
        api_error(
            "invalid_address",
            format!("The address is not for {NETWORK_NAME}."),
        )
    })?;
    let applied_fee_rate = fee_rate.ceil();
    let rate = FeeRate::from_sat_per_vb(applied_fee_rate as u64)
        .ok_or_else(|| api_error("invalid_amount", "Fee rate must be greater than zero."))?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let mut transaction = db.transaction().map_err(internal)?;
    let selection_strategy = coin_selection.strategy_name().to_owned();
    let frozen = frozen_outpoints(&transaction)?;
    let private_fee = if matches!(
        &coin_selection,
        CoinSelectionInput::Auto {
            strategy: AutomaticSelectionStrategy::LowerFee
        }
    ) {
        let mut comparison_wallet = load_wallet_transaction(&mut transaction)?;
        label_provenance::reconcile_wallet_outputs(&comparison_wallet, &transaction, now())
            .map_err(internal)?;
        let privacy = label_provenance::coin_privacy_map(&transaction).map_err(internal)?;
        let private_psbt = build_automatic_payment(
            &mut comparison_wallet,
            AutomaticPaymentOptions {
                recipient: &address,
                amount,
                rate,
                frozen: frozen.clone(),
                strategy: AutomaticSelectionStrategy::Private,
                privacy,
                global_xpubs: true,
            },
        )?;
        let fee = private_psbt
            .fee_amount()
            .ok_or_else(|| internal("Unable to calculate the private candidate fee."))?
            .to_sat();
        drop(comparison_wallet);
        Some(fee)
    } else {
        None
    };
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    let psbt = match coin_selection {
        CoinSelectionInput::Auto { strategy } => {
            label_provenance::reconcile_wallet_outputs(&wallet, &transaction, now())
                .map_err(internal)?;
            let privacy = label_provenance::coin_privacy_map(&transaction).map_err(internal)?;
            build_automatic_payment(
                &mut wallet,
                AutomaticPaymentOptions {
                    recipient: &address,
                    amount,
                    rate,
                    frozen,
                    strategy,
                    privacy,
                    global_xpubs: true,
                },
            )?
        }
        CoinSelectionInput::Manual { outpoints } => {
            let selected = validate_manual_outpoints(&outpoints, &frozen)?;
            let mut builder = wallet.build_tx();
            builder
                .add_recipient(address.script_pubkey(), Amount::from_sat(amount))
                .fee_rate(rate)
                .add_global_xpubs()
                .add_utxos(&selected)
                .map_err(|_| {
                    api_error(
                        "coin_unavailable",
                        "A selected coin is not available in this wallet.",
                    )
                })?
                .manually_selected_only();
            builder.finish().map_err(create_tx_api_error)?
        }
    };
    enforce_change_recovery_gap(&transaction, &wallet, &psbt)?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the transaction fee."))?
        .to_sat();
    let fee_difference_vs_private = fee_difference(fee, private_fee)?;
    let proposal_id = Uuid::new_v4().to_string();
    let encoded = encode_psbt(&psbt);
    let created_at = now();
    transaction.execute(
        "INSERT INTO groot_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy, fee_difference_vs_private) VALUES (?1,?2,?3,?4,?5,?6,?7,'collecting',?8,?9,?10)",
        params![proposal_id, address.to_string(), label, amount, fee, applied_fee_rate, encoded, created_at, selection_strategy, fee_difference_vs_private],
    ).map_err(internal)?;
    label_provenance::assign_payment_intent(&transaction, &label, &proposal_id, created_at, false)
        .map_err(|error| {
            if error.sqlite_error_code()
                == Some(bdk_wallet::rusqlite::ErrorCode::ConstraintViolation)
            {
                api_error(
                    "invalid_label",
                    "Permanent labels cannot be reused for a different payment.",
                )
            } else {
                internal(error)
            }
        })?;
    wallet.persist(&mut transaction).map_err(internal)?;
    drop(wallet);
    transaction.commit().map_err(internal)?;
    load_multisig_proposal(&mut db, &metadata, &proposal_id)
}

#[tauri::command]
pub fn multisig_tx_max_spend(
    app: AppHandle,
    state: State<'_, AppState>,
    recipient: String,
    fee_rate: f64,
    coin_selection: CoinSelectionInput,
) -> ApiResult<MaxSpendDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let address = Address::from_str(recipient.trim())
        .map_err(|_| {
            api_error(
                "invalid_address",
                format!("Enter a valid {NETWORK_NAME} Bitcoin address."),
            )
        })?
        .require_network(NETWORK)
        .map_err(|_| {
            api_error(
                "invalid_address",
                format!("The address is not for {NETWORK_NAME}."),
            )
        })?;
    let applied = fee_rate.ceil();
    let rate = FeeRate::from_sat_per_vb(applied as u64)
        .filter(|_| fee_rate.is_finite() && fee_rate > 0.0 && fee_rate <= 10_000.0)
        .ok_or_else(|| {
            api_error(
                "invalid_amount",
                "Fee rate must be between 0 and 10,000 sat/vB.",
            )
        })?;
    let mut db = open_multisig_db(&app)?;
    let mut transaction = db.transaction().map_err(internal)?;
    let frozen = frozen_outpoints(&transaction)?;
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    let psbt = match coin_selection {
        CoinSelectionInput::Auto { strategy } => {
            label_provenance::reconcile_wallet_outputs(&wallet, &transaction, now())
                .map_err(internal)?;
            let privacy = label_provenance::coin_privacy_map(&transaction).map_err(internal)?;
            let mut builder = wallet
                .build_tx()
                .coin_selection(PrivacyAwareCoinSelection::new(strategy, privacy));
            builder
                .drain_wallet()
                .drain_to(address.script_pubkey())
                .fee_rate(rate)
                .unspendable(frozen)
                .add_global_xpubs();
            builder.finish().map_err(create_tx_api_error)?
        }
        CoinSelectionInput::Manual { outpoints } => {
            let selected = validate_manual_outpoints(&outpoints, &frozen)?;
            let mut builder = wallet.build_tx();
            builder
                .add_utxos(&selected)
                .map_err(|_| {
                    api_error(
                        "coin_unavailable",
                        "A selected coin is not available in this wallet.",
                    )
                })?
                .manually_selected_only()
                .drain_to(address.script_pubkey())
                .fee_rate(rate)
                .add_global_xpubs();
            builder.finish().map_err(create_tx_api_error)?
        }
    };
    let amount = psbt
        .unsigned_tx
        .output
        .iter()
        .find(|output| output.script_pubkey == address.script_pubkey())
        .map(|output| output.value.to_sat())
        .ok_or_else(|| {
            api_error(
                "insufficient_funds",
                "The selected balance cannot cover the network fee.",
            )
        })?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the transaction fee."))?
        .to_sat();
    Ok(MaxSpendDto { amount, fee })
}
#[tauri::command]
pub fn multisig_proposals(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<MultisigProposalDto>> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
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
        row.map_err(internal)
            .and_then(|row| proposal_dto(row, &metadata, &wallet, &db))
    })
    .collect()
}

pub(crate) fn import_multisig_proposal(
    app: &AppHandle,
    proposal_id: &str,
    signed_psbt: &str,
) -> ApiResult<MultisigProposalDto> {
    let metadata = read_multisig_metadata(app)?;
    let mut db = open_multisig_db(app)?;
    import_multisig_proposal_in_db(&mut db, &metadata, proposal_id, signed_psbt)
}

pub(crate) fn import_multisig_proposal_in_db(
    db: &mut Connection,
    metadata: &MultisigWalletDto,
    proposal_id: &str,
    signed_psbt: &str,
) -> ApiResult<MultisigProposalDto> {
    let current = load_multisig_proposal(db, metadata, proposal_id)?;
    let original_encoded = current.psbt.clone();
    let mut original = decode_psbt(&original_encoded).map_err(proposal_api_error)?;
    let imported = decode_psbt(signed_psbt).map_err(proposal_api_error)?;
    let fingerprints = multisig_fingerprints(metadata)?;
    let progress = merge_signed_psbt(&mut original, imported, &fingerprints, metadata.threshold)
        .map_err(proposal_api_error)?;
    if progress.can_finalize {
        let wallet = load_wallet(db)?;
        let mut validation = original.clone();
        if !wallet
            .finalize_psbt(&mut validation, SignOptions::default())
            .map_err(internal)?
        {
            return Err(api_error(
                "finalization_failed",
                "The collected signatures do not validly satisfy this wallet policy.",
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
            "The proposal changed while signatures were being merged. Reload it and try again.",
        ));
    }
    load_multisig_proposal(db, metadata, proposal_id)
}

pub(crate) fn finalized_multisig_proposal_transaction(
    db: &mut Connection,
    metadata: &MultisigWalletDto,
    proposal_id: &str,
    reviewed_psbt: &str,
) -> ApiResult<Transaction> {
    let proposal = load_multisig_proposal(db, metadata, proposal_id)?;
    if proposal.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The signed proposal changed after review. Reload it before broadcast.",
        ));
    }
    if !proposal.can_finalize {
        return Err(api_error(
            "insufficient_signatures",
            "Collect the required signatures before broadcasting.",
        ));
    }
    let mut psbt = decode_psbt(&proposal.psbt).map_err(proposal_api_error)?;
    let wallet = load_wallet(db)?;
    if !wallet
        .finalize_psbt(&mut psbt, SignOptions::default())
        .map_err(internal)?
    {
        return Err(api_error(
            "finalization_failed",
            "The signed transaction does not satisfy the wallet policy.",
        ));
    }
    psbt.extract_tx().map_err(internal)
}

#[tauri::command]
pub fn multisig_proposal_import(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    reviewed_psbt: String,
    signed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let current = load_multisig_proposal(&mut db, &metadata, &proposal_id)?;
    if current.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed after review. Reload it before importing a signature.",
        ));
    }
    drop(db);
    import_multisig_proposal(&app, &proposal_id, &signed_psbt)
}

#[tauri::command]
pub fn multisig_proposal_discard_signature(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    reviewed_psbt: String,
    signer_fingerprint: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let current = load_multisig_proposal(&mut db, &metadata, &proposal_id)?;
    if current.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed after review. Reload it before discarding a signature.",
        ));
    }

    let signer = Fingerprint::from_str(signer_fingerprint.trim()).map_err(|_| {
        api_error(
            "unknown_signer",
            "The selected signer does not belong to this wallet. No signatures were changed.",
        )
    })?;
    let fingerprints = multisig_fingerprints(&metadata)?;
    let mut psbt = decode_psbt(&current.psbt).map_err(proposal_api_error)?;
    let progress = discard_signer_signature(&mut psbt, signer, &fingerprints, metadata.threshold)
        .map_err(proposal_api_error)?;
    let status = if progress.can_finalize {
        "ready"
    } else {
        "collecting"
    };
    let changed = db
        .execute(
            "UPDATE groot_proposals SET psbt = ?1, status = ?2 WHERE proposal_id = ?3 AND status IN ('collecting','ready') AND psbt = ?4",
            params![encode_psbt(&psbt), status, proposal_id, reviewed_psbt],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed while the signature was being discarded. Reload it and try again.",
        ));
    }
    load_multisig_proposal(&mut db, &metadata, &proposal_id)
}

#[tauri::command]
pub async fn hardware_sign_multisig(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    device_id: String,
    reviewed_psbt: String,
) -> ApiResult<MultisigProposalDto> {
    require_unlocked(&app, &state)?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let proposal = load_multisig_proposal(&mut db, &metadata, &proposal_id)?;
    if proposal.psbt != reviewed_psbt {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal changed after review. Reload it before signing.",
        ));
    }
    let policy_verifications = signer_policy_verification_rows(&db)?;
    drop(db);
    let reviewed_hardware_psbt = decode_psbt(&proposal.psbt).map_err(proposal_api_error)?;
    let mut signing_psbt = reviewed_hardware_psbt.clone();
    let reviewed_global_xpubs = signing_psbt.xpub.clone();
    add_multisig_global_xpubs(&mut signing_psbt, &metadata)?;
    let encoded = encode_psbt(&signing_psbt);
    let hwi = hwi_cli(&app)?;
    let device = hardware_commands::recently_scanned_hardware_device(&state, &device_id)?;
    let expected_signers =
        hardware_commands::saved_cosigner_candidates_for_device(&metadata.cosigners, &device)?;
    let (signed, signing_identity) = tauri::async_runtime::spawn_blocking(move || {
        let operation = hwi
            .begin_interactive_operation()
            .map_err(hardware_api_error)?;
        let identity = hardware_commands::prove_live_cosigner_identity_for_candidates(
            &hwi,
            &operation,
            &device,
            &expected_signers,
        )?;
        if records_interactive_policy_verification(&identity.device_type)
            && !has_signer_policy_verification(&policy_verifications, &identity)
        {
            return Err(api_error(
                "invalid_hardware_request",
                "Verify this signer's wallet policy and first address before signing.",
            ));
        }
        if identity.device_type.eq_ignore_ascii_case("coldcard")
            && !has_coldcard_policy_acknowledgement(&policy_verifications, &identity)
        {
            return Err(api_error(
                "invalid_hardware_request",
                "Import and verify this wallet's policy file on Coldcard before signing.",
            ));
        }
        let output = hwi
            .sign_psbt_in_operation(&operation, &identity.device_type, &device.path, &encoded)
            .map_err(|error| hardware_device_api_error(error, &identity.device_type))?;
        let response: HwiPsbt = serde_json::from_slice(&output).map_err(internal)?;
        let signed = response.psbt.ok_or_else(|| {
            drop(response.error);
            missing_hardware_psbt(
                &identity.device_type,
                response.code,
                "The device did not return a signed PSBT.",
            )
        })?;
        Ok::<_, ApiError>((signed, identity))
    })
    .await
    .map_err(internal)??;
    let returned_psbt = decode_psbt(&signed).map_err(proposal_api_error)?;
    let mut signed_psbt = hardware_signature_response(&reviewed_hardware_psbt, returned_psbt)
        .map_err(proposal_api_error)?;
    let returned_progress = signature_progress(
        &signed_psbt,
        &multisig_fingerprints(&metadata)?,
        metadata.threshold,
    )
    .map_err(proposal_api_error)?;
    let signer_was_already_present = proposal
        .signed_fingerprints
        .iter()
        .any(|fingerprint| fingerprint.eq_ignore_ascii_case(&signing_identity.fingerprint));
    let signer_is_present = returned_progress
        .signed_fingerprints
        .iter()
        .any(|fingerprint| fingerprint.eq_ignore_ascii_case(&signing_identity.fingerprint));
    if !signer_was_already_present && !signer_is_present {
        let message = if signing_identity.device_type.eq_ignore_ascii_case("ledger") {
            "Ledger returned the PSBT without adding its signature. Keep Bitcoin Test open and approve the wallet policy and transaction on-device, then try again. No signatures were changed."
        } else {
            "The hardware wallet returned the PSBT without adding its signature. Review any message on the device and try again. No signatures were changed."
        };
        return Err(api_error("hardware_signature_missing", message));
    }
    signed_psbt.xpub = reviewed_global_xpubs;
    import_multisig_proposal(&app, &proposal_id, &encode_psbt(&signed_psbt))
}

#[tauri::command]
pub fn multisig_proposal_broadcast(
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
    let credential_result = verify_multisig_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &credential_result)?;
    credential_result?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let transaction =
        finalized_multisig_proposal_transaction(&mut db, &metadata, &proposal_id, &reviewed_psbt)?;
    let txid = broadcast_transaction(&app, &state, &transaction)?;
    let snapshot = commit_multisig_broadcast(&mut db, &transaction, &proposal_id, &txid, None)?;
    let (snapshot, sync_pending) = match sync_wallet_atomically(&app, &state, &mut db, true, None) {
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
pub fn multisig_proposal_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_multisig_db(&app)?;
    let changed = db.execute(
        "UPDATE groot_proposals SET status = 'cancelled' WHERE proposal_id = ?1 AND status IN ('collecting','ready')",
        params![proposal_id],
    ).map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "proposal_not_found",
            "Payment proposal was not found or is no longer active.",
        ))
    }
}

#[tauri::command]
pub async fn multisig_create(
    app: AppHandle,
    policy: PolicyInput,
    credential: String,
    network_setup_source_wallet_id: Option<String>,
) -> ApiResult<MultisigCreationDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        if network_setup_source_wallet_id.is_some() {
            require_unlocked(&app, &state)?;
        }
        let credential = Zeroizing::new(credential);
        validate_credential(credential.as_str())?;
        reject_virtual_cosigners(&policy.cosigners)?;
        let preview = policy.preview().map_err(policy_api_error)?;
        let coldcard_registered =
            multisig_setup_commands::coldcard_registration_for_preview(&app, &preview)?;
        let preview_descriptor_checksum = descriptor_checksum(&preview.external_descriptor)?;
        let (id, dir) = prepare_profile_directory(&app)?;
        let result = (|| {
            let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
            init_app_schema(&db)?;
            Wallet::create(
                preview.external_descriptor.clone(),
                preview.internal_descriptor.clone(),
            )
            .network(NETWORK)
            .create_wallet(&mut db)
            .map_err(internal)?;

            let pending = state
                .pending_policy_verifications
                .lock()
                .map_err(internal)?;
            for cosigner in &preview.cosigners {
                let key = format!(
                    "{}:{}",
                    preview_descriptor_checksum,
                    cosigner.fingerprint.to_ascii_lowercase()
                );
                if let Some(verification) = pending.get(&key) {
                    db.execute(
                        "INSERT INTO groot_signer_policy_verifications
                        (signer_fingerprint, device_type, scope, displayed_address, verified_at)
                     VALUES (?1, ?2, 'policy_and_address', ?3, ?4)",
                        params![
                            verification.signer_fingerprint,
                            verification.device_type,
                            verification.displayed_address,
                            verification.verified_at.parse::<u64>().map_err(internal)?
                        ],
                    )
                    .map_err(internal)?;
                }
            }
            drop(pending);

            if coldcard_registered {
                let acknowledged_at = now();
                for cosigner in &preview.cosigners {
                    if supports_coldcard_policy_acknowledgement(cosigner) {
                        db.execute(
                            "INSERT INTO groot_signer_policy_acknowledgements
                            (signer_fingerprint, device_type, scope, acknowledged_at)
                         VALUES (?1, 'coldcard', 'policy_file_acknowledgement', ?2)",
                            params![cosigner.fingerprint.to_ascii_lowercase(), acknowledged_at],
                        )
                        .map_err(internal)?;
                    }
                }
            }

            let marker = format!("groot-multisig:{}", preview.external_descriptor);
            secure_store::store(
                &dir.join("secret.json"),
                marker.as_bytes(),
                credential.as_str(),
            )
            .map_err(secure_store_error)?;
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
            write_private_json(&dir.join("wallet.json"), &wallet)?;
            let network_setup_copied = copy_network_setup_before_profile_commit(
                &app,
                &state,
                network_setup_source_wallet_id.as_deref(),
                id,
                credential.as_str(),
            )?;
            commit_multisig_profile(&app, id, &wallet)?;
            Ok((wallet, network_setup_copied))
        })();
        if result.is_err() {
            state.node_auth.lock().map_err(internal)?.remove(&id);
            cleanup_failed_profile(&dir)?;
        }
        let (wallet, network_setup_copied) = result?;
        state
            .pending_policy_verifications
            .lock()
            .map_err(internal)?
            .clear();
        let _ = multisig_setup_commands::clear_multisig_setup_draft(&app);
        unlock_selected(&app, &state)?;
        reset_auth_throttle(&app, &state)?;
        Ok(MultisigCreationDto {
            wallet,
            network_setup_copied,
        })
    })
    .await
    .map_err(internal)?
}
#[tauri::command]
pub async fn multisig_recovery_create(
    app: AppHandle,
    name: String,
    template: RecoveryTemplate,
    cosigners: Vec<crate::multisig::CosignerInput>,
    credential: String,
    network_setup_source_wallet_id: Option<String>,
) -> ApiResult<MultisigCreationDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        if network_setup_source_wallet_id.is_some() {
            require_unlocked(&app, &state)?;
        }
        let credential = Zeroizing::new(credential);
        validate_credential(credential.as_str())?;
        reject_virtual_cosigners(&cosigners)?;
        let policy = PolicyInput {
            name: name.clone(),
            threshold: 2,
            cosigners: cosigners.clone(),
        };
        policy.preview().map_err(policy_api_error)?;
        let analysis = analyze_template(&template, &cosigners).map_err(recovery_api_error)?;
        let threshold = analysis
            .paths
            .first()
            .map(|path| path.threshold)
            .unwrap_or(2);
        let (id, dir) = prepare_profile_directory(&app)?;
        let result = (|| {
            let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
            init_app_schema(&db)?;
            Wallet::create(
                analysis.external_descriptor.clone(),
                analysis.internal_descriptor.clone(),
            )
            .network(NETWORK)
            .create_wallet(&mut db)
            .map_err(internal)?;
            let marker = format!("groot-multisig:{}", analysis.external_descriptor);
            secure_store::store(
                &dir.join("secret.json"),
                marker.as_bytes(),
                credential.as_str(),
            )
            .map_err(secure_store_error)?;
            let wallet = MultisigWalletDto {
                kind: "multisig".to_owned(),
                name,
                threshold,
                cosigners,
                external_descriptor: analysis.external_descriptor,
                internal_descriptor: analysis.internal_descriptor,
                created_at: now().to_string(),
                policy_type: recovery_policy_type(&template).to_owned(),
                recovery_template: Some(template),
                spending_paths: analysis.paths,
            };
            write_private_json(&dir.join("wallet.json"), &wallet)?;
            let network_setup_copied = copy_network_setup_before_profile_commit(
                &app,
                &state,
                network_setup_source_wallet_id.as_deref(),
                id,
                credential.as_str(),
            )?;
            commit_multisig_profile(&app, id, &wallet)?;
            Ok((wallet, network_setup_copied))
        })();
        if result.is_err() {
            state.node_auth.lock().map_err(internal)?.remove(&id);
            cleanup_failed_profile(&dir)?;
        }
        let (wallet, network_setup_copied) = result?;
        let _ = multisig_setup_commands::clear_multisig_setup_draft(&app);
        unlock_selected(&app, &state)?;
        reset_auth_throttle(&app, &state)?;
        Ok(MultisigCreationDto {
            wallet,
            network_setup_copied,
        })
    })
    .await
    .map_err(internal)?
}
