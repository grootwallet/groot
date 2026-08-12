use bdk_wallet::{
    bitcoin::OutPoint,
    rusqlite::{params, Connection, OptionalExtension},
    KeychainKind, Wallet,
};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};
use uuid::Uuid;

use crate::privacy_selection::CoinPrivacy;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LabelOrigin {
    Receive,
    Payment,
    #[allow(dead_code)]
    Imported,
}

impl LabelOrigin {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Receive => "receive",
            Self::Payment => "payment",
            Self::Imported => "imported",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermanentLabelDto {
    pub id: String,
    pub text: String,
    pub origin: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProvenanceState {
    Known,
    Mixed,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceSummaryDto {
    pub state: ProvenanceState,
    pub context: String,
    pub labels: Vec<PermanentLabelDto>,
    pub cluster_count: usize,
    pub address_reused: bool,
}

impl ProvenanceSummaryDto {
    pub fn unknown(context: impl Into<String>) -> Self {
        Self {
            state: ProvenanceState::Unknown,
            context: context.into(),
            labels: Vec::new(),
            cluster_count: 0,
            address_reused: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceProvenance {
    pub labels: BTreeSet<String>,
    pub clusters: BTreeSet<String>,
    pub unknown: bool,
}

impl SourceProvenance {
    #[cfg(test)]
    pub fn known(label: impl Into<String>, cluster: impl Into<String>) -> Self {
        Self {
            labels: BTreeSet::from([label.into()]),
            clusters: BTreeSet::from([cluster.into()]),
            unknown: false,
        }
    }

    pub fn unknown() -> Self {
        Self {
            labels: BTreeSet::new(),
            clusters: BTreeSet::new(),
            unknown: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DerivedProvenance {
    pub labels: BTreeSet<String>,
    pub clusters: BTreeSet<String>,
    pub state: ProvenanceState,
}

pub fn derive_change_provenance<'a>(
    inputs: impl IntoIterator<Item = &'a SourceProvenance>,
) -> DerivedProvenance {
    let mut labels = BTreeSet::new();
    let mut clusters = BTreeSet::new();
    let mut unknown = false;
    let mut saw_input = false;
    for input in inputs {
        saw_input = true;
        labels.extend(input.labels.iter().cloned());
        clusters.extend(input.clusters.iter().cloned());
        unknown |= input.unknown;
    }
    let state = if !saw_input || unknown {
        ProvenanceState::Unknown
    } else if labels.len() > 1 || clusters.len() > 1 {
        ProvenanceState::Mixed
    } else {
        ProvenanceState::Known
    };
    DerivedProvenance {
        labels,
        clusters,
        state,
    }
}

fn normalized_reuse_guard(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn init_schema(db: &Connection) -> Result<(), bdk_wallet::rusqlite::Error> {
    let migration = db.unchecked_transaction()?;
    init_schema_in_transaction(&migration)?;
    migration.commit()
}

fn init_schema_in_transaction(db: &Connection) -> Result<(), bdk_wallet::rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS groot_label_schema (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            version INTEGER NOT NULL CHECK(version >= 1)
        );
        CREATE TABLE IF NOT EXISTS groot_labels (
            label_id TEXT PRIMARY KEY,
            text TEXT NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 48),
            reuse_guard TEXT NOT NULL UNIQUE,
            origin TEXT NOT NULL CHECK(origin IN ('receive','payment','imported')),
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_label_assignments (
            label_id TEXT NOT NULL REFERENCES groot_labels(label_id),
            subject_kind TEXT NOT NULL CHECK(subject_kind IN ('address','transaction_intent','transaction','output')),
            subject_id TEXT NOT NULL,
            assigned_at INTEGER NOT NULL,
            PRIMARY KEY(label_id, subject_kind, subject_id),
            UNIQUE(subject_kind, subject_id)
        );
        CREATE TABLE IF NOT EXISTS groot_output_lineage (
            outpoint TEXT PRIMARY KEY,
            source_txid TEXT NOT NULL,
            context TEXT NOT NULL CHECK(context IN ('received','change','unknown')),
            provenance_state TEXT NOT NULL CHECK(provenance_state IN ('known','mixed','unknown')),
            address_idx INTEGER,
            address_reused INTEGER NOT NULL DEFAULT 0 CHECK(address_reused IN (0,1))
        );
        CREATE TABLE IF NOT EXISTS groot_transaction_inputs (
            txid TEXT NOT NULL,
            outpoint TEXT NOT NULL,
            PRIMARY KEY(txid, outpoint)
        );
        CREATE TABLE IF NOT EXISTS groot_output_provenance (
            outpoint TEXT NOT NULL REFERENCES groot_output_lineage(outpoint) ON DELETE CASCADE,
            label_id TEXT NOT NULL REFERENCES groot_labels(label_id),
            PRIMARY KEY(outpoint, label_id)
        );
        CREATE TABLE IF NOT EXISTS groot_privacy_clusters (
            cluster_id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_output_clusters (
            outpoint TEXT NOT NULL REFERENCES groot_output_lineage(outpoint) ON DELETE CASCADE,
            cluster_id TEXT NOT NULL REFERENCES groot_privacy_clusters(cluster_id),
            PRIMARY KEY(outpoint, cluster_id)
        );
        CREATE TABLE IF NOT EXISTS groot_cluster_links (
            left_cluster_id TEXT NOT NULL REFERENCES groot_privacy_clusters(cluster_id),
            right_cluster_id TEXT NOT NULL REFERENCES groot_privacy_clusters(cluster_id),
            linked_by_txid TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            CHECK(left_cluster_id < right_cluster_id),
            PRIMARY KEY(left_cluster_id, right_cluster_id)
        );",
    )?;
    backfill_existing_labels(db)?;
    db.execute(
        "INSERT INTO groot_label_schema(singleton, version) VALUES(1, ?1)
         ON CONFLICT(singleton) DO UPDATE SET version = MAX(version, excluded.version)",
        params![SCHEMA_VERSION],
    )?;
    Ok(())
}

fn insert_legacy_label(
    db: &Connection,
    label_id: &str,
    text: &str,
    origin: LabelOrigin,
    created_at: u64,
    subject_kind: &str,
    subject_id: &str,
) -> Result<(), bdk_wallet::rusqlite::Error> {
    if db
        .query_row(
            "SELECT 1 FROM groot_label_assignments WHERE subject_kind = ?1 AND subject_id = ?2",
            params![subject_kind, subject_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some()
    {
        return Ok(());
    }
    let base_guard = normalized_reuse_guard(text);
    let guard_owner = db
        .query_row(
            "SELECT label_id FROM groot_labels WHERE reuse_guard = ?1",
            params![base_guard],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let reuse_guard = match guard_owner {
        None => base_guard,
        Some(owner) if owner == label_id => base_guard,
        Some(_) => format!("legacy:{subject_kind}:{subject_id}"),
    };
    db.execute(
        "INSERT OR IGNORE INTO groot_labels(label_id, text, reuse_guard, origin, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![label_id, text, reuse_guard, origin.as_str(), created_at],
    )?;
    db.execute(
        "INSERT OR IGNORE INTO groot_label_assignments(label_id, subject_kind, subject_id, assigned_at)
         VALUES(?1, ?2, ?3, ?4)",
        params![label_id, subject_kind, subject_id, created_at],
    )?;
    Ok(())
}

fn backfill_existing_labels(db: &Connection) -> Result<(), bdk_wallet::rusqlite::Error> {
    let addresses = {
        let mut statement = db.prepare("SELECT idx, label, created_at FROM groot_addresses")?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (index, text, created_at) in addresses {
        insert_legacy_label(
            db,
            &format!("receive-address-{index}"),
            &text,
            LabelOrigin::Receive,
            created_at,
            "address",
            &index.to_string(),
        )?;
    }
    let proposals = {
        let mut statement =
            db.prepare("SELECT proposal_id, label, created_at FROM groot_proposals")?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (proposal_id, text, created_at) in proposals {
        insert_legacy_label(
            db,
            &format!("payment-proposal-{proposal_id}"),
            &text,
            LabelOrigin::Payment,
            created_at,
            "transaction_intent",
            &proposal_id,
        )?;
    }
    Ok(())
}

pub fn assign_new_label(
    db: &Connection,
    text: &str,
    origin: LabelOrigin,
    subject_kind: &str,
    subject_id: &str,
    created_at: u64,
) -> Result<String, bdk_wallet::rusqlite::Error> {
    let label_id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO groot_labels(label_id, text, reuse_guard, origin, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![
            label_id,
            text,
            normalized_reuse_guard(text),
            origin.as_str(),
            created_at
        ],
    )?;
    db.execute(
        "INSERT INTO groot_label_assignments(label_id, subject_kind, subject_id, assigned_at)
         VALUES(?1, ?2, ?3, ?4)",
        params![label_id, subject_kind, subject_id, created_at],
    )?;
    Ok(label_id)
}

pub fn assign_payment_intent(
    db: &Connection,
    text: &str,
    proposal_id: &str,
    created_at: u64,
    inherit_existing: bool,
) -> Result<String, bdk_wallet::rusqlite::Error> {
    if inherit_existing {
        if let Some(label_id) = db
            .query_row(
                "SELECT label_id FROM groot_labels WHERE reuse_guard = ?1 AND origin = 'payment'",
                params![normalized_reuse_guard(text)],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        {
            db.execute(
                "INSERT INTO groot_label_assignments(label_id, subject_kind, subject_id, assigned_at)
                 VALUES(?1, 'transaction_intent', ?2, ?3)",
                params![label_id, proposal_id, created_at],
            )?;
            return Ok(label_id);
        }
    }
    assign_new_label(
        db,
        text,
        LabelOrigin::Payment,
        "transaction_intent",
        proposal_id,
        created_at,
    )
}

pub fn label_for_subject(
    db: &Connection,
    subject_kind: &str,
    subject_id: &str,
) -> Result<Option<PermanentLabelDto>, bdk_wallet::rusqlite::Error> {
    db.query_row(
        "SELECT label.label_id, label.text, label.origin
         FROM groot_label_assignments assignment
         JOIN groot_labels label ON label.label_id = assignment.label_id
         WHERE assignment.subject_kind = ?1 AND assignment.subject_id = ?2",
        params![subject_kind, subject_id],
        |row| {
            Ok(PermanentLabelDto {
                id: row.get(0)?,
                text: row.get(1)?,
                origin: row.get(2)?,
            })
        },
    )
    .optional()
}

pub fn payment_label_for_txid(
    db: &Connection,
    txid: &str,
) -> Result<Option<PermanentLabelDto>, bdk_wallet::rusqlite::Error> {
    if let Some(label) = label_for_subject(db, "transaction", txid)? {
        return Ok(Some(label));
    }
    db.query_row(
        "SELECT label.label_id, label.text, label.origin
         FROM groot_proposals proposal
         JOIN groot_label_assignments assignment
           ON assignment.subject_kind = 'transaction_intent'
          AND assignment.subject_id = proposal.proposal_id
         JOIN groot_labels label ON label.label_id = assignment.label_id
         WHERE proposal.txid = ?1 AND proposal.status = 'broadcast'",
        params![txid],
        |row| {
            Ok(PermanentLabelDto {
                id: row.get(0)?,
                text: row.get(1)?,
                origin: row.get(2)?,
            })
        },
    )
    .optional()
}

pub fn bind_broadcast_transaction(
    db: &Connection,
    proposal_id: &str,
    txid: &str,
    assigned_at: u64,
) -> Result<(), bdk_wallet::rusqlite::Error> {
    db.execute(
        "INSERT OR IGNORE INTO groot_label_assignments(label_id, subject_kind, subject_id, assigned_at)
         SELECT label_id, 'transaction', ?2, ?3
         FROM groot_label_assignments
         WHERE subject_kind = 'transaction_intent' AND subject_id = ?1",
        params![proposal_id, txid, assigned_at],
    )?;
    Ok(())
}

fn source_provenance(
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
    let labels = {
        let mut statement = db.prepare(
            "SELECT label_id FROM groot_output_provenance WHERE outpoint = ?1 ORDER BY label_id",
        )?;
        let values = statement
            .query_map(params![outpoint], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        values.into_iter().collect()
    };
    let clusters = {
        let mut statement = db.prepare(
            "SELECT cluster_id FROM groot_output_clusters WHERE outpoint = ?1 ORDER BY cluster_id",
        )?;
        let values = statement
            .query_map(params![outpoint], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        values.into_iter().collect()
    };
    Ok(SourceProvenance {
        labels,
        clusters,
        unknown: state == "unknown",
    })
}

fn record_cluster_links(
    db: &Connection,
    clusters: &BTreeSet<String>,
    txid: &str,
    created_at: u64,
) -> Result<(), bdk_wallet::rusqlite::Error> {
    let clusters = clusters.iter().collect::<Vec<_>>();
    for (index, left) in clusters.iter().enumerate() {
        for right in clusters.iter().skip(index + 1) {
            let (left, right) = if left < right {
                ((*left).as_str(), (*right).as_str())
            } else {
                ((*right).as_str(), (*left).as_str())
            };
            db.execute(
                "INSERT OR IGNORE INTO groot_cluster_links(left_cluster_id, right_cluster_id, linked_by_txid, created_at)
                 VALUES(?1, ?2, ?3, ?4)",
                params![left, right, txid, created_at],
            )?;
        }
    }
    Ok(())
}

struct OutputMaterialization<'a> {
    outpoint: &'a str,
    txid: &'a str,
    context: &'a str,
    address_idx: Option<u32>,
    provenance: &'a DerivedProvenance,
    clusters: &'a BTreeSet<String>,
    created_at: u64,
}

fn materialize_output(
    db: &Connection,
    output: OutputMaterialization<'_>,
) -> Result<(), bdk_wallet::rusqlite::Error> {
    let OutputMaterialization {
        outpoint,
        txid,
        context,
        address_idx,
        provenance,
        clusters,
        created_at,
    } = output;
    let state = match provenance.state {
        ProvenanceState::Known => "known",
        ProvenanceState::Mixed => "mixed",
        ProvenanceState::Unknown => "unknown",
    };
    db.execute(
        "INSERT INTO groot_output_lineage(outpoint, source_txid, context, provenance_state, address_idx)
         VALUES(?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(outpoint) DO UPDATE SET
           source_txid = excluded.source_txid,
           context = excluded.context,
           provenance_state = excluded.provenance_state,
           address_idx = excluded.address_idx",
        params![outpoint, txid, context, state, address_idx],
    )?;
    db.execute(
        "DELETE FROM groot_output_provenance WHERE outpoint = ?1",
        params![outpoint],
    )?;
    for label_id in &provenance.labels {
        db.execute(
            "INSERT INTO groot_output_provenance(outpoint, label_id) VALUES(?1, ?2)",
            params![outpoint, label_id],
        )?;
    }
    db.execute(
        "DELETE FROM groot_output_clusters WHERE outpoint = ?1",
        params![outpoint],
    )?;
    let effective_clusters = if clusters.is_empty() {
        BTreeSet::from([format!("cluster-{outpoint}")])
    } else {
        clusters.clone()
    };
    for cluster_id in effective_clusters {
        db.execute(
            "INSERT OR IGNORE INTO groot_privacy_clusters(cluster_id, created_at) VALUES(?1, ?2)",
            params![cluster_id, created_at],
        )?;
        db.execute(
            "INSERT INTO groot_output_clusters(outpoint, cluster_id) VALUES(?1, ?2)",
            params![outpoint, cluster_id],
        )?;
    }
    Ok(())
}

pub fn reconcile_wallet_outputs(
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
                    let label = label_for_subject(db, "address", &derivation_index.to_string())?;
                    let provenance = label.as_ref().map_or_else(
                        || DerivedProvenance {
                            labels: BTreeSet::new(),
                            clusters: BTreeSet::new(),
                            state: ProvenanceState::Unknown,
                        },
                        |label| DerivedProvenance {
                            labels: BTreeSet::from([label.id.clone()]),
                            clusters: BTreeSet::new(),
                            state: ProvenanceState::Known,
                        },
                    );
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

fn cluster_links(db: &Connection) -> Result<Vec<(String, String)>, bdk_wallet::rusqlite::Error> {
    let mut statement = db.prepare(
        "SELECT left_cluster_id, right_cluster_id FROM groot_cluster_links ORDER BY left_cluster_id, right_cluster_id",
    )?;
    let links = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(links)
}

pub fn output_summary(
    db: &Connection,
    outpoint: &str,
) -> Result<ProvenanceSummaryDto, bdk_wallet::rusqlite::Error> {
    let lineage = db
        .query_row(
            "SELECT context, provenance_state, address_reused FROM groot_output_lineage WHERE outpoint = ?1",
            params![outpoint],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                ))
            },
        )
        .optional()?;
    let Some((context, state, address_reused)) = lineage else {
        return Ok(ProvenanceSummaryDto::unknown("unknown"));
    };
    let labels = {
        let mut statement = db.prepare(
            "SELECT label.label_id, label.text, label.origin
             FROM groot_output_provenance provenance
             JOIN groot_labels label ON label.label_id = provenance.label_id
             WHERE provenance.outpoint = ?1 ORDER BY label.created_at, label.label_id",
        )?;
        let labels = statement
            .query_map(params![outpoint], |row| {
                Ok(PermanentLabelDto {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    origin: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        labels
    };
    let clusters = source_provenance(db, outpoint)?.clusters;
    Ok(ProvenanceSummaryDto {
        state: match state.as_str() {
            "known" => ProvenanceState::Known,
            "mixed" => ProvenanceState::Mixed,
            _ => ProvenanceState::Unknown,
        },
        context,
        labels,
        cluster_count: connected_cluster_count(&clusters, &cluster_links(db)?),
        address_reused,
    })
}

pub fn funding_summary(
    db: &Connection,
    outpoints: &[String],
) -> Result<ProvenanceSummaryDto, bdk_wallet::rusqlite::Error> {
    let sources = outpoints
        .iter()
        .map(|outpoint| source_provenance(db, outpoint))
        .collect::<Result<Vec<_>, _>>()?;
    let derived = derive_change_provenance(&sources);
    let mut labels = Vec::new();
    for label_id in &derived.labels {
        if let Some(label) = db
            .query_row(
                "SELECT label_id, text, origin FROM groot_labels WHERE label_id = ?1",
                params![label_id],
                |row| {
                    Ok(PermanentLabelDto {
                        id: row.get(0)?,
                        text: row.get(1)?,
                        origin: row.get(2)?,
                    })
                },
            )
            .optional()?
        {
            labels.push(label);
        }
    }
    Ok(ProvenanceSummaryDto {
        state: derived.state,
        context: "funding".to_owned(),
        labels,
        cluster_count: connected_cluster_count(&derived.clusters, &cluster_links(db)?),
        address_reused: outpoints.iter().any(|outpoint| {
            db.query_row(
                "SELECT address_reused FROM groot_output_lineage WHERE outpoint = ?1",
                params![outpoint],
                |row| row.get::<_, bool>(0),
            )
            .unwrap_or(false)
        }),
    })
}

pub fn transaction_funding_summary(
    db: &Connection,
    txid: &str,
) -> Result<ProvenanceSummaryDto, bdk_wallet::rusqlite::Error> {
    let outpoints = {
        let mut statement = db.prepare(
            "SELECT outpoint FROM groot_transaction_inputs WHERE txid = ?1 ORDER BY outpoint",
        )?;
        let rows = statement
            .query_map(params![txid], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    funding_summary(db, &outpoints)
}

pub fn coin_privacy_map(
    db: &Connection,
) -> Result<HashMap<String, CoinPrivacy>, bdk_wallet::rusqlite::Error> {
    let links = cluster_links(db)?;
    let outpoints = {
        let mut statement =
            db.prepare("SELECT outpoint, address_reused FROM groot_output_lineage")?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    outpoints
        .into_iter()
        .map(|(outpoint, address_reused)| {
            let mut source = source_provenance(db, &outpoint)?;
            source.clusters = source
                .clusters
                .iter()
                .map(|cluster| canonical_cluster_id(cluster, &links))
                .collect();
            Ok((
                outpoint,
                CoinPrivacy {
                    label_ids: source.labels,
                    cluster_ids: source.clusters,
                    unknown: source.unknown,
                    address_reused,
                },
            ))
        })
        .collect()
}

fn canonical_cluster_id(cluster_id: &str, links: &[(String, String)]) -> String {
    let mut seen = BTreeSet::from([cluster_id.to_owned()]);
    let mut pending = vec![cluster_id.to_owned()];
    while let Some(current) = pending.pop() {
        for (left, right) in links {
            let neighbour = if left == &current {
                Some(right)
            } else if right == &current {
                Some(left)
            } else {
                None
            };
            if let Some(neighbour) = neighbour {
                if seen.insert(neighbour.clone()) {
                    pending.push(neighbour.clone());
                }
            }
        }
    }
    seen.into_iter()
        .next()
        .unwrap_or_else(|| cluster_id.to_owned())
}

pub fn connected_cluster_count(
    cluster_ids: &BTreeSet<String>,
    links: &[(String, String)],
) -> usize {
    if cluster_ids.is_empty() {
        return 0;
    }
    let mut parent = cluster_ids
        .iter()
        .map(|id| (id.clone(), id.clone()))
        .collect::<HashMap<_, _>>();
    fn root(parent: &mut HashMap<String, String>, id: &str) -> String {
        let next = parent.get(id).cloned().unwrap_or_else(|| id.to_owned());
        if next == id {
            return next;
        }
        let resolved = root(parent, &next);
        parent.insert(id.to_owned(), resolved.clone());
        resolved
    }
    for (left, right) in links {
        if !cluster_ids.contains(left) || !cluster_ids.contains(right) {
            continue;
        }
        let left_root = root(&mut parent, left);
        let right_root = root(&mut parent, right);
        if left_root != right_root {
            parent.insert(right_root, left_root);
        }
    }
    cluster_ids
        .iter()
        .map(|id| root(&mut parent, id))
        .collect::<HashSet<_>>()
        .len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::{
        bitcoin::{
            absolute::LockTime, bip32::Xpriv, hashes::Hash, transaction::Version, Amount, Network,
            OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxOut, Txid, Witness,
        },
        KeychainKind, Wallet,
    };

    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE groot_addresses(idx INTEGER PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL);
             CREATE TABLE groot_proposals(proposal_id TEXT PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL);",
        )
        .unwrap();
        db
    }

    #[test]
    fn reconciles_exact_multi_output_receives_and_mixed_change_from_a_real_wallet_graph() {
        let db = database();
        init_schema(&db).unwrap();
        let master = Xpriv::new_master(Network::Regtest, &[7; 32]).unwrap();
        let mut wallet =
            Wallet::create(format!("wpkh({master}/0/*)"), format!("wpkh({master}/1/*)"))
                .network(Network::Regtest)
                .create_wallet_no_persist()
                .unwrap();
        let consulting = wallet.reveal_next_address(KeychainKind::External);
        let gift = wallet.reveal_next_address(KeychainKind::External);
        let change = wallet.reveal_next_address(KeychainKind::Internal);
        for (index, label) in [(consulting.index, "Consulting"), (gift.index, "Gift")] {
            db.execute(
                "INSERT INTO groot_addresses(idx, label, created_at) VALUES(?1, ?2, 1)",
                params![index, label],
            )
            .unwrap();
            assign_new_label(
                &db,
                label,
                LabelOrigin::Receive,
                "address",
                &index.to_string(),
                1,
            )
            .unwrap();
        }
        let funding = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::from_byte_array([3; 32]), 0),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![
                TxOut {
                    value: Amount::from_sat(30_000),
                    script_pubkey: consulting.address.script_pubkey(),
                },
                TxOut {
                    value: Amount::from_sat(40_000),
                    script_pubkey: gift.address.script_pubkey(),
                },
            ],
        };
        let funding_txid = funding.compute_txid();
        let spend = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![
                TxIn {
                    previous_output: OutPoint::new(funding_txid, 0),
                    script_sig: ScriptBuf::new(),
                    sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                    witness: Witness::new(),
                },
                TxIn {
                    previous_output: OutPoint::new(funding_txid, 1),
                    script_sig: ScriptBuf::new(),
                    sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                    witness: Witness::new(),
                },
            ],
            output: vec![TxOut {
                value: Amount::from_sat(69_000),
                script_pubkey: change.address.script_pubkey(),
            }],
        };
        let spend_txid = spend.compute_txid();
        wallet.apply_unconfirmed_txs([(funding, 1), (spend, 2)]);

        reconcile_wallet_outputs(&wallet, &db, 3).unwrap();

        let first = output_summary(&db, &format!("{funding_txid}:0")).unwrap();
        let second = output_summary(&db, &format!("{funding_txid}:1")).unwrap();
        let mixed = output_summary(&db, &format!("{spend_txid}:0")).unwrap();
        assert_eq!(first.labels[0].text, "Consulting");
        assert_eq!(second.labels[0].text, "Gift");
        assert_eq!(mixed.context, "change");
        assert_eq!(mixed.state, ProvenanceState::Mixed);
        assert_eq!(
            mixed
                .labels
                .iter()
                .map(|label| label.text.as_str())
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["Consulting", "Gift"])
        );
    }

    #[test]
    fn single_and_mixed_change_inheritance_never_uses_payment_intent() {
        let consulting = SourceProvenance::known("consulting", "cluster-a");
        let gift = SourceProvenance::known("gift", "cluster-b");
        let single = derive_change_provenance([&consulting]);
        assert_eq!(single.state, ProvenanceState::Known);
        assert_eq!(single.labels, BTreeSet::from(["consulting".to_owned()]));
        let mixed = derive_change_provenance([&consulting, &gift]);
        assert_eq!(mixed.state, ProvenanceState::Mixed);
        assert_eq!(mixed.labels.len(), 2);
        assert!(!mixed.labels.contains("rent"));
    }

    #[test]
    fn unknown_input_makes_change_explicitly_unknown_without_dropping_known_sources() {
        let known = SourceProvenance::known("consulting", "cluster-a");
        let unknown = SourceProvenance::unknown();
        let derived = derive_change_provenance([&known, &unknown]);
        assert_eq!(derived.state, ProvenanceState::Unknown);
        assert!(derived.labels.contains("consulting"));
    }

    #[test]
    fn migration_is_idempotent_and_preserves_duplicate_legacy_text() {
        let db = database();
        db.execute("INSERT INTO groot_addresses VALUES(1, 'Savings', 10)", [])
            .unwrap();
        db.execute("INSERT INTO groot_addresses VALUES(2, 'Savings', 11)", [])
            .unwrap();
        init_schema(&db).unwrap();
        init_schema(&db).unwrap();
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM groot_labels", [], |row| row
                .get::<_, u32>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM groot_label_assignments", [], |row| {
                row.get::<_, u32>(0)
            })
            .unwrap(),
            2
        );
    }

    #[test]
    fn migration_rolls_back_schema_and_backfill_together() {
        let db = database();
        db.execute(
            "INSERT INTO groot_addresses VALUES(1, ?1, 10)",
            params!["x".repeat(49)],
        )
        .unwrap();

        assert!(init_schema(&db).is_err());
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'groot_labels'",
                [],
                |row| row.get::<_, u32>(0),
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn new_labels_are_non_reusable_and_assign_to_one_exact_subject() {
        let db = database();
        init_schema(&db).unwrap();
        assign_new_label(
            &db,
            "Consulting income",
            LabelOrigin::Receive,
            "address",
            "1",
            10,
        )
        .unwrap();
        assert!(assign_new_label(
            &db,
            " consulting   INCOME ",
            LabelOrigin::Payment,
            "transaction_intent",
            "proposal-1",
            11
        )
        .is_err());
        let label = label_for_subject(&db, "address", "1").unwrap().unwrap();
        assert_eq!(label.text, "Consulting income");
        assert_eq!(label.origin, "receive");
    }

    #[test]
    fn acceleration_inherits_payment_intent_without_creating_a_duplicate_label() {
        let db = database();
        init_schema(&db).unwrap();
        let first = assign_payment_intent(&db, "Rent", "proposal-1", 10, false).unwrap();
        let inherited = assign_payment_intent(&db, "Rent", "proposal-2", 11, true).unwrap();
        assert_eq!(first, inherited);
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM groot_labels", [], |row| row
                .get::<_, u32>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn cluster_count_distinguishes_existing_links_from_new_merges() {
        let clusters = BTreeSet::from(["a".to_owned(), "b".to_owned(), "c".to_owned()]);
        assert_eq!(connected_cluster_count(&clusters, &[]), 3);
        assert_eq!(
            connected_cluster_count(&clusters, &[("a".to_owned(), "b".to_owned())]),
            2
        );
    }

    #[test]
    fn linked_clusters_share_a_stable_canonical_identity() {
        let links = vec![
            ("b".to_owned(), "c".to_owned()),
            ("a".to_owned(), "b".to_owned()),
        ];
        assert_eq!(canonical_cluster_id("c", &links), "a");
        assert_eq!(canonical_cluster_id("z", &links), "z");
    }
}
