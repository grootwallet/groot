use super::*;

pub(super) fn proposal_change_details(
    wallet: &Wallet,
    psbt: &Psbt,
    recipient: &str,
    amount: u64,
) -> ApiResult<(u64, Vec<String>)> {
    let recipient_script = Address::from_str(recipient)
        .map_err(|_| internal("The stored proposal recipient is invalid."))?
        .require_network(NETWORK)
        .map_err(|_| internal("The stored proposal recipient is on the wrong network."))?
        .script_pubkey();
    let self_spend = amount == 0;
    let mut recipient_matches = 0_usize;
    let mut change = 0_u64;
    let mut change_addresses = Vec::new();
    for output in &psbt.unsigned_tx.output {
        let matches_recipient = output.script_pubkey == recipient_script
            && (self_spend || output.value.to_sat() == amount);
        if matches_recipient {
            recipient_matches += 1;
        }
        if self_spend || !matches_recipient {
            if !wallet.is_mine(output.script_pubkey.clone()) {
                return Err(api_error(
                    "proposal_mismatch",
                    "A non-recipient proposal output is not controlled by this wallet.",
                ));
            }
            change = change
                .checked_add(output.value.to_sat())
                .ok_or_else(|| internal("The proposal output total overflowed."))?;
            change_addresses.push(
                Address::from_script(&output.script_pubkey, NETWORK)
                    .map_err(|_| internal("A proposal change output has no displayable address."))?
                    .to_string(),
            );
        }
    }
    if recipient_matches != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The stored proposal recipient does not match exactly one transaction output.",
        ));
    }
    Ok((change, change_addresses))
}

pub(super) fn proposal_recipient_wallet_details(
    wallet: &Wallet,
    psbt: &Psbt,
    recipient: &str,
    amount: u64,
) -> ApiResult<(bool, Vec<String>)> {
    let recipient_script = Address::from_str(recipient)
        .map_err(|_| internal("The stored proposal recipient is invalid."))?
        .require_network(NETWORK)
        .map_err(|_| internal("The stored proposal recipient is on the wrong network."))?
        .script_pubkey();
    let self_spend = amount == 0;
    let output_indexes = psbt
        .unsigned_tx
        .output
        .iter()
        .enumerate()
        .filter_map(|(index, output)| {
            (output.script_pubkey == recipient_script
                && (self_spend || output.value.to_sat() == amount))
                .then_some(index)
        })
        .collect::<Vec<_>>();
    if output_indexes.len() != 1 {
        return Err(api_error(
            "proposal_mismatch",
            "The stored proposal recipient does not match exactly one transaction output.",
        ));
    }
    if wallet.derivation_of_spk(recipient_script).is_none() {
        return Ok((false, Vec::new()));
    }
    let output = psbt
        .outputs
        .get(output_indexes[0])
        .ok_or_else(|| internal("The proposal recipient output is missing PSBT metadata."))?;
    Ok((
        true,
        unique_derivation_paths(
            output
                .bip32_derivation
                .values()
                .map(|(_, path)| path.to_string()),
        ),
    ))
}

pub(super) fn proposal_wallet_controlled_output_amount(
    wallet: &Wallet,
    psbt: &Psbt,
    recipient_is_wallet_owned: bool,
) -> ApiResult<Option<u64>> {
    if !recipient_is_wallet_owned {
        return Ok(None);
    }
    psbt.unsigned_tx
        .output
        .iter()
        .filter(|output| wallet.is_mine(output.script_pubkey.clone()))
        .try_fold(0_u64, |total, output| {
            total
                .checked_add(output.value.to_sat())
                .ok_or_else(|| internal("The wallet-controlled output total overflowed."))
        })
        .map(Some)
}

pub(super) fn proposal_change_derivation_paths(
    psbt: &Psbt,
    change_addresses: &[String],
) -> ApiResult<Vec<Vec<String>>> {
    change_addresses
        .iter()
        .map(|address| {
            let script = Address::from_str(address)
                .map_err(|_| internal("A proposal change address is invalid."))?
                .require_network(NETWORK)
                .map_err(|_| internal("A proposal change address is on the wrong network."))?
                .script_pubkey();
            let output_index = psbt
                .unsigned_tx
                .output
                .iter()
                .position(|output| output.script_pubkey == script)
                .ok_or_else(|| {
                    internal("A proposal change address is missing from the transaction.")
                })?;
            let output = psbt
                .outputs
                .get(output_index)
                .ok_or_else(|| internal("A proposal change output is missing PSBT metadata."))?;
            Ok(unique_derivation_paths(
                output
                    .bip32_derivation
                    .values()
                    .map(|(_, path)| path.to_string()),
            ))
        })
        .collect()
}

pub(super) fn unique_derivation_paths(paths: impl Iterator<Item = String>) -> Vec<String> {
    paths
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub(super) fn validate_proposal_fee(psbt: &Psbt, expected_fee: u64) -> ApiResult<()> {
    let actual = proposal_fee_amount(psbt)?;
    if actual != expected_fee {
        return Err(api_error(
            "proposal_mismatch",
            "The stored proposal fee does not match the transaction.",
        ));
    }
    Ok(())
}

pub(super) fn proposal_fee_amount(psbt: &Psbt) -> ApiResult<u64> {
    let mut input_total = 0_u64;
    for index in 0..psbt.unsigned_tx.input.len() {
        let value = psbt
            .get_utxo_for(index)
            .ok_or_else(|| {
                api_error(
                    "proposal_mismatch",
                    "A proposal input is missing its authenticated previous output.",
                )
            })?
            .value
            .to_sat();
        input_total = input_total.checked_add(value).ok_or_else(|| {
            api_error("proposal_mismatch", "The proposal input total overflowed.")
        })?;
    }
    let output_total = psbt
        .unsigned_tx
        .output
        .iter()
        .try_fold(0_u64, |total, output| {
            total.checked_add(output.value.to_sat()).ok_or_else(|| {
                api_error("proposal_mismatch", "The proposal output total overflowed.")
            })
        })?;
    input_total.checked_sub(output_total).ok_or_else(|| {
        api_error(
            "proposal_mismatch",
            "The proposal spends more than its authenticated inputs.",
        )
    })
}

pub(super) fn proposal_transaction_details(
    wallet: &Wallet,
    psbt: &Psbt,
    fee: u64,
) -> ApiResult<(Vec<ProposalInputDto>, f64, u32, bool)> {
    if psbt.unsigned_tx.input.is_empty() || psbt.inputs.len() != psbt.unsigned_tx.input.len() {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal has no complete input set.",
        ));
    }
    let mut seen = std::collections::HashSet::new();
    let mut satisfaction_weight = Weight::ZERO;
    let mut inputs = Vec::with_capacity(psbt.unsigned_tx.input.len());
    for (index, txin) in psbt.unsigned_tx.input.iter().enumerate() {
        if !seen.insert(txin.previous_output) {
            return Err(api_error(
                "proposal_mismatch",
                "The proposal contains a duplicate input.",
            ));
        }
        let utxo = psbt.get_utxo_for(index).ok_or_else(|| {
            api_error(
                "proposal_mismatch",
                "A proposal input is missing its authenticated previous output.",
            )
        })?;
        let (keychain, _) = wallet
            .derivation_of_spk(utxo.script_pubkey)
            .ok_or_else(|| {
                api_error(
                    "proposal_mismatch",
                    "A proposal input is not controlled by this wallet.",
                )
            })?;
        satisfaction_weight = satisfaction_weight
            .checked_add(
                wallet
                    .public_descriptor(keychain)
                    .max_weight_to_satisfy()
                    .map_err(internal)?,
            )
            .ok_or_else(|| internal("The proposal weight overflowed."))?;
        inputs.push(ProposalInputDto {
            outpoint: txin.previous_output.to_string(),
            amount: utxo.value.to_sat(),
            sequence: txin.sequence.to_consensus_u32(),
            derivation_paths: unique_derivation_paths(
                psbt.inputs[index]
                    .bip32_derivation
                    .values()
                    .map(|(_, path)| path.to_string()),
            ),
        });
    }
    let signed_weight = psbt
        .unsigned_tx
        .weight()
        .checked_add(satisfaction_weight)
        .ok_or_else(|| internal("The proposal weight overflowed."))?;
    let vbytes = signed_weight.to_vbytes_ceil();
    if vbytes == 0 {
        return Err(api_error(
            "proposal_mismatch",
            "The proposal has an invalid signed size.",
        ));
    }
    let fee_rate = ((fee as f64 / vbytes as f64) * 100.0).round() / 100.0;
    Ok((
        inputs,
        fee_rate,
        psbt.unsigned_tx.lock_time.to_consensus_u32(),
        psbt.unsigned_tx
            .input
            .iter()
            .any(|input| input.sequence.is_rbf()),
    ))
}

pub(super) fn checked_payment_total(amount: u64, fee: u64) -> ApiResult<u64> {
    amount.checked_add(fee).ok_or_else(|| {
        api_error(
            "invalid_amount",
            "The payment total exceeds the amount range.",
        )
    })
}

pub(super) fn require_reviewed_psbt_unchanged(
    current: &str,
    reviewed: &str,
    mismatch_message: &'static str,
) -> ApiResult<()> {
    if current != reviewed {
        return Err(api_error("proposal_mismatch", mismatch_message));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, Amount, OutPoint, ScriptBuf,
        Sequence, Transaction, TxIn, TxOut, Txid, Witness,
    };

    #[test]
    fn reviewed_psbt_binding_accepts_only_the_exact_reviewed_bytes() {
        assert!(require_reviewed_psbt_unchanged("psbt", "psbt", "mismatch").is_ok());
        let error = require_reviewed_psbt_unchanged("changed", "reviewed", "mismatch").unwrap_err();
        assert_eq!(error.code, "proposal_mismatch");
        assert_eq!(error.message, "mismatch");
    }

    #[test]
    fn stored_fee_binding_uses_authenticated_input_values() {
        let transaction = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::from_byte_array([1; 32]), 0),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(9_000),
                script_pubkey: ScriptBuf::new(),
            }],
        };
        let mut psbt = Psbt::from_unsigned_tx(transaction).unwrap();
        psbt.inputs[0].witness_utxo = Some(TxOut {
            value: Amount::from_sat(10_000),
            script_pubkey: ScriptBuf::new(),
        });

        assert_eq!(proposal_fee_amount(&psbt).unwrap(), 1_000);
        assert!(validate_proposal_fee(&psbt, 1_000).is_ok());
        let error = validate_proposal_fee(&psbt, 999).unwrap_err();
        assert_eq!(error.code, "proposal_mismatch");
        assert_eq!(
            error.message,
            "The stored proposal fee does not match the transaction."
        );
    }

    #[test]
    fn payment_total_overflow_keeps_the_stable_error() {
        assert_eq!(checked_payment_total(40, 2).unwrap(), 42);
        let error = checked_payment_total(u64::MAX, 1).unwrap_err();
        assert_eq!(error.code, "invalid_amount");
        assert_eq!(error.message, "The payment total exceeds the amount range.");
    }
}
