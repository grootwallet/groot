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
