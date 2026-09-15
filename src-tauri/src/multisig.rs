use crate::recovery::{RecoveryTemplate, TimedSpendingPath};
use bdk_wallet::{
    bitcoin::bip32::{Fingerprint, Xpub},
    descriptor::{Descriptor, DescriptorPublicKey},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fmt, str::FromStr};

pub use crate::build_network::multisig_account_path;
use crate::build_network::parameters;
const MIN_COSIGNERS: usize = 3;
const MAX_COSIGNERS: usize = 7;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CosignerSource {
    Usb,
    Qr,
    File,
    Manual,
    Virtual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CosignerInput {
    pub id: String,
    pub label: String,
    pub fingerprint: String,
    pub xpub: String,
    pub derivation_path: String,
    pub source: CosignerSource,
    #[serde(default)]
    pub device_type: Option<String>,
}

impl CosignerInput {
    pub fn parse_for_validation(&self) -> Result<(), PolicyError> {
        let account_xpub =
            Xpub::from_str(self.xpub.trim()).map_err(|_| PolicyError::InvalidDescriptor)?;
        if self.derivation_path != multisig_account_path()
            || self.id.trim().is_empty()
            || self.id.len() > 128
            || self.label.trim().is_empty()
            || self.label.chars().count() > 48
            || Fingerprint::from_str(self.fingerprint.trim()).is_err()
            || account_xpub.network != parameters().extended_key_network
        {
            return Err(PolicyError::InvalidDescriptor);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyInput {
    pub name: String,
    pub threshold: usize,
    pub cosigners: Vec<CosignerInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigWalletDto {
    pub kind: String,
    pub name: String,
    pub threshold: usize,
    pub cosigners: Vec<CosignerInput>,
    pub external_descriptor: String,
    pub internal_descriptor: String,
    pub created_at: String,
    #[serde(default)]
    pub policy_type: String,
    #[serde(default)]
    pub recovery_template: Option<RecoveryTemplate>,
    #[serde(default)]
    pub spending_paths: Vec<TimedSpendingPath>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigPreviewDto {
    pub name: String,
    pub threshold: usize,
    pub cosigners: Vec<CosignerInput>,
    pub external_descriptor: String,
    pub internal_descriptor: String,
}

impl PolicyInput {
    pub fn parse(&self) -> Result<MultisigPolicy, PolicyError> {
        if self
            .cosigners
            .iter()
            .any(|key| key.derivation_path != multisig_account_path())
        {
            return Err(PolicyError::InvalidDescriptor);
        }
        let cosigners = self
            .cosigners
            .iter()
            .map(|key| {
                key.parse_for_validation()?;
                Ok(CosignerKey {
                    id: key.id.clone(),
                    label: key.label.clone(),
                    fingerprint: Fingerprint::from_str(key.fingerprint.trim())
                        .map_err(|_| PolicyError::InvalidDescriptor)?,
                    account_xpub: Xpub::from_str(key.xpub.trim())
                        .map_err(|_| PolicyError::InvalidDescriptor)?,
                    source: key.source,
                })
            })
            .collect::<Result<Vec<_>, PolicyError>>()?;
        MultisigPolicy::new(self.name.clone(), self.threshold, cosigners)
    }

    pub fn preview(&self) -> Result<MultisigPreviewDto, PolicyError> {
        let policy = self.parse()?;
        let descriptors = policy.descriptors()?;
        let order = policy
            .cosigners
            .iter()
            .map(|key| key.id.as_str())
            .collect::<Vec<_>>();
        let mut cosigners = self.cosigners.clone();
        cosigners.sort_by_key(|key| {
            order
                .iter()
                .position(|id| *id == key.id)
                .unwrap_or(usize::MAX)
        });
        Ok(MultisigPreviewDto {
            name: policy.name,
            threshold: policy.threshold,
            cosigners,
            external_descriptor: descriptors.external,
            internal_descriptor: descriptors.internal,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CosignerKey {
    pub id: String,
    pub label: String,
    pub fingerprint: Fingerprint,
    pub account_xpub: Xpub,
    pub source: CosignerSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DescriptorPair {
    pub external: String,
    pub internal: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MultisigPolicy {
    pub name: String,
    pub threshold: usize,
    pub cosigners: Vec<CosignerKey>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyError {
    InvalidName,
    InvalidCosignerCount,
    UnsafeThreshold,
    DuplicateFingerprint,
    DuplicateXpub,
    InvalidDescriptor,
}

impl PolicyError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidName => "invalid_wallet_name",
            Self::InvalidCosignerCount => "invalid_cosigner_count",
            Self::UnsafeThreshold => "unsafe_threshold",
            Self::DuplicateFingerprint => "duplicate_fingerprint",
            Self::DuplicateXpub => "duplicate_xpub",
            Self::InvalidDescriptor => "invalid_descriptor",
        }
    }
}

impl fmt::Display for PolicyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for PolicyError {}

impl MultisigPolicy {
    pub fn new(
        name: String,
        threshold: usize,
        mut cosigners: Vec<CosignerKey>,
    ) -> Result<Self, PolicyError> {
        let name = name.trim().to_owned();
        if name.is_empty() || name.chars().count() > 48 {
            return Err(PolicyError::InvalidName);
        }
        if !(MIN_COSIGNERS..=MAX_COSIGNERS).contains(&cosigners.len()) {
            return Err(PolicyError::InvalidCosignerCount);
        }
        if threshold < 2 || threshold > cosigners.len() {
            return Err(PolicyError::UnsafeThreshold);
        }
        if cosigners
            .iter()
            .any(|cosigner| cosigner.label.trim().is_empty() || cosigner.label.chars().count() > 48)
        {
            return Err(PolicyError::InvalidName);
        }
        let ids = cosigners
            .iter()
            .map(|cosigner| cosigner.id.trim())
            .collect::<HashSet<_>>();
        if ids.len() != cosigners.len() || ids.iter().any(|id| id.is_empty()) {
            return Err(PolicyError::InvalidDescriptor);
        }
        let fingerprints = cosigners
            .iter()
            .map(|cosigner| cosigner.fingerprint)
            .collect::<HashSet<_>>();
        if fingerprints.len() != cosigners.len() {
            return Err(PolicyError::DuplicateFingerprint);
        }
        let xpubs = cosigners
            .iter()
            .map(|cosigner| cosigner.account_xpub)
            .collect::<HashSet<_>>();
        if xpubs.len() != cosigners.len() {
            return Err(PolicyError::DuplicateXpub);
        }
        cosigners.sort_by_key(|cosigner| cosigner.fingerprint.to_string());
        for cosigner in &mut cosigners {
            cosigner.label = cosigner.label.trim().to_owned();
        }
        Ok(Self {
            name,
            threshold,
            cosigners,
        })
    }

    pub fn descriptors(&self) -> Result<DescriptorPair, PolicyError> {
        Ok(DescriptorPair {
            external: self.descriptor_for_branch(0)?,
            internal: self.descriptor_for_branch(1)?,
        })
    }

    fn descriptor_for_branch(&self, branch: u8) -> Result<String, PolicyError> {
        let keys = self
            .cosigners
            .iter()
            .map(|cosigner| {
                format!(
                    "[{}/{}]{}/{branch}/*",
                    cosigner.fingerprint,
                    multisig_account_path().trim_start_matches("m/"),
                    cosigner.account_xpub
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        let descriptor = format!("wsh(sortedmulti({},{}))", self.threshold, keys);
        Descriptor::<DescriptorPublicKey>::from_str(&descriptor)
            .map(|parsed| parsed.to_string())
            .map_err(|_| PolicyError::InvalidDescriptor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::{
        bitcoin::{
            bip32::{DerivationPath, Xpriv, Xpub},
            secp256k1::Secp256k1,
            Network, NetworkKind,
        },
        KeychainKind, Wallet,
    };
    use std::str::FromStr;

    fn cosigner(index: u8, label: &str) -> CosignerKey {
        let secp = Secp256k1::new();
        let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).expect("master key");
        let fingerprint = master.fingerprint(&secp);
        let path = DerivationPath::from_str(multisig_account_path()).expect("BIP48 path");
        let account = master.derive_priv(&secp, &path).expect("account key");
        CosignerKey {
            id: format!("device-{index}"),
            label: label.to_owned(),
            fingerprint,
            account_xpub: Xpub::from_priv(&secp, &account),
            source: CosignerSource::Virtual,
        }
    }

    #[test]
    fn builds_canonical_watch_only_wsh_sortedmulti_descriptors() {
        let policy = MultisigPolicy::new(
            "Family vault".to_owned(),
            2,
            vec![
                cosigner(3, "Trezor"),
                cosigner(1, "Coldcard"),
                cosigner(2, "Ledger"),
            ],
        )
        .expect("valid policy");
        let descriptors = policy.descriptors().expect("descriptors");

        assert!(descriptors.external.contains("wsh(sortedmulti(2,"));
        assert!(descriptors.external.contains("/0/*"));
        assert!(descriptors.internal.contains("/1/*"));
        assert!(!descriptors.external.contains("prv"));
        assert!(!descriptors.internal.contains("prv"));

        let mut wallet = Wallet::create(descriptors.external, descriptors.internal)
            .network(Network::Regtest)
            .create_wallet_no_persist()
            .expect("BDK accepts descriptors");
        assert!(wallet
            .reveal_next_address(KeychainKind::External)
            .address
            .to_string()
            .starts_with("bcrt1q"));
    }

    #[test]
    fn descriptor_identity_is_independent_of_connection_order() {
        let first = MultisigPolicy::new(
            "Vault".to_owned(),
            2,
            vec![cosigner(1, "A"), cosigner(2, "B"), cosigner(3, "C")],
        )
        .unwrap();
        let second = MultisigPolicy::new(
            "Vault".to_owned(),
            2,
            vec![cosigner(3, "C"), cosigner(1, "A"), cosigner(2, "B")],
        )
        .unwrap();
        assert_eq!(first.descriptors().unwrap(), second.descriptors().unwrap());
    }

    #[test]
    fn rejects_duplicate_devices_and_unsafe_thresholds() {
        let one = cosigner(1, "Primary");
        let mut duplicate = cosigner(2, "Duplicate");
        duplicate.fingerprint = one.fingerprint;
        assert_eq!(
            MultisigPolicy::new(
                "Vault".to_owned(),
                2,
                vec![one.clone(), duplicate, cosigner(3, "Third")]
            )
            .unwrap_err()
            .code(),
            "duplicate_fingerprint"
        );

        let mut duplicate_xpub = cosigner(2, "Duplicate xpub");
        duplicate_xpub.account_xpub = one.account_xpub;
        assert_eq!(
            MultisigPolicy::new(
                "Vault".to_owned(),
                2,
                vec![one, duplicate_xpub, cosigner(3, "Third")]
            )
            .unwrap_err()
            .code(),
            "duplicate_xpub"
        );

        assert_eq!(
            MultisigPolicy::new(
                "Vault".to_owned(),
                1,
                vec![cosigner(1, "A"), cosigner(2, "B"), cosigner(3, "C")]
            )
            .unwrap_err()
            .code(),
            "unsafe_threshold"
        );
    }

    #[test]
    fn input_validation_and_every_policy_error_are_stable() {
        let key = cosigner(1, "Primary");
        let valid = CosignerInput {
            id: key.id.clone(),
            label: key.label.clone(),
            fingerprint: key.fingerprint.to_string(),
            xpub: key.account_xpub.to_string(),
            derivation_path: multisig_account_path().to_owned(),
            source: key.source,
            device_type: None,
        };
        assert!(valid.parse_for_validation().is_ok());
        for invalid in [
            CosignerInput {
                derivation_path: "m/84'/1'/0'".to_owned(),
                ..valid.clone()
            },
            CosignerInput {
                label: " ".to_owned(),
                ..valid.clone()
            },
            CosignerInput {
                fingerprint: "bad".to_owned(),
                ..valid.clone()
            },
            CosignerInput {
                xpub: "bad".to_owned(),
                ..valid.clone()
            },
        ] {
            assert_eq!(
                invalid.parse_for_validation(),
                Err(PolicyError::InvalidDescriptor)
            );
        }
        let cases = [
            (PolicyError::InvalidName, "invalid_wallet_name"),
            (PolicyError::InvalidCosignerCount, "invalid_cosigner_count"),
            (PolicyError::UnsafeThreshold, "unsafe_threshold"),
            (PolicyError::DuplicateFingerprint, "duplicate_fingerprint"),
            (PolicyError::DuplicateXpub, "duplicate_xpub"),
            (PolicyError::InvalidDescriptor, "invalid_descriptor"),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code);
            assert_eq!(error.to_string(), code);
        }
    }

    #[test]
    fn rejects_names_counts_labels_and_malformed_policy_inputs() {
        let keys = vec![cosigner(1, "A"), cosigner(2, "B"), cosigner(3, "C")];
        assert_eq!(
            MultisigPolicy::new(" ".into(), 2, keys.clone()).unwrap_err(),
            PolicyError::InvalidName
        );
        assert_eq!(
            MultisigPolicy::new("x".repeat(49), 2, keys.clone()).unwrap_err(),
            PolicyError::InvalidName
        );
        assert_eq!(
            MultisigPolicy::new("Vault".into(), 2, keys[..2].to_vec()).unwrap_err(),
            PolicyError::InvalidCosignerCount
        );
        let mut blank = keys.clone();
        blank[0].label = " ".into();
        assert_eq!(
            MultisigPolicy::new("Vault".into(), 2, blank).unwrap_err(),
            PolicyError::InvalidName
        );

        let preview = PolicyInput {
            name: "Vault".into(),
            threshold: 2,
            cosigners: keys
                .iter()
                .map(|key| CosignerInput {
                    id: key.id.clone(),
                    label: key.label.clone(),
                    fingerprint: key.fingerprint.to_string(),
                    xpub: key.account_xpub.to_string(),
                    derivation_path: multisig_account_path().into(),
                    source: key.source,
                    device_type: None,
                })
                .collect(),
        };
        let mut wrong_path = preview.clone();
        wrong_path.cosigners[0].derivation_path = "bad".into();
        assert_eq!(
            wrong_path.parse().unwrap_err(),
            PolicyError::InvalidDescriptor
        );
        let mut wrong_fingerprint = preview.clone();
        wrong_fingerprint.cosigners[0].fingerprint = "bad".into();
        assert_eq!(
            wrong_fingerprint.parse().unwrap_err(),
            PolicyError::InvalidDescriptor
        );
        let mut empty_id = preview.clone();
        empty_id.cosigners[0].id = " ".into();
        assert_eq!(
            empty_id.parse().unwrap_err(),
            PolicyError::InvalidDescriptor
        );
        let mut wrong_xpub = preview;
        wrong_xpub.cosigners[0].xpub = "bad".into();
        assert_eq!(
            wrong_xpub.parse().unwrap_err(),
            PolicyError::InvalidDescriptor
        );
    }
}
