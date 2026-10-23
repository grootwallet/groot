#![no_main]
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use groot_lib::proposal::{decode_psbt, encode_psbt};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() > 1_048_577 {
        return;
    }
    for encoded in [
        BASE64.encode(data),
        String::from_utf8_lossy(data).into_owned(),
    ] {
        if let Ok(psbt) = decode_psbt(&encoded) {
            assert_eq!(decode_psbt(&encode_psbt(&psbt)).unwrap(), psbt);
        }
    }
});
