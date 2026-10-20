use super::multisig_proposal_commands::{
    build_delayed_policy_sweep, build_policy_renewal, finalized_multisig_proposal_transaction,
    import_multisig_proposal_in_db,
};
use super::transaction_commands::{
    core_incremental_relay_fee, prepare_persisted_multisig_acceleration, validate_fee_rate,
    AccelerationRatePolicy,
};
use super::*;
use crate::multisig::{multisig_account_path, CosignerInput, CosignerSource};
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

#[derive(Clone)]
struct TestKey {
    fingerprint: String,
    account_private: Xpriv,
    account_public: Xpub,
}

fn test_keys_with_count(count: u8) -> Vec<TestKey> {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str(multisig_account_path()).unwrap();
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
                derivation_path: multisig_account_path().to_owned(),
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
            derivation_path: multisig_account_path().to_owned(),
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
        None,
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
        None,
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
        None,
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
        None,
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
        None,
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
        None,
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
        None,
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

    // Observe both versions from a separate receiving multisig wallet, as in
    // the reported incoming-RBF false-positive address-reuse case.
    let receiver_database = TemporaryDatabase::new();
    let mut receiver_db = Connection::open(&receiver_database.0).unwrap();
    init_app_schema(&receiver_db).unwrap();
    let receiver_keys = test_keys();
    let mut receiver = Wallet::create(
        descriptor(&receiver_keys, 0, None),
        descriptor(&receiver_keys, 1, None),
    )
    .network(Network::Regtest)
    .create_wallet(&mut receiver_db)
    .unwrap();
    let destination = receiver.reveal_next_address(KeychainKind::External).address;
    receiver.persist(&mut receiver_db).unwrap();
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
    sync(&mut receiver, &mut receiver_db, Arc::clone(&rpc));
    label_provenance::reconcile_wallet_outputs(&receiver, &receiver_db, now()).unwrap();

    let incremental_fee = rpc.get_network_info().unwrap().incremental_fee.to_sat();
    let (applied, rate) = validate_fee_rate("5").unwrap();
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
    let race =
        broadcast_proposal_transaction_with_rpc(&rpc, &db, &rbf.proposal_id, &replacement_tx)
            .unwrap_err();
    assert_eq!(race.code, "transaction_confirmed");
    assert_eq!(
        proposal_status(&db, &rbf.proposal_id),
        ("ready".to_owned(), None)
    );

    rpc.invalidate_block(&original_block[0]).unwrap();
    mine_empty_block(&rpc, &mining);
    sync(&mut wallet, &mut db, Arc::clone(&rpc));
    let replacement_txid =
        broadcast_proposal_transaction_with_rpc(&rpc, &db, &rbf.proposal_id, &replacement_tx)
            .unwrap();
    sync(&mut receiver, &mut receiver_db, Arc::clone(&rpc));
    label_provenance::reconcile_wallet_outputs(&receiver, &receiver_db, now()).unwrap();
    assert_eq!(receiver.transactions().count(), 1);
    assert_eq!(
        receiver_db
            .query_row("SELECT COUNT(*) FROM groot_output_lineage", [], |row| row
                .get::<_, u32>(
                0
            ))
            .unwrap(),
        2
    );
    assert_eq!(
        receiver_db
            .query_row(
                "SELECT SUM(address_reused) FROM groot_output_lineage",
                [],
                |row| row.get::<_, u32>(0)
            )
            .unwrap(),
        0
    );
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
    let (applied, rate) = validate_fee_rate("9").unwrap();
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
    let confirmed_parent_block = rpc.generate_to_address(1, &mining).unwrap();
    let obsolete_child =
        broadcast_proposal_transaction_with_rpc(&rpc, &db, &cpfp.proposal_id, &child_tx)
            .unwrap_err();
    assert_eq!(obsolete_child.code, "transaction_confirmed");
    rpc.invalidate_block(&confirmed_parent_block[0]).unwrap();
    mine_empty_block(&rpc, &mining);
    let child_txid =
        broadcast_proposal_transaction_with_rpc(&rpc, &db, &cpfp.proposal_id, &child_tx).unwrap();
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
    sync(&mut receiver, &mut receiver_db, Arc::clone(&rpc));
    drop(receiver);
    drop(receiver_db);
    let mut receiver_db = Connection::open(&receiver_database.0).unwrap();
    init_app_schema(&receiver_db).unwrap();
    let receiver = load_wallet(&mut receiver_db).unwrap();
    label_provenance::reconcile_wallet_outputs(&receiver, &receiver_db, now()).unwrap();
    assert!(receiver
        .get_tx(replacement_txid)
        .unwrap()
        .chain_position
        .is_confirmed());
    assert_eq!(
        receiver_db
            .query_row(
                "SELECT SUM(address_reused) FROM groot_output_lineage",
                [],
                |row| row.get::<_, u32>(0)
            )
            .unwrap(),
        0
    );
}

fn continuity_metadata(keys: &[TestKey], family: bool) -> MultisigWalletDto {
    let template = if family {
        RecoveryTemplate::FamilyContinuityV1 {
            parents: SpendingPath::new(2, ["signer-0", "signer-1"]),
            child_assistance: SpendingPath::new(1, ["signer-2", "signer-3"]),
            child_inheritance: SpendingPath::new(2, ["signer-4", "signer-5"]),
            executor_signer_id: "signer-6".to_owned(),
        }
    } else {
        RecoveryTemplate::PartnerContinuityV1 {
            owner: SpendingPath::new(2, ["signer-0", "signer-1", "signer-2"]),
            partner: SpendingPath::new(2, ["signer-3", "signer-4"]),
            estate: SpendingPath::new(2, ["signer-5", "signer-6", "signer-7"]),
        }
    };
    let mut metadata = metadata(keys);
    let analysis = analyze_template(&template, &metadata.cosigners).unwrap();
    metadata.external_descriptor = analysis.external_descriptor;
    metadata.internal_descriptor = analysis.internal_descriptor;
    metadata.spending_paths = analysis.paths;
    metadata.policy_type = recovery_policy_type(&template).to_owned();
    metadata.recovery_template = Some(template);
    metadata
}

// Exact fixed-delay policies are exercised against real Core using sparse,
// Core-observed checkpoints. This avoids 52,560 per-block SQLite commits.
#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn funded_continuity_all_named_paths_renew_reorg_and_restore() {
    use bdk_wallet::chain::TxUpdate;
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = rpc();
    // Keep long-delay coinbases out of the Core wallet, avoiding hundreds
    // of thousands of irrelevant wallet records in this disposable fixture.
    let block_destination =
        Address::p2wsh(&bdk_wallet::bitcoin::ScriptBuf::new(), Network::Regtest);
    let mine_bounded = |mut count: u64| {
        while count > 0 {
            let batch = count.min(128);
            // A full year of block-relative policy exceeds Core's two-hour
            // future-timestamp allowance when mined against a fixed clock.
            // Advance only this disposable node's clock, never its block age.
            let header = rpc
                .get_block_header(&rpc.get_best_block_hash().unwrap())
                .unwrap();
            let _: serde_json::Value = rpc
                .call(
                    "setmocktime",
                    &[serde_json::json!(u64::from(header.time) + batch)],
                )
                .unwrap();
            rpc.generate_to_address(batch, &block_destination).unwrap();
            count -= batch;
        }
    };
    let mining = rpc
        .get_new_address(Some("continuity isolated fixture"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    struct Case {
        _database: TemporaryDatabase,
        db: Connection,
        wallet: PersistedWallet<Connection>,
        metadata: MultisigWalletDto,
        keys: Vec<TestKey>,
        index: usize,
        renewal: bool,
        funding: Transaction,
        outpoint: OutPoint,
        proposal: Option<Psbt>,
    }
    let mut cases = Vec::new();
    for family in [false, true] {
        let keys = test_keys_with_count(if family { 7 } else { 8 });
        let metadata = continuity_metadata(&keys, family);
        for case_index in 0..=metadata.spending_paths.len() {
            let renewal = case_index == metadata.spending_paths.len();
            let index = if renewal { 0 } else { case_index };
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
            let receive = wallet
                .reveal_addresses_to(KeychainKind::External, case_index as u32)
                .last()
                .unwrap()
                .address;
            wallet.persist(&mut db).unwrap();
            let txid: Txid = rpc
                .call(
                    "sendtoaddress",
                    &[
                        serde_json::json!(receive.to_string()),
                        serde_json::json!(0.001),
                    ],
                )
                .unwrap();
            let funding = rpc.get_raw_transaction(&txid, None).unwrap();
            let vout = funding
                .output
                .iter()
                .position(|output| output.script_pubkey == receive.script_pubkey())
                .unwrap() as u32;
            cases.push(Case {
                _database: database,
                db,
                wallet,
                metadata: metadata.clone(),
                keys: keys.clone(),
                index,
                renewal,
                funding,
                outpoint: OutPoint { txid, vout },
                proposal: None,
            });
        }
    }
    rpc.generate_to_address(1, &mining).unwrap();
    // All funding is complete. This fixture owns its disposable Core node;
    // unload its funding wallet before mining and disconnecting long chains.
    let funding_wallets: Vec<String> = rpc.call("listwallets", &[]).unwrap();
    for name in funding_wallets {
        let _: serde_json::Value = rpc
            .call("unloadwallet", &[serde_json::json!(name)])
            .unwrap();
    }
    let origin_funding_height = rpc.get_block_count().unwrap() as u32;
    let funding_height = origin_funding_height;
    let observe = |case: &mut Case| {
        let height = rpc.get_block_count().unwrap() as u32;
        // txindex updates asynchronously after a deep reorg. Prove inclusion
        // from the actual canonical block, never an indexed orphan lookup.
        let funding_hash = rpc.get_block_hash(funding_height as u64).unwrap();
        let funding_block = rpc.get_block(&funding_hash).unwrap();
        let confirmed_height = rpc.get_block_header_info(&funding_hash).unwrap().height as u32;
        assert!(funding_block.txdata.iter().any(|tx| tx == &case.funding));
        let mut checkpoint = CheckPoint::new(BlockId {
            height: 0,
            hash: rpc.get_block_hash(0).unwrap(),
        });
        let mut checkpoint_heights: Vec<_> = (origin_funding_height..=confirmed_height)
            .chain(
                case.wallet
                    .latest_checkpoint()
                    .iter()
                    .map(|point| point.height()),
            )
            .filter(|value| *value > 0 && *value <= height)
            .collect();
        checkpoint_heights.push(height.saturating_sub(1));
        checkpoint_heights.push(height);
        checkpoint_heights.sort_unstable();
        checkpoint_heights.dedup();
        for checkpoint_height in checkpoint_heights {
            checkpoint = checkpoint
                .push(BlockId {
                    height: checkpoint_height,
                    hash: rpc.get_block_hash(checkpoint_height as u64).unwrap(),
                })
                .unwrap();
        }
        let mut tx_update = TxUpdate::default();
        tx_update.txs.push(Arc::new(case.funding.clone()));
        tx_update.anchors.insert((
            ConfirmationBlockTime {
                block_id: BlockId {
                    height: confirmed_height,
                    hash: funding_hash,
                },
                confirmation_time: funding_block.header.time as u64,
            },
            case.outpoint.txid,
        ));
        case.wallet
            .apply_update(Update {
                chain: Some(checkpoint),
                tx_update,
                ..Default::default()
            })
            .unwrap();
        case.wallet.persist(&mut case.db).unwrap();
        let snapshot =
            snapshot_from(&case.wallet, &case.db, Some(now().to_string()), true, None).unwrap();
        let observed = snapshot
            .utxos
            .iter()
            .find(|coin| coin.outpoint == case.outpoint.to_string())
            .unwrap();
        assert_eq!(observed.confirmations, height - confirmed_height + 1);
    };
    let mut stages = vec![1];
    for case in &cases {
        let delay = case.metadata.spending_paths[case.index].available_after_blocks;
        if delay > 0 {
            stages.extend([delay - 1, delay, delay + 1]);
        }
    }
    stages.sort_unstable();
    stages.dedup();
    for age in stages {
        eprintln!("Continuity maturity stage: {age} blocks");
        let target = funding_height + age - 1;
        let current = rpc.get_block_count().unwrap() as u32;
        if target > current {
            mine_bounded((target - current) as u64);
        }
        for case in &mut cases {
            observe(case);
            let delay = case.metadata.spending_paths[case.index].available_after_blocks;
            if case.renewal {
                if age == 1 {
                    let (renewal, address) = build_policy_renewal(
                        &mut case.wallet,
                        case.outpoint,
                        FeeRate::from_sat_per_vb(2).unwrap(),
                    )
                    .unwrap();
                    assert!(case.wallet.is_mine(address.script_pubkey()));
                    assert!(!renewal.unsigned_tx.input[0]
                        .sequence
                        .is_relative_lock_time());
                    case.proposal = Some(renewal);
                }
                continue;
            }
            if delay > 0 && age == delay - 1 {
                let premature = build_named_policy_sweep(
                    &mut case.wallet,
                    &case.metadata,
                    case.index,
                    case.outpoint,
                    &mining,
                    FeeRate::from_sat_per_vb(2).unwrap(),
                )
                .unwrap();
                assert!(validate_named_path_current(
                    &case.wallet,
                    &case.db,
                    &case.metadata,
                    &premature,
                    case.index
                )
                .is_err());
            }
            if age == delay.max(1) {
                let psbt = build_named_policy_sweep(
                    &mut case.wallet,
                    &case.metadata,
                    case.index,
                    case.outpoint,
                    &mining,
                    FeeRate::from_sat_per_vb(2).unwrap(),
                )
                .unwrap();
                if delay > 0 {
                    assert_eq!(psbt.unsigned_tx.input[0].sequence.to_consensus_u32(), delay);
                    validate_named_path_current(
                        &case.wallet,
                        &case.db,
                        &case.metadata,
                        &psbt,
                        case.index,
                    )
                    .unwrap();
                    // A two-block fork with a shorter competing tip revokes
                    // maturity; remine the next block to restore it. Existing
                    // funded tests separately cover deep funding re-anchoring.
                    let previous_height = rpc.get_block_count().unwrap();
                    let fork = rpc.get_block_hash(previous_height - 1).unwrap();
                    rpc.invalidate_block(&fork).unwrap();
                    // Distinct coinbase output prevents regenerating the exact
                    // invalidated block while its invalid flag is retained.
                    let fork_script = bdk_wallet::bitcoin::ScriptBuf::from_bytes(vec![
                        0x6a,
                        0x02,
                        u8::from(case.metadata.policy_type == "family_continuity_v1"),
                        case.index as u8,
                    ]);
                    let fork_destination = Address::p2wsh(&fork_script, Network::Regtest);
                    rpc.generate_to_address(1, &fork_destination).unwrap();
                    observe(case);
                    assert!(validate_named_path_current(
                        &case.wallet,
                        &case.db,
                        &case.metadata,
                        &psbt,
                        case.index
                    )
                    .is_err());
                    if case.metadata.policy_type == "partner_continuity_v1" && case.index == 1 {
                        let recipient = Address::from_script(
                            &psbt.unsigned_tx.output[0].script_pubkey,
                            Network::Regtest,
                        )
                        .unwrap();
                        case.db.execute("INSERT INTO groot_proposals (proposal_id,recipient,label,amount,fee,fee_rate,psbt,status,created_at,selection_strategy) VALUES('reorg-gate',?1,'Reorg gate',?2,?3,2,?4,'collecting',?5,'manual')", params![recipient.to_string(), psbt.unsigned_tx.output[0].value.to_sat(), psbt.fee_amount().unwrap().to_sat(), encode_psbt(&psbt), now()]).unwrap();
                        case.db.execute("INSERT INTO groot_proposal_spend_paths(proposal_id,spend_path) VALUES('reorg-gate','delayed')", []).unwrap();
                        let error = finalized_multisig_proposal_transaction(
                            &mut case.db,
                            &case.metadata,
                            "reorg-gate",
                            &encode_psbt(&psbt),
                        )
                        .unwrap_err();
                        assert_eq!(error.code, "immature_spending_path");
                    }
                    mine_bounded(1);
                    observe(case);
                    validate_named_path_current(
                        &case.wallet,
                        &case.db,
                        &case.metadata,
                        &psbt,
                        case.index,
                    )
                    .unwrap();
                }
                case.proposal = Some(psbt);
            }
            if age == delay + 1 && delay > 0 {
                validate_named_path_current(
                    &case.wallet,
                    &case.db,
                    &case.metadata,
                    case.proposal.as_ref().unwrap(),
                    case.index,
                )
                .unwrap();
            }
        }
    }
    for mut case in cases {
        let mut psbt = case.proposal.take().unwrap();
        let selected = case.metadata.spending_paths[case.index].clone();
        let (_, eligible) =
            signer_fingerprints_for_ids(&case.metadata, &selected.signer_ids).unwrap();
        let signers: Vec<usize> = match (&case.metadata.recovery_template, case.index) {
            (Some(RecoveryTemplate::PartnerContinuityV1 { .. }), 1) => vec![3, 4],
            (Some(RecoveryTemplate::PartnerContinuityV1 { .. }), 2) => vec![3],
            (Some(RecoveryTemplate::PartnerContinuityV1 { .. }), 3) => vec![5, 6],
            (Some(RecoveryTemplate::FamilyContinuityV1 { .. }), 1) => vec![2, 3, 0],
            (Some(RecoveryTemplate::FamilyContinuityV1 { .. }), 2) => vec![4, 6],
            _ => vec![0, 1],
        };
        observe(&mut case);
        let proposal_id = Uuid::new_v4().to_string();
        let amount = psbt.unsigned_tx.output[0].value.to_sat();
        let recipient =
            Address::from_script(&psbt.unsigned_tx.output[0].script_pubkey, Network::Regtest)
                .unwrap();
        let fee = psbt.fee_amount().unwrap().to_sat();
        case.db.execute("INSERT INTO groot_proposals (proposal_id,recipient,label,amount,fee,fee_rate,psbt,status,created_at,selection_strategy) VALUES(?1,?2,'Continuity isolated test',?3,?4,2,?5,'collecting',?6,'manual')", params![proposal_id, recipient.to_string(), amount, fee, encode_psbt(&psbt), now()]).unwrap();
        if case.index > 0 {
            case.db.execute("INSERT INTO groot_proposal_spend_paths(proposal_id,spend_path) VALUES(?1,'delayed')", [&proposal_id]).unwrap();
        }
        for (position, signer) in signers.into_iter().enumerate() {
            let external = case.metadata.external_descriptor.replace(
                &case.keys[signer].account_public.to_string(),
                &case.keys[signer].account_private.to_string(),
            );
            let internal = case.metadata.internal_descriptor.replace(
                &case.keys[signer].account_public.to_string(),
                &case.keys[signer].account_private.to_string(),
            );
            let signing_wallet = Wallet::create(external, internal)
                .network(Network::Regtest)
                .create_wallet_no_persist()
                .unwrap();
            let mut returned = psbt.clone();
            signing_wallet
                .sign(
                    &mut returned,
                    SignOptions {
                        trust_witness_utxo: true,
                        try_finalize: false,
                        ..Default::default()
                    },
                )
                .unwrap();
            let progress = import_multisig_proposal_in_db(
                &mut case.db,
                &case.metadata,
                &proposal_id,
                &encode_psbt(&returned),
            )
            .unwrap();
            if (position == 0 && selected.threshold > 1)
                || (matches!(
                    case.metadata.recovery_template,
                    Some(RecoveryTemplate::FamilyContinuityV1 { .. })
                ) && case.index == 1
                    && position == 1)
            {
                assert!(!progress.can_finalize);
            }
            // Reopen actual SQLite proposal/wallet state after each partial signature.
            let mut reopened_db = Connection::open(&case._database.0).unwrap();
            let reopened =
                load_multisig_proposal(&mut reopened_db, &case.metadata, &proposal_id).unwrap();
            psbt = decode_psbt(&reopened.psbt).unwrap();
            assert_eq!(
                reopened.spending_path_details.as_ref().unwrap().index,
                case.index
            );
        }
        assert!(path_signature_quorum(
            &case.metadata,
            case.index,
            &signature_progress(
                &psbt,
                &eligible
                    .iter()
                    .map(|fp| Fingerprint::from_str(fp).unwrap())
                    .collect::<Vec<_>>(),
                selected.threshold
            )
            .unwrap()
            .signed_fingerprints
        ));
        if !case.renewal && case.index > 0 {
            validate_named_path_current(&case.wallet, &case.db, &case.metadata, &psbt, case.index)
                .unwrap();
        }
        assert!(case
            .wallet
            .finalize_psbt(&mut psbt, SignOptions::default())
            .unwrap());
        let transaction = psbt.extract_tx().unwrap();
        rpc.send_raw_transaction(&transaction).unwrap();
        let block = rpc.generate_to_address(1, &mining).unwrap()[0];
        assert!(rpc
            .get_block(&block)
            .unwrap()
            .txdata
            .iter()
            .any(|tx| tx.compute_txid() == transaction.compute_txid()));
        // A clean descriptor reconstruction retains exact receive and change scripts.
        let recovered = Wallet::create(
            case.metadata.external_descriptor.clone(),
            case.metadata.internal_descriptor.clone(),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
        for keychain in [KeychainKind::External, KeychainKind::Internal] {
            assert_eq!(
                recovered.peek_address(keychain, 0).address,
                case.wallet.peek_address(keychain, 0).address
            );
        }
    }
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn funded_continuity_descriptors_restore_history_in_core() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let rpc = rpc();
    let funding_name =
        std::env::var("GROOT_REGTEST_WALLET").unwrap_or_else(|_| "groot-dev".to_owned());
    let loaded: Vec<String> = rpc.call("listwallets", &[]).unwrap();
    if !loaded.contains(&funding_name) {
        let _: serde_json::Value = rpc
            .call("loadwallet", &[serde_json::json!(funding_name)])
            .unwrap();
    }
    let wallet_rpc = |name: &str| {
        let port = std::env::var("GROOT_RPC_PORT").unwrap_or_else(|_| "18443".to_owned());
        Client::new(
            &format!("http://127.0.0.1:{port}/wallet/{name}"),
            Auth::CookieFile(regtest_dir().join("regtest/.cookie")),
        )
        .unwrap()
    };
    let funder = wallet_rpc(&funding_name);
    let mining = funder
        .get_new_address(None, None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    for family in [false, true] {
        let keys = test_keys_with_count(if family { 7 } else { 8 });
        let metadata = continuity_metadata(&keys, family);
        let wallet = Wallet::create(
            metadata.external_descriptor.clone(),
            metadata.internal_descriptor.clone(),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
        let receive = wallet.peek_address(KeychainKind::External, 0).address;
        let funding: Txid = funder
            .call(
                "sendtoaddress",
                &[
                    serde_json::json!(receive.to_string()),
                    serde_json::json!(0.001),
                ],
            )
            .unwrap();
        rpc.generate_to_address(1, &mining).unwrap();
        let name = if family {
            "continuity-family-restore"
        } else {
            "continuity-partner-restore"
        };
        let _: serde_json::Value = rpc
            .call(
                "createwallet",
                &[
                    serde_json::json!(name),
                    serde_json::json!(true),
                    serde_json::json!(true),
                    serde_json::json!(""),
                    serde_json::json!(false),
                    serde_json::json!(true),
                    serde_json::json!(false),
                ],
            )
            .unwrap();
        let restored = wallet_rpc(name);
        let mut imports = Vec::new();
        for (descriptor, internal, keychain) in [
            (&metadata.external_descriptor, false, KeychainKind::External),
            (&metadata.internal_descriptor, true, KeychainKind::Internal),
        ] {
            let info: serde_json::Value = rpc
                .call("getdescriptorinfo", &[serde_json::json!(descriptor)])
                .unwrap();
            assert_eq!(info["issolvable"], true);
            assert_eq!(info["hasprivatekeys"], false);
            let canonical = info["descriptor"].as_str().unwrap();
            let addresses: Vec<String> = rpc
                .call(
                    "deriveaddresses",
                    &[serde_json::json!(canonical), serde_json::json!([0, 0])],
                )
                .unwrap();
            assert_eq!(
                addresses,
                vec![wallet.peek_address(keychain, 0).address.to_string()]
            );
            imports.push(serde_json::json!({"desc": canonical, "timestamp": 0, "range": [0, 10], "internal": internal, "active": true}));
        }
        let results: Vec<serde_json::Value> = restored
            .call("importdescriptors", &[serde_json::json!(imports)])
            .unwrap();
        assert!(results.iter().all(|result| result["success"] == true));
        let coins: Vec<serde_json::Value> = restored.call("listunspent", &[]).unwrap();
        assert!(coins
            .iter()
            .any(|coin| coin["txid"].as_str() == Some(&funding.to_string())
                && coin["address"].as_str() == Some(&receive.to_string())));
        let history: Vec<serde_json::Value> = restored.call("listtransactions", &[]).unwrap();
        assert!(history
            .iter()
            .any(|tx| tx["txid"].as_str() == Some(&funding.to_string())));
        let _: serde_json::Value = rpc
            .call("unloadwallet", &[serde_json::json!(name)])
            .unwrap();
    }
}
