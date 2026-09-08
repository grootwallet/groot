// Frozen pre-optimization oracle. Keep independent of the production work queue.
use super::*;
use bdk_wallet::bitcoin::{
    absolute::LockTime, bip32::Xpriv, hashes::Hash, transaction::Version, Amount, Network,
    ScriptBuf, Sequence, Transaction, TxIn, TxOut, Txid, Witness,
};

fn fixture_db() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(
        "PRAGMA foreign_keys=ON;
         CREATE TABLE groot_addresses(idx INTEGER PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL);
         CREATE TABLE groot_proposals(proposal_id TEXT PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL, txid TEXT, status TEXT);"
    ).unwrap();
    init_schema(&db).unwrap();
    for index in 0..3 {
        insert_legacy_label(
            &db,
            &format!("label-{index}"),
            &format!("Label {index}"),
            LabelOrigin::Receive,
            1,
            "address",
            &index.to_string(),
        )
        .unwrap();
    }
    db
}

fn persisted_rows(db: &Connection) -> Vec<(String, Vec<String>)> {
    let tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    tables
        .into_iter()
        .map(|table| {
            let mut statement = db.prepare(&format!("SELECT * FROM {table}")).unwrap();
            let columns = statement.column_count();
            let mut rows = statement
                .query_map([], |row| {
                    (0..columns)
                        .map(|column| row.get::<_, bdk_wallet::rusqlite::types::Value>(column))
                        .collect::<Result<Vec<_>, _>>()
                })
                .unwrap()
                .map(|row| format!("{:?}", row.unwrap()))
                .collect::<Vec<_>>();
            rows.sort();
            (table, rows)
        })
        .collect()
}

fn compare(wallet: &Wallet, old: &Connection, new: &Connection, time: u64) {
    legacy_reconcile_wallet_outputs(wallet, old, time).unwrap();
    reconcile_wallet_outputs(wallet, new, time).unwrap();
    assert_eq!(persisted_rows(old), persisted_rows(new));
    for tx in wallet.transactions() {
        for (vout, output) in tx.tx_node.tx.output.iter().enumerate() {
            if wallet
                .derivation_of_spk(output.script_pubkey.clone())
                .is_some()
            {
                let outpoint = format!("{}:{vout}", tx.tx_node.txid);
                assert_eq!(
                    serde_json::to_value(output_summary(old, &outpoint).unwrap()).unwrap(),
                    serde_json::to_value(output_summary(new, &outpoint).unwrap()).unwrap()
                );
            }
        }
    }
}

fn transaction(inputs: Vec<OutPoint>, script: ScriptBuf, value: u64) -> Transaction {
    Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: inputs
            .into_iter()
            .map(|previous_output| TxIn {
                previous_output,
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            })
            .collect(),
        output: vec![TxOut {
            value: Amount::from_sat(value),
            script_pubkey: script,
        }],
    }
}

#[test]
fn work_queue_matches_legacy_for_chains_mixed_unknown_reuse_and_replacement() {
    for seed in 1..=8 {
        let master = Xpriv::new_master(Network::Regtest, &[seed; 32]).unwrap();
        let mut wallet =
            Wallet::create(format!("wpkh({master}/0/*)"), format!("wpkh({master}/1/*)"))
                .network(Network::Regtest)
                .create_wallet_no_persist()
                .unwrap();
        let old = fixture_db();
        let new = fixture_db();
        let roots = (0..4)
            .map(|i| {
                transaction(
                    vec![OutPoint::new(Txid::from_byte_array([i + 30; 32]), 0)],
                    wallet
                        .reveal_next_address(KeychainKind::External)
                        .address
                        .script_pubkey(),
                    100_000,
                )
            })
            .collect::<Vec<_>>();
        let mut graph = roots.clone();
        let mut input = OutPoint::new(roots[0].compute_txid(), 0);
        for depth in 0..12 {
            let mut inputs = vec![input];
            if depth < 3 {
                inputs.push(OutPoint::new(roots[depth + 1].compute_txid(), 0));
            }
            let tx = transaction(
                inputs,
                wallet
                    .reveal_next_address(KeychainKind::Internal)
                    .address
                    .script_pubkey(),
                90_000 - depth as u64 * 1_000,
            );
            input = OutPoint::new(tx.compute_txid(), 0);
            graph.push(tx);
        }
        // Reverse arrival and alternating timestamps exercise graph order independent
        // of insertion order. The fourth root is deliberately unlabeled.
        wallet.apply_unconfirmed_txs(graph.iter().rev().enumerate().map(|(i, tx)| {
            (
                tx.clone(),
                if seed % 2 == 0 {
                    i as u64 + 1
                } else {
                    100 - i as u64
                },
            )
        }));
        compare(&wallet, &old, &new, 200);
        compare(&wallet, &old, &new, 201);
        for db in [&old, &new] {
            insert_legacy_label(
                db,
                "extra",
                "Extra output label",
                LabelOrigin::Imported,
                202,
                "output",
                &format!("{}:0", graph[5].compute_txid()),
            )
            .unwrap();
        }
        compare(&wallet, &old, &new, 203);
        let original = graph.last().unwrap();
        let mut replacement = original.clone();
        replacement.output[0].value = Amount::from_sat(70_000);
        wallet.apply_unconfirmed_txs([(replacement.clone(), 300)]);
        assert!(wallet
            .transactions()
            .any(|tx| tx.tx_node.txid == replacement.compute_txid()));
        compare(&wallet, &old, &new, 301);
        wallet.apply_evicted_txs([(replacement.compute_txid(), 400)]);
        wallet.apply_unconfirmed_txs([(original.clone(), 401)]);
        assert!(wallet
            .transactions()
            .any(|tx| tx.tx_node.txid == original.compute_txid()));
        compare(&wallet, &old, &new, 402);
        // Returning to a receive address must preserve historical address reuse.
        let reused = transaction(
            vec![input],
            wallet
                .peek_address(KeychainKind::External, 0)
                .address
                .script_pubkey(),
            60_000,
        );
        wallet.apply_unconfirmed_txs([(reused, 500)]);
        compare(&wallet, &old, &new, 501);
        init_schema(&old).unwrap();
        init_schema(&new).unwrap();
        compare(&wallet, &old, &new, 502);
    }
}

// Frozen three-query read oracle, independent of the optimized compound query.
fn legacy_source_provenance(
    db: &Connection,
    outpoint: &str,
) -> Result<SourceProvenance, bdk_wallet::rusqlite::Error> {
    let state = db
        .query_row(
            "SELECT provenance_state FROM groot_output_lineage WHERE outpoint = ?1",
            params![outpoint],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(state) = state else {
        return Ok(SourceProvenance::unknown());
    };
    let labels: BTreeSet<String> = {
        let mut statement = db.prepare(
            "SELECT label_id FROM groot_output_provenance WHERE outpoint = ?1 ORDER BY label_id",
        )?;
        let values = statement
            .query_map(params![outpoint], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        values.into_iter().collect()
    };
    let clusters: BTreeSet<String> = {
        let mut statement = db.prepare(
            "SELECT cluster_id FROM groot_output_clusters WHERE outpoint = ?1 ORDER BY cluster_id",
        )?;
        let values = statement
            .query_map(params![outpoint], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        values.into_iter().collect()
    };
    if clusters.is_empty() || (state != "unknown" && labels.is_empty()) {
        return Err(bdk_wallet::rusqlite::Error::InvalidQuery);
    }
    Ok(SourceProvenance {
        labels,
        clusters,
        unknown: state == "unknown",
    })
}

#[test]
fn compound_provenance_read_matches_legacy_and_rejects_incomplete_evidence() {
    for state in [None, Some("unknown"), Some("known"), Some("mixed")] {
        for label_count in [0, 1, 3] {
            for cluster_count in [0, 1, 4] {
                let db = fixture_db();
                // Deliberately permit orphan rows to verify the missing-lineage
                // behavior of corrupt/partially imported fixture data as well.
                db.execute_batch("PRAGMA foreign_keys=OFF").unwrap();
                if let Some(state) = state {
                    db.execute("INSERT INTO groot_output_lineage(outpoint,source_txid,context,provenance_state) VALUES('synthetic:0','synthetic','received',?1)", [state]).unwrap();
                }
                for index in 0..label_count {
                    db.execute(
                        "INSERT INTO groot_output_provenance VALUES('synthetic:0',?1)",
                        [format!("label-{index}")],
                    )
                    .unwrap();
                }
                for index in 0..cluster_count {
                    db.execute(
                        "INSERT INTO groot_output_clusters VALUES('synthetic:0',?1)",
                        [format!("cluster-{index}")],
                    )
                    .unwrap();
                }
                let expected = legacy_source_provenance(&db, "synthetic:0");
                let actual = source_provenance(&db, "synthetic:0");
                match (expected, actual) {
                    (Ok(expected), Ok(actual)) => assert_eq!(actual, expected),
                    (Err(expected), Err(actual)) => {
                        assert_eq!(actual.to_string(), expected.to_string())
                    }
                    (expected, actual) => panic!("read mismatch: {expected:?} / {actual:?}"),
                }
            }
        }
    }
}

#[test]
fn compound_provenance_read_does_not_cache_wallet_data_or_hide_corruption() {
    let db = fixture_db();
    assert_eq!(
        source_provenance(&db, "synthetic:0").unwrap(),
        SourceProvenance::unknown()
    );
    db.execute("INSERT INTO groot_output_lineage(outpoint,source_txid,context,provenance_state) VALUES('synthetic:0','synthetic','received','unknown')", []).unwrap();
    assert!(source_provenance(&db, "synthetic:0").is_err());
    db.execute("INSERT INTO groot_privacy_clusters VALUES('cluster',1)", [])
        .unwrap();
    db.execute(
        "INSERT INTO groot_output_clusters VALUES('synthetic:0','cluster')",
        [],
    )
    .unwrap();
    assert!(source_provenance(&db, "synthetic:0").unwrap().unknown);
    db.execute(
        "UPDATE groot_output_lineage SET provenance_state='known'",
        [],
    )
    .unwrap();
    assert!(source_provenance(&db, "synthetic:0").is_err());
    db.execute(
        "INSERT INTO groot_output_provenance VALUES('synthetic:0','label-0')",
        [],
    )
    .unwrap();
    assert!(!source_provenance(&db, "synthetic:0").unwrap().unknown);
    let other = fixture_db();
    assert_eq!(
        source_provenance(&other, "synthetic:0").unwrap(),
        SourceProvenance::unknown()
    );
    db.execute_batch("PRAGMA foreign_keys=OFF; UPDATE groot_output_clusters SET cluster_id=x'80'")
        .unwrap();
    assert!(legacy_source_provenance(&db, "synthetic:0").is_err());
    assert!(source_provenance(&db, "synthetic:0").is_err());
}

#[test]
fn grouped_reuse_refresh_matches_legacy_and_skips_unchanged_row_writes() {
    let db = fixture_db();
    for (index, (address, reused)) in [
        (Some(0), 0),
        (Some(0), 0),
        (Some(1), 1),
        (None, 1),
        (Some(2), 0),
        (Some(2), 1),
    ]
    .into_iter()
    .enumerate()
    {
        db.execute("INSERT INTO groot_output_lineage(outpoint,source_txid,context,provenance_state,address_idx,address_reused) VALUES(?1,'synthetic','received','unknown',?2,?3)", params![format!("synthetic:{index}"),address,reused]).unwrap();
    }
    assert_eq!(refresh_address_reuse(&db).unwrap(), 5);
    assert_eq!(refresh_address_reuse(&db).unwrap(), 0);
    let before = persisted_rows(&db);
    db.execute("UPDATE groot_output_lineage SET address_reused = CASE WHEN address_idx IS NOT NULL AND (SELECT COUNT(*) FROM groot_output_lineage sibling WHERE sibling.address_idx = groot_output_lineage.address_idx) > 1 THEN 1 ELSE 0 END", []).unwrap();
    assert_eq!(persisted_rows(&db), before);
    db.execute_batch(
        "BEGIN; UPDATE groot_output_lineage SET address_idx=3 WHERE outpoint='synthetic:5'",
    )
    .unwrap();
    assert_eq!(refresh_address_reuse(&db).unwrap(), 2);
    db.execute_batch("ROLLBACK").unwrap();
    assert_eq!(persisted_rows(&db), before);
    assert_eq!(refresh_address_reuse(&db).unwrap(), 0);
}

#[test]
fn grouped_reuse_plan_has_no_per_output_correlated_scan() {
    let db = fixture_db();
    let mut statement = db
        .prepare(&format!("EXPLAIN QUERY PLAN {REFRESH_ADDRESS_REUSE_SQL}"))
        .unwrap();
    let plan = statement
        .query_map([], |row| row.get::<_, String>(3))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
        .join("\n");
    assert!(plan.contains("MATERIALIZE reused"), "{plan}");
    assert!(!plan.contains("CORRELATED"), "{plan}");
}

fn legacy_reconcile_wallet_outputs(
    wallet: &Wallet,
    db: &Connection,
    created_at: u64,
) -> Result<(), bdk_wallet::rusqlite::Error> {
    let transaction_count = wallet.transactions().count();
    for _ in 0..transaction_count.saturating_add(1) {
        for canonical in wallet.transactions() {
            let transaction = canonical.tx_node.tx.as_ref();
            let txid = transaction.compute_txid().to_string();
            let input_sources = transaction
                .input
                .iter()
                .map(|input| legacy_source_provenance(db, &input.previous_output.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            let derived = derive_change_provenance(&input_sources);
            record_cluster_links(db, &derived.clusters, &txid, created_at)?;
            for input in &transaction.input {
                db.execute(
                    "INSERT OR IGNORE INTO groot_transaction_inputs(txid, outpoint) VALUES(?1, ?2)",
                    params![txid, input.previous_output.to_string()],
                )?;
            }

            for (vout, output) in transaction.output.iter().enumerate() {
                let Some((keychain, derivation_index)) =
                    wallet.derivation_of_spk(output.script_pubkey.clone())
                else {
                    continue;
                };
                let outpoint = OutPoint {
                    txid: transaction.compute_txid(),
                    vout: vout as u32,
                }
                .to_string();
                if keychain == KeychainKind::External {
                    let labels = labels_for_subject(db, "address", &derivation_index.to_string())?;
                    let provenance = if labels.is_empty() {
                        DerivedProvenance {
                            labels: BTreeSet::new(),
                            clusters: BTreeSet::new(),
                            state: ProvenanceState::Unknown,
                        }
                    } else {
                        DerivedProvenance {
                            labels: labels.into_iter().map(|label| label.id).collect(),
                            clusters: BTreeSet::new(),
                            state: ProvenanceState::Known,
                        }
                    };
                    let receive_cluster =
                        BTreeSet::from([format!("cluster-address-{derivation_index}")]);
                    materialize_output(
                        db,
                        OutputMaterialization {
                            outpoint: &outpoint,
                            txid: &txid,
                            context: "received",
                            address_idx: Some(derivation_index),
                            provenance: &provenance,
                            clusters: &receive_cluster,
                            created_at,
                        },
                    )?;
                } else {
                    materialize_output(
                        db,
                        OutputMaterialization {
                            outpoint: &outpoint,
                            txid: &txid,
                            context: "change",
                            address_idx: None,
                            provenance: &derived,
                            clusters: &derived.clusters,
                            created_at,
                        },
                    )?;
                }
            }
        }
    }

    db.execute(
        "UPDATE groot_output_lineage
         SET address_reused = CASE WHEN address_idx IS NOT NULL AND (
           SELECT COUNT(*) FROM groot_output_lineage sibling
           WHERE sibling.address_idx = groot_output_lineage.address_idx
         ) > 1 THEN 1 ELSE 0 END",
        [],
    )?;
    Ok(())
}
