use super::*;
use crate::{
    coordination::{
        decrypt_bip129, derive_mobile_account, encrypt_bip129, CoordinationError, DeviceRole,
        KeyRecord, MobileAccount, PairingInvitation, PublicWalletRecord, PAIRING_SESSION_SECONDS,
    },
    coordination_transport::{self, CoordinationUrError, CoordinationUrType},
};

const FRAGMENT_BYTES: usize = 220;
const MOBILE_RESPONSE_FRAGMENT_BYTES: usize = 160;
const MOBILE_DEVICE_TYPE: &str = "groot-mobile";

#[derive(Debug, Clone)]
pub(super) struct PendingDesktopPairing {
    invitation: PairingInvitation,
    accepted_signer: Option<CosignerInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingInvitationDto {
    session_id: String,
    expires_at: u64,
    comparison_code: String,
    frames: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedPairingInvitationDto {
    invitation_json: String,
    comparison_code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingResponseDto {
    session_id: String,
    fingerprint: String,
    xpub_checksum: String,
    backup_verified: bool,
    comparison_code: String,
    frames: Vec<String>,
    awaiting_final_policy: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EncryptedEnvelope {
    version: u8,
    session_id: String,
    encrypted_record: String,
}

fn serialize_mc<S: serde::Serializer>(
    words: &Zeroizing<String>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(words.as_str())
}

fn deserialize_mc<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Zeroizing<String>, D::Error> {
    String::deserialize(deserializer).map(Zeroizing::new)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PendingMobileSecret {
    version: u8,
    invitation: PairingInvitation,
    #[serde(serialize_with = "serialize_mc", deserialize_with = "deserialize_mc")]
    mnemonic: Zeroizing<String>,
    #[serde(default)]
    signer_label: String,
    backup_verified: bool,
    #[serde(default)]
    awaiting_final_policy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoordinationMetadata {
    version: u8,
    wallet_id: String,
    role: DeviceRole,
    mobile_signer_fingerprint: Option<String>,
    key_protection: String,
    paired_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pairing_session_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilePsbtReviewDto {
    revision_id: String,
    transaction_id: String,
    input_count: usize,
    recipients: Vec<MobileOutputDto>,
    change: Vec<MobileOutputDto>,
    fee_sats: u64,
    already_signed_by: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileOutputDto {
    address: String,
    amount_sats: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedMobilePsbtDto {
    revision_id: String,
    signer_fingerprint: String,
    signed_psbt: String,
    frames: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinationStatusDto {
    shared: bool,
    role: Option<DeviceRole>,
    can_sign_on_this_device: bool,
    mobile_signer_fingerprint: Option<String>,
    key_protection: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMobilePairingDto {
    session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileRecoveryRecordDto {
    wallet_name: String,
    threshold: usize,
    signer_count: usize,
    mobile_signer_fingerprint: String,
}

#[derive(Debug)]
struct ValidatedMobileWallet {
    wallet: MultisigWalletDto,
    fingerprint: Fingerprint,
    descriptor_checksum: String,
}

#[tauri::command]
pub fn coordination_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<CoordinationStatusDto> {
    let profile = selected_profile(&app)?;
    if profile.kind != WalletKind::Multisig {
        return Ok(CoordinationStatusDto {
            shared: false,
            role: None,
            can_sign_on_this_device: false,
            mobile_signer_fingerprint: None,
            key_protection: None,
        });
    }
    // Coordination metadata is wallet-scoped private data: like descriptors
    // and cosigner metadata, it is only revealed for the unlocked selected
    // wallet, never while the wallet is locked.
    require_unlocked(&app, &state)?;
    match read_coordination_metadata(&app, profile.id) {
        Ok(metadata) => Ok(CoordinationStatusDto {
            shared: true,
            role: Some(metadata.role),
            can_sign_on_this_device: metadata.role == DeviceRole::MobileCosigner,
            mobile_signer_fingerprint: metadata.mobile_signer_fingerprint,
            key_protection: Some(metadata.key_protection),
        }),
        Err(error) if error.code == "signing_unavailable" => Ok(CoordinationStatusDto {
            shared: false,
            role: None,
            can_sign_on_this_device: false,
            mobile_signer_fingerprint: None,
            key_protection: None,
        }),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub fn coordination_watch_only_encode(content: String) -> ApiResult<Vec<String>> {
    external_signer::parse_import(
        &content,
        "Hardware signer",
        crate::external_signer::SignerSource::Qr,
    )
    .map_err(external_signer_api_error)?;
    encode_coordination(CoordinationUrType::Wallet, content.as_bytes())
}

#[tauri::command]
pub fn coordination_watch_only_decode(frames: Vec<String>) -> ApiResult<String> {
    let payload = coordination_transport::decode(CoordinationUrType::Wallet, &frames)
        .map_err(coordination_ur_api_error)?;
    let content = String::from_utf8(payload)
        .map_err(|_| invalid_payload("The watch-only wallet QR is not valid UTF-8."))?;
    external_signer::parse_import(
        &content,
        "Hardware signer",
        crate::external_signer::SignerSource::Qr,
    )
    .map_err(external_signer_api_error)?;
    Ok(content)
}

#[tauri::command]
pub fn coordination_pairing_invitation(
    state: State<'_, AppState>,
    wallet_name: String,
    threshold: usize,
    signer_count: usize,
) -> ApiResult<PairingInvitationDto> {
    let _operation = operation_guard(&state)?;
    let mut token = [0_u8; 16];
    OsRng.try_fill_bytes(&mut token).map_err(|_| {
        api_error(
            "entropy_unavailable",
            "Secure operating-system randomness is unavailable. Pairing was not started.",
        )
    })?;
    let session_id = Uuid::new_v4().to_string();
    let invitation = PairingInvitation {
        version: 1,
        session_id: session_id.clone(),
        network: NETWORK_NAME.to_owned(),
        wallet_name: wallet_name.trim().to_owned(),
        threshold,
        signer_count,
        derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
        token: encode_hex(&token),
        expires_at: now().saturating_add(PAIRING_SESSION_SECONDS),
    };
    invitation.validate(now()).map_err(coordination_api_error)?;
    let frames = encode_coordination(
        CoordinationUrType::Invitation,
        &serde_json::to_vec(&invitation).map_err(internal)?,
    )?;
    let comparison_code = comparison_code(&invitation);
    let mut sessions = state.desktop_pairings.lock().map_err(internal)?;
    sessions.retain(|_, session| {
        session.accepted_signer.is_some() || session.invitation.expires_at > now()
    });
    sessions.insert(
        session_id.clone(),
        PendingDesktopPairing {
            invitation: invitation.clone(),
            accepted_signer: None,
        },
    );
    Ok(PairingInvitationDto {
        session_id,
        expires_at: invitation.expires_at,
        comparison_code,
        frames,
    })
}

#[tauri::command]
pub fn coordination_pairing_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    state
        .desktop_pairings
        .lock()
        .map_err(internal)?
        .remove(&session_id);
    cancel_mobile_pairing_storage(&pending_mobile_pairings_directory(&app)?, &session_id)
}

#[tauri::command]
pub fn coordination_decode_invitation(
    frames: Vec<String>,
) -> ApiResult<DecodedPairingInvitationDto> {
    let payload = coordination_transport::decode(CoordinationUrType::Invitation, &frames)
        .map_err(coordination_ur_api_error)?;
    let invitation: PairingInvitation = serde_json::from_slice(&payload)
        .map_err(|_| invalid_payload("The pairing invitation is malformed."))?;
    invitation.validate(now()).map_err(coordination_api_error)?;
    Ok(DecodedPairingInvitationDto {
        invitation_json: serde_json::to_string(&invitation).map_err(internal)?,
        comparison_code: comparison_code(&invitation),
    })
}

#[tauri::command]
pub async fn coordination_mobile_accept(
    app: AppHandle,
    invitation_json: String,
    signer_label: String,
    credential: String,
) -> ApiResult<PairingResponseDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        let credential = Zeroizing::new(credential);
        validate_credential(credential.as_str())?;
        let invitation: PairingInvitation = serde_json::from_str(&invitation_json)
            .map_err(|_| invalid_payload("The pairing invitation is malformed."))?;
        invitation.validate(now()).map_err(coordination_api_error)?;
        let label = signer_label.trim();
        if label.is_empty() || label.chars().count() > 48 {
            return Err(api_error(
                "invalid_label",
                "The mobile signer name must contain 1 to 48 characters.",
            ));
        }
        let mnemonic = generate_software_mnemonic(None)?;
        let words = Zeroizing::new(mnemonic.to_string());
        let backup = native_backup::present(&app, words.as_str()).map_err(internal)?;
        if backup.cancelled {
            return Err(api_error(
                "onboarding_cancelled",
                "Mobile signer recovery-word backup was cancelled.",
            ));
        }
        let (fingerprint, account, xpub) =
            derive_mobile_account(&mnemonic).map_err(coordination_api_error)?;
        let record = KeyRecord::encode_signed(&invitation.token, fingerprint, &account, label)
            .map_err(coordination_api_error)?;
        let envelope = EncryptedEnvelope {
            version: 1,
            session_id: invitation.session_id.clone(),
            encrypted_record: encrypt_bip129(&invitation.token, record.as_bytes())
                .map_err(coordination_api_error)?,
        };
        let frames = encode_coordination_with_fragment(
            CoordinationUrType::Bsms,
            &serde_json::to_vec(&envelope).map_err(internal)?,
            MOBILE_RESPONSE_FRAGMENT_BYTES,
        )?;
        let staged = PendingMobileSecret {
            version: 1,
            invitation: invitation.clone(),
            mnemonic: Zeroizing::new(words.to_string()),
            signer_label: label.to_owned(),
            backup_verified: backup.verified,
            awaiting_final_policy: false,
        };
        let staged = Zeroizing::new(serde_json::to_vec(&staged).map_err(internal)?);
        secure_store::store(
            &pending_mobile_secret_path(&app, &invitation.session_id)?,
            &staged,
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        Ok(PairingResponseDto {
            session_id: invitation.session_id.clone(),
            fingerprint: fingerprint.to_string(),
            xpub_checksum: short_checksum(xpub.to_string().as_bytes()),
            backup_verified: backup.verified,
            comparison_code: comparison_code(&invitation),
            frames,
            awaiting_final_policy: false,
        })
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn coordination_pending_mobile_pairings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<PendingMobilePairingDto>> {
    let _operation = operation_guard(&state)?;
    reconcile_mobile_pairing_storage(&app)?;
    active_mobile_pairing_sessions(&pending_mobile_pairings_directory(&app)?).map(|sessions| {
        sessions
            .into_iter()
            .map(|session_id| PendingMobilePairingDto { session_id })
            .collect()
    })
}

#[tauri::command]
pub fn coordination_mobile_resume(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    credential: String,
) -> ApiResult<PairingResponseDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let session_uuid = staging_session_uuid(&session_id)?;
    check_staging_auth_throttle(&state, session_uuid)?;
    reconcile_mobile_pairing_storage(&app)?;
    let staged_path = pending_mobile_secret_path(&app, &session_id)?;
    let staging = secure_store::load(&staged_path, credential.as_str());
    record_staging_attempt(&state, session_uuid, &staging)?;
    let staged_bytes = Zeroizing::new(staging.map_err(secure_store_error)?);
    let staged: PendingMobileSecret = serde_json::from_slice(&staged_bytes)
        .map_err(|_| api_error("wallet_corrupt", "The pending mobile signer is malformed."))?;
    if staged.version != 1 || staged.invitation.session_id != session_id {
        return Err(api_error(
            "wallet_corrupt",
            "The pending mobile signer does not match its pairing session.",
        ));
    }
    staged
        .invitation
        .validate_after_acceptance()
        .map_err(coordination_api_error)?;
    if staged.signer_label.trim().is_empty() || staged.signer_label.chars().count() > 48 {
        return Err(api_error(
            "wallet_corrupt",
            "The pending mobile signer name is missing or malformed.",
        ));
    }
    pairing_response_from_staged(&staged)
}

#[tauri::command]
pub fn coordination_mobile_await_final(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    credential: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let session_uuid = staging_session_uuid(&session_id)?;
    check_staging_auth_throttle(&state, session_uuid)?;
    reconcile_mobile_pairing_storage(&app)?;
    let staged_path = pending_mobile_secret_path(&app, &session_id)?;
    let staging = secure_store::load(&staged_path, credential.as_str());
    record_staging_attempt(&state, session_uuid, &staging)?;
    let staged_bytes = Zeroizing::new(staging.map_err(secure_store_error)?);
    let mut staged: PendingMobileSecret = serde_json::from_slice(&staged_bytes)
        .map_err(|_| api_error("wallet_corrupt", "The pending mobile signer is malformed."))?;
    if staged.version != 1 || staged.invitation.session_id != session_id {
        return Err(api_error(
            "wallet_corrupt",
            "The pending mobile signer does not match its pairing session.",
        ));
    }
    staged
        .invitation
        .validate_after_acceptance()
        .map_err(coordination_api_error)?;
    staged.awaiting_final_policy = true;
    let staged = Zeroizing::new(serde_json::to_vec(&staged).map_err(internal)?);
    secure_store::store(&staged_path, &staged, credential.as_str()).map_err(secure_store_error)
}

fn pairing_response_from_staged(staged: &PendingMobileSecret) -> ApiResult<PairingResponseDto> {
    let mnemonic = Mnemonic::parse(staged.mnemonic.as_str()).map_err(internal)?;
    let (fingerprint, account, xpub) =
        derive_mobile_account(&mnemonic).map_err(coordination_api_error)?;
    let record = KeyRecord::encode_signed(
        &staged.invitation.token,
        fingerprint,
        &account,
        &staged.signer_label,
    )
    .map_err(coordination_api_error)?;
    let envelope = EncryptedEnvelope {
        version: 1,
        session_id: staged.invitation.session_id.clone(),
        encrypted_record: encrypt_bip129(&staged.invitation.token, record.as_bytes())
            .map_err(coordination_api_error)?,
    };
    let frames = encode_coordination_with_fragment(
        CoordinationUrType::Bsms,
        &serde_json::to_vec(&envelope).map_err(internal)?,
        MOBILE_RESPONSE_FRAGMENT_BYTES,
    )?;
    Ok(PairingResponseDto {
        session_id: staged.invitation.session_id.clone(),
        fingerprint: fingerprint.to_string(),
        xpub_checksum: short_checksum(xpub.to_string().as_bytes()),
        backup_verified: staged.backup_verified,
        comparison_code: comparison_code(&staged.invitation),
        frames,
        awaiting_final_policy: staged.awaiting_final_policy,
    })
}

fn decode_public_wallet_record(bytes: &[u8]) -> ApiResult<PublicWalletRecord> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| invalid_payload("The encrypted wallet record is malformed."))?;
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(2) {
        return Err(api_error(
            "unsupported_coordination_version",
            "This final wallet QR came from an incompatible Groot build. Update and restart both apps, then pair again.",
        ));
    }
    serde_json::from_value(value)
        .map_err(|_| invalid_payload("The encrypted wallet record is malformed."))
}

#[tauri::command]
pub fn coordination_desktop_accept(
    state: State<'_, AppState>,
    frames: Vec<String>,
) -> ApiResult<CosignerInput> {
    let _operation = operation_guard(&state)?;
    let mut sessions = state.desktop_pairings.lock().map_err(internal)?;
    accept_desktop_response(&mut sessions, &frames, now())
}

fn accept_desktop_response(
    sessions: &mut HashMap<String, PendingDesktopPairing>,
    frames: &[String],
    current_time: u64,
) -> ApiResult<CosignerInput> {
    let envelope = decode_envelope(CoordinationUrType::Bsms, frames)?;
    let pending = sessions
        .get_mut(&envelope.session_id)
        .ok_or_else(session_missing)?;
    pending
        .invitation
        .validate(current_time)
        .map_err(coordination_api_error)?;
    if pending.accepted_signer.is_some() {
        return Err(api_error(
            "pairing_replay",
            "A mobile signer response was already accepted for this session.",
        ));
    }
    let plaintext = decrypt_bip129(&pending.invitation.token, &envelope.encrypted_record)
        .map_err(coordination_api_error)?;
    let record = KeyRecord::parse(
        std::str::from_utf8(&plaintext)
            .map_err(|_| invalid_payload("The signer record is not valid UTF-8."))?,
    )
    .map_err(coordination_api_error)?;
    if record.token != pending.invitation.token {
        return Err(coordination_api_error(
            CoordinationError::AuthenticationFailed,
        ));
    }
    let signer = CosignerInput {
        id: format!("mobile-{}", record.fingerprint),
        label: record.description,
        fingerprint: record.fingerprint.to_string(),
        xpub: record.account_xpub.to_string(),
        derivation_path: record.derivation_path,
        source: CosignerSource::Qr,
        device_type: Some(MOBILE_DEVICE_TYPE.to_owned()),
    };
    signer.parse_for_validation().map_err(policy_api_error)?;
    pending.accepted_signer = Some(signer.clone());
    Ok(signer)
}

#[tauri::command]
pub fn coordination_desktop_finalize(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> ApiResult<Vec<String>> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let pending = state
        .desktop_pairings
        .lock()
        .map_err(internal)?
        .get(&session_id)
        .cloned()
        .ok_or_else(session_missing)?;
    pending
        .invitation
        .validate_after_acceptance()
        .map_err(coordination_api_error)?;
    let mobile = pending.accepted_signer.ok_or_else(|| {
        api_error(
            "pairing_incomplete",
            "Validate the mobile signer response before finalizing the wallet.",
        )
    })?;
    let wallet = read_multisig_metadata(&app)?;
    let mobile_signer_count = wallet
        .cosigners
        .iter()
        .filter(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .count();
    let exact_mobile = wallet.cosigners.iter().any(|signer| {
        signer.fingerprint == mobile.fingerprint
            && signer.xpub == mobile.xpub
            && signer.derivation_path == mobile.derivation_path
    });
    if wallet.name != pending.invitation.wallet_name
        || wallet.threshold != pending.invitation.threshold
        || wallet.cosigners.len() != pending.invitation.signer_count
        || mobile_signer_count != 1
        || !exact_mobile
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let descriptor = DescriptorRecord::from_descriptor_pair(
        &wallet.external_descriptor,
        &wallet.internal_descriptor,
        &first_multisig_address(&wallet)?,
    )
    .map_err(bsms_api_error)?;
    let profile = selected_profile_of_kind(&app, WalletKind::Multisig)?;
    let record = PublicWalletRecord {
        version: 2,
        network: NETWORK_NAME.to_owned(),
        wallet_id: profile.id.to_string(),
        wallet_name: wallet.name,
        role: DeviceRole::MobileCosigner,
        descriptor_record: descriptor.encode(),
        descriptor_checksum: profile.descriptor_checksum.clone(),
        signers: wallet.cosigners.clone(),
        mobile_signer_fingerprint: Some(mobile.fingerprint.clone()),
        created_at: now(),
    };
    record.validate().map_err(coordination_api_error)?;
    let envelope = EncryptedEnvelope {
        version: 1,
        session_id,
        encrypted_record: encrypt_bip129(
            &pending.invitation.token,
            &serde_json::to_vec(&record).map_err(internal)?,
        )
        .map_err(coordination_api_error)?,
    };
    write_private_json(
        &coordination_metadata_path(&app, profile.id)?,
        &CoordinationMetadata {
            version: 1,
            wallet_id: profile.id.to_string(),
            role: DeviceRole::DesktopCoordinator,
            mobile_signer_fingerprint: Some(mobile.fingerprint),
            key_protection: "none_public_coordinator".to_owned(),
            paired_at: now(),
            pairing_session_id: None,
        },
    )?;
    encode_coordination(
        CoordinationUrType::Wallet,
        &serde_json::to_vec(&envelope).map_err(internal)?,
    )
}

#[tauri::command]
pub fn coordination_mobile_recovery_record(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Vec<String>> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let profile = selected_profile_of_kind(&app, WalletKind::Multisig)?;
    let metadata = read_coordination_metadata(&app, profile.id)?;
    if metadata.role != DeviceRole::DesktopCoordinator {
        return Err(api_error(
            "unsupported_operation",
            "Only the desktop coordinator can prepare a replacement-phone recovery record.",
        ));
    }
    let wallet = read_multisig_metadata(&app)?;
    let mobile_fingerprint = wallet
        .cosigners
        .iter()
        .find(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .ok_or_else(|| {
            api_error(
                "signing_unavailable",
                "This wallet has no Groot mobile signer to recover.",
            )
        })?
        .fingerprint
        .clone();
    if wallet
        .cosigners
        .iter()
        .filter(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .count()
        != 1
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let descriptor = DescriptorRecord::from_descriptor_pair(
        &wallet.external_descriptor,
        &wallet.internal_descriptor,
        &first_multisig_address(&wallet)?,
    )
    .map_err(bsms_api_error)?;
    let record = PublicWalletRecord {
        version: 2,
        network: NETWORK_NAME.to_owned(),
        wallet_id: profile.id.to_string(),
        wallet_name: wallet.name,
        role: DeviceRole::MobileCosigner,
        descriptor_record: descriptor.encode(),
        descriptor_checksum: profile.descriptor_checksum,
        signers: wallet.cosigners,
        mobile_signer_fingerprint: Some(mobile_fingerprint),
        created_at: now(),
    };
    record.validate().map_err(coordination_api_error)?;
    encode_coordination(
        CoordinationUrType::Wallet,
        &serde_json::to_vec(&record).map_err(internal)?,
    )
}

#[tauri::command]
pub fn coordination_mobile_recovery_inspect(
    state: State<'_, AppState>,
    frames: Vec<String>,
) -> ApiResult<MobileRecoveryRecordDto> {
    let _operation = operation_guard(&state)?;
    let payload = coordination_transport::decode(CoordinationUrType::Wallet, &frames)
        .map_err(coordination_ur_api_error)?;
    let public = decode_public_wallet_record(&payload)?;
    if public.role != DeviceRole::MobileCosigner {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let descriptor = public.validate().map_err(coordination_api_error)?;
    let (threshold, keys) = descriptor.standard_policy().map_err(bsms_api_error)?;
    if keys.len() != public.signers.len() {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let mobile_signer_fingerprint = public
        .mobile_signer_fingerprint
        .clone()
        .ok_or_else(|| coordination_api_error(CoordinationError::DescriptorMismatch))?;
    if public
        .signers
        .iter()
        .filter(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .count()
        != 1
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    Ok(MobileRecoveryRecordDto {
        wallet_name: public.wallet_name,
        threshold,
        signer_count: public.signers.len(),
        mobile_signer_fingerprint,
    })
}

fn validate_mobile_wallet_record(
    public: PublicWalletRecord,
    mnemonic: &Mnemonic,
) -> ApiResult<ValidatedMobileWallet> {
    if public.role != DeviceRole::MobileCosigner {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let descriptor = public.validate().map_err(coordination_api_error)?;
    let (fingerprint, _, account_xpub) =
        derive_mobile_account(mnemonic).map_err(coordination_api_error)?;
    if public.mobile_signer_fingerprint.as_deref() != Some(&fingerprint.to_string()) {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let (threshold, keys) = descriptor.standard_policy().map_err(bsms_api_error)?;
    if keys.len() != public.signers.len()
        || !keys.iter().any(|key| {
            key.fingerprint == fingerprint
                && key.xpub == account_xpub
                && key.derivation_path == MULTISIG_ACCOUNT_PATH
        })
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let mobile_manifest_signer = public
        .signers
        .iter()
        .find(|signer| {
            signer
                .fingerprint
                .eq_ignore_ascii_case(&fingerprint.to_string())
        })
        .ok_or_else(|| coordination_api_error(CoordinationError::DescriptorMismatch))?;
    if mobile_manifest_signer.xpub != account_xpub.to_string()
        || mobile_manifest_signer.derivation_path != MULTISIG_ACCOUNT_PATH
        || mobile_manifest_signer.source != CosignerSource::Qr
        || mobile_manifest_signer.device_type.as_deref() != Some(MOBILE_DEVICE_TYPE)
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let preview = PolicyInput {
        name: public.wallet_name,
        threshold,
        cosigners: public.signers,
    }
    .preview()
    .map_err(policy_api_error)?;
    if !descriptor
        .matches_descriptor_pair(&preview.external_descriptor, &preview.internal_descriptor)
        .map_err(bsms_api_error)?
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let wallet = MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: preview.name,
        threshold: preview.threshold,
        cosigners: preview.cosigners,
        external_descriptor: preview.external_descriptor,
        internal_descriptor: preview.internal_descriptor,
        created_at: now().to_string(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: Vec::new(),
    };
    if first_multisig_address(&wallet)? != descriptor.first_address
        || descriptor_checksum(&wallet.external_descriptor)? != public.descriptor_checksum
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    Ok(ValidatedMobileWallet {
        wallet,
        fingerprint,
        descriptor_checksum: public.descriptor_checksum,
    })
}

#[tauri::command]
pub fn coordination_mobile_final_inspect(
    state: State<'_, AppState>,
    frames: Vec<String>,
) -> ApiResult<String> {
    let _operation = operation_guard(&state)?;
    Ok(decode_envelope(CoordinationUrType::Wallet, &frames)?.session_id)
}

#[tauri::command]
pub fn coordination_mobile_complete(
    app: AppHandle,
    state: State<'_, AppState>,
    frames: Vec<String>,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let envelope = decode_envelope(CoordinationUrType::Wallet, &frames)?;
    let session_uuid = staging_session_uuid(&envelope.session_id)?;
    check_staging_auth_throttle(&state, session_uuid)?;
    let staged_path = pending_mobile_secret_path(&app, &envelope.session_id)?;
    let staging = secure_store::load(&staged_path, credential.as_str());
    record_staging_attempt(&state, session_uuid, &staging)?;
    let staged_bytes = Zeroizing::new(staging.map_err(secure_store_error)?);
    let staged: PendingMobileSecret = serde_json::from_slice(&staged_bytes)
        .map_err(|_| api_error("wallet_corrupt", "The pending mobile signer is malformed."))?;
    if staged.version != 1 {
        return Err(api_error(
            "wallet_corrupt",
            "The pending mobile signer version is unsupported.",
        ));
    }
    staged
        .invitation
        .validate_after_acceptance()
        .map_err(coordination_api_error)?;
    if staged.invitation.session_id != envelope.session_id {
        return Err(coordination_api_error(
            CoordinationError::AuthenticationFailed,
        ));
    }
    let public_bytes = decrypt_bip129(&staged.invitation.token, &envelope.encrypted_record)
        .map_err(coordination_api_error)?;
    let public = decode_public_wallet_record(&public_bytes)?;
    if public.wallet_name != staged.invitation.wallet_name {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let mnemonic = Mnemonic::parse(staged.mnemonic.as_str()).map_err(internal)?;
    let validated = validate_mobile_wallet_record(public, &mnemonic)?;
    if validated.wallet.threshold != staged.invitation.threshold
        || validated.wallet.cosigners.len() != staged.invitation.signer_count
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let ValidatedMobileWallet {
        wallet,
        fingerprint,
        descriptor_checksum: expected_checksum,
    } = validated;
    let pairing_session_id = envelope.session_id.clone();
    let pairing_directory = pending_mobile_pairings_directory(&app)?;
    let id = Uuid::new_v4();
    let consuming_path = transition_mobile_pairing_to_consuming(&app, &pairing_session_id, id)?;
    let dir = match prepare_profile_directory_with_id(&app, id) {
        Ok(path) => path,
        Err(error) => {
            restore_consuming_mobile_pairing(&pairing_directory, &pairing_session_id, id)?;
            return Err(error);
        }
    };
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        Wallet::create(
            wallet.external_descriptor.clone(),
            wallet.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;
        secure_store::store(
            &dir.join("secret.json"),
            format!("groot-multisig:{}", wallet.external_descriptor).as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        // The PIN gates this local envelope. It is intentionally not a BIP39 passphrase.
        secure_store::store(
            &dir.join("mobile-signer.json"),
            staged.mnemonic.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        write_private_json(&dir.join("wallet.json"), &wallet)?;
        write_private_json(
            &dir.join("coordination.json"),
            &CoordinationMetadata {
                version: 1,
                wallet_id: id.to_string(),
                role: DeviceRole::MobileCosigner,
                mobile_signer_fingerprint: Some(fingerprint.to_string()),
                key_protection: "argon2id_pin_envelope_testnet_only".to_owned(),
                paired_at: now(),
                pairing_session_id: Some(pairing_session_id.clone()),
            },
        )?;
        commit_profile(
            &app,
            WalletProfile {
                id,
                name: wallet.name.clone(),
                network: NETWORK_NAME.to_owned(),
                kind: WalletKind::Multisig,
                descriptor_checksum: expected_checksum.clone(),
                created_at: now(),
                backup_verified: staged.backup_verified,
            },
            &wallet.external_descriptor,
        )
    })();
    if let Err(error) = result {
        cleanup_failed_profile(&dir)?;
        restore_consuming_mobile_pairing(&pairing_directory, &pairing_session_id, id)?;
        return Err(error);
    }
    // The registry commit is authoritative. A cleanup failure must not report that wallet
    // creation failed and invite a duplicate retry; startup reconciliation removes the tombstone.
    if let Ok(true) = remove_file_if_present(&consuming_path) {
        let _ = sync_private_directory(&pairing_directory);
    }
    unlock_selected(&app, &state)?;
    reset_auth_throttle(&app, &state)?;
    Ok(wallet)
}

#[tauri::command]
pub async fn coordination_mobile_recover(
    app: AppHandle,
    frames: Vec<String>,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        let credential = Zeroizing::new(credential);
        validate_credential(credential.as_str())?;
        let payload = coordination_transport::decode(CoordinationUrType::Wallet, &frames)
            .map_err(coordination_ur_api_error)?;
        let public = decode_public_wallet_record(&payload)?;
        let mnemonic_words = native_backup::recover(&app)
            .map_err(internal)?
            .ok_or_else(|| api_error("onboarding_cancelled", "Phone recovery was cancelled."))?;
        if mnemonic_words.len() > MAX_MNEMONIC_INPUT_BYTES {
            return Err(api_error(
                "invalid_mnemonic",
                "Enter a valid 24-word recovery phrase.",
            ));
        }
        let mnemonic = Mnemonic::parse(mnemonic_words.trim())
            .map_err(|_| api_error("invalid_mnemonic", "Enter a valid 24-word recovery phrase."))?;
        if mnemonic.word_count() != 24 {
            return Err(api_error(
                "invalid_mnemonic",
                "Groot requires exactly 24 recovery words.",
            ));
        }
        let validated = validate_mobile_wallet_record(public, &mnemonic)?;
        let id = Uuid::new_v4();
        let dir = prepare_profile_directory_with_id(&app, id)?;
        let result = (|| {
            let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
            init_app_schema(&db)?;
            Wallet::create(
                validated.wallet.external_descriptor.clone(),
                validated.wallet.internal_descriptor.clone(),
            )
            .network(NETWORK)
            .create_wallet(&mut db)
            .map_err(internal)?;
            secure_store::store(
                &dir.join("secret.json"),
                format!("groot-multisig:{}", validated.wallet.external_descriptor).as_bytes(),
                credential.as_str(),
            )
            .map_err(secure_store_error)?;
            secure_store::store(
                &dir.join("mobile-signer.json"),
                mnemonic_words.as_bytes(),
                credential.as_str(),
            )
            .map_err(secure_store_error)?;
            write_private_json(&dir.join("wallet.json"), &validated.wallet)?;
            write_private_json(
                &dir.join("coordination.json"),
                &CoordinationMetadata {
                    version: 1,
                    wallet_id: id.to_string(),
                    role: DeviceRole::MobileCosigner,
                    mobile_signer_fingerprint: Some(validated.fingerprint.to_string()),
                    key_protection: "argon2id_pin_envelope_testnet_only".to_owned(),
                    paired_at: now(),
                    pairing_session_id: None,
                },
            )?;
            commit_profile(
                &app,
                WalletProfile {
                    id,
                    name: validated.wallet.name.clone(),
                    network: NETWORK_NAME.to_owned(),
                    kind: WalletKind::Multisig,
                    descriptor_checksum: validated.descriptor_checksum.clone(),
                    created_at: now(),
                    backup_verified: true,
                },
                &validated.wallet.external_descriptor,
            )
        })();
        if let Err(error) = result {
            cleanup_failed_profile(&dir)?;
            return Err(error);
        }
        unlock_selected(&app, &state)?;
        reset_auth_throttle(&app, &state)?;
        Ok(validated.wallet)
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub fn coordination_mobile_psbt_review(
    app: AppHandle,
    state: State<'_, AppState>,
    psbt: String,
) -> ApiResult<MobilePsbtReviewDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    review_mobile_psbt(&app, &psbt)
}

#[tauri::command]
pub fn coordination_mobile_signer_check(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<CosignerHealthDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let profile = selected_profile_of_kind(&app, WalletKind::Multisig)?;
    let coordination = read_coordination_metadata(&app, profile.id)?;
    if coordination.role != DeviceRole::MobileCosigner {
        return Err(api_error(
            "signing_unavailable",
            "This device does not hold the phone signer for this wallet.",
        ));
    }
    let expected_fingerprint = coordination
        .mobile_signer_fingerprint
        .as_deref()
        .ok_or_else(|| {
            api_error(
                "signing_unavailable",
                "The phone signer identity is missing.",
            )
        })?;
    let wallet = read_multisig_metadata(&app)?;
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let loaded = secure_store::load(
        &profile_directory(&app, profile.id)?.join("mobile-signer.json"),
        credential.as_str(),
    )
    .map_err(secure_store_error);
    record_auth_result(&app, &state, &loaded)?;
    let mut words = Zeroizing::new(String::from_utf8(loaded?).map_err(internal)?);
    let mnemonic = Mnemonic::parse(words.as_str()).map_err(internal)?;
    words.zeroize();
    if !mobile_signer_matches_wallet(&wallet, expected_fingerprint, &mnemonic)? {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    Ok(CosignerHealthDto {
        status: "healthy",
        checked_at: now().to_string(),
        summary: "Phone key matches this wallet.".to_owned(),
    })
}

fn mobile_signer_matches_wallet(
    wallet: &MultisigWalletDto,
    expected_fingerprint: &str,
    mnemonic: &Mnemonic,
) -> ApiResult<bool> {
    let (fingerprint, _, account_xpub) =
        derive_mobile_account(mnemonic).map_err(coordination_api_error)?;
    let fingerprint = fingerprint.to_string();
    Ok(fingerprint.eq_ignore_ascii_case(expected_fingerprint)
        && wallet.cosigners.iter().any(|signer| {
            signer.fingerprint.eq_ignore_ascii_case(&fingerprint)
                && signer.xpub == account_xpub.to_string()
                && signer.derivation_path == MULTISIG_ACCOUNT_PATH
                && signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE)
        }))
}

#[tauri::command]
pub fn coordination_mobile_sign_psbt(
    app: AppHandle,
    state: State<'_, AppState>,
    reviewed_psbt: String,
    revision_id: String,
    credential: String,
) -> ApiResult<SignedMobilePsbtDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let profile = selected_profile_of_kind(&app, WalletKind::Multisig)?;
    let coordination = read_coordination_metadata(&app, profile.id)?;
    let wallet = read_multisig_metadata(&app)?;
    let review = review_mobile_psbt_for(&wallet, &coordination, &reviewed_psbt)?;
    if review.revision_id != revision_id {
        return Err(api_error(
            "proposal_mismatch",
            "The PSBT changed after review. Scan it again before signing.",
        ));
    }
    let credential = Zeroizing::new(credential);
    check_auth_throttle(&app, &state)?;
    let loaded = secure_store::load(
        &profile_directory(&app, profile.id)?.join("mobile-signer.json"),
        credential.as_str(),
    )
    .map_err(secure_store_error);
    record_auth_result(&app, &state, &loaded)?;
    let mut words = Zeroizing::new(String::from_utf8(loaded?).map_err(internal)?);
    let mnemonic = Mnemonic::parse(words.as_str()).map_err(internal)?;
    words.zeroize();
    sign_mobile_psbt_for(&wallet, &mnemonic, &reviewed_psbt, revision_id)
}

fn sign_mobile_psbt_for(
    wallet: &MultisigWalletDto,
    mnemonic: &Mnemonic,
    reviewed_psbt: &str,
    revision_id: String,
) -> ApiResult<SignedMobilePsbtDto> {
    let reviewed = decode_psbt(reviewed_psbt).map_err(proposal_api_error)?;
    if psbt_revision(&reviewed) != revision_id {
        return Err(api_error(
            "proposal_mismatch",
            "The PSBT changed after review. Scan it again before signing.",
        ));
    }
    let (fingerprint, account, account_xpub) =
        derive_mobile_account(mnemonic).map_err(coordination_api_error)?;
    let signer = wallet
        .cosigners
        .iter()
        .find(|signer| signer.fingerprint == fingerprint.to_string())
        .ok_or_else(|| coordination_api_error(CoordinationError::DescriptorMismatch))?;
    if signer.xpub != account_xpub.to_string()
        || signer.device_type.as_deref() != Some(MOBILE_DEVICE_TYPE)
    {
        return Err(coordination_api_error(
            CoordinationError::DescriptorMismatch,
        ));
    }
    let mut returned = reviewed.clone();
    sign_mobile_inputs(&mut returned, &account, fingerprint)?;
    let signed = hardware_signature_response(&reviewed, returned).map_err(proposal_api_error)?;
    let signed_psbt = encode_psbt(&signed);
    let frames = ur_transport::encode_psbt(&signed_psbt, 220).map_err(ur_api_error)?;
    Ok(SignedMobilePsbtDto {
        revision_id,
        signer_fingerprint: fingerprint.to_string(),
        signed_psbt,
        frames,
    })
}

fn sign_mobile_inputs(
    psbt: &mut Psbt,
    account: &MobileAccount,
    fingerprint: Fingerprint,
) -> ApiResult<()> {
    let secp = Secp256k1::new();
    let signatures = {
        let mut cache = bdk_wallet::bitcoin::sighash::SighashCache::new(&psbt.unsigned_tx);
        psbt.inputs
            .iter()
            .enumerate()
            .map(|(input_index, input)| {
                let mut matching = input
                    .bip32_derivation
                    .iter()
                    .filter(|(_, (candidate, _))| *candidate == fingerprint);
                let (expected_public, (_, path)) = matching.next().ok_or_else(|| {
                    api_error(
                        "unknown_signer",
                        "The PSBT does not bind every input to this exact mobile signer.",
                    )
                })?;
                if matching.next().is_some() {
                    return Err(api_error(
                        "unknown_signer",
                        "The PSBT ambiguously binds an input to the mobile signer.",
                    ));
                }
                let (keychain, index) = parse_owned_path(path)?;
                let branch = match keychain {
                    KeychainKind::External => 0,
                    KeychainKind::Internal => 1,
                };
                let relative = DerivationPath::from(vec![
                    bdk_wallet::bitcoin::bip32::ChildNumber::Normal { index: branch },
                    bdk_wallet::bitcoin::bip32::ChildNumber::Normal { index },
                ]);
                let child = MobileAccount(
                    account
                        .derive_priv(&secp, &relative)
                        .map_err(|_| coordination_api_error(CoordinationError::WrongDerivation))?,
                );
                if child.private_key.public_key(&secp) != *expected_public {
                    return Err(coordination_api_error(
                        CoordinationError::DescriptorMismatch,
                    ));
                }
                let (message, sighash_type) =
                    psbt.sighash_ecdsa(input_index, &mut cache).map_err(|_| {
                        proposal_api_error(crate::proposal::ProposalError::InvalidSignature)
                    })?;
                if sighash_type != bdk_wallet::bitcoin::EcdsaSighashType::All {
                    return Err(api_error(
                        "unsupported_sighash",
                        "Groot mobile signs only unfinalized SIGHASH_ALL PSBTs.",
                    ));
                }
                Ok((
                    input_index,
                    bdk_wallet::bitcoin::PublicKey::new(*expected_public),
                    bdk_wallet::bitcoin::ecdsa::Signature {
                        signature: secp.sign_ecdsa(&message, &child.private_key),
                        sighash_type,
                    },
                ))
            })
            .collect::<ApiResult<Vec<_>>>()?
    };
    for (input_index, public_key, signature) in signatures {
        psbt.inputs[input_index]
            .partial_sigs
            .insert(public_key, signature);
    }
    Ok(())
}

#[cfg(test)]
fn descriptor_without_checksum(descriptor: &str) -> ApiResult<&str> {
    descriptor
        .split_once('#')
        .map(|(body, _)| body)
        .ok_or_else(|| {
            api_error(
                "wallet_corrupt",
                "The paired wallet descriptor is missing its checksum.",
            )
        })
}

fn review_mobile_psbt(app: &AppHandle, encoded: &str) -> ApiResult<MobilePsbtReviewDto> {
    let profile = selected_profile_of_kind(app, WalletKind::Multisig)?;
    let coordination = read_coordination_metadata(app, profile.id)?;
    let metadata = read_multisig_metadata(app)?;
    review_mobile_psbt_for(&metadata, &coordination, encoded)
}

fn review_mobile_psbt_for(
    metadata: &MultisigWalletDto,
    coordination: &CoordinationMetadata,
    encoded: &str,
) -> ApiResult<MobilePsbtReviewDto> {
    if coordination.role != DeviceRole::MobileCosigner {
        return Err(api_error(
            "signing_unavailable",
            "This device has a watch-only copy and cannot sign.",
        ));
    }
    let psbt = decode_psbt(encoded).map_err(proposal_api_error)?;
    if psbt.inputs.is_empty() || psbt.inputs.len() != psbt.unsigned_tx.input.len() {
        return Err(api_error(
            "malformed_psbt",
            "The PSBT has no signable inputs.",
        ));
    }
    if psbt.inputs.iter().any(|input| {
        input.final_script_sig.is_some()
            || input.final_script_witness.is_some()
            || input.sighash_type.is_some_and(|value| {
                value.ecdsa_hash_ty().ok() != Some(bdk_wallet::bitcoin::EcdsaSighashType::All)
            })
    }) {
        return Err(api_error(
            "unsupported_sighash",
            "Groot mobile signs only unfinalized SIGHASH_ALL PSBTs.",
        ));
    }
    let allowed = metadata
        .cosigners
        .iter()
        .map(|signer| Fingerprint::from_str(&signer.fingerprint).map_err(internal))
        .collect::<ApiResult<Vec<_>>>()?;
    let progress =
        signature_progress(&psbt, &allowed, metadata.threshold).map_err(proposal_api_error)?;
    let signer_fingerprint = coordination
        .mobile_signer_fingerprint
        .as_deref()
        .ok_or_else(|| api_error("wallet_corrupt", "Mobile signer identity is missing."))?;
    let signer_fingerprint = Fingerprint::from_str(signer_fingerprint).map_err(internal)?;
    let public_wallet = Wallet::create(
        metadata.external_descriptor.clone(),
        metadata.internal_descriptor.clone(),
    )
    .network(NETWORK)
    .create_wallet_no_persist()
    .map_err(internal)?;
    let input_total = psbt
        .inputs
        .iter()
        .map(|input| {
            let output = input.witness_utxo.as_ref().ok_or_else(|| {
                api_error(
                    "malformed_psbt",
                    "Every mobile-signing input must include its witness UTXO.",
                )
            })?;
            let (keychain, index) =
                owned_derivation(input.bip32_derivation.values(), signer_fingerprint)?;
            if public_wallet
                .peek_address(keychain, index)
                .address
                .script_pubkey()
                != output.script_pubkey
            {
                return Err(api_error(
                    "proposal_mismatch",
                    "An input does not belong to the exact paired wallet policy.",
                ));
            }
            Ok(output.value.to_sat())
        })
        .try_fold(0_u64, |total, value| {
            value.and_then(|value| {
                total
                    .checked_add(value)
                    .ok_or_else(|| api_error("malformed_psbt", "The PSBT input total overflowed."))
            })
        })?;
    let output_total = psbt
        .unsigned_tx
        .output
        .iter()
        .map(|output| output.value.to_sat())
        .try_fold(0_u64, |total, value| {
            total
                .checked_add(value)
                .ok_or_else(|| api_error("malformed_psbt", "The PSBT output total overflowed."))
        })?;
    let fee_sats = input_total.checked_sub(output_total).ok_or_else(|| {
        api_error(
            "malformed_psbt",
            "The PSBT outputs exceed its authenticated input values.",
        )
    })?;
    let mut recipients = Vec::new();
    let mut change = Vec::new();
    for (index, output) in psbt.unsigned_tx.output.iter().enumerate() {
        let item = MobileOutputDto {
            address: Address::from_script(&output.script_pubkey, NETWORK)
                .map_err(|_| {
                    api_error(
                        "malformed_psbt",
                        "A PSBT output is invalid for this network.",
                    )
                })?
                .to_string(),
            amount_sats: output.value.to_sat(),
        };
        let owned = psbt.outputs[index]
            .bip32_derivation
            .values()
            .find(|(fingerprint, _)| *fingerprint == signer_fingerprint);
        if let Some((_, path)) = owned {
            let (keychain, address_index) = parse_owned_path(path)?;
            if public_wallet
                .peek_address(keychain, address_index)
                .address
                .script_pubkey()
                != output.script_pubkey
            {
                return Err(api_error(
                    "proposal_mismatch",
                    "An output falsely claims to be wallet change.",
                ));
            }
            change.push(item);
        } else {
            recipients.push(item);
        }
    }
    if recipients.is_empty() {
        return Err(api_error(
            "proposal_mismatch",
            "The PSBT contains no independently reviewable recipient output.",
        ));
    }
    Ok(MobilePsbtReviewDto {
        revision_id: psbt_revision(&psbt),
        transaction_id: psbt.unsigned_tx.compute_txid().to_string(),
        input_count: psbt.inputs.len(),
        recipients,
        change,
        fee_sats,
        already_signed_by: progress.signed_fingerprints,
    })
}

fn psbt_revision(psbt: &Psbt) -> String {
    sha256::Hash::hash(&psbt.serialize()).to_string()
}

fn owned_derivation<'a>(
    values: impl Iterator<Item = &'a (Fingerprint, DerivationPath)>,
    fingerprint: Fingerprint,
) -> ApiResult<(KeychainKind, u32)> {
    let path = values
        .filter(|(candidate, _)| *candidate == fingerprint)
        .map(|(_, path)| path)
        .next()
        .ok_or_else(|| {
            api_error(
                "unknown_signer",
                "The PSBT does not bind every input to this exact mobile signer.",
            )
        })?;
    parse_owned_path(path)
}

fn parse_owned_path(path: &DerivationPath) -> ApiResult<(KeychainKind, u32)> {
    let account = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).map_err(internal)?;
    let suffix = path
        .as_ref()
        .strip_prefix(account.as_ref())
        .ok_or_else(|| {
            api_error(
                "unsupported_derivation",
                "The PSBT uses an unexpected signer path.",
            )
        })?;
    let [branch, index] = suffix else {
        return Err(api_error(
            "unsupported_derivation",
            "The PSBT signer path is incomplete.",
        ));
    };
    let bdk_wallet::bitcoin::bip32::ChildNumber::Normal { index } = index else {
        return Err(api_error(
            "unsupported_derivation",
            "The PSBT signer index must be a normal child.",
        ));
    };
    let bdk_wallet::bitcoin::bip32::ChildNumber::Normal { index: branch } = branch else {
        return Err(api_error(
            "unsupported_derivation",
            "The PSBT signer branch must be receive or change.",
        ));
    };
    match branch {
        0 => Ok((KeychainKind::External, *index)),
        1 => Ok((KeychainKind::Internal, *index)),
        _ => Err(api_error(
            "unsupported_derivation",
            "The PSBT signer branch must be receive or change.",
        )),
    }
}

fn encode_coordination(payload_type: CoordinationUrType, payload: &[u8]) -> ApiResult<Vec<String>> {
    encode_coordination_with_fragment(payload_type, payload, FRAGMENT_BYTES)
}

fn encode_coordination_with_fragment(
    payload_type: CoordinationUrType,
    payload: &[u8],
    fragment_bytes: usize,
) -> ApiResult<Vec<String>> {
    coordination_transport::encode(payload_type, payload, fragment_bytes)
        .map_err(coordination_ur_api_error)
}

fn decode_envelope(
    payload_type: CoordinationUrType,
    frames: &[String],
) -> ApiResult<EncryptedEnvelope> {
    let payload =
        coordination_transport::decode(payload_type, frames).map_err(coordination_ur_api_error)?;
    let envelope: EncryptedEnvelope = serde_json::from_slice(&payload)
        .map_err(|_| invalid_payload("The encrypted pairing envelope is malformed."))?;
    if envelope.version != 1 || Uuid::parse_str(&envelope.session_id).is_err() {
        return Err(invalid_payload(
            "The encrypted pairing envelope has an unsupported version or session.",
        ));
    }
    Ok(envelope)
}

fn pending_mobile_pairings_directory(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app_data_dir(app)?.join("pending-mobile-pairings"))
}

fn staging_session_uuid(session_id: &str) -> ApiResult<Uuid> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))
}

/// Process-local PIN throttle for the encrypted pending-mobile-pairing
/// staging envelope. The durable per-wallet throttle cannot serve these
/// commands because the wallet profile does not exist yet; the staging
/// envelope itself is a passphrase oracle, so online attempts get the same
/// bounded backoff policy, keyed by the pairing session and measured on a
/// monotonic clock. A successful clear or an abandoned process resets it.
fn check_staging_auth_throttle(state: &AppState, session: Uuid) -> ApiResult<()> {
    let retry_at = state
        .staging_auth_retry_at
        .lock()
        .map_err(internal)?
        .get(&session)
        .copied();
    if let Some(retry_at) = retry_at {
        let now_instant = Instant::now();
        if now_instant < retry_at {
            let remaining = retry_at.duration_since(now_instant).as_secs().max(1);
            return Err(api_error(
                "rate_limited",
                format!("Too many incorrect attempts. Try again in {remaining} seconds."),
            ));
        }
        state
            .staging_auth_retry_at
            .lock()
            .map_err(internal)?
            .remove(&session);
    }
    Ok(())
}

/// Count only credential failures: a corrupt or unavailable staging envelope
/// is not a guessing oracle and must not lock out its owner.
fn record_staging_attempt(
    state: &AppState,
    session: Uuid,
    result: &Result<Vec<u8>, crate::secure_store::SecureStoreError>,
) -> ApiResult<()> {
    if result.is_ok() {
        state
            .staging_auth_failures
            .lock()
            .map_err(internal)?
            .remove(&session);
        state
            .staging_auth_retry_at
            .lock()
            .map_err(internal)?
            .remove(&session);
        return Ok(());
    }
    if !matches!(
        result,
        Err(crate::secure_store::SecureStoreError::InvalidCredential)
    ) {
        return Ok(());
    }
    let failures = {
        let mut map = state.staging_auth_failures.lock().map_err(internal)?;
        let entry = map.entry(session).or_insert(0);
        let mut throttle = AuthThrottle::restore(*entry, 0);
        let delay = throttle.failed(now());
        *entry = throttle.snapshot().0;
        if delay.is_zero() {
            None
        } else {
            Instant::now().checked_add(delay)
        }
    };
    if let Some(retry_at) = failures {
        state
            .staging_auth_retry_at
            .lock()
            .map_err(internal)?
            .insert(session, retry_at);
    }
    Ok(())
}

fn pending_mobile_secret_path(app: &AppHandle, session_id: &str) -> ApiResult<PathBuf> {
    let directory = pending_mobile_pairings_directory(app)?;
    ensure_private_directory(&directory)?;
    pending_mobile_secret_path_in(&directory, session_id)
}

fn pending_mobile_secret_path_in(directory: &Path, session_id: &str) -> ApiResult<PathBuf> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))?;
    Ok(directory.join(format!("{session_id}.json")))
}

fn consuming_mobile_secret_path_in(
    directory: &Path,
    session_id: &str,
    wallet_id: Uuid,
) -> ApiResult<PathBuf> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))?;
    Ok(directory.join(format!(".consuming-{session_id}--{wallet_id}.json")))
}

fn parse_consuming_mobile_secret_name(name: &str) -> Option<(&str, Uuid)> {
    let value = name.strip_prefix(".consuming-")?.strip_suffix(".json")?;
    let (session_id, wallet_id) = value.split_once("--")?;
    Uuid::parse_str(session_id).ok()?;
    Some((session_id, Uuid::parse_str(wallet_id).ok()?))
}

fn consuming_mobile_secret_paths_for_session(
    directory: &Path,
    session_id: &str,
) -> ApiResult<Vec<PathBuf>> {
    Uuid::parse_str(session_id)
        .map_err(|_| invalid_payload("The pairing session identifier is invalid."))?;
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(internal(error)),
    };
    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry.map_err(internal)?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some((candidate, _)) = parse_consuming_mobile_secret_name(&name) else {
            continue;
        };
        if candidate == session_id {
            let metadata = fs::symlink_metadata(entry.path()).map_err(internal)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(api_error(
                    "wallet_corrupt",
                    "Mobile pairing recovery storage is not a regular file.",
                ));
            }
            paths.push(entry.path());
        }
    }
    paths.sort();
    Ok(paths)
}

fn transition_mobile_pairing_to_consuming(
    app: &AppHandle,
    session_id: &str,
    wallet_id: Uuid,
) -> ApiResult<PathBuf> {
    let directory = pending_mobile_pairings_directory(app)?;
    let active = pending_mobile_secret_path_in(&directory, session_id)?;
    if !consuming_mobile_secret_paths_for_session(&directory, session_id)?.is_empty() {
        return Err(api_error(
            "pairing_in_progress",
            "This mobile pairing is already being completed.",
        ));
    }
    let consuming = consuming_mobile_secret_path_in(&directory, session_id, wallet_id)?;
    fs::rename(&active, &consuming).map_err(internal)?;
    sync_private_directory(&directory)?;
    Ok(consuming)
}

fn restore_consuming_mobile_pairing(
    directory: &Path,
    session_id: &str,
    wallet_id: Uuid,
) -> ApiResult<()> {
    let active = pending_mobile_secret_path_in(directory, session_id)?;
    let consuming = consuming_mobile_secret_path_in(directory, session_id, wallet_id)?;
    if !consuming.exists() {
        return Ok(());
    }
    if active.exists() {
        return Err(api_error(
            "wallet_corrupt",
            "Conflicting mobile pairing recovery files were found.",
        ));
    }
    fs::rename(consuming, active).map_err(internal)?;
    sync_private_directory(directory)
}

fn remove_file_if_present(path: &Path) -> ApiResult<bool> {
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(internal(error)),
    }
}

fn cancel_mobile_pairing_storage(directory: &Path, session_id: &str) -> ApiResult<()> {
    let active = pending_mobile_secret_path_in(directory, session_id)?;
    let mut changed = remove_file_if_present(&active)?;
    for consuming in consuming_mobile_secret_paths_for_session(directory, session_id)? {
        changed |= remove_file_if_present(&consuming)?;
    }
    if changed && directory.exists() {
        sync_private_directory(directory)?;
    }
    Ok(())
}

fn active_mobile_pairing_sessions(directory: &Path) -> ApiResult<Vec<String>> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(internal(error)),
    };
    let mut sessions = Vec::new();
    for entry in entries {
        let entry = entry.map_err(internal)?;
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        let Some(session_id) = name.strip_suffix(".json") else {
            continue;
        };
        if name.starts_with('.') || Uuid::parse_str(session_id).is_err() {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path()).map_err(internal)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(api_error(
                "wallet_corrupt",
                "Mobile pairing storage is not a regular file.",
            ));
        }
        sessions.push(session_id.to_owned());
    }
    sessions.sort();
    Ok(sessions)
}

pub(super) fn reconcile_mobile_pairing_storage(app: &AppHandle) -> ApiResult<()> {
    let directory = pending_mobile_pairings_directory(app)?;
    if !directory.exists() {
        return Ok(());
    }
    let registry = load_registry(app)?;
    let registered_wallets = registry
        .wallets
        .iter()
        .map(|profile| profile.id)
        .collect::<HashSet<_>>();
    let mut committed_pairings = HashSet::new();
    for profile in registry.wallets {
        let path = profile_directory(app, profile.id)?.join("coordination.json");
        if !path.is_file() {
            continue;
        }
        let metadata: CoordinationMetadata = serde_json::from_str(&read_private_text(&path)?)
            .map_err(|_| api_error("wallet_corrupt", "The coordination metadata is malformed."))?;
        if metadata.role == DeviceRole::MobileCosigner {
            if let Some(session_id) = metadata.pairing_session_id {
                Uuid::parse_str(&session_id).map_err(|_| {
                    api_error(
                        "wallet_corrupt",
                        "The coordinated wallet has an invalid pairing session identifier.",
                    )
                })?;
                committed_pairings.insert((session_id, profile.id));
            }
        }
    }
    reconcile_mobile_pairing_directory(
        &directory,
        &wallets_root(app)?,
        &registered_wallets,
        &committed_pairings,
    )
}

fn reconcile_mobile_pairing_directory(
    directory: &Path,
    wallets_directory: &Path,
    registered_wallets: &HashSet<Uuid>,
    committed_pairings: &HashSet<(String, Uuid)>,
) -> ApiResult<()> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(internal(error)),
    };
    let committed_sessions = committed_pairings
        .iter()
        .map(|(session_id, _)| session_id.as_str())
        .collect::<HashSet<_>>();
    let mut active_sessions = HashSet::new();
    let mut active_files = Vec::new();
    let mut consuming_files = Vec::new();
    let mut temporary_files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(internal)?;
        let path = entry.path();
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        let active_session = name
            .strip_suffix(".json")
            .filter(|session| !name.starts_with('.') && Uuid::parse_str(session).is_ok());
        let consuming = parse_consuming_mobile_secret_name(&name);
        let secure_temporary = name
            .strip_prefix(".secure-")
            .and_then(|value| value.strip_suffix(".tmp"))
            .is_some_and(|value| Uuid::parse_str(value).is_ok());
        if active_session.is_none() && consuming.is_none() && !secure_temporary {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(internal)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(api_error(
                "wallet_corrupt",
                "Mobile pairing recovery storage is not a regular file.",
            ));
        }
        if secure_temporary {
            temporary_files.push(path);
        } else if let Some(session_id) = active_session {
            active_sessions.insert(session_id.to_owned());
            active_files.push((session_id.to_owned(), path));
        } else if let Some((session_id, wallet_id)) = consuming {
            consuming_files.push((session_id.to_owned(), wallet_id, path));
        }
    }
    let mut consuming_sessions = HashSet::new();
    for (session_id, wallet_id, _) in &consuming_files {
        if active_sessions.contains(session_id) || !consuming_sessions.insert(session_id.clone()) {
            return Err(api_error(
                "wallet_corrupt",
                "Conflicting mobile pairing recovery files were found.",
            ));
        }
        if registered_wallets.contains(wallet_id)
            && !committed_pairings.contains(&(session_id.clone(), *wallet_id))
        {
            return Err(api_error(
                "wallet_corrupt",
                "A mobile pairing recovery file conflicts with a registered wallet.",
            ));
        }
        let orphan = wallets_directory.join(wallet_id.to_string());
        if !registered_wallets.contains(wallet_id) && orphan.exists() {
            let metadata = fs::symlink_metadata(&orphan).map_err(internal)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(api_error(
                    "wallet_corrupt",
                    "Interrupted mobile wallet storage is not a regular directory.",
                ));
            }
        }
    }
    let mut pairing_changed = false;
    for path in temporary_files {
        fs::remove_file(path).map_err(internal)?;
        pairing_changed = true;
    }
    for (session_id, path) in active_files {
        if committed_sessions.contains(session_id.as_str()) {
            fs::remove_file(path).map_err(internal)?;
            pairing_changed = true;
        }
    }
    let mut wallets_changed = false;
    for (session_id, wallet_id, path) in consuming_files {
        if committed_pairings.contains(&(session_id.clone(), wallet_id)) {
            fs::remove_file(path).map_err(internal)?;
        } else {
            let orphan = wallets_directory.join(wallet_id.to_string());
            if orphan.exists() {
                fs::remove_dir_all(orphan).map_err(internal)?;
                wallets_changed = true;
            }
            fs::rename(path, pending_mobile_secret_path_in(directory, &session_id)?)
                .map_err(internal)?;
        }
        pairing_changed = true;
    }
    if wallets_changed && wallets_directory.exists() {
        sync_private_directory(wallets_directory)?;
    }
    if pairing_changed {
        sync_private_directory(directory)?;
    }
    Ok(())
}

fn sync_private_directory(directory: &Path) -> ApiResult<()> {
    #[cfg(unix)]
    File::open(directory)
        .and_then(|value| value.sync_all())
        .map_err(internal)?;
    Ok(())
}

fn coordination_metadata_path(app: &AppHandle, wallet_id: Uuid) -> ApiResult<PathBuf> {
    Ok(profile_directory(app, wallet_id)?.join("coordination.json"))
}

fn read_coordination_metadata(app: &AppHandle, wallet_id: Uuid) -> ApiResult<CoordinationMetadata> {
    let encoded =
        read_private_text(&coordination_metadata_path(app, wallet_id)?).map_err(|_| {
            api_error(
                "signing_unavailable",
                "This wallet has no mobile signing identity on this device.",
            )
        })?;
    serde_json::from_str(&encoded)
        .map_err(|_| api_error("wallet_corrupt", "The coordination metadata is malformed."))
}

fn comparison_code(invitation: &PairingInvitation) -> String {
    let digest = sha256::Hash::hash(
        format!(
            "groot-pairing-v1:{}:{}",
            invitation.session_id, invitation.token
        )
        .as_bytes(),
    )
    .to_byte_array();
    let value = u32::from_be_bytes(digest[..4].try_into().expect("four-byte prefix")) % 1_000_000;
    format!("{value:06}")
}

fn short_checksum(value: &[u8]) -> String {
    sha256::Hash::hash(value).to_string()[..8].to_owned()
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn invalid_payload(message: impl Into<String>) -> ApiError {
    api_error("invalid_coordination_payload", message.into())
}

fn session_missing() -> ApiError {
    api_error(
        "pairing_session_not_found",
        "This one-time pairing session is missing, expired, or was cancelled.",
    )
}

fn coordination_api_error(error: CoordinationError) -> ApiError {
    let message = match error {
        CoordinationError::TooLarge => "The coordination payload exceeds Groot's safety limit.",
        CoordinationError::InvalidToken | CoordinationError::AuthenticationFailed => {
            "The encrypted response does not authenticate to this one-time desktop invitation."
        }
        CoordinationError::InvalidSignature => {
            "The mobile signer identity proof is invalid. Nothing was paired."
        }
        CoordinationError::WrongNetwork => "The coordination payload belongs to another network.",
        CoordinationError::WrongDerivation => {
            "Groot mobile V1 requires the compiled-network BIP48 native-SegWit account."
        }
        CoordinationError::DescriptorMismatch => {
            "The final policy does not exactly contain the invited signer and agreed policy."
        }
        CoordinationError::UnsupportedVersion => "This coordination version is unsupported.",
        CoordinationError::ExpiredInvitation => {
            "This pairing invitation expired. Ask desktop for a new QR."
        }
        CoordinationError::InvalidEncoding | CoordinationError::InvalidKeyRecord => {
            "The coordination payload is malformed or unsupported."
        }
    };
    api_error(error.code(), message)
}

fn coordination_ur_api_error(error: CoordinationUrError) -> ApiError {
    let message = match error {
        CoordinationUrError::TooLarge | CoordinationUrError::TooManyFrames => {
            "The coordination QR exceeds Groot's bounded transport limits."
        }
        CoordinationUrError::WrongType => "Scan the QR requested by this exact step.",
        CoordinationUrError::Empty
        | CoordinationUrError::InvalidFrame
        | CoordinationUrError::Incomplete
        | CoordinationUrError::InvalidCbor => "The coordination QR is malformed or incomplete.",
    };
    api_error("invalid_coordination_qr", message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secure_store::SecureStoreError;
    use bdk_bitcoind_rpc::{
        bitcoincore_rpc::{jsonrpc, Auth, Client, RpcApi},
        Emitter,
    };
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        Address, Amount, FeeRate, NetworkKind, Txid,
    };
    use bdk_wallet::rusqlite::Connection;
    use std::{fs, path::PathBuf, sync::Arc};

    #[test]
    fn staging_pin_attempts_are_throttled_per_session_and_reset_on_success() {
        let state = AppState::default();
        let session = Uuid::new_v4();
        let other = Uuid::new_v4();
        let wrong: Result<Vec<u8>, SecureStoreError> = Err(SecureStoreError::InvalidCredential);

        for attempt in 0..4 {
            check_staging_auth_throttle(&state, session).unwrap_or_else(|error| {
                panic!("attempt {attempt} must not be rate limited: {}", error.code)
            });
            record_staging_attempt(&state, session, &wrong).unwrap();
        }
        record_staging_attempt(&state, session, &wrong).unwrap();
        let error = check_staging_auth_throttle(&state, session).unwrap_err();
        assert_eq!(error.code, "rate_limited");
        // Sessions are independent: another pairing session is unaffected.
        check_staging_auth_throttle(&state, other).unwrap();

        let ok: Result<Vec<u8>, SecureStoreError> = Ok(vec![1]);
        record_staging_attempt(&state, session, &ok).unwrap();
        check_staging_auth_throttle(&state, session).unwrap();
    }

    #[test]
    fn staging_pin_corruption_is_not_a_guessing_oracle() {
        let state = AppState::default();
        let session = Uuid::new_v4();
        for _ in 0..10 {
            let corrupt: Result<Vec<u8>, SecureStoreError> = Err(SecureStoreError::Corrupt);
            record_staging_attempt(&state, session, &corrupt).unwrap();
            check_staging_auth_throttle(&state, session).unwrap();
        }
    }

    struct HardwareKey {
        fingerprint: String,
        account_private: Xpriv,
        account_public: Xpub,
    }

    struct TemporaryDatabase(PathBuf);

    struct TemporaryPairingDirectory(PathBuf);

    impl TemporaryDatabase {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!(
                "groot-mobile-coordination-{}.sqlite",
                Uuid::new_v4()
            )))
        }
    }

    impl Drop for TemporaryDatabase {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.0);
            let _ = fs::remove_file(self.0.with_extension("sqlite-shm"));
            let _ = fs::remove_file(self.0.with_extension("sqlite-wal"));
        }
    }

    impl TemporaryPairingDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("groot-mobile-pairing-lifecycle-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TemporaryPairingDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn mobile_mnemonic() -> Mnemonic {
        Mnemonic::from_entropy(&[7_u8; 32]).unwrap()
    }

    fn hardware_keys() -> Vec<HardwareKey> {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
        [11_u8, 29]
            .into_iter()
            .map(|value| {
                let master = Xpriv::new_master(NetworkKind::Test, &[value; 32]).unwrap();
                let account_private = master.derive_priv(&secp, &path).unwrap();
                HardwareKey {
                    fingerprint: master.fingerprint(&secp).to_string(),
                    account_public: Xpub::from_priv(&secp, &account_private),
                    account_private,
                }
            })
            .collect()
    }

    fn coordinated_wallet() -> (
        Mnemonic,
        Vec<HardwareKey>,
        MultisigWalletDto,
        CoordinationMetadata,
    ) {
        let mnemonic = mobile_mnemonic();
        let (mobile_fingerprint, _, mobile_xpub) = derive_mobile_account(&mnemonic).unwrap();
        let hardware = hardware_keys();
        let mut cosigners = vec![CosignerInput {
            id: format!("mobile-{mobile_fingerprint}"),
            label: "This phone".to_owned(),
            fingerprint: mobile_fingerprint.to_string(),
            xpub: mobile_xpub.to_string(),
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            source: CosignerSource::Qr,
            device_type: Some(MOBILE_DEVICE_TYPE.to_owned()),
        }];
        cosigners.extend(
            hardware
                .iter()
                .enumerate()
                .map(|(index, key)| CosignerInput {
                    id: format!("hardware-{index}"),
                    label: format!("Hardware signer {}", index + 1),
                    fingerprint: key.fingerprint.clone(),
                    xpub: key.account_public.to_string(),
                    derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
                    source: CosignerSource::Virtual,
                    device_type: Some("test-hardware".to_owned()),
                }),
        );
        let preview = PolicyInput {
            name: "Mobile coordinated wallet".to_owned(),
            threshold: 2,
            cosigners,
        }
        .preview()
        .unwrap();
        let wallet_id = Uuid::new_v4().to_string();
        let wallet = MultisigWalletDto {
            kind: "multisig".to_owned(),
            name: preview.name,
            threshold: preview.threshold,
            cosigners: preview.cosigners,
            external_descriptor: preview.external_descriptor,
            internal_descriptor: preview.internal_descriptor,
            created_at: "regtest".to_owned(),
            policy_type: "standard".to_owned(),
            recovery_template: None,
            spending_paths: vec![],
        };
        let coordination = CoordinationMetadata {
            version: 1,
            wallet_id,
            role: DeviceRole::MobileCosigner,
            mobile_signer_fingerprint: Some(mobile_fingerprint.to_string()),
            key_protection: "test-only".to_owned(),
            paired_at: 1,
            pairing_session_id: Some(Uuid::new_v4().to_string()),
        };
        (mnemonic, hardware, wallet, coordination)
    }

    fn mobile_public_wallet_record(wallet: &MultisigWalletDto) -> PublicWalletRecord {
        let mobile = wallet
            .cosigners
            .iter()
            .find(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
            .unwrap();
        let descriptor = DescriptorRecord::from_descriptor_pair(
            &wallet.external_descriptor,
            &wallet.internal_descriptor,
            &first_multisig_address(wallet).unwrap(),
        )
        .unwrap();
        PublicWalletRecord {
            version: 2,
            network: NETWORK_NAME.to_owned(),
            wallet_id: Uuid::new_v4().to_string(),
            wallet_name: wallet.name.clone(),
            role: DeviceRole::MobileCosigner,
            descriptor_record: descriptor.encode(),
            descriptor_checksum: descriptor_checksum(&wallet.external_descriptor).unwrap(),
            signers: wallet.cosigners.clone(),
            mobile_signer_fingerprint: Some(mobile.fingerprint.clone()),
            created_at: 1,
        }
    }

    #[test]
    fn phone_recovery_requires_the_exact_words_and_complete_wallet_policy() {
        let (mnemonic, _, wallet, _) = coordinated_wallet();
        let record = mobile_public_wallet_record(&wallet);

        let restored = validate_mobile_wallet_record(record.clone(), &mnemonic).unwrap();
        assert_eq!(
            restored.wallet.external_descriptor,
            wallet.external_descriptor
        );
        assert_eq!(restored.wallet.cosigners, wallet.cosigners);

        let wrong_words = Mnemonic::from_entropy(&[19_u8; 32]).unwrap();
        assert_eq!(
            validate_mobile_wallet_record(record.clone(), &wrong_words)
                .unwrap_err()
                .code,
            "wallet_policy_mismatch"
        );

        let mut substituted = record;
        let mobile_index = substituted
            .signers
            .iter()
            .position(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
            .unwrap();
        let replacement_xpub = substituted.signers[(mobile_index + 1) % substituted.signers.len()]
            .xpub
            .clone();
        substituted.signers[mobile_index].xpub = replacement_xpub;
        assert_eq!(
            validate_mobile_wallet_record(substituted, &mnemonic)
                .unwrap_err()
                .code,
            "wallet_policy_mismatch"
        );
    }

    fn invitation(expires_at: u64) -> PairingInvitation {
        PairingInvitation {
            version: 1,
            session_id: Uuid::new_v4().to_string(),
            network: NETWORK_NAME.to_owned(),
            wallet_name: "Mobile coordinated wallet".to_owned(),
            threshold: 2,
            signer_count: 3,
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            token: "00112233445566778899aabbccddeeff".to_owned(),
            expires_at,
        }
    }

    fn response_frames(invitation: &PairingInvitation) -> Vec<String> {
        let mnemonic = mobile_mnemonic();
        let (fingerprint, account, _) = derive_mobile_account(&mnemonic).unwrap();
        let record =
            KeyRecord::encode_signed(&invitation.token, fingerprint, &account, "This phone")
                .unwrap();
        let envelope = EncryptedEnvelope {
            version: 1,
            session_id: invitation.session_id.clone(),
            encrypted_record: encrypt_bip129(&invitation.token, record.as_bytes()).unwrap(),
        };
        encode_coordination(
            CoordinationUrType::Bsms,
            &serde_json::to_vec(&envelope).unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn desktop_pairing_response_is_authenticated_expiring_single_use_and_memory_only() {
        let current_time = 1_000;
        let active_invitation = invitation(current_time + 60);
        let frames = response_frames(&active_invitation);
        let mut sessions = HashMap::from([(
            active_invitation.session_id.clone(),
            PendingDesktopPairing {
                invitation: active_invitation,
                accepted_signer: None,
            },
        )]);

        let signer = accept_desktop_response(&mut sessions, &frames, current_time).unwrap();
        assert_eq!(signer.label, "This phone");
        assert_eq!(signer.device_type.as_deref(), Some(MOBILE_DEVICE_TYPE));
        assert_eq!(
            accept_desktop_response(&mut sessions, &frames, current_time)
                .unwrap_err()
                .code,
            "pairing_replay"
        );

        let expired = invitation(current_time);
        let expired_frames = response_frames(&expired);
        sessions.insert(
            expired.session_id.clone(),
            PendingDesktopPairing {
                invitation: expired,
                accepted_signer: None,
            },
        );
        assert_eq!(
            accept_desktop_response(&mut sessions, &expired_frames, current_time)
                .unwrap_err()
                .code,
            "pairing_session_not_found"
        );

        let restarted = HashMap::new();
        let mut restarted = restarted;
        assert_eq!(
            accept_desktop_response(&mut restarted, &frames, current_time)
                .unwrap_err()
                .code,
            "pairing_session_not_found"
        );
    }

    #[test]
    fn desktop_pairing_rejects_a_response_authenticated_with_another_invitation() {
        let current_time = 1_000;
        let expected = invitation(current_time + 60);
        let mut substituted = expected.clone();
        substituted.token = "ffeeddccbbaa99887766554433221100".to_owned();
        let frames = response_frames(&substituted);
        let mut sessions = HashMap::from([(
            expected.session_id.clone(),
            PendingDesktopPairing {
                invitation: expected,
                accepted_signer: None,
            },
        )]);
        assert_eq!(
            accept_desktop_response(&mut sessions, &frames, current_time)
                .unwrap_err()
                .code,
            "pairing_authentication_failed"
        );
        assert!(sessions
            .values()
            .all(|pending| pending.accepted_signer.is_none()));
    }

    #[test]
    fn interrupted_mobile_pairing_restores_or_cleans_from_the_committed_session_set() {
        let directory = TemporaryPairingDirectory::new();
        let wallets = TemporaryPairingDirectory::new();
        let resumable = Uuid::new_v4().to_string();
        let committed = Uuid::new_v4().to_string();
        let committed_active = Uuid::new_v4().to_string();
        let resumable_wallet = Uuid::new_v4();
        let committed_wallet = Uuid::new_v4();
        let committed_active_wallet = Uuid::new_v4();
        let temporary = Uuid::new_v4().to_string();
        let orphan = wallets.0.join(resumable_wallet.to_string());
        fs::create_dir(&orphan).unwrap();
        fs::write(orphan.join("wallet.sqlite"), b"partial profile").unwrap();
        fs::write(
            consuming_mobile_secret_path_in(&directory.0, &resumable, resumable_wallet).unwrap(),
            b"resumable encrypted stage",
        )
        .unwrap();
        fs::write(
            consuming_mobile_secret_path_in(&directory.0, &committed, committed_wallet).unwrap(),
            b"committed encrypted stage",
        )
        .unwrap();
        fs::write(
            pending_mobile_secret_path_in(&directory.0, &committed_active).unwrap(),
            b"committed active stage",
        )
        .unwrap();
        fs::write(
            directory.0.join(format!(".secure-{temporary}.tmp")),
            b"interrupted atomic write",
        )
        .unwrap();

        reconcile_mobile_pairing_directory(
            &directory.0,
            &wallets.0,
            &HashSet::from([committed_wallet, committed_active_wallet]),
            &HashSet::from([
                (committed.clone(), committed_wallet),
                (committed_active.clone(), committed_active_wallet),
            ]),
        )
        .unwrap();

        assert_eq!(
            fs::read(pending_mobile_secret_path_in(&directory.0, &resumable).unwrap()).unwrap(),
            b"resumable encrypted stage"
        );
        assert!(!orphan.exists());
        assert!(
            !consuming_mobile_secret_path_in(&directory.0, &resumable, resumable_wallet)
                .unwrap()
                .exists()
        );
        assert!(
            !consuming_mobile_secret_path_in(&directory.0, &committed, committed_wallet)
                .unwrap()
                .exists()
        );
        assert!(
            !pending_mobile_secret_path_in(&directory.0, &committed_active)
                .unwrap()
                .exists()
        );
        assert!(!directory
            .0
            .join(format!(".secure-{temporary}.tmp"))
            .exists());
        assert_eq!(
            active_mobile_pairing_sessions(&directory.0).unwrap(),
            vec![resumable]
        );
    }

    #[test]
    fn mobile_pairing_cancel_is_idempotent_bounded_and_removes_either_lifecycle_state() {
        let directory = TemporaryPairingDirectory::new();
        let active = Uuid::new_v4().to_string();
        let consuming = Uuid::new_v4().to_string();
        let consuming_wallet = Uuid::new_v4();
        fs::write(
            pending_mobile_secret_path_in(&directory.0, &active).unwrap(),
            b"active",
        )
        .unwrap();
        fs::write(
            consuming_mobile_secret_path_in(&directory.0, &consuming, consuming_wallet).unwrap(),
            b"consuming",
        )
        .unwrap();

        cancel_mobile_pairing_storage(&directory.0, &active).unwrap();
        cancel_mobile_pairing_storage(&directory.0, &active).unwrap();
        cancel_mobile_pairing_storage(&directory.0, &consuming).unwrap();
        assert!(active_mobile_pairing_sessions(&directory.0)
            .unwrap()
            .is_empty());
        assert_eq!(
            cancel_mobile_pairing_storage(&directory.0, "../wallet")
                .unwrap_err()
                .code,
            "invalid_coordination_payload"
        );
    }

    #[test]
    fn conflicting_mobile_pairing_recovery_files_fail_without_mutation() {
        let directory = TemporaryPairingDirectory::new();
        let wallets = TemporaryPairingDirectory::new();
        let session_id = Uuid::new_v4().to_string();
        let wallet_id = Uuid::new_v4();
        let active = pending_mobile_secret_path_in(&directory.0, &session_id).unwrap();
        let consuming =
            consuming_mobile_secret_path_in(&directory.0, &session_id, wallet_id).unwrap();
        fs::write(&active, b"active").unwrap();
        fs::write(&consuming, b"consuming").unwrap();

        assert_eq!(
            reconcile_mobile_pairing_directory(
                &directory.0,
                &wallets.0,
                &HashSet::new(),
                &HashSet::new(),
            )
            .unwrap_err()
            .code,
            "wallet_corrupt"
        );
        assert_eq!(fs::read(active).unwrap(), b"active");
        assert_eq!(fs::read(consuming).unwrap(), b"consuming");
    }

    #[test]
    fn consuming_pairing_cannot_claim_an_unrelated_registered_wallet() {
        let directory = TemporaryPairingDirectory::new();
        let wallets = TemporaryPairingDirectory::new();
        let session_id = Uuid::new_v4().to_string();
        let wallet_id = Uuid::new_v4();
        let consuming =
            consuming_mobile_secret_path_in(&directory.0, &session_id, wallet_id).unwrap();
        fs::write(&consuming, b"consuming").unwrap();

        assert_eq!(
            reconcile_mobile_pairing_directory(
                &directory.0,
                &wallets.0,
                &HashSet::from([wallet_id]),
                &HashSet::new(),
            )
            .unwrap_err()
            .code,
            "wallet_corrupt"
        );
        assert_eq!(fs::read(consuming).unwrap(), b"consuming");
    }

    #[test]
    fn staged_mobile_response_is_recreated_exactly_after_restart() {
        let invitation = invitation(1_900);
        let staged = PendingMobileSecret {
            version: 1,
            invitation: invitation.clone(),
            mnemonic: Zeroizing::new(mobile_mnemonic().to_string()),
            signer_label: "Recovered phone session".to_owned(),
            backup_verified: true,
            awaiting_final_policy: true,
        };
        let first = pairing_response_from_staged(&staged).unwrap();
        let encoded = serde_json::to_vec(&staged).unwrap();
        let reopened: PendingMobileSecret = serde_json::from_slice(&encoded).unwrap();
        let second = pairing_response_from_staged(&reopened).unwrap();
        assert_eq!(first.session_id, second.session_id);
        assert_eq!(first.fingerprint, second.fingerprint);
        assert_eq!(first.xpub_checksum, second.xpub_checksum);
        assert_eq!(first.comparison_code, second.comparison_code);
        assert_eq!(first.frames, second.frames);
        assert!(first.awaiting_final_policy);
        assert!(second.awaiting_final_policy);
    }

    #[test]
    fn staged_mobile_response_defaults_legacy_pairings_to_the_response_step() {
        let legacy = serde_json::json!({
            "version": 1,
            "invitation": invitation(1_900),
            "mnemonic": mobile_mnemonic().to_string(),
            "signerLabel": "Legacy phone session",
            "backupVerified": true
        });
        let reopened: PendingMobileSecret = serde_json::from_value(legacy).unwrap();
        assert!(!reopened.awaiting_final_policy);
    }

    #[test]
    fn final_wallet_record_reports_an_incompatible_protocol_version() {
        let error = decode_public_wallet_record(br#"{"version":1}"#).unwrap_err();
        assert_eq!(error.code, "unsupported_coordination_version");
    }

    #[test]
    fn decoded_invitation_exposes_the_same_comparison_code_as_desktop() {
        let invitation = invitation(now().saturating_add(60));
        let frames = encode_coordination(
            CoordinationUrType::Invitation,
            &serde_json::to_vec(&invitation).unwrap(),
        )
        .unwrap();

        let decoded = coordination_decode_invitation(frames).unwrap();
        assert_eq!(decoded.comparison_code, comparison_code(&invitation));
        assert_eq!(
            serde_json::from_str::<PairingInvitation>(&decoded.invitation_json).unwrap(),
            invitation
        );
    }

    fn regtest_dir() -> PathBuf {
        std::env::var_os("GROOT_REGTEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.regtest"))
    }

    fn rpc() -> Client {
        let port = std::env::var("GROOT_RPC_PORT").unwrap_or_else(|_| "18443".to_owned());
        let (username, password) = Auth::CookieFile(regtest_dir().join("regtest/.cookie"))
            .get_user_pass()
            .expect("read isolated Regtest cookie");
        let mut builder = jsonrpc::minreq_http::MinreqHttpTransport::builder()
            .url(&format!("http://127.0.0.1:{port}"))
            .expect("Regtest RPC URL");
        if let Some(username) = username {
            builder = builder.basic_auth(username, password);
        }
        Client::from_jsonrpc(jsonrpc::Client::with_transport(builder.build()))
    }

    fn sync(wallet: &mut PersistedWallet<Connection>, db: &mut Connection, rpc: Arc<Client>) {
        let mut emitter = Emitter::new(
            rpc,
            wallet.latest_checkpoint(),
            0,
            wallet
                .transactions()
                .filter(|transaction| transaction.chain_position.is_unconfirmed()),
        );
        while let Some(block) = emitter.next_block().expect("next Regtest block") {
            wallet
                .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
                .expect("connect Regtest block");
            wallet.persist(db).expect("persist Regtest block");
        }
        let mempool = emitter.mempool().expect("Regtest mempool");
        wallet.apply_evicted_txs(mempool.evicted);
        wallet.apply_unconfirmed_txs(mempool.update);
        wallet.persist(db).expect("persist Regtest mempool");
    }

    fn hardware_sign(wallet: &MultisigWalletDto, key: &HardwareKey, psbt: &Psbt) -> Psbt {
        let private = key.account_private.to_string();
        let external = descriptor_without_checksum(&wallet.external_descriptor)
            .unwrap()
            .replacen(
                &format!("]{}", key.account_public),
                &format!("]{private}"),
                1,
            );
        let internal = descriptor_without_checksum(&wallet.internal_descriptor)
            .unwrap()
            .replacen(
                &format!("]{}", key.account_public),
                &format!("]{private}"),
                1,
            );
        let signer = Wallet::create(external, internal)
            .network(Network::Regtest)
            .create_wallet_no_persist()
            .unwrap();
        let mut returned = psbt.clone();
        assert!(!signer
            .sign(
                &mut returned,
                SignOptions {
                    trust_witness_utxo: true,
                    try_finalize: false,
                    ..SignOptions::default()
                },
            )
            .unwrap());
        returned
    }

    #[test]
    fn mobile_signing_adds_only_the_expected_signatures_without_private_descriptors() {
        use bdk_wallet::bitcoin::{
            absolute::LockTime, hashes::Hash, transaction::Version, OutPoint, ScriptBuf, Sequence,
            Transaction, TxIn, TxOut, Witness,
        };

        let (mnemonic, hardware, metadata, coordination) = coordinated_wallet();
        let mut coordinator = Wallet::create(
            metadata.external_descriptor.clone(),
            metadata.internal_descriptor.clone(),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
        let receive = coordinator.reveal_next_address(KeychainKind::External);
        let funding = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::from_byte_array([61_u8; 32]), 0),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(150_000),
                script_pubkey: receive.address.script_pubkey(),
            }],
        };
        coordinator.apply_unconfirmed_txs([(funding, 1)]);

        let secp = Secp256k1::new();
        let destination_key = hardware[0]
            .account_private
            .derive_priv(&secp, &DerivationPath::from_str("m/0/7").unwrap())
            .unwrap();
        let destination = Address::p2wpkh(
            &bdk_wallet::bitcoin::CompressedPublicKey(
                destination_key.private_key.public_key(&secp),
            ),
            Network::Regtest,
        );
        let mut builder = coordinator.build_tx();
        builder
            .add_recipient(destination.script_pubkey(), Amount::from_sat(50_000))
            .fee_rate(FeeRate::from_sat_per_vb(2).unwrap());
        let unsigned = builder.finish().unwrap();
        let encoded = encode_psbt(&unsigned);
        let review = review_mobile_psbt_for(&metadata, &coordination, &encoded).unwrap();

        let signed =
            sign_mobile_psbt_for(&metadata, &mnemonic, &encoded, review.revision_id).unwrap();
        let returned = decode_psbt(&signed.signed_psbt).unwrap();
        let mobile_fingerprint =
            Fingerprint::from_str(coordination.mobile_signer_fingerprint.as_deref().unwrap())
                .unwrap();
        assert!(returned.inputs.iter().all(|input| {
            input.partial_sigs.len() == 1
                && input.partial_sigs.keys().all(|public_key| {
                    input
                        .bip32_derivation
                        .get(&public_key.inner)
                        .is_some_and(|(fingerprint, _)| *fingerprint == mobile_fingerprint)
                })
        }));
        assert!(returned.inputs.iter().all(|input| {
            input.partial_sigs.values().all(|signature| {
                signature.sighash_type == bdk_wallet::bitcoin::EcdsaSighashType::All
            })
        }));
    }

    #[test]
    #[ignore = "requires the isolated Bitcoin Core regtest harness"]
    fn funded_mobile_cosigner_round_trip_reviews_merges_finalizes_and_broadcasts() {
        assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
        let (mnemonic, hardware, metadata, coordination) = coordinated_wallet();
        let database = TemporaryDatabase::new();
        let mut db = Connection::open(&database.0).unwrap();
        let mut coordinator = Wallet::create(
            metadata.external_descriptor.clone(),
            metadata.internal_descriptor.clone(),
        )
        .network(Network::Regtest)
        .create_wallet(&mut db)
        .unwrap();
        let receive = coordinator.reveal_next_address(KeychainKind::External);
        coordinator.persist(&mut db).unwrap();

        let rpc = Arc::new(rpc());
        rpc.call::<Txid>(
            "sendtoaddress",
            &[
                serde_json::json!(receive.address.to_string()),
                serde_json::json!(0.01),
            ],
        )
        .unwrap();
        let mining: Address = rpc
            .get_new_address(Some("Groot mobile coordination"), None)
            .unwrap()
            .require_network(Network::Regtest)
            .unwrap();
        rpc.generate_to_address(1, &mining).unwrap();
        sync(&mut coordinator, &mut db, Arc::clone(&rpc));
        assert_eq!(coordinator.balance().confirmed.to_sat(), 1_000_000);

        let destination = rpc
            .get_new_address(Some("Groot mobile destination"), None)
            .unwrap()
            .require_network(Network::Regtest)
            .unwrap();
        let mut builder = coordinator.build_tx();
        builder
            .add_recipient(destination.script_pubkey(), Amount::from_sat(250_000))
            .fee_rate(FeeRate::from_sat_per_vb(2).unwrap());
        let mut unsigned = builder.finish().unwrap();
        let encoded = encode_psbt(&unsigned);
        let review = review_mobile_psbt_for(&metadata, &coordination, &encoded).unwrap();
        assert_eq!(review.input_count, 1);
        assert_eq!(review.recipients.len(), 1);
        assert_eq!(review.recipients[0].amount_sats, 250_000);
        assert!(!review.change.is_empty());
        assert!(review.fee_sats > 0);

        let mut missing_utxo = unsigned.clone();
        missing_utxo.inputs[0].witness_utxo = None;
        assert_eq!(
            review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&missing_utxo))
                .unwrap_err()
                .code,
            "malformed_psbt"
        );

        let mut foreign_input = unsigned.clone();
        foreign_input.inputs[0]
            .witness_utxo
            .as_mut()
            .unwrap()
            .script_pubkey = destination.script_pubkey();
        assert_eq!(
            review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&foreign_input))
                .unwrap_err()
                .code,
            "proposal_mismatch"
        );

        let mut wrong_sighash = unsigned.clone();
        wrong_sighash.inputs[0].sighash_type =
            Some(bdk_wallet::bitcoin::psbt::PsbtSighashType::from(
                bdk_wallet::bitcoin::EcdsaSighashType::Single,
            ));
        assert_eq!(
            review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&wrong_sighash))
                .unwrap_err()
                .code,
            "unsupported_sighash"
        );

        let recipient_index = unsigned
            .unsigned_tx
            .output
            .iter()
            .position(|output| output.script_pubkey == destination.script_pubkey())
            .unwrap();
        let mobile_fingerprint =
            Fingerprint::from_str(coordination.mobile_signer_fingerprint.as_deref().unwrap())
                .unwrap();
        let (public_key, derivation) = unsigned.inputs[0]
            .bip32_derivation
            .iter()
            .find(|(_, (fingerprint, _))| *fingerprint == mobile_fingerprint)
            .map(|(public_key, derivation)| (*public_key, derivation.clone()))
            .unwrap();
        let mut false_change = unsigned.clone();
        false_change.outputs[recipient_index]
            .bip32_derivation
            .insert(public_key, derivation);
        assert_eq!(
            review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&false_change))
                .unwrap_err()
                .code,
            "proposal_mismatch"
        );

        let mut stale = unsigned.clone();
        stale.unsigned_tx.output[recipient_index].value = Amount::from_sat(249_999);
        assert_eq!(
            sign_mobile_psbt_for(
                &metadata,
                &mnemonic,
                &encode_psbt(&stale),
                review.revision_id.clone(),
            )
            .unwrap_err()
            .code,
            "proposal_mismatch"
        );

        let signed =
            sign_mobile_psbt_for(&metadata, &mnemonic, &encoded, review.revision_id.clone())
                .unwrap();
        assert_eq!(signed.revision_id, review.revision_id);
        assert!(!signed.frames.is_empty());
        let mobile_returned = decode_psbt(&signed.signed_psbt).unwrap();
        let allowed = metadata
            .cosigners
            .iter()
            .map(|signer| Fingerprint::from_str(&signer.fingerprint).unwrap())
            .collect::<Vec<_>>();
        let progress = merge_signed_psbt(&mut unsigned, mobile_returned, &allowed, 2).unwrap();
        assert_eq!(progress.signed, 1);
        assert!(!progress.can_finalize);

        let hardware_returned = hardware_sign(&metadata, &hardware[0], &unsigned);
        let progress = merge_signed_psbt(&mut unsigned, hardware_returned, &allowed, 2).unwrap();
        assert_eq!(progress.signed, 2);
        assert!(progress.can_finalize);
        assert!(coordinator
            .finalize_psbt(&mut unsigned, SignOptions::default())
            .unwrap());
        let transaction = unsigned.extract_tx().unwrap();
        let txid = rpc.send_raw_transaction(&transaction).unwrap();
        assert_eq!(txid, transaction.compute_txid());
        assert!(rpc.get_mempool_entry(&txid).is_ok());
    }

    #[test]
    fn mobile_review_fails_closed_for_watch_only_and_revision_substitution() {
        let (mnemonic, _, metadata, mut coordination) = coordinated_wallet();
        coordination.role = DeviceRole::MobileWatchOnly;
        assert_eq!(
            review_mobile_psbt_for(&metadata, &coordination, "not-a-psbt")
                .unwrap_err()
                .code,
            "signing_unavailable"
        );

        let empty = Psbt::from_unsigned_tx(Transaction {
            version: bdk_wallet::bitcoin::transaction::Version::TWO,
            lock_time: bdk_wallet::bitcoin::absolute::LockTime::ZERO,
            input: vec![],
            output: vec![],
        })
        .unwrap();
        assert_eq!(
            sign_mobile_psbt_for(
                &metadata,
                &mnemonic,
                &encode_psbt(&empty),
                "stale-revision".to_owned(),
            )
            .unwrap_err()
            .code,
            "proposal_mismatch"
        );
    }

    #[test]
    fn phone_key_health_check_is_bound_to_the_saved_wallet_identity() {
        let (mnemonic, _, mut wallet, coordination) = coordinated_wallet();
        let expected = coordination.mobile_signer_fingerprint.as_deref().unwrap();
        assert!(mobile_signer_matches_wallet(&wallet, expected, &mnemonic).unwrap());
        assert!(!mobile_signer_matches_wallet(&wallet, "00000000", &mnemonic).unwrap());

        let foreign_xpub = wallet.cosigners[0].xpub.clone();
        let local = wallet
            .cosigners
            .iter_mut()
            .find(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
            .unwrap();
        local.xpub = foreign_xpub;
        assert!(!mobile_signer_matches_wallet(&wallet, expected, &mnemonic).unwrap());
    }
}
