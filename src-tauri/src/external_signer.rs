use bdk_wallet::{
    bitcoin::bip32::{DerivationPath, Fingerprint, Xpub},
    descriptor::{Descriptor, DescriptorPublicKey},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::str::FromStr;

use crate::build_network::parameters;
pub use crate::build_network::singlesig_account_path;
pub const MAX_IMPORT_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignerSource {
    Usb,
    Qr,
    File,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSignerInput {
    pub label: String,
    pub fingerprint: String,
    pub xpub: String,
    pub derivation_path: String,
    pub source: SignerSource,
    pub device_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSignerWallet {
    pub version: u8,
    pub name: String,
    pub signer: ExternalSignerInput,
    pub external_descriptor: String,
    pub internal_descriptor: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalSignerError {
    TooLarge,
    PrivateMaterial,
    InvalidFormat,
    InvalidLabel,
    InvalidFingerprint,
    InvalidDerivation,
    WrongNetwork,
    InvalidDescriptor,
}

impl ExternalSignerError {
    pub fn code(self) -> &'static str {
        match self {
            Self::TooLarge => "import_too_large",
            Self::PrivateMaterial => "private_material_rejected",
            Self::InvalidFormat => "invalid_signer_import",
            Self::InvalidLabel => "invalid_label",
            Self::InvalidFingerprint => "invalid_fingerprint",
            Self::InvalidDerivation => "invalid_derivation_path",
            Self::WrongNetwork => "wrong_network",
            Self::InvalidDescriptor => "invalid_descriptor",
        }
    }
}

impl ExternalSignerInput {
    pub fn validate(&self) -> Result<(), ExternalSignerError> {
        if self.label.trim().is_empty()
            || self.label.chars().count() > 48
            || crate::wallet::label_has_unsafe_formatting(&self.label)
        {
            return Err(ExternalSignerError::InvalidLabel);
        }
        Fingerprint::from_str(self.fingerprint.trim())
            .map_err(|_| ExternalSignerError::InvalidFingerprint)?;
        let derivation = normalize_path(&self.derivation_path)?;
        if derivation != singlesig_account_path() {
            return Err(ExternalSignerError::InvalidDerivation);
        }
        let xpub =
            Xpub::from_str(self.xpub.trim()).map_err(|_| ExternalSignerError::InvalidFormat)?;
        if xpub.network != parameters().extended_key_network {
            return Err(ExternalSignerError::WrongNetwork);
        }
        descriptors(self)?;
        Ok(())
    }
}

pub fn descriptors(input: &ExternalSignerInput) -> Result<(String, String), ExternalSignerError> {
    reject_private_material(&input.xpub)?;
    let fingerprint = input.fingerprint.trim().to_ascii_lowercase();
    let xpub = input.xpub.trim();
    let origin = singlesig_account_path()
        .strip_prefix("m/")
        .ok_or(ExternalSignerError::InvalidDerivation)?;
    let external = canonical_descriptor(&format!("wpkh([{fingerprint}/{origin}]{xpub}/0/*)"))?;
    let internal = canonical_descriptor(&format!("wpkh([{fingerprint}/{origin}]{xpub}/1/*)"))?;
    Ok((external, internal))
}

pub fn parse_import(
    encoded: &str,
    label: &str,
    source: SignerSource,
) -> Result<ExternalSignerInput, ExternalSignerError> {
    if encoded.len() > MAX_IMPORT_BYTES {
        return Err(ExternalSignerError::TooLarge);
    }
    reject_private_material(encoded)?;
    if crate::wallet::validate_label_formatting(label).is_err() {
        return Err(ExternalSignerError::InvalidLabel);
    }
    let trimmed = encoded.trim();
    let (fingerprint, xpub, path) = if trimmed.starts_with('{') {
        let value: Value =
            serde_json::from_str(trimmed).map_err(|_| ExternalSignerError::InvalidFormat)?;
        parse_json(&value)?
    } else if trimmed.starts_with("wpkh(") {
        parse_descriptor(trimmed)?
    } else {
        return Err(ExternalSignerError::InvalidFormat);
    };
    let input = ExternalSignerInput {
        label: label.trim().to_owned(),
        fingerprint: fingerprint.to_ascii_lowercase(),
        xpub,
        derivation_path: normalize_path(&path)?,
        source,
        device_type: None,
    };
    input.validate()?;
    Ok(input)
}

fn reject_private_material(value: &str) -> Result<(), ExternalSignerError> {
    let lower = value.to_ascii_lowercase();
    if [
        "xprv",
        "tprv",
        "mnemonic",
        "seed",
        "recovery words",
        "private_key",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
    {
        Err(ExternalSignerError::PrivateMaterial)
    } else {
        Ok(())
    }
}

fn canonical_descriptor(value: &str) -> Result<String, ExternalSignerError> {
    let descriptor = Descriptor::<DescriptorPublicKey>::from_str(value)
        .map_err(|_| ExternalSignerError::InvalidDescriptor)?;
    descriptor
        .sanity_check()
        .map_err(|_| ExternalSignerError::InvalidDescriptor)?;
    let canonical = descriptor.to_string();
    if canonical.contains("prv") {
        return Err(ExternalSignerError::PrivateMaterial);
    }
    Ok(canonical)
}

fn normalize_path(value: &str) -> Result<String, ExternalSignerError> {
    let normalized = value.trim().replace(['h', 'H'], "'");
    DerivationPath::from_str(&normalized).map_err(|_| ExternalSignerError::InvalidDerivation)?;
    Ok(normalized)
}

fn string_at<'a>(value: &'a Value, paths: &[&[&str]]) -> Option<&'a str> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current.as_str()
    })
}

fn parse_json(value: &Value) -> Result<(String, String, String), ExternalSignerError> {
    if let Some(descriptor) = string_at(
        value,
        &[
            &["descriptor"],
            &["output_descriptor"],
            &["bip84", "descriptor"],
            &["keystore", "descriptor"],
        ],
    ) {
        return parse_descriptor(descriptor);
    }
    let fingerprint = string_at(
        value,
        &[
            &["fingerprint"],
            &["xfp"],
            &["root_fingerprint"],
            &["keystore", "root_fingerprint"],
            &["bip84", "xfp"],
        ],
    )
    .ok_or(ExternalSignerError::InvalidFormat)?;
    let xpub = string_at(
        value,
        &[
            &["xpub"],
            &["ExtPubKey"],
            &["keystore", "xpub"],
            &["bip84", "xpub"],
        ],
    )
    .ok_or(ExternalSignerError::InvalidFormat)?;
    let path = string_at(
        value,
        &[
            &["derivationPath"],
            &["derivation_path"],
            &["deriv"],
            &["path"],
            &["keystore", "derivation"],
            &["bip84", "deriv"],
        ],
    )
    .ok_or(ExternalSignerError::InvalidDerivation)?;
    Ok((fingerprint.to_owned(), xpub.to_owned(), path.to_owned()))
}

fn parse_descriptor(value: &str) -> Result<(String, String, String), ExternalSignerError> {
    let canonical = canonical_descriptor(value)?;
    if !canonical.starts_with("wpkh([") {
        return Err(ExternalSignerError::InvalidDescriptor);
    }
    let origin_end = canonical
        .find(']')
        .ok_or(ExternalSignerError::InvalidDescriptor)?;
    let origin = &canonical[6..origin_end];
    let (fingerprint, path) = origin
        .split_once('/')
        .ok_or(ExternalSignerError::InvalidDescriptor)?;
    let key_tail = &canonical[origin_end + 1..];
    let xpub_end = key_tail
        .find('/')
        .ok_or(ExternalSignerError::InvalidDescriptor)?;
    let xpub = &key_tail[..xpub_end];
    let suffix = key_tail[xpub_end..]
        .split('#')
        .next()
        .ok_or(ExternalSignerError::InvalidDescriptor)?;
    if !matches!(suffix, "/0/*)" | "/1/*)" | "/<0;1>/*)" | "/<1;0>/*)") {
        return Err(ExternalSignerError::InvalidDescriptor);
    }
    Ok((fingerprint.to_owned(), xpub.to_owned(), format!("m/{path}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::secp256k1::Secp256k1;
    use bdk_wallet::bitcoin::{bip32::Xpriv, NetworkKind};

    fn test_xpub() -> String {
        let master = Xpriv::new_master(parameters().extended_key_network, &[7_u8; 64]).unwrap();
        let derived = master
            .derive_priv(
                &Secp256k1::new(),
                &DerivationPath::from_str(singlesig_account_path()).unwrap(),
            )
            .unwrap();
        Xpub::from_priv(&Secp256k1::new(), &derived).to_string()
    }

    #[test]
    fn parses_descriptor_and_common_json_exports() {
        let xpub = test_xpub();
        let descriptor = format!("wpkh([d34db33f/84'/1'/0']{xpub}/<0;1>/*)");
        let parsed = parse_import(&descriptor, "Passport", SignerSource::Qr).unwrap();
        assert_eq!(parsed.fingerprint, "d34db33f");
        assert_eq!(parsed.derivation_path, singlesig_account_path());
        let json =
            serde_json::json!({"xfp":"D34DB33F","bip84":{"xpub":xpub,"deriv":"m/84h/1h/0h"}});
        let parsed = parse_import(&json.to_string(), "Cold storage", SignerSource::File).unwrap();
        assert_eq!(parsed.fingerprint, "d34db33f");
        assert!(descriptors(&parsed)
            .unwrap()
            .0
            .starts_with("wpkh([d34db33f/84'/1'/0']tpub"));
    }

    #[test]
    fn rejects_private_material_wrong_paths_and_oversized_inputs() {
        assert_eq!(
            parse_import("{\"seed\":\"secret\"}", "x", SignerSource::File),
            Err(ExternalSignerError::PrivateMaterial)
        );
        let xpub = test_xpub();
        let descriptor = format!("wpkh([d34db33f/84'/1'/0']{xpub}/<0;1>/*)");
        assert_eq!(
            parse_import(&descriptor, "Signer\u{e0020}hidden", SignerSource::File),
            Err(ExternalSignerError::InvalidLabel)
        );
        let bad = serde_json::json!({"fingerprint":"d34db33f","xpub":xpub,"path":"m/44'/1'/0'"});
        assert_eq!(
            parse_import(&bad.to_string(), "x", SignerSource::File),
            Err(ExternalSignerError::InvalidDerivation)
        );
        assert_eq!(
            parse_import(&"x".repeat(MAX_IMPORT_BYTES + 1), "x", SignerSource::File),
            Err(ExternalSignerError::TooLarge)
        );
    }

    #[test]
    fn canonical_descriptors_create_a_public_only_bdk_wallet() {
        let input = ExternalSignerInput {
            label: "Jade".into(),
            fingerprint: "d34db33f".into(),
            xpub: test_xpub(),
            derivation_path: singlesig_account_path().into(),
            source: SignerSource::Usb,
            device_type: Some("jade".into()),
        };
        let (external, internal) = descriptors(&input).unwrap();
        assert!(!external.contains("prv"));
        let mut wallet = bdk_wallet::Wallet::create(external, internal)
            .network(bdk_wallet::bitcoin::Network::Regtest)
            .create_wallet_no_persist()
            .unwrap();
        assert!(wallet
            .reveal_next_address(bdk_wallet::KeychainKind::External)
            .address
            .to_string()
            .starts_with("bcrt1q"));
    }

    #[test]
    fn exported_receive_descriptor_reconstructs_the_same_wallet() {
        let input = ExternalSignerInput {
            label: "Ledger".into(),
            fingerprint: "d34db33f".into(),
            xpub: test_xpub(),
            derivation_path: singlesig_account_path().into(),
            source: SignerSource::Usb,
            device_type: Some("ledger".into()),
        };
        let original = descriptors(&input).unwrap();
        let recovered = parse_import(&original.0, "Recovered", SignerSource::File).unwrap();
        assert_eq!(descriptors(&recovered).unwrap(), original);
    }

    #[test]
    fn every_error_code_and_validation_branch_is_stable() {
        let cases = [
            (ExternalSignerError::TooLarge, "import_too_large"),
            (
                ExternalSignerError::PrivateMaterial,
                "private_material_rejected",
            ),
            (ExternalSignerError::InvalidFormat, "invalid_signer_import"),
            (ExternalSignerError::InvalidLabel, "invalid_label"),
            (
                ExternalSignerError::InvalidFingerprint,
                "invalid_fingerprint",
            ),
            (
                ExternalSignerError::InvalidDerivation,
                "invalid_derivation_path",
            ),
            (ExternalSignerError::WrongNetwork, "wrong_network"),
            (ExternalSignerError::InvalidDescriptor, "invalid_descriptor"),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code);
        }

        let valid = ExternalSignerInput {
            label: "Signer".into(),
            fingerprint: "d34db33f".into(),
            xpub: test_xpub(),
            derivation_path: singlesig_account_path().into(),
            source: SignerSource::Manual,
            device_type: None,
        };
        let mut candidate = valid.clone();
        candidate.label.clear();
        assert_eq!(candidate.validate(), Err(ExternalSignerError::InvalidLabel));
        candidate = valid.clone();
        candidate.label = "Ledger\u{202e}evil".into();
        assert_eq!(candidate.validate(), Err(ExternalSignerError::InvalidLabel));
        candidate = valid.clone();
        candidate.label = "line\nbreak".into();
        assert_eq!(candidate.validate(), Err(ExternalSignerError::InvalidLabel));
        candidate = valid.clone();
        candidate.fingerprint = "nope".into();
        assert_eq!(
            candidate.validate(),
            Err(ExternalSignerError::InvalidFingerprint)
        );
        candidate = valid.clone();
        candidate.xpub = "not-an-xpub".into();
        assert_eq!(
            candidate.validate(),
            Err(ExternalSignerError::InvalidFormat)
        );

        // The wrong-network assertion must hold on every compiled network:
        // an opposite-kind extended key is always rejected, while the
        // compiled-network key in `valid` continues to pass. This keeps the
        // regression honest if a future mainnet build ever enables it.
        #[cfg(groot_network = "mainnet")]
        let wrong_kind = NetworkKind::Test;
        #[cfg(not(groot_network = "mainnet"))]
        let wrong_kind = NetworkKind::Main;
        let wrong = Xpriv::new_master(wrong_kind, &[9_u8; 64]).unwrap();
        candidate = valid;
        candidate.xpub = Xpub::from_priv(&Secp256k1::new(), &wrong).to_string();
        assert_eq!(candidate.validate(), Err(ExternalSignerError::WrongNetwork));
    }

    #[test]
    fn descriptor_import_rejects_wrong_wrappers_suffixes_and_unrecognized_text() {
        let xpub = test_xpub();
        let descriptor = format!("wpkh([d34db33f/84'/1'/0']{xpub}/0/*)");
        let wrapped = serde_json::json!({"descriptor": descriptor});
        assert!(parse_import(&wrapped.to_string(), "JSON descriptor", SignerSource::File).is_ok());
        assert_eq!(
            parse_import("not a public export", "x", SignerSource::Manual),
            Err(ExternalSignerError::InvalidFormat)
        );
        assert_eq!(
            parse_import(
                &format!("sh(wpkh([d34db33f/84'/1'/0']{xpub}/0/*))"),
                "x",
                SignerSource::Manual
            ),
            Err(ExternalSignerError::InvalidFormat)
        );
        assert_eq!(
            parse_descriptor(&format!("pkh([d34db33f/84'/1'/0']{xpub}/0/*)")),
            Err(ExternalSignerError::InvalidDescriptor)
        );
        assert_eq!(
            parse_import(
                &format!("wpkh([d34db33f/84'/1'/0']{xpub}/2/*)"),
                "x",
                SignerSource::Manual
            ),
            Err(ExternalSignerError::InvalidDescriptor)
        );
    }
}
