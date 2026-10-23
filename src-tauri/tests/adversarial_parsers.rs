//! Reproducible bounded mutation corpus. Synthetic data only; no I/O or signing.
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_wallet::bitcoin::{
    absolute, transaction, Amount, OutPoint, Psbt, ScriptBuf, Sequence, Transaction, TxIn, TxOut,
    Witness,
};
use groot_lib::{
    bsms::{DescriptorRecord, MAX_BSMS_BYTES},
    coordination::{PairingInvitation, MAX_COORDINATION_RECORD_BYTES},
    coordination_transport::{self, CoordinationUrType},
    proposal::{decode_psbt, encode_psbt},
    ur_transport,
};

fn fixture() -> Psbt {
    Psbt::from_unsigned_tx(Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::null(),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::MAX,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(1),
            script_pubkey: ScriptBuf::new(),
        }],
    })
    .unwrap()
}

#[test]
fn bounded_psbt_mutation_corpus_never_panics_or_accepts_truncated_transactions() {
    let original = fixture();
    let raw = original.serialize();
    let encoded = encode_psbt(&original);
    assert_eq!(decode_psbt(&encoded).unwrap(), original);
    // Every truncation of this compact, map-free fixture must reject.
    for length in 0..raw.len() {
        assert!(decode_psbt(&BASE64.encode(&raw[..length])).is_err());
    }
    for index in 0..raw.len() {
        for mask in [1, 0x80, 0xff] {
            let mut bytes = raw.clone();
            bytes[index] ^= mask;
            if let Ok(parsed) = decode_psbt(&BASE64.encode(bytes)) {
                assert_eq!(decode_psbt(&encode_psbt(&parsed)).unwrap(), parsed);
            }
        }
    }
    assert!(decode_psbt(&"A".repeat(2_097_153)).is_err());
}

#[test]
fn bounded_ur_mutations_reject_corruption_and_preserve_exact_psbt() {
    let encoded = encode_psbt(&fixture());
    for size in [50, 100, 200, 400] {
        let frames = ur_transport::encode_psbt(&encoded, size).unwrap();
        assert_eq!(ur_transport::decode_psbt(&frames).unwrap(), encoded);
        let mut reversed = frames.clone();
        reversed.reverse();
        reversed.extend(frames.clone());
        assert_eq!(ur_transport::decode_psbt(&reversed).unwrap(), encoded);
        for index in 0..frames[0].len() {
            let mut corrupted = frames[0].clone().into_bytes();
            corrupted[index] = b'!';
            assert!(ur_transport::decode_psbt(&[String::from_utf8(corrupted).unwrap()]).is_err());
        }
    }
    assert!(
        ur_transport::decode_psbt(&vec![String::new(); ur_transport::MAX_UR_FRAMES + 1]).is_err()
    );
    assert!(
        ur_transport::decode_psbt(&["a".repeat(ur_transport::MAX_UR_FRAME_BYTES + 1)]).is_err()
    );
}

#[test]
fn bounded_descriptor_and_pairing_hostile_text_corpus_rejects_without_side_effects() {
    let seeds = [
        "",
        "BSMS 1.0\n",
        "BSMS 1.0\nxprv-invalid\n/0/*,/1/*\nsynthetic",
        "{\"version\":255}",
        "{\"version\":1,\"network\":\"mainnet\"}",
        "\0",
        "\r\n",
        "💥",
    ];
    for seed in seeds {
        for repetitions in [1, 2, 16, 256] {
            let text = seed.repeat(repetitions);
            assert!(DescriptorRecord::parse(&text).is_err());
            assert!(PairingInvitation::parse_json(&text, 1).is_err());
        }
    }
    assert!(DescriptorRecord::parse(&"a".repeat(MAX_BSMS_BYTES + 1)).is_err());
    assert!(
        PairingInvitation::parse_json(&"a".repeat(MAX_COORDINATION_RECORD_BYTES + 1), 1).is_err()
    );
    // Framing is never authentication. Wrong QR types reject even valid payload bytes.
    for kind in [
        CoordinationUrType::Invitation,
        CoordinationUrType::Bsms,
        CoordinationUrType::Wallet,
    ] {
        let frames = coordination_transport::encode(kind, b"synthetic record", 50).unwrap();
        assert_eq!(
            coordination_transport::decode(kind, &frames).unwrap(),
            b"synthetic record"
        );
        for other in [
            CoordinationUrType::Invitation,
            CoordinationUrType::Bsms,
            CoordinationUrType::Wallet,
        ] {
            if other != kind {
                assert!(coordination_transport::decode(other, &frames).is_err());
            }
        }
    }
}
