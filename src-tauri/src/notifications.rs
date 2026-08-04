#[cfg(test)]
use bdk_wallet::rusqlite::OptionalExtension;
use bdk_wallet::rusqlite::{params, Connection, Transaction};
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
        );",
    )
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
) -> bdk_wallet::rusqlite::Result<WalletNotification> {
    let kind = row.get::<_, String>(1)?;
    let txid = row.get(2)?;
    let amount = row.get(3)?;
    let balance = row.get(4)?;
    match kind.as_str() {
        "payment_received" => Ok(WalletNotification::PaymentReceived {
            txid,
            amount,
            balance,
        }),
        "first_confirmation" => Ok(WalletNotification::FirstConfirmation { txid, balance }),
        "transaction_broadcast" => Ok(WalletNotification::TransactionBroadcast { txid, balance }),
        _ => Err(bdk_wallet::rusqlite::Error::InvalidQuery),
    }
}

pub fn drain(db: &mut Connection) -> bdk_wallet::rusqlite::Result<Vec<WalletNotification>> {
    let transaction = db.transaction()?;
    let events = unread(&transaction)?;
    transaction.execute(
        "UPDATE satchel_notifications SET delivered = 1 WHERE delivered = 0",
        [],
    )?;
    transaction.commit()?;
    Ok(events)
}

fn unread(transaction: &Transaction<'_>) -> bdk_wallet::rusqlite::Result<Vec<WalletNotification>> {
    let mut statement = transaction.prepare(
        "SELECT id,kind,txid,amount,balance FROM satchel_notifications WHERE delivered = 0 ORDER BY id",
    )?;
    let rows = statement.query_map([], decode_row)?.collect();
    rows
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
    fn events_are_unique_ordered_and_delivered_exactly_once() {
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
        assert_eq!(drain(&mut db).unwrap(), vec![received, confirmed]);
        assert!(drain(&mut db).unwrap().is_empty());
    }

    #[test]
    fn broadcast_and_corrupt_rows_are_handled_without_duplicate_delivery() {
        let mut db = db();
        let broadcast = WalletNotification::TransactionBroadcast {
            txid: "b".repeat(64),
            balance: 9,
        };
        enqueue(&db, &broadcast, 1).unwrap();
        assert!(was_enqueued(&db, "transaction_broadcast", &"b".repeat(64)).unwrap());
        assert!(!was_enqueued(&db, "first_confirmation", "missing").unwrap());
        assert_eq!(drain(&mut db).unwrap(), vec![broadcast]);
    }

    #[test]
    fn unknown_persisted_notification_kind_fails_closed() {
        let mut db = db();
        db.execute_batch("PRAGMA ignore_check_constraints=ON;")
            .unwrap();
        db.execute("INSERT INTO satchel_notifications(kind,txid,amount,balance,created_at) VALUES('unknown','x',0,0,1)", []).unwrap();
        assert!(drain(&mut db).is_err());
    }
}
