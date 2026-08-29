//! Accountless desktop/mobile coordination primitives.
//!
//! This module owns bounded BIP129 encrypted setup records, signer identity proofs, and the
//! versioned public wallet record. It deliberately contains no Tauri, persistence, camera, or
//! platform-keychain code so protocol validation can be tested independently.

use aes_gcm::aes::{
    cipher::{generic_array::GenericArray, BlockEncrypt, KeyInit},
    Aes256,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use bdk_wallet::bitcoin::{
    bip32::{DerivationPath, Fingerprint, Xpriv, Xpub},
    hashes::{hmac, sha256, sha256d, sha512, Hash as _, HashEngine as _},
    secp256k1::{ecdsa::RecoverableSignature, Message, Secp256k1},
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use zeroize::{Zeroize, Zeroizing};

pub struct MobileAccount(pub(crate) Xpriv);

impl std::ops::Deref for MobileAccount {
    type Target = Xpriv;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Drop for MobileAccount {
    fn drop(&mut self) {
        self.0.private_key.non_secure_erase();
        self.0.chain_code = [0_u8; 32].into();
    }
}

use crate::{
    bsms::DescriptorRecord,
    build_network::{NAME as NETWORK_NAME, PARAMETERS},
    multisig::{CosignerInput, PolicyInput, MULTISIG_ACCOUNT_PATH},
};

pub const MAX_COORDINATION_RECORD_BYTES: usize = 256 * 1024;
pub const PAIRING_SESSION_SECONDS: u64 = 15 * 60;
const BIP129_PASSWORD: &[u8] = b"No SPOF";
const BIP129_ROUNDS: usize = 2_048;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoordinationError {
    TooLarge,
    InvalidEncoding,
    InvalidToken,
    AuthenticationFailed,
    InvalidKeyRecord,
    InvalidSignature,
    WrongNetwork,
    WrongDerivation,
    DescriptorMismatch,
    UnsupportedVersion,
    ExpiredInvitation,
}

impl CoordinationError {
    pub fn code(self) -> &'static str {
        match self {
            Self::TooLarge => "coordination_payload_too_large",
            Self::InvalidToken | Self::AuthenticationFailed | Self::InvalidSignature => {
                "pairing_authentication_failed"
            }
            Self::WrongNetwork => "wrong_network",
            Self::WrongDerivation => "unsupported_derivation",
            Self::DescriptorMismatch => "wallet_policy_mismatch",
            Self::UnsupportedVersion => "unsupported_coordination_version",
            Self::ExpiredInvitation => "pairing_session_not_found",
            Self::InvalidEncoding | Self::InvalidKeyRecord => "invalid_coordination_payload",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicWalletRecord {
    pub version: u8,
    pub network: String,
    pub wallet_id: String,
    pub wallet_name: String,
    pub role: DeviceRole,
    pub descriptor_record: String,
    pub descriptor_checksum: String,
    pub signers: Vec<CosignerInput>,
    pub mobile_signer_fingerprint: Option<String>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceRole {
    DesktopCoordinator,
    MobileCosigner,
    MobileWatchOnly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairingInvitation {
    pub version: u8,
    pub session_id: String,
    pub network: String,
    pub wallet_name: String,
    pub threshold: usize,
    pub signer_count: usize,
    pub derivation_path: String,
    pub token: String,
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyRecord {
    pub token: String,
    pub fingerprint: Fingerprint,
    pub derivation_path: String,
    pub account_xpub: Xpub,
    pub description: String,
    pub signature: String,
}

impl PairingInvitation {
    pub fn validate(&self, now: u64) -> Result<(), CoordinationError> {
        self.validate_after_acceptance()?;
        if self.expires_at <= now {
            return Err(CoordinationError::ExpiredInvitation);
        }
        if self.expires_at.saturating_sub(now) > PAIRING_SESSION_SECONDS {
            return Err(CoordinationError::InvalidEncoding);
        }
        Ok(())
    }

    /// Validate an invitation that has already produced an authenticated phone signer.
    ///
    /// Freshness gates accepting a new signer, not the subsequent hardware-wallet ceremony.
    /// The final record remains bound to the one-time token, session, signer and exact policy.
    pub fn validate_after_acceptance(&self) -> Result<(), CoordinationError> {
        if self.version != 1 {
            return Err(CoordinationError::UnsupportedVersion);
        }
        if self.network != NETWORK_NAME {
            return Err(CoordinationError::WrongNetwork);
        }
        if self.session_id.is_empty()
            || self.session_id.len() > 64
            || self.wallet_name.trim().is_empty()
            || self.wallet_name.chars().count() > 48
            || self.threshold < 2
            || self.signer_count < 3
            || self.threshold > self.signer_count
            || self.signer_count > 7
            || self.derivation_path != MULTISIG_ACCOUNT_PATH
            || self.expires_at == 0
        {
            return Err(CoordinationError::InvalidEncoding);
        }
        parse_token(&self.token).map(|_| ())
    }
}

impl PublicWalletRecord {
    pub fn validate(&self) -> Result<DescriptorRecord, CoordinationError> {
        if self.version != 2 {
            return Err(CoordinationError::UnsupportedVersion);
        }
        if self.network != NETWORK_NAME {
            return Err(CoordinationError::WrongNetwork);
        }
        if self.wallet_id.is_empty()
            || self.wallet_id.len() > 64
            || self.wallet_name.trim().is_empty()
            || self.wallet_name.chars().count() > 48
            || self.descriptor_checksum.len() != 8
            || !self
                .descriptor_checksum
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric())
        {
            return Err(CoordinationError::InvalidEncoding);
        }
        let record = DescriptorRecord::parse(&self.descriptor_record)
            .map_err(|_| CoordinationError::InvalidEncoding)?;
        if self
            .mobile_signer_fingerprint
            .as_ref()
            .is_some_and(|value| {
                value.len() != 8 || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
        {
            return Err(CoordinationError::InvalidEncoding);
        }
        if self.signers.iter().any(|signer| {
            signer.device_type.as_ref().is_some_and(|device_type| {
                device_type.trim().is_empty()
                    || device_type.len() > 64
                    || !device_type
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
            })
        }) {
            return Err(CoordinationError::InvalidEncoding);
        }
        let mobile_signers = self
            .signers
            .iter()
            .filter(|signer| signer.device_type.as_deref() == Some("groot-mobile"))
            .collect::<Vec<_>>();
        if matches!(self.role, DeviceRole::MobileCosigner)
            && (mobile_signers.len() != 1
                || self.mobile_signer_fingerprint.as_deref()
                    != Some(mobile_signers[0].fingerprint.as_str()))
        {
            return Err(CoordinationError::DescriptorMismatch);
        }
        let (threshold, descriptor_keys) = record
            .standard_policy()
            .map_err(|_| CoordinationError::DescriptorMismatch)?;
        let preview = PolicyInput {
            name: self.wallet_name.clone(),
            threshold,
            cosigners: self.signers.clone(),
        }
        .preview()
        .map_err(|_| CoordinationError::DescriptorMismatch)?;
        if descriptor_keys.len() != self.signers.len()
            || !record
                .matches_descriptor_pair(&preview.external_descriptor, &preview.internal_descriptor)
                .map_err(|_| CoordinationError::DescriptorMismatch)?
        {
            return Err(CoordinationError::DescriptorMismatch);
        }
        Ok(record)
    }
}

impl KeyRecord {
    pub fn parse(plaintext: &str) -> Result<Self, CoordinationError> {
        if plaintext.len() > MAX_COORDINATION_RECORD_BYTES
            || plaintext.contains('\r')
            || plaintext
                .chars()
                .any(|character| character.is_control() && character != '\n')
        {
            return Err(CoordinationError::InvalidEncoding);
        }
        let normalized = plaintext.strip_suffix('\n').unwrap_or(plaintext);
        let lines = normalized.split('\n').collect::<Vec<_>>();
        if lines.len() != 5 || lines.iter().any(|line| line.is_empty()) || lines[0] != "BSMS 1.0" {
            return Err(CoordinationError::InvalidKeyRecord);
        }
        let token = parse_token(lines[1])?;
        let key = lines[2]
            .strip_prefix('[')
            .and_then(|value| value.split_once(']'))
            .ok_or(CoordinationError::InvalidKeyRecord)?;
        let (origin, xpub) = key;
        let (fingerprint, path) = origin
            .split_once('/')
            .ok_or(CoordinationError::InvalidKeyRecord)?;
        let derivation_path = format!("m/{path}");
        if derivation_path != MULTISIG_ACCOUNT_PATH {
            return Err(CoordinationError::WrongDerivation);
        }
        let fingerprint =
            Fingerprint::from_str(fingerprint).map_err(|_| CoordinationError::InvalidKeyRecord)?;
        let account_xpub = Xpub::from_str(xpub).map_err(|_| CoordinationError::InvalidKeyRecord)?;
        if account_xpub.network != PARAMETERS.extended_key_network {
            return Err(CoordinationError::WrongNetwork);
        }
        if lines[3].chars().count() > 80 {
            return Err(CoordinationError::InvalidKeyRecord);
        }
        let signed_text = format!("{}\n{}\n{}\n{}\n", lines[0], lines[1], lines[2], lines[3]);
        verify_legacy_message(&account_xpub, signed_text.as_bytes(), lines[4])?;
        Ok(Self {
            token: hex_encode(&token),
            fingerprint,
            derivation_path,
            account_xpub,
            description: lines[3].to_owned(),
            signature: lines[4].to_owned(),
        })
    }

    pub fn encode_signed(
        token: &str,
        fingerprint: Fingerprint,
        account: &Xpriv,
        description: &str,
    ) -> Result<String, CoordinationError> {
        let token = parse_token(token)?;
        if description.is_empty() || description.chars().count() > 80 || description.contains('\n')
        {
            return Err(CoordinationError::InvalidKeyRecord);
        }
        let secp = Secp256k1::new();
        let account_xpub = Xpub::from_priv(&secp, account);
        let path = MULTISIG_ACCOUNT_PATH
            .strip_prefix("m/")
            .ok_or(CoordinationError::WrongDerivation)?;
        let first_four = format!(
            "BSMS 1.0\n{}\n[{fingerprint}/{path}]{account_xpub}\n{description}\n",
            hex_encode(&token)
        );
        let digest = signed_message_digest(first_four.as_bytes());
        let message = Message::from_digest(digest);
        let signature = secp.sign_ecdsa_recoverable(&message, &account.private_key);
        let (recovery, compact) = signature.serialize_compact();
        let mut encoded = [0_u8; 65];
        encoded[0] = 27 + recovery.to_i32() as u8 + 4;
        encoded[1..].copy_from_slice(&compact);
        // BIP129's encryption vector authenticates the five logical lines without a trailing LF.
        Ok(format!("{first_four}{}", BASE64.encode(encoded)))
    }
}

pub fn derive_mobile_account(
    mnemonic: &bip39::Mnemonic,
) -> Result<(Fingerprint, MobileAccount, Xpub), CoordinationError> {
    // Multisig recovery is intentionally words-only. The local app PIN never enters BIP39.
    let seed = Zeroizing::new(mnemonic.to_seed(""));
    let master = MobileAccount(
        Xpriv::new_master(PARAMETERS.extended_key_network, seed.as_ref())
            .map_err(|_| CoordinationError::InvalidKeyRecord)?,
    );
    let secp = Secp256k1::new();
    let fingerprint = master.fingerprint(&secp);
    let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH)
        .map_err(|_| CoordinationError::WrongDerivation)?;
    let account = MobileAccount(
        master
            .derive_priv(&secp, &path)
            .map_err(|_| CoordinationError::WrongDerivation)?,
    );
    let xpub = Xpub::from_priv(&secp, &account);
    Ok((fingerprint, account, xpub))
}

pub fn encrypt_bip129(token: &str, plaintext: &[u8]) -> Result<String, CoordinationError> {
    if plaintext.is_empty() || plaintext.len() > MAX_COORDINATION_RECORD_BYTES {
        return Err(if plaintext.len() > MAX_COORDINATION_RECORD_BYTES {
            CoordinationError::TooLarge
        } else {
            CoordinationError::InvalidEncoding
        });
    }
    let token = parse_token(token)?;
    let mut key = derive_bip129_key(&token);
    let mac = bip129_mac(&key, &token, plaintext);
    let mut ciphertext = plaintext.to_vec();
    apply_aes_256_ctr(&key, &mac[..16], &mut ciphertext)?;
    key.zeroize();
    let mut encoded = Vec::with_capacity(32 + ciphertext.len());
    encoded.extend_from_slice(&mac);
    encoded.extend_from_slice(&ciphertext);
    Ok(hex_encode(&encoded))
}

pub fn decrypt_bip129(
    token: &str,
    encrypted: &str,
) -> Result<Zeroizing<Vec<u8>>, CoordinationError> {
    if encrypted.len() > (MAX_COORDINATION_RECORD_BYTES + 32) * 2 {
        return Err(CoordinationError::TooLarge);
    }
    let token = parse_token(token)?;
    let decoded = hex_decode(encrypted)?;
    let (provided_mac, ciphertext) = decoded
        .split_at_checked(32)
        .ok_or(CoordinationError::InvalidEncoding)?;
    let mut key = derive_bip129_key(&token);
    let mut plaintext = Zeroizing::new(ciphertext.to_vec());
    apply_aes_256_ctr(&key, &provided_mac[..16], &mut plaintext)?;
    let expected = bip129_mac(&key, &token, &plaintext);
    key.zeroize();
    if !constant_time_equal(provided_mac, &expected) {
        return Err(CoordinationError::AuthenticationFailed);
    }
    Ok(plaintext)
}

fn parse_token(token: &str) -> Result<Vec<u8>, CoordinationError> {
    let decoded = hex_decode(token)?;
    if !matches!(decoded.len(), 8 | 16) {
        return Err(CoordinationError::InvalidToken);
    }
    Ok(decoded)
}

fn derive_bip129_key(token: &[u8]) -> [u8; 32] {
    let mut salt = Vec::with_capacity(token.len() + 4);
    salt.extend_from_slice(token);
    salt.extend_from_slice(&1_u32.to_be_bytes());
    let mut engine = hmac::HmacEngine::<sha512::Hash>::new(BIP129_PASSWORD);
    engine.input(&salt);
    let mut block = hmac::Hmac::<sha512::Hash>::from_engine(engine).to_byte_array();
    let mut accumulated = block;
    for _ in 1..BIP129_ROUNDS {
        let mut engine = hmac::HmacEngine::<sha512::Hash>::new(BIP129_PASSWORD);
        engine.input(&block);
        block = hmac::Hmac::<sha512::Hash>::from_engine(engine).to_byte_array();
        for (left, right) in accumulated.iter_mut().zip(block) {
            *left ^= right;
        }
    }
    let mut result = [0_u8; 32];
    result.copy_from_slice(&accumulated[..32]);
    block.zeroize();
    accumulated.zeroize();
    result
}

fn bip129_mac(key: &[u8; 32], token: &[u8], plaintext: &[u8]) -> [u8; 32] {
    let mut hmac_key = sha256::Hash::hash(key).to_byte_array();
    let mut engine = hmac::HmacEngine::<sha256::Hash>::new(&hmac_key);
    engine.input(hex_encode(token).as_bytes());
    engine.input(plaintext);
    hmac_key.zeroize();
    hmac::Hmac::<sha256::Hash>::from_engine(engine).to_byte_array()
}

fn apply_aes_256_ctr(
    key: &[u8; 32],
    iv: &[u8],
    payload: &mut [u8],
) -> Result<(), CoordinationError> {
    let mut counter: [u8; 16] = iv
        .try_into()
        .map_err(|_| CoordinationError::InvalidEncoding)?;
    let cipher = Aes256::new_from_slice(key).map_err(|_| CoordinationError::InvalidEncoding)?;
    for chunk in payload.chunks_mut(16) {
        let mut block = GenericArray::clone_from_slice(&counter);
        cipher.encrypt_block(&mut block);
        for (byte, mask) in chunk.iter_mut().zip(block) {
            *byte ^= mask;
        }
        for byte in counter.iter_mut().rev() {
            let (next, overflow) = byte.overflowing_add(1);
            *byte = next;
            if !overflow {
                break;
            }
        }
    }
    Ok(())
}

fn verify_legacy_message(
    account_xpub: &Xpub,
    message: &[u8],
    signature: &str,
) -> Result<(), CoordinationError> {
    let decoded = BASE64
        .decode(signature)
        .map_err(|_| CoordinationError::InvalidSignature)?;
    if decoded.len() != 65 || !(31..=34).contains(&decoded[0]) {
        return Err(CoordinationError::InvalidSignature);
    }
    let recovery =
        bdk_wallet::bitcoin::secp256k1::ecdsa::RecoveryId::from_i32(i32::from(decoded[0] - 31))
            .map_err(|_| CoordinationError::InvalidSignature)?;
    let signature = RecoverableSignature::from_compact(&decoded[1..], recovery)
        .map_err(|_| CoordinationError::InvalidSignature)?;
    let message = Message::from_digest(signed_message_digest(message));
    let recovered = Secp256k1::new()
        .recover_ecdsa(&message, &signature)
        .map_err(|_| CoordinationError::InvalidSignature)?;
    if recovered != account_xpub.public_key {
        return Err(CoordinationError::InvalidSignature);
    }
    Ok(())
}

fn signed_message_digest(message: &[u8]) -> [u8; 32] {
    let prefix = b"Bitcoin Signed Message:\n";
    let mut encoded = Vec::with_capacity(prefix.len() + message.len() + 10);
    encode_compact_size(prefix.len(), &mut encoded);
    encoded.extend_from_slice(prefix);
    encode_compact_size(message.len(), &mut encoded);
    encoded.extend_from_slice(message);
    sha256d::Hash::hash(&encoded).to_byte_array()
}

fn encode_compact_size(value: usize, encoded: &mut Vec<u8>) {
    match value {
        0..=252 => encoded.push(value as u8),
        253..=65_535 => {
            encoded.push(253);
            encoded.extend_from_slice(&(value as u16).to_le_bytes());
        }
        65_536..=4_294_967_295 => {
            encoded.push(254);
            encoded.extend_from_slice(&(value as u32).to_le_bytes());
        }
        _ => {
            encoded.push(255);
            encoded.extend_from_slice(&(value as u64).to_le_bytes());
        }
    }
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        result.push(HEX[(byte >> 4) as usize] as char);
        result.push(HEX[(byte & 0x0f) as usize] as char);
    }
    result
}

fn hex_decode(value: &str) -> Result<Vec<u8>, CoordinationError> {
    if value.is_empty()
        || !value.len().is_multiple_of(2)
        || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(CoordinationError::InvalidEncoding);
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char)
                .to_digit(16)
                .ok_or(CoordinationError::InvalidEncoding)?;
            let low = (pair[1] as char)
                .to_digit(16)
                .ok_or(CoordinationError::InvalidEncoding)?;
            Ok(((high << 4) | low) as u8)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::multisig::CosignerSource;
    use bdk_wallet::bitcoin::{bip32::DerivationPath, Network, NetworkKind};
    use bdk_wallet::miniscript::{Descriptor, DescriptorPublicKey};
    use bdk_wallet::{KeychainKind, Wallet};
    use bip39::Mnemonic;

    type InvitationMutation = Box<dyn Fn(&mut PairingInvitation)>;
    type WalletRecordMutation = Box<dyn Fn(&mut PublicWalletRecord)>;

    fn invitation() -> PairingInvitation {
        PairingInvitation {
            version: 1,
            session_id: "session-1".to_owned(),
            network: NETWORK_NAME.to_owned(),
            wallet_name: "Family vault".to_owned(),
            threshold: 2,
            signer_count: 3,
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            token: "00112233445566778899aabbccddeeff".to_owned(),
            expires_at: 1_900,
        }
    }

    fn descriptor_record() -> String {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
        let mut keys = (1_u8..=3)
            .map(|index| {
                let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).unwrap();
                let fingerprint = master.fingerprint(&secp);
                let account = master.derive_priv(&secp, &path).unwrap();
                (fingerprint, Xpub::from_priv(&secp, &account))
            })
            .collect::<Vec<_>>();
        keys.sort_by_key(|(fingerprint, _)| fingerprint.to_string());
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
        let external = make(0);
        let internal = make(1);
        let mut wallet = Wallet::create(external.clone(), internal.clone())
            .network(Network::Regtest)
            .create_wallet_no_persist()
            .unwrap();
        let address = wallet
            .reveal_next_address(KeychainKind::External)
            .address
            .to_string();
        DescriptorRecord::from_descriptor_pair(&external, &internal, &address)
            .unwrap()
            .encode()
    }

    fn public_wallet_record() -> PublicWalletRecord {
        let descriptor_record = descriptor_record();
        let descriptor = DescriptorRecord::parse(&descriptor_record).unwrap();
        let (_, keys) = descriptor.standard_policy().unwrap();
        let signers = keys
            .into_iter()
            .enumerate()
            .map(|(index, key)| CosignerInput {
                id: format!("signer-{index}"),
                label: if index == 0 {
                    "This phone".to_owned()
                } else {
                    format!("Hardware signer {index}")
                },
                fingerprint: key.fingerprint.to_string(),
                xpub: key.xpub.to_string(),
                derivation_path: key.derivation_path,
                source: if index == 0 {
                    CosignerSource::Qr
                } else {
                    CosignerSource::Usb
                },
                device_type: Some(if index == 0 {
                    "groot-mobile".to_owned()
                } else {
                    "test-hardware".to_owned()
                }),
            })
            .collect::<Vec<_>>();
        PublicWalletRecord {
            version: 2,
            network: NETWORK_NAME.to_owned(),
            wallet_id: "wallet-1".to_owned(),
            wallet_name: "Family vault".to_owned(),
            role: DeviceRole::MobileCosigner,
            descriptor_record,
            descriptor_checksum: "a1b2c3d4".to_owned(),
            mobile_signer_fingerprint: Some(signers[0].fingerprint.clone()),
            signers,
            created_at: 1,
        }
    }

    #[test]
    fn bip129_standard_vector_matches_key_mac_and_ciphertext() {
        let token = "a54044308ceac9b7";
        let plaintext = concat!(
            "BSMS 1.0\n",
            "a54044308ceac9b7\n",
            "[b7868815/48'/0'/0'/2']xpub6FA5rfxJc94K1kNtxRby1hoHwi7YDyTWwx1KUR3FwskaF6HzCbZMz3zQwGnCqdiFeMTPV3YneTGS2YQPiuNYsSvtggWWMQpEJD4jXU7ZzEh\n",
            "Signer 1 key\n",
            "H8DYht5P6ko0bQqDV6MtUxpzBSK+aVHxbvMavA5byvLrOlCEGmO1WFR7k2wu42J6dxXD8vrmDQSnGq5MTMMbZ98="
        );
        let key = derive_bip129_key(&hex_decode(token).unwrap());
        assert_eq!(
            hex_encode(&key),
            "7673ffd9efd70336a5442eda0b31457f7b6cdf7b42fe17f274434df55efa9839"
        );
        let encrypted = encrypt_bip129(token, plaintext.as_bytes()).unwrap();
        assert!(encrypted
            .starts_with("fbdbdb64e6a8231c342131d9f13dcd5a954b4c5021658fa5afcb3fc74dc82706"));
        assert_eq!(
            decrypt_bip129(token, &encrypted).unwrap().as_slice(),
            plaintext.as_bytes()
        );
    }

    #[test]
    fn words_only_bip48_key_record_round_trips() {
        let mnemonic = Mnemonic::parse("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about").unwrap();
        let (fingerprint, account, xpub) = derive_mobile_account(&mnemonic).unwrap();
        let encoded = KeyRecord::encode_signed(
            "00112233445566778899aabbccddeeff",
            fingerprint,
            &account,
            "Groot mobile cosigner",
        )
        .unwrap();
        let parsed = KeyRecord::parse(&encoded).unwrap();
        assert_eq!(parsed.account_xpub, xpub);
        assert_eq!(parsed.fingerprint, fingerprint);
        assert_eq!(parsed.derivation_path, MULTISIG_ACCOUNT_PATH);
    }

    #[test]
    fn tampering_fails_before_plaintext_is_released() {
        let token = "00112233445566778899aabbccddeeff";
        let mut encrypted = encrypt_bip129(token, b"bounded record").unwrap();
        encrypted.replace_range(70..72, "00");
        assert_eq!(
            decrypt_bip129(token, &encrypted),
            Err(CoordinationError::AuthenticationFailed)
        );
    }

    #[test]
    fn account_network_is_compiled_network_kind() {
        let mnemonic = Mnemonic::parse("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about").unwrap();
        let (_, _, xpub) = derive_mobile_account(&mnemonic).unwrap();
        assert_eq!(xpub.network, NetworkKind::Test);
    }

    #[test]
    fn every_error_code_is_stable() {
        let cases = [
            (
                CoordinationError::TooLarge,
                "coordination_payload_too_large",
            ),
            (
                CoordinationError::InvalidEncoding,
                "invalid_coordination_payload",
            ),
            (
                CoordinationError::InvalidToken,
                "pairing_authentication_failed",
            ),
            (
                CoordinationError::AuthenticationFailed,
                "pairing_authentication_failed",
            ),
            (
                CoordinationError::InvalidKeyRecord,
                "invalid_coordination_payload",
            ),
            (
                CoordinationError::InvalidSignature,
                "pairing_authentication_failed",
            ),
            (CoordinationError::WrongNetwork, "wrong_network"),
            (CoordinationError::WrongDerivation, "unsupported_derivation"),
            (
                CoordinationError::DescriptorMismatch,
                "wallet_policy_mismatch",
            ),
            (
                CoordinationError::UnsupportedVersion,
                "unsupported_coordination_version",
            ),
            (
                CoordinationError::ExpiredInvitation,
                "pairing_session_not_found",
            ),
        ];
        for (error, expected) in cases {
            assert_eq!(error.code(), expected);
        }
    }

    #[test]
    fn invitations_validate_every_bound_and_identity() {
        let valid = invitation();
        assert_eq!(valid.validate(1_000), Ok(()));

        let mutations: Vec<InvitationMutation> = vec![
            Box::new(|value| value.version = 2),
            Box::new(|value| value.network = "wrong".to_owned()),
            Box::new(|value| value.session_id.clear()),
            Box::new(|value| value.session_id = "s".repeat(65)),
            Box::new(|value| value.wallet_name = " ".to_owned()),
            Box::new(|value| value.wallet_name = "w".repeat(49)),
            Box::new(|value| value.threshold = 1),
            Box::new(|value| value.signer_count = 2),
            Box::new(|value| value.threshold = 4),
            Box::new(|value| value.signer_count = 8),
            Box::new(|value| value.derivation_path = "m/48'/1'/1'/2'".to_owned()),
            Box::new(|value| value.expires_at = 1_000),
            Box::new(|value| value.expires_at = 1_901),
        ];
        for mutate in mutations {
            let mut value = valid.clone();
            mutate(&mut value);
            assert!(value.validate(1_000).is_err());
        }
        for token in ["", "00", "not-hex"] {
            let mut value = valid.clone();
            value.token = token.to_owned();
            assert!(value.validate(1_000).is_err());
        }
    }

    #[test]
    fn authenticated_invitation_can_finish_after_its_acceptance_window() {
        let accepted = invitation();
        assert!(accepted.validate(1_901).is_err());
        assert_eq!(accepted.validate_after_acceptance(), Ok(()));

        let mut malformed = accepted;
        malformed.token = "not-hex".to_owned();
        assert!(malformed.validate_after_acceptance().is_err());
    }

    #[test]
    fn public_wallet_record_rejects_substitution_and_malformed_identity() {
        let valid = public_wallet_record();
        assert_eq!(valid.validate().map(|_| ()), Ok(()));
        let round_trip: PublicWalletRecord =
            serde_json::from_slice(&serde_json::to_vec(&valid).unwrap()).unwrap();
        assert_eq!(round_trip.signers, valid.signers);
        assert_eq!(round_trip, valid);
        let mutations: Vec<WalletRecordMutation> = vec![
            Box::new(|value| value.version = 1),
            Box::new(|value| value.network = "wrong".to_owned()),
            Box::new(|value| value.wallet_id.clear()),
            Box::new(|value| value.wallet_id = "w".repeat(65)),
            Box::new(|value| value.wallet_name = " ".to_owned()),
            Box::new(|value| value.wallet_name = "w".repeat(49)),
            Box::new(|value| value.descriptor_checksum = "short".to_owned()),
            Box::new(|value| value.descriptor_checksum = "abcd-123".to_owned()),
            Box::new(|value| value.descriptor_record = "not a descriptor".to_owned()),
            Box::new(|value| value.mobile_signer_fingerprint = Some("short".to_owned())),
            Box::new(|value| value.mobile_signer_fingerprint = Some("zzzzzzzz".to_owned())),
            Box::new(|value| value.signers[0].label.clear()),
            Box::new(|value| value.signers[0].device_type = Some("bad device".to_owned())),
            Box::new(|value| value.signers[1].device_type = Some("groot-mobile".to_owned())),
            Box::new(|value| value.signers[0].fingerprint = "deadbeef".to_owned()),
            Box::new(|value| value.signers.pop().map(drop).unwrap()),
        ];
        for mutate in mutations {
            let mut value = valid.clone();
            mutate(&mut value);
            assert!(value.validate().is_err());
        }
        let mut without_mobile = valid;
        without_mobile.role = DeviceRole::DesktopCoordinator;
        without_mobile.mobile_signer_fingerprint = None;
        assert!(without_mobile.validate().is_ok());
    }

    #[test]
    fn key_record_rejects_malformed_origins_keys_descriptions_and_signatures() {
        let mnemonic = Mnemonic::parse("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about").unwrap();
        let (fingerprint, account, _) = derive_mobile_account(&mnemonic).unwrap();
        let token = "00112233445566778899aabbccddeeff";
        let valid = KeyRecord::encode_signed(token, fingerprint, &account, "Phone").unwrap();
        assert!(KeyRecord::parse(&format!("{valid}\n")).is_ok());

        for malformed in [
            "",
            "BSMS 1.0\r\ninvalid",
            "BSMS 1.0\n\0\nx\ny\nz",
            "BSMS 0.9\na\nb\nc\nd",
            "BSMS 1.0\na\n\nc\nd",
            "BSMS 1.0\n0011223344556677\nmissing-origin\nPhone\nsig",
            "BSMS 1.0\n0011223344556677\n[deadbeef]xpub\nPhone\nsig",
            "BSMS 1.0\n0011223344556677\n[nope/48'/1'/0'/2']xpub\nPhone\nsig",
        ] {
            assert!(KeyRecord::parse(malformed).is_err());
        }
        assert_eq!(
            KeyRecord::parse(&"x".repeat(MAX_COORDINATION_RECORD_BYTES + 1)),
            Err(CoordinationError::InvalidEncoding)
        );

        let wrong_path = valid.replace("/48'/1'/0'/2']", "/48'/1'/1'/2']");
        assert_eq!(
            KeyRecord::parse(&wrong_path),
            Err(CoordinationError::WrongDerivation)
        );
        let invalid_xpub = valid.replacen("tpub", "xxxx", 1);
        assert_eq!(
            KeyRecord::parse(&invalid_xpub),
            Err(CoordinationError::InvalidKeyRecord)
        );
        let long_description = valid.replace("\nPhone\n", &format!("\n{}\n", "p".repeat(81)));
        assert_eq!(
            KeyRecord::parse(&long_description),
            Err(CoordinationError::InvalidKeyRecord)
        );
        let bad_base64 = valid.rsplit_once('\n').unwrap().0.to_owned() + "\nnot-base64";
        assert_eq!(
            KeyRecord::parse(&bad_base64),
            Err(CoordinationError::InvalidSignature)
        );
        let short_signature = valid.rsplit_once('\n').unwrap().0.to_owned() + "\nAA==";
        assert_eq!(
            KeyRecord::parse(&short_signature),
            Err(CoordinationError::InvalidSignature)
        );

        assert_eq!(
            KeyRecord::encode_signed(token, fingerprint, &account, ""),
            Err(CoordinationError::InvalidKeyRecord)
        );
        assert_eq!(
            KeyRecord::encode_signed(token, fingerprint, &account, &"p".repeat(81)),
            Err(CoordinationError::InvalidKeyRecord)
        );
        assert_eq!(
            KeyRecord::encode_signed(token, fingerprint, &account, "bad\nname"),
            Err(CoordinationError::InvalidKeyRecord)
        );

        let mainnet_master = Xpriv::new_master(NetworkKind::Main, &[9; 32]).unwrap();
        let mainnet_account = mainnet_master
            .derive_priv(
                &Secp256k1::new(),
                &DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap(),
            )
            .unwrap();
        let mainnet_record =
            KeyRecord::encode_signed(token, fingerprint, &mainnet_account, "Phone").unwrap();
        assert_eq!(
            KeyRecord::parse(&mainnet_record),
            Err(CoordinationError::WrongNetwork)
        );

        let (_, other_account, _) = derive_mobile_account(
            &Mnemonic::parse(
                "legal winner thank year wave sausage worth useful legal winner thank yellow",
            )
            .unwrap(),
        )
        .unwrap();
        let other = KeyRecord::encode_signed(token, fingerprint, &other_account, "Phone").unwrap();
        let other_signature = other.rsplit_once('\n').unwrap().1;
        let substituted = valid.rsplit_once('\n').unwrap().0.to_owned() + "\n" + other_signature;
        assert_eq!(
            KeyRecord::parse(&substituted),
            Err(CoordinationError::InvalidSignature)
        );
    }

    #[test]
    fn encryption_and_helpers_reject_all_malformed_boundaries() {
        let token = "00112233445566778899aabbccddeeff";
        assert_eq!(
            encrypt_bip129(token, b""),
            Err(CoordinationError::InvalidEncoding)
        );
        assert_eq!(
            encrypt_bip129(token, &vec![0; MAX_COORDINATION_RECORD_BYTES + 1]),
            Err(CoordinationError::TooLarge)
        );
        assert_eq!(
            encrypt_bip129("00", b"x"),
            Err(CoordinationError::InvalidToken)
        );
        assert_eq!(
            decrypt_bip129(token, &"00".repeat(MAX_COORDINATION_RECORD_BYTES + 33)),
            Err(CoordinationError::TooLarge)
        );
        assert_eq!(
            decrypt_bip129(token, "00"),
            Err(CoordinationError::InvalidEncoding)
        );
        assert_eq!(
            decrypt_bip129(token, "not-hex"),
            Err(CoordinationError::InvalidEncoding)
        );
        assert_eq!(parse_token("0011223344556677").unwrap().len(), 8);
        assert!(!constant_time_equal(&[1], &[1, 2]));
        assert!(!constant_time_equal(&[1], &[2]));
        assert!(constant_time_equal(&[1, 2], &[1, 2]));
        assert_eq!(hex_encode(&[0, 0xab, 0xff]), "00abff");
        for invalid in ["", "0", "gg"] {
            assert_eq!(hex_decode(invalid), Err(CoordinationError::InvalidEncoding));
        }
        assert_eq!(
            apply_aes_256_ctr(&[0; 32], &[0; 15], &mut [0; 1]),
            Err(CoordinationError::InvalidEncoding)
        );

        for (value, expected_prefix, expected_len) in [
            (252, 252, 1),
            (253, 253, 3),
            (65_536, 254, 5),
            (4_294_967_296, 255, 9),
        ] {
            let mut encoded = Vec::new();
            encode_compact_size(value, &mut encoded);
            assert_eq!(encoded[0], expected_prefix);
            assert_eq!(encoded.len(), expected_len);
        }
    }
}
