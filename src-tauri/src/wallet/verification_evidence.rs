use super::*;

pub(super) fn address_rows(db: &Connection, multisig: bool) -> ApiResult<Vec<ReceiveAddressDto>> {
    let mut statement = db
        .prepare(
            "SELECT a.idx, a.address, a.label, a.created_at, a.state,
                    verification.verified_at, verification.signer_fingerprint,
                    verification.displayed_address
             FROM groot_addresses a
             LEFT JOIN groot_address_verifications verification
               ON verification.id = (
                 SELECT latest.id
                 FROM groot_address_verifications latest
                 WHERE latest.address_idx = a.idx
                 ORDER BY latest.verified_at DESC, latest.id DESC
                 LIMIT 1
               )
             ORDER BY a.idx DESC",
        )
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            let address: String = row.get(1)?;
            let (hardware_verified_at, hardware_verified_by) =
                validated_hardware_verification_metadata(
                    NETWORK,
                    &address,
                    row.get::<_, Option<String>>(7)?.as_deref(),
                    row.get(5)?,
                    row.get(6)?,
                );
            Ok(ReceiveAddressDto {
                id: row.get(0)?,
                testnet_alias: regtest_testnet_address_alias(&address),
                address,
                label: row.get(2)?,
                labels: label_provenance::labels_for_subject(
                    db,
                    "address",
                    &row.get::<_, u32>(0)?.to_string(),
                )?
                .into_iter()
                .map(|label| label.text)
                .collect(),
                created: row.get::<_, u64>(3)?.to_string(),
                status: row.get(4)?,
                derivation_path: if multisig {
                    format!("{MULTISIG_ACCOUNT_PATH}/0/{}", row.get::<_, u32>(0)?)
                } else {
                    format!("{SINGLESIG_ACCOUNT_PATH}/0/{}", row.get::<_, u32>(0)?)
                },
                hardware_verified_at,
                hardware_verified_by,
            })
        })
        .map_err(internal)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(internal)
}

pub(super) fn record_address_verification(
    db: &mut Connection,
    address_id: u32,
    identity: &VerifiedHardwareIdentity,
    displayed_address: &str,
    multisig: bool,
) -> ApiResult<ReceiveAddressDto> {
    let verified_at = now();
    let transaction = db.transaction().map_err(internal)?;
    transaction
        .execute(
            "INSERT INTO groot_address_verifications
                (address_idx, signer_fingerprint, device_type, displayed_address, verified_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                address_id,
                identity.fingerprint.to_ascii_lowercase(),
                identity.device_type.to_ascii_lowercase(),
                displayed_address,
                verified_at
            ],
        )
        .map_err(internal)?;
    transaction.commit().map_err(internal)?;
    address_rows(db, multisig)?
        .into_iter()
        .find(|address| address.id == address_id)
        .ok_or_else(|| internal("Verified address disappeared from wallet storage."))
}

pub(super) fn records_interactive_policy_verification(device_type: &str) -> bool {
    matches!(
        device_type.to_ascii_lowercase().as_str(),
        "ledger" | "bitbox02" | "jade"
    )
}

pub(super) fn require_matching_policy_device_type(
    expected_device_type: Option<&str>,
    actual_device_type: &str,
) -> ApiResult<()> {
    let Some(expected) = expected_device_type else {
        return Ok(());
    };
    if records_interactive_policy_verification(expected)
        && !expected.eq_ignore_ascii_case(actual_device_type)
    {
        return Err(api_error(
            "unknown_signer",
            "The connected hardware model does not match this saved signer.",
        ));
    }
    Ok(())
}

pub(super) fn record_signer_policy_verification(
    db: &Connection,
    identity: &VerifiedHardwareIdentity,
    displayed_address: &str,
) -> ApiResult<SignerPolicyVerificationDto> {
    if !records_interactive_policy_verification(&identity.device_type) {
        return Err(api_error(
            "invalid_hardware_request",
            "This signer does not use Groot's interactive wallet-policy verification flow.",
        ));
    }
    let verified_at = now();
    let signer_fingerprint = identity.fingerprint.to_ascii_lowercase();
    let device_type = identity.device_type.to_ascii_lowercase();
    db.execute(
        "INSERT INTO groot_signer_policy_verifications
            (signer_fingerprint, device_type, scope, displayed_address, verified_at)
         VALUES (?1, ?2, 'policy_and_address', ?3, ?4)",
        params![
            signer_fingerprint,
            device_type,
            displayed_address,
            verified_at
        ],
    )
    .map_err(internal)?;
    Ok(SignerPolicyVerificationDto {
        signer_fingerprint,
        device_type,
        verified_at: verified_at.to_string(),
        scope: "policy_and_address",
        displayed_address: Some(displayed_address.to_owned()),
    })
}

pub(super) fn policy_verification_key(
    wallet: &MultisigWalletDto,
    fingerprint: &str,
) -> ApiResult<String> {
    Ok(format!(
        "{}:{}",
        descriptor_checksum(&wallet.external_descriptor)?,
        fingerprint.to_ascii_lowercase()
    ))
}

pub(super) fn signer_policy_verification_rows(
    db: &Connection,
) -> ApiResult<Vec<SignerPolicyVerificationDto>> {
    let mut statement = db
        .prepare(
            "SELECT signer_fingerprint, device_type, verified_at, displayed_address
             FROM groot_signer_policy_verifications verification
             WHERE verification.id = (
               SELECT latest.id
               FROM groot_signer_policy_verifications latest
               WHERE latest.signer_fingerprint = verification.signer_fingerprint
               ORDER BY latest.verified_at DESC, latest.id DESC
               LIMIT 1
             )
             ORDER BY signer_fingerprint ASC",
        )
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok(SignerPolicyVerificationDto {
                signer_fingerprint: row.get(0)?,
                device_type: row.get(1)?,
                verified_at: row.get::<_, u64>(2)?.to_string(),
                scope: "policy_and_address",
                displayed_address: Some(row.get(3)?),
            })
        })
        .map_err(internal)?;
    let mut verifications = rows.collect::<Result<Vec<_>, _>>().map_err(internal)?;
    let mut acknowledgements = db
        .prepare(
            "SELECT signer_fingerprint, device_type, acknowledged_at
             FROM groot_signer_policy_acknowledgements acknowledgement
             WHERE acknowledgement.id = (
               SELECT latest.id
               FROM groot_signer_policy_acknowledgements latest
               WHERE latest.signer_fingerprint = acknowledgement.signer_fingerprint
               ORDER BY latest.acknowledged_at DESC, latest.id DESC
               LIMIT 1
             )
             ORDER BY signer_fingerprint ASC",
        )
        .map_err(internal)?;
    let rows = acknowledgements
        .query_map([], |row| {
            Ok(SignerPolicyVerificationDto {
                signer_fingerprint: row.get(0)?,
                device_type: row.get(1)?,
                verified_at: row.get::<_, u64>(2)?.to_string(),
                scope: "policy_file_acknowledgement",
                displayed_address: None,
            })
        })
        .map_err(internal)?;
    verifications.extend(rows.collect::<Result<Vec<_>, _>>().map_err(internal)?);
    Ok(verifications)
}

pub(super) fn has_signer_policy_verification(
    verifications: &[SignerPolicyVerificationDto],
    identity: &VerifiedHardwareIdentity,
) -> bool {
    verifications.iter().any(|verification| {
        verification.scope == "policy_and_address"
            && verification
                .signer_fingerprint
                .eq_ignore_ascii_case(&identity.fingerprint)
            && verification
                .device_type
                .eq_ignore_ascii_case(&identity.device_type)
    })
}

pub(super) fn has_coldcard_policy_acknowledgement(
    verifications: &[SignerPolicyVerificationDto],
    identity: &VerifiedHardwareIdentity,
) -> bool {
    identity.device_type.eq_ignore_ascii_case("coldcard")
        && verifications.iter().any(|verification| {
            verification.scope == "policy_file_acknowledgement"
                && verification
                    .signer_fingerprint
                    .eq_ignore_ascii_case(&identity.fingerprint)
                && verification.device_type.eq_ignore_ascii_case("coldcard")
        })
}

/// A Mainnet coordinator may be stored before its signers are available, but
/// Groot must not hand out receive addresses until a spendable quorum has
/// proved the complete descriptor's first address on trusted devices. Every
/// Coldcard in the policy must also have its separate policy-file acknowledgement.
pub(super) fn require_multisig_receive_readiness(
    network: Network,
    wallet: &MultisigWalletDto,
    verifications: &[SignerPolicyVerificationDto],
) -> ApiResult<()> {
    if network != Network::Bitcoin {
        return Ok(());
    }
    let first_address = first_multisig_address(wallet)?;
    let mut verified_signers = 0usize;
    for signer in &wallet.cosigners {
        let Some(device_type) = signer.device_type.as_deref() else {
            return Err(api_error(
                "hardware_not_approved",
                "Verify the wallet policy with enough saved hardware signers before receiving bitcoin.",
            ));
        };
        if device_type.eq_ignore_ascii_case("coldcard") {
            let imported = verifications.iter().any(|verification| {
                verification.scope == "policy_file_acknowledgement"
                    && verification
                        .signer_fingerprint
                        .eq_ignore_ascii_case(&signer.fingerprint)
                    && verification.device_type.eq_ignore_ascii_case("coldcard")
            });
            if !imported {
                return Err(api_error(
                    "hardware_not_approved",
                    "Import and acknowledge every Coldcard policy before receiving bitcoin.",
                ));
            }
        }
        let first_address_verified = verifications.iter().any(|verification| {
            verification.scope == "policy_and_address"
                && verification
                    .signer_fingerprint
                    .eq_ignore_ascii_case(&signer.fingerprint)
                && verification.device_type.eq_ignore_ascii_case(device_type)
                && verification
                    .displayed_address
                    .as_deref()
                    .is_some_and(|address| {
                        hardware_display_matches_expected_address(&first_address, address)
                    })
        });
        if records_interactive_policy_verification(device_type) && first_address_verified {
            verified_signers += 1;
        }
    }
    if verified_signers < wallet.threshold {
        return Err(api_error(
            "hardware_not_approved",
            "Verify the complete wallet policy and first address on enough hardware signers before receiving bitcoin.",
        ));
    }
    Ok(())
}

pub(super) fn supports_coldcard_policy_acknowledgement(signer: &CosignerInput) -> bool {
    signer
        .device_type
        .as_deref()
        .is_some_and(|device_type| device_type.eq_ignore_ascii_case("coldcard"))
        || (signer.device_type.is_none() && signer.source == CosignerSource::File)
}
