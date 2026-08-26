//! BIP129 (BSMS) descriptor-record interoperability.
//!
//! Groot intentionally implements the public, four-line descriptor record here. The
//! encrypted coordinator/signer rounds from BIP129 are a separate protocol and must not be
//! implied by accepting a `.bsms` file. Parsing is strict, bounded, and performed inside the
//! trusted Rust boundary.

use bdk_wallet::bitcoin::{
    bip32::{Fingerprint, Xpub},
    Address,
};
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
pub struct PublicDescriptorPair {
    pub external_descriptor: String,
    pub internal_descriptor: String,
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
        Address::from_str(lines[3]).map_err(|_| BsmsError::InvalidEncoding)?;
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
        Address::from_str(first_address).map_err(|_| BsmsError::InvalidEncoding)?;
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

impl PublicDescriptorPair {
    /// Parses public descriptor text emitted by Groot and common hardware-signer workflows.
    /// Accepted text is deliberately narrow: a checksummed multipath descriptor, an explicit
    /// receive/change pair, or a receive descriptor whose standard `/1/*` change branch can be
    /// reconstructed without ambiguity. BIP129 records remain handled by `DescriptorRecord`.
    pub fn parse(encoded: &str) -> Result<Self, BsmsError> {
        validate_public_text(encoded)?;
        let candidates = encoded
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("wsh("))
            .collect::<Vec<_>>();
        if candidates.is_empty() {
            return Err(BsmsError::InvalidDescriptor);
        }

        let mut portable = None;
        let mut external = None;
        let mut internal = None;
        for candidate in candidates {
            parse_public_descriptor(candidate)?;
            let descriptor = strip_checksum(candidate).to_owned();
            if descriptor.contains("/<0;1>/*") {
                set_consistent(&mut portable, descriptor)?;
            } else if descriptor.contains("/0/*") && !descriptor.contains("/1/*") {
                set_consistent(&mut external, descriptor)?;
            } else if descriptor.contains("/1/*") && !descriptor.contains("/0/*") {
                set_consistent(&mut internal, descriptor)?;
            } else {
                return Err(BsmsError::UnsupportedPaths);
            }
        }

        if let Some(template) = portable {
            let portable_external = template.replace("/<0;1>/*", "/0/*");
            let portable_internal = template.replace("/<0;1>/*", "/1/*");
            parse_public_descriptor(&portable_external)?;
            parse_public_descriptor(&portable_internal)?;
            ensure_same_if_present(external.as_deref(), &portable_external)?;
            ensure_same_if_present(internal.as_deref(), &portable_internal)?;
            return Ok(Self {
                external_descriptor: portable_external,
                internal_descriptor: portable_internal,
            });
        }

        let external_descriptor = external.ok_or(BsmsError::UnsupportedPaths)?;
        let derived_internal = external_descriptor.replace("/0/*", "/1/*");
        if derived_internal == external_descriptor {
            return Err(BsmsError::UnsupportedPaths);
        }
        parse_public_descriptor(&derived_internal)?;
        ensure_same_if_present(internal.as_deref(), &derived_internal)?;
        Ok(Self {
            external_descriptor,
            internal_descriptor: derived_internal,
        })
    }
}

fn validate_public_text(encoded: &str) -> Result<(), BsmsError> {
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
    if contains_private_material(encoded) {
        return Err(BsmsError::PrivateMaterial);
    }
    Ok(())
}

fn set_consistent(slot: &mut Option<String>, value: String) -> Result<(), BsmsError> {
    if slot.as_ref().is_some_and(|current| current != &value) {
        return Err(BsmsError::DescriptorMismatch);
    }
    *slot = Some(value);
    Ok(())
}

fn ensure_same_if_present(value: Option<&str>, expected: &str) -> Result<(), BsmsError> {
    if value.is_some_and(|value| value != expected) {
        return Err(BsmsError::DescriptorMismatch);
    }
    Ok(())
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
        Network, NetworkKind,
    };
    use bdk_wallet::{KeychainKind, Wallet};

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

    fn first_address(external: &str, internal: &str) -> String {
        let mut wallet = Wallet::create(external.to_owned(), internal.to_owned())
            .network(Network::Regtest)
            .create_wallet_no_persist()
            .unwrap();
        wallet
            .reveal_next_address(KeychainKind::External)
            .address
            .to_string()
    }

    #[test]
    fn round_trips_a_standard_groot_descriptor_pair() {
        let (external, internal) = descriptors();
        let address = first_address(&external, &internal);
        let record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, &address).unwrap();
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
    fn parses_groot_annotated_and_coldcard_descriptor_text() {
        let (external, internal) = descriptors();
        let portable = strip_checksum(&external).replace("/0/*", "/<0;1>/*");
        let portable = Descriptor::<DescriptorPublicKey>::from_str(&portable)
            .unwrap()
            .to_string();
        let annotated = format!(
            "Wallet: Test policy\nPortable wallet descriptor:\n{portable}\n\nReceive descriptor:\n{external}\n\nChange descriptor:\n{internal}\n"
        );
        let parsed = PublicDescriptorPair::parse(&annotated).unwrap();
        assert_eq!(parsed.external_descriptor, strip_checksum(&external));
        assert_eq!(parsed.internal_descriptor, strip_checksum(&internal));

        let coldcard = format!(
            "# Public multisig policy for COLDCARD\n# Import through the device menu\n{external}\n"
        );
        let parsed = PublicDescriptorPair::parse(&coldcard).unwrap();
        assert_eq!(parsed.external_descriptor, strip_checksum(&external));
        assert_eq!(parsed.internal_descriptor, strip_checksum(&internal));
    }

    #[test]
    fn descriptor_text_rejects_private_material_and_conflicting_branches() {
        let (external, internal) = descriptors();
        assert_eq!(
            PublicDescriptorPair::parse(&external.replace("tpub", "tprv")),
            Err(BsmsError::PrivateMaterial)
        );
        let portable = Descriptor::<DescriptorPublicKey>::from_str(
            &strip_checksum(&external).replace("/0/*", "/<0;1>/*"),
        )
        .unwrap()
        .to_string();
        let wrong_internal = Descriptor::<DescriptorPublicKey>::from_str(
            &strip_checksum(&internal).replace("sortedmulti(2", "sortedmulti(3"),
        )
        .unwrap()
        .to_string();
        assert_eq!(
            PublicDescriptorPair::parse(&format!("{portable}\n{external}\n{wrong_internal}\n")),
            Err(BsmsError::DescriptorMismatch)
        );
    }

    #[test]
    fn descriptor_text_rejects_malformed_bounded_and_ambiguous_inputs() {
        let (external, _) = descriptors();
        assert_eq!(
            PublicDescriptorPair::parse("not a descriptor"),
            Err(BsmsError::InvalidDescriptor)
        );
        assert_eq!(
            PublicDescriptorPair::parse(&"x".repeat(MAX_BSMS_BYTES + 1)),
            Err(BsmsError::TooLarge)
        );
        assert_eq!(
            PublicDescriptorPair::parse("wsh(\u{0}invalid)"),
            Err(BsmsError::InvalidEncoding)
        );

        let fixed_path = strip_checksum(&external).replace("/0/*", "/0/0");
        let fixed_path = Descriptor::<DescriptorPublicKey>::from_str(&fixed_path)
            .unwrap()
            .to_string();
        assert_eq!(
            PublicDescriptorPair::parse(&fixed_path),
            Err(BsmsError::UnsupportedPaths)
        );

        let conflicting = Descriptor::<DescriptorPublicKey>::from_str(
            &strip_checksum(&external).replace("sortedmulti(2", "sortedmulti(3"),
        )
        .unwrap()
        .to_string();
        assert_eq!(
            PublicDescriptorPair::parse(&format!("{external}\n{conflicting}\n")),
            Err(BsmsError::DescriptorMismatch)
        );
    }

    #[test]
    fn descriptor_identity_ignores_checksums_but_not_policy_changes() {
        let (external, internal) = descriptors();
        let address = first_address(&external, &internal);
        let record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, &address).unwrap();
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
        let address = first_address(&external, &internal);
        let valid = DescriptorRecord::from_descriptor_pair(&external, &internal, &address)
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
        let (external, internal) = descriptors();
        let address = first_address(&external, &internal);
        assert_eq!(
            DescriptorRecord::from_descriptor_pair(&external, &external, &address),
            Err(BsmsError::DescriptorMismatch)
        );
    }

    #[test]
    fn extracts_standard_sortedmulti_policy_metadata() {
        let (external, internal) = descriptors();
        let address = first_address(&external, &internal);
        let record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, &address).unwrap();
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
        let address = first_address(&external, &internal);
        assert_eq!(
            DescriptorRecord::from_descriptor_pair("tprv-secret", &internal, &address),
            Err(BsmsError::PrivateMaterial)
        );
        assert_eq!(
            DescriptorRecord::from_descriptor_pair(&internal, &internal, &address),
            Err(BsmsError::UnsupportedPaths)
        );
        assert_eq!(
            DescriptorRecord::from_descriptor_pair(&external, &internal, "not-an-address"),
            Err(BsmsError::InvalidEncoding)
        );

        let valid = DescriptorRecord::from_descriptor_pair(&external, &internal, &address)
            .unwrap()
            .encode();
        assert_eq!(
            DescriptorRecord::parse(&valid.replace(&address, "address with-space")),
            Err(BsmsError::InvalidEncoding)
        );
    }

    #[test]
    fn rejects_invalid_standard_policy_metadata_and_templates() {
        let (external, internal) = descriptors();
        let address = first_address(&external, &internal);
        let mut record =
            DescriptorRecord::from_descriptor_pair(&external, &internal, &address).unwrap();
        record.descriptor_template =
            record
                .descriptor_template
                .replacen("sortedmulti(2,", "sortedmulti(0,", 1);
        assert_eq!(record.standard_policy(), Err(BsmsError::InvalidDescriptor));

        record.descriptor_template = "wpkh(key/0/*)".to_owned();
        assert_eq!(record.descriptor_pair(), Err(BsmsError::UnsupportedPaths));
    }
}
