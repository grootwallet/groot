use super::*;
use std::{hint::black_box, io::Write, time::Instant};

const DEFAULT_ADDRESS_ROWS: usize = 10_000;
const DEFAULT_SIGNERS: usize = 5_000;
const MAX_BENCHMARK_ROWS: usize = 100_000;

thread_local! {
    static SNAPSHOT_STATEMENTS: std::cell::Cell<u64> = const { std::cell::Cell::new(0) };
}

unsafe extern "C" fn count_snapshot_statement(
    _: std::ffi::c_uint,
    _: *mut std::ffi::c_void,
    _: *mut std::ffi::c_void,
    _: *mut std::ffi::c_void,
) -> std::ffi::c_int {
    SNAPSHOT_STATEMENTS.with(|count| count.set(count.get() + 1));
    0
}

#[test]
#[ignore = "synthetic snapshot benchmark; run alone with --ignored --nocapture"]
fn snapshot_history_benchmark() {
    snapshot_history_fixture(
        benchmark_size("GROOT_BENCH_TRANSACTIONS", 100).min(1_000),
        4,
        true,
    );
}

#[test]
fn independent_receive_snapshots_keep_a_linear_statement_budget() {
    for rows in [10, 100] {
        snapshot_history_fixture(rows, 2, false);
    }
}

fn snapshot_history_fixture(rows: usize, samples: usize, report: bool) {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, ScriptBuf, Sequence, TxOut, Witness,
    };
    use bdk_wallet::rusqlite::ffi;

    let mnemonic = Mnemonic::from_entropy(&[0; 32]).unwrap();
    let master = root_key(&mnemonic, "synthetic benchmark").unwrap();
    let mut db = Connection::open_in_memory().unwrap();
    init_app_schema(&db).unwrap();
    let mut wallet = Wallet::create(
        Bip84(master, KeychainKind::External),
        Bip84(master, KeychainKind::Internal),
    )
    .network(NETWORK)
    .create_wallet(&mut db)
    .unwrap();
    for index in 0..rows {
        let address = wallet.reveal_next_address(KeychainKind::External).address;
        let mut previous = [0; 32];
        previous[..8].copy_from_slice(&(index as u64 + 1).to_le_bytes());
        let tx = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::from_byte_array(previous), 0),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(10_000),
                script_pubkey: address.script_pubkey(),
            }],
        };
        wallet.apply_unconfirmed_txs([(tx, index as u64 + 1)]);
    }
    wallet.persist(&mut db).unwrap();
    // Test-only SQLite tracing counts statements without inspecting SQL or values.
    // SAFETY: db stays alive on this thread, the callback dereferences no pointers,
    // and tracing is removed before db is dropped. No production tracing is enabled.
    unsafe {
        assert_eq!(
            ffi::sqlite3_trace_v2(
                db.handle(),
                ffi::SQLITE_TRACE_STMT as u32,
                Some(count_snapshot_statement),
                std::ptr::null_mut()
            ),
            ffi::SQLITE_OK
        );
    }
    for sample in 0..samples {
        SNAPSHOT_STATEMENTS.with(|count| count.set(0));
        let started = Instant::now();
        let snapshot = black_box(snapshot_from(&wallet, &db, None, false, None).unwrap());
        let elapsed = started.elapsed();
        let statements = SNAPSHOT_STATEMENTS.with(std::cell::Cell::get);
        assert_eq!(snapshot.transactions.len(), rows);
        assert_eq!(snapshot.utxos.len(), rows);
        assert_eq!(snapshot.balance.total, rows as u64 * 10_000);
        assert!(
            statements <= 30 * rows as u64 + 10,
            "independent receives exceeded linear SQL budget: {statements} for {rows}"
        );
        if report {
            let _ = writeln!(std::io::stderr(),
            "snapshot_history rows={rows} sample={sample} elapsed_us={} statements={statements}",
            elapsed.as_micros());
        }
    }
    // SAFETY: the same live connection is exclusively owned by this test.
    unsafe {
        ffi::sqlite3_trace_v2(db.handle(), 0, None, std::ptr::null_mut());
    }
}

fn benchmark_size(variable: &str, default: usize) -> usize {
    std::env::var(variable)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
        .clamp(1, MAX_BENCHMARK_ROWS)
}

#[test]
#[ignore = "manual performance benchmark; run with --ignored --nocapture"]
fn receive_history_query_benchmark() {
    let rows = benchmark_size("GROOT_BENCH_ADDRESS_ROWS", DEFAULT_ADDRESS_ROWS);
    let mut db = Connection::open_in_memory().expect("in-memory database");
    init_app_schema(&db).expect("application schema");
    let transaction = db.transaction().expect("benchmark transaction");
    {
        let mut insert = transaction
            .prepare(
                "INSERT INTO groot_addresses
                    (idx, address, label, created_at, state, observed)
                 VALUES (?1, ?2, ?3, ?4, 'used', 1)",
            )
            .expect("address insert");
        for index in 0..rows {
            insert
                .execute(params![
                    index as u32,
                    format!("benchmark-address-{index}"),
                    format!("Benchmark label {index}"),
                    index as u64
                ])
                .expect("insert benchmark address");
        }
    }
    transaction.commit().expect("commit benchmark fixture");

    let started = Instant::now();
    let result = black_box(address_rows(&db, false).expect("read benchmark addresses"));
    let elapsed = started.elapsed();
    assert_eq!(result.len(), rows);
    let _ = writeln!(
        std::io::stderr(),
        "receive_history_query rows={rows} elapsed_ms={} ns_per_row={}",
        elapsed.as_millis(),
        elapsed.as_nanos() / rows as u128
    );
}

#[test]
#[ignore = "manual performance benchmark; run with --ignored --nocapture"]
fn latest_signer_evidence_query_benchmark() {
    let signers = benchmark_size("GROOT_BENCH_SIGNERS", DEFAULT_SIGNERS);
    let mut db = Connection::open_in_memory().expect("in-memory database");
    init_app_schema(&db).expect("application schema");
    let transaction = db.transaction().expect("benchmark transaction");
    {
        let mut insert = transaction
            .prepare(
                "INSERT INTO groot_signer_policy_verifications
                    (signer_fingerprint, device_type, scope, displayed_address, verified_at)
                 VALUES (?1, 'bitbox02', 'policy_and_address', ?2, ?3)",
            )
            .expect("verification insert");
        for index in 0..signers {
            let fingerprint = format!("{:08x}", index as u32);
            for revision in 0..3_u64 {
                insert
                    .execute(params![
                        fingerprint,
                        format!("benchmark-address-{index}"),
                        revision
                    ])
                    .expect("insert benchmark verification");
            }
        }
    }
    transaction.commit().expect("commit benchmark fixture");

    let started = Instant::now();
    let result =
        black_box(signer_policy_verification_rows(&db).expect("read latest signer evidence"));
    let elapsed = started.elapsed();
    assert_eq!(result.len(), signers);
    let _ = writeln!(
        std::io::stderr(),
        "latest_signer_evidence_query signers={signers} events={} elapsed_ms={} ns_per_signer={}",
        signers * 3,
        elapsed.as_millis(),
        elapsed.as_nanos() / signers as u128
    );
}
