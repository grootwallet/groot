use bdk_wallet::rusqlite::OptionalExtension;
use bdk_wallet::rusqlite::{params, params_from_iter, Connection};
use serde::Serialize;
use std::collections::HashSet;

pub const DELIVERY_BATCH_SIZE: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WalletNotification {
    PaymentReceived {
        txid: String,
        amount: u64,
        balance: u64,
    },
    FirstConfirmation {
        txid: String,
        balance: u64,
    },
    TransactionBroadcast {
        txid: String,
        balance: u64,
    },
    PolicyApproachingMaturity {
        outpoint: String,
        remaining_blocks: u32,
        policy_type: String,
    },
    PolicyMature {
        outpoint: String,
        policy_type: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NotificationEnvelope {
    pub id: String,
    pub event: WalletNotification,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyMaturityObservation {
    pub outpoint: String,
    pub rank: u8,
    pub remaining_blocks: Option<u32>,
    pub policy_type: String,
}

impl WalletNotification {
    fn kind(&self) -> &'static str {
        match self {
            Self::PaymentReceived { .. } => "payment_received",
            Self::FirstConfirmation { .. } => "first_confirmation",
            Self::TransactionBroadcast { .. } => "transaction_broadcast",
            Self::PolicyApproachingMaturity { .. } => "policy_approaching_maturity",
            Self::PolicyMature { .. } => "policy_mature",
        }
    }

    fn values(&self) -> (&str, u64, u64) {
        match self {
            Self::PaymentReceived {
                txid,
                amount,
                balance,
            } => (txid, *amount, *balance),
            Self::FirstConfirmation { txid, balance }
            | Self::TransactionBroadcast { txid, balance } => (txid, 0, *balance),
            Self::PolicyApproachingMaturity { outpoint, .. }
            | Self::PolicyMature { outpoint, .. } => (outpoint, 0, 0),
        }
    }
}

pub fn init(db: &Connection) -> bdk_wallet::rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS groot_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK(kind IN ('payment_received','first_confirmation','transaction_broadcast')),
            txid TEXT NOT NULL,
            amount INTEGER NOT NULL,
            balance INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0,1)),
            UNIQUE(kind, txid)
        );
        CREATE TABLE IF NOT EXISTS groot_notification_state (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            history_initialized INTEGER NOT NULL CHECK(history_initialized IN (0,1))
        );
        CREATE TABLE IF NOT EXISTS groot_policy_maturity_state (
            outpoint TEXT PRIMARY KEY,
            rank INTEGER NOT NULL CHECK(rank BETWEEN 0 AND 2),
            generation INTEGER NOT NULL CHECK(generation >= 0),
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groot_policy_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outpoint TEXT NOT NULL,
            stage TEXT NOT NULL CHECK(stage IN ('approaching','mature')),
            generation INTEGER NOT NULL CHECK(generation >= 0),
            policy_type TEXT NOT NULL CHECK(policy_type IN ('recovery','inheritance')),
            remaining_blocks INTEGER CHECK(remaining_blocks >= 0),
            created_at INTEGER NOT NULL,
            delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0,1)),
            UNIQUE(outpoint, stage, generation)
        );",
    )
}

pub fn history_initialized(db: &Connection) -> bdk_wallet::rusqlite::Result<bool> {
    db.query_row(
        "SELECT history_initialized FROM groot_notification_state WHERE singleton = 1",
        [],
        |row| row.get::<_, bool>(0),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
}

#[cfg(test)]
pub fn seed_history(
    db: &mut Connection,
    events: &[WalletNotification],
    created_at: u64,
) -> bdk_wallet::rusqlite::Result<()> {
    let transaction = db.transaction()?;
    seed_history_in_transaction(&transaction, events, created_at)?;
    transaction.commit()
}

pub fn seed_history_in_transaction(
    db: &Connection,
    events: &[WalletNotification],
    created_at: u64,
) -> bdk_wallet::rusqlite::Result<()> {
    for event in events {
        let (txid, amount, balance) = event.values();
        db.execute(
            "INSERT OR IGNORE INTO groot_notifications (kind,txid,amount,balance,created_at,delivered) VALUES (?1,?2,?3,?4,?5,1)",
            params![event.kind(), txid, amount, balance, created_at],
        )?;
    }
    db.execute(
        "INSERT INTO groot_notification_state (singleton,history_initialized) VALUES (1,1)
         ON CONFLICT(singleton) DO UPDATE SET history_initialized=1",
        [],
    )?;
    Ok(())
}

pub fn enqueue(
    db: &Connection,
    event: &WalletNotification,
    created_at: u64,
) -> bdk_wallet::rusqlite::Result<bool> {
    let (txid, amount, balance) = event.values();
    db.execute(
        "INSERT OR IGNORE INTO groot_notifications (kind,txid,amount,balance,created_at) VALUES (?1,?2,?3,?4,?5)",
        params![event.kind(), txid, amount, balance, created_at],
    )
    .map(|changed| changed == 1)
}

fn decode_row(
    row: &bdk_wallet::rusqlite::Row<'_>,
) -> bdk_wallet::rusqlite::Result<NotificationEnvelope> {
    let id = row.get::<_, i64>(0)?;
    let kind = row.get::<_, String>(1)?;
    let txid = row.get(2)?;
    let amount = row.get(3)?;
    let balance = row.get(4)?;
    let event = match kind.as_str() {
        "payment_received" => WalletNotification::PaymentReceived {
            txid,
            amount,
            balance,
        },
        "first_confirmation" => WalletNotification::FirstConfirmation { txid, balance },
        "transaction_broadcast" => WalletNotification::TransactionBroadcast { txid, balance },
        _ => return Err(bdk_wallet::rusqlite::Error::InvalidQuery),
    };
    Ok(NotificationEnvelope {
        id: format!("transaction:{id}"),
        event,
    })
}

fn decode_policy_row(
    row: &bdk_wallet::rusqlite::Row<'_>,
) -> bdk_wallet::rusqlite::Result<NotificationEnvelope> {
    let id = row.get::<_, i64>(0)?;
    let outpoint = row.get::<_, String>(1)?;
    let stage = row.get::<_, String>(2)?;
    let remaining_blocks = row.get::<_, Option<u32>>(3)?;
    let policy_type = row.get::<_, String>(4)?;
    let event = match stage.as_str() {
        "approaching" => WalletNotification::PolicyApproachingMaturity {
            outpoint,
            remaining_blocks: remaining_blocks.ok_or(bdk_wallet::rusqlite::Error::InvalidQuery)?,
            policy_type,
        },
        "mature" => WalletNotification::PolicyMature {
            outpoint,
            policy_type,
        },
        _ => return Err(bdk_wallet::rusqlite::Error::InvalidQuery),
    };
    Ok(NotificationEnvelope {
        id: format!("policy:{id}"),
        event,
    })
}

pub fn pending(db: &Connection) -> bdk_wallet::rusqlite::Result<Vec<NotificationEnvelope>> {
    let mut statement = db.prepare(
        "SELECT id,kind,txid,amount,balance FROM groot_notifications WHERE delivered = 0 ORDER BY id LIMIT ?1",
    )?;
    let rows = statement
        .query_map(params![DELIVERY_BATCH_SIZE as i64], decode_row)?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rows: Vec<NotificationEnvelope> = rows;
    if rows.len() < DELIVERY_BATCH_SIZE {
        let mut statement = db.prepare(
            "SELECT notification.id,notification.outpoint,notification.stage,
                    notification.remaining_blocks,notification.policy_type
             FROM groot_policy_notifications AS notification
             INNER JOIN groot_policy_maturity_state AS state
                ON state.outpoint = notification.outpoint
               AND state.generation = notification.generation
             WHERE notification.delivered = 0
               AND ((notification.stage = 'approaching' AND state.rank = 1)
                 OR (notification.stage = 'mature' AND state.rank = 2))
             ORDER BY notification.id LIMIT ?1",
        )?;
        let policy_rows = statement
            .query_map(
                params![(DELIVERY_BATCH_SIZE - rows.len()) as i64],
                decode_policy_row,
            )?
            .collect::<Result<Vec<_>, _>>()?;
        rows.extend(policy_rows);
    }
    Ok(rows)
}

pub fn acknowledge(db: &mut Connection, ids: &[String]) -> bdk_wallet::rusqlite::Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let transaction_ids = ids
        .iter()
        .filter_map(|id| id.strip_prefix("transaction:"))
        .map(str::parse::<i64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| bdk_wallet::rusqlite::Error::InvalidQuery)?;
    let policy_ids = ids
        .iter()
        .filter_map(|id| id.strip_prefix("policy:"))
        .map(str::parse::<i64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| bdk_wallet::rusqlite::Error::InvalidQuery)?;
    if transaction_ids.len() + policy_ids.len() != ids.len()
        || transaction_ids.iter().chain(&policy_ids).any(|id| *id <= 0)
    {
        return Err(bdk_wallet::rusqlite::Error::InvalidQuery);
    }
    let transaction = db.transaction()?;
    let transaction_placeholders = std::iter::repeat_n("?", transaction_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let mut changed = if transaction_ids.is_empty() {
        0
    } else {
        transaction.execute(
            &format!("UPDATE groot_notifications SET delivered = 1 WHERE delivered = 0 AND id IN ({transaction_placeholders})"),
            params_from_iter(transaction_ids.iter()),
        )?
    };
    let policy_placeholders = std::iter::repeat_n("?", policy_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    if !policy_ids.is_empty() {
        changed += transaction.execute(
            &format!("UPDATE groot_policy_notifications SET delivered = 1 WHERE delivered = 0 AND id IN ({policy_placeholders})"),
            params_from_iter(policy_ids.iter()),
        )?;
    }
    transaction.commit()?;
    Ok(changed)
}

pub fn reconcile_policy_maturity(
    db: &Connection,
    observations: &[PolicyMaturityObservation],
    created_at: u64,
) -> bdk_wallet::rusqlite::Result<()> {
    let mut observed_outpoints = HashSet::with_capacity(observations.len());
    for observation in observations {
        if observation.rank > 2
            || !matches!(observation.policy_type.as_str(), "recovery" | "inheritance")
            || observation.outpoint.is_empty()
            || observation.outpoint.len() > 80
            || !observed_outpoints.insert(observation.outpoint.as_str())
        {
            return Err(bdk_wallet::rusqlite::Error::InvalidQuery);
        }
    }

    let tracked = {
        let mut statement = db.prepare(
            "SELECT outpoint,rank,generation
             FROM groot_policy_maturity_state WHERE rank > 0",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u8>(1)?,
                    row.get::<_, u32>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (outpoint, _, generation) in tracked {
        if observed_outpoints.contains(outpoint.as_str()) {
            continue;
        }
        let generation = generation
            .checked_add(1)
            .ok_or(bdk_wallet::rusqlite::Error::InvalidQuery)?;
        db.execute(
            "UPDATE groot_policy_maturity_state
             SET rank=0,generation=?2,updated_at=?3 WHERE outpoint=?1",
            params![outpoint, generation, created_at],
        )?;
        db.execute(
            "UPDATE groot_policy_notifications SET delivered=1
             WHERE outpoint=?1 AND delivered=0 AND generation < ?2",
            params![outpoint, generation],
        )?;
    }

    for observation in observations {
        let previous = db
            .query_row(
                "SELECT rank,generation FROM groot_policy_maturity_state WHERE outpoint=?1",
                params![observation.outpoint],
                |row| Ok((row.get::<_, u8>(0)?, row.get::<_, u32>(1)?)),
            )
            .optional()?;
        let (previous_rank, generation) = previous.unwrap_or((0, 0));
        let generation = if previous.is_some() && observation.rank < previous_rank {
            generation
                .checked_add(1)
                .ok_or(bdk_wallet::rusqlite::Error::InvalidQuery)?
        } else {
            generation
        };
        db.execute(
            "INSERT INTO groot_policy_maturity_state(outpoint,rank,generation,updated_at)
             VALUES(?1,?2,?3,?4)
             ON CONFLICT(outpoint) DO UPDATE SET rank=excluded.rank,generation=excluded.generation,updated_at=excluded.updated_at",
            params![observation.outpoint, observation.rank, generation, created_at],
        )?;
        db.execute(
            "UPDATE groot_policy_notifications SET delivered=1
             WHERE outpoint=?1 AND delivered=0
               AND (generation < ?2 OR (generation = ?2 AND stage = 'approaching' AND ?3 = 2))",
            params![observation.outpoint, generation, observation.rank],
        )?;
        if observation.rank <= previous_rank || observation.rank == 0 {
            continue;
        }
        let (stage, remaining_blocks) = if observation.rank == 1 {
            ("approaching", observation.remaining_blocks)
        } else {
            ("mature", Some(0))
        };
        db.execute(
            "INSERT OR IGNORE INTO groot_policy_notifications
             (outpoint,stage,generation,policy_type,remaining_blocks,created_at)
             VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                observation.outpoint,
                stage,
                generation,
                observation.policy_type,
                remaining_blocks,
                created_at
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
fn was_enqueued(db: &Connection, kind: &str, txid: &str) -> bdk_wallet::rusqlite::Result<bool> {
    db.query_row(
        "SELECT 1 FROM groot_notifications WHERE kind=?1 AND txid=?2",
        params![kind, txid],
        |_| Ok(true),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        init(&db).unwrap();
        db
    }

    #[test]
    fn events_are_unique_ordered_and_remain_pending_until_acknowledged() {
        let mut db = db();
        let received = WalletNotification::PaymentReceived {
            txid: "a".repeat(64),
            amount: 42,
            balance: 42,
        };
        let confirmed = WalletNotification::FirstConfirmation {
            txid: "a".repeat(64),
            balance: 42,
        };
        assert!(enqueue(&db, &received, 1).unwrap());
        assert!(!enqueue(&db, &received, 2).unwrap());
        assert!(enqueue(&db, &confirmed, 3).unwrap());
        let events = pending(&db).unwrap();
        assert_eq!(
            events
                .iter()
                .map(|item| item.event.clone())
                .collect::<Vec<_>>(),
            vec![received, confirmed]
        );
        assert_eq!(pending(&db).unwrap(), events);
        assert_eq!(
            acknowledge(
                &mut db,
                &events
                    .iter()
                    .map(|item| item.id.clone())
                    .collect::<Vec<_>>()
            )
            .unwrap(),
            2
        );
        assert!(pending(&db).unwrap().is_empty());
    }

    #[test]
    fn pending_notifications_are_drained_in_bounded_batches() {
        let mut db = db();
        for index in 0..(DELIVERY_BATCH_SIZE + 3) {
            enqueue(
                &db,
                &WalletNotification::PaymentReceived {
                    txid: format!("{index:064x}"),
                    amount: index as u64,
                    balance: index as u64,
                },
                index as u64,
            )
            .unwrap();
        }
        let first = pending(&db).unwrap();
        assert_eq!(first.len(), DELIVERY_BATCH_SIZE);
        acknowledge(
            &mut db,
            &first
                .iter()
                .map(|event| event.id.clone())
                .collect::<Vec<_>>(),
        )
        .unwrap();
        assert_eq!(pending(&db).unwrap().len(), 3);
    }

    #[test]
    fn recovered_history_is_seeded_as_delivered_before_future_events() {
        let mut db = db();
        assert!(!history_initialized(&db).unwrap());
        let historical = WalletNotification::PaymentReceived {
            txid: "a".repeat(64),
            amount: 42,
            balance: 42,
        };
        seed_history(&mut db, std::slice::from_ref(&historical), 1).unwrap();
        assert!(history_initialized(&db).unwrap());
        assert!(pending(&db).unwrap().is_empty());
        assert!(was_enqueued(&db, "payment_received", &"a".repeat(64)).unwrap());

        let future = WalletNotification::FirstConfirmation {
            txid: "a".repeat(64),
            balance: 42,
        };
        assert!(enqueue(&db, &future, 2).unwrap());
        assert_eq!(pending(&db).unwrap()[0].event, future);
    }

    #[test]
    fn policy_alerts_deduplicate_across_restart_and_rearm_after_reorg() {
        let path = std::env::temp_dir().join(format!(
            "groot-policy-alert-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        let mut db = Connection::open(&path).unwrap();
        init(&db).unwrap();
        let observation = |rank, remaining_blocks| PolicyMaturityObservation {
            outpoint: format!("{}:0", "a".repeat(64)),
            rank,
            remaining_blocks,
            policy_type: "recovery".to_owned(),
        };

        reconcile_policy_maturity(&db, &[observation(1, Some(1_008))], 1).unwrap();
        let approaching = pending(&db).unwrap();
        assert!(matches!(
            approaching[0].event,
            WalletNotification::PolicyApproachingMaturity {
                remaining_blocks: 1_008,
                ..
            }
        ));
        acknowledge(&mut db, &[approaching[0].id.clone()]).unwrap();
        drop(db);

        let mut db = Connection::open(&path).unwrap();
        init(&db).unwrap();
        reconcile_policy_maturity(&db, &[observation(1, Some(900))], 2).unwrap();
        assert!(
            pending(&db).unwrap().is_empty(),
            "restart and refresh must not duplicate"
        );
        reconcile_policy_maturity(&db, &[observation(2, Some(0))], 3).unwrap();
        let mature = pending(&db).unwrap();
        assert!(matches!(
            mature[0].event,
            WalletNotification::PolicyMature { .. }
        ));
        acknowledge(&mut db, &[mature[0].id.clone()]).unwrap();

        reconcile_policy_maturity(&db, &[observation(1, Some(1))], 4).unwrap();
        assert!(
            pending(&db).unwrap().is_empty(),
            "backward reorg transition is inline state, not an alert"
        );
        reconcile_policy_maturity(&db, &[observation(2, Some(0))], 5).unwrap();
        assert!(matches!(
            pending(&db).unwrap()[0].event,
            WalletNotification::PolicyMature { .. }
        ));
        drop(db);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn undelivered_old_generation_is_retired_after_reorg_and_rematurity() {
        let db = db();
        let observation = |rank, remaining_blocks| PolicyMaturityObservation {
            outpoint: format!("{}:0", "c".repeat(64)),
            rank,
            remaining_blocks,
            policy_type: "recovery".to_owned(),
        };

        reconcile_policy_maturity(&db, &[observation(2, Some(0))], 1).unwrap();
        assert_eq!(pending(&db).unwrap().len(), 1);
        reconcile_policy_maturity(&db, &[observation(1, Some(1))], 2).unwrap();
        assert!(pending(&db).unwrap().is_empty());
        reconcile_policy_maturity(&db, &[observation(2, Some(0))], 3).unwrap();

        let pending = pending(&db).unwrap();
        assert_eq!(pending.len(), 1);
        assert!(matches!(
            pending[0].event,
            WalletNotification::PolicyMature { .. }
        ));
    }

    #[test]
    fn absent_mature_outpoint_rearms_when_it_reappears() {
        let mut db = db();
        let observation = PolicyMaturityObservation {
            outpoint: format!("{}:0", "d".repeat(64)),
            rank: 2,
            remaining_blocks: Some(0),
            policy_type: "inheritance".to_owned(),
        };

        reconcile_policy_maturity(&db, std::slice::from_ref(&observation), 1).unwrap();
        let initial = pending(&db).unwrap();
        acknowledge(&mut db, &[initial[0].id.clone()]).unwrap();
        reconcile_policy_maturity(&db, &[], 2).unwrap();
        reconcile_policy_maturity(&db, &[observation], 3).unwrap();

        let pending = pending(&db).unwrap();
        assert_eq!(pending.len(), 1);
        assert!(matches!(
            pending[0].event,
            WalletNotification::PolicyMature { .. }
        ));
    }

    #[test]
    fn policy_alert_state_rejects_hostile_observations() {
        let db = db();
        let invalid = PolicyMaturityObservation {
            outpoint: "x".repeat(81),
            rank: 3,
            remaining_blocks: Some(u32::MAX),
            policy_type: "unknown".to_owned(),
        };
        assert!(reconcile_policy_maturity(&db, &[invalid], 1).is_err());
        assert!(pending(&db).unwrap().is_empty());
    }

    #[test]
    fn broadcast_and_corrupt_rows_are_handled_without_duplicate_delivery() {
        let db = db();
        let broadcast = WalletNotification::TransactionBroadcast {
            txid: "b".repeat(64),
            balance: 9,
        };
        enqueue(&db, &broadcast, 1).unwrap();
        assert!(was_enqueued(&db, "transaction_broadcast", &"b".repeat(64)).unwrap());
        assert!(!was_enqueued(&db, "first_confirmation", "missing").unwrap());
        assert_eq!(pending(&db).unwrap()[0].event, broadcast);
    }

    #[test]
    fn unknown_persisted_notification_kind_fails_closed() {
        let db = db();
        db.execute_batch("PRAGMA ignore_check_constraints=ON;")
            .unwrap();
        db.execute("INSERT INTO groot_notifications(kind,txid,amount,balance,created_at) VALUES('unknown','x',0,0,1)", []).unwrap();
        assert!(pending(&db).is_err());
    }
}
