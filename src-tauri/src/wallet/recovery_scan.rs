use super::*;

pub(super) fn load_recovery_scan_settings(db: &Connection) -> ApiResult<RecoveryScanSettingsDto> {
    db.query_row(
        "SELECT birthday_height, gap_limit FROM groot_recovery_settings WHERE singleton = 1",
        [],
        |row| {
            Ok(RecoveryScanSettingsDto {
                birthday_height: row.get(0)?,
                gap_limit: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(internal)
    .map(|settings| {
        settings.unwrap_or(RecoveryScanSettingsDto {
            birthday_height: 0,
            gap_limit: MIN_RECOVERY_GAP_LIMIT,
        })
    })
}

pub(super) fn has_saved_recovery_scan_settings(db: &Connection) -> ApiResult<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM groot_recovery_settings WHERE singleton = 1)",
        [],
        |row| row.get(0),
    )
    .map_err(internal)
}

pub(super) fn has_completed_sync(db: &Connection) -> ApiResult<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM groot_chain_observation WHERE singleton = 1)",
        [],
        |row| row.get(0),
    )
    .map_err(internal)
}

pub(super) struct RecoveryScanRecord {
    pub(super) run_id: String,
    pub(super) status: RecoveryScanStatusDto,
}

pub(super) fn idle_recovery_scan_status(
    settings: &RecoveryScanSettingsDto,
) -> RecoveryScanStatusDto {
    RecoveryScanStatusDto {
        status: "idle".to_owned(),
        birthday_height: settings.birthday_height,
        gap_limit: settings.gap_limit,
        current_height: 0,
        target_height: 0,
        processed_blocks: 0,
        total_blocks: 0,
        started_at: 0,
        updated_at: 0,
    }
}

pub(super) fn load_recovery_scan_record(db: &Connection) -> ApiResult<Option<RecoveryScanRecord>> {
    db.query_row(
        "SELECT run_id, status, birthday_height, gap_limit, current_height, target_height,
                processed_blocks, total_blocks, started_at, updated_at
         FROM groot_recovery_scans WHERE singleton = 1",
        [],
        |row| {
            Ok(RecoveryScanRecord {
                run_id: row.get(0)?,
                status: RecoveryScanStatusDto {
                    status: row.get(1)?,
                    birthday_height: row.get(2)?,
                    gap_limit: row.get(3)?,
                    current_height: row.get(4)?,
                    target_height: row.get(5)?,
                    processed_blocks: row.get(6)?,
                    total_blocks: row.get(7)?,
                    started_at: row.get(8)?,
                    updated_at: row.get(9)?,
                },
            })
        },
    )
    .optional()
    .map_err(internal)
}

pub(super) fn reconcile_recovery_scan_record(
    db: &Connection,
    active_run_id: Option<&str>,
) -> ApiResult<Option<RecoveryScanRecord>> {
    let Some(record) = load_recovery_scan_record(db)? else {
        return Ok(None);
    };
    // An incomplete explicit scan is never a trusted continuation point. Clear
    // terminal state left by older builds so every retry starts authoritatively
    // from the saved birthday and the UI cannot present stale progress.
    if matches!(
        record.status.status.as_str(),
        "cancelled" | "failed" | "interrupted"
    ) {
        db.execute(
            "DELETE FROM groot_recovery_scans WHERE singleton = 1 AND run_id = ?1",
            params![record.run_id],
        )
        .map_err(internal)?;
        return Ok(None);
    }
    if matches!(record.status.status.as_str(), "running" | "cancelling")
        && active_run_id != Some(record.run_id.as_str())
    {
        let changed = db
            .execute(
                "DELETE FROM groot_recovery_scans
                 WHERE singleton = 1 AND run_id = ?1 AND status IN ('running', 'cancelling')",
                params![record.run_id],
            )
            .map_err(internal)?;
        if changed == 1 {
            return Ok(None);
        } else {
            return load_recovery_scan_record(db);
        }
    }
    Ok(Some(record))
}

pub(super) fn start_recovery_scan_record(
    db: &Connection,
    run_id: &str,
    settings: &RecoveryScanSettingsDto,
    target_height: u32,
) -> ApiResult<RecoveryScanStatusDto> {
    let started_at = now();
    let total_blocks = target_height
        .saturating_sub(settings.birthday_height)
        .saturating_add(1);
    let status = RecoveryScanStatusDto {
        status: "running".to_owned(),
        birthday_height: settings.birthday_height,
        gap_limit: settings.gap_limit,
        current_height: settings.birthday_height.saturating_sub(1),
        target_height,
        processed_blocks: 0,
        total_blocks,
        started_at,
        updated_at: started_at,
    };
    db.execute(
        "INSERT INTO groot_recovery_scans
         (singleton, run_id, status, birthday_height, gap_limit, current_height, target_height,
          processed_blocks, total_blocks, started_at, updated_at)
         VALUES (1, ?1, 'running', ?2, ?3, ?4, ?5, 0, ?6, ?7, ?7)
         ON CONFLICT(singleton) DO UPDATE SET
           run_id = excluded.run_id, status = excluded.status,
           birthday_height = excluded.birthday_height, gap_limit = excluded.gap_limit,
           current_height = excluded.current_height, target_height = excluded.target_height,
           processed_blocks = excluded.processed_blocks, total_blocks = excluded.total_blocks,
           started_at = excluded.started_at, updated_at = excluded.updated_at",
        params![
            run_id,
            status.birthday_height,
            status.gap_limit,
            status.current_height,
            status.target_height,
            status.total_blocks,
            status.started_at,
        ],
    )
    .map_err(internal)?;
    Ok(status)
}

pub(super) fn update_recovery_scan_progress(
    db: &Connection,
    run_id: &str,
    current_height: u32,
    processed_blocks: u32,
) -> ApiResult<()> {
    let changed = db
        .execute(
            "UPDATE groot_recovery_scans
             SET current_height = ?1, processed_blocks = ?2, updated_at = ?3
             WHERE singleton = 1 AND run_id = ?4 AND status IN ('running', 'cancelling')",
            params![current_height, processed_blocks, now(), run_id],
        )
        .map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "scan_interrupted",
            "Recovery scan state changed unexpectedly. Start the scan again.",
        ))
    }
}

pub(super) fn finish_recovery_scan_record(
    db: &Connection,
    run_id: &str,
    status: &str,
) -> ApiResult<()> {
    let changed = db
        .execute(
            "UPDATE groot_recovery_scans SET status = ?1, updated_at = ?2
             WHERE singleton = 1 AND run_id = ?3 AND status IN ('running', 'cancelling')",
            params![status, now(), run_id],
        )
        .map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "scan_interrupted",
            "Recovery scan state changed unexpectedly. Start the scan again.",
        ))
    }
}

pub(super) fn discard_recovery_scan_record(db: &Connection, run_id: &str) -> ApiResult<()> {
    let changed = db
        .execute(
            "DELETE FROM groot_recovery_scans
             WHERE singleton = 1 AND run_id = ?1
               AND status IN ('running', 'cancelling', 'cancelled', 'failed', 'interrupted')",
            params![run_id],
        )
        .map_err(internal)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(api_error(
            "scan_interrupted",
            "Recovery scan state changed unexpectedly. Start a new scan.",
        ))
    }
}

/// Returns the minimum stop-gap needed to rediscover every address Groot has
/// revealed, including late payments to currently unused or discarded requests.
/// A used address resets the unused run exactly as a descriptor scan would.
pub(super) fn required_recovery_gap(
    db: &Connection,
    prospective_index: Option<u32>,
) -> ApiResult<u32> {
    let mut statement = db
        .prepare("SELECT idx, observed FROM groot_addresses ORDER BY idx")
        .map_err(internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, u32>(0)?, row.get::<_, bool>(1)?))
        })
        .map_err(internal)?;
    let mut previous_observed = None;
    let mut required = 0_u32;
    let mut highest = None;
    for row in rows {
        let (index, observed) = row.map_err(internal)?;
        if highest.is_some_and(|value| index <= value) {
            return Err(internal(
                "Address derivation indexes are not strictly increasing.",
            ));
        }
        highest = Some(index);
        required = required.max(match previous_observed {
            Some(previous) => index
                .checked_sub(previous)
                .ok_or_else(|| internal("Address derivation indexes are invalid."))?,
            None => index
                .checked_add(1)
                .ok_or_else(|| internal("Address derivation index overflowed."))?,
        });
        if observed {
            previous_observed = Some(index);
        }
    }
    if let Some(index) = prospective_index {
        if highest.is_some_and(|value| index <= value) {
            return Err(internal(
                "The next address derivation index did not advance.",
            ));
        }
        required = required.max(match previous_observed {
            Some(previous) => index
                .checked_sub(previous)
                .ok_or_else(|| internal("Address derivation indexes are invalid."))?,
            None => index
                .checked_add(1)
                .ok_or_else(|| internal("Address derivation index overflowed."))?,
        });
    }
    Ok(required)
}

pub(super) fn enforce_recovery_gap(db: &Connection, prospective_index: u32) -> ApiResult<()> {
    let configured = load_recovery_scan_settings(db)?.gap_limit;
    let required = required_recovery_gap(db, Some(prospective_index))?;
    if required > configured {
        return Err(api_error(
            "address_gap_limit_reached",
            format!(
                "Creating this address would exceed the configured recovery gap limit of {configured}. Increase the gap limit in Settings or wait for an existing address to receive bitcoin."
            ),
        ));
    }
    Ok(())
}

pub(super) fn required_keychain_gap(
    wallet: &Wallet,
    keychain: KeychainKind,
    prospective_index: u32,
) -> ApiResult<u32> {
    let mut observed = wallet
        .list_output()
        .filter(|output| output.keychain == keychain)
        .map(|output| output.derivation_index)
        .collect::<Vec<_>>();
    observed.sort_unstable();
    observed.dedup();
    let mut previous = None;
    let mut required = 0_u32;
    for index in observed {
        required = required.max(match previous {
            Some(value) => index
                .checked_sub(value)
                .ok_or_else(|| internal("Change derivation indexes are invalid."))?,
            None => index
                .checked_add(1)
                .ok_or_else(|| internal("Change derivation index overflowed."))?,
        });
        previous = Some(index);
    }
    required = required.max(match previous {
        Some(value) if prospective_index > value => prospective_index - value,
        Some(_) => 0,
        None => prospective_index
            .checked_add(1)
            .ok_or_else(|| internal("Change derivation index overflowed."))?,
    });
    Ok(required)
}

pub(super) fn enforce_change_recovery_gap(
    db: &Connection,
    wallet: &Wallet,
    psbt: &Psbt,
) -> ApiResult<()> {
    let highest_internal = psbt
        .unsigned_tx
        .output
        .iter()
        .filter_map(|output| wallet.derivation_of_spk(output.script_pubkey.clone()))
        .filter_map(|(keychain, index)| (keychain == KeychainKind::Internal).then_some(index))
        .max();
    let Some(index) = highest_internal else {
        return Ok(());
    };
    let configured = load_recovery_scan_settings(db)?.gap_limit;
    let required = required_keychain_gap(wallet, KeychainKind::Internal, index)?;
    if required > configured {
        return Err(api_error(
            "address_gap_limit_reached",
            format!(
                "This transaction would use a change index beyond the configured recovery gap limit of {configured}. Increase the gap limit in Settings before preparing it."
            ),
        ));
    }
    Ok(())
}
