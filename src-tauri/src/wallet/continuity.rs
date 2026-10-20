//! Named policy paths are bound by the existing persisted PSBT sequences.
//! No proposal schema or descriptor changes are needed.
use super::*;
use bdk_wallet::descriptor::policy::{PkOrF, Policy};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingPathDetailsDto {
    pub index: usize,
    pub name: &'static str,
    pub required: usize,
    pub eligible_signer_fingerprints: Vec<String>,
    pub available_after_blocks: u32,
    pub remaining_blocks: Option<u32>,
    pub available: bool,
    pub reason: Option<&'static str>,
}

pub(super) fn verified_analysis(metadata: &MultisigWalletDto) -> ApiResult<PolicyAnalysis> {
    let template = metadata.recovery_template.as_ref().ok_or_else(|| {
        api_error(
            "unknown_spending_path",
            "This wallet has no delayed spending paths.",
        )
    })?;
    if matches!(
        template,
        RecoveryTemplate::Decaying { .. } | RecoveryTemplate::Expanding { .. }
    ) {
        return Err(api_error(
            "hardware_policy_unsupported",
            "This advanced policy is not available in the transaction coordinator.",
        ));
    }
    let analysis = analyze_template(template, &metadata.cosigners).map_err(recovery_api_error)?;
    if analysis.external_descriptor != metadata.external_descriptor
        || analysis.internal_descriptor != metadata.internal_descriptor
        || analysis.paths != metadata.spending_paths
    {
        return Err(api_error(
            "wallet_corrupt",
            "The spending paths do not match the wallet descriptors.",
        ));
    }
    if matches!(template, RecoveryTemplate::Recovery { .. })
        && metadata.policy_type == "inheritance"
        && analysis.paths[1].available_after_blocks != 52_560
    {
        return Err(api_error(
            "wallet_corrupt",
            "The legacy inheritance policy does not match its verified block delay.",
        ));
    }
    Ok(analysis)
}

pub(super) fn path_name(template: &RecoveryTemplate, index: usize) -> &'static str {
    match (template, index) {
        (RecoveryTemplate::PartnerContinuityV1 { .. }, 0) => "Owner: 2 of 3",
        (RecoveryTemplate::PartnerContinuityV1 { .. }, 1) => "Both partner signers",
        (RecoveryTemplate::PartnerContinuityV1 { .. }, 2) => "Either partner signer",
        (RecoveryTemplate::PartnerContinuityV1 { .. }, 3) => "Estate guardians: 2 of 3",
        (RecoveryTemplate::FamilyContinuityV1 { .. }, 0) => "Both parents",
        (RecoveryTemplate::FamilyContinuityV1 { .. }, 1) => {
            "One parent and one child assistance signer"
        }
        (RecoveryTemplate::FamilyContinuityV1 { .. }, 2) => "Inheritance: 2 of 3",
        (_, 0) => "Primary signers",
        _ => "Recovery signers",
    }
}

pub(super) fn path_details(
    metadata: &MultisigWalletDto,
    analysis: &PolicyAnalysis,
    index: usize,
    age: Option<u32>,
    recent: bool,
    frozen: bool,
) -> ApiResult<SpendingPathDetailsDto> {
    let path = analysis
        .paths
        .get(index)
        .ok_or_else(|| api_error("unknown_spending_path", "Choose a valid spending path."))?;
    let (_, eligible) = signer_fingerprints_for_ids(metadata, &path.signer_ids)?;
    let remaining = age.map(|value| path.available_after_blocks.saturating_sub(value));
    let reason = if frozen {
        Some("Unfreeze this coin before spending it.")
    } else if !recent {
        Some("Sync this wallet before checking spending paths.")
    } else if path.available_after_blocks > 0 && age.is_none() {
        Some("This coin must confirm before its waiting period starts.")
    } else if remaining.is_some_and(|value| value > 0) {
        Some("This spending path is still waiting for blocks.")
    } else {
        None
    };
    Ok(SpendingPathDetailsDto {
        index,
        name: path_name(
            metadata
                .recovery_template
                .as_ref()
                .ok_or_else(|| internal("Missing policy template"))?,
            index,
        ),
        required: path.threshold,
        eligible_signer_fingerprints: eligible,
        available_after_blocks: path.available_after_blocks,
        remaining_blocks: remaining,
        available: reason.is_none(),
        reason,
    })
}

pub(super) fn selected_delayed_index(analysis: &PolicyAnalysis, psbt: &Psbt) -> ApiResult<usize> {
    let sequence = psbt
        .unsigned_tx
        .input
        .first()
        .ok_or_else(|| api_error("no_inputs", "The proposal has no inputs."))?
        .sequence
        .to_consensus_u32();
    if sequence == 0
        || sequence > u16::MAX as u32
        || psbt.unsigned_tx.version.0 < 2
        || psbt
            .unsigned_tx
            .input
            .iter()
            .any(|input| input.sequence.to_consensus_u32() != sequence)
    {
        return Err(api_error(
            "proposal_mismatch",
            "The saved spending path does not match the transaction block sequence.",
        ));
    }
    let candidates: Vec<_> = analysis
        .paths
        .iter()
        .enumerate()
        .filter(|(_, path)| path.available_after_blocks == sequence)
        .map(|(index, _)| index)
        .collect();
    match candidates.as_slice() {
        [index] => Ok(*index),
        _ => Err(api_error(
            "proposal_mismatch",
            "The transaction does not identify exactly one saved spending path.",
        )),
    }
}

// Choose only policy conditions satisfiable by this path's keys and exact block
// delay. Time locks and unknown leaves are never treated as available.
fn selectable_policy_path(
    policy: &Policy,
    allowed: &HashSet<Fingerprint>,
    delay: u32,
) -> Option<(PolicyPath, u32)> {
    let allowed_key =
        |key: &PkOrF| matches!(key, PkOrF::Fingerprint(value) if allowed.contains(value));
    match &policy.item {
        SatisfiableItem::EcdsaSignature(key) if allowed_key(key) => Some((PolicyPath::new(), 0)),
        SatisfiableItem::Multisig { keys, threshold }
            if keys.iter().filter(|key| allowed_key(key)).count() >= *threshold =>
        {
            Some((PolicyPath::new(), 0))
        }
        SatisfiableItem::RelativeTimelock { value }
            if value.is_block_height() && value.to_consensus_u32() <= delay =>
        {
            Some((PolicyPath::new(), value.to_consensus_u32()))
        }
        SatisfiableItem::Thresh { items, threshold } => {
            let mut path = PolicyPath::new();
            let mut selected = Vec::new();
            let mut maximum = 0;
            for (index, item) in items.iter().enumerate() {
                if let Some((child, lock)) = selectable_policy_path(item, allowed, delay) {
                    selected.push(index);
                    path.extend(child);
                    maximum = maximum.max(lock);
                }
            }
            if selected.len() < *threshold {
                return None;
            }
            path.insert(policy.id.clone(), selected);
            Some((path, maximum))
        }
        _ => None,
    }
}

pub(super) fn named_policy_paths(
    wallet: &Wallet,
    metadata: &MultisigWalletDto,
    index: usize,
) -> ApiResult<Vec<KeychainPolicyPath>> {
    let analysis = verified_analysis(metadata)?;
    let selected = analysis
        .paths
        .get(index)
        .ok_or_else(|| api_error("unknown_spending_path", "Choose a valid spending path."))?;
    let (fingerprints, _) = signer_fingerprints_for_ids(metadata, &selected.signer_ids)?;
    let allowed = fingerprints.into_iter().collect();
    [KeychainKind::External, KeychainKind::Internal]
        .into_iter()
        .map(|keychain| {
            let policy = wallet
                .policies(keychain)
                .map_err(internal)?
                .ok_or_else(|| internal("Missing wallet policy"))?;
            let (path, delay) =
                selectable_policy_path(&policy, &allowed, selected.available_after_blocks)
                    .ok_or_else(|| {
                        api_error(
                            "unknown_spending_path",
                            "The requested path cannot satisfy this wallet policy.",
                        )
                    })?;
            if delay != selected.available_after_blocks {
                return Err(api_error(
                    "proposal_mismatch",
                    "The selected path does not match its exact block delay.",
                ));
            }
            Ok((keychain, path))
        })
        .collect()
}

pub(super) fn validate_named_path_current(
    wallet: &Wallet,
    db: &Connection,
    metadata: &MultisigWalletDto,
    psbt: &Psbt,
    index: usize,
) -> ApiResult<()> {
    let analysis = verified_analysis(metadata)?;
    if index == 0 || selected_delayed_index(&analysis, psbt)? != index {
        return Err(api_error(
            "proposal_mismatch",
            "The transaction does not match the selected spending path.",
        ));
    }
    let snapshot = snapshot_from(wallet, db, None, true, None)?;
    let mut ages = Vec::new();
    for input in &psbt.unsigned_tx.input {
        let coin = snapshot
            .utxos
            .iter()
            .find(|coin| coin.outpoint == input.previous_output.to_string())
            .ok_or_else(|| {
                api_error(
                    "coin_unavailable",
                    "A selected coin is no longer available. Sync and prepare the payment again.",
                )
            })?;
        let detail = path_details(
            metadata,
            &analysis,
            index,
            (coin.confirmations > 0).then_some(coin.confirmations),
            snapshot.chain_tip.status == "recent",
            coin.frozen,
        )?;
        if !detail.available {
            return Err(api_error(
                "immature_spending_path",
                detail
                    .reason
                    .unwrap_or("The selected spending path is unavailable."),
            ));
        }
        ages.push(coin.confirmations);
    }
    crate::recovery::select_spending_path(&analysis, Some(index), &ages)
        .map_err(recovery_api_error)?;
    Ok(())
}

pub(super) fn path_signature_quorum(
    metadata: &MultisigWalletDto,
    index: usize,
    signed: &[String],
) -> bool {
    if let Some(RecoveryTemplate::FamilyContinuityV1 {
        parents,
        child_assistance,
        ..
    }) = &metadata.recovery_template
    {
        if index == 1 {
            let group_signed = |ids: &[String]| {
                metadata.cosigners.iter().any(|key| {
                    ids.contains(&key.id)
                        && signed
                            .iter()
                            .any(|fp| fp.eq_ignore_ascii_case(&key.fingerprint))
                })
            };
            return group_signed(&parents.signer_ids) && group_signed(&child_assistance.signer_ids);
        }
    }
    true
}

pub(super) fn build_named_policy_sweep(
    wallet: &mut Wallet,
    metadata: &MultisigWalletDto,
    index: usize,
    selected: OutPoint,
    destination: &Address,
    rate: FeeRate,
) -> ApiResult<Psbt> {
    let paths = named_policy_paths(wallet, metadata, index)?;
    let mut builder = wallet.build_tx();
    builder
        .add_utxo(selected)
        .map_err(|_| {
            api_error(
                "coin_unavailable",
                "The selected coin is not available in this wallet.",
            )
        })?
        .manually_selected_only()
        .drain_to(destination.script_pubkey())
        .fee_rate(rate)
        .add_global_xpubs();
    for (keychain, path) in paths {
        builder.policy_path(path, keychain);
    }
    builder.finish().map_err(create_tx_api_error)
}
