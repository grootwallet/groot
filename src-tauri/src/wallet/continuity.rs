//! Named policy paths are bound by the existing persisted PSBT sequences.
//! The saved sequence and descriptor-derived leaf bind each Taproot path.
use super::*;

pub(super) fn require_taproot_continuity_network(network: Network) -> ApiResult<()> {
    if network == Network::Regtest {
        require_desktop_key_operation()
    } else {
        Err(api_error(
            "unsupported_wallet_policy",
            "Taproot Continuity is available only for isolated Regtest rehearsal.",
        ))
    }
}
use bdk_wallet::descriptor::policy::{PkOrF, Policy};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingPathDetailsDto {
    pub index: usize,
    pub code: String,
    pub name: String,
    pub required: usize,
    pub eligible_signer_fingerprints: Vec<String>,
    pub signer_groups: Vec<PolicySignerGroupDto>,
    pub available_after_blocks: u32,
    pub remaining_blocks: Option<u32>,
    pub available: bool,
    pub reason: Option<&'static str>,
}

fn signer_group(
    metadata: &MultisigWalletDto,
    code: &str,
    label: &str,
    required: usize,
    signer_roles: &[(&str, &str)],
) -> ApiResult<PolicySignerGroupDto> {
    let signers = signer_roles
        .iter()
        .map(|(signer_id, role)| {
            let signer = metadata
                .cosigners
                .iter()
                .find(|candidate| candidate.id == *signer_id)
                .ok_or_else(|| {
                    api_error(
                        "wallet_corrupt",
                        "The wallet spending path references an unknown signer.",
                    )
                })?;
            Ok(PolicyPathSignerDto {
                label: signer.label.clone(),
                fingerprint: signer.fingerprint.trim().to_lowercase(),
                role: (*role).to_owned(),
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(PolicySignerGroupDto {
        code: code.to_owned(),
        label: label.to_owned(),
        required,
        signers,
    })
}

fn one_signer_group(
    metadata: &MultisigWalletDto,
    code: &str,
    label: &str,
    required: usize,
    signer_ids: &[String],
    role: &str,
) -> ApiResult<Vec<PolicySignerGroupDto>> {
    let signer_roles = signer_ids
        .iter()
        .map(|signer_id| (signer_id.as_str(), role))
        .collect::<Vec<_>>();
    Ok(vec![signer_group(
        metadata,
        code,
        label,
        required,
        &signer_roles,
    )?])
}

pub(super) fn path_code(template: &RecoveryTemplate, index: usize) -> String {
    match (template, index) {
        (RecoveryTemplate::Recovery { .. }, 0) => "primary".to_owned(),
        (RecoveryTemplate::Recovery { .. }, 1) => "recovery".to_owned(),
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            0,
        ) => "partner_owner".to_owned(),
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            1,
        ) => "partner_assistance".to_owned(),
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            2,
        ) => "partner_solo".to_owned(),
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            3,
        ) => "partner_estate".to_owned(),
        (
            RecoveryTemplate::FamilyContinuityV1 { .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { .. },
            0,
        ) => "family_parents".to_owned(),
        (
            RecoveryTemplate::FamilyContinuityV1 { .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { .. },
            1,
        ) => "family_assistance".to_owned(),
        (
            RecoveryTemplate::FamilyContinuityV1 { .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { .. },
            2,
        ) => "family_inheritance".to_owned(),
        (_, index) => format!("policy_path_{index}"),
    }
}

pub(super) fn policy_path_definition(
    metadata: &MultisigWalletDto,
    analysis: &PolicyAnalysis,
    index: usize,
) -> ApiResult<PolicyPathDefinitionDto> {
    let template = metadata
        .recovery_template
        .as_ref()
        .ok_or_else(|| internal("Missing policy template"))?;
    let path = analysis
        .paths
        .get(index)
        .ok_or_else(|| api_error("unknown_spending_path", "Choose a valid spending path."))?;
    let (_, eligible_signer_fingerprints) =
        signer_fingerprints_for_ids(metadata, &path.signer_ids)?;
    let code = path_code(template, index);
    let signer_groups = match (template, index) {
        (RecoveryTemplate::Recovery { immediate, .. }, 0) => one_signer_group(
            metadata,
            "primary_signers",
            "Primary signers",
            immediate.threshold,
            &immediate.signer_ids,
            "primary",
        )?,
        (RecoveryTemplate::Recovery { recovery, .. }, 1) => one_signer_group(
            metadata,
            if metadata.policy_type == "inheritance" {
                "heir_signers"
            } else {
                "recovery_signers"
            },
            if metadata.policy_type == "inheritance" {
                "Heir signer"
            } else {
                "Recovery signer"
            },
            recovery.threshold,
            &recovery.signer_ids,
            if metadata.policy_type == "inheritance" {
                "heir"
            } else {
                "recovery"
            },
        )?,
        (
            RecoveryTemplate::PartnerContinuityV1 { owner, .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { owner, .. },
            0,
        ) => one_signer_group(
            metadata,
            "owner_signers",
            "Owner signers",
            owner.threshold,
            &owner.signer_ids,
            "owner",
        )?,
        (
            RecoveryTemplate::PartnerContinuityV1 { partner, .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { partner, .. },
            1 | 2,
        ) => one_signer_group(
            metadata,
            "partner_signers",
            "Partner signers",
            path.threshold,
            &partner.signer_ids,
            "partner",
        )?,
        (
            RecoveryTemplate::PartnerContinuityV1 { estate, .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { estate, .. },
            3,
        ) => one_signer_group(
            metadata,
            "estate_guardians",
            "Estate guardians",
            estate.threshold,
            &estate.signer_ids,
            "estate_guardian",
        )?,
        (
            RecoveryTemplate::FamilyContinuityV1 { parents, .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { parents, .. },
            0,
        ) => one_signer_group(
            metadata,
            "parents",
            "Parents",
            parents.threshold,
            &parents.signer_ids,
            "parent",
        )?,
        (
            RecoveryTemplate::FamilyContinuityV1 {
                parents,
                child_assistance,
                ..
            }
            | RecoveryTemplate::FamilyContinuityTaprootV1 {
                parents,
                child_assistance,
                ..
            },
            1,
        ) => {
            let parent_roles = parents
                .signer_ids
                .iter()
                .map(|id| (id.as_str(), "parent"))
                .collect::<Vec<_>>();
            let assistance_roles = child_assistance
                .signer_ids
                .iter()
                .map(|id| (id.as_str(), "child_assistance"))
                .collect::<Vec<_>>();
            vec![
                signer_group(metadata, "parents", "Parents", 1, &parent_roles)?,
                signer_group(
                    metadata,
                    "child_assistance_signers",
                    "Child assistance signers",
                    1,
                    &assistance_roles,
                )?,
            ]
        }
        (
            RecoveryTemplate::FamilyContinuityV1 {
                child_inheritance,
                executor_signer_id,
                ..
            }
            | RecoveryTemplate::FamilyContinuityTaprootV1 {
                child_inheritance,
                executor_signer_id,
                ..
            },
            2,
        ) => {
            let mut inheritance_roles = child_inheritance
                .signer_ids
                .iter()
                .map(|id| (id.as_str(), "child_inheritance"))
                .collect::<Vec<_>>();
            inheritance_roles.push((executor_signer_id.as_str(), "executor"));
            vec![signer_group(
                metadata,
                "inheritance_signers",
                "Inheritance signers",
                path.threshold,
                &inheritance_roles,
            )?]
        }
        _ => one_signer_group(
            metadata,
            &format!("{code}_signers"),
            "Required signers",
            path.threshold,
            &path.signer_ids,
            "policy_signer",
        )?,
    };
    Ok(PolicyPathDefinitionDto {
        index,
        code,
        name: path_name(template, index).to_owned(),
        required: path.threshold,
        eligible_signer_fingerprints,
        signer_groups,
        available_after_blocks: path.available_after_blocks,
    })
}

pub(super) fn policy_path_definitions(
    metadata: &MultisigWalletDto,
    analysis: &PolicyAnalysis,
) -> ApiResult<Vec<PolicyPathDefinitionDto>> {
    analysis
        .paths
        .iter()
        .enumerate()
        .map(|(index, _)| policy_path_definition(metadata, analysis, index))
        .collect()
}

pub(super) fn spending_path_unavailable_reason(
    available_after_blocks: u32,
    age: Option<u32>,
    recent: bool,
    frozen: bool,
) -> Option<&'static str> {
    let remaining = age.map(|value| available_after_blocks.saturating_sub(value));
    if frozen {
        Some("Unfreeze this coin before spending it.")
    } else if !recent {
        Some("Sync this wallet before checking spending paths.")
    } else if available_after_blocks > 0 && age.is_none() {
        Some("This coin must confirm before its waiting period starts.")
    } else if remaining.is_some_and(|value| value > 0) {
        Some("This spending path is still waiting for blocks.")
    } else {
        None
    }
}

pub(super) fn verified_analysis(metadata: &MultisigWalletDto) -> ApiResult<PolicyAnalysis> {
    let template = metadata.recovery_template.as_ref().ok_or_else(|| {
        api_error(
            "unknown_spending_path",
            "This wallet has no delayed spending paths.",
        )
    })?;
    if template.uses_taproot() {
        require_taproot_continuity_network(network())?;
    }
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
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            0,
        ) => "Owner: 2 of 3",
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            1,
        ) => "Both partner signers",
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            2,
        ) => "Either partner signer",
        (
            RecoveryTemplate::PartnerContinuityV1 { .. }
            | RecoveryTemplate::PartnerContinuityTaprootV1 { .. },
            3,
        ) => "Estate guardians: 2 of 3",
        (
            RecoveryTemplate::FamilyContinuityV1 { .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { .. },
            0,
        ) => "Both parents",
        (
            RecoveryTemplate::FamilyContinuityV1 { .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { .. },
            1,
        ) => "One parent and one child assistance signer",
        (
            RecoveryTemplate::FamilyContinuityV1 { .. }
            | RecoveryTemplate::FamilyContinuityTaprootV1 { .. },
            2,
        ) => "Inheritance: 2 of 3",
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
    let definition = policy_path_definition(metadata, analysis, index)?;
    let remaining = age.map(|value| definition.available_after_blocks.saturating_sub(value));
    let reason =
        spending_path_unavailable_reason(definition.available_after_blocks, age, recent, frozen);
    Ok(SpendingPathDetailsDto {
        index,
        code: definition.code,
        name: definition.name,
        required: definition.required,
        eligible_signer_fingerprints: definition.eligible_signer_fingerprints,
        signer_groups: definition.signer_groups,
        available_after_blocks: definition.available_after_blocks,
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
        SatisfiableItem::EcdsaSignature(key) | SatisfiableItem::SchnorrSignature(key)
            if allowed_key(key) =>
        {
            Some((PolicyPath::new(), 0))
        }
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
            let taproot = metadata
                .recovery_template
                .as_ref()
                .is_some_and(RecoveryTemplate::uses_taproot);
            let selected_leaf = if taproot {
                match &policy.item {
                    SatisfiableItem::Thresh {
                        items,
                        threshold: 1,
                    } if items.len() == analysis.paths.len() + 1 => &items[index + 1],
                    _ => {
                        return Err(api_error(
                            "wallet_corrupt",
                            "The Taproot policy paths do not match the wallet.",
                        ))
                    }
                }
            } else {
                &policy
            };
            let (mut path, delay) =
                selectable_policy_path(selected_leaf, &allowed, selected.available_after_blocks)
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
            if taproot {
                path.insert(policy.id, vec![index + 1]);
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
    validate_named_path_with_analysis(wallet, db, metadata, &analysis, psbt, index)
}

pub(super) fn validate_named_path_with_analysis(
    wallet: &Wallet,
    db: &Connection,
    metadata: &MultisigWalletDto,
    analysis: &PolicyAnalysis,
    psbt: &Psbt,
    index: usize,
) -> ApiResult<()> {
    if analysis.external_descriptor != metadata.external_descriptor
        || analysis.internal_descriptor != metadata.internal_descriptor
        || analysis.paths != metadata.spending_paths
    {
        return Err(api_error(
            "wallet_corrupt",
            "The spending paths do not match the wallet descriptors.",
        ));
    }
    if index == 0 || selected_delayed_index(analysis, psbt)? != index {
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
            analysis,
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
    crate::recovery::select_spending_path(analysis, Some(index), &ages)
        .map_err(recovery_api_error)?;
    Ok(())
}

pub(super) fn path_signature_quorum(
    metadata: &MultisigWalletDto,
    index: usize,
    signed: &[String],
) -> bool {
    if let Some(
        RecoveryTemplate::FamilyContinuityV1 {
            parents,
            child_assistance,
            ..
        }
        | RecoveryTemplate::FamilyContinuityTaprootV1 {
            parents,
            child_assistance,
            ..
        },
    ) = &metadata.recovery_template
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
    let mut psbt = builder.finish().map_err(create_tx_api_error)?;
    prepare_taproot_policy_psbt(wallet, metadata, index, &mut psbt)?;
    Ok(psbt)
}

fn bind_taproot_policy_psbt(
    wallet: &Wallet,
    metadata: &MultisigWalletDto,
    index: usize,
    psbt: &mut Psbt,
    preparing: bool,
) -> ApiResult<()> {
    use bdk_wallet::{
        bitcoin::{
            psbt,
            taproot::{LeafVersion, TapLeafHash},
        },
        miniscript::psbt::PsbtInputExt,
    };
    if !metadata
        .recovery_template
        .as_ref()
        .is_some_and(RecoveryTemplate::uses_taproot)
    {
        return Ok(());
    }
    let mismatch = || {
        api_error(
            "proposal_mismatch",
            "The PSBT does not bind the selected Taproot policy leaf and canonical inputs.",
        )
    };
    if wallet.public_descriptor(KeychainKind::External).to_string() != metadata.external_descriptor
        || wallet.public_descriptor(KeychainKind::Internal).to_string()
            != metadata.internal_descriptor
    {
        return Err(mismatch());
    }
    bind_psbt_inputs_to_wallet(wallet, psbt)?;
    for (txin, input) in psbt.unsigned_tx.input.iter().zip(&mut psbt.inputs) {
        let output = input
            .non_witness_utxo
            .as_ref()
            .and_then(|tx| tx.output.get(txin.previous_output.vout as usize))
            .ok_or_else(mismatch)?;
        let (keychain, derivation_index) = wallet
            .derivation_of_spk(output.script_pubkey.clone())
            .ok_or_else(mismatch)?;
        let descriptor = wallet
            .public_descriptor(keychain)
            .at_derivation_index(derivation_index)
            .map_err(internal)?;
        let mut canonical = psbt::Input::default();
        let Descriptor::Tr(derived) = canonical
            .update_with_descriptor_unchecked(&descriptor)
            .map_err(internal)?
        else {
            return Err(mismatch());
        };
        let (_, leaf) = derived.iter_scripts().nth(index).ok_or_else(mismatch)?;
        let script = leaf.encode();
        let version = LeafVersion::TapScript;
        let leaf_hash = TapLeafHash::from_script(&script, version);
        canonical
            .tap_scripts
            .retain(|_, value| value == &(script.clone(), version));
        canonical.tap_key_origins.retain(|_, (hashes, _)| {
            hashes.retain(|hash| *hash == leaf_hash);
            !hashes.is_empty()
        });
        if canonical.tap_scripts.len() != 1
            || canonical.tap_key_origins.is_empty()
            || input.tap_key_sig.is_some()
            || !input.partial_sigs.is_empty()
            || input.final_script_sig.is_some()
            || input.final_script_witness.is_some()
        {
            return Err(mismatch());
        }
        if preparing {
            input.tap_scripts = canonical.tap_scripts;
            input.tap_key_origins = canonical.tap_key_origins;
            input.tap_merkle_root = canonical.tap_merkle_root;
            input.tap_internal_key = canonical.tap_internal_key;
            input.witness_utxo = Some(output.clone());
        } else if input.tap_scripts != canonical.tap_scripts
            || input.tap_key_origins != canonical.tap_key_origins
            || input.tap_merkle_root != canonical.tap_merkle_root
            || input.tap_internal_key != canonical.tap_internal_key
            || input.witness_utxo.as_ref() != Some(output)
        {
            return Err(mismatch());
        }
    }
    if preparing {
        // One BIP371 key type, 32-byte key, 32-byte leaf hash, two length
        // prefixes and a Schnorr signature with its optional sighash byte.
        const MAX_SERIALIZED_LEAF_SIGNATURE: usize = 132;
        let signature_space = psbt
            .inputs
            .iter()
            .map(|input| input.tap_key_origins.len())
            .sum::<usize>()
            .saturating_mul(MAX_SERIALIZED_LEAF_SIGNATURE);
        if Psbt::serialize(psbt).len().saturating_add(signature_space)
            > crate::proposal::MAX_PSBT_BYTES
        {
            return Err(proposal_api_error(
                crate::proposal::ProposalError::PsbtTooLarge,
            ));
        }
    }
    Ok(())
}

pub(super) fn prepare_taproot_policy_psbt(
    wallet: &Wallet,
    metadata: &MultisigWalletDto,
    index: usize,
    psbt: &mut Psbt,
) -> ApiResult<()> {
    bind_taproot_policy_psbt(wallet, metadata, index, psbt, true)
}

pub(super) fn validate_taproot_policy_psbt(
    wallet: &Wallet,
    metadata: &MultisigWalletDto,
    index: usize,
    psbt: &mut Psbt,
) -> ApiResult<()> {
    bind_taproot_policy_psbt(wallet, metadata, index, psbt, false)
}

/// Fixed policies must satisfy the transaction's actual CSV/CLTV fields. BDK's
/// chain-age satisfier can otherwise select a cheaper, later branch despite a
/// smaller sequence in a previously prepared proposal.
pub(super) fn finalize_multisig_policy_psbt(
    wallet: &Wallet,
    metadata: &MultisigWalletDto,
    psbt: &mut Psbt,
) -> ApiResult<bool> {
    use bdk_wallet::miniscript::psbt::PsbtExt;
    if !matches!(
        metadata.recovery_template,
        Some(
            RecoveryTemplate::PartnerContinuityV1 { .. }
                | RecoveryTemplate::PartnerContinuityTaprootV1 { .. }
                | RecoveryTemplate::FamilyContinuityV1 { .. }
                | RecoveryTemplate::FamilyContinuityTaprootV1 { .. }
        )
    ) {
        return wallet
            .finalize_psbt(psbt, SignOptions::default())
            .map_err(internal);
    }
    let mut candidate = psbt.clone();
    if metadata
        .recovery_template
        .as_ref()
        .is_some_and(RecoveryTemplate::uses_taproot)
    {
        let analysis = verified_analysis(metadata)?;
        let index = if candidate
            .unsigned_tx
            .input
            .iter()
            .any(|txin| txin.sequence.is_relative_lock_time())
        {
            selected_delayed_index(&analysis, &candidate)?
        } else {
            0
        };
        validate_taproot_policy_psbt(wallet, metadata, index, &mut candidate)?;
        let secp = Secp256k1::verification_only();
        if candidate.finalize_mut(&secp).is_err() || candidate.extract(&secp).is_err() {
            return Ok(false);
        }
        *psbt = candidate;
        return Ok(true);
    }
    bind_psbt_inputs_to_wallet(wallet, &mut candidate)?;
    for (index, input) in candidate.inputs.iter().enumerate() {
        let script = input
            .witness_script
            .clone()
            .or_else(|| {
                input
                    .final_script_witness
                    .as_ref()
                    .and_then(|witness| witness.last())
                    .map(|bytes| bdk_wallet::bitcoin::ScriptBuf::from_bytes(bytes.to_vec()))
            })
            .ok_or_else(|| {
                api_error(
                    "proposal_mismatch",
                    "The proposal is missing its wallet witness script.",
                )
            })?;
        let output = candidate.get_utxo_for(index).ok_or_else(|| {
            api_error(
                "proposal_mismatch",
                "The proposal is missing a canonical wallet input.",
            )
        })?;
        if !output.script_pubkey.is_p2wsh() || script.to_p2wsh() != output.script_pubkey {
            return Err(api_error(
                "proposal_mismatch",
                "The witness script does not match the canonical wallet input.",
            ));
        }
    }
    let secp = Secp256k1::verification_only();
    if candidate.finalize_mut(&secp).is_err() || candidate.extract(&secp).is_err() {
        return Ok(false);
    }
    *psbt = candidate;
    Ok(true)
}
