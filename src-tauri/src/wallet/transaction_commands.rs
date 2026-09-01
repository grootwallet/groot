use super::*;

#[tauri::command]
pub async fn tx_proposals(app: AppHandle) -> ApiResult<Vec<PaymentProposalDto>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let mut db = open_db(&app)?;
        let wallet = load_wallet(&mut db)?;
        let proposal_ids = active_payment_proposal_ids(&db)?;
        proposal_ids
            .iter()
            .map(|proposal_id| load_payment_proposal_dto(&db, &wallet, proposal_id))
            .collect()
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn tx_proposal_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_db(&app)?;
    let changed = db
        .execute(
            "UPDATE groot_proposals SET status = 'cancelled'
             WHERE proposal_id = ?1 AND status IN ('collecting', 'ready')",
            params![proposal_id],
        )
        .map_err(internal)?;
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
pub fn tx_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    recipient: String,
    labels: Vec<String>,
    amount: u64,
    fee_rate: f64,
    coin_selection: CoinSelectionInput,
) -> ApiResult<PaymentProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    crate::release_policy::validate_spend(NETWORK, 1, amount)
        .map_err(|_| api_error("invalid_amount", "This spend is blocked by release policy."))?;
    let labels = normalize_labels(labels)?;
    let label = labels[0].clone();
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
    let mut db = open_db(&app)?;
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
                global_xpubs: false,
                policy_paths: Vec::new(),
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
                    global_xpubs: false,
                    policy_paths: Vec::new(),
                },
            )?
        }
        CoinSelectionInput::Manual { outpoints } => {
            let selected = validate_manual_outpoints(&outpoints, &frozen)?;
            let mut builder = wallet.build_tx();
            builder
                .add_recipient(address.script_pubkey(), Amount::from_sat(amount))
                .fee_rate(rate)
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
    let (change, change_addresses) =
        proposal_change_details(&wallet, &psbt, &address.to_string(), amount)?;
    let recipient = address.to_string();
    let (recipient_is_wallet_owned, recipient_derivation_paths) =
        proposal_recipient_wallet_details(&wallet, &psbt, &recipient, amount)?;
    let wallet_controlled_output_amount =
        proposal_wallet_controlled_output_amount(&wallet, &psbt, recipient_is_wallet_owned)?;
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(&psbt, &change_addresses)?;
    let selected_outpoints = psbt
        .unsigned_tx
        .input
        .iter()
        .map(|input| input.previous_output.to_string())
        .collect();
    let proposal_id = Uuid::new_v4().to_string();
    let (inputs, actual_fee_rate, locktime, rbf) =
        proposal_transaction_details(&wallet, &psbt, fee)?;
    let selection_impact = selection_impact(
        &transaction,
        &wallet,
        &psbt,
        &selection_strategy,
        fee_difference_vs_private,
    )?;
    let proposal = PaymentProposalDto {
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
        fee_rate: actual_fee_rate,
        total: checked_payment_total(amount, fee)?,
        change,
        change_addresses,
        change_testnet_aliases,
        change_derivation_paths,
        output_count: psbt.unsigned_tx.output.len(),
        selected_outpoints,
        inputs,
        locktime,
        rbf,
        network: NETWORK_NAME,
        selection_impact,
        acceleration: None,
    };
    persist_prepared_state(&mut transaction, &mut wallet, &proposal, &psbt, None)?;
    drop(wallet);
    transaction.commit().map_err(internal)?;
    state.proposals.lock().map_err(internal)?.insert(
        proposal_id.clone(),
        PendingProposal {
            psbt,
            recipient: proposal.recipient.clone(),
            amount: proposal.amount,
            fee: proposal.fee,
        },
    );
    Ok(proposal)
}

#[tauri::command]
pub fn tx_max_spend(
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
    let mut db = open_db(&app)?;
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
                .unspendable(frozen);
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
                .fee_rate(rate);
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

pub(crate) fn validate_acceleration_rate(fee_rate: &str) -> ApiResult<(f64, FeeRate)> {
    let value = fee_rate.trim();
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
        || fraction.len() > 8
    {
        return Err(api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        ));
    }
    let whole = whole.parse::<u64>().map_err(|_| {
        api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        )
    })?;
    let scale = 10_u64
        .checked_pow(fraction.len() as u32)
        .ok_or_else(|| api_error("invalid_amount", "Fee rate has too much precision."))?;
    let fractional = if fraction.is_empty() {
        0
    } else {
        fraction.parse::<u64>().map_err(|_| {
            api_error(
                "invalid_amount",
                "Fee rate must be between 0 and 10,000 sat/vB.",
            )
        })?
    };
    let scaled = whole
        .checked_mul(scale)
        .and_then(|value| value.checked_add(fractional))
        .ok_or_else(|| api_error("invalid_amount", "Fee rate is too large."))?;
    if scaled == 0 || scaled > 10_000_u64.saturating_mul(scale) {
        return Err(api_error(
            "invalid_amount",
            "Fee rate must be between 0 and 10,000 sat/vB.",
        ));
    }
    // Bitcoin's FeeRate stores integer sat/kwu, so one exact step is 0.004 sat/vB.
    // Round upward to that protocol precision instead of silently rounding to a whole sat/vB.
    let sat_per_kwu = scaled
        .checked_mul(250)
        .ok_or_else(|| api_error("invalid_amount", "Fee rate is too large."))?
        .div_ceil(scale);
    let rate = FeeRate::from_sat_per_kwu(sat_per_kwu);
    let applied = sat_per_kwu as f64 / 250.0;
    Ok((applied, rate))
}

fn replacement_vsize(wallet: &Wallet, psbt: &Psbt) -> ApiResult<u64> {
    let mut satisfaction_weight = Weight::ZERO;
    for (index, input) in psbt.unsigned_tx.input.iter().enumerate() {
        let utxo = psbt.get_utxo_for(index).ok_or_else(|| {
            api_error(
                "proposal_mismatch",
                "A replacement input is missing its previous output.",
            )
        })?;
        let (keychain, _) = wallet
            .derivation_of_spk(utxo.script_pubkey)
            .ok_or_else(|| {
                api_error(
                    "proposal_mismatch",
                    "A replacement input is not controlled by this wallet.",
                )
            })?;
        let _ = input;
        satisfaction_weight = satisfaction_weight
            .checked_add(
                wallet
                    .public_descriptor(keychain)
                    .max_weight_to_satisfy()
                    .map_err(internal)?,
            )
            .ok_or_else(|| internal("The replacement weight overflowed."))?;
    }
    psbt.unsigned_tx
        .weight()
        .checked_add(satisfaction_weight)
        .map(Weight::to_vbytes_ceil)
        .filter(|vsize| *vsize > 0)
        .ok_or_else(|| internal("The replacement has an invalid signed size."))
}

fn rbf_candidate(wallet: &mut Wallet, txid: Txid, rate: FeeRate) -> ApiResult<(Psbt, u64, u64)> {
    let mut builder = wallet.build_fee_bump(txid).map_err(acceleration_error)?;
    builder.fee_rate(rate);
    let psbt = builder.finish().map_err(rbf_candidate_error)?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the replacement fee."))?
        .to_sat();
    let vsize = replacement_vsize(wallet, &psbt)?;
    Ok((psbt, fee, vsize))
}

pub(crate) fn rbf_candidate_error(error: impl ToString) -> ApiError {
    let translated = acceleration_error(error);
    if translated.code == "insufficient_funds" {
        api_error(
            "insufficient_funds",
            "The replacement keeps the recipient amount unchanged, but available change and the wallet's other spendable coins cannot cover the higher fee.",
        )
    } else {
        translated
    }
}

fn quote_rbf(
    wallet: &mut Wallet,
    txid: Txid,
    requested_rate: Option<&str>,
    core_incremental_fee_per_kvb: u64,
    core_priority_rate: Option<f64>,
) -> ApiResult<(AccelerationQuoteDto, Psbt)> {
    let original = wallet.get_tx(txid).ok_or_else(|| {
        api_error(
            "acceleration_unavailable",
            "Transaction was not found in this wallet.",
        )
    })?;
    if original.chain_position.is_confirmed() {
        return Err(api_error(
            "transaction_confirmed",
            "Confirmed transactions cannot be accelerated.",
        ));
    }
    let original_tx = original.tx_node.tx.clone();
    let original_fee = wallet
        .calculate_fee(&original_tx)
        .map_err(acceleration_error)?
        .to_sat();
    let original_vsize = original_tx.weight().to_vbytes_ceil();
    let original_rate = Amount::from_sat(original_fee) / original_tx.weight();
    let bdk_increment = FeeRate::BROADCAST_MIN.to_sat_per_kwu();
    let core_increment = core_incremental_fee_per_kvb.div_ceil(4);
    let mut minimum_kwu = original_rate
        .to_sat_per_kwu()
        .saturating_add(bdk_increment.max(core_increment));
    let (minimum_psbt, minimum_fee, minimum_vsize) = loop {
        let rate = FeeRate::from_sat_per_kwu(minimum_kwu);
        match rbf_candidate(wallet, txid, rate) {
            Ok((psbt, fee, vsize)) => {
                let core_incremental_fee = core_incremental_fee_per_kvb
                    .saturating_mul(vsize)
                    .div_ceil(1_000);
                if fee > original_fee && fee >= original_fee.saturating_add(core_incremental_fee) {
                    break (psbt, fee, vsize);
                }
            }
            Err(error) if error.code == "fee_rate_too_low" => {}
            Err(error) => return Err(error),
        }
        minimum_kwu = minimum_kwu.saturating_add(1);
        if minimum_kwu > 2_500_000 {
            return Err(api_error(
                "acceleration_unavailable",
                "The replacement minimum exceeds Groot's fee-rate limit.",
            ));
        }
    };
    let minimum_rate = minimum_kwu as f64 / 250.0;
    let (target_rate, target, source) = if let Some(requested) = requested_rate {
        let (applied, rate) = validate_acceleration_rate(requested)?;
        if rate.to_sat_per_kwu() < minimum_kwu {
            return Err(api_error(
                "fee_rate_too_low",
                format!("Choose at least {minimum_rate:.3} sat/vB for this replacement."),
            ));
        }
        (applied, rate, "custom".to_owned())
    } else {
        let safe_kwu = minimum_kwu.saturating_add(250);
        let core_kwu = core_priority_rate
            .filter(|rate| rate.is_finite() && *rate > 0.0 && *rate <= 10_000.0)
            .map(|rate| (rate * 250.0).ceil() as u64)
            .unwrap_or(0);
        let target_kwu = safe_kwu.max(core_kwu);
        (
            target_kwu as f64 / 250.0,
            FeeRate::from_sat_per_kwu(target_kwu),
            if core_kwu >= safe_kwu {
                "bitcoin_core"
            } else {
                "replacement_fallback"
            }
            .to_owned(),
        )
    };
    let (psbt, replacement_fee, replacement_vsize) =
        if target == FeeRate::from_sat_per_kwu(minimum_kwu) {
            (minimum_psbt, minimum_fee, minimum_vsize)
        } else {
            rbf_candidate(wallet, txid, target)?
        };
    let effective = ((replacement_fee as f64 / replacement_vsize as f64) * 100.0).round() / 100.0;
    Ok((
        AccelerationQuoteDto {
            method: AccelerationMethod::Rbf,
            original_txid: txid.to_string(),
            original_fee,
            original_vsize,
            original_effective_fee_rate: ((original_fee as f64 / original_vsize as f64) * 1000.0)
                .round()
                / 1000.0,
            minimum_fee_rate: minimum_rate,
            target_fee_rate: target_rate,
            estimated_replacement_fee: replacement_fee,
            incremental_fee: replacement_fee.saturating_sub(original_fee),
            resulting_effective_fee_rate: effective,
            replacement_vsize,
            recommendation_source: source,
        },
        psbt,
    ))
}

fn core_replacement_policy(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> ApiResult<(u64, Option<f64>)> {
    let client = rpc_client(app, state)?;
    checked_chain_identity(&client)?;
    let incremental_fee = core_incremental_relay_fee(&client)?;
    let priority = if IS_REGTEST {
        Some(5.0)
    } else {
        profile_commands::estimate_core_fee(&client, 2, EstimateMode::Economical).ok()
    };
    Ok((incremental_fee, priority))
}

pub(super) fn core_incremental_relay_fee(client: &Client) -> ApiResult<u64> {
    let incremental_fee = client
        .get_mempool_info()
        .map_err(rpc_api_error)?
        .incremental_relay_fee
        .ok_or_else(|| {
            api_error(
                "fee_estimate_unavailable",
                "Bitcoin Core did not report its replacement policy.",
            )
        })?
        .to_sat();
    if incremental_fee == 0 {
        return Err(api_error(
            "fee_estimate_unavailable",
            "Bitcoin Core returned an invalid replacement policy.",
        ));
    }
    Ok(incremental_fee)
}

#[tauri::command]
pub fn rbf_acceleration_quote(
    app: AppHandle,
    state: State<'_, AppState>,
    txid: String,
    fee_rate: Option<String>,
) -> ApiResult<AccelerationQuoteDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let txid = Txid::from_str(&txid)
        .map_err(|_| api_error("acceleration_unavailable", "Enter a valid transaction ID."))?;
    let (incremental_fee, priority) = core_replacement_policy(&app, &state)?;
    let profile = selected_profile(&app)?;
    let mut db = match profile.kind {
        WalletKind::Multisig => open_multisig_db(&app)?,
        WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
    };
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    let (quote, _) = quote_rbf(
        &mut wallet,
        txid,
        fee_rate.as_deref(),
        incremental_fee,
        priority,
    )?;
    Ok(quote)
}

pub(crate) fn acceleration_error(error: impl ToString) -> ApiError {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("confirmed") {
        api_error(
            "transaction_confirmed",
            "Confirmed transactions cannot be accelerated.",
        )
    } else if lower.contains("irreplaceable") || lower.contains("rbf") {
        api_error(
            "transaction_not_replaceable",
            "This transaction did not signal replace-by-fee. Use CPFP when it has a spendable wallet output.",
        )
    } else if lower.contains("fee rate too low") {
        api_error(
            "fee_rate_too_low",
            "Choose a fee rate above the original transaction's replacement minimum.",
        )
    } else if lower.contains("fee") || lower.contains("insufficient") {
        api_error("insufficient_funds", message)
    } else {
        api_error(
            "acceleration_unavailable",
            "This transaction cannot be accelerated right now. Update the wallet and try again.",
        )
    }
}

pub(crate) fn resolve_cpfp_parent_fee(
    wallet_fee: Option<Amount>,
    fetch_mempool_fee: impl FnOnce() -> ApiResult<Amount>,
) -> ApiResult<Amount> {
    match wallet_fee {
        Some(fee) => Ok(fee),
        None => fetch_mempool_fee(),
    }
}

pub(crate) fn cpfp_parent_fee(
    app: &AppHandle,
    state: &State<'_, AppState>,
    wallet: &Wallet,
    parent_txid: Txid,
) -> ApiResult<Amount> {
    let parent = wallet.get_tx(parent_txid).ok_or_else(|| {
        api_error(
            "acceleration_unavailable",
            "Transaction was not found in this wallet.",
        )
    })?;
    let wallet_fee = wallet.calculate_fee(parent.tx_node.tx.as_ref()).ok();
    resolve_cpfp_parent_fee(wallet_fee, || {
        let entry = rpc_client(app, state)?
            .get_mempool_entry(&parent_txid)
            .map_err(|_| {
                api_error(
                    "acceleration_unavailable",
                    "Bitcoin Core could not find this unconfirmed transaction. Update the wallet and try again.",
                )
            })?;
        Ok(entry.fees.base)
    })
}

pub(crate) fn summarize_payment_psbt(
    db: &Connection,
    wallet: &Wallet,
    psbt: &Psbt,
    _applied_fee_rate: f64,
    allow_self_spend: bool,
    label: String,
) -> ApiResult<PaymentProposalDto> {
    let external = psbt
        .unsigned_tx
        .output
        .iter()
        .filter(|output| !wallet.is_mine(output.script_pubkey.clone()))
        .collect::<Vec<_>>();
    if external.len() > 1 || (external.is_empty() && !allow_self_spend) {
        return Err(api_error(
            "acceleration_unavailable",
            "Groot can accelerate only transactions with one external recipient.",
        ));
    }
    let output = external
        .first()
        .copied()
        .or_else(|| psbt.unsigned_tx.output.first())
        .ok_or_else(|| {
            api_error(
                "acceleration_unavailable",
                "The accelerated transaction has no output.",
            )
        })?;
    let recipient = Address::from_script(&output.script_pubkey, NETWORK).map_err(|_| {
        api_error(
            "invalid_address",
            format!("The transaction recipient is not a standard {NETWORK_NAME} address."),
        )
    })?;
    let fee = psbt
        .fee_amount()
        .ok_or_else(|| internal("Unable to calculate the accelerated transaction fee."))?
        .to_sat();
    let recipient = recipient.to_string();
    let amount = if external.is_empty() {
        0
    } else {
        output.value.to_sat()
    };
    let (change, change_addresses) = proposal_change_details(wallet, psbt, &recipient, amount)?;
    let (recipient_is_wallet_owned, recipient_derivation_paths) =
        proposal_recipient_wallet_details(wallet, psbt, &recipient, amount)?;
    let wallet_controlled_output_amount =
        proposal_wallet_controlled_output_amount(wallet, psbt, recipient_is_wallet_owned)?;
    let (recipient_testnet_alias, change_testnet_aliases) =
        proposal_testnet_aliases(&recipient, &change_addresses);
    let change_derivation_paths = proposal_change_derivation_paths(psbt, &change_addresses)?;
    let (inputs, actual_fee_rate, locktime, rbf) = proposal_transaction_details(wallet, psbt, fee)?;
    let selection_impact = selection_impact(db, wallet, psbt, "acceleration", None)?;
    Ok(PaymentProposalDto {
        proposal_id: Uuid::new_v4().to_string(),
        recipient,
        recipient_testnet_alias,
        recipient_is_wallet_owned,
        wallet_controlled_output_amount,
        recipient_derivation_paths,
        labels: vec![label.clone()],
        label,
        amount,
        fee,
        fee_rate: actual_fee_rate,
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
        selection_impact,
        acceleration: None,
    })
}

pub(crate) fn acceleration_label(method: AccelerationMethod, original: &TransactionDto) -> String {
    match method {
        AccelerationMethod::Rbf => original.label.clone(),
        AccelerationMethod::Cpfp => "Fee acceleration".to_owned(),
    }
}

pub(crate) fn build_cpfp(
    wallet: &mut Wallet,
    parent_txid: Txid,
    parent_fee: Amount,
    rate: FeeRate,
) -> ApiResult<Psbt> {
    let parent = wallet.get_tx(parent_txid).ok_or_else(|| {
        api_error(
            "acceleration_unavailable",
            "Transaction was not found in this wallet.",
        )
    })?;
    if parent.chain_position.is_confirmed() {
        return Err(api_error(
            "transaction_confirmed",
            "Confirmed transactions cannot be accelerated.",
        ));
    }
    let parent_tx = parent.tx_node.tx.clone();
    let candidate = wallet
        .list_unspent()
        .filter(|output| output.outpoint.txid == parent_txid)
        .max_by_key(|output| output.txout.value)
        .ok_or_else(|| {
            api_error(
                "acceleration_unavailable",
                "CPFP requires an unspent change or receive output controlled by this wallet.",
            )
        })?;
    let outpoint = candidate.outpoint;
    let keychain = candidate.keychain;
    let drain_script = wallet
        .reveal_next_address(KeychainKind::Internal)
        .address
        .script_pubkey();
    let mut estimate_builder = wallet.build_tx();
    estimate_builder
        .add_utxo(outpoint)
        .map_err(acceleration_error)?
        .manually_selected_only()
        .drain_to(drain_script.clone())
        .fee_rate(rate);
    let estimate = estimate_builder.finish().map_err(acceleration_error)?;
    let satisfaction_weight = wallet
        .public_descriptor(keychain)
        .max_weight_to_satisfy()
        .map_err(acceleration_error)?;
    let child_weight = Weight::from_wu(
        estimate
            .unsigned_tx
            .weight()
            .to_wu()
            .saturating_add(satisfaction_weight.to_wu()),
    );
    let package_weight = Weight::from_wu(
        parent_tx
            .weight()
            .to_wu()
            .saturating_add(child_weight.to_wu()),
    );
    let required_package_fee = rate
        .fee_wu(package_weight)
        .ok_or_else(|| {
            api_error(
                "invalid_amount",
                "The package fee exceeds Bitcoin's amount range.",
            )
        })?
        .to_sat();
    let estimate_fee = estimate
        .fee_amount()
        .ok_or_else(|| internal("Unable to estimate the CPFP fee."))?
        .to_sat();
    let required_child_fee = required_package_fee
        .saturating_sub(parent_fee.to_sat())
        .max(estimate_fee);
    let mut builder = wallet.build_tx();
    builder
        .add_utxo(outpoint)
        .map_err(acceleration_error)?
        .manually_selected_only()
        .drain_to(drain_script)
        .fee_absolute(Amount::from_sat(required_child_fee));
    builder.finish().map_err(acceleration_error)
}

pub(crate) fn build_acceleration_psbt(
    wallet: &mut Wallet,
    txid: Txid,
    method: AccelerationMethod,
    cpfp_parent_fee: Option<Amount>,
    rate: FeeRate,
) -> ApiResult<Psbt> {
    match method {
        AccelerationMethod::Rbf => {
            let mut builder = wallet.build_fee_bump(txid).map_err(acceleration_error)?;
            builder.fee_rate(rate);
            builder.finish().map_err(acceleration_error)
        }
        AccelerationMethod::Cpfp => build_cpfp(
            wallet,
            txid,
            cpfp_parent_fee.ok_or_else(|| {
                api_error(
                    "acceleration_unavailable",
                    "The parent transaction fee is unavailable.",
                )
            })?,
            rate,
        ),
    }
}

pub(crate) struct AccelerationRatePolicy {
    pub(crate) applied: f64,
    pub(crate) rate: FeeRate,
    pub(crate) rbf_quote_request: Option<(String, u64, Option<f64>)>,
}

pub(crate) fn prepare_persisted_multisig_acceleration(
    db: &mut Connection,
    metadata: &MultisigWalletDto,
    txid: Txid,
    method: AccelerationMethod,
    parent_fee: Option<Amount>,
    rate_policy: AccelerationRatePolicy,
) -> ApiResult<MultisigProposalDto> {
    if let Some(proposal_id) = active_acceleration_proposal_id(db, &txid, method)? {
        return load_multisig_proposal(db, metadata, &proposal_id);
    }
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    let original = snapshot_from(&wallet, &transaction, None, true, None)?
        .transactions
        .into_iter()
        .find(|transaction| transaction.id == txid.to_string())
        .ok_or_else(|| {
            api_error(
                "acceleration_unavailable",
                "Transaction was not found in this wallet.",
            )
        })?;
    let mut quote = None;
    let mut psbt =
        if let Some((requested, incremental_fee, priority)) = rate_policy.rbf_quote_request {
            let (rbf_quote, psbt) = quote_rbf(
                &mut wallet,
                txid,
                Some(&requested),
                incremental_fee,
                priority,
            )?;
            quote = Some(rbf_quote);
            psbt
        } else {
            build_acceleration_psbt(&mut wallet, txid, method, parent_fee, rate_policy.rate)?
        };
    add_multisig_global_xpubs(&mut psbt, metadata)?;
    enforce_change_recovery_gap(&transaction, &wallet, &psbt)?;
    let mut proposal = summarize_payment_psbt(
        &transaction,
        &wallet,
        &psbt,
        rate_policy.applied,
        matches!(method, AccelerationMethod::Cpfp),
        acceleration_label(method, &original),
    )?;
    if let Some(quote) = quote {
        proposal.acceleration = Some(AccelerationReviewDto {
            method,
            original_txid: quote.original_txid,
            original_fee_rate: quote.original_effective_fee_rate,
            minimum_fee_rate: quote.minimum_fee_rate,
            target_fee_rate: quote.target_fee_rate,
            incremental_fee: quote.incremental_fee,
            recommendation_source: quote.recommendation_source,
        });
    }
    persist_prepared_state(
        &mut transaction,
        &mut wallet,
        &proposal,
        &psbt,
        Some((method, &original)),
    )?;
    drop(wallet);
    transaction.commit().map_err(internal)?;
    load_multisig_proposal(db, metadata, &proposal.proposal_id)
}
#[tauri::command]
pub fn tx_acceleration_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    txid: String,
    method: AccelerationMethod,
    fee_rate: String,
) -> ApiResult<PaymentProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let txid = Txid::from_str(&txid)
        .map_err(|_| api_error("acceleration_unavailable", "Enter a valid transaction ID."))?;
    let (applied, rate) = validate_acceleration_rate(&fee_rate)?;
    let mut db = open_db(&app)?;
    if let Some(proposal_id) = active_acceleration_proposal_id(&db, &txid, method)? {
        let wallet = load_wallet(&mut db)?;
        let proposal = load_payment_proposal_dto(&db, &wallet, &proposal_id)?;
        if let Ok(pending) = load_single_proposal(&db, &proposal_id) {
            state
                .proposals
                .lock()
                .map_err(internal)?
                .insert(proposal_id, pending);
        }
        return Ok(proposal);
    }
    let wallet = load_wallet(&mut db)?;
    let original = snapshot_from(&wallet, &db, None, false, None)?
        .transactions
        .into_iter()
        .find(|transaction| transaction.id == txid.to_string())
        .ok_or_else(|| {
            api_error(
                "acceleration_unavailable",
                "Transaction was not found in this wallet.",
            )
        })?;
    let parent_fee = if matches!(method, AccelerationMethod::Cpfp) {
        Some(cpfp_parent_fee(&app, &state, &wallet, txid)?)
    } else {
        None
    };
    drop(wallet);
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut transaction)?;
    let mut quote = None;
    let psbt = if method == AccelerationMethod::Rbf {
        let (incremental_fee, priority) = core_replacement_policy(&app, &state)?;
        let (rbf_quote, psbt) = quote_rbf(
            &mut wallet,
            txid,
            Some(&fee_rate),
            incremental_fee,
            priority,
        )?;
        quote = Some(rbf_quote);
        psbt
    } else {
        build_acceleration_psbt(&mut wallet, txid, method, parent_fee, rate)?
    };
    enforce_change_recovery_gap(&transaction, &wallet, &psbt)?;
    let mut proposal = summarize_payment_psbt(
        &transaction,
        &wallet,
        &psbt,
        applied,
        matches!(method, AccelerationMethod::Cpfp),
        acceleration_label(method, &original),
    )?;
    if let Some(quote) = quote {
        proposal.acceleration = Some(AccelerationReviewDto {
            method,
            original_txid: quote.original_txid,
            original_fee_rate: quote.original_effective_fee_rate,
            minimum_fee_rate: quote.minimum_fee_rate,
            target_fee_rate: quote.target_fee_rate,
            incremental_fee: quote.incremental_fee,
            recommendation_source: quote.recommendation_source,
        });
    }
    persist_prepared_state(
        &mut transaction,
        &mut wallet,
        &proposal,
        &psbt,
        Some((method, &original)),
    )?;
    drop(wallet);
    transaction.commit().map_err(internal)?;
    state.proposals.lock().map_err(internal)?.insert(
        proposal.proposal_id.clone(),
        PendingProposal {
            psbt,
            recipient: proposal.recipient.clone(),
            amount: proposal.amount,
            fee: proposal.fee,
        },
    );
    Ok(proposal)
}

#[tauri::command]
pub fn multisig_acceleration_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    txid: String,
    method: AccelerationMethod,
    fee_rate: String,
) -> ApiResult<MultisigProposalDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let txid = Txid::from_str(&txid)
        .map_err(|_| api_error("acceleration_unavailable", "Enter a valid transaction ID."))?;
    let (applied, rate) = validate_acceleration_rate(&fee_rate)?;
    let metadata = read_multisig_metadata(&app)?;
    let mut db = open_multisig_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    let parent_fee = if matches!(method, AccelerationMethod::Cpfp) {
        Some(cpfp_parent_fee(&app, &state, &wallet, txid)?)
    } else {
        None
    };
    drop(wallet);
    let quote = if method == AccelerationMethod::Rbf {
        let (incremental_fee, priority) = core_replacement_policy(&app, &state)?;
        Some((fee_rate, incremental_fee, priority))
    } else {
        None
    };
    prepare_persisted_multisig_acceleration(
        &mut db,
        &metadata,
        txid,
        method,
        parent_fee,
        AccelerationRatePolicy {
            applied,
            rate,
            rbf_quote_request: quote,
        },
    )
}

#[tauri::command]
pub fn tx_sign_and_broadcast(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    credential: String,
) -> ApiResult<BroadcastResultDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    check_auth_throttle(&app, &state)?;
    let credential_result = decrypt_mnemonic(&app, credential.as_str());
    record_auth_result(&app, &state, &credential_result)?;
    let mnemonic = credential_result?;
    let master = root_key(&mnemonic, credential.as_str())?;
    let signing_wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(NETWORK)
    .create_wallet_no_persist()
    .map_err(internal)?;
    let mut db = open_db(&app)?;
    let mut proposal = state
        .proposals
        .lock()
        .map_err(internal)?
        .remove(&proposal_id)
        .map(Ok)
        .unwrap_or_else(|| load_single_proposal(&db, &proposal_id))?;
    let wallet = load_wallet(&mut db)?;
    let profile = selected_profile_of_kind(&app, WalletKind::SingleKey)?;
    let loaded_external = wallet.public_descriptor(KeychainKind::External).to_string();
    let loaded_internal = wallet.public_descriptor(KeychainKind::Internal).to_string();
    let signing_external = signing_wallet
        .public_descriptor(KeychainKind::External)
        .to_string();
    let signing_internal = signing_wallet
        .public_descriptor(KeychainKind::Internal)
        .to_string();
    validate_loaded_descriptors(
        &profile,
        &loaded_external,
        &loaded_internal,
        Some((&signing_external, &signing_internal)),
    )?;
    validate_proposal_fee(&proposal.psbt, proposal.fee)?;
    proposal_change_details(
        &wallet,
        &proposal.psbt,
        &proposal.recipient,
        proposal.amount,
    )?;
    let finalized = signing_wallet
        .sign(
            &mut proposal.psbt,
            SignOptions {
                // The PSBT was built and retained inside this trusted Rust process.
                trust_witness_utxo: true,
                ..SignOptions::default()
            },
        )
        .map_err(internal)?;
    if !finalized {
        return Err(internal("The transaction could not be fully signed."));
    }
    let transaction = proposal.psbt.extract_tx().map_err(internal)?;
    let txid = broadcast_transaction(&app, &state, &transaction)?;
    drop(wallet);
    let mut persisted = db.transaction().map_err(internal)?;
    let mut wallet = load_wallet_transaction(&mut persisted)?;
    apply_locally_broadcast_transaction(&mut wallet, &transaction);
    let changed = persisted
        .execute(
            "UPDATE groot_proposals SET status = 'broadcast', txid = ?1 WHERE proposal_id = ?2 AND status = 'collecting'",
            params![txid.to_string(), proposal_id],
        )
        .map_err(internal)?;
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
    let (snapshot, sync_pending) = match sync_wallet_atomically(&app, &state, &mut db, false, None)
    {
        Ok(snapshot) => (snapshot, false),
        Err(_) => (snapshot, true),
    };
    Ok(BroadcastResultDto {
        txid: txid.to_string(),
        snapshot,
        sync_pending,
    })
}
