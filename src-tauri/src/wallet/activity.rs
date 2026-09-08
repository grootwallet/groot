use super::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn history() -> Vec<TransactionDto> {
        (0..120)
            .map(|i| TransactionDto {
                id: format!("{i:064x}"),
                kind: "payment".into(),
                direction: if i % 2 == 0 { "received" } else { "sent" }.into(),
                amount: i,
                fee: Some(1),
                status: if i < 4 { "pending" } else { "confirmed" }.into(),
                confirmations: if i < 4 { 0 } else { 1 },
                date: (1000 + i / 2).to_string(),
                address: None,
                label: if i == 119 { "Épargne" } else { "Synthetic" }.into(),
                intent_label: None,
                provenance: ProvenanceSummaryDto::unknown("funding"),
                block: None,
                replaced_by: None,
                replaces: None,
                input_count: None,
                output_count: None,
                fee_rate: None,
                wallet_input_amount: None,
                wallet_output_amount: None,
                locktime: None,
                rbf: None,
                rbf_history: None,
            })
            .collect()
    }
    fn request() -> ActivityRequest {
        ActivityRequest {
            wallet_id: Uuid::new_v4(),
            filter: ActivityFilter::All,
            query: String::new(),
            sort: ActivitySort::Newest,
            limit: 50,
            cursor: None,
        }
    }
    #[test]
    fn pages_cover_history_exactly_once_with_stable_ties_for_every_order() {
        for sort in [
            ActivitySort::Newest,
            ActivitySort::Oldest,
            ActivitySort::Largest,
            ActivitySort::Smallest,
        ] {
            let mut request = request();
            request.sort = sort;
            let session = Uuid::new_v4();
            let mut ids = Vec::new();
            loop {
                let page = page_from(history(), &request, session).unwrap();
                assert_eq!(page.total, 120);
                assert!(page.transactions.len() <= 50);
                ids.extend(page.transactions.into_iter().map(|tx| tx.id));
                request.cursor = page.next_cursor;
                if request.cursor.is_none() {
                    break;
                }
            }
            let mut expected = history();
            expected.sort_by(|a, b| compare_transactions(a, b, sort));
            assert_eq!(
                ids,
                expected.into_iter().map(|tx| tx.id).collect::<Vec<_>>()
            );
            assert_eq!(ids.iter().collect::<HashSet<_>>().len(), 120);
        }
    }
    #[test]
    fn search_and_direction_filters_cover_the_complete_history_before_paging() {
        let mut request = request();
        request.query = " ÉPARGNE ".into();
        request.filter = ActivityFilter::Sent;
        let page = page_from(history(), &request, Uuid::new_v4()).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.transactions[0].amount, 119);
        assert!(page.next_cursor.is_none());
        request.filter = ActivityFilter::Received;
        assert!(page_from(history(), &request, Uuid::new_v4())
            .unwrap()
            .transactions
            .is_empty());
    }
    #[test]
    fn cursors_reject_wallet_session_query_order_and_history_changes() {
        let session = Uuid::new_v4();
        let wallet_id = Uuid::new_v4();
        for change in 0..6 {
            let mut request = request();
            request.wallet_id = wallet_id;
            request.cursor = page_from(history(), &request, session).unwrap().next_cursor;
            let mut rows = history();
            let mut next_session = session;
            match change {
                0 => request.wallet_id = Uuid::new_v4(),
                1 => next_session = Uuid::new_v4(),
                2 => request.query = "Synthetic".into(),
                3 => request.sort = ActivitySort::Oldest,
                4 => rows[0].confirmations += 1,
                _ => rows[0].label = "Changed label".into(),
            }
            assert_eq!(
                page_from(rows, &request, next_session).err().unwrap().code,
                "history_changed"
            );
        }
    }
    #[test]
    fn hostile_page_requests_are_bounded_and_do_not_fall_back_to_full_history() {
        let mut request = request();
        for limit in [0, 101, usize::MAX] {
            request.limit = limit;
            assert!(validate_request(&request).is_err());
        }
        request.limit = 100;
        request.query = "a".repeat(128);
        assert!(validate_request(&request).is_ok());
        request.query.push('a');
        assert!(validate_request(&request).is_err());
        request.query.clear();
        request.cursor = Some(ActivityCursor {
            revision: "x".repeat(65),
            after: "y".repeat(64),
        });
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn overview_pending_accounting_uses_every_transaction_before_recent_three_truncation() {
        let mut transactions = history();
        for tx in transactions.iter_mut().take(10) {
            tx.status = "pending".into();
        }
        transactions[1].kind = "self_spend".into();
        let snapshot = WalletSnapshotDto {
            network: NETWORK_NAME,
            balance: BalanceDto {
                confirmed: 100,
                pending: 20,
                trusted_pending: 5,
                total: 120,
            },
            transactions,
            utxos: Vec::new(),
            receive_addresses: Vec::new(),
            label_suggestions: Vec::new(),
            synced_at: None,
            chain_tip: ChainTipDto {
                height: 1,
                observed_at: None,
                status: "unknown",
            },
        };
        let overview = overview_from_snapshot(snapshot).unwrap();
        assert_eq!(overview.transactions.len(), 3);
        assert_eq!(overview.pending_outgoing, 29);
        assert_eq!(overview.balance.total, 120);
        assert_eq!(overview.balance.trusted_pending, 5);
    }

    #[test]
    fn unknown_dates_remain_last_in_each_chronological_direction() {
        let mut rows = history();
        rows[10].date.clear();
        for order in [ActivitySort::Newest, ActivitySort::Oldest] {
            assert_eq!(
                compare_transactions(&rows[10], &rows[11], order),
                std::cmp::Ordering::Greater
            );
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityFilter {
    All,
    Received,
    Sent,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivitySort {
    Newest,
    Oldest,
    Largest,
    Smallest,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivityCursor {
    revision: String,
    after: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivityRequest {
    wallet_id: Uuid,
    filter: ActivityFilter,
    query: String,
    sort: ActivitySort,
    limit: usize,
    cursor: Option<ActivityCursor>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPage {
    transactions: Vec<TransactionDto>,
    next_cursor: Option<ActivityCursor>,
    total: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletOverviewDto {
    network: &'static str,
    balance: BalanceDto,
    transactions: Vec<TransactionDto>,
    utxos: Vec<UtxoDto>,
    synced_at: Option<String>,
    chain_tip: ChainTipDto,
    pending_outgoing: u64,
}

fn compare_transactions(
    a: &TransactionDto,
    b: &TransactionDto,
    sort: ActivitySort,
) -> std::cmp::Ordering {
    let chronological = |oldest: bool| {
        let direction = |comparison: std::cmp::Ordering| {
            if oldest {
                comparison.reverse()
            } else {
                comparison
            }
        };
        direction((b.status == "pending").cmp(&(a.status == "pending")))
            .then_with(
                || match (a.date.parse::<u64>().ok(), b.date.parse::<u64>().ok()) {
                    (Some(a), Some(b)) => direction(b.cmp(&a)),
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, None) => std::cmp::Ordering::Equal,
                },
            )
            .then_with(|| {
                direction(
                    (b.direction == "sent" && b.intent_label.is_some())
                        .cmp(&(a.direction == "sent" && a.intent_label.is_some())),
                )
            })
    };
    match sort {
        ActivitySort::Newest => chronological(false),
        ActivitySort::Oldest => chronological(true),
        ActivitySort::Largest => b.amount.cmp(&a.amount),
        ActivitySort::Smallest => a.amount.cmp(&b.amount),
    }
    .then_with(|| a.id.cmp(&b.id))
}

fn validate_request(request: &ActivityRequest) -> ApiResult<()> {
    if !(1..=100).contains(&request.limit)
        || request.query.len() > 512
        || request.query.chars().count() > 128
        || request
            .cursor
            .as_ref()
            .is_some_and(|cursor| cursor.revision.len() != 64 || cursor.after.len() != 64)
    {
        return Err(api_error(
            "invalid_transaction",
            "The history request is invalid.",
        ));
    }
    Ok(())
}

fn page_from(
    mut transactions: Vec<TransactionDto>,
    request: &ActivityRequest,
    session_id: Uuid,
) -> ApiResult<ActivityPage> {
    validate_request(request)?;
    let query = request.query.trim().to_lowercase();
    transactions.retain(|tx| {
        let direction_matches = match request.filter {
            ActivityFilter::All => true,
            ActivityFilter::Received => tx.direction == "received",
            ActivityFilter::Sent => tx.direction == "sent",
        };
        direction_matches
            && (query.is_empty()
                || std::iter::once(tx.label.as_str())
                    .chain(tx.intent_label.iter().map(|label| label.text.as_str()))
                    .chain(tx.provenance.labels.iter().map(|label| label.text.as_str()))
                    .any(|label| label.to_lowercase().contains(&query)))
    });
    transactions.sort_by(|a, b| compare_transactions(a, b, request.sort));
    // Content-bound cursors fail closed after reorgs, labels, replacements or a
    // new unlock session. No persistent history cache or schema is introduced.
    let revision = sha256::Hash::hash(
        &serde_json::to_vec(&(
            request.wallet_id,
            session_id,
            request.filter,
            &query,
            request.sort,
            &transactions,
        ))
        .map_err(internal)?,
    )
    .to_string();
    let total = transactions.len();
    let start = if let Some(cursor) = &request.cursor {
        if cursor.revision != revision {
            return Err(api_error(
                "history_changed",
                "History changed. Refresh the transaction list.",
            ));
        }
        transactions
            .iter()
            .position(|tx| tx.id == cursor.after)
            .ok_or_else(|| {
                api_error(
                    "history_changed",
                    "History changed. Refresh the transaction list.",
                )
            })?
            + 1
    } else {
        0
    };
    let transactions: Vec<_> = transactions
        .into_iter()
        .skip(start)
        .take(request.limit)
        .collect();
    let next_cursor = if start + transactions.len() < total {
        transactions.last().map(|tx| ActivityCursor {
            revision,
            after: tx.id.clone(),
        })
    } else {
        None
    };
    Ok(ActivityPage {
        transactions,
        next_cursor,
        total,
    })
}

#[tauri::command]
pub async fn wallet_activity(app: AppHandle, request: ActivityRequest) -> ApiResult<ActivityPage> {
    validate_request(&request)?;
    let session_id = app
        .state::<AppState>()
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .identity(request.wallet_id);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        let session_id = validate_read_session(session_id, None)?;
        require_wallet_read_context(&app, &state, request.wallet_id, Some(session_id))?;
        let multisig = selected_profile(&app)?.kind == WalletKind::Multisig;
        let mut db = if multisig {
            open_multisig_db(&app)?
        } else {
            open_db(&app)?
        };
        let wallet = load_wallet(&mut db)?;
        activity_from_wallet(&wallet, &db, &request, session_id)
    })
    .await
    .map_err(internal)?
}

pub(super) fn activity_from_wallet(
    wallet: &Wallet,
    db: &Connection,
    request: &ActivityRequest,
    session_id: Uuid,
) -> ApiResult<ActivityPage> {
    label_provenance::reconcile_wallet_outputs(wallet, db, now()).map_err(internal)?;
    let context = label_provenance::summary_context(db).map_err(internal)?;
    page_from(
        transactions_from(wallet, db, &context)?,
        request,
        session_id,
    )
}

#[tauri::command]
pub async fn wallet_overview(app: AppHandle, wallet_id: Uuid) -> ApiResult<WalletOverviewDto> {
    let session_id = app
        .state::<AppState>()
        .unlocked_wallets
        .lock()
        .map_err(internal)?
        .identity(wallet_id);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _operation = operation_guard(&state)?;
        let session_id = validate_read_session(session_id, None)?;
        require_wallet_read_context(&app, &state, wallet_id, Some(session_id))?;
        let multisig = selected_profile(&app)?.kind == WalletKind::Multisig;
        let mut db = if multisig {
            open_multisig_db(&app)?
        } else {
            open_db(&app)?
        };
        let wallet = load_wallet(&mut db)?;
        let policy = if multisig {
            selected_delayed_policy_context(&app)?
        } else {
            None
        };
        overview_from_snapshot(snapshot_for_view(
            &wallet,
            &db,
            None,
            multisig,
            policy.as_ref(),
            true,
        )?)
    })
    .await
    .map_err(internal)?
}

pub(super) fn overview_from_snapshot(
    mut snapshot: WalletSnapshotDto,
) -> ApiResult<WalletOverviewDto> {
    let pending_outgoing = snapshot
        .transactions
        .iter()
        .filter(|tx| tx.status == "pending" && tx.direction == "sent")
        .try_fold(0u64, |sum, tx| {
            sum.checked_add(tx.amount).and_then(|sum| {
                sum.checked_add(if tx.kind == "self_spend" {
                    0
                } else {
                    tx.fee.unwrap_or(0)
                })
            })
        })
        .ok_or_else(|| api_error("wallet_corrupt", "The pending balance is invalid."))?;
    snapshot
        .transactions
        .sort_by(|a, b| compare_transactions(a, b, ActivitySort::Newest));
    snapshot.transactions.truncate(3);
    Ok(WalletOverviewDto {
        network: snapshot.network,
        balance: snapshot.balance,
        transactions: snapshot.transactions,
        utxos: snapshot.utxos,
        synced_at: snapshot.synced_at,
        chain_tip: snapshot.chain_tip,
        pending_outgoing,
    })
}

pub(super) fn transactions_from(
    wallet: &Wallet,
    db: &Connection,
    provenance_context: &label_provenance::SummaryContext,
) -> ApiResult<Vec<TransactionDto>> {
    let tip = wallet.latest_checkpoint().height();
    let mut transactions = Vec::new();
    for tx in wallet.transactions_sort_by(|a, b| b.chain_position.cmp(&a.chain_position)) {
        let transaction = tx.tx_node.tx.as_ref();
        let (sent, received) = wallet.sent_and_received(transaction);
        let is_received = received > sent;
        let transaction_fee = wallet.calculate_fee(transaction).ok();
        let transaction_vbytes = transaction.weight().to_vbytes_ceil();
        let fee_rate = transaction_fee.and_then(|fee| {
            (transaction_vbytes > 0).then(|| {
                ((fee.to_sat() as f64 / transaction_vbytes as f64) * 100.0).round() / 100.0
            })
        });
        let has_external_value_output = transaction.output.iter().any(|output| {
            output.value > Amount::ZERO
                && wallet
                    .derivation_of_spk(output.script_pubkey.clone())
                    .is_none()
        });
        let kind = transaction_kind(is_received, has_external_value_output);
        let amount = if kind == "self_spend" {
            transaction_fee.unwrap_or(Amount::ZERO)
        } else if is_received {
            received - sent
        } else {
            (sent - received)
                .checked_sub(transaction_fee.unwrap_or(Amount::ZERO))
                .unwrap_or(Amount::ZERO)
        };
        let txid = tx.tx_node.txid.to_string();
        let observed_at = transaction_observed_at(db, &txid)?;
        let (confirmations, block, date) = confirmations(&tx.chain_position, tip, observed_at);
        // Missing observations stay unknown, rather than changing order and
        // invalidating a cursor just because the wall clock advanced.
        let date = if matches!(
            &tx.chain_position,
            ChainPosition::Unconfirmed {
                first_seen: None,
                ..
            }
        ) && observed_at.is_none()
        {
            String::new()
        } else {
            date
        };
        let intent_label = (!is_received)
            .then(|| label_provenance::payment_label_for_txid(db, &txid).map_err(internal))
            .transpose()?
            .flatten();
        let provenance_outpoints = if is_received {
            transaction
                .output
                .iter()
                .enumerate()
                .filter(|(_, output)| {
                    wallet
                        .derivation_of_spk(output.script_pubkey.clone())
                        .is_some()
                })
                .map(|(vout, _)| format!("{}:{vout}", tx.tx_node.txid))
                .collect::<Vec<_>>()
        } else {
            transaction
                .input
                .iter()
                .map(|input| input.previous_output.to_string())
                .collect::<Vec<_>>()
        };
        let mut provenance = label_provenance::funding_summary_with_context(
            db,
            &provenance_outpoints,
            provenance_context,
        )
        .map_err(internal)?;
        provenance.context = if is_received { "received" } else { "funding" }.to_owned();
        let (address, fallback_label) = tx_counterparty(wallet, db, transaction, is_received);
        let label = if let Some(intent) = &intent_label {
            intent.text.clone()
        } else if is_received && provenance.labels.len() == 1 {
            provenance.labels[0].text.clone()
        } else if is_received && provenance.labels.len() > 1 {
            format!("Received to {} labels", provenance.labels.len())
        } else if kind == "self_spend" {
            "Self-spend".to_owned()
        } else {
            fallback_label
        };
        transactions.push(TransactionDto {
            id: txid,
            kind: kind.to_owned(),
            direction: if is_received { "received" } else { "sent" }.to_owned(),
            amount: amount.to_sat(),
            fee: if is_received {
                None
            } else {
                transaction_fee.map(Amount::to_sat)
            },
            status: if confirmations > 0 {
                "confirmed"
            } else {
                "pending"
            }
            .to_owned(),
            confirmations,
            date,
            address,
            label,
            intent_label,
            provenance,
            block,
            replaced_by: None,
            replaces: None,
            input_count: Some(transaction.input.len()),
            output_count: Some(transaction.output.len()),
            fee_rate,
            wallet_input_amount: (sent > Amount::ZERO).then(|| sent.to_sat()),
            wallet_output_amount: (received > Amount::ZERO).then(|| received.to_sat()),
            locktime: Some(transaction.lock_time.to_consensus_u32()),
            rbf: Some(
                transaction
                    .input
                    .iter()
                    .any(|input| input.sequence.is_rbf()),
            ),
            rbf_history: None,
        });
    }
    apply_replacement_history(db, &mut transactions)?;
    Ok(transactions)
}
