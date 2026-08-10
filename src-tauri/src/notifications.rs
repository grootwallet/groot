use bdk_wallet::rusqlite::OptionalExtension;
use bdk_wallet::rusqlite::{params, params_from_iter, Connection};
use serde::Serialize;

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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NotificationEnvelope {
    pub id: i64,
    pub event: WalletNotification,
}

impl WalletNotification {
    fn kind(&self) -> &'static str {
        match self {
            Self::PaymentReceived { .. } => "payment_received",
            Self::FirstConfirmation { .. } => "first_confirmation",
            Self::TransactionBroadcast { .. } => "transaction_broadcast",
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
        }
    }
}

pub fn init(db: &Connection) -> bdk_wallet::rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS satchel_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK(kind IN ('payment_received','first_confirmation','transaction_broadcast')),
            txid TEXT NOT NULL,
            amount INTEGER NOT NULL,
            balance INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0,1)),
            UNIQUE(kind, txid)
        );
        CREATE TABLE IF NOT EXISTS satchel_notification_state (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            history_initialized INTEGER NOT NULL CHECK(history_initialized IN (0,1))
        );",
    )
}

pub fn history_initialized(db: &Connection) -> bdk_wallet::rusqlite::Result<bool> {
    db.query_row(
        "SELECT history_initialized FROM satchel_notification_state WHERE singleton = 1",
        [],
        |row| row.get::<_, bool>(0),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
}

pub fn seed_history(
    db: &mut Connection,
    events: &[WalletNotification],
    created_at: u64,
) -> bdk_wallet::rusqlite::Result<()> {
    let transaction = db.transaction()?;
    for event in events {
        let (txid, amount, balance) = event.values();
        transaction.execute(
            "INSERT OR IGNORE INTO satchel_notifications (kind,txid,amount,balance,created_at,delivered) VALUES (?1,?2,?3,?4,?5,1)",
            params![event.kind(), txid, amount, balance, created_at],
        )?;
    }
    transaction.execute(
        "INSERT INTO satchel_notification_state (singleton,history_initialized) VALUES (1,1)
         ON CONFLICT(singleton) DO UPDATE SET history_initialized=1",
        [],
    )?;
    transaction.commit()
}

pub fn enqueue(
    db: &Connection,
    event: &WalletNotification,
    created_at: u64,
) -> bdk_wallet::rusqlite::Result<bool> {
    let (txid, amount, balance) = event.values();
    db.execute(
        "INSERT OR IGNORE INTO satchel_notifications (kind,txid,amount,balance,created_at) VALUES (?1,?2,?3,?4,?5)",
        params![event.kind(), txid, amount, balance, created_at],
    )
    .map(|changed| changed == 1)
}

fn decode_row(
    row: &bdk_wallet::rusqlite::Row<'_>,
) -> bdk_wallet::rusqlite::Result<NotificationEnvelope> {
    let id = row.get(0)?;
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
    Ok(NotificationEnvelope { id, event })
}

pub fn pending(db: &Connection) -> bdk_wallet::rusqlite::Result<Vec<NotificationEnvelope>> {
    let mut statement = db.prepare(
        "SELECT id,kind,txid,amount,balance FROM satchel_notifications WHERE delivered = 0 ORDER BY id",
    )?;
    let rows = statement.query_map([], decode_row)?.collect();
    rows
}

pub fn acknowledge(db: &mut Connection, ids: &[i64]) -> bdk_wallet::rusqlite::Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let transaction = db.transaction()?;
    let placeholders = std::iter::repeat_n("?", ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let changed = transaction.execute(
        &format!("UPDATE satchel_notifications SET delivered = 1 WHERE delivered = 0 AND id IN ({placeholders})"),
        params_from_iter(ids.iter()),
    )?;
    transaction.commit()?;
    Ok(changed)
}

#[cfg(test)]
fn was_enqueued(db: &Connection, kind: &str, txid: &str) -> bdk_wallet::rusqlite::Result<bool> {
    db.query_row(
        "SELECT 1 FROM satchel_notifications WHERE kind=?1 AND txid=?2",
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
                &events.iter().map(|item| item.id).collect::<Vec<_>>()
            )
            .unwrap(),
            2
        );
        assert!(pending(&db).unwrap().is_empty());
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
        db.execute("INSERT INTO satchel_notifications(kind,txid,amount,balance,created_at) VALUES('unknown','x',0,0,1)", []).unwrap();
        assert!(pending(&db).is_err());
    }
}
