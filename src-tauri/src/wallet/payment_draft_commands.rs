use super::*;

const PAYMENT_DRAFT_VERSION: u8 = 1;
const MAX_DRAFT_AMOUNT_LENGTH: usize = 32;
const MAX_DRAFT_OUTPOINTS: usize = 1_000;

fn default_payment_draft_version() -> u8 {
    PAYMENT_DRAFT_VERSION
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PaymentDraftKind {
    SingleKey,
    Multisig,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaymentDraftDto {
    #[serde(default = "default_payment_draft_version")]
    pub version: u8,
    pub kind: PaymentDraftKind,
    pub wallet_id: String,
    pub address: String,
    pub labels: Vec<String>,
    pub amount: String,
    pub stage: u8,
    pub selected_coins: Vec<String>,
    pub automatic_strategy: AutomaticSelectionStrategy,
    #[serde(default)]
    pub speed: Option<String>,
    #[serde(default)]
    pub custom_fee: Option<String>,
    #[serde(default)]
    pub selected_rate: Option<f64>,
}

fn payment_draft_path(app: &AppHandle, wallet_id: Uuid) -> ApiResult<PathBuf> {
    Ok(profile_directory(app, wallet_id)?.join("payment-draft.json"))
}

fn valid_amount_input(value: &str) -> bool {
    if value.len() > MAX_DRAFT_AMOUNT_LENGTH {
        return false;
    }
    let mut decimal_points = 0;
    value.chars().all(|character| {
        if character == '.' {
            decimal_points += 1;
            decimal_points == 1
        } else {
            character.is_ascii_digit()
        }
    })
}

fn validate_payment_draft(
    mut draft: PaymentDraftDto,
    profile: &WalletProfile,
) -> ApiResult<PaymentDraftDto> {
    if draft.version != PAYMENT_DRAFT_VERSION {
        return Err(api_error(
            "wallet_corrupt",
            "The saved payment draft uses an unsupported format. The wallet and proposals were not changed.",
        ));
    }
    let wallet_id = Uuid::parse_str(&draft.wallet_id).map_err(|_| {
        api_error(
            "wallet_corrupt",
            "The saved payment draft has an invalid wallet identity.",
        )
    })?;
    if wallet_id != profile.id {
        return Err(api_error(
            "wallet_corrupt",
            "The saved payment draft belongs to a different wallet.",
        ));
    }
    let kind_matches = matches!(
        (&draft.kind, &profile.kind),
        (
            PaymentDraftKind::SingleKey,
            WalletKind::SingleKey | WalletKind::WatchOnly
        ) | (PaymentDraftKind::Multisig, WalletKind::Multisig)
    );
    if !kind_matches {
        return Err(api_error(
            "wallet_corrupt",
            "The saved payment draft does not match this wallet type.",
        ));
    }
    let address = Address::from_str(draft.address.trim())
        .map_err(|_| api_error("wallet_corrupt", "The saved payment recipient is invalid."))?
        .require_network(network())
        .map_err(|_| {
            api_error(
                "wallet_corrupt",
                "The saved payment recipient belongs to a different Bitcoin network.",
            )
        })?;
    validate_supported_payment_destination(&address).map_err(|_| {
        api_error(
            "wallet_corrupt",
            "The saved payment recipient uses an unsupported address type.",
        )
    })?;
    draft.address = address.to_string();
    draft.labels = normalize_labels(draft.labels)?;
    if !matches!(draft.stage, 1 | 2) || !valid_amount_input(&draft.amount) {
        return Err(api_error(
            "wallet_corrupt",
            "The saved payment draft contains invalid progress or amount data.",
        ));
    }
    if draft.selected_coins.len() > MAX_DRAFT_OUTPOINTS {
        return Err(api_error(
            "wallet_corrupt",
            "The saved payment draft contains too many selected coins.",
        ));
    }
    let mut selected_coins = HashSet::with_capacity(draft.selected_coins.len());
    for outpoint in &draft.selected_coins {
        OutPoint::from_str(outpoint).map_err(|_| {
            api_error(
                "wallet_corrupt",
                "The saved payment draft contains an invalid coin reference.",
            )
        })?;
        if !selected_coins.insert(outpoint) {
            return Err(api_error(
                "wallet_corrupt",
                "The saved payment draft contains a duplicate coin reference.",
            ));
        }
    }
    match draft.kind {
        PaymentDraftKind::SingleKey => {
            if !matches!(
                draft.speed.as_deref(),
                Some("slow" | "medium" | "fast" | "custom")
            ) || draft.selected_rate.is_some()
                || !valid_amount_input(draft.custom_fee.as_deref().unwrap_or_default())
            {
                return Err(api_error(
                    "wallet_corrupt",
                    "The saved payment draft contains invalid fee settings.",
                ));
            }
        }
        PaymentDraftKind::Multisig => {
            let selected_rate = draft.selected_rate.ok_or_else(|| {
                api_error(
                    "wallet_corrupt",
                    "The saved payment draft is missing its fee rate.",
                )
            })?;
            if !selected_rate.is_finite()
                || !(0.0..=10_000.0).contains(&selected_rate)
                || draft.speed.is_some()
                || draft.custom_fee.is_some()
            {
                return Err(api_error(
                    "wallet_corrupt",
                    "The saved payment draft contains invalid fee settings.",
                ));
            }
        }
    }
    Ok(draft)
}

fn read_payment_draft_path(
    path: &Path,
    profile: &WalletProfile,
) -> ApiResult<Option<PaymentDraftDto>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(internal("The saved payment draft is not a regular file."))
        }
        Ok(_) => {
            let draft = serde_json::from_str::<PaymentDraftDto>(&read_private_text(path)?)
                .map_err(|_| {
                    api_error(
                        "wallet_corrupt",
                        "The saved payment draft is corrupt. The wallet and proposals were not changed.",
                    )
                })?;
            validate_payment_draft(draft, profile).map(Some)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(internal(error)),
    }
}

fn clear_payment_draft_path(path: &Path) -> ApiResult<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(internal("The saved payment draft is not a regular file."))
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

#[tauri::command]
pub fn payment_draft(
    app: AppHandle,
    state: State<'_, AppState>,
) -> ApiResult<Option<PaymentDraftDto>> {
    let wallet_id = require_unlocked(&app, &state)?;
    let profile = selected_profile(&app)?;
    read_payment_draft_path(&payment_draft_path(&app, wallet_id)?, &profile)
}

#[tauri::command]
pub fn payment_draft_save(
    app: AppHandle,
    state: State<'_, AppState>,
    mut draft: PaymentDraftDto,
) -> ApiResult<PaymentDraftDto> {
    let wallet_id = require_unlocked(&app, &state)?;
    let profile = selected_profile(&app)?;
    draft.version = PAYMENT_DRAFT_VERSION;
    let draft = validate_payment_draft(draft, &profile)?;
    write_private_json(&payment_draft_path(&app, wallet_id)?, &draft)?;
    Ok(draft)
}

#[tauri::command]
pub fn payment_draft_clear(app: AppHandle, state: State<'_, AppState>) -> ApiResult<()> {
    let wallet_id = require_unlocked(&app, &state)?;
    clear_payment_draft_path(&payment_draft_path(&app, wallet_id)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(kind: WalletKind) -> WalletProfile {
        WalletProfile {
            id: Uuid::new_v4(),
            name: "Draft wallet".to_owned(),
            network: network_name().to_owned(),
            kind,
            descriptor_checksum: "12345678".to_owned(),
            created_at: 1,
            backup_verified: true,
        }
    }

    fn draft(profile: &WalletProfile, kind: PaymentDraftKind) -> PaymentDraftDto {
        let address = if network() == Network::Regtest {
            "bcrt1qf6n3a54f4nqc5976hjl556ukfdas8xsnf8k9mz"
        } else {
            "tb1qf6n3a54f4nqc5976hjl556ukfdas8xsntw0gvt"
        };
        PaymentDraftDto {
            version: PAYMENT_DRAFT_VERSION,
            kind,
            wallet_id: profile.id.to_string(),
            address: address.to_owned(),
            labels: vec!["Restart test".to_owned()],
            amount: "5000".to_owned(),
            stage: 2,
            selected_coins: vec![],
            automatic_strategy: AutomaticSelectionStrategy::Balanced,
            speed: None,
            custom_fee: None,
            selected_rate: Some(1.0),
        }
    }

    #[test]
    fn restart_file_round_trips_and_clears_without_touching_other_wallet_data() {
        let profile = profile(WalletKind::Multisig);
        let original =
            validate_payment_draft(draft(&profile, PaymentDraftKind::Multisig), &profile).unwrap();
        let directory =
            std::env::temp_dir().join(format!("groot-payment-draft-{}", Uuid::new_v4()));
        let path = directory.join("payment-draft.json");
        write_private_json(&path, &original).unwrap();
        assert_eq!(
            read_payment_draft_path(&path, &profile).unwrap(),
            Some(original)
        );
        clear_payment_draft_path(&path).unwrap();
        assert_eq!(read_payment_draft_path(&path, &profile).unwrap(), None);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn draft_validation_fails_closed_across_wallets_kinds_and_networks() {
        let multisig = profile(WalletKind::Multisig);
        let mut candidate = draft(&multisig, PaymentDraftKind::Multisig);
        candidate.wallet_id = Uuid::new_v4().to_string();
        assert_eq!(
            validate_payment_draft(candidate, &multisig)
                .unwrap_err()
                .code,
            "wallet_corrupt"
        );

        let single_key = profile(WalletKind::SingleKey);
        let candidate = draft(&single_key, PaymentDraftKind::Multisig);
        assert_eq!(
            validate_payment_draft(candidate, &single_key)
                .unwrap_err()
                .code,
            "wallet_corrupt"
        );

        let mut candidate = draft(&multisig, PaymentDraftKind::Multisig);
        candidate.selected_coins = vec!["not-an-outpoint".to_owned()];
        assert_eq!(
            validate_payment_draft(candidate, &multisig)
                .unwrap_err()
                .code,
            "wallet_corrupt"
        );
    }
}
