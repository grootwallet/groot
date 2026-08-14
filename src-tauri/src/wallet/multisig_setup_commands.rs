use super::*;

const MULTISIG_SETUP_DRAFT_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultisigSetupStage {
    Policy,
    Keys,
    Review,
    Backup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultisigSetupTemplate {
    Standard,
    Recovery,
    Inheritance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultisigSetupRecipe {
    TwoOfThree,
    ThreeOfFive,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPolicyVerification {
    signer_fingerprint: String,
    device_type: String,
    verified_at: String,
    displayed_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigSetupDraft {
    version: u8,
    stage: MultisigSetupStage,
    template_kind: MultisigSetupTemplate,
    standard_recipe: MultisigSetupRecipe,
    custom_cosigner_count: usize,
    name: String,
    threshold: usize,
    cosigners: Vec<CosignerInput>,
    descriptor_saved: bool,
    coldcard_registered: bool,
    policy_verification_deferred: bool,
    policy_verifications: Vec<DraftPolicyVerification>,
    updated_at: u64,
}

fn multisig_setup_draft_path(app: &AppHandle) -> ApiResult<PathBuf> {
    Ok(app_data_dir(app)?.join("multisig-setup-draft.json"))
}

fn expected_setup_cosigners(draft: &MultisigSetupDraft) -> usize {
    match draft.template_kind {
        MultisigSetupTemplate::Recovery | MultisigSetupTemplate::Inheritance => 4,
        MultisigSetupTemplate::Standard => match draft.standard_recipe {
            MultisigSetupRecipe::TwoOfThree => 3,
            MultisigSetupRecipe::ThreeOfFive => 5,
            MultisigSetupRecipe::Custom => draft.custom_cosigner_count,
        },
    }
}

fn preview_multisig_setup_draft(draft: &MultisigSetupDraft) -> ApiResult<MultisigPreviewDto> {
    let policy = PolicyInput {
        name: draft.name.clone(),
        threshold: draft.threshold,
        cosigners: draft.cosigners.clone(),
    };
    let standard_preview = policy.preview().map_err(policy_api_error)?;
    if matches!(draft.template_kind, MultisigSetupTemplate::Standard) {
        return Ok(standard_preview);
    }
    let signer_ids = draft
        .cosigners
        .iter()
        .map(|cosigner| cosigner.id.clone())
        .collect::<Vec<_>>();
    let template = RecoveryTemplate::Recovery {
        immediate: crate::recovery::SpendingPath::new(2, signer_ids[..3].to_vec()),
        recovery: crate::recovery::TimedSpendingPath::new(
            if matches!(draft.template_kind, MultisigSetupTemplate::Inheritance) {
                52_560
            } else {
                4_320
            },
            1,
            [signer_ids[3].clone()],
        ),
    };
    let analysis = analyze_template(&template, &draft.cosigners).map_err(recovery_api_error)?;
    Ok(MultisigPreviewDto {
        name: standard_preview.name,
        threshold: 2,
        cosigners: draft.cosigners.clone(),
        external_descriptor: analysis.external_descriptor,
        internal_descriptor: analysis.internal_descriptor,
    })
}

fn validate_multisig_setup_draft(
    draft: &MultisigSetupDraft,
) -> ApiResult<Option<MultisigPreviewDto>> {
    if draft.version != MULTISIG_SETUP_DRAFT_VERSION
        || draft.name.chars().count() > 48
        || !(3..=7).contains(&draft.custom_cosigner_count)
        || draft.cosigners.len() > 7
        || draft.policy_verifications.len() > 7
    {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig setup is invalid. Discard it and start again.",
        ));
    }
    reject_virtual_cosigners(&draft.cosigners)?;
    for cosigner in &draft.cosigners {
        cosigner.parse_for_validation().map_err(policy_api_error)?;
    }
    let unique_ids = draft
        .cosigners
        .iter()
        .map(|item| item.id.as_str())
        .collect::<HashSet<_>>();
    let unique_fingerprints = draft
        .cosigners
        .iter()
        .map(|item| item.fingerprint.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    let unique_xpubs = draft
        .cosigners
        .iter()
        .map(|item| item.xpub.as_str())
        .collect::<HashSet<_>>();
    if unique_ids.len() != draft.cosigners.len()
        || unique_fingerprints.len() != draft.cosigners.len()
        || unique_xpubs.len() != draft.cosigners.len()
    {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig setup contains duplicate signers.",
        ));
    }
    let expected_cosigners = expected_setup_cosigners(draft);
    let fixed_threshold_is_valid = match (draft.template_kind, draft.standard_recipe) {
        (MultisigSetupTemplate::Standard, MultisigSetupRecipe::TwoOfThree) => draft.threshold == 2,
        (MultisigSetupTemplate::Standard, MultisigSetupRecipe::ThreeOfFive) => draft.threshold == 3,
        (MultisigSetupTemplate::Standard, MultisigSetupRecipe::Custom) => true,
        (MultisigSetupTemplate::Recovery | MultisigSetupTemplate::Inheritance, _) => {
            draft.threshold == 2
        }
    };
    if draft.threshold < 2 || draft.threshold > expected_cosigners || !fixed_threshold_is_valid {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig threshold is invalid.",
        ));
    }
    if draft.cosigners.is_empty() {
        if matches!(
            draft.stage,
            MultisigSetupStage::Review | MultisigSetupStage::Backup
        ) || draft.descriptor_saved
            || draft.coldcard_registered
            || draft.policy_verification_deferred
            || !draft.policy_verifications.is_empty()
        {
            return Err(api_error(
                "wallet_corrupt",
                "The saved multisig setup has an impossible step.",
            ));
        }
        if matches!(draft.stage, MultisigSetupStage::Keys) && draft.name.trim().is_empty() {
            return Err(api_error(
                "wallet_corrupt",
                "The saved multisig setup has no wallet name.",
            ));
        }
        return Ok(None);
    }
    if draft.name.trim().is_empty() {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig setup has no wallet name.",
        ));
    }
    let complete = draft.cosigners.len() == expected_cosigners;
    if ((draft.descriptor_saved
        || draft.coldcard_registered
        || draft.policy_verification_deferred
        || !draft.policy_verifications.is_empty())
        && !complete)
        || ((draft.coldcard_registered
            || draft.policy_verification_deferred
            || !draft.policy_verifications.is_empty())
            && !draft.descriptor_saved)
        || (!matches!(draft.template_kind, MultisigSetupTemplate::Standard)
            && !draft.policy_verifications.is_empty())
    {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig setup has inconsistent progress.",
        ));
    }
    if matches!(
        draft.stage,
        MultisigSetupStage::Review | MultisigSetupStage::Backup
    ) && !complete
    {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig setup is missing signers.",
        ));
    }
    if !complete {
        return Ok(None);
    }
    let preview = preview_multisig_setup_draft(draft)?;
    if draft.policy_verifications.is_empty() {
        return Ok(Some(preview));
    }
    let address = hardware_commands::policy_verification_address(&MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: preview.name.clone(),
        threshold: preview.threshold,
        cosigners: preview.cosigners.clone(),
        external_descriptor: preview.external_descriptor.clone(),
        internal_descriptor: preview.internal_descriptor.clone(),
        created_at: String::new(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: Vec::new(),
    })?;
    let mut verified = HashSet::new();
    for verification in &draft.policy_verifications {
        let fingerprint = verification.signer_fingerprint.to_ascii_lowercase();
        if !unique_fingerprints.contains(&fingerprint)
            || !verified.insert(fingerprint)
            || verification.device_type.is_empty()
            || verification.device_type.len() > 64
            || verification.verified_at.len() > 20
            || verification.verified_at.parse::<u64>().is_err()
            || !hardware_display_matches_expected_address(
                &address.canonical_address,
                &verification.displayed_address,
            )
        {
            return Err(api_error(
                "wallet_corrupt",
                "The saved multisig verification evidence is invalid.",
            ));
        }
    }
    Ok(Some(preview))
}

fn draft_verifications_match_pending(
    draft: &MultisigSetupDraft,
    preview: Option<&MultisigPreviewDto>,
    pending: &HashMap<String, SignerPolicyVerificationDto>,
) -> ApiResult<()> {
    if draft.policy_verifications.is_empty() {
        return Ok(());
    }
    let preview = preview.ok_or_else(|| {
        api_error(
            "hardware_verification_invalid",
            "Hardware policy verification does not match this multisig setup.",
        )
    })?;
    let checksum = descriptor_checksum(&preview.external_descriptor)?;
    for verification in &draft.policy_verifications {
        let key = format!(
            "{}:{}",
            checksum,
            verification.signer_fingerprint.to_ascii_lowercase()
        );
        let matches = pending.get(&key).is_some_and(|native| {
            native
                .signer_fingerprint
                .eq_ignore_ascii_case(&verification.signer_fingerprint)
                && native.device_type == verification.device_type
                && native.verified_at == verification.verified_at
                && native.scope == "policy_and_address"
                && native.displayed_address.as_deref()
                    == Some(verification.displayed_address.as_str())
        });
        if !matches {
            return Err(api_error(
                "hardware_verification_invalid",
                "Hardware policy verification must come from the connected signer.",
            ));
        }
    }
    Ok(())
}

fn sync_pending_draft_verifications(
    state: &AppState,
    draft: &MultisigSetupDraft,
    preview: Option<&MultisigPreviewDto>,
) -> ApiResult<()> {
    let mut pending = state
        .pending_policy_verifications
        .lock()
        .map_err(internal)?;
    pending.clear();
    let Some(preview) = preview else {
        return Ok(());
    };
    let checksum = descriptor_checksum(&preview.external_descriptor)?;
    for verification in &draft.policy_verifications {
        pending.insert(
            format!(
                "{}:{}",
                checksum,
                verification.signer_fingerprint.to_ascii_lowercase()
            ),
            SignerPolicyVerificationDto {
                signer_fingerprint: verification.signer_fingerprint.clone(),
                device_type: verification.device_type.clone(),
                verified_at: verification.verified_at.clone(),
                scope: "policy_and_address",
                displayed_address: Some(verification.displayed_address.clone()),
            },
        );
    }
    Ok(())
}

fn clear_multisig_setup_draft_path(path: &Path) -> ApiResult<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(internal("The multisig setup draft is not a regular file."))
        }
        Ok(_) => {
            fs::remove_file(path).map_err(internal)?;
            #[cfg(unix)]
            if let Some(parent) = path.parent() {
                File::open(parent)
                    .and_then(|directory| directory.sync_all())
                    .map_err(internal)?;
            }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(internal(error)),
    }
}

pub(crate) fn clear_multisig_setup_draft(app: &AppHandle) -> ApiResult<()> {
    clear_multisig_setup_draft_path(&multisig_setup_draft_path(app)?)
}

pub(crate) fn coldcard_registration_for_preview(
    app: &AppHandle,
    preview: &MultisigPreviewDto,
) -> ApiResult<bool> {
    let path = multisig_setup_draft_path(app)?;
    if !path.exists() {
        return Ok(false);
    }
    let encoded = read_private_text(&path)?;
    let draft: MultisigSetupDraft = serde_json::from_str(&encoded).map_err(|_| {
        api_error(
            "wallet_corrupt",
            "The saved multisig setup is corrupt. Discard it and start again.",
        )
    })?;
    let saved_preview = validate_multisig_setup_draft(&draft)?
        .ok_or_else(|| api_error("wallet_corrupt", "The saved multisig setup is incomplete."))?;
    if saved_preview.external_descriptor != preview.external_descriptor
        || saved_preview.internal_descriptor != preview.internal_descriptor
    {
        return Err(api_error(
            "wallet_corrupt",
            "The saved multisig setup does not match the wallet being created.",
        ));
    }
    Ok(draft.coldcard_registered)
}

#[tauri::command]
pub fn multisig_setup_draft(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Option<MultisigSetupDraft>> {
    let _operation = operation_guard(&state)?;
    let path = multisig_setup_draft_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let encoded = read_private_text(&path)?;
    let draft: MultisigSetupDraft = serde_json::from_str(&encoded).map_err(|_| {
        api_error(
            "wallet_corrupt",
            "The saved multisig setup is corrupt. Discard it and start again.",
        )
    })?;
    let preview = validate_multisig_setup_draft(&draft)?;
    sync_pending_draft_verifications(&state, &draft, preview.as_ref())?;
    Ok(Some(draft))
}

#[tauri::command]
pub fn multisig_setup_draft_save(
    app: AppHandle,
    state: State<'_, AppState>,
    mut draft: MultisigSetupDraft,
) -> ApiResult<MultisigSetupDraft> {
    let _operation = operation_guard(&state)?;
    draft.version = MULTISIG_SETUP_DRAFT_VERSION;
    draft.updated_at = now();
    let preview = validate_multisig_setup_draft(&draft)?;
    {
        let pending = state
            .pending_policy_verifications
            .lock()
            .map_err(internal)?;
        draft_verifications_match_pending(&draft, preview.as_ref(), &pending)?;
    }
    write_private_json(&multisig_setup_draft_path(&app)?, &draft)?;
    sync_pending_draft_verifications(&state, &draft, preview.as_ref())?;
    Ok(draft)
}

#[tauri::command]
pub fn multisig_setup_draft_discard(app: AppHandle, state: State<'_, AppState>) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    clear_multisig_setup_draft(&app)?;
    state
        .pending_policy_verifications
        .lock()
        .map_err(internal)?
        .clear();
    Ok(())
}

#[cfg(test)]
mod setup_draft_tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        NetworkKind,
    };
    use std::str::FromStr;

    fn cosigners(count: u8) -> Vec<CosignerInput> {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
        (1_u8..=count)
            .map(|index| {
                let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).unwrap();
                let account = master.derive_priv(&secp, &path).unwrap();
                CosignerInput {
                    id: format!("draft-{index}"),
                    label: format!("Signer {index}"),
                    fingerprint: master.fingerprint(&secp).to_string(),
                    xpub: Xpub::from_priv(&secp, &account).to_string(),
                    derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
                    source: CosignerSource::Manual,
                    device_type: None,
                }
            })
            .collect()
    }

    fn draft() -> MultisigSetupDraft {
        MultisigSetupDraft {
            version: 1,
            stage: MultisigSetupStage::Backup,
            template_kind: MultisigSetupTemplate::Standard,
            standard_recipe: MultisigSetupRecipe::TwoOfThree,
            custom_cosigner_count: 3,
            name: "Resumable wallet".to_owned(),
            threshold: 2,
            cosigners: cosigners(3),
            descriptor_saved: true,
            coldcard_registered: false,
            policy_verification_deferred: false,
            policy_verifications: Vec::new(),
            updated_at: 1,
        }
    }

    #[test]
    fn accepts_a_complete_public_only_resumable_setup() {
        let draft = draft();
        assert!(validate_multisig_setup_draft(&draft).unwrap().is_some());
        let encoded = serde_json::to_string(&draft).unwrap();
        for forbidden in [
            "credential",
            "passphrase",
            "pinChallenge",
            "devicePath",
            "mnemonic",
        ] {
            assert!(!encoded.contains(forbidden));
        }
    }

    #[test]
    fn accepts_the_signer_step_before_the_first_signer_is_added() {
        let mut draft = draft();
        draft.stage = MultisigSetupStage::Keys;
        draft.cosigners.clear();
        draft.descriptor_saved = false;

        assert!(validate_multisig_setup_draft(&draft).unwrap().is_none());
    }

    #[test]
    fn rejects_impossible_steps_and_duplicate_signers() {
        let mut incomplete = draft();
        incomplete.cosigners.pop();
        assert_eq!(
            validate_multisig_setup_draft(&incomplete).unwrap_err().code,
            "wallet_corrupt"
        );

        let mut duplicate = draft();
        duplicate.cosigners[1] = duplicate.cosigners[0].clone();
        assert_eq!(
            validate_multisig_setup_draft(&duplicate).unwrap_err().code,
            "wallet_corrupt"
        );

        let mut forged_progress = draft();
        forged_progress.stage = MultisigSetupStage::Review;
        forged_progress.coldcard_registered = true;
        forged_progress.descriptor_saved = false;
        assert_eq!(
            validate_multisig_setup_draft(&forged_progress)
                .unwrap_err()
                .code,
            "wallet_corrupt"
        );
    }

    #[test]
    fn atomically_round_trips_updates_and_discards_a_restart_draft() {
        let directory =
            std::env::temp_dir().join(format!("groot-multisig-draft-{}", Uuid::new_v4()));
        let path = directory.join("multisig-setup-draft.json");
        let mut original = draft();
        write_private_json(&path, &original).unwrap();

        let restored: MultisigSetupDraft =
            serde_json::from_str(&read_private_text(&path).unwrap()).unwrap();
        assert_eq!(restored.cosigners.len(), 3);
        assert!(restored.descriptor_saved);
        assert!(validate_multisig_setup_draft(&restored).unwrap().is_some());

        original.stage = MultisigSetupStage::Review;
        original.descriptor_saved = false;
        write_private_json(&path, &original).unwrap();
        let updated: MultisigSetupDraft =
            serde_json::from_str(&read_private_text(&path).unwrap()).unwrap();
        assert_eq!(updated.stage, MultisigSetupStage::Review);
        assert!(!updated.descriptor_saved);

        clear_multisig_setup_draft_path(&path).unwrap();
        assert!(!path.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn accepts_only_native_hardware_verification_evidence() {
        let preview = validate_multisig_setup_draft(&draft()).unwrap().unwrap();
        let checksum = descriptor_checksum(&preview.external_descriptor).unwrap();
        let fingerprint = preview.cosigners[0].fingerprint.to_ascii_lowercase();
        let verification_address =
            hardware_commands::policy_verification_address(&MultisigWalletDto {
                kind: "multisig".to_owned(),
                name: preview.name.clone(),
                threshold: preview.threshold,
                cosigners: preview.cosigners.clone(),
                external_descriptor: preview.external_descriptor.clone(),
                internal_descriptor: preview.internal_descriptor.clone(),
                created_at: String::new(),
                policy_type: "standard".to_owned(),
                recovery_template: None,
                spending_paths: Vec::new(),
            })
            .unwrap();
        let displayed_address = verification_address
            .testnet_alias
            .expect("regtest policy address has a testnet alias")
            .to_ascii_uppercase();
        let evidence = DraftPolicyVerification {
            signer_fingerprint: fingerprint.clone(),
            device_type: "bitbox02".to_owned(),
            verified_at: "123".to_owned(),
            displayed_address: displayed_address.clone(),
        };
        let mut verified_draft = draft();
        verified_draft.policy_verifications = vec![evidence];
        verified_draft.stage = MultisigSetupStage::Review;
        assert!(validate_multisig_setup_draft(&verified_draft).is_ok());
        let mut pending = HashMap::new();
        pending.insert(
            format!("{checksum}:{fingerprint}"),
            SignerPolicyVerificationDto {
                signer_fingerprint: fingerprint,
                device_type: "bitbox02".to_owned(),
                verified_at: "123".to_owned(),
                scope: "policy_and_address",
                displayed_address: Some(displayed_address),
            },
        );
        assert!(
            draft_verifications_match_pending(&verified_draft, Some(&preview), &pending).is_ok()
        );

        verified_draft.policy_verifications[0].verified_at = "124".to_owned();
        assert_eq!(
            draft_verifications_match_pending(&verified_draft, Some(&preview), &pending)
                .unwrap_err()
                .code,
            "hardware_verification_invalid"
        );
    }

    #[test]
    fn rebuilds_recovery_and_inheritance_descriptors_from_the_saved_template() {
        for (template_kind, delay) in [
            (MultisigSetupTemplate::Recovery, "older(4320)"),
            (MultisigSetupTemplate::Inheritance, "older(52560)"),
        ] {
            let mut recovery = draft();
            recovery.template_kind = template_kind;
            recovery.cosigners = cosigners(4);
            recovery.policy_verifications.clear();
            let preview = validate_multisig_setup_draft(&recovery).unwrap().unwrap();
            assert!(preview.external_descriptor.contains(delay));
        }
    }
}

#[tauri::command]
pub fn multisig_preview(policy: PolicyInput) -> ApiResult<MultisigPreviewDto> {
    reject_virtual_cosigners(&policy.cosigners)?;
    policy.preview().map_err(policy_api_error)
}

#[tauri::command]
pub fn recovery_policy_analyze(
    template: RecoveryTemplate,
    cosigners: Vec<crate::multisig::CosignerInput>,
) -> ApiResult<PolicyAnalysis> {
    reject_virtual_cosigners(&cosigners)?;
    analyze_template(&template, &cosigners).map_err(recovery_api_error)
}

#[tauri::command]
pub fn multisig_wallet(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Option<MultisigWalletDto>> {
    let _operation = operation_guard(&state)?;
    let registry = load_registry(&app)?;
    let Some(selected) = registry.selected_wallet_id else {
        return Ok(None);
    };
    let Some(profile) = registry.wallets.iter().find(|wallet| wallet.id == selected) else {
        return Err(registry_api_error(RegistryError::UnknownSelection));
    };
    if profile.kind != WalletKind::Multisig {
        return Ok(None);
    }
    require_unlocked(&app, &state)?;
    let path = multisig_metadata_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let encoded = read_private_text(&path)?;
    serde_json::from_str(&encoded).map(Some).map_err(internal)
}

#[tauri::command]
pub fn multisig_export(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<String> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    authorize_multisig_operation(&app, &state, credential.as_str())?;
    let backup = MultisigBackupDto {
        version: 1,
        network: NETWORK_NAME.to_owned(),
        wallet: read_multisig_metadata(&app)?,
    };
    serde_json::to_string_pretty(&backup).map_err(internal)
}

#[tauri::command]
pub fn multisig_export_bsms(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
) -> ApiResult<String> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    authorize_multisig_operation(&app, &state, credential.as_str())?;
    let wallet = read_multisig_metadata(&app)?;
    let first_address = first_multisig_address(&wallet)?;
    DescriptorRecord::from_descriptor_pair(
        &wallet.external_descriptor,
        &wallet.internal_descriptor,
        &first_address,
    )
    .map(|record| record.encode())
    .map_err(bsms_api_error)
}

pub(crate) fn parse_public_descriptor_record(encoded: &str) -> ApiResult<DescriptorRecord> {
    if encoded.trim_start().starts_with("BSMS 1.0") {
        return DescriptorRecord::parse(encoded).map_err(bsms_api_error);
    }
    let pair = PublicDescriptorPair::parse(encoded).map_err(public_descriptor_api_error)?;
    let mut wallet = Wallet::create(
        pair.external_descriptor.clone(),
        pair.internal_descriptor.clone(),
    )
    .network(NETWORK)
    .create_wallet_no_persist()
    .map_err(|_| {
        api_error(
            "invalid_backup",
            "The public descriptors are not valid for this Bitcoin network.",
        )
    })?;
    let first_address = wallet
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string();
    DescriptorRecord::from_descriptor_pair(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        &first_address,
    )
    .map_err(public_descriptor_api_error)
}

#[tauri::command]
pub fn multisig_bsms_inspect(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
) -> ApiResult<RecoveryDrillDto> {
    let record = parse_public_descriptor_record(&encoded_backup)?;
    let (external_descriptor, internal_descriptor) =
        record.descriptor_pair().map_err(bsms_api_error)?;
    let mut derived = Wallet::create(external_descriptor.clone(), internal_descriptor.clone())
        .network(NETWORK)
        .create_wallet_no_persist()
        .map_err(|_| {
            api_error(
                "invalid_backup",
                "The public descriptors are not valid for this Bitcoin network.",
            )
        })?;
    let derived_first = derived
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string();
    if derived_first != record.first_address {
        return Err(api_error(
            "backup_mismatch",
            "The backup's first address does not match its descriptor.",
        ));
    }
    let current_wallet = read_multisig_metadata(&app).ok();
    let matches_current_wallet = current_wallet
        .as_ref()
        .map(|wallet| {
            record.matches_descriptor_pair(&wallet.external_descriptor, &wallet.internal_descriptor)
        })
        .transpose()
        .map_err(bsms_api_error)?
        .unwrap_or(false);
    if matches_current_wallet {
        let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
        let descriptor = current_wallet
            .as_ref()
            .map(|wallet| wallet.external_descriptor.clone())
            .ok_or_else(|| api_error("wallet_not_found", "No multisig wallet exists."))?;
        state
            .verified_recovery
            .lock()
            .map_err(internal)?
            .insert(wallet_id, descriptor);
    }
    Ok(RecoveryDrillDto {
        first_address: derived_first,
        matches_current_wallet,
    })
}

#[tauri::command]
pub fn multisig_recover_bsms(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    encoded_backup: String,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let record = parse_public_descriptor_record(&encoded_backup)?;
    let (threshold, keys) = record.standard_policy().map_err(bsms_api_error)?;
    let cosigners = keys
        .into_iter()
        .enumerate()
        .map(|(index, key)| CosignerInput {
            id: format!("bsms-{}", key.fingerprint),
            label: format!("Signer {}", index + 1),
            fingerprint: key.fingerprint.to_string(),
            xpub: key.xpub.to_string(),
            derivation_path: key.derivation_path,
            source: CosignerSource::Manual,
            device_type: None,
        })
        .collect::<Vec<_>>();
    let preview = PolicyInput {
        name,
        threshold,
        cosigners,
    }
    .preview()
    .map_err(policy_api_error)?;
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
    if first_multisig_address(&wallet)? != record.first_address {
        return Err(api_error(
            "backup_mismatch",
            "The backup's first address does not match its descriptor.",
        ));
    }
    let (id, dir) = prepare_profile_directory(&app)?;
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

        let marker = format!("groot-multisig:{}", wallet.external_descriptor);
        secure_store::store(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        write_private_json(&dir.join("wallet.json"), &wallet)?;
        commit_multisig_profile(&app, id, &wallet)?;
        Ok(wallet)
    })();
    if result.is_err() {
        cleanup_failed_profile(&dir)?;
    }
    let wallet = result?;
    unlock_selected(&app, &state)?;
    reset_auth_throttle(&app, &state)?;
    Ok(wallet)
}

#[tauri::command]
pub fn multisig_recovery_drill(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
) -> ApiResult<RecoveryDrillDto> {
    let _operation = operation_guard(&state)?;
    let backup = validate_multisig_backup(&encoded_backup)?;
    let first_address = first_multisig_address(&backup.wallet)?;
    let matches_current_wallet = read_multisig_metadata(&app)
        .and_then(|wallet| first_multisig_address(&wallet))
        .map(|current| current == first_address)
        .unwrap_or(false);
    if matches_current_wallet {
        let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
        state
            .verified_recovery
            .lock()
            .map_err(internal)?
            .insert(wallet_id, backup.wallet.external_descriptor.clone());
    }
    Ok(RecoveryDrillDto {
        first_address,
        matches_current_wallet,
    })
}

#[tauri::command]
pub fn multisig_recovery_drill_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<bool> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let wallet = read_multisig_metadata(&app)?;
    let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
    Ok(state
        .verified_recovery
        .lock()
        .map_err(internal)?
        .get(&wallet_id)
        .is_some_and(|descriptor| descriptor == &wallet.external_descriptor))
}

#[tauri::command]
pub fn multisig_recover(
    app: AppHandle,
    state: State<'_, AppState>,
    encoded_backup: String,
    credential: String,
) -> ApiResult<MultisigWalletDto> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    validate_credential(credential.as_str())?;
    let backup = validate_multisig_backup(&encoded_backup)?;
    let (id, dir) = prepare_profile_directory(&app)?;
    let result = (|| {
        let mut db = open_wallet_database(&dir.join("wallet.sqlite"))?;
        init_app_schema(&db)?;
        Wallet::create(
            backup.wallet.external_descriptor.clone(),
            backup.wallet.internal_descriptor.clone(),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .map_err(internal)?;
        let marker = format!("groot-multisig:{}", backup.wallet.external_descriptor);
        secure_store::store(
            &dir.join("secret.json"),
            marker.as_bytes(),
            credential.as_str(),
        )
        .map_err(secure_store_error)?;
        write_private_json(&dir.join("wallet.json"), &backup.wallet)?;
        commit_multisig_profile(&app, id, &backup.wallet)?;
        Ok(backup.wallet)
    })();
    if result.is_err() {
        cleanup_failed_profile(&dir)?;
    }
    let wallet = result?;
    unlock_selected(&app, &state)?;
    Ok(wallet)
}

#[tauri::command]
pub fn multisig_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    credential: String,
    confirmation: String,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    let credential = Zeroizing::new(credential);
    require_unlocked(&app, &state)?;
    let wallet = read_multisig_metadata(&app)?;
    let wallet_id = selected_profile_of_kind(&app, WalletKind::Multisig)?.id;
    let drill_verified = state
        .verified_recovery
        .lock()
        .map_err(internal)?
        .get(&wallet_id)
        .is_some_and(|descriptor| descriptor == &wallet.external_descriptor);
    if !drill_verified {
        return Err(api_error(
            "backup_mismatch",
            "Run a successful recovery drill before deleting this coordinator.",
        ));
    }
    if confirmation != wallet.name {
        return Err(api_error(
            "confirmation_mismatch",
            "Type the exact wallet name to delete this coordinator.",
        ));
    }
    check_auth_throttle(&app, &state)?;
    let verified = verify_multisig_credential(&app, credential.as_str());
    record_auth_result(&app, &state, &verified)?;
    verified?;
    let dir = profile_directory(&app, wallet_id)?;
    delete_registered_wallet(&app, wallet_id, &dir)?;
    state
        .verified_recovery
        .lock()
        .map_err(internal)?
        .remove(&wallet_id);
    lock_wallet(&state, wallet_id)?;
    Ok(())
}

#[tauri::command]
pub fn multisig_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    let wallet = load_wallet(&mut db)?;
    snapshot_from(&wallet, &db, None, true)
}

#[tauri::command]
pub fn multisig_sync(app: AppHandle, state: State<'_, AppState>) -> ApiResult<WalletSnapshotDto> {
    let _operation = operation_guard(&state)?;
    let wallet_id = require_unlocked_for_background_sync(&app, &state)?;
    let mut db = open_multisig_db(&app)?;
    sync_wallet_with_status(&app, &state, &mut db, true, wallet_id)
}

#[tauri::command]
pub fn multisig_address_create(
    app: AppHandle,
    state: State<'_, AppState>,
    label: String,
) -> ApiResult<ReceiveAddressDto> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let label = normalize_label(&label)?;
    let mut db = open_multisig_db(&app)?;
    let mut transaction = db.transaction().map_err(internal)?;
    let mut wallet = Wallet::load()
        .check_network(NETWORK)
        .load_wallet(&mut transaction)
        .map_err(internal)?
        .ok_or_else(|| api_error("wallet_not_found", "Multisig wallet database is empty."))?;
    let info = wallet.reveal_next_address(KeychainKind::External);
    enforce_recovery_gap(&transaction, info.index)?;
    let created = now();
    transaction
        .execute(
            "INSERT INTO groot_addresses (idx, address, label, created_at, state) VALUES (?1, ?2, ?3, ?4, 'awaiting')",
            params![info.index, info.address.to_string(), label, created],
        )
        .map_err(internal)?;
    label_provenance::assign_new_label(
        &transaction,
        &label,
        LabelOrigin::Receive,
        "address",
        &info.index.to_string(),
        created,
    )
    .map_err(|error| {
        if error.sqlite_error_code() == Some(bdk_wallet::rusqlite::ErrorCode::ConstraintViolation) {
            api_error(
                "invalid_label",
                "Permanent labels cannot be reused. Choose a unique label.",
            )
        } else {
            internal(error)
        }
    })?;
    wallet.persist(&mut transaction).map_err(internal)?;
    transaction.commit().map_err(internal)?;
    Ok(ReceiveAddressDto {
        id: info.index,
        testnet_alias: regtest_testnet_address_alias(&info.address.to_string()),
        address: info.address.to_string(),
        label,
        created: created.to_string(),
        status: "awaiting".to_owned(),
        derivation_path: format!("{MULTISIG_ACCOUNT_PATH}/0/{}", info.index),
        hardware_verified_at: None,
        hardware_verified_by: None,
    })
}

#[tauri::command]
pub fn multisig_address_discard(
    app: AppHandle,
    state: State<'_, AppState>,
    id: u32,
) -> ApiResult<()> {
    let _operation = operation_guard(&state)?;
    require_unlocked(&app, &state)?;
    let db = open_multisig_db(&app)?;
    let changed = db
        .execute(
            "UPDATE groot_addresses SET state = 'discarded' WHERE idx = ?1 AND state = 'awaiting' AND observed = 0",
            params![id],
        )
        .map_err(internal)?;
    if changed != 1 {
        return Err(api_error(
            "address_not_discardable",
            "Only an unused address awaiting payment can be discarded.",
        ));
    }
    Ok(())
}
