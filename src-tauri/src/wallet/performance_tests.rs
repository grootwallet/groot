use super::*;
use std::{hint::black_box, io::Write, time::Instant};

const DEFAULT_ADDRESS_ROWS: usize = 10_000;
const DEFAULT_SIGNERS: usize = 5_000;
const MAX_BENCHMARK_ROWS: usize = 100_000;

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
