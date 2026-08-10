//! BIP129 (BSMS) descriptor-record interoperability.
//!
//! Groot intentionally implements the public, four-line descriptor record here. The
//! encrypted coordinator/signer rounds from BIP129 are a separate protocol and must not be
//! implied by accepting a `.bsms` file. Parsing is strict, bounded, and performed inside the
//! trusted Rust boundary.

use bdk_wallet::bitcoin::bip32::{Fingerprint, Xpub};
use bdk_wallet::descriptor::{Descriptor, DescriptorPublicKey};
use std::{fmt, str::FromStr};

pub const MAX_BSMS_BYTES: usize = 256 * 1024;
pub const GROOT_PATH_RESTRICTIONS: &str = "/0/*,/1/*";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DescriptorRecord {
    pub descriptor_template: String,
    pub path_restrictions: String,
    pub first_address: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StandardCosigner {
    pub fingerprint: Fingerprint,
    pub xpub: Xpub,
    pub derivation_path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BsmsError {
    TooLarge,
    InvalidEncoding,
    UnsupportedVersion,
    InvalidDescriptor,
    PrivateMaterial,
    UnsupportedPaths,
    DescriptorMismatch,
}

impl BsmsError {
    pub fn code(self) -> &'static str {
        match self {
            Self::TooLarge => "backup_too_large",
            Self::PrivateMaterial => "private_material_rejected",
            Self::DescriptorMismatch => "backup_mismatch",
            Self::UnsupportedVersion
            | Self::InvalidEncoding
            | Self::InvalidDescriptor
            | Self::UnsupportedPaths => "invalid_backup",
        }
    }
}

impl fmt::Display for BsmsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for BsmsError {}

impl DescriptorRecord {
    pub fn parse(encoded: &str) -> Result<Self, BsmsError> {
        if encoded.len() > MAX_BSMS_BYTES {
            return Err(BsmsError::TooLarge);
        }
        if encoded.contains('\r')
            || encoded
                .chars()
                .any(|character| character.is_control() && character != '\n')
        {
            return Err(BsmsError::InvalidEncoding);
        }
        let normalized = encoded.strip_suffix('\n').unwrap_or(encoded);
        let lines = normalized.split('\n').collect::<Vec<_>>();
        if lines.len() != 4 || lines.iter().any(|line| line.is_empty()) {
            return Err(BsmsError::InvalidEncoding);
        }
        if lines[0] != "BSMS 1.0" {
            return Err(BsmsError::UnsupportedVersion);
        }
        if contains_private_material(lines[1]) {
            return Err(BsmsError::PrivateMaterial);
        }
        if lines[2] != GROOT_PATH_RESTRICTIONS {
            return Err(BsmsError::UnsupportedPaths);
        }
        let external = expand_template(lines[1], 0)?;
        let internal = expand_template(lines[1], 1)?;
        parse_public_descriptor(&external)?;
        parse_public_descriptor(&internal)?;
        if lines[3].trim() != lines[3] || lines[3].chars().any(char::is_whitespace) {
            return Err(BsmsError::InvalidEncoding);
        }
        Ok(Self {
            descriptor_template: lines[1].to_owned(),
            path_restrictions: lines[2].to_owned(),
            first_address: lines[3].to_owned(),
        })
    }

    pub fn from_descriptor_pair(
        external_descriptor: &str,
        internal_descriptor: &str,
        first_address: &str,
    ) -> Result<Self, BsmsError> {
        if contains_private_material(external_descriptor)
            || contains_private_material(internal_descriptor)
        {
            return Err(BsmsError::PrivateMaterial);
        }
        let external = strip_checksum(external_descriptor);
        let internal = strip_checksum(internal_descriptor);
        parse_public_descriptor(external)?;
        parse_public_descriptor(internal)?;
        if !external.contains("/0/*") {
            return Err(BsmsError::UnsupportedPaths);
        }
        let descriptor_template = external.replace("/0/*", "/**");
        if expand_template(&descriptor_template, 0)? != external
            || expand_template(&descriptor_template, 1)? != internal
        {
            return Err(BsmsError::DescriptorMismatch);
        }
        if first_address.trim() != first_address
            || first_address.is_empty()
            || first_address.chars().any(char::is_whitespace)
        {
            return Err(BsmsError::InvalidEncoding);
        }
        Ok(Self {
            descriptor_template,
            path_restrictions: GROOT_PATH_RESTRICTIONS.to_owned(),
            first_address: first_address.to_owned(),
        })
    }

    pub fn descriptor_pair(&self) -> Result<(String, String), BsmsError> {
        Ok((
            expand_template(&self.descriptor_template, 0)?,
            expand_template(&self.descriptor_template, 1)?,
        ))
    }

    pub fn matches_descriptor_pair(
        &self,
        external_descriptor: &str,
        internal_descriptor: &str,
    ) -> Result<bool, BsmsError> {
        let (external, internal) = self.descriptor_pair()?;
        Ok(external == strip_checksum(external_descriptor)
            && internal == strip_checksum(internal_descriptor))
    }

    /// Extracts the public participants from Groot's standard BIP48 sortedmulti policy.
    /// Arbitrary Miniscript remains importable as a watch-only descriptor elsewhere, but cannot
    /// be represented as editable standard-policy metadata by this method.
    pub fn standard_policy(&self) -> Result<(usize, Vec<StandardCosigner>), BsmsError> {
        const PREFIX: &str = "wsh(sortedmulti(";
        let body = self
            .descriptor_template
            .strip_prefix(PREFIX)
            .and_then(|value| value.strip_suffix("))"))
            .ok_or(BsmsError::InvalidDescriptor)?;
        let (threshold, encoded_keys) = body.split_once(',').ok_or(BsmsError::InvalidDescriptor)?;
        let threshold = threshold
            .parse::<usize>()
            .map_err(|_| BsmsError::InvalidDescriptor)?;
        let mut keys = Vec::new();
        for encoded in encoded_keys.split(',') {
            let (origin, xpub) = encoded
                .strip_prefix('[')
                .and_then(|value| value.split_once(']'))
                .ok_or(BsmsError::InvalidDescriptor)?;
            let (fingerprint, path) = origin.split_once('/').ok_or(BsmsError::InvalidDescriptor)?;
            let xpub = xpub
                .strip_suffix("/**")
                .ok_or(BsmsError::InvalidDescriptor)?;
            keys.push(StandardCosigner {
                fingerprint: Fingerprint::from_str(fingerprint)
                    .map_err(|_| BsmsError::InvalidDescriptor)?,
                xpub: Xpub::from_str(xpub).map_err(|_| BsmsError::InvalidDescriptor)?,
                derivation_path: format!("m/{path}"),
            });
        }
        if keys.is_empty() || threshold == 0 || threshold > keys.len() {
            return Err(BsmsError::InvalidDescriptor);
        }
        Ok((threshold, keys))
    }

    pub fn encode(&self) -> String {
        format!(
            "BSMS 1.0\n{}\n{}\n{}\n",
            self.descriptor_template, self.path_restrictions, self.first_address
        )
    }
}

fn expand_template(template: &str, branch: u8) -> Result<String, BsmsError> {
    if !template.contains("/**") || template.contains("/0/*") || template.contains("/1/*") {
        return Err(BsmsError::UnsupportedPaths);
    }
    Ok(template.replace("/**", &format!("/{branch}/*")))
}

fn strip_checksum(descriptor: &str) -> &str {
    descriptor
        .split_once('#')
        .map_or(descriptor, |(body, _)| body)
}

fn parse_public_descriptor(descriptor: &str) -> Result<(), BsmsError> {
    Descriptor::<DescriptorPublicKey>::from_str(descriptor)
        .map(|_| ())
        .map_err(|_| BsmsError::InvalidDescriptor)
}

fn contains_private_material(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    ["xprv", "tprv", "yprv", "zprv", "uprv", "vprv"]
        .iter()
        .any(|prefix| lower.contains(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        NetworkKind,
    };

    fn descriptors() -> (String, String) {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str("m/48'/1'/0'/2'").unwrap();
        let keys = (1_u8..=3)
            .map(|index| {
                let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).unwrap();
                let fingerprint = master.fingerprint(&secp);
                let account = master.derive_priv(&secp, &path).unwrap();
                (fingerprint, Xpub::from_priv(&secp, &account))
            })
            .collect::<Vec<_>>();
        let make = |branch| {
            let keys = keys
                .iter()
                .map(|(fingerprint, xpub)| format!("[{fingerprint}/48'/1'/0'/2']{xpub}/{branch}/*"))
                .collect::<Vec<_>>()
                .join(",");
            Descriptor::<DescriptorPublicKey>::from_str(&format!("wsh(sortedmulti(2,{keys}))"))
                .unwrap()
                .to_string()
        };
        (make(0), make(1))
    }

    #[test]
    fn round_trips_a_standard_groot_descriptor_pair() {
        let (external, internal) = descriptors();
        let record = DescriptorRecord::from_descriptor_pair(
            &external,
            &internal,
            "bcrt1qtestaddressforparseronly",
        )
        .unwrap();
        assert!(record.descriptor_template.contains("/**"));
        assert_eq!(record.path_restrictions, "/0/*,/1/*");
        let parsed = DescriptorRecord::parse(&record.encode()).unwrap();
        let (expanded_external, expanded_internal) = parsed.descriptor_pair().unwrap();
        assert_eq!(expanded_external, strip_checksum(&external));
        assert_eq!(expanded_internal, strip_checksum(&internal));
        assert!(parsed
            .matches_descriptor_pair(&external, &internal)
            .unwrap());
    }

    #[test]
    fn descriptor_identity_ignores_checksums_but_not_policy_changes() {
        let (external, internal) = descriptors();
        let record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, "address").unwrap();
        assert!(record
            .matches_descriptor_pair(&external, &internal)
            .unwrap());
        assert!(!record
            .matches_descriptor_pair(&internal, &external)
            .unwrap());
    }

    #[test]
    fn rejects_malformed_oversized_private_and_nonstandard_records() {
        let (external, internal) = descriptors();
        let valid = DescriptorRecord::from_descriptor_pair(&external, &internal, "address")
            .unwrap()
            .encode();
        assert_eq!(
            DescriptorRecord::parse(&"x".repeat(MAX_BSMS_BYTES + 1)),
            Err(BsmsError::TooLarge)
        );
        assert_eq!(
            DescriptorRecord::parse(&valid.replace("BSMS 1.0", "BSMS 2.0")),
            Err(BsmsError::UnsupportedVersion)
        );
        assert_eq!(
            DescriptorRecord::parse(&valid.replace("/0/*,/1/*", "No path restrictions")),
            Err(BsmsError::UnsupportedPaths)
        );
        assert_eq!(
            DescriptorRecord::parse(&valid.replace("tpub", "tprv")),
            Err(BsmsError::PrivateMaterial)
        );
        assert_eq!(
            DescriptorRecord::parse(&valid.replace('\n', "\r\n")),
            Err(BsmsError::InvalidEncoding)
        );
        assert_eq!(
            DescriptorRecord::parse(&(valid + "extra\n")),
            Err(BsmsError::InvalidEncoding)
        );
    }

    #[test]
    fn rejects_pairs_whose_internal_branch_does_not_match() {
        let (external, _) = descriptors();
        assert_eq!(
            DescriptorRecord::from_descriptor_pair(&external, &external, "address"),
            Err(BsmsError::DescriptorMismatch)
        );
    }

    #[test]
    fn extracts_standard_sortedmulti_policy_metadata() {
        let (external, internal) = descriptors();
        let record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, "address").unwrap();
        let (threshold, keys) = record.standard_policy().unwrap();
        assert_eq!(threshold, 2);
        assert_eq!(keys.len(), 3);
        assert!(keys
            .iter()
            .all(|key| key.derivation_path == "m/48'/1'/0'/2'"));
        assert!(keys
            .iter()
            .all(|key| key.xpub.network == bdk_wallet::bitcoin::NetworkKind::Test));
    }

    #[test]
    fn error_codes_and_messages_are_stable() {
        let cases = [
            (BsmsError::TooLarge, "backup_too_large"),
            (BsmsError::InvalidEncoding, "invalid_backup"),
            (BsmsError::UnsupportedVersion, "invalid_backup"),
            (BsmsError::InvalidDescriptor, "invalid_backup"),
            (BsmsError::PrivateMaterial, "private_material_rejected"),
            (BsmsError::UnsupportedPaths, "invalid_backup"),
            (BsmsError::DescriptorMismatch, "backup_mismatch"),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code);
            assert_eq!(error.to_string(), code);
        }
    }

    #[test]
    fn rejects_invalid_pair_inputs_and_address_whitespace() {
        let (external, internal) = descriptors();
        assert_eq!(
            DescriptorRecord::from_descriptor_pair("tprv-secret", &internal, "address"),
            Err(BsmsError::PrivateMaterial)
        );
        assert_eq!(
            DescriptorRecord::from_descriptor_pair(&internal, &internal, "address"),
            Err(BsmsError::UnsupportedPaths)
        );
        assert_eq!(
            DescriptorRecord::from_descriptor_pair(&external, &internal, " address"),
            Err(BsmsError::InvalidEncoding)
        );

        let valid = DescriptorRecord::from_descriptor_pair(&external, &internal, "address")
            .unwrap()
            .encode();
        assert_eq!(
            DescriptorRecord::parse(&valid.replace("\naddress\n", "\naddress with-space\n")),
            Err(BsmsError::InvalidEncoding)
        );
    }

    #[test]
    fn rejects_invalid_standard_policy_metadata_and_templates() {
        let (external, internal) = descriptors();
        let mut record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, "address").unwrap();
        record.descriptor_template =
            record
                .descriptor_template
                .replacen("sortedmulti(2,", "sortedmulti(0,", 1);
        assert_eq!(record.standard_policy(), Err(BsmsError::InvalidDescriptor));

        record.descriptor_template = "wpkh(key/0/*)".to_owned();
        assert_eq!(record.descriptor_pair(), Err(BsmsError::UnsupportedPaths));
    }
}
