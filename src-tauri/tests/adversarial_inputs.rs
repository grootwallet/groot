use groot_lib::{
    bsms::DescriptorRecord,
    external_signer::{parse_import, SignerSource},
    proposal, ur_transport,
};

fn hostile_text_corpus() -> Vec<String> {
    let mut corpus = vec![
        String::new(),
        "\0".into(),
        " \t\r\n".into(),
        "not-a-psbt".into(),
        "cHNidP8=".into(),
        "ur:crypto-seed/invalid".into(),
        "ur:crypto-psbt/".into(),
        "{\"xpub\":\"tpub\",\"xpub\":\"xprv\"}".into(),
        format!("{}0{}", "[".repeat(512), "]".repeat(512)),
        "💥\u{202e}秘密\r\nName: injected".repeat(64),
        "A".repeat(8 * 1024),
    ];

    // Fixed xorshift state makes failures exactly reproducible without pulling
    // a random/fuzzing dependency into the release dependency graph.
    let mut state = 0x4d59_5df4_d0f3_3173_u64;
    for length in [1_usize, 2, 3, 7, 31, 127, 511, 2047, 4095] {
        for _ in 0..16 {
            let mut value = String::with_capacity(length);
            for _ in 0..length {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                value.push(char::from(0x20 + (state % 95) as u8));
            }
            corpus.push(value);
        }
    }
    corpus
}

#[test]
fn hostile_text_is_rejected_by_every_public_import_boundary_without_panicking() {
    for (index, input) in hostile_text_corpus().iter().enumerate() {
        assert!(
            proposal::decode_psbt(input).is_err(),
            "hostile PSBT corpus entry {index} was accepted"
        );
        assert!(
            DescriptorRecord::parse(input).is_err(),
            "hostile BSMS corpus entry {index} was accepted"
        );
        assert!(
            parse_import(input, "Corpus signer", SignerSource::File).is_err(),
            "hostile signer corpus entry {index} was accepted"
        );
        assert!(
            ur_transport::decode_psbt(std::slice::from_ref(input)).is_err(),
            "hostile UR corpus entry {index} was accepted"
        );
    }
}
