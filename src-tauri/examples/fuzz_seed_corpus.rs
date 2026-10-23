//! Generate public disposable corpus data; never read a wallet profile.
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_wallet::bitcoin::{
    absolute, transaction, Amount, OutPoint, Psbt, ScriptBuf, Transaction, TxIn, TxOut,
};
use groot_lib::{
    coordination::{derive_mobile_account, encrypt_bip129, KeyRecord, PairingInvitation},
    proposal, ur_transport,
};
use std::{fs, path::PathBuf};

fn main() {
    let root = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .expect("provide an output corpus directory"),
    );
    for target in ["psbt_roundtrip", "ur_composition", "pairing_records"] {
        fs::create_dir_all(root.join(target)).unwrap();
    }
    let previous = Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: vec![TxIn::default()],
        output: vec![TxOut {
            value: Amount::from_sat(50_000),
            script_pubkey: ScriptBuf::new(),
        }],
    };
    let mut psbt = Psbt::from_unsigned_tx(Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(previous.compute_txid(), 0),
            ..TxIn::default()
        }],
        output: vec![TxOut {
            value: Amount::from_sat(49_000),
            script_pubkey: ScriptBuf::new(),
        }],
    })
    .unwrap();
    psbt.inputs[0].witness_utxo = Some(previous.output[0].clone());
    psbt.inputs[0].non_witness_utxo = Some(previous);
    proposal::prevouts::authenticate_prevouts(&psbt).unwrap();
    let encoded = proposal::encode_psbt(&psbt);
    fs::write(
        root.join("psbt_roundtrip/authenticated-raw"),
        psbt.serialize(),
    )
    .unwrap();
    fs::write(root.join("psbt_roundtrip/authenticated-base64"), &encoded).unwrap();
    fs::write(root.join("ur_composition/authenticated-base64"), &encoded).unwrap();
    let frames = ur_transport::encode_psbt(&encoded, 50).unwrap();
    fs::write(
        root.join("ur_composition/authenticated-frames"),
        frames.join("\n"),
    )
    .unwrap();
    let token = "00112233445566778899aabbccddeeff";
    let invitation = PairingInvitation {
        version: 1,
        network: "regtest".into(),
        session_id: "12345678-1234-1234-1234-123456789abc".into(),
        wallet_name: "Synthetic".into(),
        threshold: 2,
        signer_count: 3,
        derivation_path: "m/48h/1h/0h/2h".into(),
        token: token.into(),
        expires_at: 100,
    };
    let invitation = serde_json::to_vec(&invitation).unwrap();
    fs::write(root.join("pairing_records/invitation"), &invitation).unwrap();
    let frames = groot_lib::coordination_transport::encode(
        groot_lib::coordination_transport::CoordinationUrType::Invitation,
        &invitation,
        50,
    )
    .unwrap();
    fs::write(
        root.join("ur_composition/invitation-frames"),
        frames.join("\n"),
    )
    .unwrap();
    let mnemonic = bip39::Mnemonic::from_entropy(&[0; 32]).unwrap();
    let (fingerprint, account, _) = derive_mobile_account(&mnemonic).unwrap();
    let record = KeyRecord::encode_signed(token, fingerprint, &account, "Synthetic").unwrap();
    fs::write(root.join("pairing_records/key-record"), record.as_bytes()).unwrap();
    fs::write(
        root.join("pairing_records/encrypted-record"),
        encrypt_bip129(token, record.as_bytes()).unwrap(),
    )
    .unwrap();
    let keys = (1_u8..=3)
        .map(|index| {
            let mnemonic = bip39::Mnemonic::from_entropy(&[index; 32]).unwrap();
            let (fingerprint, _, xpub) = derive_mobile_account(&mnemonic).unwrap();
            (fingerprint, xpub)
        })
        .collect::<Vec<_>>();
    let descriptor_for = |branch| {
        let key_text = keys
            .iter()
            .map(|(fingerprint, xpub)| format!("[{fingerprint}/48h/1h/0h/2h]{xpub}/{branch}/*"))
            .collect::<Vec<_>>()
            .join(",");
        format!("wsh(sortedmulti(2,{key_text}))")
            .parse::<bdk_wallet::descriptor::Descriptor<bdk_wallet::descriptor::DescriptorPublicKey>>()
            .unwrap().to_string()
    };
    let external = descriptor_for(0);
    let internal = descriptor_for(1);
    let mut wallet = bdk_wallet::Wallet::create(external.clone(), internal.clone())
        .network(bdk_wallet::bitcoin::Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
    let address = wallet
        .reveal_next_address(bdk_wallet::KeychainKind::External)
        .address
        .to_string();
    let descriptor =
        groot_lib::bsms::DescriptorRecord::from_descriptor_pair(&external, &internal, &address)
            .unwrap();
    fs::write(
        root.join("pairing_records/standard-descriptor"),
        descriptor.encode(),
    )
    .unwrap();
    let signers = keys
        .iter()
        .enumerate()
        .map(|(index, (fingerprint, xpub))| {
            serde_json::json!({
                "id": format!("synthetic-{index}"), "label": format!("Synthetic {index}"),
                "fingerprint": fingerprint.to_string(), "xpub": xpub.to_string(),
                "derivationPath": "m/48'/1'/0'/2'", "source": "qr"
            })
        })
        .collect::<Vec<_>>();
    let public: groot_lib::coordination::PublicWalletRecord = serde_json::from_value(serde_json::json!({
        "version": 2, "network": "regtest", "walletId": "synthetic-wallet", "walletName": "Synthetic",
        "role": "mobile_watch_only", "descriptorRecord": descriptor.encode(),
        "descriptorChecksum": wallet.public_descriptor(bdk_wallet::KeychainKind::External).to_string().rsplit_once('#').unwrap().1, "signers": signers, "mobileSignerFingerprint": null, "createdAt": 1
    })).unwrap();
    public.validate().unwrap();
    fs::write(
        root.join("pairing_records/standard-public-wallet"),
        serde_json::to_vec(&public).unwrap(),
    )
    .unwrap();
    // A raw/base64 ambiguity seed remains a rejection or exact round trip.
    fs::write(root.join("psbt_roundtrip/empty-base64"), BASE64.encode([])).unwrap();
    println!("Generated synthetic parser corpus.");
}
