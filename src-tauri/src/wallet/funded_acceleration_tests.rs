use super::multisig_proposal_commands::{
    build_delayed_policy_sweep, build_policy_renewal, finalized_multisig_proposal_transaction,
    import_multisig_proposal_in_db,
};
use super::transaction_commands::{
    core_incremental_relay_fee, prepare_persisted_multisig_acceleration,
    validate_acceleration_rate, AccelerationRatePolicy,
};
use super::*;
use crate::multisig::{CosignerInput, CosignerSource, MULTISIG_ACCOUNT_PATH};
use crate::recovery::{SpendingPath, TimedSpendingPath};
use bdk_bitcoind_rpc::bitcoincore_rpc::jsonrpc;
use bdk_wallet::bitcoin::{
    bip32::{DerivationPath, Xpriv, Xpub},
    secp256k1::Secp256k1,
    BlockHash, NetworkKind, Sequence,
};

struct TemporaryDatabase(PathBuf);

impl TemporaryDatabase {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
            "groot-funded-acceleration-{}.sqlite",
            Uuid::new_v4()
        )))
    }
}

impl Drop for TemporaryDatabase {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
        let _ = fs::remove_file(self.0.with_extension("sqlite-shm"));
        let _ = fs::remove_file(self.0.with_extension("sqlite-wal"));
    }
}

struct TestKey {
    fingerprint: String,
    account_private: Xpriv,
    account_public: Xpub,
}

fn test_keys_with_count(count: u8) -> Vec<TestKey> {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
    (1_u8..=count)
        .map(|index| {
            let mut seed = [0_u8; 32];
            OsRng.fill_bytes(&mut seed);
            seed[0] ^= index;
            let master = Xpriv::new_master(NetworkKind::Test, &seed).unwrap();
            let account_private = master.derive_priv(&secp, &path).unwrap();
            TestKey {
                fingerprint: master.fingerprint(&secp).to_string(),
                account_public: Xpub::from_priv(&secp, &account_private),
                account_private,
            }
        })
        .collect()
}

fn test_keys() -> Vec<TestKey> {
    test_keys_with_count(3)
}

fn descriptor(keys: &[TestKey], branch: u8, private_index: Option<usize>) -> String {
    let keys = keys
        .iter()
        .enumerate()
        .map(|(index, key)| {
            let extended = if private_index == Some(index) {
                key.account_private.to_string()
            } else {
                key.account_public.to_string()
            };
            format!("[{}/48'/1'/0'/2']{extended}/{branch}/*", key.fingerprint)
        })
        .collect::<Vec<_>>()
        .join(",");
    format!("wsh(sortedmulti(2,{keys}))")
}

fn metadata(keys: &[TestKey]) -> MultisigWalletDto {
    MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: "Funded acceleration boundary".to_owned(),
        threshold: 2,
        cosigners: keys
            .iter()
            .enumerate()
            .map(|(index, key)| CosignerInput {
                id: format!("signer-{index}"),
                label: format!("Signer {}", index + 1),
                fingerprint: key.fingerprint.clone(),
                xpub: key.account_public.to_string(),
                derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
                source: CosignerSource::Virtual,
                device_type: None,
            })
            .collect(),
        external_descriptor: descriptor(keys, 0, None),
        internal_descriptor: descriptor(keys, 1, None),
        created_at: "funded-regtest".to_owned(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: vec![],
    }
}

#[test]
fn multisig_policy_builders_fail_closed_without_spendable_policy_context() {
    let keys = test_keys();
    let metadata = metadata(&keys);
    let mut wallet = Wallet::create(metadata.external_descriptor, metadata.internal_descriptor)
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
    let destination = wallet.next_unused_address(KeychainKind::Internal).address;
    let foreign = OutPoint::new(Txid::from_byte_array([0x51; 32]), 7);
    let rate = FeeRate::from_sat_per_vb(2).unwrap();

    assert_eq!(
        build_policy_renewal(&mut wallet, foreign, rate)
            .unwrap_err()
            .code,
        "wallet_corrupt"
    );
    assert_eq!(
        build_delayed_policy_sweep(&mut wallet, foreign, &destination, rate)
            .unwrap_err()
            .code,
        "wallet_corrupt"
    );
}

fn regtest_dir() -> PathBuf {
    std::env::var_os("GROOT_REGTEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.regtest"))
}

fn rpc() -> Client {
    let port = std::env::var("GROOT_RPC_PORT").unwrap_or_else(|_| "18443".to_owned());
    let (username, password) = Auth::CookieFile(regtest_dir().join("regtest/.cookie"))
        .get_user_pass()
        .expect("read regtest cookie");
    let mut builder = jsonrpc::minreq_http::MinreqHttpTransport::builder()
        .url(&format!("http://127.0.0.1:{port}"))
        .expect("regtest RPC URL");
    if let Some(username) = username {
        builder = builder.basic_auth(username, password);
    }
    Client::from_jsonrpc(jsonrpc::Client::with_transport(builder.build()))
}

fn sync(wallet: &mut PersistedWallet<Connection>, db: &mut Connection, rpc: Arc<Client>) {
    let mut emitter = Emitter::new(
        rpc,
        wallet.latest_checkpoint(),
        0,
        wallet
            .transactions()
            .filter(|transaction| transaction.chain_position.is_unconfirmed()),
    );
    while let Some(block) = emitter.next_block().expect("next block") {
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .expect("connect block");
        wallet.persist(db).expect("persist block");
    }
    let mempool = emitter.mempool().expect("mempool");
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    wallet.persist(db).expect("persist mempool");
}

fn sign_with(keys: &[TestKey], signer: usize, encoded: &str) -> String {
    let mut psbt = decode_psbt(encoded).unwrap();
    let signer_wallet = Wallet::create(
        descriptor(keys, 0, Some(signer)),
        descriptor(keys, 1, Some(signer)),
    )
    .network(Network::Regtest)
    .create_wallet_no_persist()
    .unwrap();
    assert!(!signer_wallet
        .sign(
            &mut psbt,
            SignOptions {
                trust_witness_utxo: true,
                try_finalize: false,
                ..SignOptions::default()
            },
        )
        .unwrap());
    encode_psbt(&psbt)
}

fn sign_original(keys: &[TestKey], psbt: &mut Psbt) {
    for signer in 0..2 {
        let signed = sign_with(keys, signer, &encode_psbt(psbt));
        let imported = decode_psbt(&signed).unwrap();
        merge_signed_psbt(
            psbt,
            imported,
            &keys
                .iter()
                .map(|key| key.fingerprint.parse().unwrap())
                .collect::<Vec<_>>(),
            2,
        )
        .unwrap();
    }
}

fn mine_empty_block(rpc: &Client, destination: &Address) -> BlockHash {
    let result: serde_json::Value = rpc
        .call(
            "generateblock",
            &[
                serde_json::json!(destination.to_string()),
                serde_json::json!([]),
            ],
        )
        .expect("mine empty competing block");
    result["hash"].as_str().unwrap().parse().unwrap()
}

fn proposal_status(db: &Connection, proposal_id: &str) -> (String, Option<String>) {
    db.query_row(
        "SELECT proposal.status, acceleration.replacement_txid
         FROM groot_proposals proposal
         JOIN groot_accelerations acceleration USING (proposal_id)
         WHERE proposal.proposal_id = ?1",
        params![proposal_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .unwrap()
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn funded_delayed_policy_tracks_each_coin_restarts_and_rearms_after_reorg() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    let keys = test_keys_with_count(4);
    let cosigners = keys
        .iter()
        .enumerate()
        .map(|(index, key)| CosignerInput {
            id: format!("signer-{index}"),
            label: format!("Signer {}", index + 1),
            fingerprint: key.fingerprint.clone(),
            xpub: key.account_public.to_string(),
            derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
            source: CosignerSource::Virtual,
            device_type: None,
        })
        .collect::<Vec<_>>();
    let template = RecoveryTemplate::Recovery {
        immediate: SpendingPath::new(2, ["signer-0", "signer-1", "signer-2"]),
        recovery: TimedSpendingPath::new(144, 1, ["signer-3"]),
    };
    let analysis = analyze_template(&template, &cosigners).unwrap();
    let public_external_descriptor = analysis.external_descriptor.clone();
    let public_internal_descriptor = analysis.internal_descriptor.clone();
    let policy = DelayedPolicyContext {
        policy_type: "recovery".to_owned(),
        delay_blocks: 144,
    };
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = Wallet::create(analysis.external_descriptor, analysis.internal_descriptor)
        .network(Network::Regtest)
        .create_wallet(&mut db)
        .unwrap();
    let first_address = wallet.reveal_next_address(KeychainKind::External).address;
    wallet.persist(&mut db).unwrap();
    let mining = rpc
        .get_new_address(Some("groot delayed maturity"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let first_txid = rpc
        .call::<Txid>(
            "sendtoaddress",
            &[
                serde_json::json!(first_address.to_string()),
                serde_json::json!(0.001),
            ],
        )
        .unwrap();
    rpc.generate_to_address(11, &mining).unwrap();

    let second_address = wallet.reveal_next_address(KeychainKind::External).address;
    wallet.persist(&mut db).unwrap();
    let second_txid = rpc
        .call::<Txid>(
            "sendtoaddress",
            &[
                serde_json::json!(second_address.to_string()),
                serde_json::json!(0.001),
            ],
        )
        .unwrap();
    rpc.generate_to_address(133, &mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));

    let snapshot =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, Some(&policy)).unwrap();
    let maturity_for = |txid: Txid| {
        snapshot
            .utxos
            .iter()
            .find(|coin| coin.outpoint.starts_with(&txid.to_string()))
            .unwrap()
            .policy_maturity
            .as_ref()
            .unwrap()
    };
    assert_eq!(maturity_for(first_txid).state, MaturityState::Mature);
    assert_eq!(maturity_for(first_txid).remaining_blocks, Some(0));
    assert_eq!(maturity_for(second_txid).state, MaturityState::Approaching);
    assert_eq!(maturity_for(second_txid).remaining_blocks, Some(11));
    enqueue_snapshot_notifications(&db, &snapshot).unwrap();
    let initial = notifications::pending(&db).unwrap();
    assert_eq!(initial.len(), 2);
    notifications::acknowledge(
        &mut db,
        &initial
            .iter()
            .map(|item| item.id.clone())
            .collect::<Vec<_>>(),
    )
    .unwrap();

    drop(wallet);
    drop(db);
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = load_wallet(&mut db).unwrap();
    let restarted = snapshot_from(&wallet, &db, None, true, Some(&policy)).unwrap();
    enqueue_snapshot_notifications(&db, &restarted).unwrap();
    assert!(notifications::pending(&db).unwrap().is_empty());

    let height = rpc.get_block_count().unwrap();
    let fork = rpc.get_block_hash(height - 11).unwrap();
    rpc.invalidate_block(&fork).unwrap();
    let competing_mining = rpc
        .get_new_address(Some("groot delayed maturity reorg"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    mine_empty_block(&rpc, &competing_mining);
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let regressed =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, Some(&policy)).unwrap();
    assert_eq!(
        regressed
            .utxos
            .iter()
            .find(|coin| coin.outpoint.starts_with(&first_txid.to_string()))
            .unwrap()
            .policy_maturity
            .as_ref()
            .unwrap()
            .state,
        MaturityState::Approaching
    );
    enqueue_snapshot_notifications(&db, &regressed).unwrap();
    assert!(notifications::pending(&db).unwrap().is_empty());

    rpc.generate_to_address(11, &competing_mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let rematured =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, Some(&policy)).unwrap();
    enqueue_snapshot_notifications(&db, &rematured).unwrap();
    let alerts = notifications::pending(&db).unwrap();
    assert_eq!(alerts.len(), 1);
    assert!(matches!(
        alerts[0].event,
        WalletNotification::PolicyMature { ref outpoint, .. }
            if outpoint.starts_with(&first_txid.to_string())
    ));

    let selected = rematured
        .utxos
        .iter()
        .find(|coin| coin.outpoint.starts_with(&first_txid.to_string()))
        .unwrap()
        .outpoint
        .parse::<OutPoint>()
        .unwrap();
    let (mut renewal, destination) =
        build_policy_renewal(&mut wallet, selected, FeeRate::from_sat_per_vb(2).unwrap()).unwrap();
    assert_eq!(renewal.unsigned_tx.input.len(), 1);
    assert_eq!(renewal.unsigned_tx.input[0].previous_output, selected);
    assert_eq!(renewal.unsigned_tx.input[0].sequence, Sequence(0xffff_fffd));
    assert_eq!(renewal.unsigned_tx.output.len(), 1);
    assert_eq!(
        renewal.unsigned_tx.output[0].script_pubkey,
        destination.script_pubkey()
    );
    sign_original(&keys, &mut renewal);
    assert!(wallet
        .finalize_psbt(&mut renewal, SignOptions::default())
        .unwrap());
    let renewal_tx = renewal.extract_tx().unwrap();
    let renewal_txid = broadcast_transaction_with_rpc(&rpc, &renewal_tx).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let pending =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, Some(&policy)).unwrap();
    let replacement = pending
        .utxos
        .iter()
        .find(|coin| coin.outpoint.starts_with(&renewal_txid.to_string()))
        .unwrap();
    assert_eq!(
        replacement.policy_maturity.as_ref().unwrap().state,
        MaturityState::Unconfirmed
    );
    assert!(pending.transactions.iter().any(|transaction| {
        transaction.id == renewal_txid.to_string() && transaction.kind == "self_spend"
    }));

    rpc.generate_to_address(1, &competing_mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let confirmed =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, Some(&policy)).unwrap();
    let replacement = confirmed
        .utxos
        .iter()
        .find(|coin| coin.outpoint.starts_with(&renewal_txid.to_string()))
        .unwrap()
        .policy_maturity
        .as_ref()
        .unwrap();
    assert_eq!(replacement.state, MaturityState::Approaching);
    assert_eq!(replacement.age_blocks, 1);
    assert_eq!(replacement.remaining_blocks, Some(143));

    rpc.generate_to_address(143, &competing_mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let matured =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, Some(&policy)).unwrap();
    let delayed_outpoint = matured
        .utxos
        .iter()
        .find(|coin| coin.outpoint.starts_with(&second_txid.to_string()))
        .unwrap();
    assert_eq!(
        delayed_outpoint.policy_maturity.as_ref().unwrap().state,
        MaturityState::Mature
    );
    let delayed_outpoint = delayed_outpoint.outpoint.parse::<OutPoint>().unwrap();
    let destination = rpc
        .get_new_address(Some("groot delayed key sweep"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let mut delayed = build_delayed_policy_sweep(
        &mut wallet,
        delayed_outpoint,
        &destination,
        FeeRate::from_sat_per_vb(2).unwrap(),
    )
    .unwrap();
    assert_eq!(delayed.unsigned_tx.input.len(), 1);
    assert_eq!(
        delayed.unsigned_tx.input[0].previous_output,
        delayed_outpoint
    );
    assert_eq!(delayed.unsigned_tx.output.len(), 1);
    assert_eq!(
        delayed.unsigned_tx.output[0].script_pubkey,
        destination.script_pubkey()
    );
    let delayed_external = public_external_descriptor
        .split('#')
        .next()
        .unwrap()
        .replace(
            &keys[3].account_public.to_string(),
            &keys[3].account_private.to_string(),
        );
    let delayed_internal = public_internal_descriptor
        .split('#')
        .next()
        .unwrap()
        .replace(
            &keys[3].account_public.to_string(),
            &keys[3].account_private.to_string(),
        );
    let delayed_signer = Wallet::create(delayed_external, delayed_internal)
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
    delayed_signer
        .sign(
            &mut delayed,
            SignOptions {
                trust_witness_utxo: true,
                try_finalize: false,
                ..SignOptions::default()
            },
        )
        .unwrap();
    assert!(wallet
        .finalize_psbt(&mut delayed, SignOptions::default())
        .unwrap());
    let delayed_tx = delayed.extract_tx().unwrap();
    let delayed_txid = broadcast_transaction_with_rpc(&rpc, &delayed_tx).unwrap();
    assert_eq!(delayed_tx.input.len(), 1);
    assert_eq!(delayed_tx.output.len(), 1);
    assert_eq!(delayed_tx.compute_txid(), delayed_txid);
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn clean_storage_descriptor_recovery_restores_known_history_and_survives_reopen() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    let keys = test_keys();
    let mut cosigners = metadata(&keys).cosigners;
    for cosigner in &mut cosigners {
        cosigner.source = CosignerSource::Manual;
    }
    let preview = PolicyInput {
        name: "Clean storage recovery".to_owned(),
        threshold: 2,
        cosigners,
    }
    .preview()
    .unwrap();
    let recovered_metadata = MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: preview.name,
        threshold: preview.threshold,
        cosigners: preview.cosigners,
        external_descriptor: preview.external_descriptor,
        internal_descriptor: preview.internal_descriptor,
        created_at: "funded-regtest".to_owned(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: vec![],
    };
    let encoded_backup = serde_json::to_string(&MultisigBackupDto {
        version: 1,
        network: "regtest".to_owned(),
        wallet: recovered_metadata.clone(),
    })
    .unwrap();
    let validated = validate_multisig_backup(&encoded_backup).unwrap();
    let expected_first_address = first_multisig_address(&validated.wallet).unwrap();

    let source_database = TemporaryDatabase::new();
    let mut source_db = Connection::open(&source_database.0).unwrap();
    init_app_schema(&source_db).unwrap();
    let mut source = Wallet::create(
        validated.wallet.external_descriptor.clone(),
        validated.wallet.internal_descriptor.clone(),
    )
    .network(Network::Regtest)
    .lookahead(50)
    .create_wallet(&mut source_db)
    .unwrap();
    let addresses = (0..=25)
        .map(|_| source.reveal_next_address(KeychainKind::External).address)
        .collect::<Vec<_>>();
    assert_eq!(addresses[0].to_string(), expected_first_address);
    source.persist(&mut source_db).unwrap();
    let mining = rpc
        .get_new_address(Some("groot clean recovery"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let first_txid = rpc
        .call::<Txid>(
            "sendtoaddress",
            &[
                serde_json::json!(addresses[0].to_string()),
                serde_json::json!(0.0012),
            ],
        )
        .unwrap();
    rpc.generate_to_address(1, &mining).unwrap();
    let extended_txid = rpc
        .call::<Txid>(
            "sendtoaddress",
            &[
                serde_json::json!(addresses[25].to_string()),
                serde_json::json!(0.0023),
            ],
        )
        .unwrap();
    rpc.generate_to_address(1, &mining).unwrap();

    let recovery_database = TemporaryDatabase::new();
    assert!(!recovery_database.0.exists());
    let mut recovery_db = Connection::open(&recovery_database.0).unwrap();
    init_app_schema(&recovery_db).unwrap();
    let settings = RecoveryScanSettingsDto {
        birthday_height: 0,
        gap_limit: 50,
    };
    recovery_db
        .execute(
            "INSERT INTO groot_recovery_settings (singleton, birthday_height, gap_limit)
             VALUES (1, ?1, ?2)",
            params![settings.birthday_height, settings.gap_limit],
        )
        .unwrap();
    let mut recovered = Wallet::create(
        validated.wallet.external_descriptor.clone(),
        validated.wallet.internal_descriptor.clone(),
    )
    .network(Network::Regtest)
    .lookahead(settings.gap_limit)
    .create_wallet(&mut recovery_db)
    .unwrap();
    let cancel = AtomicBool::new(false);
    full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut recovered,
        &mut recovery_db,
        &settings,
        "clean-storage-run",
        &cancel,
    )
    .unwrap();
    finish_recovery_scan_record(&recovery_db, "clean-storage-run", "completed").unwrap();
    let recovered_snapshot = snapshot_from(
        &recovered,
        &recovery_db,
        Some(now().to_string()),
        true,
        None,
    )
    .unwrap();
    assert_eq!(recovered_snapshot.balance.total, 350_000);
    assert_eq!(recovered_snapshot.transactions.len(), 2);
    assert!(recovered_snapshot
        .transactions
        .iter()
        .any(|transaction| transaction.id == first_txid.to_string()));
    assert!(recovered_snapshot
        .transactions
        .iter()
        .any(|transaction| transaction.id == extended_txid.to_string()));

    drop(recovered);
    drop(recovery_db);
    let mut reopened_db = Connection::open(&recovery_database.0).unwrap();
    init_app_schema(&reopened_db).unwrap();
    let reopened = load_wallet(&mut reopened_db).unwrap();
    let reopened_snapshot = snapshot_from(&reopened, &reopened_db, None, true, None).unwrap();
    assert_eq!(reopened_snapshot.balance.total, 350_000);
    assert_eq!(reopened_snapshot.transactions.len(), 2);
    assert_eq!(
        load_recovery_scan_record(&reopened_db)
            .unwrap()
            .unwrap()
            .status
            .status,
        "completed"
    );
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn current_tip_initial_scan_allows_later_bitcoin_core_sync() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    let keys = test_keys();
    let metadata = metadata(&keys);
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let tip_before_scan = u32::try_from(rpc.get_block_count().unwrap()).unwrap();
    let settings = RecoveryScanSettingsDto {
        birthday_height: tip_before_scan,
        gap_limit: 20,
    };
    db.execute(
        "INSERT INTO groot_recovery_settings (singleton, birthday_height, gap_limit)
         VALUES (1, ?1, ?2)",
        params![settings.birthday_height, settings.gap_limit],
    )
    .unwrap();
    let mut wallet = Wallet::create(metadata.external_descriptor, metadata.internal_descriptor)
        .network(Network::Regtest)
        .lookahead(settings.gap_limit)
        .create_wallet(&mut db)
        .unwrap();
    let cancel = AtomicBool::new(false);
    full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut wallet,
        &mut db,
        &settings,
        "current-tip-run",
        &cancel,
    )
    .unwrap();
    finish_recovery_scan_record(&db, "current-tip-run", "completed").unwrap();
    let initial_snapshot =
        snapshot_from(&wallet, &db, Some(now().to_string()), true, None).unwrap();
    assert_eq!(initial_snapshot.chain_tip.height, tip_before_scan);
    assert!(has_completed_sync(&db).unwrap());

    let mining = rpc
        .get_new_address(Some("groot current-tip follow-up"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    rpc.generate_to_address(1, &mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let refreshed = snapshot_from(&wallet, &db, Some(now().to_string()), true, None).unwrap();

    assert_eq!(refreshed.chain_tip.height, tip_before_scan + 1);
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn explicit_rescan_waits_when_core_falls_behind_the_wallet_checkpoint() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    let keys = test_keys();
    let metadata = metadata(&keys);
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let birthday = u32::try_from(rpc.get_block_count().unwrap()).unwrap();
    let settings = RecoveryScanSettingsDto {
        birthday_height: birthday,
        gap_limit: 20,
    };
    let mut wallet = Wallet::create(metadata.external_descriptor, metadata.internal_descriptor)
        .network(Network::Regtest)
        .lookahead(settings.gap_limit)
        .create_wallet(&mut db)
        .unwrap();
    let cancel = AtomicBool::new(false);
    full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut wallet,
        &mut db,
        &settings,
        "behind-core-initial",
        &cancel,
    )
    .unwrap();
    finish_recovery_scan_record(&db, "behind-core-initial", "completed").unwrap();
    let verified_tip = wallet.latest_checkpoint();

    let invalidated = rpc.get_best_block_hash().unwrap();
    rpc.invalidate_block(&invalidated).unwrap();
    let result = full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut wallet,
        &mut db,
        &settings,
        "behind-core-retry",
        &cancel,
    );
    rpc.reconsider_block(&invalidated).unwrap();

    let error = result.unwrap_err();
    assert_eq!(error.code, "node_syncing");
    assert_eq!(wallet.latest_checkpoint(), verified_tip);
    drop(wallet);
    let persisted = load_wallet(&mut db).unwrap();
    assert_eq!(persisted.latest_checkpoint(), verified_tip);
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn birthday_only_checkpoint_recovers_after_a_deep_reorg() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    let keys = test_keys();
    let metadata = metadata(&keys);
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let birthday = u32::try_from(rpc.get_block_count().unwrap()).unwrap();
    let settings = RecoveryScanSettingsDto {
        birthday_height: birthday,
        gap_limit: 20,
    };
    db.execute(
        "INSERT INTO groot_recovery_settings (singleton, birthday_height, gap_limit)
         VALUES (1, ?1, ?2)",
        params![settings.birthday_height, settings.gap_limit],
    )
    .unwrap();
    let mut wallet = Wallet::create(metadata.external_descriptor, metadata.internal_descriptor)
        .network(Network::Regtest)
        .lookahead(settings.gap_limit)
        .create_wallet(&mut db)
        .unwrap();
    let cancel = AtomicBool::new(false);
    full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut wallet,
        &mut db,
        &settings,
        "deep-reorg-initial",
        &cancel,
    )
    .unwrap();
    finish_recovery_scan_record(&db, "deep-reorg-initial", "completed").unwrap();
    snapshot_from(&wallet, &db, Some(now().to_string()), true, None).unwrap();

    let fork_point = rpc
        .get_block_hash(u64::from(birthday.saturating_sub(1)))
        .unwrap();
    rpc.invalidate_block(&fork_point).unwrap();
    let mining = rpc
        .get_new_address(Some("groot deep reorg recovery"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    rpc.generate_to_address(3, &mining).unwrap();

    let (active_checkpoint, rewound) =
        rewind_stale_core_checkpoints(rpc.as_ref(), &wallet).unwrap();
    assert!(rewound);
    let mut emitter = Emitter::new(
        Arc::clone(&rpc),
        active_checkpoint,
        settings.birthday_height,
        wallet
            .transactions()
            .filter(|transaction| transaction.chain_position.is_unconfirmed()),
    );
    while let Some(block) = emitter.next_block().unwrap() {
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .unwrap();
    }
    let mempool = emitter.mempool().unwrap();
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    wallet.persist(&mut db).unwrap();

    assert_eq!(wallet.latest_checkpoint().height(), birthday + 1);
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn existing_wallet_can_repeat_full_rescan_from_an_earlier_birthday() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    let keys = test_keys();
    let metadata = metadata(&keys);
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let initial_birthday = u32::try_from(rpc.get_block_count().unwrap()).unwrap();
    let mut wallet = Wallet::create(metadata.external_descriptor, metadata.internal_descriptor)
        .network(Network::Regtest)
        .lookahead(20)
        .create_wallet(&mut db)
        .unwrap();
    let cancel = AtomicBool::new(false);
    let initial_settings = RecoveryScanSettingsDto {
        birthday_height: initial_birthday,
        gap_limit: 20,
    };
    full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut wallet,
        &mut db,
        &initial_settings,
        "existing-wallet-initial",
        &cancel,
    )
    .unwrap();
    finish_recovery_scan_record(&db, "existing-wallet-initial", "completed").unwrap();
    snapshot_from(&wallet, &db, Some(now().to_string()), true, None).unwrap();

    let mining = rpc
        .get_new_address(Some("groot existing-wallet rescan"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    rpc.generate_to_address(3, &mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let tip_before_repeat = wallet.latest_checkpoint().height();
    let repeated_settings = RecoveryScanSettingsDto {
        birthday_height: initial_birthday.saturating_sub(5),
        gap_limit: 20,
    };
    full_rescan_loaded_wallet(
        Arc::clone(&rpc),
        &mut wallet,
        &mut db,
        &repeated_settings,
        "existing-wallet-repeat",
        &cancel,
    )
    .unwrap();
    finish_recovery_scan_record(&db, "existing-wallet-repeat", "completed").unwrap();
    let repeated = snapshot_from(&wallet, &db, Some(now().to_string()), true, None).unwrap();

    assert_eq!(repeated.chain_tip.height, tip_before_repeat);
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn funded_rbf_and_cpfp_cross_groot_proposal_boundaries() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = Arc::new(rpc());
    assert!(core_incremental_relay_fee(rpc.as_ref()).unwrap() > 0);
    let keys = test_keys();
    let metadata = metadata(&keys);
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = Wallet::create(
        metadata.external_descriptor.clone(),
        metadata.internal_descriptor.clone(),
    )
    .network(Network::Regtest)
    .create_wallet(&mut db)
    .unwrap();
    let receive = wallet.reveal_next_address(KeychainKind::External);
    wallet.persist(&mut db).unwrap();
    rpc.call::<Txid>(
        "sendtoaddress",
        &[
            serde_json::json!(receive.address.to_string()),
            serde_json::json!(0.01),
        ],
    )
    .unwrap();
    let mining = rpc
        .get_new_address(Some("groot boundary"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    rpc.generate_to_address(1, &mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));

    let destination = rpc
        .get_new_address(Some("groot destination"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let mut builder = wallet.build_tx();
    builder
        .add_recipient(destination.script_pubkey(), Amount::from_sat(250_000))
        .fee_rate(FeeRate::from_sat_per_vb(2).unwrap());
    let mut original = builder.finish().unwrap();
    sign_original(&keys, &mut original);
    assert!(wallet
        .finalize_psbt(&mut original, SignOptions::default())
        .unwrap());
    let original_tx = original.extract_tx().unwrap();
    let original_txid = broadcast_transaction_with_rpc(&rpc, &original_tx).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));

    let incremental_fee = rpc.get_network_info().unwrap().incremental_fee.to_sat();
    let (applied, rate) = validate_acceleration_rate("5").unwrap();
    let rbf = prepare_persisted_multisig_acceleration(
        &mut db,
        &metadata,
        original_txid,
        AccelerationMethod::Rbf,
        None,
        AccelerationRatePolicy {
            applied,
            rate,
            rbf_quote_request: Some(("5".to_owned(), incremental_fee, Some(5.0))),
            cpfp_quote_request: None,
        },
    )
    .unwrap();
    let resumed = prepare_persisted_multisig_acceleration(
        &mut db,
        &metadata,
        original_txid,
        AccelerationMethod::Rbf,
        None,
        AccelerationRatePolicy {
            applied,
            rate,
            rbf_quote_request: Some(("5".to_owned(), incremental_fee, Some(5.0))),
            cpfp_quote_request: None,
        },
    )
    .unwrap();
    assert_eq!(resumed.proposal_id, rbf.proposal_id);

    let first = import_multisig_proposal_in_db(
        &mut db,
        &metadata,
        &rbf.proposal_id,
        &sign_with(&keys, 0, &rbf.psbt),
    )
    .unwrap();
    assert_eq!(first.signed, 1);
    assert_eq!(first.status, "collecting");

    drop(wallet);
    drop(db);
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = load_wallet(&mut db).unwrap();
    let restored = load_multisig_proposal(&mut db, &metadata, &rbf.proposal_id).unwrap();
    assert_eq!(restored.signed, 1);
    let ready = import_multisig_proposal_in_db(
        &mut db,
        &metadata,
        &rbf.proposal_id,
        &sign_with(&keys, 1, &restored.psbt),
    )
    .unwrap();
    assert!(ready.can_finalize);
    assert_eq!(ready.status, "ready");
    let replacement_tx =
        finalized_multisig_proposal_transaction(&mut db, &metadata, &rbf.proposal_id, &ready.psbt)
            .unwrap();

    let original_block = rpc.generate_to_address(1, &mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    assert_eq!(
        broadcast_transaction_with_rpc(&rpc, &original_tx).unwrap(),
        original_txid,
        "an active-chain duplicate remains an idempotent success"
    );
    let race = broadcast_transaction_with_rpc(&rpc, &replacement_tx).unwrap_err();
    assert_eq!(race.code, "broadcast_failed");
    assert_eq!(
        proposal_status(&db, &rbf.proposal_id),
        ("ready".to_owned(), None)
    );

    rpc.invalidate_block(&original_block[0]).unwrap();
    mine_empty_block(&rpc, &mining);
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let replacement_txid = broadcast_transaction_with_rpc(&rpc, &replacement_tx).unwrap();
    assert_eq!(
        broadcast_transaction_with_rpc(&rpc, &replacement_tx).unwrap(),
        replacement_txid,
        "duplicate broadcast must be idempotent at Groot's broadcast boundary"
    );
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let snapshot = commit_multisig_broadcast(
        &mut db,
        &replacement_tx,
        &rbf.proposal_id,
        &replacement_txid,
        Some(now().to_string()),
        None,
    )
    .unwrap();
    assert_eq!(
        snapshot
            .transactions
            .iter()
            .filter(|transaction| {
                transaction.id == original_txid.to_string()
                    || transaction.id == replacement_txid.to_string()
            })
            .count(),
        1,
        "an RBF conflict set is one payment row"
    );
    let representative = snapshot
        .transactions
        .iter()
        .find(|transaction| transaction.id == replacement_txid.to_string())
        .unwrap();
    assert_eq!(representative.status, "pending");
    assert_eq!(
        representative.replaces.as_deref(),
        Some(original_txid.to_string().as_str())
    );
    let history = representative.rbf_history.as_ref().unwrap();
    assert_eq!(history.original_txid, original_txid.to_string());
    assert_eq!(history.replacement_txid, replacement_txid.to_string());
    assert_eq!(history.outcome, "replacement_broadcast");
    assert_eq!(
        proposal_status(&db, &rbf.proposal_id),
        ("broadcast".to_owned(), Some(replacement_txid.to_string()))
    );
    assert!(broadcast_transaction_with_rpc(&rpc, &original_tx).is_err());

    drop(wallet);
    drop(db);
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = load_wallet(&mut db).unwrap();
    assert_eq!(
        proposal_status(&db, &rbf.proposal_id),
        ("broadcast".to_owned(), Some(replacement_txid.to_string()))
    );

    let parent_fee = rpc.get_mempool_entry(&replacement_txid).unwrap().fees.base;
    let (applied, rate) = validate_acceleration_rate("9").unwrap();
    let cpfp = prepare_persisted_multisig_acceleration(
        &mut db,
        &metadata,
        replacement_txid,
        AccelerationMethod::Cpfp,
        Some(parent_fee),
        AccelerationRatePolicy {
            applied,
            rate,
            rbf_quote_request: None,
            cpfp_quote_request: Some("9".to_owned()),
        },
    )
    .unwrap();
    let first = import_multisig_proposal_in_db(
        &mut db,
        &metadata,
        &cpfp.proposal_id,
        &sign_with(&keys, 0, &cpfp.psbt),
    )
    .unwrap();
    let ready = import_multisig_proposal_in_db(
        &mut db,
        &metadata,
        &cpfp.proposal_id,
        &sign_with(&keys, 1, &first.psbt),
    )
    .unwrap();
    let child_tx =
        finalized_multisig_proposal_transaction(&mut db, &metadata, &cpfp.proposal_id, &ready.psbt)
            .unwrap();
    let child_txid = broadcast_transaction_with_rpc(&rpc, &child_tx).unwrap();
    let parent_entry = rpc.get_mempool_entry(&replacement_txid).unwrap();
    let child_entry = rpc.get_mempool_entry(&child_txid).unwrap();
    assert_eq!(child_entry.depends, vec![replacement_txid]);
    assert!(
        (parent_entry.fees.base + child_entry.fees.base).to_sat()
            >= (parent_entry.vsize + child_entry.vsize).saturating_mul(8)
    );
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    commit_multisig_broadcast(
        &mut db,
        &child_tx,
        &cpfp.proposal_id,
        &child_txid,
        Some(now().to_string()),
        None,
    )
    .unwrap();
    assert_eq!(
        proposal_status(&db, &cpfp.proposal_id),
        ("broadcast".to_owned(), None)
    );

    rpc.generate_to_address(1, &mining).unwrap();
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    drop(wallet);
    drop(db);
    let mut db = Connection::open(&database.0).unwrap();
    init_app_schema(&db).unwrap();
    let wallet = load_wallet(&mut db).unwrap();
    assert!(wallet
        .get_tx(replacement_txid)
        .unwrap()
        .chain_position
        .is_confirmed());
    assert!(wallet
        .get_tx(child_txid)
        .unwrap()
        .chain_position
        .is_confirmed());
    assert_eq!(proposal_status(&db, &cpfp.proposal_id).0, "broadcast");
}
