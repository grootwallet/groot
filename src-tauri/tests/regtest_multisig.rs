use bdk_bitcoind_rpc::{
    bitcoincore_rpc::{Auth, Client, RpcApi},
    Emitter,
};
use bdk_wallet::{
    bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        Address, Amount, FeeRate, Network, NetworkKind,
    },
    chain::{BlockId, CheckPoint},
    rusqlite::Connection,
    KeychainKind, PersistedWallet, SignOptions, Wallet,
};
use rand::{rngs::OsRng, RngCore};
use std::{path::PathBuf, str::FromStr, sync::Arc};

fn regtest_dir() -> PathBuf {
    std::env::var_os("SATCHEL_REGTEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.regtest"))
}

fn rpc() -> Client {
    let port = std::env::var("SATCHEL_RPC_PORT").unwrap_or_else(|_| "18443".to_owned());
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

fn sync(wallet: &mut PersistedWallet<Connection>, db: &mut Connection) {
    let rpc = Arc::new(rpc());
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
            .expect("connected block");
        wallet.persist(db).expect("persist block");
    }
    let mempool = emitter.mempool().expect("mempool");
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    wallet.persist(db).expect("persist mempool");
}

fn rescan_from(
    wallet: &mut PersistedWallet<Connection>,
    db: &mut Connection,
    birthday_height: u32,
) {
    let rpc = Arc::new(rpc());
    let checkpoint = CheckPoint::new(BlockId {
        height: 0,
        hash: rpc.get_block_hash(0).expect("regtest genesis"),
    });
    let mut emitter = Emitter::new(
        rpc,
        checkpoint,
        birthday_height,
        wallet
            .transactions()
            .filter(|transaction| transaction.chain_position.is_unconfirmed()),
    );
    while let Some(block) = emitter.next_block().expect("next rescan block") {
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .expect("apply rescan block");
        wallet.persist(db).expect("persist rescan block");
    }
    let mempool = emitter.mempool().expect("rescan mempool");
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    wallet.persist(db).expect("persist rescan mempool");
}

struct TestKey {
    fingerprint: String,
    account_private: Xpriv,
    account_public: Xpub,
}

fn keys() -> Vec<TestKey> {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str("m/48'/1'/0'/2'").unwrap();
    (1_u8..=3)
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

fn descriptor(keys: &[TestKey], branch: u8, private_index: Option<usize>) -> String {
    let encoded = keys
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
    format!("wsh(sortedmulti(2,{encoded}))")
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn funds_builds_signs_and_broadcasts_a_real_two_of_three_psbt() {
    assert!(std::env::var_os("SATCHEL_RUN_REGTEST").is_some());
    let keys = keys();
    let mut db = Connection::open_in_memory().unwrap();
    let mut coordinator = Wallet::create(descriptor(&keys, 0, None), descriptor(&keys, 1, None))
        .network(Network::Regtest)
        .create_wallet(&mut db)
        .expect("watch-only coordinator");
    let receive = coordinator.reveal_next_address(KeychainKind::External);
    coordinator.persist(&mut db).unwrap();

    let rpc = rpc();
    let _: bdk_wallet::bitcoin::Txid = rpc
        .call(
            "sendtoaddress",
            &[
                serde_json::json!(receive.address.to_string()),
                serde_json::json!(0.01),
            ],
        )
        .expect("fund descriptor address");
    let mining = rpc
        .get_new_address(Some("satchel integration"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    rpc.generate_to_address(1, &mining)
        .expect("mine funding transaction");
    sync(&mut coordinator, &mut db);
    assert_eq!(coordinator.balance().confirmed.to_sat(), 1_000_000);

    let destination: Address = rpc
        .get_new_address(Some("satchel destination"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let mut builder = coordinator.build_tx();
    builder
        .add_recipient(destination.script_pubkey(), Amount::from_sat(250_000))
        .fee_rate(FeeRate::from_sat_per_vb(2).unwrap());
    let mut psbt = builder.finish().expect("real funded PSBT");
    assert_eq!(psbt.inputs.len(), 1);
    assert!(!psbt.inputs[0].bip32_derivation.is_empty());

    for signer in 0..2 {
        let signing_wallet = Wallet::create(
            descriptor(&keys, 0, Some(signer)),
            descriptor(&keys, 1, Some(signer)),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .expect("signer wallet");
        assert_eq!(
            signing_wallet
                .public_descriptor(KeychainKind::External)
                .to_string(),
            coordinator
                .public_descriptor(KeychainKind::External)
                .to_string()
        );
        let finalized = signing_wallet
            .sign(
                &mut psbt,
                SignOptions {
                    trust_witness_utxo: true,
                    try_finalize: false,
                    ..SignOptions::default()
                },
            )
            .expect("partial signature");
        assert!(
            !finalized,
            "isolated signers must leave finalization to the coordinator"
        );
        assert_eq!(psbt.inputs[0].partial_sigs.len(), signer + 1);
    }
    assert_eq!(psbt.inputs[0].partial_sigs.len(), 2);
    assert!(coordinator
        .finalize_psbt(&mut psbt, SignOptions::default())
        .expect("finalize"));
    let transaction = psbt.extract_tx().expect("extract finalized transaction");
    let txid = rpc.send_raw_transaction(&transaction).expect("broadcast");
    assert_eq!(txid, transaction.compute_txid());
    sync(&mut coordinator, &mut db);
    assert!(coordinator
        .transactions()
        .any(|transaction| transaction.tx_node.txid == txid));

    let mut replacement_builder = coordinator
        .build_fee_bump(txid)
        .expect("the original transaction signals RBF");
    replacement_builder.fee_rate(FeeRate::from_sat_per_vb(5).unwrap());
    let mut replacement = replacement_builder.finish().expect("replacement PSBT");
    for signer in 0..2 {
        Wallet::create(
            descriptor(&keys, 0, Some(signer)),
            descriptor(&keys, 1, Some(signer)),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap()
        .sign(
            &mut replacement,
            SignOptions {
                trust_witness_utxo: true,
                try_finalize: false,
                ..SignOptions::default()
            },
        )
        .expect("replacement partial signature");
    }
    assert!(coordinator
        .finalize_psbt(&mut replacement, SignOptions::default())
        .expect("finalize replacement"));
    let replacement_tx = replacement.extract_tx().expect("extract replacement");
    let replacement_txid = rpc
        .send_raw_transaction(&replacement_tx)
        .expect("broadcast replacement");
    assert_ne!(replacement_txid, txid);
    sync(&mut coordinator, &mut db);

    let child_input = coordinator
        .list_unspent()
        .filter(|output| output.outpoint.txid == replacement_txid)
        .max_by_key(|output| output.txout.value)
        .expect("replacement has wallet-controlled change");
    let child_outpoint = child_input.outpoint;
    let child_destination = coordinator
        .reveal_next_address(KeychainKind::Internal)
        .address
        .script_pubkey();
    let mut child_builder = coordinator.build_tx();
    child_builder
        .add_utxo(child_outpoint)
        .expect("add CPFP input")
        .manually_selected_only()
        .drain_to(child_destination)
        .fee_rate(FeeRate::from_sat_per_vb(10).unwrap());
    let mut child = child_builder.finish().expect("CPFP PSBT");
    for signer in 0..2 {
        Wallet::create(
            descriptor(&keys, 0, Some(signer)),
            descriptor(&keys, 1, Some(signer)),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap()
        .sign(
            &mut child,
            SignOptions {
                trust_witness_utxo: true,
                try_finalize: false,
                ..SignOptions::default()
            },
        )
        .expect("CPFP partial signature");
    }
    assert!(coordinator
        .finalize_psbt(&mut child, SignOptions::default())
        .expect("finalize CPFP"));
    let child_tx = child.extract_tx().expect("extract CPFP");
    let child_txid = rpc.send_raw_transaction(&child_tx).expect("broadcast CPFP");
    rpc.generate_to_address(1, &mining)
        .expect("mine replacement package");
    sync(&mut coordinator, &mut db);
    assert!(coordinator
        .get_tx(replacement_txid)
        .unwrap()
        .chain_position
        .is_confirmed());
    assert!(coordinator
        .get_tx(child_txid)
        .unwrap()
        .chain_position
        .is_confirmed());

    let expected_balance = coordinator.balance().total();
    let mut recovered_db = Connection::open_in_memory().unwrap();
    let mut recovered = Wallet::create(descriptor(&keys, 0, None), descriptor(&keys, 1, None))
        .network(Network::Regtest)
        .lookahead(50)
        .create_wallet(&mut recovered_db)
        .expect("fresh recovery wallet");
    sync(&mut recovered, &mut recovered_db);
    assert_eq!(recovered.balance().total(), expected_balance);
    assert!(recovered
        .get_tx(child_txid)
        .unwrap()
        .chain_position
        .is_confirmed());
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn birthday_and_gap_limits_omit_then_restore_known_history() {
    assert!(std::env::var_os("SATCHEL_RUN_REGTEST").is_some());
    let keys = keys();
    let external = descriptor(&keys, 0, None);
    let internal = descriptor(&keys, 1, None);
    let mut source_db = Connection::open_in_memory().unwrap();
    let mut source = Wallet::create(external.clone(), internal.clone())
        .network(Network::Regtest)
        .lookahead(50)
        .create_wallet(&mut source_db)
        .expect("source descriptor wallet");
    let addresses = (0..=25)
        .map(|_| source.reveal_next_address(KeychainKind::External).address)
        .collect::<Vec<_>>();
    source.persist(&mut source_db).unwrap();

    let rpc = rpc();
    let mining = rpc
        .get_new_address(Some("satchel rescan mining"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let _: bdk_wallet::bitcoin::Txid = rpc
        .call(
            "sendtoaddress",
            &[
                serde_json::json!(addresses[0].to_string()),
                serde_json::json!(0.001),
            ],
        )
        .expect("fund first address");
    rpc.generate_to_address(1, &mining)
        .expect("mine first payment");
    let first_height = rpc.get_block_count().expect("first payment height") as u32;
    let _: bdk_wallet::bitcoin::Txid = rpc
        .call(
            "sendtoaddress",
            &[
                serde_json::json!(addresses[25].to_string()),
                serde_json::json!(0.002),
            ],
        )
        .expect("fund address beyond default gap");
    rpc.generate_to_address(1, &mining)
        .expect("mine later payment");

    let recover = |lookahead: u32, birthday: u32| {
        let mut db = Connection::open_in_memory().unwrap();
        let mut wallet = Wallet::create(external.clone(), internal.clone())
            .network(Network::Regtest)
            .lookahead(lookahead)
            .create_wallet(&mut db)
            .expect("recovery wallet");
        rescan_from(&mut wallet, &mut db, birthday);
        (
            wallet.balance().total().to_sat(),
            wallet.transactions().count(),
        )
    };

    let late = recover(50, first_height.saturating_add(1));
    assert_eq!(
        late.0, 200_000,
        "late birthday must omit the earlier payment"
    );
    let default_gap = recover(20, 0);
    assert_eq!(default_gap.0, 100_000, "gap 20 must miss index 25 activity");
    let restored = recover(50, 0);
    assert_eq!(
        restored.0, 300_000,
        "restored birthday and gap recover all funds"
    );
    assert_eq!(restored.1, 2, "both payment history entries are restored");
}
