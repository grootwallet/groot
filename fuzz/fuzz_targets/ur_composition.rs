#![no_main]
use groot_lib::{
    coordination_transport::{self, CoordinationUrType},
    proposal::{decode_psbt, encode_psbt},
    ur_transport,
};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() > 4_195_329 {
        return;
    }
    let Ok(text) = std::str::from_utf8(data) else {
        return;
    };
    // Raw/base64 PSBT seeds bypass the transport checksum barrier, then traverse
    // the real encoder/decoder. Controlled corruptions must be rejected even if
    // the verifier accidentally becomes an always-successful stub.
    if let Ok(mut psbt) = decode_psbt(text) {
        // Construct one authenticated input from the supplied full transaction.
        // This positive oracle also catches an always-rejecting verifier.
        let constructed = psbt
            .inputs
            .first()
            .and_then(|input| input.non_witness_utxo.as_ref())
            .and_then(|previous| {
                previous
                    .output
                    .first()
                    .map(|output| (previous.compute_txid(), output.clone()))
            });
        if let Some((txid, output)) = constructed {
            psbt.inputs.truncate(1);
            psbt.unsigned_tx.input.truncate(1);
            psbt.unsigned_tx.input[0].previous_output.txid = txid;
            psbt.unsigned_tx.input[0].previous_output.vout = 0;
            psbt.inputs[0].witness_utxo = Some(output);
            groot_lib::proposal::prevouts::authenticate_prevouts(&psbt).unwrap();
        }
        let encoded = encode_psbt(&psbt);
        if let Ok(frames) = ur_transport::encode_psbt(&encoded, 4096) {
            let decoded = decode_psbt(&ur_transport::decode_psbt(&frames).unwrap()).unwrap();
            assert_eq!(decoded, psbt);
            if groot_lib::proposal::prevouts::authenticate_prevouts(&decoded).is_ok() {
                let mut missing = decoded.clone();
                missing.inputs[0].non_witness_utxo = None;
                let mut mismatch = decoded.clone();
                mismatch.unsigned_tx.input[0].previous_output.vout = u32::MAX;
                let mut duplicate = decoded.clone();
                duplicate.inputs.push(duplicate.inputs[0].clone());
                duplicate
                    .unsigned_tx
                    .input
                    .push(duplicate.unsigned_tx.input[0].clone());
                for invalid in [missing, mismatch, duplicate] {
                    let encoded = encode_psbt(&invalid);
                    if let Ok(frames) = ur_transport::encode_psbt(&encoded, 4096) {
                        let decoded =
                            decode_psbt(&ur_transport::decode_psbt(&frames).unwrap()).unwrap();
                        assert!(
                            groot_lib::proposal::prevouts::authenticate_prevouts(&decoded).is_err()
                        );
                    }
                }
            }
        }
    }
    let frames = text
        .split('\n')
        .take(1025)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if let Ok(encoded) = ur_transport::decode_psbt(&frames) {
        let psbt = decode_psbt(&encoded).expect("UR accepted bytes that PSBT parsing rejected");
        assert_eq!(decode_psbt(&encode_psbt(&psbt)).unwrap(), psbt);
        let before = psbt.clone();
        let _ = groot_lib::proposal::prevouts::authenticate_prevouts(&psbt);
        assert_eq!(psbt, before);
    }
    for kind in [
        CoordinationUrType::Invitation,
        CoordinationUrType::Bsms,
        CoordinationUrType::Wallet,
    ] {
        if let Ok(bytes) = coordination_transport::decode(kind, &frames) {
            if let Ok(roundtrip) = coordination_transport::encode(kind, &bytes, 400) {
                assert_eq!(
                    coordination_transport::decode(kind, &roundtrip).unwrap(),
                    bytes
                );
            }
        }
    }
});
