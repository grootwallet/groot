use super::hardware_commands::*;
use super::multisig_setup_commands::claim_observed_receive_output;
use super::profile_commands::*;
use super::transaction_commands::*;
use super::*;
use crate::external_signer::{self, ExternalSignerInput, SignerSource, SINGLESIG_ACCOUNT_PATH};
use crate::multisig::{CosignerInput, CosignerSource, MULTISIG_ACCOUNT_PATH};
use crate::recovery::{SpendingPath, TimedSpendingPath};
use bdk_wallet::bitcoin::NetworkKind;
use std::{net::TcpListener, thread};

#[test]
fn transaction_observation_time_is_stable_across_snapshot_refreshes() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    assert_eq!(transaction_observed_at(&db, "unseen").unwrap(), None);

    notifications::enqueue(
        &db,
        &WalletNotification::PaymentReceived {
            txid: "funding".to_owned(),
            amount: 100_000,
            balance: 100_000,
        },
        42,
    )
    .unwrap();
    notifications::enqueue(
        &db,
        &WalletNotification::FirstConfirmation {
            txid: "funding".to_owned(),
            balance: 100_000,
        },
        84,
    )
    .unwrap();

    assert_eq!(transaction_observed_at(&db, "funding").unwrap(), Some(42));
    assert_eq!(transaction_observed_at(&db, "funding").unwrap(), Some(42));
}

#[test]
fn coldcard_policy_acknowledgement_is_serialized_before_authorization() {
    let source = include_str!("../wallet.rs");
    let command = source
        .split("pub fn multisig_acknowledge_coldcard_policy")
        .nth(1)
        .unwrap()
        .split("fn snapshot_from")
        .next()
        .unwrap();
    let guard = command.find("operation_guard(&state)").unwrap();
    let authorization = command.find("require_unlocked(&app, &state)").unwrap();
    assert!(guard < authorization);
}

#[test]
fn chain_tip_observations_survive_restart_age_to_stale_and_reject_corruption() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let unknown = chain_tip_dto(&db, 100, None).unwrap();
    assert_eq!(unknown.status, "unknown");
    assert!(unknown.observed_at.is_none());

    let observed = now();
    let recent = chain_tip_dto(&db, 100, Some(&observed.to_string())).unwrap();
    assert_eq!(recent.status, "recent");
    assert_eq!(
        chain_tip_dto(&db, 100, None).unwrap().observed_at,
        Some(observed.to_string())
    );

    db.execute(
        "UPDATE groot_chain_observation SET observed_at=?1 WHERE singleton=1",
        params![observed.saturating_sub(CHAIN_TIP_RECENT_SECONDS + 1)],
    )
    .unwrap();
    assert_eq!(chain_tip_dto(&db, 100, None).unwrap().status, "stale");
    assert_eq!(
        chain_tip_dto(&db, 99, None).unwrap_err().code,
        "wallet_corrupt"
    );

    db.execute(
        "UPDATE groot_chain_observation SET height=100,observed_at=?1 WHERE singleton=1",
        params![now().saturating_add(301)],
    )
    .unwrap();
    assert_eq!(
        chain_tip_dto(&db, 100, None).unwrap_err().code,
        "wallet_corrupt"
    );
}

#[test]
fn pdf_backup_filename_is_bounded_and_path_free() {
    assert_eq!(
        validate_public_backup_pdf_filename("groot-policy-backup.pdf").unwrap(),
        "groot-policy-backup.pdf"
    );
    for invalid in [
        "",
        "backup.json",
        "backup.PDF",
        "../backup.pdf",
        "folder/backup.pdf",
        "folder\\backup.pdf",
    ] {
        assert_eq!(
            validate_public_backup_pdf_filename(invalid)
                .unwrap_err()
                .code,
            "invalid_backup"
        );
    }
}

#[test]
fn pending_pdf_save_tokens_are_expiring_and_single_use() {
    let token = Uuid::new_v4().to_string();
    let now = Instant::now();
    let mut pending = HashMap::from([(
        token.clone(),
        PendingPdfExport {
            path: PathBuf::from("wallet.pdf"),
            prepared_at: now,
        },
    )]);

    assert_eq!(
        consume_pending_pdf_export(&mut pending, &token, now)
            .unwrap()
            .path,
        PathBuf::from("wallet.pdf")
    );
    assert!(consume_pending_pdf_export(&mut pending, &token, now).is_none());

    pending.insert(
        token.clone(),
        PendingPdfExport {
            path: PathBuf::from("expired.pdf"),
            prepared_at: now - PENDING_PDF_EXPORT_TIMEOUT - Duration::from_secs(1),
        },
    );
    assert!(consume_pending_pdf_export(&mut pending, &token, now).is_none());
    assert!(pending.is_empty());
}

#[test]
fn hardware_and_multisig_profiles_count_as_existing_without_software_secret_storage() {
    let mut registry = WalletRegistry::default();
    assert!(!registered_wallets_exist(&registry));
    registry
        .add(WalletProfile {
            id: Uuid::new_v4(),
            name: "Hardware policy".to_owned(),
            network: NETWORK_NAME.to_owned(),
            kind: WalletKind::Multisig,
            descriptor_checksum: "abcd1234".to_owned(),
            created_at: 1,
            backup_verified: true,
        })
        .unwrap();
    assert!(registered_wallets_exist(&registry));
}

#[test]
fn compiled_network_rejects_foreign_registry_and_public_reset() {
    let mut registry = WalletRegistry::default();
    registry.wallets.push(WalletProfile {
        id: Uuid::new_v4(),
        name: "Foreign wallet".to_owned(),
        network: if NETWORK_NAME == "signet" {
            "testnet4"
        } else {
            "signet"
        }
        .to_owned(),
        kind: WalletKind::SingleKey,
        descriptor_checksum: "abcd1234".to_owned(),
        created_at: 1,
        backup_verified: true,
    });
    assert_eq!(
        ensure_registry_network(&registry).unwrap_err().code,
        "wrong_network"
    );
    assert!(ensure_registry_network(&WalletRegistry::default()).is_ok());
    assert_eq!(
        validate_regtest_reset_confirmation_for(false, "RESET REGTEST")
            .unwrap_err()
            .code,
        "wrong_network"
    );

    let correct = format!(r#"{{"version":1,"network":"{NETWORK_NAME}","descriptor":"wpkh(key)"}}"#);
    assert!(validate_external_signer_import_network(&correct).is_ok());
    assert_eq!(
        validate_external_signer_import_network(
            r#"{"version":1,"network":"bitcoin","descriptor":"wpkh(key)"}"#,
        )
        .unwrap_err()
        .code,
        "wrong_network"
    );
}

#[test]
fn core_fee_rates_fail_closed_and_round_up_to_integer_sat_per_vbyte() {
    assert_eq!(core_fee_rate(Some(Amount::from_sat(1_001))).unwrap(), 2.0);
    assert_eq!(core_fee_rate(Some(Amount::from_sat(1_000))).unwrap(), 1.0);
    for unavailable in [None, Some(Amount::ZERO)] {
        assert_eq!(
            core_fee_rate(unavailable).unwrap_err().code,
            "fee_estimate_unavailable"
        );
    }
    assert_eq!(
        core_fee_rate(Some(Amount::from_sat(10_000_001)))
            .unwrap_err()
            .code,
        "fee_estimate_unavailable"
    );
    assert_eq!(ordered_fee_estimates(5.0, 2.0, 1.0), (5.0, 5.0, 5.0));
    assert_eq!(ordered_fee_estimates(1.0, 2.0, 5.0), (1.0, 2.0, 5.0));
    assert_eq!(sparse_mempool_fee_rate([(141, 143), (220, 198)]), Some(1.0));
    assert_eq!(
        sparse_mempool_fee_rate([(141, 53_016), (220, 198)]),
        Some(1.0)
    );
    assert_eq!(sparse_mempool_fee_rate([(141, 423), (220, 660)]), Some(3.0));
    assert_eq!(sparse_mempool_fee_rate([]), None);
    assert_eq!(current_mempool_fee_rate([], 2.0), Some(2.0));
    assert_eq!(
        current_mempool_fee_rate([(141, 143), (220, 198)], 7.0),
        Some(1.0)
    );
    assert_eq!(sparse_mempool_fee_rate([(0, 1_000)]), None);
    assert_eq!(
        sparse_mempool_fee_rate([(SPARSE_MEMPOOL_LIMIT_VBYTES + 1, 1_000)]),
        None
    );
}

#[test]
fn foreground_sync_cancellation_is_immediate_and_idempotent() {
    let state = AppState::default();
    assert!(!cancel_foreground_sync(&state).unwrap());

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .foreground_sync
        .lock()
        .unwrap()
        .replace(ActiveForegroundSync {
            wallet_id: Uuid::new_v4(),
            cancel: Arc::clone(&cancel),
        });

    assert!(cancel_foreground_sync(&state).unwrap());
    assert!(cancel.load(Ordering::Acquire));
    assert_eq!(
        ensure_foreground_sync_not_cancelled(Some(cancel.as_ref()))
            .unwrap_err()
            .code,
        "sync_cancelled"
    );
    assert!(cancel_foreground_sync(&state).unwrap());
}

#[test]
fn exact_drain_preview_amount_can_be_prepared_at_the_same_fee_rate() {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxIn, TxOut,
        Witness,
    };

    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let master = root_key(&mnemonic, "max preview").unwrap();
    let mut wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(Network::Regtest)
    .create_wallet_no_persist()
    .unwrap();
    let receive = wallet.reveal_next_address(KeychainKind::External).address;
    let funding = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([21; 32]), 0),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(143_622),
            script_pubkey: receive.script_pubkey(),
        }],
    };
    wallet.apply_unconfirmed_txs([(funding, 1)]);

    let recipient_master = root_key(&mnemonic, "max recipient").unwrap();
    let mut recipient_wallet = Wallet::create(
        Bip84(recipient_master, KeychainKind::External),
        Bip84(recipient_master, KeychainKind::Internal),
    )
    .network(Network::Regtest)
    .create_wallet_no_persist()
    .unwrap();
    let recipient = recipient_wallet
        .reveal_next_address(KeychainKind::External)
        .address;
    let fee_rate = FeeRate::from_sat_per_vb(2).unwrap();

    let mut max_builder = wallet.build_tx();
    max_builder
        .drain_wallet()
        .drain_to(recipient.script_pubkey())
        .fee_rate(fee_rate);
    let max_psbt = max_builder.finish().unwrap();
    let max_amount = max_psbt
        .unsigned_tx
        .output
        .iter()
        .find(|output| output.script_pubkey == recipient.script_pubkey())
        .unwrap()
        .value;
    let max_fee = max_psbt.fee_amount().unwrap();

    let mut prepare_builder = wallet.build_tx();
    prepare_builder
        .add_recipient(recipient.script_pubkey(), max_amount)
        .fee_rate(fee_rate);
    let prepared = prepare_builder.finish().unwrap();
    assert_eq!(prepared.fee_amount().unwrap(), max_fee);
    assert_eq!(max_amount + max_fee, Amount::from_sat(143_622));
}

const WORDS: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

fn serve_one_http_response(response: Option<&'static [u8]>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 4096];
        let _ = stream.read(&mut request);
        if let Some(response) = response {
            stream.write_all(response).unwrap();
        } else {
            thread::sleep(Duration::from_millis(250));
        }
    });
    format!("http://{address}")
}

fn serve_one_json(body: &'static str) -> String {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 4096];
        let _ = stream.read(&mut request);
        stream.write_all(response.as_bytes()).unwrap();
    });
    format!("http://{address}")
}

#[test]
fn core_fee_estimator_uses_rpc_and_never_falls_back() {
    let available = serve_one_json(
        r#"{"result":{"feerate":0.00001001,"errors":[],"blocks":2},"error":null,"id":"groot"}"#,
    );
    let client = build_rpc_client(&available, Auth::None, None).unwrap();
    assert_eq!(
        estimate_core_fee(&client, 2, EstimateMode::Conservative).unwrap(),
        2.0
    );

    let unavailable = serve_one_json(
        r#"{"result":{"feerate":null,"errors":["Insufficient data"],"blocks":0},"error":null,"id":"groot"}"#,
    );
    let client = build_rpc_client(&unavailable, Auth::None, None).unwrap();
    assert_eq!(
        estimate_core_fee(&client, 2, EstimateMode::Conservative)
            .unwrap_err()
            .code,
        "fee_estimate_unavailable"
    );
}

#[test]
fn core_sync_progress_is_relative_to_the_persisted_wallet_tip() {
    assert_eq!(core_sync_progress_percent(20, 20, 120), 0);
    assert_eq!(core_sync_progress_percent(20, 70, 120), 50);
    assert_eq!(core_sync_progress_percent(20, 120, 120), 100);
    assert_eq!(core_sync_progress_percent(20, 130, 120), 100);
    assert_eq!(core_sync_progress_percent(20, 10, 120), 0);
    assert_eq!(core_sync_progress_percent(120, 120, 120), 100);
}

#[test]
fn direct_rpc_auth_timeout_tls_and_chain_fail_closed() {
    let unauthorized = serve_one_http_response(Some(
        b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    ));
    let error = checked_block_height(
        &build_rpc_client_with_timeout(
            &unauthorized,
            Auth::UserPass("groot".to_owned(), "wrong".to_owned()),
            None,
            Duration::from_millis(100),
        )
        .unwrap(),
    )
    .unwrap_err();
    assert_sanitized_rpc_error(error);

    let stalled = serve_one_http_response(None);
    let error = checked_block_height(
        &build_rpc_client_with_timeout(
            &stalled,
            Auth::UserPass("groot".to_owned(), "secret".to_owned()),
            None,
            Duration::from_millis(50),
        )
        .unwrap(),
    )
    .unwrap_err();
    assert_sanitized_rpc_error(error);

    let plaintext = serve_one_http_response(Some(
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
    ));
    let tls_url = plaintext.replacen("http://", "https://", 1);
    let error = checked_block_height(
        &build_rpc_client_with_timeout(
            &tls_url,
            Auth::UserPass("groot".to_owned(), "secret".to_owned()),
            None,
            Duration::from_millis(100),
        )
        .unwrap(),
    )
    .unwrap_err();
    assert_sanitized_rpc_error(error);

    for network in [Network::Bitcoin, Network::Testnet, Network::Signet] {
        assert_eq!(
            ensure_expected_network(network).unwrap_err().code,
            "wrong_network"
        );
    }
    ensure_expected_network(Network::Regtest).unwrap();

    for network in [
        Network::Bitcoin,
        Network::Testnet,
        Network::Signet,
        Network::Regtest,
    ] {
        ensure_expected_genesis(network, genesis_block(network).block_hash()).unwrap();
    }
    assert_eq!(
        ensure_expected_genesis(
            Network::Regtest,
            genesis_block(Network::Bitcoin).block_hash()
        )
        .unwrap_err()
        .code,
        "wrong_network"
    );
}

fn assert_sanitized_rpc_error(error: ApiError) {
    assert_eq!(error.code, "network_unavailable");
    assert_eq!(error.message, RPC_UNAVAILABLE_MESSAGE);
    for internal_detail in ["JSON-RPC", "transport error", "endpoint rejected", "401"] {
        assert!(!error.message.contains(internal_detail));
    }
}

#[test]
fn rpc_whitelist_rejection_is_actionable_without_exposing_core_details() {
    let error = rpc_api_error(CoreRpcError::JsonRpc(jsonrpc::Error::Rpc(
        jsonrpc::error::RpcError {
            code: -1,
            message: "RPC User private-user not allowed to call method getnetworkinfo".to_owned(),
            data: None,
        },
    )));

    assert_eq!(error.code, "invalid_node_config");
    assert_eq!(error.message, RPC_PERMISSION_MESSAGE);
    for internal_detail in ["private-user", "getnetworkinfo", "JSON-RPC", "code -1"] {
        assert!(!error.message.contains(internal_detail));
    }
}

#[test]
fn node_health_retries_only_transient_transport_failures() {
    let mut attempts = 0;
    let mut pauses = Vec::new();
    let result = retry_transient_node_health(
        || {
            attempts += 1;
            if attempts < NODE_HEALTH_ATTEMPTS {
                Err(rpc_unavailable())
            } else {
                Ok(149_142_u64)
            }
        },
        |delay| pauses.push(delay),
    )
    .unwrap();
    assert_eq!(result, 149_142);
    assert_eq!(attempts, NODE_HEALTH_ATTEMPTS);
    assert_eq!(pauses, vec![NODE_HEALTH_RETRY_DELAY; 2]);

    let mut attempts = 0;
    let error = retry_transient_node_health(
        || {
            attempts += 1;
            Err::<(), _>(api_error("wrong_network", "Wrong network."))
        },
        |_| panic!("non-transient failures must not pause"),
    )
    .unwrap_err();
    assert_eq!(error.code, "wrong_network");
    assert_eq!(attempts, 1);
}

#[test]
fn modern_blockchain_info_does_not_require_getnetworkinfo_permission() {
    let endpoint = serve_one_json(
        r#"{"result":{"chain":"regtest","blocks":1,"headers":1,"bestblockhash":"0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206","difficulty":1.0,"mediantime":1,"verificationprogress":1.0,"initialblockdownload":false,"chainwork":"00","size_on_disk":1,"pruned":false,"softforks":{},"warnings":[]},"error":null,"id":"groot"}"#,
    );
    let client = build_rpc_client(&endpoint, Auth::None, None).unwrap();

    let info = get_blockchain_info(&client).unwrap();

    assert_eq!(info.chain, Network::Regtest);
    assert_eq!(info.blocks, 1);
}

#[test]
fn saved_file_reveal_tokens_are_bounded_expiring_and_single_use() {
    let now = Instant::now();
    let valid_token = Uuid::new_v4().to_string();
    let expired_token = Uuid::new_v4().to_string();
    let mut saved_files = HashMap::from([
        (
            valid_token.clone(),
            SavedFileReveal {
                path: PathBuf::from("saved.psbt"),
                saved_at: now,
            },
        ),
        (
            expired_token.clone(),
            SavedFileReveal {
                path: PathBuf::from("expired.psbt"),
                saved_at: now - SAVED_FILE_REVEAL_TIMEOUT - Duration::from_secs(1),
            },
        ),
    ]);

    assert!(consume_saved_file_token(&mut saved_files, "not-a-token", now).is_none());
    assert!(consume_saved_file_token(&mut saved_files, &expired_token, now).is_none());
    assert_eq!(
        consume_saved_file_token(&mut saved_files, &valid_token, now)
            .unwrap()
            .path,
        PathBuf::from("saved.psbt")
    );
    assert!(consume_saved_file_token(&mut saved_files, &valid_token, now).is_none());
}

#[test]
fn external_signer_labels_are_normalized_and_bounded() {
    assert_eq!(
        normalize_external_signer_label("  Travel   signing\tkey  ").unwrap(),
        "Travel signing key"
    );
    assert_eq!(
        normalize_external_signer_label("").unwrap_err().code,
        "invalid_label"
    );
    assert_eq!(
        normalize_external_signer_label(&"x".repeat(49))
            .unwrap_err()
            .code,
        "invalid_label"
    );
}

#[test]
fn pending_balance_includes_trusted_and_untrusted_outputs() {
    assert_eq!(aggregate_pending_balance(100_000, 249_000), 349_000);
    assert_eq!(aggregate_pending_balance(u64::MAX, 1), u64::MAX);
}

#[test]
fn observed_unlabeled_receive_outputs_keep_one_assignment_and_may_reuse_label_text() {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxOut, Witness,
    };

    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let master = root_key(&mnemonic, "observed receive label").unwrap();
    let mut db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(Network::Regtest)
    .create_wallet(&mut db)
    .unwrap();
    let first = wallet.peek_address(KeychainKind::External, 0).address;
    let second = wallet.peek_address(KeychainKind::External, 1).address;
    let change = wallet.peek_address(KeychainKind::Internal, 0).address;
    let funding = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::new(),
        }],
        output: vec![
            TxOut {
                value: Amount::from_sat(100_000),
                script_pubkey: first.script_pubkey(),
            },
            TxOut {
                value: Amount::from_sat(50_000),
                script_pubkey: second.script_pubkey(),
            },
            TxOut {
                value: Amount::from_sat(25_000),
                script_pubkey: change.script_pubkey(),
            },
        ],
    };
    let funding_txid = funding.compute_txid();
    wallet.apply_unconfirmed_txs([(funding, 1)]);
    label_provenance::reconcile_wallet_outputs(&wallet, &db, 1).unwrap();

    let claimed = claim_observed_receive_output(
        &mut db,
        &wallet,
        &format!("{funding_txid}:0"),
        "  Policy verification funding  ",
    )
    .unwrap();
    assert_eq!(claimed.id, 0);
    assert_eq!(claimed.label, "Policy verification funding");
    assert_eq!(claimed.status, "used");
    let provenance = label_provenance::output_summary(&db, &format!("{funding_txid}:0")).unwrap();
    assert_eq!(provenance.state, label_provenance::ProvenanceState::Known);
    assert_eq!(provenance.labels[0].text, "Policy verification funding");

    assert_eq!(
        claim_observed_receive_output(
            &mut db,
            &wallet,
            &format!("{funding_txid}:0"),
            "Replacement label",
        )
        .err()
        .unwrap()
        .code,
        "invalid_label"
    );
    let related = claim_observed_receive_output(
        &mut db,
        &wallet,
        &format!("{funding_txid}:1"),
        "  policy   verification FUNDING ",
    )
    .unwrap();
    assert_eq!(related.id, 1);
    assert_eq!(related.label, "policy verification FUNDING");
    let first_assignment = label_provenance::label_for_subject(&db, "address", "0")
        .unwrap()
        .unwrap();
    let related_assignment = label_provenance::label_for_subject(&db, "address", "1")
        .unwrap()
        .unwrap();
    assert_eq!(first_assignment.id, related_assignment.id);
    assert_eq!(related_assignment.text, "Policy verification funding");
    assert_eq!(
        claim_observed_receive_output(
            &mut db,
            &wallet,
            &format!("{funding_txid}:2"),
            "Change label",
        )
        .err()
        .unwrap()
        .code,
        "address_not_found"
    );
}

#[test]
fn regtest_hardware_alias_must_decode_to_the_identical_output_script() {
    let regtest = "bcrt1qf6n3a54f4nqc5976hjl556ukfdas8xsnf8k9mz";
    let hardware_alias = regtest_testnet_address_alias(regtest).expect("valid Regtest address");
    assert_eq!(hardware_alias, "tb1qf6n3a54f4nqc5976hjl556ukfdas8xsntw0gvt");
    assert!(hardware_display_matches_expected_address(
        regtest,
        &hardware_alias
    ));
    assert!(hardware_display_matches_expected_address(regtest, regtest));

    let other = regtest_testnet_address_alias("bcrt1q5spdlkwvajjz9t0nvsqygmeaagxts4sqxy3a7t")
        .expect("valid different Regtest address");
    assert!(!hardware_display_matches_expected_address(regtest, &other));
    assert!(!hardware_display_matches_expected_address(
        regtest,
        "not-an-address"
    ));

    let change = "bcrt1q5spdlkwvajjz9t0nvsqygmeaagxts4sqxy3a7t".to_owned();
    let (recipient_alias, change_aliases) =
        proposal_testnet_aliases(regtest, std::slice::from_ref(&change));
    assert_eq!(recipient_alias.as_deref(), Some(hardware_alias.as_str()));
    assert_eq!(change_aliases.len(), 1);
    assert!(hardware_display_matches_expected_address(
        &change,
        change_aliases[0].as_deref().expect("change alias")
    ));
}

#[test]
fn testnet4_coldcard_must_return_the_exact_testnet4_address() {
    let regtest = "bcrt1qf6n3a54f4nqc5976hjl556ukfdas8xsnf8k9mz";
    let regtest = Address::from_str(regtest)
        .expect("valid Regtest address")
        .require_network(Network::Regtest)
        .expect("Regtest network");
    let testnet4 = Address::from_script(&regtest.script_pubkey(), Network::Testnet4)
        .expect("valid Testnet4 address")
        .to_string();
    assert!(hardware_display_matches_expected_address_for_network(
        Network::Testnet4,
        &testnet4,
        &testnet4,
    ));
    assert!(!hardware_display_matches_expected_address_for_network(
        Network::Testnet4,
        &testnet4,
        &regtest.to_string(),
    ));
    assert_eq!(
        validated_hardware_verification_metadata(
            Network::Testnet4,
            &testnet4,
            Some(&regtest.to_string()),
            Some(123),
            Some("f00dbabe".to_owned()),
        ),
        (None, None)
    );
    assert_eq!(
        validated_hardware_verification_metadata(
            Network::Testnet4,
            &testnet4,
            Some(&testnet4),
            Some(123),
            Some("f00dbabe".to_owned()),
        ),
        (Some("123".to_owned()), Some("f00dbabe".to_owned()))
    );
}

#[test]
fn hardware_address_verifications_are_append_only_and_restore_the_latest_event() {
    let mut db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    db.execute(
        "INSERT INTO groot_addresses (idx, address, label, created_at, state)
         VALUES (0, 'bcrt1qf6n3a54f4nqc5976hjl556ukfdas8xsnf8k9mz', 'deposit', 1, 'awaiting')",
        [],
    )
    .unwrap();

    let ledger = VerifiedHardwareIdentity {
        device_type: "ledger".to_owned(),
        fingerprint: "f573a32b".to_owned(),
    };
    let first = record_address_verification(
        &mut db,
        0,
        &ledger,
        "tb1qf6n3a54f4nqc5976hjl556ukfdas8xsntw0gvt",
        false,
    )
    .unwrap();
    assert!(first.hardware_verified_at.is_some());
    assert_eq!(first.hardware_verified_by.as_deref(), Some("f573a32b"));

    let replacement = VerifiedHardwareIdentity {
        device_type: "ledger".to_owned(),
        fingerprint: "c0ffee01".to_owned(),
    };
    let latest = record_address_verification(
        &mut db,
        0,
        &replacement,
        "tb1qf6n3a54f4nqc5976hjl556ukfdas8xsntw0gvt",
        false,
    )
    .unwrap();
    assert_eq!(latest.hardware_verified_by.as_deref(), Some("c0ffee01"));
    assert_eq!(
        db.query_row(
            "SELECT COUNT(*) FROM groot_address_verifications WHERE address_idx = 0",
            [],
            |row| row.get::<_, u32>(0),
        )
        .unwrap(),
        2
    );
}

#[test]
fn transaction_kind_distinguishes_fee_only_self_spends_from_payments() {
    assert_eq!(transaction_kind(false, false), "self_spend");
    assert_eq!(transaction_kind(false, true), "payment");
    assert_eq!(transaction_kind(true, false), "payment");
    assert_eq!(transaction_kind(true, true), "payment");
}

#[test]
fn authentication_throttle_round_trips_through_wallet_storage() {
    let mut db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let mut throttle = AuthThrottle::default();
    for _ in 0..7 {
        throttle.failed(100);
    }
    save_auth_throttle(&mut db, &throttle).unwrap();
    let restored = load_auth_throttle(&db).unwrap();
    assert_eq!(restored.snapshot(), throttle.snapshot());
    assert!(restored.check(100).is_err());
}

#[test]
fn recovery_scan_settings_default_and_persist_with_safe_bounds() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    assert_eq!(
        load_recovery_scan_settings(&db).unwrap(),
        RecoveryScanSettingsDto {
            birthday_height: 0,
            gap_limit: 20,
        }
    );
    db.execute(
        "INSERT INTO groot_recovery_settings (singleton, birthday_height, gap_limit) VALUES (1, 840000, 250)",
        [],
    )
    .unwrap();
    assert_eq!(
        load_recovery_scan_settings(&db).unwrap(),
        RecoveryScanSettingsDto {
            birthday_height: 840_000,
            gap_limit: 250,
        }
    );
    assert!(db
        .execute(
            "UPDATE groot_recovery_settings SET gap_limit = 19 WHERE singleton = 1",
            [],
        )
        .is_err());
    assert!(db
        .execute(
            "UPDATE groot_recovery_settings SET gap_limit = 1001 WHERE singleton = 1",
            [],
        )
        .is_err());
}

#[test]
fn recovery_scan_progress_is_persisted_and_terminal_transitions_are_guarded() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let settings = RecoveryScanSettingsDto {
        birthday_height: 10,
        gap_limit: 250,
    };
    assert_eq!(
        idle_recovery_scan_status(&settings).status,
        "idle".to_owned()
    );
    let started = start_recovery_scan_record(&db, "run-one", &settings, 109).unwrap();
    assert_eq!(started.total_blocks, 100);
    assert_eq!(started.current_height, 9);
    update_recovery_scan_progress(&db, "run-one", 34, 25).unwrap();
    let progress = load_recovery_scan_record(&db).unwrap().unwrap();
    assert_eq!(progress.run_id, "run-one");
    assert_eq!(progress.status.status, "running");
    assert_eq!(progress.status.current_height, 34);
    assert_eq!(progress.status.processed_blocks, 25);

    db.execute(
        "UPDATE groot_recovery_scans SET status = 'cancelling' WHERE singleton = 1",
        [],
    )
    .unwrap();
    update_recovery_scan_progress(&db, "run-one", 35, 26).unwrap();
    finish_recovery_scan_record(&db, "run-one", "cancelled").unwrap();
    assert_eq!(
        load_recovery_scan_record(&db)
            .unwrap()
            .unwrap()
            .status
            .status,
        "cancelled"
    );
    assert_eq!(
        update_recovery_scan_progress(&db, "run-one", 36, 27)
            .unwrap_err()
            .code,
        "scan_interrupted"
    );
    assert_eq!(
        finish_recovery_scan_record(&db, "wrong-run", "completed")
            .unwrap_err()
            .code,
        "scan_interrupted"
    );
}

#[test]
fn recovery_scan_restart_marks_persisted_work_interrupted() {
    let directory = std::env::temp_dir().join(format!("groot-scan-restart-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("wallet.sqlite");
    {
        let db = Connection::open(&path).unwrap();
        init_app_schema(&db).unwrap();
        let settings = RecoveryScanSettingsDto {
            birthday_height: 100,
            gap_limit: 80,
        };
        start_recovery_scan_record(&db, "persisted-run", &settings, 199).unwrap();
        update_recovery_scan_progress(&db, "persisted-run", 124, 25).unwrap();
        let active = reconcile_recovery_scan_record(&db, Some("persisted-run"))
            .unwrap()
            .unwrap();
        assert_eq!(active.status.status, "running");
    }
    {
        let db = Connection::open(&path).unwrap();
        init_app_schema(&db).unwrap();
        let interrupted = reconcile_recovery_scan_record(&db, None).unwrap().unwrap();
        assert_eq!(interrupted.run_id, "persisted-run");
        assert_eq!(interrupted.status.status, "interrupted");
        assert_eq!(interrupted.status.current_height, 124);
        assert_eq!(interrupted.status.processed_blocks, 25);
    }
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn revealed_addresses_cannot_cross_the_configured_recovery_gap() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    for index in 0..MIN_RECOVERY_GAP_LIMIT {
        db.execute(
            "INSERT INTO groot_addresses (idx, address, label, created_at, state, observed)
             VALUES (?1, ?2, 'request', 1, 'awaiting', 0)",
            params![index, format!("address-{index}")],
        )
        .unwrap();
    }
    assert_eq!(required_recovery_gap(&db, None).unwrap(), 20);
    let error = enforce_recovery_gap(&db, 20).unwrap_err();
    assert_eq!(error.code, "address_gap_limit_reached");

    db.execute(
        "UPDATE groot_addresses SET observed = 1, state = 'used' WHERE idx = 5",
        [],
    )
    .unwrap();
    assert_eq!(required_recovery_gap(&db, Some(20)).unwrap(), 15);
    enforce_recovery_gap(&db, 20).unwrap();
}

#[test]
fn transaction_change_cannot_cross_the_configured_recovery_gap() {
    use bdk_wallet::bitcoin::{absolute::LockTime, transaction::Version, TxOut};

    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let master = root_key(&mnemonic, "change gap").unwrap();
    let mut wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(Network::Regtest)
    .create_wallet_no_persist()
    .unwrap();
    let change = (0..=MIN_RECOVERY_GAP_LIMIT)
        .map(|_| wallet.reveal_next_address(KeychainKind::Internal).address)
        .last()
        .unwrap();
    let psbt = Psbt::from_unsigned_tx(Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![TxOut {
            value: Amount::from_sat(1_000),
            script_pubkey: change.script_pubkey(),
        }],
    })
    .unwrap();

    let error = enforce_change_recovery_gap(&db, &wallet, &psbt).unwrap_err();
    assert_eq!(error.code, "address_gap_limit_reached");
}

#[test]
fn proposal_review_rejects_any_non_recipient_output_not_owned_by_the_wallet() {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxIn, TxOut,
        Witness,
    };

    fn test_wallet(words: &str, passphrase: &str) -> Wallet {
        let mnemonic = Mnemonic::parse(words).unwrap();
        let master = root_key(&mnemonic, passphrase).unwrap();
        Wallet::create(
            Bip84(master, KeychainKind::External),
            Bip84(master, KeychainKind::Internal),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap()
    }

    let mut wallet = test_wallet(WORDS, "review wallet");
    let funding = wallet.reveal_next_address(KeychainKind::External).address;
    let change = wallet.reveal_next_address(KeychainKind::Internal).address;
    let mut recipient_wallet = test_wallet(WORDS, "recipient wallet");
    let recipient = recipient_wallet
        .reveal_next_address(KeychainKind::External)
        .address;
    let mut attacker_wallet = test_wallet(WORDS, "attacker wallet");
    let attacker = attacker_wallet
        .reveal_next_address(KeychainKind::External)
        .address;
    let transaction = Transaction {
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
                value: Amount::from_sat(10_000),
                script_pubkey: recipient.script_pubkey(),
            },
            TxOut {
                value: Amount::from_sat(5_000),
                script_pubkey: change.script_pubkey(),
            },
        ],
    };
    let mut psbt = Psbt::from_unsigned_tx(transaction).unwrap();
    psbt.inputs[0].witness_utxo = Some(TxOut {
        value: Amount::from_sat(16_000),
        script_pubkey: funding.script_pubkey(),
    });
    let (change_total, addresses) =
        proposal_change_details(&wallet, &psbt, &recipient.to_string(), 10_000).unwrap();
    assert_eq!(change_total, 5_000);
    assert_eq!(addresses, vec![change.to_string()]);
    assert_eq!(
        proposal_recipient_wallet_details(&wallet, &psbt, &recipient.to_string(), 10_000).unwrap(),
        (false, vec![])
    );
    let mut self_transfer = psbt.clone();
    self_transfer.unsigned_tx.output[0].script_pubkey = funding.script_pubkey();
    assert_eq!(
        proposal_recipient_wallet_details(&wallet, &self_transfer, &funding.to_string(), 10_000)
            .unwrap(),
        (true, vec![])
    );
    let (inputs, actual_rate, locktime, rbf) =
        proposal_transaction_details(&wallet, &psbt, 1_000).unwrap();
    assert_eq!(inputs.len(), 1);
    assert_eq!(inputs[0].amount, 16_000);
    assert!(inputs[0].derivation_paths.is_empty());
    assert_eq!(
        inputs[0].sequence,
        Sequence::ENABLE_RBF_NO_LOCKTIME.to_consensus_u32()
    );
    assert!(actual_rate > 0.0);
    assert_eq!(locktime, 0);
    assert!(rbf);
    assert_eq!(
        unique_derivation_paths(
            ["m/48'/1'/0'/2'/1/4", "m/48'/1'/0'/2'/1/4"]
                .into_iter()
                .map(str::to_owned)
        ),
        vec!["m/48'/1'/0'/2'/1/4"]
    );

    let mut duplicate_input = psbt.clone();
    duplicate_input
        .unsigned_tx
        .input
        .push(duplicate_input.unsigned_tx.input[0].clone());
    duplicate_input
        .inputs
        .push(duplicate_input.inputs[0].clone());
    assert_eq!(
        proposal_transaction_details(&wallet, &duplicate_input, 1_000)
            .unwrap_err()
            .code,
        "proposal_mismatch"
    );
    let mut overspend = psbt.clone();
    overspend.unsigned_tx.output[0].value = Amount::from_sat(20_000);
    assert_eq!(
        proposal_fee_amount(&overspend).unwrap_err().code,
        "proposal_mismatch"
    );

    let mut redirected = psbt.clone();
    redirected.unsigned_tx.output[1].script_pubkey = attacker.script_pubkey();
    assert_eq!(
        proposal_change_details(&wallet, &redirected, &recipient.to_string(), 10_000)
            .unwrap_err()
            .code,
        "proposal_mismatch"
    );

    let mut duplicate_recipient = psbt;
    duplicate_recipient.unsigned_tx.output[1] = duplicate_recipient.unsigned_tx.output[0].clone();
    assert_eq!(
        proposal_change_details(
            &wallet,
            &duplicate_recipient,
            &recipient.to_string(),
            10_000,
        )
        .unwrap_err()
        .code,
        "proposal_mismatch"
    );
}

#[test]
fn acceleration_rates_and_error_classes_fail_closed() {
    for invalid in ["NaN", "inf", "-1", "0", "10000.1"] {
        assert_eq!(
            validate_acceleration_rate(invalid).unwrap_err().code,
            "invalid_amount"
        );
    }
    let (applied, rate) = validate_acceleration_rate("1.01").unwrap();
    assert_eq!(applied, 1.012);
    assert_eq!(rate.to_sat_per_kwu(), 253);
    let (applied, rate) = validate_acceleration_rate("2.5").unwrap();
    assert_eq!(applied, 2.5);
    assert_eq!(rate.to_sat_per_kwu(), 625);
    let (applied, rate) = validate_acceleration_rate("2.501").unwrap();
    assert_eq!(applied, 2.504);
    assert_eq!(rate.to_sat_per_kwu(), 626);
    assert_eq!(
        acceleration_error("transaction confirmed").code,
        "transaction_confirmed"
    );
    assert_eq!(
        acceleration_error("transaction is irreplaceable").code,
        "transaction_not_replaceable"
    );
    assert_eq!(
        acceleration_error("Fee rate too low: required 2 sat/vb").code,
        "fee_rate_too_low"
    );
    assert_eq!(
        acceleration_error("insufficient fee").code,
        "insufficient_funds"
    );
    assert_eq!(
        acceleration_error("unknown parent").code,
        "acceleration_unavailable"
    );
}

#[test]
fn fee_comparison_is_exact_signed_integer_arithmetic() {
    assert_eq!(fee_difference(700, Some(900)).unwrap(), Some(-200));
    assert_eq!(fee_difference(1_100, Some(900)).unwrap(), Some(200));
    assert_eq!(fee_difference(900, Some(900)).unwrap(), Some(0));
    assert_eq!(fee_difference(900, None).unwrap(), None);
}

#[test]
fn cpfp_uses_core_mempool_fee_when_an_incoming_parent_has_unknown_inputs() {
    let fetched = resolve_cpfp_parent_fee(None, || Ok(Amount::from_sat(1_234))).unwrap();
    assert_eq!(fetched, Amount::from_sat(1_234));

    let known = resolve_cpfp_parent_fee(Some(Amount::from_sat(432)), || {
        Err(api_error(
            "internal_error",
            "the mempool must not be queried when BDK knows the fee",
        ))
    })
    .unwrap();
    assert_eq!(known, Amount::from_sat(432));

    let unavailable = resolve_cpfp_parent_fee(None, || {
        Err(api_error(
            "acceleration_unavailable",
            "Bitcoin Core no longer has the parent.",
        ))
    })
    .unwrap_err();
    assert_eq!(unavailable.code, "acceleration_unavailable");
}

#[test]
fn cpfp_builds_from_an_incoming_parent_without_foreign_prevouts() {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxIn, TxOut,
        Witness,
    };

    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let master = root_key(&mnemonic, "test passphrase").unwrap();
    let mut db = Connection::open_in_memory().unwrap();
    let mut wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(Network::Regtest)
    .create_wallet(&mut db)
    .unwrap();
    let receive = wallet.reveal_next_address(KeychainKind::External);
    let parent = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([7; 32]), 1),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(100_000),
            script_pubkey: receive.address.script_pubkey(),
        }],
    };
    let parent_txid = parent.compute_txid();
    wallet.apply_unconfirmed_txs([(parent.clone(), 1)]);

    assert!(wallet.calculate_fee(&parent).is_err());
    let child = build_cpfp(
        &mut wallet,
        parent_txid,
        Amount::from_sat(1_000),
        FeeRate::from_sat_per_vb(5).unwrap(),
    )
    .unwrap();
    assert_eq!(child.unsigned_tx.input.len(), 1);
    assert_eq!(child.unsigned_tx.input[0].previous_output.txid, parent_txid);
    assert!(child.fee_amount().unwrap() > Amount::ZERO);
}

#[test]
fn credential_and_mnemonic_inputs_are_bounded() {
    assert_eq!(
        validate_credential("").unwrap_err().code,
        "invalid_credential"
    );
    assert!(validate_credential(&"x".repeat(MAX_CREDENTIAL_BYTES)).is_ok());
    assert_eq!(
        validate_credential(&"x".repeat(MAX_CREDENTIAL_BYTES + 1))
            .unwrap_err()
            .code,
        "invalid_credential"
    );
    assert!(WORDS.len() < MAX_MNEMONIC_INPUT_BYTES);
    let missing_passphrase = validate_wallet_passphrase("").unwrap_err();
    assert_eq!(missing_passphrase.code, "invalid_credential");
    assert_eq!(
        missing_passphrase.message,
        "A wallet passphrase is required."
    );
    assert!(validate_wallet_passphrase(&"x".repeat(MAX_CREDENTIAL_BYTES)).is_ok());
    let long_passphrase =
        validate_wallet_passphrase(&"x".repeat(MAX_CREDENTIAL_BYTES + 1)).unwrap_err();
    assert_eq!(long_passphrase.code, "invalid_credential");
    assert_eq!(
        long_passphrase.message,
        "The wallet passphrase is too long."
    );
}

#[test]
fn command_boundary_error_translation_is_complete_and_stable() {
    let registry_cases = [
        (RegistryError::Missing, "wallet_not_found"),
        (RegistryError::UnknownSelection, "wallet_not_found"),
        (RegistryError::InvalidName, "invalid_wallet_name"),
        (RegistryError::DuplicateIdentity, "wallet_already_exists"),
        (RegistryError::Corrupt, "wallet_corrupt"),
        (RegistryError::UnsupportedVersion, "wallet_corrupt"),
        (RegistryError::InvalidNetwork, "internal_error"),
        (RegistryError::InvalidChecksum, "internal_error"),
        (RegistryError::DuplicateId, "internal_error"),
        (RegistryError::Io, "internal_error"),
    ];
    for (error, code) in registry_cases {
        assert_eq!(registry_api_error(error).code, code);
    }

    for error in [
        PolicyError::InvalidName,
        PolicyError::InvalidCosignerCount,
        PolicyError::UnsafeThreshold,
        PolicyError::DuplicateFingerprint,
        PolicyError::DuplicateXpub,
        PolicyError::InvalidDescriptor,
    ] {
        assert_eq!(policy_api_error(error).code, error.code());
    }

    for error in [
        HardwareError::InvalidArgument,
        HardwareError::Unavailable,
        HardwareError::TimedOut,
        HardwareError::OutputTooLarge,
        HardwareError::CommandFailed(Some(-12)),
        HardwareError::Io,
    ] {
        assert_eq!(hardware_api_error(error).code, error.code());
    }

    assert_eq!(
        secure_store_error(SecureStoreError::InvalidCredential).code,
        "invalid_credential"
    );
    assert_eq!(
        secure_store_error(SecureStoreError::Corrupt).code,
        "wallet_corrupt"
    );
    let unavailable = secure_store_error(SecureStoreError::Unavailable);
    assert_eq!(unavailable.code, "secure_storage_unavailable");
    assert!(unavailable.message.contains("application data"));

    let proposal_cases = [
        (
            crate::proposal::ProposalError::MalformedPsbt,
            "malformed_psbt",
            "The PSBT is malformed.",
        ),
        (
            crate::proposal::ProposalError::PsbtTooLarge,
            "psbt_too_large",
            "The PSBT exceeds Groot's size limit.",
        ),
        (
            crate::proposal::ProposalError::ProposalMismatch,
            "proposal_mismatch",
            "The PSBT does not match the transaction you reviewed. No signatures were changed.",
        ),
        (
            crate::proposal::ProposalError::UnknownSigner,
            "unknown_signer",
            "The PSBT contains a signature from an unknown signer. No signatures were changed.",
        ),
        (
            crate::proposal::ProposalError::UnsupportedSighash,
            "unsupported_sighash",
            "The PSBT uses an unsupported signature type. Groot accepts only SIGHASH_ALL. No signatures were changed.",
        ),
        (
            crate::proposal::ProposalError::InvalidSignature,
            "invalid_signature",
            "The PSBT contains an invalid signature. No signatures were changed.",
        ),
        (
            crate::proposal::ProposalError::PrematureFinalization,
            "premature_finalization",
            "The PSBT was finalized outside Groot. Import a partially signed PSBT instead.",
        ),
        (
            crate::proposal::ProposalError::NoInputs,
            "no_inputs",
            "The PSBT has no transaction inputs.",
        ),
        (
            crate::proposal::ProposalError::NoNewSignatures,
            "no_new_signatures",
            "This signer has already signed this proposal. No signatures were changed.",
        ),
        (
            crate::proposal::ProposalError::SignatureNotFound,
            "signature_not_found",
            "This signer has no complete signature in the current proposal. No signatures were changed.",
        ),
        (
            crate::proposal::ProposalError::MergeFailed,
            "psbt_merge_failed",
            "Groot could not safely merge the signed PSBT. No signatures were changed.",
        ),
    ];
    for (error, code, message) in proposal_cases {
        let translated = proposal_api_error(error);
        assert_eq!(translated.code, code);
        assert_eq!(translated.message, message);
        assert_ne!(translated.message, translated.code);
    }
}

#[test]
fn default_public_node_state_does_not_require_unsaved_rpc_credentials() {
    assert!(!saved_userpass_config_has_required_secret(false, false).unwrap());
    assert!(saved_userpass_config_has_required_secret(false, true).unwrap());
    assert!(saved_userpass_config_has_required_secret(true, true).unwrap());
    let missing = saved_userpass_config_has_required_secret(true, false).unwrap_err();
    assert_eq!(missing.code, "wallet_corrupt");
    assert!(missing
        .message
        .contains("Bitcoin Core credentials are missing"));
}

#[test]
fn transaction_builder_errors_preserve_actionable_api_codes() {
    assert_eq!(
        create_tx_api_error(CreateTxError::OutputBelowDustLimit(0)).code,
        "invalid_amount"
    );
    assert_eq!(
        create_tx_api_error(CreateTxError::NoUtxosSelected).code,
        "insufficient_funds"
    );
}

#[test]
fn descriptor_and_recovery_metadata_helpers_fail_closed() {
    assert_eq!(
        descriptor_checksum("wpkh(key)#12345678").unwrap(),
        "12345678"
    );
    assert_eq!(
        descriptor_checksum("wpkh(key)#short").unwrap_err().code,
        "internal_error"
    );
    assert_eq!(
        descriptor_checksum("wpkh(key)").unwrap_err().code,
        "internal_error"
    );

    let immediate = SpendingPath::new(2, ["a", "b"]);
    let delayed = TimedSpendingPath::new(144, 1, ["c"]);
    assert_eq!(
        recovery_policy_type(&RecoveryTemplate::Recovery {
            immediate,
            recovery: delayed.clone(),
        }),
        "recovery"
    );
    assert_eq!(
        recovery_policy_type(&RecoveryTemplate::Decaying {
            stages: vec![delayed.clone()],
        }),
        "decaying"
    );
    assert_eq!(
        recovery_policy_type(&RecoveryTemplate::Expanding {
            stages: vec![delayed],
        }),
        "expanding"
    );
}

#[test]
fn loaded_hardware_wallet_descriptors_must_match_receive_and_change_identity() {
    let external = "wpkh(key)#12345678";
    let internal_descriptor = "wpkh(change)#87654321";
    let profile = WalletProfile {
        id: Uuid::new_v4(),
        name: "Hardware wallet".to_owned(),
        network: "regtest".to_owned(),
        kind: WalletKind::WatchOnly,
        descriptor_checksum: "12345678".to_owned(),
        created_at: 1,
        backup_verified: true,
    };
    assert!(validate_loaded_descriptors(
        &profile,
        external,
        internal_descriptor,
        Some((external, internal_descriptor)),
    )
    .is_ok());

    let swapped_receive = validate_loaded_descriptors(
        &profile,
        "wpkh(other)#aaaaaaaa",
        internal_descriptor,
        Some((external, internal_descriptor)),
    )
    .unwrap_err();
    assert_eq!(swapped_receive.code, "wallet_corrupt");

    let swapped_change = validate_loaded_descriptors(
        &profile,
        external,
        "wpkh(attacker-change)#bbbbbbbb",
        Some((external, internal_descriptor)),
    )
    .unwrap_err();
    assert_eq!(swapped_change.code, "wallet_corrupt");
}

#[test]
fn cached_hwi_connection_identity_must_match_the_saved_signer() {
    let device = HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: Some("d34db33f".to_owned()),
        device_type: "trezor".to_owned(),
        model: "trezor_safe_3".to_owned(),
        path: "usb:1".to_owned(),
        code: None,
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: Vec::new(),
    };
    let identity = connected_hardware_identity(device.clone(), &["D34DB33F".to_owned()]).unwrap();
    assert_eq!(identity.device_type, "trezor");
    assert_eq!(identity.fingerprint, "d34db33f");

    let error = connected_hardware_identity(device, &["f00dbabe".to_owned()]).unwrap_err();
    assert_eq!(error.code, "unknown_signer");
}

#[test]
fn hwi_response_codes_become_safe_actionable_errors() {
    let cases = [
        (-3, "quit other wallet apps"),
        (-12, "quit other wallet apps"),
        (-14, "cancelled"),
        (-15, "busy"),
        (-8, "does not support"),
        (-9, "does not support"),
        (-1, "could not select"),
        (-2, "could not select"),
        (-4, "could not select"),
        (-7, "could not select"),
    ];
    for (code, expected) in cases {
        let error = missing_hwi_value(Some(code), "fallback");
        assert_eq!(error.code, "hardware_unavailable");
        assert!(error.message.contains(expected));
    }
    assert_eq!(missing_hwi_value(None, "fallback").message, "fallback");

    let coldcard_policy = missing_hardware_psbt(
        "coldcard",
        Some(-7),
        "The device did not return a signed PSBT.",
    );
    assert_eq!(coldcard_policy.code, "hardware_command_failed");
    assert!(coldcard_policy
        .message
        .contains("does not recognize this multisig wallet"));

    let bitbox = hardware_device_api_error(HardwareError::CommandFailed(Some(-12)), "bitbox02");
    assert_eq!(bitbox.code, "hardware_command_failed");
    assert!(bitbox.message.contains("connected and unlocked"));
    assert!(bitbox.message.contains("Quit BitBoxApp"));

    let unnamed_account =
        hardware_device_api_error(HardwareError::CommandFailed(Some(-9)), "bitbox02");
    assert!(unnamed_account.message.contains("account name"));
    assert!(unnamed_account.message.contains("address checks"));

    let cancelled = hardware_device_api_error(HardwareError::CommandFailed(Some(-14)), "bitbox02");
    assert!(cancelled.message.contains("cancelled"));

    let ledger_disconnected =
        hardware_device_api_error(HardwareError::CommandFailed(Some(-3)), "ledger");
    assert_eq!(
        ledger_disconnected.message,
        "Ledger disconnected. Reconnect it and try again."
    );
    assert!(!ledger_disconnected.message.contains("Trezor"));

    let ledger_not_ready =
        hardware_device_api_error(HardwareError::CommandFailed(Some(-12)), "ledger");
    assert!(ledger_not_ready.message.contains("wallet's Bitcoin app"));
    assert!(!ledger_not_ready.message.contains("wallet apps"));

    let ledger_policy =
        hardware_device_api_error(HardwareError::CommandFailed(Some(-13)), "ledger");
    assert!(ledger_policy
        .message
        .contains("register this wallet policy"));
    assert!(!ledger_policy.message.contains("Trezor"));

    let trezor_timeout = hardware_device_api_error(HardwareError::TimedOut, "trezor");
    assert_eq!(trezor_timeout.code, "hardware_timeout");
    assert!(trezor_timeout.message.contains("reconnect it"));
    assert!(trezor_timeout
        .message
        .contains("proposal and its signatures are unchanged"));

    let ledger = missing_hardware_xpub("ledger", "m/48'/1'/0'/2'", None, None, "fallback");
    assert_eq!(ledger.code, "hardware_unavailable");
    assert!(ledger.message.contains("approve the public-key export"));
    assert!(!ledger.message.contains("fallback"));

    let bitbox_xpub =
        missing_hardware_xpub("bitbox02", "m/48'/1'/0'/2'", Some(-13), None, "fallback");
    assert!(bitbox_xpub.message.contains("password again"));
    assert!(!bitbox_xpub.message.contains("m/48'"));

    let bitbox_pairing = missing_hardware_xpub(
        "bitbox02",
        "m/84'/1'/0'",
        Some(-3),
        Some(
            "Could not open client or get fingerprint information: Device not paired yet. Please pair using the BitBoxApp, then close the BitBoxApp and try again.",
        ),
        "fallback",
    );
    assert_eq!(bitbox_pairing.code, "hardware_pairing_required");
    assert!(bitbox_pairing
        .message
        .contains("Pair this BitBox in BitBoxApp"));
    assert!(!bitbox_pairing.message.contains("fingerprint"));

    let cancelled_xpub =
        missing_hardware_xpub("ledger", "m/84'/1'/0'", Some(-14), None, "fallback");
    assert!(cancelled_xpub.message.contains("cancelled"));

    let ledger_singlesig =
        missing_hardware_xpub("ledger", "m/84'/1'/0'", None, None, "sensitive fallback");
    assert!(ledger_singlesig.message.contains("BIP84 account key"));
    assert!(!ledger_singlesig.message.contains("approve"));
    assert!(!ledger_singlesig.message.contains("sensitive"));

    let ledger_device_failure = missing_hardware_xpub(
        "ledger",
        "m/84'/1'/0'",
        Some(-13),
        Some("Technical problem at /private/device/path"),
        "fallback",
    );
    assert!(ledger_device_failure.message.contains("Bitcoin Test"));
    assert!(!ledger_device_failure
        .message
        .contains("/private/device/path"));

    let ledger_command_failure = hardware_xpub_api_error(
        HardwareError::CommandFailed(Some(-13)),
        "ledger",
        "m/84'/1'/0'",
    );
    assert_eq!(ledger_command_failure.code, "hardware_command_failed");
    assert!(ledger_command_failure.message.contains("Bitcoin Test"));
    assert!(ledger_command_failure.message.contains("not Bitcoin"));

    let unsupported_safe_3 = missing_hardware_xpub(
        "trezor",
        "m/84'/1'/0'",
        Some(-13),
        Some("Could not open client: Unsupported Trezor model at /private/device/path"),
        "fallback",
    );
    assert!(unsupported_safe_3.message.contains("HWI 3.2.0"));
    assert!(!unsupported_safe_3.message.contains("/private/device/path"));

    let mainnet_ledger_failure = hardware_xpub_api_error(
        HardwareError::CommandFailed(Some(-13)),
        "ledger",
        "m/84'/0'/0'",
    );
    assert!(!mainnet_ledger_failure.message.contains("Bitcoin Test"));

    let locked_ledger = missing_hardware_fingerprint("ledger");
    assert_eq!(locked_ledger.code, "hardware_unavailable");
    assert!(locked_ledger.message.contains("Unlock Ledger"));
    assert!(locked_ledger.message.contains("Bitcoin Test—not Bitcoin"));
    assert!(!locked_ledger.message.contains("fingerprint"));

    for (device_type, expected) in [
        ("bitbox02", "Unlock BitBox"),
        ("jade", "enter your PIN on Jade"),
        ("coldcard", "enable USB communication"),
        ("trezor", "PIN-matrix"),
        ("unknown", "Unlock the hardware signer"),
    ] {
        let error = missing_hardware_fingerprint(device_type);
        assert_eq!(error.code, "hardware_unavailable");
        assert!(error.message.contains(expected));
        assert!(!error.message.contains("fingerprint"));
    }

    let wrong_signer = unknown_hardware_signer();
    assert_eq!(wrong_signer.code, "unknown_signer");
    assert_eq!(
        wrong_signer.message,
        "The connected device does not match any saved signer for this wallet."
    );
    assert!(!wrong_signer.message.contains("cosigner"));
    assert!(!wrong_signer.message.contains("policy"));
}

#[test]
fn not_ready_hardware_remains_visible_with_safe_device_specific_actions() {
    let unsupported_safe_3 = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "trezor".to_owned(),
        model: String::new(),
        path: "webusb:sensitive-path".to_owned(),
        code: Some(-13),
        error: Some(
            "Could not open client or get fingerprint information: Unsupported Trezor model"
                .to_owned(),
        ),
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(unsupported_safe_3.status, "not_ready");
    assert_eq!(unsupported_safe_3.action, "retry");
    assert!(unsupported_safe_3.message.contains("HWI 3.2.0"));
    assert!(!unsupported_safe_3.message.contains("webusb:sensitive-path"));

    let trezor = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "trezor".to_owned(),
        model: "trezor_1".to_owned(),
        path: "sensitive-usb-path".to_owned(),
        code: Some(-12),
        error: None,
        needs_pin_sent: true,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(trezor.status, "needs_pin");
    assert_eq!(trezor.action, "prompt_pin");
    assert!(trezor.fingerprint.is_none());
    assert!(!trezor.message.contains("sensitive-usb-path"));

    let locked_passphrase_trezor = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "trezor".to_owned(),
        model: "trezor_1".to_owned(),
        path: "sensitive-usb-path".to_owned(),
        code: Some(-12),
        error: None,
        needs_pin_sent: true,
        needs_passphrase_sent: true,
        warnings: vec![vec![
            "Passphrase enabled; this wallet uses an empty string".to_owned()
        ]],
    });
    assert_eq!(locked_passphrase_trezor.status, "needs_pin");
    assert_eq!(locked_passphrase_trezor.action, "prompt_pin");
    assert!(locked_passphrase_trezor.fingerprint.is_none());

    let bitbox = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "bitbox02".to_owned(),
        model: "bitbox02_multi".to_owned(),
        path: "sensitive-usb-path".to_owned(),
        code: Some(-12),
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(bitbox.status, "detected");
    assert_eq!(bitbox.action, "import");
    assert!(bitbox.message.contains("password again"));

    let locked_nova = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "bitbox02".to_owned(),
        model: "bitbox02_nova_multi".to_owned(),
        path: "sensitive-nova-path".to_owned(),
        code: Some(-12),
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(locked_nova.label, "bitbox02_nova_multi");
    assert_eq!(locked_nova.model, "bitbox02");
    assert_eq!(locked_nova.status, "detected");
    assert_eq!(locked_nova.action, "import");
    assert!(locked_nova.message.contains("password again"));
    assert!(!locked_nova.message.contains("sensitive-nova-path"));

    let ready_nova = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: Some("deadbeef".to_owned()),
        device_type: "bitbox02".to_owned(),
        model: "bitbox02_nova_multi".to_owned(),
        path: "sensitive-nova-path".to_owned(),
        code: None,
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(ready_nova.label, "bitbox02_nova_multi");
    assert_eq!(ready_nova.status, "ready");
    assert_eq!(ready_nova.action, "import");

    let jade = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "jade".to_owned(),
        model: "jade".to_owned(),
        path: "serial-path".to_owned(),
        code: Some(-12),
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(jade.status, "needs_device_unlock");
    assert_eq!(jade.action, "unlock");
    assert!(jade.message.contains("enter your PIN on Jade"));

    let ledger = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: Some("f00dbabe".to_owned()),
        device_type: "ledger".to_owned(),
        model: "ledger_nano_s_plus".to_owned(),
        path: "ledger-path".to_owned(),
        code: None,
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(ledger.status, "detected");
    assert_eq!(ledger.action, "import");
    assert!(ledger.message.contains("Bitcoin Test"));

    for (device_type, expected, action) in [
        ("ledger", "Bitcoin Test", "unlock"),
        ("coldcard", "USB communication", "retry"),
    ] {
        let device = hardware_device_dto(HwiDevice {
            capability: "opaque-device".to_owned(),
            fingerprint: None,
            device_type: device_type.to_owned(),
            model: device_type.to_owned(),
            path: "device-path".to_owned(),
            code: Some(-12),
            error: None,
            needs_pin_sent: false,
            needs_passphrase_sent: false,
            warnings: vec![],
        });
        assert_eq!(device.status, "needs_device_unlock");
        assert_eq!(device.action, action);
        assert!(device.message.contains(expected));
    }

    let keepkey = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: None,
        device_type: "keepkey".to_owned(),
        model: "keepkey".to_owned(),
        path: "device-path".to_owned(),
        code: Some(-12),
        error: None,
        needs_pin_sent: true,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(keepkey.status, "needs_pin");
    assert_eq!(keepkey.action, "prompt_pin");

    let ready = hardware_device_dto(HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: Some("f00dbabe".to_owned()),
        device_type: "coldcard".to_owned(),
        model: "coldcard".to_owned(),
        path: "sensitive-usb-path".to_owned(),
        code: None,
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![],
    });
    assert_eq!(ready.status, "ready");
    assert_eq!(ready.action, "import");
}

#[test]
fn trezor_passphrase_warning_requires_explicit_standard_wallet_selection() {
    let hwi_device = HwiDevice {
        capability: "opaque-device".to_owned(),
        fingerprint: Some("emptywallet".to_owned()),
        device_type: "trezor".to_owned(),
        model: "trezor_1".to_owned(),
        path: "usb-path".to_owned(),
        code: None,
        error: None,
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        warnings: vec![vec![
            "Passphrase enabled; using default passphrase of the empty string (\"\")".to_owned(),
        ]],
    };
    assert_eq!(
        require_explicit_standard_wallet_selection(&hwi_device, false)
            .unwrap_err()
            .code,
        "hardware_wallet_selection_required"
    );
    require_explicit_standard_wallet_selection(&hwi_device, true).unwrap();
    let device = hardware_device_dto(hwi_device);
    assert_eq!(device.status, "needs_passphrase");
    assert_eq!(device.action, "confirm_empty_passphrase");
    assert!(device.message.contains("standard wallet"));
}

#[test]
fn native_boundary_rejects_browser_only_virtual_cosigners() {
    let cosigner = CosignerInput {
        id: "virtual-1".to_owned(),
        label: "Browser fixture".to_owned(),
        fingerprint: "00000000".to_owned(),
        xpub: "fixture".to_owned(),
        derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
        source: CosignerSource::Virtual,
        device_type: None,
    };

    let error = reject_virtual_cosigners(&[cosigner]).expect_err("must reject fixture key");
    assert_eq!(error.code, "hardware_unavailable");
}

#[test]
fn locked_regtest_reset_requires_exact_confirmation() {
    assert!(validate_regtest_reset_confirmation("RESET REGTEST").is_ok());
    for value in ["", "reset regtest", "RESET", " RESET REGTEST"] {
        assert_eq!(
            validate_regtest_reset_confirmation(value).unwrap_err().code,
            "confirmation_mismatch"
        );
    }
}

#[test]
fn pending_mnemonic_session_has_a_bounded_lifetime() {
    assert!(onboarding_session_is_fresh(100, 100));
    assert!(onboarding_session_is_fresh(
        100,
        100 + ONBOARDING_SESSION_SECONDS
    ));
    assert!(!onboarding_session_is_fresh(
        100,
        101 + ONBOARDING_SESSION_SECONDS
    ));
    assert!(onboarding_session_is_fresh(200, 100));
}

#[test]
fn software_wallet_generation_always_creates_a_valid_24_word_mnemonic() {
    let mnemonic = generate_software_mnemonic(None).expect("OS-backed mnemonic generation");
    assert_eq!(mnemonic.word_count(), 24);
    let encoded = Zeroizing::new(mnemonic.to_string());
    let reparsed = Mnemonic::parse(encoded.as_str()).expect("generated words remain valid");
    assert_eq!(reparsed.word_count(), 24);
}

#[test]
fn software_wallet_generation_requires_exactly_256_bits_of_entropy() {
    let mut requested = 0;
    let mnemonic = generate_software_mnemonic_with(
        |entropy| {
            requested = entropy.len();
            entropy.copy_from_slice(&[0x5a; 32]);
            Ok(())
        },
        None,
    )
    .expect("valid 256-bit BIP39 entropy");
    assert_eq!(requested, 32);
    assert_eq!(mnemonic.word_count(), 24);
}

#[test]
fn software_wallet_generation_fails_closed_when_os_entropy_is_unavailable() {
    let error = generate_software_mnemonic_with(
        |entropy| {
            entropy[..8].copy_from_slice(&[0xa5; 8]);
            Err(api_error(
                "entropy_unavailable",
                "Secure operating-system randomness is unavailable.",
            ))
        },
        Some(&[0x33; 32]),
    )
    .expect_err("partial entropy must never produce a mnemonic");
    assert_eq!(error.code, "entropy_unavailable");
}

#[test]
fn supplemental_entropy_validation_is_bounded_and_source_specific() {
    for (source, outcomes) in [
        ("coin", "H".repeat(MIN_SUPPLEMENTAL_COIN_FLIPS)),
        ("coin", "T".repeat(MAX_SUPPLEMENTAL_COIN_FLIPS)),
        ("dice", "1".repeat(MIN_SUPPLEMENTAL_DICE_ROLLS)),
        ("dice", "6".repeat(MAX_SUPPLEMENTAL_DICE_ROLLS)),
    ] {
        assert!(supplemental_entropy_digest(SupplementalEntropyDto {
            source: source.to_owned(),
            outcomes,
        })
        .is_ok());
    }

    for (source, outcomes) in [
        ("coin", "H".repeat(MIN_SUPPLEMENTAL_COIN_FLIPS - 1)),
        ("coin", "H".repeat(MAX_SUPPLEMENTAL_COIN_FLIPS + 1)),
        (
            "coin",
            format!("{}X", "H".repeat(MIN_SUPPLEMENTAL_COIN_FLIPS - 1)),
        ),
        ("dice", "1".repeat(MIN_SUPPLEMENTAL_DICE_ROLLS - 1)),
        ("dice", "1".repeat(MAX_SUPPLEMENTAL_DICE_ROLLS + 1)),
        (
            "dice",
            format!("{}0", "1".repeat(MIN_SUPPLEMENTAL_DICE_ROLLS - 1)),
        ),
        ("cursor", "1".repeat(MIN_SUPPLEMENTAL_DICE_ROLLS)),
    ] {
        let error = supplemental_entropy_digest(SupplementalEntropyDto {
            source: source.to_owned(),
            outcomes,
        })
        .expect_err("invalid supplemental transcript must fail closed");
        assert_eq!(error.code, "invalid_supplemental_entropy");
    }
}

#[test]
fn supplemental_entropy_is_additive_and_domain_separated() {
    let coin_digest = supplemental_entropy_digest(SupplementalEntropyDto {
        source: "coin".to_owned(),
        outcomes: "HT".repeat(MIN_SUPPLEMENTAL_COIN_FLIPS / 2),
    })
    .expect("valid coin transcript");
    let dice_digest = supplemental_entropy_digest(SupplementalEntropyDto {
        source: "dice".to_owned(),
        outcomes: "123456".repeat(9),
    })
    .expect("valid dice transcript");
    let fill = |entropy: &mut [u8]| {
        entropy.copy_from_slice(&[0x42; 32]);
        Ok(())
    };
    let without = generate_software_mnemonic_with(fill, None).expect("OS-only mnemonic");
    let with_coin = generate_software_mnemonic_with(fill, Some(&coin_digest))
        .expect("coin-supplemented mnemonic");
    let with_dice = generate_software_mnemonic_with(fill, Some(&dice_digest))
        .expect("dice-supplemented mnemonic");
    assert_ne!(without, with_coin);
    assert_ne!(without, with_dice);
    assert_ne!(with_coin, with_dice);
}

#[test]
fn mnemonic_encryption_rejects_the_wrong_credential() {
    let mnemonic = Mnemonic::parse(WORDS).expect("valid public test mnemonic");
    let secret = encrypt_mnemonic(&mnemonic, "correct horse").expect("encrypt");
    let error = decrypt_encrypted_mnemonic(secret, "wrong horse").expect_err("must reject");
    assert_eq!(error.code, "invalid_credential");
}

#[test]
fn persisted_descriptors_are_watch_only() {
    let mnemonic = Mnemonic::parse(WORDS).expect("valid public test mnemonic");
    let (external, internal_template) =
        watch_templates(&mnemonic, "public-regtest-pin").expect("templates");
    let wallet = Wallet::create(external, internal_template)
        .network(NETWORK)
        .create_wallet_no_persist()
        .expect("wallet");
    for keychain in [KeychainKind::External, KeychainKind::Internal] {
        let descriptor = wallet.public_descriptor(keychain).to_string();
        assert!(descriptor.contains("tpub"));
        assert!(!descriptor.contains("prv"));
    }
}

#[test]
fn software_descriptor_identity_is_stable_and_bound_to_the_wallet_passphrase() {
    let mnemonic = Mnemonic::parse(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    )
    .unwrap();
    let first = software_wallet_descriptors(&mnemonic, "wallet passphrase").unwrap();
    let repeated = software_wallet_descriptors(&mnemonic, "wallet passphrase").unwrap();
    let alternate = software_wallet_descriptors(&mnemonic, "different passphrase").unwrap();

    assert_eq!(first, repeated);
    assert_ne!(first, alternate);
    assert!(!first.0.contains("prv"));
    assert!(!first.1.contains("prv"));
}

#[test]
fn labels_are_mandatory_and_bounded() {
    assert_eq!(normalize_label("  Invoice 42  ").unwrap(), "Invoice 42");
    assert_eq!(normalize_label("Café 🌱").unwrap(), "Café 🌱");
    assert_eq!(normalize_label(&"🌱".repeat(48)).unwrap(), "🌱".repeat(48));
    assert_eq!(normalize_label("   ").unwrap_err().code, "invalid_label");
    assert_eq!(
        normalize_label(&"x".repeat(49)).unwrap_err().code,
        "invalid_label"
    );
    assert_eq!(
        normalize_label(&"🌱".repeat(49)).unwrap_err().code,
        "invalid_label"
    );
}

#[test]
fn explicit_label_drafts_are_limited_to_five() {
    let five = (1..=5).map(|index| format!("Label {index}")).collect();
    assert_eq!(normalize_labels(five).unwrap().len(), 5);
    let six = (1..=6).map(|index| format!("Label {index}")).collect();
    let error = normalize_labels(six).unwrap_err();
    assert_eq!(error.code, "invalid_label");
    assert!(error.message.contains("between 1 and 5"));
}

#[test]
fn manual_selection_rejects_empty_malformed_duplicate_and_frozen_outpoints() {
    let outpoint = format!("{}:0", "00".repeat(32));
    let parsed = OutPoint::from_str(&outpoint).unwrap();
    assert_eq!(
        validate_manual_outpoints(&[], &[]).unwrap_err().code,
        "invalid_coin"
    );
    assert_eq!(
        validate_manual_outpoints(&["not-an-outpoint".to_owned()], &[])
            .unwrap_err()
            .code,
        "invalid_coin"
    );
    assert_eq!(
        validate_manual_outpoints(&[outpoint.clone(), outpoint.clone()], &[])
            .unwrap_err()
            .code,
        "invalid_coin"
    );
    assert_eq!(
        validate_manual_outpoints(&[outpoint], &[parsed])
            .unwrap_err()
            .code,
        "coin_unavailable"
    );
}

fn descriptor_backup() -> MultisigBackupDto {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
    let cosigners = (1_u8..=4)
        .map(|index| {
            let master = Xpriv::new_master(NetworkKind::Test, &[index; 32]).unwrap();
            let account = master.derive_priv(&secp, &path).unwrap();
            CosignerInput {
                id: format!("key-{index}"),
                label: format!("Key {index}"),
                fingerprint: master.fingerprint(&secp).to_string(),
                xpub: Xpub::from_priv(&secp, &account).to_string(),
                derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
                source: CosignerSource::Manual,
                device_type: None,
            }
        })
        .collect::<Vec<_>>();
    let preview = PolicyInput {
        name: "Recovery test".to_owned(),
        threshold: 2,
        cosigners,
    }
    .preview()
    .unwrap();
    MultisigBackupDto {
        version: 1,
        network: "regtest".to_owned(),
        wallet: MultisigWalletDto {
            kind: "multisig".to_owned(),
            name: preview.name,
            threshold: preview.threshold,
            cosigners: preview.cosigners,
            external_descriptor: preview.external_descriptor,
            internal_descriptor: preview.internal_descriptor,
            created_at: "1".to_owned(),
            policy_type: "standard".to_owned(),
            recovery_template: None,
            spending_paths: Vec::new(),
        },
    }
}

#[test]
fn delayed_policies_fail_closed_at_the_hwi_boundary() {
    let mut standard = descriptor_backup().wallet;
    assert!(require_hwi_supported_multisig_policy(&standard).is_ok());

    standard.policy_type = "recovery".to_owned();
    let error = require_hwi_supported_multisig_policy(&standard).unwrap_err();
    assert_eq!(error.code, "hardware_policy_unsupported");

    let mut usb = standard.cosigners.clone();
    usb[0].source = CosignerSource::Usb;
    assert_eq!(
        reject_usb_cosigners_for_delayed_policy(&usb)
            .unwrap_err()
            .code,
        "hardware_policy_unsupported"
    );
    let offline = standard
        .cosigners
        .iter()
        .cloned()
        .map(|mut signer| {
            signer.source = CosignerSource::File;
            signer
        })
        .collect::<Vec<_>>();
    assert!(reject_usb_cosigners_for_delayed_policy(&offline).is_ok());
}

#[test]
fn proposal_spend_path_is_additive_and_limits_eligible_signers() {
    let mut wallet = descriptor_backup().wallet;
    let template = RecoveryTemplate::Recovery {
        immediate: SpendingPath::new(2, ["key-1", "key-2", "key-3"]),
        recovery: TimedSpendingPath::new(4_320, 1, ["key-4"]),
    };
    let analysis = analyze_template(&template, &wallet.cosigners).unwrap();
    wallet.external_descriptor = analysis.external_descriptor;
    wallet.internal_descriptor = analysis.internal_descriptor;
    wallet.policy_type = "recovery".to_owned();
    wallet.spending_paths = analysis.paths;
    wallet.recovery_template = Some(template);

    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    db.execute(
        "INSERT INTO groot_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy) VALUES ('legacy','bcrt1qtest','Legacy',1,1,1,'psbt','collecting',1,'manual')",
        [],
    )
    .unwrap();
    let primary = proposal_signing_context(&db, &wallet, "legacy").unwrap();
    assert_eq!(primary.spend_path, ProposalSpendPath::Primary);
    assert_eq!(primary.required, 2);
    assert_eq!(primary.fingerprint_strings.len(), 3);

    db.execute(
        "INSERT INTO groot_proposals (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, selection_strategy) VALUES ('delayed','bcrt1qtest','Delayed',1,1,1,'psbt','collecting',1,'recovery_key')",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO groot_proposal_spend_paths (proposal_id, spend_path) VALUES ('delayed','delayed')",
        [],
    )
    .unwrap();
    let delayed = proposal_signing_context(&db, &wallet, "delayed").unwrap();
    assert_eq!(delayed.spend_path, ProposalSpendPath::Delayed);
    assert_eq!(delayed.required, 1);
    assert_eq!(
        delayed.fingerprint_strings,
        vec![wallet
            .cosigners
            .iter()
            .find(|signer| signer.id == "key-4")
            .unwrap()
            .fingerprint
            .clone()]
    );

    db.execute(
        "UPDATE groot_proposal_spend_paths SET spend_path='hostile' WHERE proposal_id='delayed'",
        [],
    )
    .unwrap_err();
}

#[test]
fn legacy_hardware_profiles_are_explicitly_unsupported_without_current_lock_files() {
    let directory = std::env::temp_dir().join(format!("groot-legacy-status-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    let mut profile = WalletProfile {
        id: Uuid::new_v4(),
        name: "Legacy".to_owned(),
        network: NETWORK_NAME.to_owned(),
        kind: WalletKind::WatchOnly,
        descriptor_checksum: "abcd1234".to_owned(),
        created_at: 1,
        backup_verified: true,
    };
    assert!(!profile_compatibility_for(&profile, &directory).supported);

    fs::write(directory.join("wallet.json"), b"{}").unwrap();
    fs::write(directory.join("secret.json"), b"{}").unwrap();
    assert!(profile_compatibility_for(&profile, &directory).supported);

    fs::remove_file(directory.join("wallet.json")).unwrap();
    profile.kind = WalletKind::SingleKey;
    assert!(profile_compatibility_for(&profile, &directory).supported);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn hardware_policy_evidence_is_bound_to_the_initiating_wallet_and_policy() {
    let metadata = descriptor_backup().wallet;
    let wallet_id = Uuid::new_v4();
    ensure_hardware_verification_context(
        wallet_id,
        wallet_id,
        &metadata.external_descriptor,
        &metadata.internal_descriptor,
        &metadata,
    )
    .unwrap();

    assert_eq!(
        ensure_hardware_verification_context(
            wallet_id,
            Uuid::new_v4(),
            &metadata.external_descriptor,
            &metadata.internal_descriptor,
            &metadata,
        )
        .unwrap_err()
        .code,
        "wallet_selection_changed"
    );

    let mut changed = metadata.clone();
    changed.internal_descriptor.push('x');
    assert_eq!(
        ensure_hardware_verification_context(
            wallet_id,
            wallet_id,
            &metadata.external_descriptor,
            &metadata.internal_descriptor,
            &changed,
        )
        .unwrap_err()
        .code,
        "wallet_policy_changed"
    );
}

#[test]
fn multisig_hardware_psbt_includes_policy_xpub_origins_without_rewriting_legacy_review() {
    use bdk_wallet::bitcoin::{absolute::LockTime, transaction::Version};

    let metadata = descriptor_backup().wallet;
    let transaction = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: Vec::new(),
        output: Vec::new(),
    };
    let mut psbt = Psbt::from_unsigned_tx(transaction).unwrap();
    let reviewed_global_xpubs = psbt.xpub.clone();

    add_multisig_global_xpubs(&mut psbt, &metadata).unwrap();
    assert_eq!(psbt.xpub.len(), metadata.cosigners.len());
    for cosigner in &metadata.cosigners {
        let xpub = Xpub::from_str(&cosigner.xpub).unwrap();
        let expected = (
            Fingerprint::from_str(&cosigner.fingerprint).unwrap(),
            DerivationPath::from_str(&cosigner.derivation_path).unwrap(),
        );
        assert_eq!(psbt.xpub.get(&xpub), Some(&expected));
    }

    psbt.xpub = reviewed_global_xpubs;
    assert!(psbt.xpub.is_empty());
}

#[test]
fn multisig_hardware_psbt_rejects_conflicting_global_xpub_origin() {
    use bdk_wallet::bitcoin::{absolute::LockTime, transaction::Version};

    let metadata = descriptor_backup().wallet;
    let cosigner = &metadata.cosigners[0];
    let xpub = Xpub::from_str(&cosigner.xpub).unwrap();
    let path = DerivationPath::from_str(&cosigner.derivation_path).unwrap();
    let transaction = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: Vec::new(),
        output: Vec::new(),
    };
    let mut psbt = Psbt::from_unsigned_tx(transaction).unwrap();
    psbt.xpub
        .insert(xpub, (Fingerprint::from_str("ffffffff").unwrap(), path));

    let error = add_multisig_global_xpubs(&mut psbt, &metadata).unwrap_err();
    assert_eq!(error.code, "proposal_mismatch");
}

#[test]
fn descriptor_backup_round_trips_and_reconstructs_a_stable_address() {
    let backup = descriptor_backup();
    let encoded = serde_json::to_string(&backup).unwrap();
    let validated = validate_multisig_backup(&encoded).unwrap();
    assert_eq!(
        first_multisig_address(&validated.wallet).unwrap(),
        first_multisig_address(&backup.wallet).unwrap()
    );
}

#[test]
fn recovery_descriptor_backup_recompiles_the_persisted_template() {
    use crate::recovery::{SpendingPath, TimedSpendingPath};

    let mut backup = descriptor_backup();
    let ids = backup
        .wallet
        .cosigners
        .iter()
        .map(|key| key.id.clone())
        .collect::<Vec<_>>();
    let template = RecoveryTemplate::Recovery {
        immediate: SpendingPath::new(2, ids[..3].to_vec()),
        recovery: TimedSpendingPath::new(4_320, 1, [ids[3].clone()]),
    };
    let analysis = analyze_template(&template, &backup.wallet.cosigners).unwrap();
    backup.wallet.external_descriptor = analysis.external_descriptor;
    backup.wallet.internal_descriptor = analysis.internal_descriptor;
    backup.wallet.policy_type = "recovery".to_owned();
    backup.wallet.recovery_template = Some(template);
    backup.wallet.spending_paths = analysis.paths;

    let validated = validate_multisig_backup(&serde_json::to_string(&backup).unwrap()).unwrap();
    assert_eq!(validated.wallet.policy_type, "recovery");
    assert_eq!(validated.wallet.spending_paths.len(), 2);
    assert_eq!(
        first_multisig_address(&validated.wallet).unwrap(),
        first_multisig_address(&backup.wallet).unwrap()
    );
}

#[test]
fn inheritance_descriptor_backup_recompiles_the_persisted_template() {
    use crate::recovery::{SpendingPath, TimedSpendingPath};

    let mut backup = descriptor_backup();
    let ids = backup
        .wallet
        .cosigners
        .iter()
        .map(|key| key.id.clone())
        .collect::<Vec<_>>();
    let template = RecoveryTemplate::Recovery {
        immediate: SpendingPath::new(2, ids[..3].to_vec()),
        recovery: TimedSpendingPath::new(52_560, 1, [ids[3].clone()]),
    };
    let analysis = analyze_template(&template, &backup.wallet.cosigners).unwrap();
    backup.wallet.external_descriptor = analysis.external_descriptor;
    backup.wallet.internal_descriptor = analysis.internal_descriptor;
    backup.wallet.threshold = analysis.paths[0].threshold;
    backup.wallet.policy_type = "inheritance".to_owned();
    backup.wallet.recovery_template = Some(template);
    backup.wallet.spending_paths = analysis.paths;

    let validated = validate_multisig_backup(&serde_json::to_string(&backup).unwrap()).unwrap();
    assert_eq!(validated.wallet.policy_type, "inheritance");
    assert_eq!(
        validated.wallet.spending_paths[1].available_after_blocks,
        52_560
    );
    assert_eq!(
        first_multisig_address(&validated.wallet).unwrap(),
        first_multisig_address(&backup.wallet).unwrap()
    );
}

#[test]
fn descriptor_backup_rejects_oversize_network_and_policy_tampering() {
    assert_eq!(
        validate_multisig_backup(&"x".repeat(256 * 1024 + 1))
            .unwrap_err()
            .code,
        "backup_too_large"
    );
    let mut wrong_network = descriptor_backup();
    wrong_network.network = "signet".to_owned();
    assert_eq!(
        validate_multisig_backup(&serde_json::to_string(&wrong_network).unwrap())
            .unwrap_err()
            .code,
        "invalid_backup"
    );
    let mut tampered = descriptor_backup();
    tampered.wallet.threshold = 3;
    assert_eq!(
        validate_multisig_backup(&serde_json::to_string(&tampered).unwrap())
            .unwrap_err()
            .code,
        "backup_mismatch"
    );
    assert_eq!(
        validate_multisig_backup("not json").unwrap_err().code,
        "invalid_backup"
    );
}

#[test]
fn private_json_is_atomic_owner_only_and_bounded() {
    let dir = std::env::temp_dir().join(format!("groot-secret-test-{}", Uuid::new_v4()));
    let path = dir.join("secret.json");
    let secret = EncryptedSecret {
        version: 1,
        salt: "salt".into(),
        nonce: "nonce".into(),
        ciphertext: "ciphertext".into(),
    };
    write_private_json(&path, &secret).unwrap();
    let decoded: EncryptedSecret =
        serde_json::from_str(&read_private_text(&path).unwrap()).unwrap();
    assert_eq!(decoded.version, 1);
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    fs::write(&path, vec![b'x'; MAX_PRIVATE_JSON_BYTES as usize + 1]).unwrap();
    assert_eq!(read_private_text(&path).unwrap_err().code, "internal_error");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn wallet_database_is_owner_only_and_uses_defensive_settings() {
    let dir = std::env::temp_dir().join(format!("groot-db-test-{}", Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("wallet.sqlite");
    let db = open_wallet_database(&path).unwrap();
    assert!(db.db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE).unwrap());
    assert!(db.db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_FKEY).unwrap());
    let trusted: bool = db
        .query_row("PRAGMA trusted_schema", [], |row| row.get(0))
        .unwrap();
    assert!(!trusted);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    drop(db);
    fs::remove_dir_all(dir).unwrap();
}

#[cfg(unix)]
#[test]
fn wallet_database_rejects_symlink_storage() {
    use std::os::unix::fs::symlink;

    let dir = std::env::temp_dir().join(format!("groot-db-link-{}", Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let target = dir.join("target.sqlite");
    Connection::open(&target).unwrap();
    let link = dir.join("wallet.sqlite");
    symlink(&target, &link).unwrap();
    assert_eq!(
        open_wallet_database(&link).unwrap_err().code,
        "internal_error"
    );
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn regtest_app_data_override_is_limited_to_named_temporary_directories() {
    #[cfg(unix)]
    let allowed = PathBuf::from("/tmp").join(format!("groot-regtest-{}", Uuid::new_v4()));
    #[cfg(not(unix))]
    let allowed = std::env::temp_dir().join(format!("groot-regtest-{}", Uuid::new_v4()));
    assert_eq!(
        validate_regtest_app_data_override(allowed.clone()).unwrap(),
        allowed
    );
    assert_eq!(
        validate_regtest_app_data_override(allowed.with_file_name("unscoped-wallet-data"))
            .unwrap_err()
            .code,
        "internal_error"
    );
    assert_eq!(
        validate_regtest_app_data_override(PathBuf::from("groot-regtest-relative"))
            .unwrap_err()
            .code,
        "internal_error"
    );
}

#[test]
fn default_regtest_directory_is_independent_of_process_working_directory() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    assert_eq!(
        default_regtest_dir().unwrap(),
        manifest_dir.parent().unwrap().join(".regtest")
    );
}

#[cfg(unix)]
#[test]
fn regtest_app_data_override_rejects_symlinks() {
    use std::os::unix::fs::symlink;

    let target = std::env::temp_dir().join(format!("groot-target-{}", Uuid::new_v4()));
    let link = std::env::temp_dir().join(format!("groot-regtest-{}", Uuid::new_v4()));
    fs::create_dir(&target).unwrap();
    symlink(&target, &link).unwrap();
    assert_eq!(
        validate_regtest_app_data_override(link.clone())
            .unwrap_err()
            .code,
        "internal_error"
    );
    fs::remove_file(link).unwrap();
    fs::remove_dir(target).unwrap();
}

#[test]
fn frozen_coin_schema_persists_and_corrupt_rows_fail_closed() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let outpoint = format!("{}:0", "01".repeat(32));
    db.execute(
        "INSERT INTO groot_frozen_coins (outpoint, frozen_at) VALUES (?1, ?2)",
        params![outpoint, 1_u64],
    )
    .unwrap();
    let stored: String = db
        .query_row("SELECT outpoint FROM groot_frozen_coins", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert!(OutPoint::from_str(&stored).is_ok());
    db.execute("UPDATE groot_frozen_coins SET outpoint = 'corrupt'", [])
        .unwrap();
    assert_eq!(frozen_outpoints(&db).unwrap_err().code, "internal_error");
}

#[test]
fn persisted_checkpoints_are_bounded_without_dropping_transaction_anchors() {
    let mut db = Connection::open_in_memory().unwrap();
    db.execute_batch(
        "CREATE TABLE bdk_blocks (
            block_height INTEGER PRIMARY KEY NOT NULL,
            block_hash TEXT NOT NULL
        ) STRICT;
        CREATE TABLE bdk_anchors (
            block_height INTEGER NOT NULL
        ) STRICT;",
    )
    .unwrap();
    let transaction = db.transaction().unwrap();
    {
        let mut insert = transaction
            .prepare("INSERT INTO bdk_blocks(block_height, block_hash) VALUES(?1, ?2)")
            .unwrap();
        for height in 0_u32..5_000 {
            insert
                .execute(params![height, format!("hash-{height}")])
                .unwrap();
        }
    }
    transaction
        .execute("INSERT INTO bdk_anchors(block_height) VALUES(1234)", [])
        .unwrap();
    transaction.commit().unwrap();

    compact_persisted_checkpoints(&mut db).unwrap();

    let retained = db
        .prepare("SELECT block_height FROM bdk_blocks ORDER BY block_height")
        .unwrap()
        .query_map([], |row| row.get::<_, u32>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert!(retained.len() <= RECENT_CHECKPOINT_WINDOW as usize + 3);
    assert!(retained.contains(&0));
    assert!(retained.contains(&1234));
    assert!(retained.contains(&PERIODIC_CHECKPOINT_INTERVAL));
    assert!(retained.contains(&4_999));
    assert!(!retained.contains(&1));
    assert_eq!(
        retained.iter().filter(|height| **height >= 2_984).count(),
        RECENT_CHECKPOINT_WINDOW as usize
    );
}

#[test]
fn synced_snapshots_enqueue_received_and_first_confirmation_events_once() {
    let mut db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let transaction = |id: &str, direction: &str, confirmations: u32| TransactionDto {
        id: id.repeat(64),
        kind: "payment".to_owned(),
        direction: direction.to_owned(),
        amount: 42,
        fee: None,
        status: if confirmations > 0 {
            "confirmed"
        } else {
            "pending"
        }
        .to_owned(),
        confirmations,
        date: "1".to_owned(),
        address: Some("bcrt1qnotificationfixture".to_owned()),
        label: "Test deposit".to_owned(),
        block: (confirmations > 0).then_some(1),
        replaced_by: None,
        replaces: None,
        input_count: Some(1),
        output_count: Some(1),
        fee_rate: None,
        wallet_input_amount: None,
        wallet_output_amount: Some(42),
        locktime: Some(0),
        rbf: Some(false),
        intent_label: None,
        provenance: ProvenanceSummaryDto::unknown("received"),
    };
    let mut snapshot = WalletSnapshotDto {
        network: "regtest",
        balance: BalanceDto {
            confirmed: 84,
            pending: 42,
            trusted_pending: 42,
            total: 126,
        },
        transactions: vec![
            transaction("a", "received", 0),
            transaction("b", "received", 1),
            transaction("c", "sent", 1),
        ],
        utxos: vec![],
        receive_addresses: vec![],
        label_suggestions: vec![],
        synced_at: Some("1".to_owned()),
        chain_tip: ChainTipDto {
            height: 1,
            observed_at: Some("1".to_owned()),
            status: "stale",
        },
    };

    enqueue_snapshot_notifications(&db, &snapshot).unwrap();
    assert!(notifications::pending(&db).unwrap().is_empty());

    snapshot.transactions[0].confirmations = 1;
    snapshot.transactions.push(transaction("d", "received", 0));
    enqueue_snapshot_notifications(&db, &snapshot).unwrap();
    enqueue_snapshot_notifications(&db, &snapshot).unwrap();
    let events = notifications::pending(&db).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event.event, WalletNotification::PaymentReceived { .. }))
            .count(),
        1
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event.event, WalletNotification::FirstConfirmation { .. }))
            .count(),
        1
    );

    let ids = events
        .iter()
        .map(|event| event.id.clone())
        .collect::<Vec<_>>();
    notifications::acknowledge(&mut db, &ids).unwrap();
    snapshot.transactions[0].confirmations = 0;
    snapshot.transactions[0].status = "pending".to_owned();
    enqueue_snapshot_notifications(&db, &snapshot).unwrap();
    assert!(
        notifications::pending(&db).unwrap().is_empty(),
        "a reorg retains history without creating a new receipt notification"
    );
    snapshot.transactions[0].confirmations = 1;
    snapshot.transactions[0].status = "confirmed".to_owned();
    enqueue_snapshot_notifications(&db, &snapshot).unwrap();
    assert!(
        notifications::pending(&db).unwrap().is_empty(),
        "re-anchoring a previously confirmed transaction does not duplicate its confirmation"
    );
    assert_eq!(
        snapshot
            .transactions
            .iter()
            .filter(|tx| tx.id == "a".repeat(64))
            .count(),
        1
    );
}

#[test]
fn compact_filter_update_and_app_metadata_roll_back_at_every_commit_stage() {
    let directory =
        std::env::temp_dir().join(format!("groot-compact-filter-atomic-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    let database = directory.join("wallet.sqlite");
    let mut db = Connection::open(&database).unwrap();
    init_app_schema(&db).unwrap();
    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let (external, internal) = watch_templates(&mnemonic, "atomic compact filters").unwrap();
    let wallet = Wallet::create(external, internal)
        .network(NETWORK)
        .create_wallet(&mut db)
        .unwrap();
    let original_tip = wallet.latest_checkpoint();
    let next_tip = original_tip
        .clone()
        .push(BlockId {
            height: 1,
            hash: BlockHash::from_byte_array([42_u8; 32]),
        })
        .unwrap();
    let update = Update {
        chain: Some(next_tip),
        ..Update::default()
    };
    drop(wallet);

    for failed_stage in [
        CompactFilterCommitStage::UpdateApplied,
        CompactFilterCommitStage::AddressesMarked,
        CompactFilterCommitStage::ProvenanceReconciled,
        CompactFilterCommitStage::SnapshotBuilt,
        CompactFilterCommitStage::NotificationsEnqueued,
        CompactFilterCommitStage::WalletPersisted,
    ] {
        let result =
            apply_compact_filter_update_with_hook(&mut db, false, update.clone(), None, |stage| {
                if stage == failed_stage {
                    Err(api_error("injected_failure", "commit fault injection"))
                } else {
                    Ok(())
                }
            });
        let error = match result {
            Err(error) => error,
            Ok(_) => panic!("the selected commit stage must fail"),
        };
        assert_eq!(error.code, "injected_failure");
        drop(db);
        db = Connection::open(&database).unwrap();
        init_app_schema(&db).unwrap();
        let restarted = load_wallet(&mut db).unwrap();
        assert_eq!(restarted.latest_checkpoint(), original_tip);
        drop(restarted);
        assert!(!notifications::history_initialized(&db).unwrap());
    }

    apply_compact_filter_update(&mut db, false, update, None).unwrap();
    drop(db);
    let mut restarted_db = Connection::open(&database).unwrap();
    init_app_schema(&restarted_db).unwrap();
    let restarted = load_wallet(&mut restarted_db).unwrap();
    assert_eq!(restarted.latest_checkpoint().height(), 1);
    drop(restarted);
    assert!(notifications::history_initialized(&restarted_db).unwrap());
    drop(restarted_db);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn transaction_dto_serializes_authoritative_detail_fields() {
    let value = serde_json::to_value(TransactionDto {
        id: "11".repeat(32),
        kind: "self_spend".to_owned(),
        direction: "sent".to_owned(),
        amount: 548,
        fee: Some(548),
        status: "pending".to_owned(),
        confirmations: 0,
        date: "1".to_owned(),
        address: None,
        label: "Self-spend".to_owned(),
        block: None,
        replaced_by: None,
        replaces: None,
        input_count: Some(1),
        output_count: Some(1),
        fee_rate: Some(5.03),
        wallet_input_amount: Some(64_016),
        wallet_output_amount: Some(63_468),
        locktime: Some(126),
        rbf: Some(true),
        intent_label: None,
        provenance: ProvenanceSummaryDto::unknown("funding"),
    })
    .unwrap();

    assert_eq!(value["inputCount"], 1);
    assert_eq!(value["outputCount"], 1);
    assert_eq!(value["feeRate"], 5.03);
    assert_eq!(value["walletInputAmount"], 64_016);
    assert_eq!(value["walletOutputAmount"], 63_468);
    assert_eq!(value["locktime"], 126);
    assert_eq!(value["rbf"], true);
}

#[test]
fn replacement_history_marks_or_restores_the_original_without_affecting_the_replacement() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let original_txid = "11".repeat(32);
    let replacement_txid = "22".repeat(32);
    db.execute(
        "INSERT INTO groot_proposals
         (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, txid)
         VALUES ('rbf-proposal', 'bcrt1qfixture', 'Miner fee increase', 100, 5, 2, 'fixture', 'broadcast', 2, ?1)",
        params![replacement_txid],
    )
    .unwrap();
    db.execute(
        "INSERT INTO groot_accelerations
         (proposal_id, method, original_txid, replacement_txid, original_kind,
          original_direction, original_amount, original_fee, original_date,
          original_address, original_label, created_at)
         VALUES ('rbf-proposal', 'rbf', ?1, ?2, 'payment', 'sent', 100, 2, '1',
                 'bcrt1qfixture', 'Original payment', 2)",
        params![original_txid, replacement_txid],
    )
    .unwrap();
    let mut transactions = vec![TransactionDto {
        id: replacement_txid.clone(),
        kind: "payment".to_owned(),
        direction: "sent".to_owned(),
        amount: 100,
        fee: Some(5),
        status: "confirmed".to_owned(),
        confirmations: 1,
        date: "2".to_owned(),
        address: Some("bcrt1qfixture".to_owned()),
        label: "Original payment".to_owned(),
        block: Some(101),
        replaced_by: None,
        replaces: None,
        input_count: Some(1),
        output_count: Some(2),
        fee_rate: Some(2.5),
        wallet_input_amount: Some(200),
        wallet_output_amount: Some(95),
        locktime: Some(100),
        rbf: Some(true),
        intent_label: None,
        provenance: ProvenanceSummaryDto::unknown("funding"),
    }];

    apply_replacement_history(&db, &mut transactions).unwrap();

    assert_eq!(transactions.len(), 2);
    assert_eq!(transactions[0].id, replacement_txid);
    let original = transactions
        .iter()
        .find(|transaction| transaction.id == original_txid)
        .unwrap();
    assert_eq!(original.status, "replaced");
    assert_eq!(original.confirmations, 0);
    assert_eq!(
        original.replaced_by.as_deref(),
        Some(transactions[0].id.as_str())
    );
    assert_eq!(transactions[0].status, "confirmed");
    assert_eq!(
        acceleration_label(AccelerationMethod::Rbf, original),
        "Original payment"
    );
    assert_eq!(
        acceleration_label(AccelerationMethod::Cpfp, original),
        "Fee acceleration"
    );
}

#[test]
fn replacement_history_keeps_a_canonical_original_counted_when_it_wins_the_race() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let original_txid = "11".repeat(32);
    let replacement_txid = "22".repeat(32);
    db.execute(
        "INSERT INTO groot_proposals
         (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at, txid)
         VALUES ('rbf-race', 'bcrt1qfixture', 'Miner fee increase', 100, 5, 2,
                 'fixture', 'broadcast', 2, ?1)",
        params![replacement_txid],
    )
    .unwrap();
    db.execute(
        "INSERT INTO groot_accelerations
         (proposal_id, method, original_txid, replacement_txid, original_kind,
          original_direction, original_amount, original_fee, original_date,
          original_address, original_label, created_at)
         VALUES ('rbf-race', 'rbf', ?1, ?2, 'payment', 'sent', 100, 2, '1',
                 'bcrt1qfixture', 'Original payment', 2)",
        params![original_txid, replacement_txid],
    )
    .unwrap();
    let mut transactions = vec![TransactionDto {
        id: original_txid.clone(),
        kind: "payment".to_owned(),
        direction: "sent".to_owned(),
        amount: 100,
        fee: Some(2),
        status: "confirmed".to_owned(),
        confirmations: 42,
        date: "3".to_owned(),
        address: Some("bcrt1qfixture".to_owned()),
        label: "Original payment".to_owned(),
        block: Some(101),
        replaced_by: None,
        replaces: None,
        input_count: Some(1),
        output_count: Some(2),
        fee_rate: Some(1.0),
        wallet_input_amount: Some(200),
        wallet_output_amount: Some(98),
        locktime: Some(100),
        rbf: Some(true),
        intent_label: None,
        provenance: ProvenanceSummaryDto::unknown("funding"),
    }];

    apply_replacement_history(&db, &mut transactions).unwrap();

    assert_eq!(transactions.len(), 1);
    assert_eq!(transactions[0].id, original_txid);
    assert_eq!(transactions[0].status, "confirmed");
    assert_eq!(transactions[0].confirmations, 42);
    assert_eq!(transactions[0].block, Some(101));
    assert_eq!(transactions[0].replaced_by, None);
    assert_eq!(transactions[0].replaces, None);
}

#[test]
fn acceleration_drafts_resume_once_and_legacy_duplicates_are_cancelled() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let pending_txid = Txid::from_str(&"33".repeat(32)).unwrap();
    let completed_txid = "44".repeat(32);
    let replacement_txid = "55".repeat(32);

    for (proposal_id, status, created_at) in [
        ("older-active", "collecting", 1),
        ("newer-active", "ready", 2),
        ("completed", "broadcast", 3),
        ("stale-after-broadcast", "collecting", 4),
    ] {
        db.execute(
            "INSERT INTO groot_proposals
             (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at)
             VALUES (?1, 'bcrt1qfixture', 'Acceleration', 100, 5, 2, 'fixture', ?2, ?3)",
            params![proposal_id, status, created_at],
        )
        .unwrap();
    }
    for (proposal_id, original_txid, replacement, created_at) in [
        ("older-active", pending_txid.to_string(), None, 1),
        ("newer-active", pending_txid.to_string(), None, 2),
        (
            "completed",
            completed_txid.clone(),
            Some(replacement_txid.as_str()),
            3,
        ),
        ("stale-after-broadcast", completed_txid, None, 4),
    ] {
        db.execute(
            "INSERT INTO groot_accelerations
             (proposal_id, method, original_txid, replacement_txid, original_kind,
              original_direction, original_amount, original_fee, original_date,
              original_address, original_label, created_at)
             VALUES (?1, 'rbf', ?2, ?3, 'payment', 'sent', 100, 2, '1',
                     'bcrt1qfixture', 'Original payment', ?4)",
            params![proposal_id, original_txid, replacement, created_at],
        )
        .unwrap();
    }

    assert_eq!(
        active_acceleration_proposal_id(&db, &pending_txid, AccelerationMethod::Rbf)
            .unwrap()
            .as_deref(),
        Some("newer-active")
    );
    reconcile_active_acceleration_proposals(&db).unwrap();

    let statuses = db
        .prepare("SELECT proposal_id, status FROM groot_proposals ORDER BY proposal_id")
        .unwrap()
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert!(statuses.contains(&("older-active".to_owned(), "cancelled".to_owned())));
    assert!(statuses.contains(&("newer-active".to_owned(), "ready".to_owned())));
    assert!(statuses.contains(&("stale-after-broadcast".to_owned(), "cancelled".to_owned())));
    assert_eq!(
        active_acceleration_proposal_id(
            &db,
            &Txid::from_str(&"44".repeat(32)).unwrap(),
            AccelerationMethod::Rbf
        )
        .unwrap(),
        None
    );
}

#[test]
fn restart_restores_proposals_frozen_coins_and_acknowledged_notifications() {
    use bdk_wallet::bitcoin::{absolute::LockTime, transaction::Version, Transaction};

    let directory = std::env::temp_dir().join(format!("groot-restart-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("wallet.sqlite");
    let proposal_id = Uuid::new_v4().to_string();
    let outpoint = format!("{}:0", "11".repeat(32));
    {
        let db = Connection::open(&path).unwrap();
        init_app_schema(&db).unwrap();
        db.execute(
            "INSERT INTO groot_frozen_coins (outpoint, frozen_at) VALUES (?1, 1)",
            params![outpoint],
        )
        .unwrap();
        let psbt = Psbt::from_unsigned_tx(Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![],
            output: vec![],
        })
        .unwrap();
        persist_proposal(
            &db,
            &PaymentProposalDto {
                proposal_id: proposal_id.clone(),
                recipient: "bcrt1qrestartfixture".into(),
                recipient_testnet_alias: None,
                recipient_is_wallet_owned: false,
                recipient_derivation_paths: vec![],
                label: "Restart fixture".into(),
                labels: vec!["Restart fixture".into()],
                amount: 10,
                fee: 1,
                fee_rate: 1.0,
                total: 11,
                change: 0,
                change_addresses: vec![],
                change_testnet_aliases: vec![],
                change_derivation_paths: vec![],
                output_count: 0,
                selected_outpoints: vec![outpoint.clone()],
                inputs: vec![],
                locktime: 0,
                rbf: false,
                network: "regtest",
                selection_impact: SelectionImpactDto {
                    strategy: "balanced".into(),
                    selected_input_count: 0,
                    estimated_input_weight: 0,
                    funding_labels: vec![],
                    provenance_state: ProvenanceState::Unknown,
                    existing_cluster_count: 0,
                    new_cluster_links: 0,
                    has_unknown_provenance: true,
                    has_address_reuse: false,
                    fee_difference_vs_private: None,
                },
                acceleration: None,
            },
            &psbt,
            false,
        )
        .unwrap();
        notifications::enqueue(
            &db,
            &WalletNotification::TransactionBroadcast {
                txid: "22".repeat(32),
                balance: 99,
            },
            1,
        )
        .unwrap();
    }

    let mut restarted_db = Connection::open(&path).unwrap();
    init_app_schema(&restarted_db).unwrap();
    assert_eq!(
        frozen_outpoints(&restarted_db).unwrap()[0].to_string(),
        outpoint
    );
    assert_eq!(
        load_single_proposal(&restarted_db, &proposal_id)
            .unwrap()
            .psbt
            .unsigned_tx
            .version,
        Version::TWO
    );
    let pending = notifications::pending(&restarted_db).unwrap();
    assert_eq!(pending.len(), 1);
    notifications::acknowledge(
        &mut restarted_db,
        &pending
            .iter()
            .map(|event| event.id.clone())
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert!(notifications::pending(&restarted_db).unwrap().is_empty());

    restarted_db
        .execute(
            "UPDATE groot_proposals SET psbt = 'corrupt' WHERE proposal_id = ?1",
            params![proposal_id],
        )
        .unwrap();
    assert_eq!(
        load_single_proposal(&restarted_db, &proposal_id)
            .unwrap_err()
            .code,
        "malformed_psbt"
    );
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn restart_lists_only_active_payment_proposals_newest_first() {
    let directory = std::env::temp_dir().join(format!("groot-proposal-list-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("wallet.sqlite");
    {
        let db = Connection::open(&path).unwrap();
        init_app_schema(&db).unwrap();
        for (proposal_id, status, created_at) in [
            ("older-active", "collecting", 10),
            ("already-sent", "broadcast", 30),
            ("newer-active", "ready", 20),
            ("cancelled", "cancelled", 40),
        ] {
            db.execute(
                "INSERT INTO groot_proposals
                 (proposal_id, recipient, label, amount, fee, fee_rate, psbt, status, created_at)
                 VALUES (?1, 'bcrt1qfixture', 'Draft', 10, 1, 1, 'fixture', ?2, ?3)",
                params![proposal_id, status, created_at],
            )
            .unwrap();
        }
    }

    let restarted_db = Connection::open(&path).unwrap();
    init_app_schema(&restarted_db).unwrap();
    assert_eq!(
        active_payment_proposal_ids(&restarted_db).unwrap(),
        vec!["newer-active", "older-active"]
    );
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn locally_broadcast_transaction_is_pending_after_database_restart() {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxOut, Witness,
    };

    let directory = std::env::temp_dir().join(format!("groot-local-broadcast-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("wallet.sqlite");
    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let master = root_key(&mnemonic, "test passphrase").unwrap();
    let mut db = Connection::open(&path).unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(Network::Regtest)
    .create_wallet(&mut db)
    .unwrap();
    let receive = wallet.reveal_next_address(KeychainKind::External);
    let funding = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([9; 32]), 0),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(100_000),
            script_pubkey: receive.address.script_pubkey(),
        }],
    };
    let funding_txid = funding.compute_txid();
    wallet.apply_unconfirmed_txs([(funding, 1)]);
    wallet.persist(&mut db).unwrap();
    drop(wallet);

    let outgoing = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(funding_txid, 0),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(99_000),
            script_pubkey: ScriptBuf::new(),
        }],
    };
    let outgoing_txid = outgoing.compute_txid();
    let mut persisted = db.transaction().unwrap();
    let mut wallet = load_wallet_transaction(&mut persisted).unwrap();
    apply_locally_broadcast_transaction(&mut wallet, &outgoing);
    wallet.persist(&mut persisted).unwrap();
    drop(wallet);
    persisted.commit().unwrap();
    drop(db);

    let mut restarted = Connection::open(&path).unwrap();
    init_app_schema(&restarted).unwrap();
    let wallet = load_wallet(&mut restarted).unwrap();
    let outgoing = wallet.get_tx(outgoing_txid).expect("outgoing transaction");
    assert!(outgoing.chain_position.is_unconfirmed());
    assert_eq!(wallet.balance().total(), Amount::ZERO);
    drop(wallet);
    drop(restarted);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn compact_filter_progress_dto_is_sanitized_and_bounded() {
    let status = Arc::new(Mutex::new(Some(WalletSyncStatusDto {
        wallet_id: Uuid::nil().to_string(),
        source: "compact_filters",
        state: "connecting",
        progress_percent: None,
        chain_height: None,
        last_verified_height: 42,
        connected_peers: None,
        required_peers: None,
        updated_at: 1,
    })));
    update_compact_filter_sync_status(
        &status,
        crate::compact_filters::SyncProgress::Connecting {
            connected: 1,
            required: 2,
        },
    );
    update_compact_filter_sync_status(
        &status,
        crate::compact_filters::SyncProgress::Scanning {
            percent: 150.0,
            chain_height: 123,
        },
    );
    let status = status.lock().unwrap().clone().unwrap();
    assert_eq!(status.state, "syncing");
    assert_eq!(status.progress_percent, Some(100));
    assert_eq!(status.chain_height, Some(123));
    assert_eq!(status.last_verified_height, 42);
    let serialized = serde_json::to_value(status).unwrap();
    let object = serialized.as_object().unwrap();
    assert_eq!(object.len(), 9);
    for forbidden in ["address", "hash", "script", "descriptor", "warning"] {
        assert!(!object.keys().any(|key| key.contains(forbidden)));
    }
}

#[test]
fn prepared_wallet_proposal_and_acceleration_roll_back_as_one_unit() {
    use bdk_wallet::bitcoin::{absolute::LockTime, transaction::Version, Transaction};

    let mut db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let mnemonic = Mnemonic::parse(WORDS).unwrap();
    let (external, internal) = watch_templates(&mnemonic, "atomic prepare").unwrap();
    Wallet::create(external, internal)
        .network(NETWORK)
        .create_wallet(&mut db)
        .unwrap();

    let psbt = Psbt::from_unsigned_tx(Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![],
    })
    .unwrap();
    let proposal = PaymentProposalDto {
        proposal_id: "atomic-proposal".into(),
        recipient: "bcrt1qatomicfixture".into(),
        recipient_testnet_alias: None,
        recipient_is_wallet_owned: false,
        recipient_derivation_paths: vec![],
        label: "Atomic fixture".into(),
        labels: vec!["Atomic fixture".into()],
        amount: 10,
        fee: 1,
        fee_rate: 1.0,
        total: 11,
        change: 0,
        change_addresses: vec![],
        change_testnet_aliases: vec![],
        change_derivation_paths: vec![],
        output_count: 0,
        selected_outpoints: vec![],
        inputs: vec![],
        locktime: 0,
        rbf: false,
        network: "regtest",
        selection_impact: SelectionImpactDto {
            strategy: "balanced".into(),
            selected_input_count: 0,
            estimated_input_weight: 0,
            funding_labels: vec![],
            provenance_state: ProvenanceState::Unknown,
            existing_cluster_count: 0,
            new_cluster_links: 0,
            has_unknown_provenance: true,
            has_address_reuse: false,
            fee_difference_vs_private: None,
        },
        acceleration: None,
    };
    let original = TransactionDto {
        id: "11".repeat(32),
        kind: "payment".into(),
        direction: "sent".into(),
        amount: 10,
        fee: Some(1),
        status: "pending".into(),
        confirmations: 0,
        date: "1".into(),
        address: Some("bcrt1qoriginalfixture".into()),
        label: "Original".into(),
        block: None,
        replaced_by: None,
        replaces: None,
        input_count: Some(1),
        output_count: Some(2),
        fee_rate: Some(1.0),
        wallet_input_amount: Some(11),
        wallet_output_amount: Some(1),
        locktime: Some(0),
        rbf: Some(true),
        intent_label: None,
        provenance: ProvenanceSummaryDto::unknown("funding"),
    };

    let mut transaction = db.transaction().unwrap();
    let mut wallet = load_wallet_transaction(&mut transaction).unwrap();
    assert_eq!(wallet.reveal_next_address(KeychainKind::Internal).index, 0);
    persist_prepared_state(
        &mut transaction,
        &mut wallet,
        &proposal,
        &psbt,
        Some((AccelerationMethod::Rbf, &original)),
    )
    .unwrap();
    drop(wallet);
    transaction.rollback().unwrap();

    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM groot_proposals", [], |row| row
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM groot_accelerations", [], |row| row
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    let mut reloaded = load_wallet(&mut db).unwrap();
    assert_eq!(
        reloaded.reveal_next_address(KeychainKind::Internal).index,
        0,
        "rolled-back BDK changes must not consume a change address"
    );
    drop(reloaded);

    let page_count = db
        .query_row("PRAGMA page_count", [], |row| row.get::<_, u64>(0))
        .unwrap();
    db.execute_batch(&format!("PRAGMA max_page_count = {page_count};"))
        .unwrap();
    let mut transaction = db.transaction().unwrap();
    let mut wallet = load_wallet_transaction(&mut transaction).unwrap();
    assert_eq!(wallet.reveal_next_address(KeychainKind::Internal).index, 0);
    let mut disk_full_proposal = proposal;
    disk_full_proposal.proposal_id = "disk-full-proposal".into();
    disk_full_proposal.label = "x".repeat(2 * 1024 * 1024);
    assert!(persist_prepared_state(
        &mut transaction,
        &mut wallet,
        &disk_full_proposal,
        &psbt,
        None,
    )
    .is_err());
    drop(wallet);
    drop(transaction);

    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM groot_proposals", [], |row| row
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    let mut reloaded = load_wallet(&mut db).unwrap();
    assert_eq!(
        reloaded.reveal_next_address(KeychainKind::Internal).index,
        0,
        "SQLITE_FULL must not consume a change address"
    );
}

#[test]
fn legacy_directory_migration_commits_or_rolls_back_as_a_unit() {
    let directory = std::env::temp_dir().join(format!("groot-migration-{}", Uuid::new_v4()));
    let first = directory.join("regtest-wallet");
    let second = directory.join("regtest-multisig");
    let first_destination = directory.join("wallets/one");
    let second_destination = directory.join("wallets/two");
    fs::create_dir_all(&first).unwrap();
    fs::create_dir_all(&second).unwrap();
    fs::create_dir_all(directory.join("wallets")).unwrap();
    let moves = vec![
        (first.clone(), first_destination.clone()),
        (second.clone(), second_destination.clone()),
    ];
    let error = migrate_directories_with_rollback(&moves, || {
        Err(api_error(
            "internal_error",
            "simulated registry interruption",
        ))
    })
    .unwrap_err();
    assert_eq!(error.code, "internal_error");
    assert!(first.exists() && second.exists());
    assert!(!first_destination.exists() && !second_destination.exists());

    migrate_directories_with_rollback(&moves, || Ok(())).unwrap();
    assert!(!first.exists() && !second.exists());
    assert!(first_destination.exists() && second_destination.exists());
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn wallet_directory_deletion_is_idempotent_and_rejects_non_directories() {
    let root = std::env::temp_dir().join(format!("groot-delete-test-{}", Uuid::new_v4()));
    let wallet = root.join("wallet");
    fs::create_dir_all(&wallet).unwrap();
    fs::write(wallet.join("secret.json"), b"encrypted").unwrap();
    delete_wallet_directory(&wallet).unwrap();
    assert!(!wallet.exists());
    delete_wallet_directory(&wallet).unwrap();
    let file = root.join("not-a-wallet");
    fs::write(&file, b"keep").unwrap();
    assert_eq!(
        delete_wallet_directory(&file).unwrap_err().code,
        "internal_error"
    );
    assert!(file.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn public_backup_filename_is_bounded_and_has_an_interoperable_extension() {
    assert_eq!(
        validate_public_backup_filename("wallet.bsms").unwrap(),
        "wallet.bsms"
    );
    assert_eq!(
        validate_public_backup_filename("wallet.json").unwrap(),
        "wallet.json"
    );
    assert_eq!(
        validate_public_backup_filename("wallet.txt").unwrap(),
        "wallet.txt"
    );
    for invalid in [
        "",
        "wallet.pdf",
        "../wallet.json",
        "folder/wallet.bsms",
        "wallet.json\0extra",
    ] {
        assert_eq!(
            validate_public_backup_filename(invalid).unwrap_err().code,
            "invalid_backup"
        );
    }
    assert_eq!(
        validate_public_backup_filename(&format!("{}.json", "a".repeat(129)))
            .unwrap_err()
            .code,
        "invalid_backup"
    );
}

#[cfg(unix)]
#[test]
fn public_exports_replace_symlinks_without_writing_through_them() {
    let root = std::env::temp_dir().join(format!("groot-export-test-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let target = root.join("target.txt");
    let export = root.join("wallet.txt");
    fs::write(&target, b"keep").unwrap();
    std::os::unix::fs::symlink(&target, &export).unwrap();

    write_public_export(&export, b"public backup").unwrap();

    assert_eq!(fs::read(&target).unwrap(), b"keep");
    assert_eq!(fs::read(&export).unwrap(), b"public backup");
    assert!(!fs::symlink_metadata(&export)
        .unwrap()
        .file_type()
        .is_symlink());
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn public_exports_atomically_replace_regular_files_with_owner_only_permissions() {
    use std::os::unix::fs::PermissionsExt;

    let root = std::env::temp_dir().join(format!("groot-export-test-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let export = root.join("wallet.txt");
    fs::write(&export, b"old backup").unwrap();
    fs::set_permissions(&export, fs::Permissions::from_mode(0o644)).unwrap();

    write_public_export(&export, b"replacement backup").unwrap();

    let metadata = fs::symlink_metadata(&export).unwrap();
    assert!(metadata.is_file());
    assert!(!metadata.file_type().is_symlink());
    assert_eq!(metadata.permissions().mode() & 0o777, 0o600);
    assert_eq!(fs::read(&export).unwrap(), b"replacement backup");
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn external_signer_json_backup_is_directly_importable() {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str(SINGLESIG_ACCOUNT_PATH).unwrap();
    let master = Xpriv::new_master(NetworkKind::Test, &[42_u8; 32]).unwrap();
    let account = master.derive_priv(&secp, &path).unwrap();
    let signer = ExternalSignerInput {
        label: "Ledger".to_owned(),
        fingerprint: master.fingerprint(&secp).to_string(),
        xpub: Xpub::from_priv(&secp, &account).to_string(),
        derivation_path: SINGLESIG_ACCOUNT_PATH.to_owned(),
        source: SignerSource::Usb,
        device_type: Some("ledger".to_owned()),
    };
    let expected = external_signer::descriptors(&signer).unwrap();
    let backup = external_signer_backup(expected.0.clone()).unwrap();
    let recovered =
        external_signer::parse_import(&backup.content, "Recovered", SignerSource::File).unwrap();
    assert_eq!(backup.descriptor, expected.0);
    assert_eq!(external_signer::descriptors(&recovered).unwrap(), expected);
    assert!(!backup.content.contains("prv"));
}

#[test]
fn external_signer_command_rejects_oversized_json_before_network_parsing() {
    let oversized = format!(
        "{{\"version\":1,\"network\":\"{}\",\"descriptor\":\"{}\"}}",
        NETWORK_NAME,
        "x".repeat(external_signer::MAX_IMPORT_BYTES)
    );
    let error = external_signer_parse_import(oversized, "Signer".to_owned(), SignerSource::File)
        .unwrap_err();
    assert_eq!(error.code, "import_too_large");
}

#[test]
fn protected_rpc_password_is_bound_to_the_complete_node_config() {
    let config = CoreNodeConfig {
        backend: ChainBackend::RemoteCore {
            url: "https://node.example:8332".to_owned(),
        },
        auth: RpcAuthMode::UserPass,
        username: Some("groot".to_owned()),
        tor_proxy: None,
    };
    let encoded = serde_json::to_vec(&ProtectedNodeAuthRef {
        version: PROTECTED_NODE_AUTH_VERSION,
        config: &config,
        password: "secret",
    })
    .unwrap();
    let decoded = decode_protected_node_auth(&encoded, &config)
        .unwrap()
        .unwrap();
    assert_eq!(decoded.password, "secret");

    let mut tampered = config.clone();
    tampered.backend = ChainBackend::RemoteCore {
        url: "https://attacker.example:8332".to_owned(),
    };
    let error = match decode_protected_node_auth(&encoded, &tampered) {
        Err(error) => error,
        Ok(_) => panic!("tampered node config must be rejected"),
    };
    assert_eq!(error.code, "invalid_node_config");
    assert!(
        decode_protected_node_auth(b"legacy plaintext password", &config)
            .unwrap()
            .is_none()
    );
}

#[test]
fn psbt_filename_is_bounded_and_cannot_escape_the_save_location() {
    assert_eq!(
        validate_psbt_filename("payment.psbt").unwrap(),
        "payment.psbt"
    );
    for invalid in [
        "",
        "payment.txt",
        "../payment.psbt",
        "folder/payment.psbt",
        "payment.psbt\0extra",
    ] {
        assert_eq!(
            validate_psbt_filename(invalid).unwrap_err().code,
            "invalid_backup"
        );
    }
    assert_eq!(
        validate_psbt_filename(&format!("{}.psbt", "a".repeat(129)))
            .unwrap_err()
            .code,
        "invalid_backup"
    );
}

#[test]
fn policy_readiness_is_limited_to_devices_with_interactive_registration() {
    for supported in ["ledger", "bitbox02", "jade"] {
        assert!(records_interactive_policy_verification(supported));
    }
    for other in ["coldcard", "trezor", "keepkey", "passport"] {
        assert!(!records_interactive_policy_verification(other));
    }
    assert!(require_matching_policy_device_type(Some("ledger"), "ledger").is_ok());
    assert_eq!(
        require_matching_policy_device_type(Some("ledger"), "bitbox02")
            .unwrap_err()
            .code,
        "unknown_signer"
    );
    assert!(require_matching_policy_device_type(None, "jade").is_ok());
}

#[test]
fn bitbox_policy_address_reports_a_safe_account_name_conflict() {
    let conflict = hardware_commands::bitbox_policy_address_error(
        "bitbox02",
        Some(-13),
        Some(
            "A multisig account configuration with this name already exists.\nChoose another name.",
        ),
    )
    .unwrap();
    assert_eq!(conflict.code, "hardware_policy_name_conflict");
    assert!(conflict.message.contains("new unique name"));
    assert!(hardware_commands::bitbox_policy_address_error(
        "bitbox02",
        Some(-14),
        Some("same text")
    )
    .is_none());
    assert!(
        hardware_commands::bitbox_policy_address_error("jade", Some(-13), Some("same text"))
            .is_none()
    );
}

#[test]
fn signer_policy_verification_keeps_latest_evidence_per_fingerprint() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let identity = VerifiedHardwareIdentity {
        device_type: "ledger".to_owned(),
        fingerprint: "a1b2c3d4".to_owned(),
    };
    record_signer_policy_verification(&db, &identity, "tb1qfirst").unwrap();
    record_signer_policy_verification(&db, &identity, "tb1qlatest").unwrap();
    let rows = signer_policy_verification_rows(&db).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].signer_fingerprint, "a1b2c3d4");
    assert_eq!(rows[0].displayed_address.as_deref(), Some("tb1qlatest"));
    assert_eq!(rows[0].scope, "policy_and_address");
    assert!(has_signer_policy_verification(&rows, &identity));
    assert!(!has_signer_policy_verification(
        &rows,
        &VerifiedHardwareIdentity {
            device_type: "bitbox02".to_owned(),
            fingerprint: identity.fingerprint,
        }
    ));
}

#[test]
fn coldcard_policy_acknowledgement_is_distinct_from_address_evidence() {
    let db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    db.execute(
        "INSERT INTO groot_signer_policy_acknowledgements
            (signer_fingerprint, device_type, scope, acknowledged_at)
         VALUES ('f00dbabe', 'coldcard', 'policy_file_acknowledgement', 42)",
        [],
    )
    .unwrap();
    let identity = VerifiedHardwareIdentity {
        device_type: "coldcard".to_owned(),
        fingerprint: "f00dbabe".to_owned(),
    };
    let rows = signer_policy_verification_rows(&db).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].scope, "policy_file_acknowledgement");
    assert_eq!(rows[0].displayed_address, None);
    assert!(has_coldcard_policy_acknowledgement(&rows, &identity));
    assert!(!has_signer_policy_verification(&rows, &identity));
}

#[test]
fn coldcard_policy_acknowledgement_accepts_recognized_and_legacy_file_imports() {
    let signer = |source, device_type: Option<&str>| CosignerInput {
        id: "signer".to_owned(),
        label: "Coldcard MK4".to_owned(),
        fingerprint: "f00dbabe".to_owned(),
        xpub: "tpub-public".to_owned(),
        derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
        source,
        device_type: device_type.map(str::to_owned),
    };

    assert!(supports_coldcard_policy_acknowledgement(&signer(
        CosignerSource::File,
        Some("coldcard")
    )));
    assert!(supports_coldcard_policy_acknowledgement(&signer(
        CosignerSource::File,
        None
    )));
    assert!(!supports_coldcard_policy_acknowledgement(&signer(
        CosignerSource::Usb,
        Some("ledger")
    )));
}
