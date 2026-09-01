use bdk_wallet::bitcoin::bip32::Fingerprint;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::{
    coordination::{DeviceRole, PairingInvitation},
    multisig::{CosignerInput, MultisigWalletDto},
};

#[derive(Debug, Clone)]
pub(crate) struct PendingDesktopPairing {
    pub(super) invitation: PairingInvitation,
    pub(super) accepted_signer: Option<CosignerInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingInvitationDto {
    pub(super) session_id: String,
    pub(super) expires_at: u64,
    pub(super) comparison_code: String,
    pub(super) frames: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedPairingInvitationDto {
    pub(super) invitation_json: String,
    pub(super) comparison_code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingResponseDto {
    pub(super) session_id: String,
    pub(super) fingerprint: String,
    pub(super) xpub_checksum: String,
    pub(super) backup_verified: bool,
    pub(super) comparison_code: String,
    pub(super) frames: Vec<String>,
    pub(super) awaiting_final_policy: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EncryptedEnvelope {
    pub(super) version: u8,
    pub(super) session_id: String,
    pub(super) encrypted_record: String,
}

fn serialize_mnemonic<S: serde::Serializer>(
    words: &Zeroizing<String>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(words.as_str())
}

fn deserialize_mnemonic<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Zeroizing<String>, D::Error> {
    String::deserialize(deserializer).map(Zeroizing::new)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PendingMobileSecret {
    pub(super) version: u8,
    pub(super) invitation: PairingInvitation,
    #[serde(
        serialize_with = "serialize_mnemonic",
        deserialize_with = "deserialize_mnemonic"
    )]
    pub(super) mnemonic: Zeroizing<String>,
    #[serde(default)]
    pub(super) signer_label: String,
    pub(super) backup_verified: bool,
    #[serde(default)]
    pub(super) awaiting_final_policy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoordinationMetadata {
    pub(super) version: u8,
    pub(super) wallet_id: String,
    pub(super) role: DeviceRole,
    pub(super) mobile_signer_fingerprint: Option<String>,
    pub(super) key_protection: String,
    pub(super) paired_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) pairing_session_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilePsbtReviewDto {
    pub(super) revision_id: String,
    pub(super) transaction_id: String,
    pub(super) input_count: usize,
    pub(super) recipients: Vec<MobileOutputDto>,
    pub(super) change: Vec<MobileOutputDto>,
    pub(super) fee_sats: u64,
    pub(super) already_signed_by: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileOutputDto {
    pub(super) address: String,
    pub(super) amount_sats: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedMobilePsbtDto {
    pub(super) revision_id: String,
    pub(super) signer_fingerprint: String,
    pub(super) signed_psbt: String,
    pub(super) frames: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinationStatusDto {
    pub(super) shared: bool,
    pub(super) role: Option<DeviceRole>,
    pub(super) can_sign_on_this_device: bool,
    pub(super) mobile_signer_fingerprint: Option<String>,
    pub(super) key_protection: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMobilePairingDto {
    pub(super) session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileRecoveryRecordDto {
    pub(super) wallet_name: String,
    pub(super) threshold: usize,
    pub(super) signer_count: usize,
    pub(super) mobile_signer_fingerprint: String,
}

#[derive(Debug)]
pub(super) struct ValidatedMobileWallet {
    pub(super) wallet: MultisigWalletDto,
    pub(super) fingerprint: Fingerprint,
    pub(super) descriptor_checksum: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coordination_metadata_keeps_legacy_sidecar_shape() {
        let metadata = CoordinationMetadata {
            version: 1,
            wallet_id: "00000000-0000-0000-0000-000000000001".to_owned(),
            role: DeviceRole::MobileCosigner,
            mobile_signer_fingerprint: Some("c0ffee00".to_owned()),
            key_protection: "argon2id_pin_envelope_testnet_only".to_owned(),
            paired_at: 42,
            pairing_session_id: None,
        };

        assert_eq!(
            serde_json::to_value(&metadata).unwrap(),
            serde_json::json!({
                "version": 1,
                "walletId": "00000000-0000-0000-0000-000000000001",
                "role": "mobile_cosigner",
                "mobileSignerFingerprint": "c0ffee00",
                "keyProtection": "argon2id_pin_envelope_testnet_only",
                "pairedAt": 42
            })
        );
    }

    #[test]
    fn coordination_metadata_still_reads_sidecars_without_pairing_session() {
        let metadata: CoordinationMetadata = serde_json::from_value(serde_json::json!({
            "version": 1,
            "walletId": "00000000-0000-0000-0000-000000000001",
            "role": "mobile_watch_only",
            "mobileSignerFingerprint": null,
            "keyProtection": "none",
            "pairedAt": 42
        }))
        .unwrap();

        assert_eq!(metadata.role, DeviceRole::MobileWatchOnly);
        assert!(metadata.pairing_session_id.is_none());
    }
}
