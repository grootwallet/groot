//! Existing wallet orchestration, extracted without changing storage or authorization.
use super::*;

pub(super) fn snapshot_notifications(snapshot: &WalletSnapshotDto) -> Vec<WalletNotification> {
    let mut events = Vec::new();
    for transaction in &snapshot.transactions {
        if transaction.direction == "received" {
            events.push(WalletNotification::PaymentReceived {
                txid: transaction.id.clone(),
                amount: transaction.amount,
                balance: snapshot.balance.total,
            });
        }
        if transaction.confirmations > 0 {
            events.push(WalletNotification::FirstConfirmation {
                txid: transaction.id.clone(),
                balance: snapshot.balance.total,
            });
        }
    }
    events
}

pub(super) fn enqueue_snapshot_notifications(
    db: &Connection,
    snapshot: &WalletSnapshotDto,
) -> ApiResult<()> {
    let maturity_observations = snapshot
        .utxos
        .iter()
        .filter_map(|coin| {
            coin.policy_maturity
                .as_ref()
                .filter(|maturity| {
                    matches!(maturity.policy_type.as_str(), "recovery" | "inheritance")
                })
                .map(|maturity| {
                    let rank = match maturity.state {
                        MaturityState::Unconfirmed | MaturityState::Immature => 0,
                        MaturityState::Approaching => 1,
                        MaturityState::Mature => 2,
                    };
                    notifications::PolicyMaturityObservation {
                        outpoint: coin.outpoint.clone(),
                        rank,
                        remaining_blocks: maturity.remaining_blocks,
                        policy_type: maturity.policy_type.clone(),
                    }
                })
        })
        .collect::<Vec<_>>();
    notifications::reconcile_policy_maturity(db, &maturity_observations, now())
        .map_err(internal)?;
    let events = snapshot_notifications(snapshot);
    if !notifications::history_initialized(db).map_err(internal)? {
        notifications::seed_history_in_transaction(db, &events, now()).map_err(internal)?;
        return Ok(());
    }
    for event in &events {
        notifications::enqueue(db, event, now()).map_err(internal)?;
    }
    Ok(())
}
