#![no_main]
use groot_lib::{
    bsms::DescriptorRecord,
    coordination::{
        decrypt_bip129, encrypt_bip129, KeyRecord, PairingInvitation, PublicWalletRecord,
    },
};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() > 262_145 {
        return;
    }
    let Ok(text) = std::str::from_utf8(data) else {
        return;
    };
    if let Ok(record) = DescriptorRecord::parse(text) {
        assert_eq!(DescriptorRecord::parse(&record.encode()).unwrap(), record);
        let _ = record.standard_policy();
    }
    if let Ok(invitation) = PairingInvitation::parse_json(text, 1) {
        invitation.validate(1).unwrap();
        invitation.validate_after_acceptance().unwrap();
    }
    if let Ok(record) = serde_json::from_str::<PublicWalletRecord>(text) {
        if let Ok(descriptor) = record.validate() {
            DescriptorRecord::parse(&descriptor.encode()).unwrap();
        }
    }
    let _ = KeyRecord::parse(text);
    // Fixed public synthetic token. Random ciphertext must authenticate or reject.
    let token = "00112233445566778899aabbccddeeff";
    if let Ok(plaintext) = decrypt_bip129(token, text) {
        let encrypted = encrypt_bip129(token, &plaintext).unwrap();
        assert_eq!(decrypt_bip129(token, &encrypted).unwrap(), plaintext);
    }
});
