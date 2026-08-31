use crate::multisig::{CosignerInput, MULTISIG_ACCOUNT_PATH};
use bdk_wallet::{
    descriptor::{Descriptor, DescriptorPublicKey},
    miniscript::{
        policy::concrete::{DescriptorCtx, Policy},
        RelLockTime, Segwitv0, Threshold,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fmt,
    sync::Arc,
};

const MAX_STAGES: usize = 8;
const MIN_DELAY_BLOCKS: u32 = 144;
const MAX_DELAY_BLOCKS: u32 = 52_560;
pub const CONTINUITY_ASSISTANCE_BLOCKS: u32 = 13_140;
pub const CONTINUITY_RENEWAL_BLOCKS: u32 = 26_280;
pub const PARTNER_SOLO_BLOCKS: u32 = 39_420;
pub const CONTINUITY_ESTATE_BLOCKS: u32 = 52_560;
pub const EXPECTED_BLOCK_SECONDS: u64 = 600;
pub const MIN_APPROACHING_BLOCKS: u32 = 1_008;
const APPROACHING_DELAY_DIVISOR: u32 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MaturityState {
    Unconfirmed,
    Immature,
    Approaching,
    Mature,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MaturityCalculation {
    pub state: MaturityState,
    pub age_blocks: u32,
    pub remaining_blocks: Option<u32>,
    pub approaching_at_blocks: u32,
    pub approximate_seconds_remaining: Option<u64>,
}

pub fn approaching_maturity_blocks(delay_blocks: u32) -> Result<u32, RecoveryError> {
    validate_delay(delay_blocks)?;
    Ok(delay_blocks
        .min(MIN_APPROACHING_BLOCKS.max(delay_blocks.div_ceil(APPROACHING_DELAY_DIVISOR))))
}

pub fn calculate_maturity(
    delay_blocks: u32,
    confirmations: u32,
) -> Result<MaturityCalculation, RecoveryError> {
    validate_delay(delay_blocks)?;
    let approaching_at_blocks = approaching_maturity_blocks(delay_blocks)?;
    if confirmations == 0 {
        return Ok(MaturityCalculation {
            state: MaturityState::Unconfirmed,
            age_blocks: 0,
            remaining_blocks: None,
            approaching_at_blocks,
            approximate_seconds_remaining: None,
        });
    }
    let remaining_blocks = delay_blocks.saturating_sub(confirmations);
    let state = if remaining_blocks == 0 {
        MaturityState::Mature
    } else if remaining_blocks <= approaching_at_blocks {
        MaturityState::Approaching
    } else {
        MaturityState::Immature
    };
    Ok(MaturityCalculation {
        state,
        age_blocks: confirmations,
        remaining_blocks: Some(remaining_blocks),
        approaching_at_blocks,
        approximate_seconds_remaining: Some(
            u64::from(remaining_blocks).saturating_mul(EXPECTED_BLOCK_SECONDS),
        ),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingPath {
    pub threshold: usize,
    pub signer_ids: Vec<String>,
}

impl SpendingPath {
    pub fn new<I, S>(threshold: usize, signer_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            threshold,
            signer_ids: signer_ids.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimedSpendingPath {
    pub available_after_blocks: u32,
    pub threshold: usize,
    pub signer_ids: Vec<String>,
}

impl TimedSpendingPath {
    pub fn new<I, S>(available_after_blocks: u32, threshold: usize, signer_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            available_after_blocks,
            threshold,
            signer_ids: signer_ids.into_iter().map(Into::into).collect(),
        }
    }

    fn spending_path(&self) -> SpendingPath {
        SpendingPath::new(self.threshold, self.signer_ids.clone())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RecoveryTemplate {
    Recovery {
        immediate: SpendingPath,
        recovery: TimedSpendingPath,
    },
    Decaying {
        stages: Vec<TimedSpendingPath>,
    },
    Expanding {
        stages: Vec<TimedSpendingPath>,
    },
    PartnerContinuityV1 {
        owner: SpendingPath,
        partner: SpendingPath,
        estate: SpendingPath,
    },
    FamilyContinuityV1 {
        parents: SpendingPath,
        child_assistance: SpendingPath,
        child_inheritance: SpendingPath,
        executor_signer_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyWarning {
    pub code: &'static str,
    pub message: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyAnalysis {
    pub external_descriptor: String,
    pub internal_descriptor: String,
    pub paths: Vec<TimedSpendingPath>,
    pub warnings: Vec<PolicyWarning>,
    pub max_satisfaction_weight: usize,
}

impl PolicyAnalysis {
    pub fn path_at_age(&self, age_blocks: u32) -> Option<&TimedSpendingPath> {
        self.paths
            .iter()
            .rev()
            .find(|path| path.available_after_blocks <= age_blocks)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryError {
    InvalidTimeline,
    InvalidDecay,
    InvalidExpansion,
    InvalidContinuityTemplate,
    InvalidSignerCount,
    UnknownSigner,
    DuplicateSigner,
    RecoverySignerReused,
    UnsafeThreshold,
    InvalidDelay,
    InvalidKey,
    PolicyTooComplex,
    CompilationFailed,
    UnknownPath,
    ImmaturePath,
}

impl RecoveryError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidTimeline => "invalid_timeline",
            Self::InvalidDecay => "invalid_decay",
            Self::InvalidExpansion => "invalid_expansion",
            Self::InvalidContinuityTemplate => "invalid_continuity_template",
            Self::InvalidSignerCount => "invalid_signer_count",
            Self::UnknownSigner => "unknown_signer",
            Self::DuplicateSigner => "duplicate_signer",
            Self::RecoverySignerReused => "recovery_signer_reused",
            Self::UnsafeThreshold => "unsafe_threshold",
            Self::InvalidDelay => "invalid_delay",
            Self::InvalidKey => "invalid_key",
            Self::PolicyTooComplex => "policy_too_complex",
            Self::CompilationFailed => "policy_compilation_failed",
            Self::UnknownPath => "unknown_spending_path",
            Self::ImmaturePath => "immature_spending_path",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectedSpendingPath {
    pub index: usize,
    pub path: TimedSpendingPath,
    pub youngest_input_age: u32,
}

/// Chooses a reviewed policy path using the least-confirmed input. This deliberately
/// fails closed after a reorg and defaults to the immediate path when no choice is made.
pub fn select_spending_path(
    analysis: &PolicyAnalysis,
    requested_index: Option<usize>,
    input_ages: &[u32],
) -> Result<SelectedSpendingPath, RecoveryError> {
    let youngest_input_age = *input_ages.iter().min().ok_or(RecoveryError::ImmaturePath)?;
    let index = requested_index.unwrap_or(0);
    let path = analysis
        .paths
        .get(index)
        .ok_or(RecoveryError::UnknownPath)?;
    if youngest_input_age < path.available_after_blocks {
        return Err(RecoveryError::ImmaturePath);
    }
    Ok(SelectedSpendingPath {
        index,
        path: path.clone(),
        youngest_input_age,
    })
}

impl fmt::Display for RecoveryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

impl std::error::Error for RecoveryError {}

fn validate_path(path: &SpendingPath, known: &HashSet<&str>) -> Result<(), RecoveryError> {
    if path.signer_ids.is_empty() {
        return Err(RecoveryError::InvalidSignerCount);
    }
    if path.threshold == 0 || path.threshold > path.signer_ids.len() {
        return Err(RecoveryError::UnsafeThreshold);
    }
    let unique = path
        .signer_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if unique.len() != path.signer_ids.len() {
        return Err(RecoveryError::DuplicateSigner);
    }
    if unique.iter().any(|id| !known.contains(id)) {
        return Err(RecoveryError::UnknownSigner);
    }
    Ok(())
}

fn validate_delay(delay: u32) -> Result<(), RecoveryError> {
    if !(MIN_DELAY_BLOCKS..=MAX_DELAY_BLOCKS).contains(&delay) {
        return Err(RecoveryError::InvalidDelay);
    }
    Ok(())
}

fn key_for_branch(
    cosigner: &CosignerInput,
    branch: u8,
) -> Result<DescriptorPublicKey, RecoveryError> {
    if cosigner.derivation_path != MULTISIG_ACCOUNT_PATH {
        return Err(RecoveryError::InvalidKey);
    }
    format!(
        "[{}/{}]{}/{branch}/*",
        cosigner.fingerprint,
        MULTISIG_ACCOUNT_PATH.trim_start_matches("m/"),
        cosigner.xpub
    )
    .parse()
    .map_err(|_| RecoveryError::InvalidKey)
}

fn threshold_policy(
    keys: Vec<DescriptorPublicKey>,
    threshold: usize,
) -> Result<Policy<DescriptorPublicKey>, RecoveryError> {
    let items = keys
        .into_iter()
        .map(|key| Arc::new(Policy::Key(key)))
        .collect();
    Threshold::new(threshold, items)
        .map(Policy::Thresh)
        .map_err(|_| RecoveryError::UnsafeThreshold)
}

fn timed_policy(delay: u32, policy: Policy<DescriptorPublicKey>) -> Policy<DescriptorPublicKey> {
    Policy::And(vec![
        Arc::new(Policy::Older(RelLockTime::from_height(delay as u16))),
        Arc::new(policy),
    ])
}

fn binary_or(
    left_weight: usize,
    left: Policy<DescriptorPublicKey>,
    right_weight: usize,
    right: Policy<DescriptorPublicKey>,
) -> Policy<DescriptorPublicKey> {
    Policy::Or(vec![
        (left_weight, Arc::new(left)),
        (right_weight, Arc::new(right)),
    ])
}

fn compile_branch(
    template: &RecoveryTemplate,
    paths: &[TimedSpendingPath],
    cosigners: &HashMap<&str, &CosignerInput>,
    branch: u8,
) -> Result<Descriptor<DescriptorPublicKey>, RecoveryError> {
    let keys = |ids: &[String]| -> Result<Vec<DescriptorPublicKey>, RecoveryError> {
        ids.iter()
            .map(|id| {
                cosigners
                    .get(id.as_str())
                    .ok_or(RecoveryError::UnknownSigner)
                    .and_then(|key| key_for_branch(key, branch))
            })
            .collect()
    };
    let policy = match template {
        RecoveryTemplate::Recovery {
            immediate,
            recovery,
        } => {
            let primary = threshold_policy(keys(&immediate.signer_ids)?, immediate.threshold)?;
            let fallback = threshold_policy(keys(&recovery.signer_ids)?, recovery.threshold)?;
            Policy::Or(vec![
                (100, Arc::new(primary)),
                (
                    1,
                    Arc::new(timed_policy(recovery.available_after_blocks, fallback)),
                ),
            ])
        }
        RecoveryTemplate::Decaying { .. } => {
            let first = &paths[0];
            let mut items = keys(&first.signer_ids)?
                .into_iter()
                .map(|key| Arc::new(Policy::Key(key)))
                .collect::<Vec<_>>();
            items.extend(paths.iter().skip(1).map(|stage| {
                Arc::new(Policy::Older(RelLockTime::from_height(
                    stage.available_after_blocks as u16,
                )))
            }));
            Policy::Thresh(
                Threshold::new(first.threshold, items)
                    .map_err(|_| RecoveryError::CompilationFailed)?,
            )
        }
        RecoveryTemplate::Expanding { .. } => {
            let first = &paths[0];
            let mut items = keys(&first.signer_ids)?
                .into_iter()
                .map(|key| Arc::new(Policy::Key(key)))
                .collect::<Vec<_>>();
            let mut previous = first
                .signer_ids
                .iter()
                .map(String::as_str)
                .collect::<HashSet<_>>();
            for stage in paths.iter().skip(1) {
                for id in stage
                    .signer_ids
                    .iter()
                    .filter(|id| !previous.contains(id.as_str()))
                {
                    let key = key_for_branch(cosigners[id.as_str()], branch)?;
                    items.push(Arc::new(timed_policy(
                        stage.available_after_blocks,
                        Policy::Key(key),
                    )));
                }
                previous = stage.signer_ids.iter().map(String::as_str).collect();
            }
            Policy::Thresh(
                Threshold::new(first.threshold, items)
                    .map_err(|_| RecoveryError::CompilationFailed)?,
            )
        }
        RecoveryTemplate::PartnerContinuityV1 {
            owner,
            partner,
            estate,
        } => {
            let owner = threshold_policy(keys(&owner.signer_ids)?, owner.threshold)?;
            let mut partner_items = keys(&partner.signer_ids)?
                .into_iter()
                .map(|key| Arc::new(Policy::Key(key)))
                .collect::<Vec<_>>();
            partner_items.push(Arc::new(Policy::Older(RelLockTime::from_height(
                PARTNER_SOLO_BLOCKS as u16,
            ))));
            let partner = Policy::Thresh(
                Threshold::new(2, partner_items).map_err(|_| RecoveryError::CompilationFailed)?,
            );
            let partner = timed_policy(CONTINUITY_ASSISTANCE_BLOCKS, partner);
            let estate = timed_policy(
                CONTINUITY_ESTATE_BLOCKS,
                threshold_policy(keys(&estate.signer_ids)?, estate.threshold)?,
            );
            binary_or(100, owner, 1, binary_or(10, partner, 1, estate))
        }
        RecoveryTemplate::FamilyContinuityV1 {
            parents,
            child_assistance,
            child_inheritance,
            executor_signer_id,
        } => {
            let mut parent_items = keys(&parents.signer_ids)?
                .into_iter()
                .map(|key| Arc::new(Policy::Key(key)))
                .collect::<Vec<_>>();
            let child_assistance = timed_policy(
                CONTINUITY_ASSISTANCE_BLOCKS,
                threshold_policy(
                    keys(&child_assistance.signer_ids)?,
                    child_assistance.threshold,
                )?,
            );
            parent_items.push(Arc::new(child_assistance));
            let parent_assistance = Policy::Thresh(
                Threshold::new(2, parent_items).map_err(|_| RecoveryError::CompilationFailed)?,
            );

            let mut inheritance_ids = child_inheritance.signer_ids.clone();
            inheritance_ids.push(executor_signer_id.clone());
            let inheritance = timed_policy(
                CONTINUITY_ESTATE_BLOCKS,
                threshold_policy(keys(&inheritance_ids)?, 2)?,
            );
            binary_or(100, parent_assistance, 1, inheritance)
        }
    };
    let descriptor = policy
        .compile_to_descriptor::<Segwitv0>(DescriptorCtx::Wsh)
        .map_err(|_| RecoveryError::CompilationFailed)?;
    descriptor
        .sanity_check()
        .map_err(|_| RecoveryError::CompilationFailed)?;
    Ok(descriptor)
}

pub fn analyze_template(
    template: &RecoveryTemplate,
    cosigners: &[CosignerInput],
) -> Result<PolicyAnalysis, RecoveryError> {
    let known = cosigners
        .iter()
        .map(|key| key.id.as_str())
        .collect::<HashSet<_>>();
    if known.len() != cosigners.len() {
        return Err(RecoveryError::DuplicateSigner);
    }
    let mut warnings = Vec::new();
    let paths = match template {
        RecoveryTemplate::Recovery {
            immediate,
            recovery,
        } => {
            validate_path(immediate, &known)?;
            validate_path(&recovery.spending_path(), &known)?;
            let immediate_signers = immediate.signer_ids.iter().collect::<HashSet<_>>();
            if recovery
                .signer_ids
                .iter()
                .any(|signer| immediate_signers.contains(signer))
            {
                return Err(RecoveryError::RecoverySignerReused);
            }
            validate_delay(recovery.available_after_blocks)?;
            vec![
                TimedSpendingPath::new(0, immediate.threshold, immediate.signer_ids.clone()),
                recovery.clone(),
            ]
        }
        RecoveryTemplate::Decaying { stages } => {
            if stages.len() > MAX_STAGES {
                return Err(RecoveryError::PolicyTooComplex);
            }
            if stages.len() < 2 || stages[0].available_after_blocks != 0 {
                return Err(RecoveryError::InvalidTimeline);
            }
            for stage in stages {
                validate_path(&stage.spending_path(), &known)?;
            }
            for pair in stages.windows(2) {
                if pair[0].available_after_blocks >= pair[1].available_after_blocks {
                    return Err(RecoveryError::InvalidTimeline);
                }
                validate_delay(pair[1].available_after_blocks)?;
                if pair[0].signer_ids.iter().collect::<HashSet<_>>()
                    != pair[1].signer_ids.iter().collect::<HashSet<_>>()
                    || pair[0].threshold != pair[1].threshold + 1
                {
                    return Err(RecoveryError::InvalidDecay);
                }
            }
            warnings.push(PolicyWarning { code: "reduced_theft_resistance", message: "Later paths require fewer signatures and intentionally reduce theft resistance." });
            stages.clone()
        }
        RecoveryTemplate::Expanding { stages } => {
            if stages.len() > MAX_STAGES {
                return Err(RecoveryError::PolicyTooComplex);
            }
            if stages.len() < 2 || stages[0].available_after_blocks != 0 {
                return Err(RecoveryError::InvalidTimeline);
            }
            for stage in stages {
                validate_path(&stage.spending_path(), &known)?;
            }
            for pair in stages.windows(2) {
                if pair[0].available_after_blocks >= pair[1].available_after_blocks {
                    return Err(RecoveryError::InvalidTimeline);
                }
                validate_delay(pair[1].available_after_blocks)?;
                let before = pair[0].signer_ids.iter().collect::<HashSet<_>>();
                let after = pair[1].signer_ids.iter().collect::<HashSet<_>>();
                if pair[0].threshold != pair[1].threshold
                    || !before.is_subset(&after)
                    || before == after
                {
                    return Err(RecoveryError::InvalidExpansion);
                }
            }
            stages.clone()
        }
        RecoveryTemplate::PartnerContinuityV1 {
            owner,
            partner,
            estate,
        } => {
            validate_path(owner, &known)?;
            validate_path(partner, &known)?;
            validate_path(estate, &known)?;
            let owner_ids = owner.signer_ids.iter().collect::<HashSet<_>>();
            let partner_ids = partner.signer_ids.iter().collect::<HashSet<_>>();
            let estate_ids = estate.signer_ids.iter().collect::<HashSet<_>>();
            if owner.threshold != 2
                || owner.signer_ids.len() != 3
                || partner.threshold != 2
                || partner.signer_ids.len() != 2
                || estate.threshold != 2
                || estate.signer_ids.len() != 3
                || !owner_ids.is_disjoint(&partner_ids)
                || !owner_ids.is_disjoint(&estate_ids)
                || !partner_ids.is_disjoint(&estate_ids)
            {
                return Err(RecoveryError::InvalidContinuityTemplate);
            }
            warnings.push(PolicyWarning {
                code: "renewal_required",
                message:
                    "Renew near six months to keep the single-partner-key and estate paths locked.",
            });
            warnings.push(PolicyWarning {
                code: "reduced_theft_resistance",
                message: "After nine months either partner key can spend alone; after twelve months any two estate guardians can spend.",
            });
            vec![
                TimedSpendingPath::new(0, 2, owner.signer_ids.clone()),
                TimedSpendingPath::new(CONTINUITY_ASSISTANCE_BLOCKS, 2, partner.signer_ids.clone()),
                TimedSpendingPath::new(PARTNER_SOLO_BLOCKS, 1, partner.signer_ids.clone()),
                TimedSpendingPath::new(CONTINUITY_ESTATE_BLOCKS, 2, estate.signer_ids.clone()),
            ]
        }
        RecoveryTemplate::FamilyContinuityV1 {
            parents,
            child_assistance,
            child_inheritance,
            executor_signer_id,
        } => {
            validate_path(parents, &known)?;
            validate_path(child_assistance, &known)?;
            validate_path(child_inheritance, &known)?;
            if executor_signer_id.trim().is_empty() || !known.contains(executor_signer_id.as_str())
            {
                return Err(RecoveryError::UnknownSigner);
            }
            let parents_ids = parents.signer_ids.iter().collect::<HashSet<_>>();
            let assistance_ids = child_assistance.signer_ids.iter().collect::<HashSet<_>>();
            let inheritance_ids = child_inheritance.signer_ids.iter().collect::<HashSet<_>>();
            if parents.threshold != 2
                || parents.signer_ids.len() != 2
                || child_assistance.threshold != 1
                || child_assistance.signer_ids.len() != 2
                || child_inheritance.threshold != 2
                || child_inheritance.signer_ids.len() != 2
                || parents_ids.contains(&executor_signer_id)
                || assistance_ids.contains(&executor_signer_id)
                || inheritance_ids.contains(&executor_signer_id)
                || !parents_ids.is_disjoint(&assistance_ids)
                || !parents_ids.is_disjoint(&inheritance_ids)
                || !assistance_ids.is_disjoint(&inheritance_ids)
            {
                return Err(RecoveryError::InvalidContinuityTemplate);
            }
            warnings.push(PolicyWarning {
                code: "renewal_required",
                message: "Renew near six months to keep the inheritance quorum locked.",
            });
            vec![
                TimedSpendingPath::new(0, 2, parents.signer_ids.clone()),
                TimedSpendingPath::new(
                    CONTINUITY_ASSISTANCE_BLOCKS,
                    2,
                    parents
                        .signer_ids
                        .iter()
                        .chain(child_assistance.signer_ids.iter())
                        .cloned()
                        .collect::<Vec<_>>(),
                ),
                TimedSpendingPath::new(
                    CONTINUITY_ESTATE_BLOCKS,
                    2,
                    child_inheritance
                        .signer_ids
                        .iter()
                        .cloned()
                        .chain(std::iter::once(executor_signer_id.clone()))
                        .collect::<Vec<_>>(),
                ),
            ]
        }
    };
    let by_id = cosigners
        .iter()
        .map(|key| (key.id.as_str(), key))
        .collect::<HashMap<_, _>>();
    let external = compile_branch(template, &paths, &by_id, 0)?;
    let internal = compile_branch(template, &paths, &by_id, 1)?;
    let max_satisfaction_weight = external
        .max_weight_to_satisfy()
        .map_err(|_| RecoveryError::CompilationFailed)?
        .to_wu() as usize;
    Ok(PolicyAnalysis {
        external_descriptor: external.to_string(),
        internal_descriptor: internal.to_string(),
        paths,
        warnings,
        max_satisfaction_weight,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maturity_boundaries_are_confirmation_exact() {
        let unconfirmed = calculate_maturity(4_320, 0).unwrap();
        assert_eq!(unconfirmed.state, MaturityState::Unconfirmed);
        assert_eq!(unconfirmed.remaining_blocks, None);

        let immature = calculate_maturity(4_320, 3_311).unwrap();
        assert_eq!(immature.state, MaturityState::Immature);
        assert_eq!(immature.remaining_blocks, Some(1_009));

        let approaching = calculate_maturity(4_320, 3_312).unwrap();
        assert_eq!(approaching.state, MaturityState::Approaching);
        assert_eq!(approaching.remaining_blocks, Some(1_008));

        let one_before = calculate_maturity(4_320, 4_319).unwrap();
        assert_eq!(one_before.state, MaturityState::Approaching);
        assert_eq!(one_before.remaining_blocks, Some(1));

        let exact = calculate_maturity(4_320, 4_320).unwrap();
        assert_eq!(exact.state, MaturityState::Mature);
        assert_eq!(exact.remaining_blocks, Some(0));

        let later = calculate_maturity(4_320, 5_000).unwrap();
        assert_eq!(later.state, MaturityState::Mature);
        assert_eq!(later.remaining_blocks, Some(0));
    }

    #[test]
    fn approaching_window_is_proportional_with_a_one_week_floor() {
        assert_eq!(approaching_maturity_blocks(144).unwrap(), 144);
        assert_eq!(approaching_maturity_blocks(4_320).unwrap(), 1_008);
        assert_eq!(approaching_maturity_blocks(52_560).unwrap(), 5_256);
        assert_eq!(
            calculate_maturity(52_560, 47_304)
                .unwrap()
                .approximate_seconds_remaining,
            Some(5_256 * EXPECTED_BLOCK_SECONDS)
        );
    }

    #[test]
    fn maturity_rejects_hostile_delays() {
        assert_eq!(calculate_maturity(0, 1), Err(RecoveryError::InvalidDelay));
        assert_eq!(
            calculate_maturity(52_561, u32::MAX),
            Err(RecoveryError::InvalidDelay)
        );
    }
    use crate::multisig::{CosignerInput, CosignerSource, MULTISIG_ACCOUNT_PATH};
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        NetworkKind,
    };
    use bdk_wallet::descriptor::{Descriptor, DescriptorPublicKey};
    use std::str::FromStr;

    fn signer(index: u8) -> CosignerInput {
        let secp = Secp256k1::new();
        let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).unwrap();
        let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
        let account = master.derive_priv(&secp, &path).unwrap();
        CosignerInput {
            id: format!("key-{index}"),
            label: format!("Key {index}"),
            fingerprint: master.fingerprint(&secp).to_string(),
            xpub: Xpub::from_priv(&secp, &account).to_string(),
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            source: CosignerSource::Virtual,
            device_type: None,
        }
    }

    fn signers(count: u8) -> Vec<CosignerInput> {
        (1..=count).map(signer).collect()
    }

    fn partner_continuity_template() -> RecoveryTemplate {
        RecoveryTemplate::PartnerContinuityV1 {
            owner: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
            partner: SpendingPath::new(2, ["key-4", "key-5"]),
            estate: SpendingPath::new(2, ["key-6", "key-7", "key-8"]),
        }
    }

    fn family_continuity_template() -> RecoveryTemplate {
        RecoveryTemplate::FamilyContinuityV1 {
            parents: SpendingPath::new(2, ["key-1", "key-2"]),
            child_assistance: SpendingPath::new(1, ["key-3", "key-4"]),
            child_inheritance: SpendingPath::new(2, ["key-5", "key-6"]),
            executor_signer_id: "key-7".into(),
        }
    }

    #[test]
    fn compiles_immediate_plus_timelocked_recovery_for_both_branches() {
        let template = RecoveryTemplate::Recovery {
            immediate: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
            recovery: TimedSpendingPath::new(144, 1, ["key-4"]),
        };
        let analyzed = analyze_template(&template, &signers(4)).expect("safe policy");
        assert_eq!(analyzed.paths.len(), 2);
        assert_eq!(analyzed.paths[0].available_after_blocks, 0);
        assert_eq!(analyzed.paths[1].available_after_blocks, 144);
        assert!(analyzed.warnings.is_empty());
        for descriptor in [&analyzed.external_descriptor, &analyzed.internal_descriptor] {
            let parsed = Descriptor::<DescriptorPublicKey>::from_str(descriptor).unwrap();
            parsed.sanity_check().unwrap();
            assert_eq!(parsed.to_string(), *descriptor);
            assert!(!descriptor.contains("prv"));
        }
        assert!(analyzed.external_descriptor.contains("/0/*"));
        assert!(analyzed.internal_descriptor.contains("/1/*"));
    }

    #[test]
    fn partner_continuity_v1_compiles_the_fixed_timeline() {
        let analyzed = analyze_template(&partner_continuity_template(), &signers(8)).unwrap();
        assert_eq!(
            analyzed
                .paths
                .iter()
                .map(|path| (path.available_after_blocks, path.threshold))
                .collect::<Vec<_>>(),
            vec![
                (0, 2),
                (CONTINUITY_ASSISTANCE_BLOCKS, 2),
                (PARTNER_SOLO_BLOCKS, 1),
                (CONTINUITY_ESTATE_BLOCKS, 2),
            ]
        );
        assert_eq!(analyzed.max_satisfaction_weight, 599);
        assert!(analyzed
            .warnings
            .iter()
            .any(|warning| warning.code == "renewal_required"));
        for descriptor in [&analyzed.external_descriptor, &analyzed.internal_descriptor] {
            Descriptor::<DescriptorPublicKey>::from_str(descriptor)
                .unwrap()
                .sanity_check()
                .unwrap();
            assert!(descriptor.contains("older(13140)"));
            assert!(descriptor.contains("older(39420)"));
            assert!(descriptor.contains("older(52560)"));
        }
    }

    #[test]
    fn family_continuity_v1_compiles_assistance_and_inheritance_roles() {
        let analyzed = analyze_template(&family_continuity_template(), &signers(7)).unwrap();
        assert_eq!(
            analyzed
                .paths
                .iter()
                .map(|path| (
                    path.available_after_blocks,
                    path.threshold,
                    path.signer_ids.len()
                ))
                .collect::<Vec<_>>(),
            vec![
                (0, 2, 2),
                (CONTINUITY_ASSISTANCE_BLOCKS, 2, 4),
                (CONTINUITY_ESTATE_BLOCKS, 2, 3)
            ]
        );
        assert_eq!(analyzed.max_satisfaction_weight, 572);
        for descriptor in [&analyzed.external_descriptor, &analyzed.internal_descriptor] {
            Descriptor::<DescriptorPublicKey>::from_str(descriptor)
                .unwrap()
                .sanity_check()
                .unwrap();
            assert!(descriptor.contains("older(13140)"));
            assert!(descriptor.contains("older(52560)"));
        }
    }

    #[test]
    fn continuity_templates_reject_role_overlap_or_shape_changes() {
        let invalid_partner = RecoveryTemplate::PartnerContinuityV1 {
            owner: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
            partner: SpendingPath::new(2, ["key-3", "key-4"]),
            estate: SpendingPath::new(2, ["key-5", "key-6", "key-7"]),
        };
        assert_eq!(
            analyze_template(&invalid_partner, &signers(8)).unwrap_err(),
            RecoveryError::InvalidContinuityTemplate
        );

        let invalid_family = RecoveryTemplate::FamilyContinuityV1 {
            parents: SpendingPath::new(2, ["key-1", "key-2"]),
            child_assistance: SpendingPath::new(1, ["key-3", "key-4"]),
            child_inheritance: SpendingPath::new(1, ["key-5", "key-6"]),
            executor_signer_id: "key-7".into(),
        };
        assert_eq!(
            analyze_template(&invalid_family, &signers(7)).unwrap_err(),
            RecoveryError::InvalidContinuityTemplate
        );
    }

    #[test]
    fn rejects_reusing_an_immediate_signer_as_the_recovery_key() {
        let template = RecoveryTemplate::Recovery {
            immediate: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
            recovery: TimedSpendingPath::new(4_320, 1, ["key-3"]),
        };
        assert_eq!(
            analyze_template(&template, &signers(3)).unwrap_err(),
            RecoveryError::RecoverySignerReused
        );
    }

    #[test]
    fn decaying_policy_requires_strictly_increasing_delays_and_decreasing_thresholds() {
        let keys = signers(5);
        let valid = RecoveryTemplate::Decaying {
            stages: vec![
                TimedSpendingPath::new(0, 3, ["key-1", "key-2", "key-3", "key-4", "key-5"]),
                TimedSpendingPath::new(4_320, 2, ["key-1", "key-2", "key-3", "key-4", "key-5"]),
                TimedSpendingPath::new(8_640, 1, ["key-1", "key-2", "key-3", "key-4", "key-5"]),
            ],
        };
        let analyzed = analyze_template(&valid, &keys).unwrap();
        assert!(analyzed
            .warnings
            .iter()
            .any(|warning| warning.code == "reduced_theft_resistance"));
        assert_eq!(analyzed.path_at_age(4_319).unwrap().threshold, 3);
        assert_eq!(analyzed.path_at_age(4_320).unwrap().threshold, 2);
        assert_eq!(analyzed.path_at_age(8_640).unwrap().threshold, 1);

        let equal_delay = RecoveryTemplate::Decaying {
            stages: vec![
                TimedSpendingPath::new(0, 3, ["key-1", "key-2", "key-3"]),
                TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3"]),
            ],
        };
        assert_eq!(
            analyze_template(&equal_delay, &keys).unwrap_err().code(),
            "invalid_timeline"
        );

        let stronger_later = RecoveryTemplate::Decaying {
            stages: vec![
                TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3"]),
                TimedSpendingPath::new(144, 3, ["key-1", "key-2", "key-3"]),
            ],
        };
        assert_eq!(
            analyze_template(&stronger_later, &keys).unwrap_err().code(),
            "invalid_decay"
        );
    }

    #[test]
    fn expanding_policy_requires_strict_signer_supersets_and_fixed_threshold() {
        let keys = signers(5);
        let valid = RecoveryTemplate::Expanding {
            stages: vec![
                TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3"]),
                TimedSpendingPath::new(2_016, 2, ["key-1", "key-2", "key-3", "key-4"]),
                TimedSpendingPath::new(4_032, 2, ["key-1", "key-2", "key-3", "key-4", "key-5"]),
            ],
        };
        let analyzed = analyze_template(&valid, &keys).unwrap();
        assert_eq!(analyzed.paths[2].signer_ids.len(), 5);

        let removed_signer = RecoveryTemplate::Expanding {
            stages: vec![
                TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3"]),
                TimedSpendingPath::new(144, 2, ["key-1", "key-2", "key-4"]),
            ],
        };
        assert_eq!(
            analyze_template(&removed_signer, &keys).unwrap_err().code(),
            "invalid_expansion"
        );

        let changed_threshold = RecoveryTemplate::Expanding {
            stages: vec![
                TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3"]),
                TimedSpendingPath::new(144, 3, ["key-1", "key-2", "key-3", "key-4"]),
            ],
        };
        assert_eq!(
            analyze_template(&changed_threshold, &keys)
                .unwrap_err()
                .code(),
            "invalid_expansion"
        );
    }

    #[test]
    fn rejects_unknown_duplicate_empty_and_impossible_signer_sets() {
        let keys = signers(4);
        let cases = [
            (SpendingPath::new(1, ["missing"]), "unknown_signer"),
            (SpendingPath::new(1, ["key-1", "key-1"]), "duplicate_signer"),
            (
                SpendingPath::new(1, Vec::<String>::new()),
                "invalid_signer_count",
            ),
            (SpendingPath::new(3, ["key-1", "key-2"]), "unsafe_threshold"),
        ];
        for (path, expected) in cases {
            let template = RecoveryTemplate::Recovery {
                immediate: path,
                recovery: TimedSpendingPath::new(144, 1, ["key-4"]),
            };
            assert_eq!(
                analyze_template(&template, &keys).unwrap_err().code(),
                expected
            );
        }
    }

    #[test]
    fn rejects_zero_or_time_encoded_delays_and_excessive_policy_complexity() {
        let keys = signers(5);
        for delay in [0, 1 << 22, 65_535] {
            let template = RecoveryTemplate::Recovery {
                immediate: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
                recovery: TimedSpendingPath::new(delay, 1, ["key-4"]),
            };
            assert!(
                analyze_template(&template, &keys).is_err(),
                "delay {delay} must fail"
            );
        }
        let too_many = RecoveryTemplate::Decaying {
            stages: (0..10)
                .map(|index| {
                    TimedSpendingPath::new(
                        index * 144,
                        10 - index as usize,
                        ["key-1", "key-2", "key-3", "key-4", "key-5"],
                    )
                })
                .collect(),
        };
        assert_eq!(
            analyze_template(&too_many, &keys).unwrap_err().code(),
            "policy_too_complex"
        );
    }

    #[test]
    fn every_recovery_error_code_and_additional_timeline_gate_is_stable() {
        let cases = [
            (RecoveryError::InvalidTimeline, "invalid_timeline"),
            (RecoveryError::InvalidDecay, "invalid_decay"),
            (RecoveryError::InvalidExpansion, "invalid_expansion"),
            (
                RecoveryError::InvalidContinuityTemplate,
                "invalid_continuity_template",
            ),
            (RecoveryError::InvalidSignerCount, "invalid_signer_count"),
            (RecoveryError::UnknownSigner, "unknown_signer"),
            (RecoveryError::DuplicateSigner, "duplicate_signer"),
            (
                RecoveryError::RecoverySignerReused,
                "recovery_signer_reused",
            ),
            (RecoveryError::UnsafeThreshold, "unsafe_threshold"),
            (RecoveryError::InvalidDelay, "invalid_delay"),
            (RecoveryError::InvalidKey, "invalid_key"),
            (RecoveryError::PolicyTooComplex, "policy_too_complex"),
            (
                RecoveryError::CompilationFailed,
                "policy_compilation_failed",
            ),
            (RecoveryError::UnknownPath, "unknown_spending_path"),
            (RecoveryError::ImmaturePath, "immature_spending_path"),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code);
            assert_eq!(error.to_string(), code);
        }
        let keys = signers(5);
        for template in [
            RecoveryTemplate::Decaying { stages: vec![] },
            RecoveryTemplate::Expanding { stages: vec![] },
            RecoveryTemplate::Expanding {
                stages: (0..10)
                    .map(|i| TimedSpendingPath::new(i * 144, 2, ["key-1", "key-2", "key-3"]))
                    .collect(),
            },
            RecoveryTemplate::Expanding {
                stages: vec![
                    TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3"]),
                    TimedSpendingPath::new(0, 2, ["key-1", "key-2", "key-3", "key-4"]),
                ],
            },
        ] {
            assert!(analyze_template(&template, &keys).is_err());
        }
        let mut duplicate_ids = keys.clone();
        duplicate_ids[1].id = duplicate_ids[0].id.clone();
        let template = RecoveryTemplate::Recovery {
            immediate: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
            recovery: TimedSpendingPath::new(144, 1, ["key-4"]),
        };
        assert_eq!(
            analyze_template(&template, &duplicate_ids).unwrap_err(),
            RecoveryError::DuplicateSigner
        );
        let mut wrong_path = keys;
        wrong_path[0].derivation_path = "bad".into();
        assert_eq!(
            analyze_template(&template, &wrong_path).unwrap_err(),
            RecoveryError::InvalidKey
        );
    }

    #[test]
    fn path_selection_defaults_safe_and_uses_the_youngest_input_after_reorgs() {
        let analysis = analyze_template(
            &RecoveryTemplate::Recovery {
                immediate: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
                recovery: TimedSpendingPath::new(144, 1, ["key-4"]),
            },
            &signers(4),
        )
        .unwrap();
        let immediate = select_spending_path(&analysis, None, &[0, 500]).unwrap();
        assert_eq!(immediate.index, 0);
        assert_eq!(immediate.youngest_input_age, 0);
        assert_eq!(
            select_spending_path(&analysis, Some(1), &[143, 500]),
            Err(RecoveryError::ImmaturePath)
        );
        let mature = select_spending_path(&analysis, Some(1), &[144, 500]).unwrap();
        assert_eq!(mature.path.threshold, 1);
        assert_eq!(
            select_spending_path(&analysis, Some(1), &[142, 498]),
            Err(RecoveryError::ImmaturePath)
        );
        assert_eq!(
            select_spending_path(&analysis, Some(2), &[500]),
            Err(RecoveryError::UnknownPath)
        );
        assert_eq!(
            select_spending_path(&analysis, Some(0), &[]),
            Err(RecoveryError::ImmaturePath)
        );
    }
}
