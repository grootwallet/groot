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
                .map(|input| source_provenance(db, &input.previous_output.to_string()))
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
