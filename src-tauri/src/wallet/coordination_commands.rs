use super::*;
use crate::{
    coordination::{
        decrypt_bip129, derive_mobile_account, encrypt_bip129, CoordinationError, DeviceRole,
        KeyRecord, MobileAccount, PairingInvitation, PublicWalletRecord, PAIRING_SESSION_SECONDS,
    },
    coordination_transport::{self, CoordinationUrType},
};

const FRAGMENT_BYTES: usize = 220;
const MOBILE_RESPONSE_FRAGMENT_BYTES: usize = 160;
const MOBILE_DEVICE_TYPE: &str = "groot-mobile";

#[path = "coordination_commands/dto.rs"]
mod dto;
#[path = "coordination_commands/error_translation.rs"]
mod error_translation;
#[path = "coordination_commands/pairing_storage.rs"]
mod pairing_storage;
pub(crate) use dto::PendingDesktopPairing;
pub use dto::{
    CoordinationMetadata, CoordinationStatusDto, DecodedPairingInvitationDto, MobileOutputDto,
    MobilePsbtReviewDto, MobileRecoveryRecordDto, PairingInvitationDto, PairingResponseDto,
    PendingMobilePairingDto, SignedMobilePsbtDto,
};
use dto::{EncryptedEnvelope, PendingMobileSecret, ValidatedMobileWallet};
use error_translation::*;
use pairing_storage::*;

pub(crate) fn reconcile_mobile_pairing_storage(app: &AppHandle) -> ApiResult<()> {
    reconcile_mobile_pairing_storage_impl(app)
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
    let credential = Zeroizing::new(credential);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
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
    let credential = Zeroizing::new(credential);
    let _operation = operation_guard(&state)?;
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
    let credential = Zeroizing::new(credential);
    let _operation = operation_guard(&state)?;
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
    let credential = Zeroizing::new(credential);
    let _operation = operation_guard(&state)?;
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
        let permit = database_open_permit_for_new_wallet(&state)?;
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"), &permit)?;
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
    let credential = Zeroizing::new(credential);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
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
            let permit = database_open_permit_for_new_wallet(&state)?;
            let mut db = open_wallet_database(&dir.join("wallet.sqlite"), &permit)?;
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
    let credential = Zeroizing::new(credential);
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
    check_auth_throttle(&app, &state)?;
    let loaded = secure_store::load(
        &profile_directory(&app, profile.id)?.join("mobile-signer.json"),
        credential.as_str(),
    )
    .map_err(secure_store_error);
    record_auth_result(&app, &state, &loaded)?;
    let loaded = loaded?;
    let mut words = Zeroizing::new(String::from_utf8(loaded.to_vec()).map_err(internal)?);
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
    let credential = Zeroizing::new(credential);
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
    check_auth_throttle(&app, &state)?;
    let loaded = secure_store::load(
        &profile_directory(&app, profile.id)?.join("mobile-signer.json"),
        credential.as_str(),
    )
    .map_err(secure_store_error);
    record_auth_result(&app, &state, &loaded)?;
    let loaded = loaded?;
    let mut words = Zeroizing::new(String::from_utf8(loaded.to_vec()).map_err(internal)?);
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

#[cfg(test)]
#[path = "coordination_commands/tests.rs"]
mod tests;
