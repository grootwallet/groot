use super::*;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use tauri_plugin_dialog::DialogExt;

const MAX_BIP329_BYTES: u64 = 1024 * 1024;
const MAX_BIP329_RECORDS: usize = 10_000;
const MAX_BIP329_LINE_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct Bip329Record {
    #[serde(rename = "type")]
    record_type: String,
    #[serde(rename = "ref")]
    reference: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    spendable: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelExportResultDto {
    saved: bool,
    record_count: usize,
    reveal_token: Option<String>,
    reveal_label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelImportResultDto {
    imported_count: usize,
    unchanged_count: usize,
    ignored_count: usize,
    spendability_change_count: usize,
}

fn record_rank(value: &str) -> u8 {
    match value {
        "addr" => 0,
        "tx" => 1,
        "output" => 2,
        "xpub" => 3,
        _ => 255,
    }
}

fn signer_labels(app: &AppHandle, profile: &WalletProfile) -> ApiResult<Vec<(String, String)>> {
    match profile.kind {
        WalletKind::SingleKey => Ok(Vec::new()),
        WalletKind::WatchOnly => {
            let wallet = read_external_signer_metadata(app)?;
            Ok(vec![(wallet.signer.xpub, wallet.signer.label)])
        }
        WalletKind::Multisig => Ok(read_multisig_metadata(app)?
            .cosigners
            .into_iter()
            .map(|signer| (signer.xpub, signer.label))
            .collect()),
    }
}

fn is_retained_rbf_transaction(db: &Connection, txid: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT EXISTS(
           SELECT 1
           FROM groot_accelerations acceleration
           JOIN groot_proposals proposal
             ON proposal.proposal_id = acceleration.proposal_id
            AND proposal.status = 'broadcast'
            AND proposal.txid = acceleration.replacement_txid
           WHERE acceleration.method = 'rbf'
             AND acceleration.replacement_txid IS NOT NULL
             AND (?1 = acceleration.original_txid OR ?1 = acceleration.replacement_txid)
         )",
        params![txid],
        |row| row.get(0),
    )
    .map_err(internal)
}

fn is_retained_rbf_output(db: &Connection, outpoint: &str, txid: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT EXISTS(
           SELECT 1
           FROM groot_output_lineage lineage
           JOIN groot_accelerations acceleration
             ON acceleration.method = 'rbf'
            AND acceleration.replacement_txid IS NOT NULL
            AND (lineage.source_txid = acceleration.original_txid
                 OR lineage.source_txid = acceleration.replacement_txid)
           JOIN groot_proposals proposal
             ON proposal.proposal_id = acceleration.proposal_id
            AND proposal.status = 'broadcast'
            AND proposal.txid = acceleration.replacement_txid
           WHERE lineage.outpoint = ?1
             AND lineage.source_txid = ?2
         )",
        params![outpoint, txid],
        |row| row.get(0),
    )
    .map_err(internal)
}

fn collect_export_records(
    db: &Connection,
    wallet: &Wallet,
    signers: &[(String, String)],
) -> ApiResult<Vec<Bip329Record>> {
    let mut records = Vec::new();
    let mut statement = db
        .prepare(
            "SELECT assignment.subject_kind, assignment.subject_id, label.text
             FROM (
               SELECT label_id, subject_kind, subject_id, 0 AS position
               FROM groot_label_assignments
               UNION ALL
               SELECT label_id, subject_kind, subject_id, position
               FROM groot_additional_label_assignments
             ) assignment
             JOIN groot_labels label ON label.label_id = assignment.label_id
             WHERE assignment.subject_kind IN ('address','transaction')
             ORDER BY assignment.subject_kind, assignment.subject_id, assignment.position, label.label_id",
        )
        .map_err(internal)?;
    let assignments = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    for (kind, subject, label) in assignments {
        let (record_type, reference) = if kind == "address" {
            let address = db
                .query_row(
                    "SELECT address FROM groot_addresses WHERE idx = ?1",
                    params![subject],
                    |row| row.get::<_, String>(0),
                )
                .map_err(internal)?;
            ("addr", address)
        } else {
            let txid = Txid::from_str(&subject).map_err(internal)?;
            if wallet.get_tx(txid).is_none() && !is_retained_rbf_transaction(db, &subject)? {
                return Err(api_error(
                    "wallet_corrupt",
                    "A transaction label no longer matches wallet history.",
                ));
            }
            ("tx", subject)
        };
        records.push(Bip329Record {
            record_type: record_type.to_owned(),
            reference,
            label,
            spendable: None,
        });
    }

    let unspent = wallet
        .list_unspent()
        .map(|output| output.outpoint.to_string())
        .collect::<BTreeSet<_>>();
    let frozen = db
        .prepare("SELECT outpoint FROM groot_frozen_coins")
        .map_err(internal)?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(internal)?
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(internal)?;
    let mut outputs = db
        .prepare(
            "SELECT assignment.outpoint, label.text
             FROM (
               SELECT label_id, outpoint FROM groot_output_provenance
               UNION ALL
               SELECT label_id, subject_id AS outpoint
               FROM groot_label_assignments WHERE subject_kind = 'output'
               UNION ALL
               SELECT label_id, subject_id AS outpoint
               FROM groot_additional_label_assignments WHERE subject_kind = 'output'
             ) assignment
             JOIN groot_labels label ON label.label_id = assignment.label_id
             ORDER BY assignment.outpoint, label.text, label.label_id",
        )
        .map_err(internal)?;
    let output_rows = outputs
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    for (outpoint, label) in output_rows {
        let parsed = OutPoint::from_str(&outpoint).map_err(internal)?;
        let owned = wallet.get_tx(parsed.txid).is_some_and(|tx| {
            tx.tx_node
                .tx
                .output
                .get(parsed.vout as usize)
                .is_some_and(|output| wallet.is_mine(output.script_pubkey.clone()))
        });
        if !owned && !is_retained_rbf_output(db, &outpoint, &parsed.txid.to_string())? {
            return Err(api_error(
                "wallet_corrupt",
                "An output label no longer matches a wallet-owned output.",
            ));
        }
        records.push(Bip329Record {
            record_type: "output".to_owned(),
            reference: outpoint.clone(),
            label,
            spendable: unspent
                .contains(&outpoint)
                .then(|| !frozen.contains(&outpoint)),
        });
    }
    records.extend(signers.iter().map(|(xpub, label)| Bip329Record {
        record_type: "xpub".to_owned(),
        reference: xpub.clone(),
        label: label.clone(),
        spendable: None,
    }));
    records.sort_by(|left, right| {
        (record_rank(&left.record_type), &left.reference, &left.label).cmp(&(
            record_rank(&right.record_type),
            &right.reference,
            &right.label,
        ))
    });
    records.dedup();
    Ok(records)
}

fn encode_records(records: &[Bip329Record]) -> ApiResult<Vec<u8>> {
    let mut output = Vec::new();
    for record in records {
        if private_material(&record.reference) || private_material(&record.label) {
            return Err(api_error(
                "private_material_rejected",
                "Private extended keys are never included in a label export.",
            ));
        }
        serde_json::to_writer(&mut output, record).map_err(internal)?;
        output.push(b'\n');
    }
    if output.is_empty() || output.len() as u64 > MAX_BIP329_BYTES {
        return Err(api_error(
            "label_export_invalid",
            "This wallet has no bounded BIP329 labels to export.",
        ));
    }
    Ok(output)
}

fn private_material(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    ["xprv", "tprv", "yprv", "zprv", "vprv", "uprv"]
        .iter()
        .any(|prefix| lower.contains(prefix))
}

fn parse_records(bytes: &[u8]) -> ApiResult<(Vec<Bip329Record>, usize)> {
    if bytes.is_empty()
        || bytes.len() as u64 > MAX_BIP329_BYTES
        || bytes.starts_with(&[0xef, 0xbb, 0xbf])
    {
        return Err(api_error(
            "label_import_invalid",
            "Choose a non-empty BIP329 JSONL file of at most 1 MiB.",
        ));
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| api_error("label_import_invalid", "BIP329 labels must be valid UTF-8."))?;
    let mut records = Vec::new();
    let mut ignored = 0;
    for (index, raw_line) in text.lines().enumerate() {
        if index >= MAX_BIP329_RECORDS
            || raw_line.len() > MAX_BIP329_LINE_BYTES
            || raw_line.trim().is_empty()
        {
            return Err(api_error(
                "label_import_invalid",
                "The BIP329 file has an invalid or oversized line.",
            ));
        }
        let value: Value = serde_json::from_str(raw_line).map_err(|_| {
            api_error(
                "label_import_invalid",
                "The BIP329 file contains malformed JSON.",
            )
        })?;
        let object = value.as_object().ok_or_else(|| {
            api_error(
                "label_import_invalid",
                "Each BIP329 line must be a JSON object.",
            )
        })?;
        let record_type = object.get("type").and_then(Value::as_str).ok_or_else(|| {
            api_error(
                "label_import_invalid",
                "Each BIP329 record needs a string type.",
            )
        })?;
        let reference = object.get("ref").and_then(Value::as_str).ok_or_else(|| {
            api_error(
                "label_import_invalid",
                "Each BIP329 record needs a string ref.",
            )
        })?;
        if private_material(reference)
            || object
                .get("origin")
                .and_then(Value::as_str)
                .is_some_and(private_material)
        {
            return Err(api_error(
                "private_material_rejected",
                "Private extended keys are never accepted in a label import.",
            ));
        }
        if object.get("origin").is_some_and(|value| !value.is_string()) {
            return Err(api_error(
                "label_import_invalid",
                "BIP329 origin must be a string when present.",
            ));
        }
        let spendable = object
            .get("spendable")
            .map(|value| {
                value.as_bool().ok_or_else(|| {
                    api_error(
                        "label_import_invalid",
                        "BIP329 spendable must be a boolean.",
                    )
                })
            })
            .transpose()?;
        if spendable.is_some() && record_type != "output" {
            return Err(api_error(
                "label_import_invalid",
                "BIP329 spendable is valid only for output records.",
            ));
        }
        let Some(label) = object
            .get("label")
            .map(|value| {
                value.as_str().ok_or_else(|| {
                    api_error("label_import_invalid", "BIP329 label must be a string.")
                })
            })
            .transpose()?
        else {
            ignored += 1;
            continue;
        };
        if label.trim().is_empty() || label.chars().count() > 48 || label.contains(['\n', '\r']) {
            return Err(api_error(
                "invalid_label",
                "Imported labels must contain 1 to 48 single-line characters.",
            ));
        }
        if !matches!(record_type, "addr" | "tx" | "output" | "xpub") {
            ignored += 1;
            continue;
        }
        records.push(Bip329Record {
            record_type: record_type.to_owned(),
            reference: reference.to_owned(),
            label: label.to_owned(),
            spendable,
        });
    }
    Ok((records, ignored))
}

fn import_records(
    db: &mut Connection,
    records: &[Bip329Record],
    initial_ignored: usize,
    signers: &[(String, String)],
) -> ApiResult<LabelImportResultDto> {
    let mut transaction = db.transaction().map_err(internal)?;
    let wallet = load_wallet_transaction(&mut transaction)?;
    let unspent = wallet
        .list_unspent()
        .map(|output| output.outpoint.to_string())
        .collect::<BTreeSet<_>>();
    let mut planned = BTreeMap::<(String, String), Vec<String>>::new();
    let mut spendability = BTreeMap::<String, bool>::new();
    let signer_map = signers.iter().cloned().collect::<BTreeMap<_, _>>();
    let mut ignored = initial_ignored;
    for record in records {
        match record.record_type.as_str() {
            "addr" => {
                Address::from_str(&record.reference)
                    .map_err(|_| {
                        api_error("label_import_invalid", "An imported address is invalid.")
                    })?
                    .require_network(NETWORK)
                    .map_err(|_| {
                        api_error(
                            "wrong_network",
                            "An imported address is for another Bitcoin network.",
                        )
                    })?;
                let index = transaction
                    .query_row(
                        "SELECT idx FROM groot_addresses WHERE address = ?1",
                        params![record.reference],
                        |row| row.get::<_, u32>(0),
                    )
                    .optional()
                    .map_err(internal)?
                    .ok_or_else(|| {
                        api_error(
                            "backup_mismatch",
                            "An imported address does not belong to this wallet.",
                        )
                    })?;
                planned
                    .entry(("address".to_owned(), index.to_string()))
                    .or_default()
                    .push(record.label.clone());
            }
            "tx" => {
                let txid = Txid::from_str(&record.reference).map_err(|_| {
                    api_error(
                        "label_import_invalid",
                        "An imported transaction reference is invalid.",
                    )
                })?;
                if wallet.get_tx(txid).is_none()
                    && !is_retained_rbf_transaction(&transaction, &txid.to_string())?
                {
                    return Err(api_error(
                        "backup_mismatch",
                        "An imported transaction does not belong to this wallet.",
                    ));
                }
                planned
                    .entry(("transaction".to_owned(), txid.to_string()))
                    .or_default()
                    .push(record.label.clone());
            }
            "output" => {
                let outpoint = OutPoint::from_str(&record.reference).map_err(|_| {
                    api_error(
                        "label_import_invalid",
                        "An imported output reference is invalid.",
                    )
                })?;
                let owned = wallet.get_tx(outpoint.txid).is_some_and(|tx| {
                    tx.tx_node
                        .tx
                        .output
                        .get(outpoint.vout as usize)
                        .is_some_and(|output| wallet.is_mine(output.script_pubkey.clone()))
                });
                if !owned
                    && !is_retained_rbf_output(
                        &transaction,
                        &outpoint.to_string(),
                        &outpoint.txid.to_string(),
                    )?
                {
                    return Err(api_error(
                        "backup_mismatch",
                        "An imported output does not belong to this wallet.",
                    ));
                }
                let canonical = outpoint.to_string();
                planned
                    .entry(("output".to_owned(), canonical.clone()))
                    .or_default()
                    .push(record.label.clone());
                if let Some(value) = record.spendable {
                    if !unspent.contains(&canonical) {
                        return Err(api_error(
                            "backup_mismatch",
                            "Spendability can be imported only for a current wallet coin.",
                        ));
                    }
                    if spendability
                        .insert(canonical, value)
                        .is_some_and(|old| old != value)
                    {
                        return Err(api_error(
                            "label_import_conflict",
                            "The import contains conflicting spendability for one coin.",
                        ));
                    }
                }
            }
            "xpub" => match signer_map.get(&record.reference) {
                Some(existing) if existing == &record.label => ignored += 1,
                Some(_) => return Err(api_error(
                    "label_import_conflict",
                    "An imported signer label conflicts with this wallet's current signer name.",
                )),
                None => {
                    return Err(api_error(
                        "backup_mismatch",
                        "An imported public account key does not belong to this wallet.",
                    ))
                }
            },
            _ => ignored += 1,
        }
    }
    for labels in planned.values_mut() {
        let mut seen = BTreeSet::new();
        labels.retain(|label| {
            seen.insert(
                label
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .to_lowercase(),
            )
        });
    }
    for ((kind, subject), labels) in &planned {
        let existing =
            label_provenance::labels_for_subject(&transaction, kind, subject).map_err(internal)?;
        let existing_normalized = existing
            .iter()
            .map(|label| {
                label
                    .text
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .to_lowercase()
            })
            .collect::<BTreeSet<_>>();
        let additions = labels
            .iter()
            .filter(|label| {
                !existing_normalized.contains(
                    &label
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                        .to_lowercase(),
                )
            })
            .count();
        if existing.len().saturating_add(additions) > 12 {
            return Err(api_error(
                "label_import_conflict",
                "An imported subject would exceed Groot's 12-label history limit.",
            ));
        }
    }
    drop(wallet);
    let mut imported = 0;
    let mut unchanged = 0;
    for ((kind, subject), labels) in planned {
        for label in labels {
            if label_provenance::append_imported_label(&transaction, &label, &kind, &subject, now())
                .map_err(|_| {
                    api_error(
                        "label_import_conflict",
                        "Imported labels conflict with permanent label history.",
                    )
                })?
            {
                imported += 1;
            } else {
                unchanged += 1;
            }
        }
    }
    let mut spendability_changes = 0;
    for (outpoint, spendable) in spendability {
        let changed = if spendable {
            transaction.execute(
                "DELETE FROM groot_frozen_coins WHERE outpoint = ?1",
                params![outpoint],
            )
        } else {
            transaction.execute(
                "INSERT OR IGNORE INTO groot_frozen_coins(outpoint, frozen_at) VALUES(?1, ?2)",
                params![outpoint, now()],
            )
        }
        .map_err(internal)?;
        spendability_changes += changed;
    }
    transaction.commit().map_err(internal)?;
    Ok(LabelImportResultDto {
        imported_count: imported,
        unchanged_count: unchanged,
        ignored_count: ignored,
        spendability_change_count: spendability_changes,
    })
}

#[tauri::command]
pub async fn bip329_labels_export(app: AppHandle) -> ApiResult<LabelExportResultDto> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let profile = selected_profile(&app)?;
        let signers = signer_labels(&app, &profile)?;
        let mut db = match profile.kind {
            WalletKind::Multisig => open_multisig_db(&app)?,
            WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
        };
        let wallet = load_wallet(&mut db)?;
        label_provenance::reconcile_wallet_outputs(&wallet, &db, now()).map_err(internal)?;
        let records = collect_export_records(&db, &wallet, &signers)?;
        let content = encode_records(&records)?;
        let selected = app
            .dialog()
            .file()
            .set_file_name("groot-labels.jsonl")
            .add_filter("BIP329 wallet labels", &["jsonl"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(LabelExportResultDto {
                saved: false,
                record_count: 0,
                reveal_token: None,
                reveal_label: None,
            });
        };
        let path = selected.into_path().map_err(internal)?;
        export_commands::write_public_export(&path, &content)?;
        let saved_file = export_commands::saved_file_result(&state, Some(path))?;
        Ok(LabelExportResultDto {
            saved: saved_file.saved,
            record_count: records.len(),
            reveal_token: saved_file.reveal_token,
            reveal_label: saved_file.reveal_label,
        })
    })
    .await
    .map_err(internal)?
}

#[tauri::command]
pub async fn bip329_labels_import(app: AppHandle) -> ApiResult<Option<LabelImportResultDto>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let selected = app
            .dialog()
            .file()
            .add_filter("BIP329 wallet labels", &["jsonl"])
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(internal)?;
        let metadata = fs::symlink_metadata(&path).map_err(internal)?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() > MAX_BIP329_BYTES
        {
            return Err(api_error(
                "label_import_invalid",
                "Choose a regular BIP329 JSONL file of at most 1 MiB.",
            ));
        }
        let mut bytes = Vec::new();
        File::open(&path)
            .map_err(internal)?
            .take(MAX_BIP329_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(internal)?;
        let (records, ignored) = parse_records(&bytes)?;
        let profile = selected_profile(&app)?;
        let signers = signer_labels(&app, &profile)?;
        let mut db = match profile.kind {
            WalletKind::Multisig => open_multisig_db(&app)?,
            WalletKind::SingleKey | WalletKind::WatchOnly => open_db(&app)?,
        };
        import_records(&mut db, &records, ignored, &signers).map(Some)
    })
    .await
    .map_err(internal)?
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_WORDS: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

    fn label_wallet(credential: &str) -> (Connection, String) {
        label_wallet_in(Connection::open_in_memory().unwrap(), credential)
    }

    fn label_wallet_in(mut db: Connection, credential: &str) -> (Connection, String) {
        let mnemonic = Mnemonic::parse(TEST_WORDS).unwrap();
        let master = root_key(&mnemonic, credential).unwrap();
        init_app_schema(&db).unwrap();
        let wallet = Wallet::create(
            Bip84(master, KeychainKind::External),
            Bip84(master, KeychainKind::Internal),
        )
        .network(NETWORK)
        .create_wallet(&mut db)
        .unwrap();
        let address = wallet
            .peek_address(KeychainKind::External, 0)
            .address
            .to_string();
        db.execute(
            "INSERT INTO groot_addresses(idx, address, label, created_at, state) VALUES(0, ?1, 'fixture', 1, 'awaiting')",
            params![address],
        )
        .unwrap();
        drop(wallet);
        (db, address)
    }

    #[test]
    fn official_vector_is_schema_valid_and_unknown_types_are_ignored() {
        let vector = br#"{"type":"tx","ref":"f91d0a8a78462bc59398f2c5d7a84fcff491c26ba54c4833478b202796c8aafd","label":"Transaction"}
{"type":"addr","ref":"bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c","label":"Address"}
{"type":"pubkey","ref":"0283409659355b6d1cc3c32decd5d561abaac86c37a353b52895a5e6c196d6f448","label":"Public Key"}
{"type":"input","ref":"f91d0a8a78462bc59398f2c5d7a84fcff491c26ba54c4833478b202796c8aafd:0","label":"Input"}
{"type":"output","ref":"f91d0a8a78462bc59398f2c5d7a84fcff491c26ba54c4833478b202796c8aafd:1","label":"Output","spendable":false}
{"type":"xpub","ref":"xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8","label":"Extended Public Key"}
{"type":"spscan","ref":"spscan1qfixture","label":"Silent Payments Scan Key Expression"}
"#;
        let (records, ignored) = parse_records(vector).unwrap();
        assert_eq!(records.len(), 4);
        assert_eq!(ignored, 3);
    }

    #[test]
    fn deterministic_encoding_has_canonical_key_order_and_final_lf() {
        let encoded = encode_records(&[Bip329Record {
            record_type: "addr".to_owned(),
            reference: "tb1qfixture".to_owned(),
            label: "Savings".to_owned(),
            spendable: None,
        }])
        .unwrap();
        assert_eq!(
            encoded,
            b"{\"type\":\"addr\",\"ref\":\"tb1qfixture\",\"label\":\"Savings\"}\n"
        );
    }

    #[test]
    fn export_result_exposes_only_the_opaque_saved_file_capability() {
        let result = serde_json::to_value(LabelExportResultDto {
            saved: true,
            record_count: 20,
            reveal_token: Some("opaque-token".to_owned()),
            reveal_label: Some("Show in Finder".to_owned()),
        })
        .unwrap();
        assert_eq!(result["saved"], true);
        assert_eq!(result["recordCount"], 20);
        assert_eq!(result["revealToken"], "opaque-token");
        assert_eq!(result["revealLabel"], "Show in Finder");
        assert!(result.get("path").is_none());
    }

    #[test]
    fn malformed_oversized_and_private_material_fail_closed() {
        assert_eq!(
            parse_records(b"[]\n").unwrap_err().code,
            "label_import_invalid"
        );
        assert_eq!(
            parse_records(b"{\"type\":\"xpub\",\"ref\":\"xprv-secret\",\"label\":\"bad\"}\n")
                .unwrap_err()
                .code,
            "private_material_rejected"
        );
        assert_eq!(
            parse_records(&vec![b'a'; MAX_BIP329_BYTES as usize + 1])
                .unwrap_err()
                .code,
            "label_import_invalid"
        );
        assert_eq!(
            encode_records(&[Bip329Record {
                record_type: "addr".to_owned(),
                reference: "tb1qfixture".to_owned(),
                label: "xprv-secret".to_owned(),
                spendable: None,
            }])
            .unwrap_err()
            .code,
            "private_material_rejected"
        );
    }

    #[test]
    fn address_import_is_additive_idempotent_deterministic_and_atomic() {
        let (mut db, address) = label_wallet("bip329 import");
        let first = Bip329Record {
            record_type: "addr".to_owned(),
            reference: address.clone(),
            label: "Savings".to_owned(),
            spendable: None,
        };
        let result = import_records(&mut db, std::slice::from_ref(&first), 0, &[]).unwrap();
        assert_eq!(result.imported_count, 1);
        let repeated = import_records(&mut db, std::slice::from_ref(&first), 0, &[]).unwrap();
        assert_eq!(repeated.imported_count, 0);
        assert_eq!(repeated.unchanged_count, 1);

        let wallet = load_wallet(&mut db).unwrap();
        let records = collect_export_records(&db, &wallet, &[]).unwrap();
        assert_eq!(records, vec![first.clone()]);
        assert_eq!(
            encode_records(&records).unwrap(),
            encode_records(&records).unwrap()
        );
        drop(wallet);

        let (_, foreign_address) = label_wallet("foreign wallet");
        let error = import_records(
            &mut db,
            &[
                Bip329Record {
                    label: "Additive history".to_owned(),
                    ..first
                },
                Bip329Record {
                    record_type: "addr".to_owned(),
                    reference: foreign_address,
                    label: "Foreign".to_owned(),
                    spendable: None,
                },
            ],
            0,
            &[],
        )
        .unwrap_err();
        assert_eq!(error.code, "backup_mismatch");
        assert_eq!(
            label_provenance::labels_for_subject(&db, "address", "0")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn export_keeps_completed_rbf_label_history_but_rejects_orphans() {
        let (mut db, _) = label_wallet("rbf label export");
        let original_txid = "11".repeat(32);
        let replacement_txid = "22".repeat(32);
        let original_outpoint = format!("{original_txid}:1");
        let replacement_outpoint = format!("{replacement_txid}:1");
        label_provenance::assign_new_label(
            &db,
            "Original payment",
            LabelOrigin::Payment,
            "transaction",
            &original_txid,
            1,
        )
        .unwrap();
        label_provenance::assign_new_label(
            &db,
            "Replacement payment",
            LabelOrigin::Payment,
            "transaction",
            &replacement_txid,
            2,
        )
        .unwrap();
        let original_output_label_id = label_provenance::assign_new_label(
            &db,
            "Original change",
            LabelOrigin::Imported,
            "output",
            &original_outpoint,
            1,
        )
        .unwrap();
        let replacement_output_label_id = label_provenance::assign_new_label(
            &db,
            "Replacement change",
            LabelOrigin::Imported,
            "output",
            &replacement_outpoint,
            2,
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_output_lineage
             (outpoint, source_txid, context, provenance_state, address_reused)
             VALUES (?1, ?2, 'change', 'known', 0)",
            params![original_outpoint, original_txid],
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_output_lineage
             (outpoint, source_txid, context, provenance_state, address_reused)
             VALUES (?1, ?2, 'change', 'known', 0)",
            params![replacement_outpoint, replacement_txid],
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_output_provenance(outpoint, label_id) VALUES (?1, ?2)",
            params![original_outpoint, original_output_label_id],
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_output_provenance(outpoint, label_id) VALUES (?1, ?2)",
            params![replacement_outpoint, replacement_output_label_id],
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_proposals
             (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, txid)
             VALUES ('rbf-export', 'bcrt1qfixture', 'Miner fee increase', 100, 5, 2,
                     'fixture', 'broadcast', 2, ?1)",
            params![replacement_txid],
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_accelerations
             (proposal_id, method, original_txid, replacement_txid, original_kind,
              original_direction, original_amount, original_fee, original_date,
              original_address, original_label, created_at)
             VALUES ('rbf-export', 'rbf', ?1, ?2, 'payment', 'sent', 100, 2, '1',
                     'bcrt1qfixture', 'Original payment', 2)",
            params![original_txid, replacement_txid],
        )
        .unwrap();

        let wallet = load_wallet(&mut db).unwrap();
        let records = collect_export_records(&db, &wallet, &[]).unwrap();
        assert!(records
            .iter()
            .any(|record| { record.record_type == "tx" && record.reference == original_txid }));
        assert!(records
            .iter()
            .any(|record| { record.record_type == "tx" && record.reference == replacement_txid }));
        assert!(records.iter().any(|record| {
            record.record_type == "output"
                && record.reference == original_outpoint
                && record.spendable.is_none()
        }));
        assert!(records.iter().any(|record| {
            record.record_type == "output"
                && record.reference == replacement_outpoint
                && record.spendable.is_none()
        }));
        drop(wallet);

        let imported = import_records(
            &mut db,
            &[
                Bip329Record {
                    record_type: "tx".to_owned(),
                    reference: replacement_txid.clone(),
                    label: "Imported replacement context".to_owned(),
                    spendable: None,
                },
                Bip329Record {
                    record_type: "output".to_owned(),
                    reference: replacement_outpoint.clone(),
                    label: "Imported replacement coin".to_owned(),
                    spendable: None,
                },
            ],
            0,
            &[],
        )
        .unwrap();
        assert_eq!(imported.imported_count, 2);
        let wallet = load_wallet(&mut db).unwrap();
        let records = collect_export_records(&db, &wallet, &[]).unwrap();
        assert!(records.iter().any(|record| {
            record.record_type == "tx"
                && record.reference == replacement_txid
                && record.label == "Imported replacement context"
        }));
        assert!(records.iter().any(|record| {
            record.record_type == "output"
                && record.reference == replacement_outpoint
                && record.label == "Imported replacement coin"
        }));
        drop(wallet);

        let orphan_output_txid = "33".repeat(32);
        let orphan_outpoint = format!("{orphan_output_txid}:0");
        let orphan_output_label_id = label_provenance::assign_new_label(
            &db,
            "Orphan output",
            LabelOrigin::Imported,
            "output",
            &orphan_outpoint,
            3,
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_output_lineage
             (outpoint, source_txid, context, provenance_state, address_reused)
             VALUES (?1, ?2, 'change', 'known', 0)",
            params![orphan_outpoint, orphan_output_txid],
        )
        .unwrap();
        db.execute(
            "INSERT INTO groot_output_provenance(outpoint, label_id) VALUES (?1, ?2)",
            params![orphan_outpoint, orphan_output_label_id],
        )
        .unwrap();
        let wallet = load_wallet(&mut db).unwrap();
        let error = collect_export_records(&db, &wallet, &[]).unwrap_err();
        assert_eq!(error.code, "wallet_corrupt");
        assert_eq!(
            error.message,
            "An output label no longer matches a wallet-owned output."
        );
        drop(wallet);
        db.execute(
            "DELETE FROM groot_label_assignments
             WHERE subject_kind = 'output' AND subject_id = ?1",
            params![orphan_outpoint],
        )
        .unwrap();
        db.execute(
            "DELETE FROM groot_output_lineage WHERE outpoint = ?1",
            params![orphan_outpoint],
        )
        .unwrap();

        let orphan_txid = "33".repeat(32);
        label_provenance::assign_new_label(
            &db,
            "Orphan",
            LabelOrigin::Imported,
            "transaction",
            &orphan_txid,
            3,
        )
        .unwrap();
        let wallet = load_wallet(&mut db).unwrap();
        assert_eq!(
            collect_export_records(&db, &wallet, &[]).unwrap_err().code,
            "wallet_corrupt"
        );
    }

    #[test]
    fn signer_conflict_fails_before_any_label_history_changes() {
        let (mut db, address) = label_wallet("signer conflict");
        let error = import_records(
            &mut db,
            &[
                Bip329Record {
                    record_type: "addr".to_owned(),
                    reference: address,
                    label: "Would roll back".to_owned(),
                    spendable: None,
                },
                Bip329Record {
                    record_type: "xpub".to_owned(),
                    reference: "tpub-fixture".to_owned(),
                    label: "Conflicting signer".to_owned(),
                    spendable: None,
                },
            ],
            0,
            &[("tpub-fixture".to_owned(), "Hardware signer".to_owned())],
        )
        .unwrap_err();
        assert_eq!(error.code, "label_import_conflict");
        assert!(label_provenance::labels_for_subject(&db, "address", "0")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn imported_history_survives_database_restart_and_remains_idempotent() {
        let path = std::env::temp_dir().join(format!("groot-bip329-{}.sqlite", Uuid::new_v4()));
        let (mut db, address) = label_wallet_in(Connection::open(&path).unwrap(), "restart labels");
        let record = Bip329Record {
            record_type: "addr".to_owned(),
            reference: address,
            label: "Restart-safe history".to_owned(),
            spendable: None,
        };
        assert_eq!(
            import_records(&mut db, std::slice::from_ref(&record), 0, &[])
                .unwrap()
                .imported_count,
            1
        );
        drop(db);

        let mut reopened = Connection::open(&path).unwrap();
        init_app_schema(&reopened).unwrap();
        assert_eq!(
            label_provenance::labels_for_subject(&reopened, "address", "0")
                .unwrap()
                .into_iter()
                .map(|label| label.text)
                .collect::<Vec<_>>(),
            vec!["Restart-safe history"]
        );
        assert_eq!(
            import_records(&mut reopened, &[record], 0, &[])
                .unwrap()
                .unchanged_count,
            1
        );
        drop(reopened);
        fs::remove_file(path).unwrap();
    }
}
