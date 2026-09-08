use super::*;
use crate::secure_store::SecureStoreError;
use bdk_bitcoind_rpc::{
    bitcoincore_rpc::{jsonrpc, Auth, Client, RpcApi},
    Emitter,
};
use bdk_wallet::bitcoin::{
    bip32::{DerivationPath, Xpriv, Xpub},
    secp256k1::Secp256k1,
    Address, Amount, FeeRate, NetworkKind, Txid,
};
use bdk_wallet::rusqlite::Connection;
use std::{fs, path::PathBuf, sync::Arc};

#[test]
fn staging_pin_attempts_are_throttled_per_session_and_reset_on_success() {
    let state = AppState::default();
    let session = Uuid::new_v4();
    let other = Uuid::new_v4();
    let wrong: Result<Zeroizing<Vec<u8>>, SecureStoreError> =
        Err(SecureStoreError::InvalidCredential);

    for attempt in 0..4 {
        check_staging_auth_throttle(&state, session).unwrap_or_else(|error| {
            panic!("attempt {attempt} must not be rate limited: {}", error.code)
        });
        record_staging_attempt(&state, session, &wrong).unwrap();
    }
    record_staging_attempt(&state, session, &wrong).unwrap();
    let error = check_staging_auth_throttle(&state, session).unwrap_err();
    assert_eq!(error.code, "rate_limited");
    // Sessions are independent: another pairing session is unaffected.
    check_staging_auth_throttle(&state, other).unwrap();

    let ok: Result<Zeroizing<Vec<u8>>, SecureStoreError> = Ok(Zeroizing::new(vec![1]));
    record_staging_attempt(&state, session, &ok).unwrap();
    check_staging_auth_throttle(&state, session).unwrap();
}

#[test]
fn staging_pin_corruption_is_not_a_guessing_oracle() {
    let state = AppState::default();
    let session = Uuid::new_v4();
    for _ in 0..10 {
        let corrupt: Result<Zeroizing<Vec<u8>>, SecureStoreError> = Err(SecureStoreError::Corrupt);
        record_staging_attempt(&state, session, &corrupt).unwrap();
        check_staging_auth_throttle(&state, session).unwrap();
    }
}

struct HardwareKey {
    fingerprint: String,
    account_private: Xpriv,
    account_public: Xpub,
}

struct TemporaryDatabase(PathBuf);

struct TemporaryPairingDirectory(PathBuf);

impl TemporaryDatabase {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
            "groot-mobile-coordination-{}.sqlite",
            Uuid::new_v4()
        )))
    }
}

impl Drop for TemporaryDatabase {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
        let _ = fs::remove_file(self.0.with_extension("sqlite-shm"));
        let _ = fs::remove_file(self.0.with_extension("sqlite-wal"));
    }
}

impl TemporaryPairingDirectory {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("groot-mobile-pairing-lifecycle-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TemporaryPairingDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn mobile_mnemonic() -> Mnemonic {
    Mnemonic::from_entropy(&[7_u8; 32]).unwrap()
}

fn hardware_keys() -> Vec<HardwareKey> {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str(MULTISIG_ACCOUNT_PATH).unwrap();
    [11_u8, 29]
        .into_iter()
        .map(|value| {
            let master = Xpriv::new_master(NetworkKind::Test, &[value; 32]).unwrap();
            let account_private = master.derive_priv(&secp, &path).unwrap();
            HardwareKey {
                fingerprint: master.fingerprint(&secp).to_string(),
                account_public: Xpub::from_priv(&secp, &account_private),
                account_private,
            }
        })
        .collect()
}

fn coordinated_wallet() -> (
    Mnemonic,
    Vec<HardwareKey>,
    MultisigWalletDto,
    CoordinationMetadata,
) {
    let mnemonic = mobile_mnemonic();
    let (mobile_fingerprint, _, mobile_xpub) = derive_mobile_account(&mnemonic).unwrap();
    let hardware = hardware_keys();
    let mut cosigners = vec![CosignerInput {
        id: format!("mobile-{mobile_fingerprint}"),
        label: "This phone".to_owned(),
        fingerprint: mobile_fingerprint.to_string(),
        xpub: mobile_xpub.to_string(),
        derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
        source: CosignerSource::Qr,
        device_type: Some(MOBILE_DEVICE_TYPE.to_owned()),
    }];
    cosigners.extend(
        hardware
            .iter()
            .enumerate()
            .map(|(index, key)| CosignerInput {
                id: format!("hardware-{index}"),
                label: format!("Hardware signer {}", index + 1),
                fingerprint: key.fingerprint.clone(),
                xpub: key.account_public.to_string(),
                derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
                source: CosignerSource::Virtual,
                device_type: Some("test-hardware".to_owned()),
            }),
    );
    let preview = PolicyInput {
        name: "Mobile coordinated wallet".to_owned(),
        threshold: 2,
        cosigners,
    }
    .preview()
    .unwrap();
    let wallet_id = Uuid::new_v4().to_string();
    let wallet = MultisigWalletDto {
        kind: "multisig".to_owned(),
        name: preview.name,
        threshold: preview.threshold,
        cosigners: preview.cosigners,
        external_descriptor: preview.external_descriptor,
        internal_descriptor: preview.internal_descriptor,
        created_at: "regtest".to_owned(),
        policy_type: "standard".to_owned(),
        recovery_template: None,
        spending_paths: vec![],
    };
    let coordination = CoordinationMetadata {
        version: 1,
        wallet_id,
        role: DeviceRole::MobileCosigner,
        mobile_signer_fingerprint: Some(mobile_fingerprint.to_string()),
        key_protection: "test-only".to_owned(),
        paired_at: 1,
        pairing_session_id: Some(Uuid::new_v4().to_string()),
    };
    (mnemonic, hardware, wallet, coordination)
}

fn mobile_public_wallet_record(wallet: &MultisigWalletDto) -> PublicWalletRecord {
    let mobile = wallet
        .cosigners
        .iter()
        .find(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .unwrap();
    let descriptor = DescriptorRecord::from_descriptor_pair(
        &wallet.external_descriptor,
        &wallet.internal_descriptor,
        &first_multisig_address(wallet).unwrap(),
    )
    .unwrap();
    PublicWalletRecord {
        version: 2,
        network: NETWORK_NAME.to_owned(),
        wallet_id: Uuid::new_v4().to_string(),
        wallet_name: wallet.name.clone(),
        role: DeviceRole::MobileCosigner,
        descriptor_record: descriptor.encode(),
        descriptor_checksum: descriptor_checksum(&wallet.external_descriptor).unwrap(),
        signers: wallet.cosigners.clone(),
        mobile_signer_fingerprint: Some(mobile.fingerprint.clone()),
        created_at: 1,
    }
}

#[test]
fn phone_recovery_requires_the_exact_words_and_complete_wallet_policy() {
    let (mnemonic, _, wallet, _) = coordinated_wallet();
    let record = mobile_public_wallet_record(&wallet);

    let restored = validate_mobile_wallet_record(record.clone(), &mnemonic).unwrap();
    assert_eq!(
        restored.wallet.external_descriptor,
        wallet.external_descriptor
    );
    assert_eq!(restored.wallet.cosigners, wallet.cosigners);

    let wrong_words = Mnemonic::from_entropy(&[19_u8; 32]).unwrap();
    assert_eq!(
        validate_mobile_wallet_record(record.clone(), &wrong_words)
            .unwrap_err()
            .code,
        "wallet_policy_mismatch"
    );

    let mut substituted = record;
    let mobile_index = substituted
        .signers
        .iter()
        .position(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .unwrap();
    let replacement_xpub = substituted.signers[(mobile_index + 1) % substituted.signers.len()]
        .xpub
        .clone();
    substituted.signers[mobile_index].xpub = replacement_xpub;
    assert_eq!(
        validate_mobile_wallet_record(substituted, &mnemonic)
            .unwrap_err()
            .code,
        "wallet_policy_mismatch"
    );
}

fn invitation(expires_at: u64) -> PairingInvitation {
    PairingInvitation {
        version: 1,
        session_id: Uuid::new_v4().to_string(),
        network: NETWORK_NAME.to_owned(),
        wallet_name: "Mobile coordinated wallet".to_owned(),
        threshold: 2,
        signer_count: 3,
        derivation_path: MULTISIG_ACCOUNT_PATH.to_owned(),
        token: "00112233445566778899aabbccddeeff".to_owned(),
        expires_at,
    }
}

fn response_frames(invitation: &PairingInvitation) -> Vec<String> {
    let mnemonic = mobile_mnemonic();
    let (fingerprint, account, _) = derive_mobile_account(&mnemonic).unwrap();
    let record =
        KeyRecord::encode_signed(&invitation.token, fingerprint, &account, "This phone").unwrap();
    let envelope = EncryptedEnvelope {
        version: 1,
        session_id: invitation.session_id.clone(),
        encrypted_record: encrypt_bip129(&invitation.token, record.as_bytes()).unwrap(),
    };
    encode_coordination(
        CoordinationUrType::Bsms,
        &serde_json::to_vec(&envelope).unwrap(),
    )
    .unwrap()
}

#[test]
fn desktop_pairing_response_is_authenticated_expiring_single_use_and_memory_only() {
    let current_time = 1_000;
    let active_invitation = invitation(current_time + 60);
    let frames = response_frames(&active_invitation);
    let mut sessions = HashMap::from([(
        active_invitation.session_id.clone(),
        PendingDesktopPairing {
            invitation: active_invitation,
            accepted_signer: None,
        },
    )]);

    let signer = accept_desktop_response(&mut sessions, &frames, current_time).unwrap();
    assert_eq!(signer.label, "This phone");
    assert_eq!(signer.device_type.as_deref(), Some(MOBILE_DEVICE_TYPE));
    assert_eq!(
        accept_desktop_response(&mut sessions, &frames, current_time)
            .unwrap_err()
            .code,
        "pairing_replay"
    );

    let expired = invitation(current_time);
    let expired_frames = response_frames(&expired);
    sessions.insert(
        expired.session_id.clone(),
        PendingDesktopPairing {
            invitation: expired,
            accepted_signer: None,
        },
    );
    assert_eq!(
        accept_desktop_response(&mut sessions, &expired_frames, current_time)
            .unwrap_err()
            .code,
        "pairing_session_not_found"
    );

    let restarted = HashMap::new();
    let mut restarted = restarted;
    assert_eq!(
        accept_desktop_response(&mut restarted, &frames, current_time)
            .unwrap_err()
            .code,
        "pairing_session_not_found"
    );
}

#[test]
fn desktop_pairing_rejects_a_response_authenticated_with_another_invitation() {
    let current_time = 1_000;
    let expected = invitation(current_time + 60);
    let mut substituted = expected.clone();
    substituted.token = "ffeeddccbbaa99887766554433221100".to_owned();
    let frames = response_frames(&substituted);
    let mut sessions = HashMap::from([(
        expected.session_id.clone(),
        PendingDesktopPairing {
            invitation: expected,
            accepted_signer: None,
        },
    )]);
    assert_eq!(
        accept_desktop_response(&mut sessions, &frames, current_time)
            .unwrap_err()
            .code,
        "pairing_authentication_failed"
    );
    assert!(sessions
        .values()
        .all(|pending| pending.accepted_signer.is_none()));
}

#[test]
fn interrupted_mobile_pairing_restores_or_cleans_from_the_committed_session_set() {
    let directory = TemporaryPairingDirectory::new();
    let wallets = TemporaryPairingDirectory::new();
    let resumable = Uuid::new_v4().to_string();
    let committed = Uuid::new_v4().to_string();
    let committed_active = Uuid::new_v4().to_string();
    let resumable_wallet = Uuid::new_v4();
    let committed_wallet = Uuid::new_v4();
    let committed_active_wallet = Uuid::new_v4();
    let temporary = Uuid::new_v4().to_string();
    let orphan = wallets.0.join(resumable_wallet.to_string());
    fs::create_dir(&orphan).unwrap();
    fs::write(orphan.join("wallet.sqlite"), b"partial profile").unwrap();
    fs::write(
        consuming_mobile_secret_path_in(&directory.0, &resumable, resumable_wallet).unwrap(),
        b"resumable encrypted stage",
    )
    .unwrap();
    fs::write(
        consuming_mobile_secret_path_in(&directory.0, &committed, committed_wallet).unwrap(),
        b"committed encrypted stage",
    )
    .unwrap();
    fs::write(
        pending_mobile_secret_path_in(&directory.0, &committed_active).unwrap(),
        b"committed active stage",
    )
    .unwrap();
    fs::write(
        directory.0.join(format!(".secure-{temporary}.tmp")),
        b"interrupted atomic write",
    )
    .unwrap();

    reconcile_mobile_pairing_directory(
        &directory.0,
        &wallets.0,
        &HashSet::from([committed_wallet, committed_active_wallet]),
        &HashSet::from([
            (committed.clone(), committed_wallet),
            (committed_active.clone(), committed_active_wallet),
        ]),
    )
    .unwrap();

    assert_eq!(
        fs::read(pending_mobile_secret_path_in(&directory.0, &resumable).unwrap()).unwrap(),
        b"resumable encrypted stage"
    );
    assert!(!orphan.exists());
    assert!(
        !consuming_mobile_secret_path_in(&directory.0, &resumable, resumable_wallet)
            .unwrap()
            .exists()
    );
    assert!(
        !consuming_mobile_secret_path_in(&directory.0, &committed, committed_wallet)
            .unwrap()
            .exists()
    );
    assert!(
        !pending_mobile_secret_path_in(&directory.0, &committed_active)
            .unwrap()
            .exists()
    );
    assert!(!directory
        .0
        .join(format!(".secure-{temporary}.tmp"))
        .exists());
    assert_eq!(
        active_mobile_pairing_sessions(&directory.0).unwrap(),
        vec![resumable]
    );
}

#[test]
fn mobile_pairing_cancel_is_idempotent_bounded_and_removes_either_lifecycle_state() {
    let directory = TemporaryPairingDirectory::new();
    let active = Uuid::new_v4().to_string();
    let consuming = Uuid::new_v4().to_string();
    let consuming_wallet = Uuid::new_v4();
    fs::write(
        pending_mobile_secret_path_in(&directory.0, &active).unwrap(),
        b"active",
    )
    .unwrap();
    fs::write(
        consuming_mobile_secret_path_in(&directory.0, &consuming, consuming_wallet).unwrap(),
        b"consuming",
    )
    .unwrap();

    cancel_mobile_pairing_storage(&directory.0, &active).unwrap();
    cancel_mobile_pairing_storage(&directory.0, &active).unwrap();
    cancel_mobile_pairing_storage(&directory.0, &consuming).unwrap();
    assert!(active_mobile_pairing_sessions(&directory.0)
        .unwrap()
        .is_empty());
    assert_eq!(
        cancel_mobile_pairing_storage(&directory.0, "../wallet")
            .unwrap_err()
            .code,
        "invalid_coordination_payload"
    );
}

#[test]
fn conflicting_mobile_pairing_recovery_files_fail_without_mutation() {
    let directory = TemporaryPairingDirectory::new();
    let wallets = TemporaryPairingDirectory::new();
    let session_id = Uuid::new_v4().to_string();
    let wallet_id = Uuid::new_v4();
    let active = pending_mobile_secret_path_in(&directory.0, &session_id).unwrap();
    let consuming = consuming_mobile_secret_path_in(&directory.0, &session_id, wallet_id).unwrap();
    fs::write(&active, b"active").unwrap();
    fs::write(&consuming, b"consuming").unwrap();

    assert_eq!(
        reconcile_mobile_pairing_directory(
            &directory.0,
            &wallets.0,
            &HashSet::new(),
            &HashSet::new(),
        )
        .unwrap_err()
        .code,
        "wallet_corrupt"
    );
    assert_eq!(fs::read(active).unwrap(), b"active");
    assert_eq!(fs::read(consuming).unwrap(), b"consuming");
}

#[test]
fn consuming_pairing_cannot_claim_an_unrelated_registered_wallet() {
    let directory = TemporaryPairingDirectory::new();
    let wallets = TemporaryPairingDirectory::new();
    let session_id = Uuid::new_v4().to_string();
    let wallet_id = Uuid::new_v4();
    let consuming = consuming_mobile_secret_path_in(&directory.0, &session_id, wallet_id).unwrap();
    fs::write(&consuming, b"consuming").unwrap();

    assert_eq!(
        reconcile_mobile_pairing_directory(
            &directory.0,
            &wallets.0,
            &HashSet::from([wallet_id]),
            &HashSet::new(),
        )
        .unwrap_err()
        .code,
        "wallet_corrupt"
    );
    assert_eq!(fs::read(consuming).unwrap(), b"consuming");
}

#[test]
fn staged_mobile_response_is_recreated_exactly_after_restart() {
    let invitation = invitation(1_900);
    let staged = PendingMobileSecret {
        version: 1,
        invitation: invitation.clone(),
        mnemonic: Zeroizing::new(mobile_mnemonic().to_string()),
        signer_label: "Recovered phone session".to_owned(),
        backup_verified: true,
        awaiting_final_policy: true,
    };
    let first = pairing_response_from_staged(&staged).unwrap();
    let encoded = serde_json::to_vec(&staged).unwrap();
    let reopened: PendingMobileSecret = serde_json::from_slice(&encoded).unwrap();
    let second = pairing_response_from_staged(&reopened).unwrap();
    assert_eq!(first.session_id, second.session_id);
    assert_eq!(first.fingerprint, second.fingerprint);
    assert_eq!(first.xpub_checksum, second.xpub_checksum);
    assert_eq!(first.comparison_code, second.comparison_code);
    assert_eq!(first.frames, second.frames);
    assert!(first.awaiting_final_policy);
    assert!(second.awaiting_final_policy);
}

#[test]
fn staged_mobile_response_defaults_legacy_pairings_to_the_response_step() {
    let legacy = serde_json::json!({
        "version": 1,
        "invitation": invitation(1_900),
        "mnemonic": mobile_mnemonic().to_string(),
        "signerLabel": "Legacy phone session",
        "backupVerified": true
    });
    let reopened: PendingMobileSecret = serde_json::from_value(legacy).unwrap();
    assert!(!reopened.awaiting_final_policy);
}

#[test]
fn final_wallet_record_reports_an_incompatible_protocol_version() {
    let error = decode_public_wallet_record(br#"{"version":1}"#).unwrap_err();
    assert_eq!(error.code, "unsupported_coordination_version");
}

#[test]
fn decoded_invitation_exposes_the_same_comparison_code_as_desktop() {
    let invitation = invitation(now().saturating_add(60));
    let frames = encode_coordination(
        CoordinationUrType::Invitation,
        &serde_json::to_vec(&invitation).unwrap(),
    )
    .unwrap();

    let decoded = coordination_decode_invitation(frames).unwrap();
    assert_eq!(decoded.comparison_code, comparison_code(&invitation));
    assert_eq!(
        serde_json::from_str::<PairingInvitation>(&decoded.invitation_json).unwrap(),
        invitation
    );
}

fn regtest_dir() -> PathBuf {
    std::env::var_os("GROOT_REGTEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.regtest"))
}

fn rpc() -> Client {
    let port = std::env::var("GROOT_RPC_PORT").unwrap_or_else(|_| "18443".to_owned());
    let (username, password) = Auth::CookieFile(regtest_dir().join("regtest/.cookie"))
        .get_user_pass()
        .expect("read isolated Regtest cookie");
    let mut builder = jsonrpc::minreq_http::MinreqHttpTransport::builder()
        .url(&format!("http://127.0.0.1:{port}"))
        .expect("Regtest RPC URL");
    if let Some(username) = username {
        builder = builder.basic_auth(username, password);
    }
    Client::from_jsonrpc(jsonrpc::Client::with_transport(builder.build()))
}

fn sync(wallet: &mut PersistedWallet<Connection>, db: &mut Connection, rpc: Arc<Client>) {
    let mut emitter = Emitter::new(
        rpc,
        wallet.latest_checkpoint(),
        0,
        wallet
            .transactions()
            .filter(|transaction| transaction.chain_position.is_unconfirmed()),
    );
    while let Some(block) = emitter.next_block().expect("next Regtest block") {
        wallet
            .apply_block_connected_to(&block.block, block.block_height(), block.connected_to())
            .expect("connect Regtest block");
        wallet.persist(db).expect("persist Regtest block");
    }
    let mempool = emitter.mempool().expect("Regtest mempool");
    wallet.apply_evicted_txs(mempool.evicted);
    wallet.apply_unconfirmed_txs(mempool.update);
    wallet.persist(db).expect("persist Regtest mempool");
}

fn hardware_sign(wallet: &MultisigWalletDto, key: &HardwareKey, psbt: &Psbt) -> Psbt {
    let private = key.account_private.to_string();
    let external = descriptor_without_checksum(&wallet.external_descriptor)
        .unwrap()
        .replacen(
            &format!("]{}", key.account_public),
            &format!("]{private}"),
            1,
        );
    let internal = descriptor_without_checksum(&wallet.internal_descriptor)
        .unwrap()
        .replacen(
            &format!("]{}", key.account_public),
            &format!("]{private}"),
            1,
        );
    let signer = Wallet::create(external, internal)
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
    let mut returned = psbt.clone();
    assert!(!signer
        .sign(
            &mut returned,
            SignOptions {
                trust_witness_utxo: true,
                try_finalize: false,
                ..SignOptions::default()
            },
        )
        .unwrap());
    returned
}

#[test]
fn mobile_signing_adds_only_the_expected_signatures_without_private_descriptors() {
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, transaction::Version, OutPoint, ScriptBuf, Sequence,
        Transaction, TxIn, TxOut, Witness,
    };

    let (mnemonic, hardware, metadata, coordination) = coordinated_wallet();
    let mut coordinator = Wallet::create(
        metadata.external_descriptor.clone(),
        metadata.internal_descriptor.clone(),
    )
    .network(Network::Regtest)
    .create_wallet_no_persist()
    .unwrap();
    let receive = coordinator.reveal_next_address(KeychainKind::External);
    let funding = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([61_u8; 32]), 0),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(150_000),
            script_pubkey: receive.address.script_pubkey(),
        }],
    };
    coordinator.apply_unconfirmed_txs([(funding, 1)]);

    let secp = Secp256k1::new();
    let destination_key = hardware[0]
        .account_private
        .derive_priv(&secp, &DerivationPath::from_str("m/0/7").unwrap())
        .unwrap();
    let destination = Address::p2wpkh(
        &bdk_wallet::bitcoin::CompressedPublicKey(destination_key.private_key.public_key(&secp)),
        Network::Regtest,
    );
    let mut builder = coordinator.build_tx();
    builder
        .add_recipient(destination.script_pubkey(), Amount::from_sat(50_000))
        .fee_rate(FeeRate::from_sat_per_vb(2).unwrap());
    let unsigned = builder.finish().unwrap();
    let encoded = encode_psbt(&unsigned);
    let review = review_mobile_psbt_for(&metadata, &coordination, &encoded).unwrap();

    let signed = sign_mobile_psbt_for(&metadata, &mnemonic, &encoded, review.revision_id).unwrap();
    let returned = decode_psbt(&signed.signed_psbt).unwrap();
    let mobile_fingerprint =
        Fingerprint::from_str(coordination.mobile_signer_fingerprint.as_deref().unwrap()).unwrap();
    assert!(returned.inputs.iter().all(|input| {
        input.partial_sigs.len() == 1
            && input.partial_sigs.keys().all(|public_key| {
                input
                    .bip32_derivation
                    .get(&public_key.inner)
                    .is_some_and(|(fingerprint, _)| *fingerprint == mobile_fingerprint)
            })
    }));
    assert!(returned.inputs.iter().all(|input| {
        input
            .partial_sigs
            .values()
            .all(|signature| signature.sighash_type == bdk_wallet::bitcoin::EcdsaSighashType::All)
    }));
}

#[test]
#[ignore = "requires the isolated Bitcoin Core regtest harness"]
fn funded_mobile_cosigner_round_trip_reviews_merges_finalizes_and_broadcasts() {
    assert!(std::env::var_os("GROOT_RUN_REGTEST").is_some());
    let (mnemonic, hardware, metadata, coordination) = coordinated_wallet();
    let database = TemporaryDatabase::new();
    let mut db = Connection::open(&database.0).unwrap();
    let mut coordinator = Wallet::create(
        metadata.external_descriptor.clone(),
        metadata.internal_descriptor.clone(),
    )
    .network(Network::Regtest)
    .create_wallet(&mut db)
    .unwrap();
    let receive = coordinator.reveal_next_address(KeychainKind::External);
    coordinator.persist(&mut db).unwrap();

    let rpc = Arc::new(rpc());
    rpc.call::<Txid>(
        "sendtoaddress",
        &[
            serde_json::json!(receive.address.to_string()),
            serde_json::json!(0.01),
        ],
    )
    .unwrap();
    let mining: Address = rpc
        .get_new_address(Some("Groot mobile coordination"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    rpc.generate_to_address(1, &mining).unwrap();
    sync(&mut coordinator, &mut db, Arc::clone(&rpc));
    assert_eq!(coordinator.balance().confirmed.to_sat(), 1_000_000);

    let destination = rpc
        .get_new_address(Some("Groot mobile destination"), None)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let mut builder = coordinator.build_tx();
    builder
        .add_recipient(destination.script_pubkey(), Amount::from_sat(250_000))
        .fee_rate(FeeRate::from_sat_per_vb(2).unwrap());
    let mut unsigned = builder.finish().unwrap();
    let encoded = encode_psbt(&unsigned);
    let review = review_mobile_psbt_for(&metadata, &coordination, &encoded).unwrap();
    assert_eq!(review.input_count, 1);
    assert_eq!(review.recipients.len(), 1);
    assert_eq!(review.recipients[0].amount_sats, 250_000);
    assert!(!review.change.is_empty());
    assert!(review.fee_sats > 0);

    let mut missing_utxo = unsigned.clone();
    missing_utxo.inputs[0].witness_utxo = None;
    assert_eq!(
        review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&missing_utxo))
            .unwrap_err()
            .code,
        "malformed_psbt"
    );

    let mut foreign_input = unsigned.clone();
    foreign_input.inputs[0]
        .witness_utxo
        .as_mut()
        .unwrap()
        .script_pubkey = destination.script_pubkey();
    assert_eq!(
        review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&foreign_input))
            .unwrap_err()
            .code,
        "proposal_mismatch"
    );

    let mut wrong_sighash = unsigned.clone();
    wrong_sighash.inputs[0].sighash_type = Some(bdk_wallet::bitcoin::psbt::PsbtSighashType::from(
        bdk_wallet::bitcoin::EcdsaSighashType::Single,
    ));
    assert_eq!(
        review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&wrong_sighash))
            .unwrap_err()
            .code,
        "unsupported_sighash"
    );

    let recipient_index = unsigned
        .unsigned_tx
        .output
        .iter()
        .position(|output| output.script_pubkey == destination.script_pubkey())
        .unwrap();
    let mobile_fingerprint =
        Fingerprint::from_str(coordination.mobile_signer_fingerprint.as_deref().unwrap()).unwrap();
    let (public_key, derivation) = unsigned.inputs[0]
        .bip32_derivation
        .iter()
        .find(|(_, (fingerprint, _))| *fingerprint == mobile_fingerprint)
        .map(|(public_key, derivation)| (*public_key, derivation.clone()))
        .unwrap();
    let mut false_change = unsigned.clone();
    false_change.outputs[recipient_index]
        .bip32_derivation
        .insert(public_key, derivation);
    assert_eq!(
        review_mobile_psbt_for(&metadata, &coordination, &encode_psbt(&false_change))
            .unwrap_err()
            .code,
        "proposal_mismatch"
    );

    let mut stale = unsigned.clone();
    stale.unsigned_tx.output[recipient_index].value = Amount::from_sat(249_999);
    assert_eq!(
        sign_mobile_psbt_for(
            &metadata,
            &mnemonic,
            &encode_psbt(&stale),
            review.revision_id.clone(),
        )
        .unwrap_err()
        .code,
        "proposal_mismatch"
    );

    let signed =
        sign_mobile_psbt_for(&metadata, &mnemonic, &encoded, review.revision_id.clone()).unwrap();
    assert_eq!(signed.revision_id, review.revision_id);
    assert!(!signed.frames.is_empty());
    let mobile_returned = decode_psbt(&signed.signed_psbt).unwrap();
    let allowed = metadata
        .cosigners
        .iter()
        .map(|signer| Fingerprint::from_str(&signer.fingerprint).unwrap())
        .collect::<Vec<_>>();
    let progress = merge_signed_psbt(&mut unsigned, mobile_returned, &allowed, 2).unwrap();
    assert_eq!(progress.signed, 1);
    assert!(!progress.can_finalize);

    let hardware_returned = hardware_sign(&metadata, &hardware[0], &unsigned);
    let progress = merge_signed_psbt(&mut unsigned, hardware_returned, &allowed, 2).unwrap();
    assert_eq!(progress.signed, 2);
    assert!(progress.can_finalize);
    assert!(coordinator
        .finalize_psbt(&mut unsigned, SignOptions::default())
        .unwrap());
    let transaction = unsigned.extract_tx().unwrap();
    let txid = rpc.send_raw_transaction(&transaction).unwrap();
    assert_eq!(txid, transaction.compute_txid());
    assert!(rpc.get_mempool_entry(&txid).is_ok());
}

#[test]
fn mobile_review_fails_closed_for_watch_only_and_revision_substitution() {
    let (mnemonic, _, metadata, mut coordination) = coordinated_wallet();
    coordination.role = DeviceRole::MobileWatchOnly;
    assert_eq!(
        review_mobile_psbt_for(&metadata, &coordination, "not-a-psbt")
            .unwrap_err()
            .code,
        "signing_unavailable"
    );

    let empty = Psbt::from_unsigned_tx(Transaction {
        version: bdk_wallet::bitcoin::transaction::Version::TWO,
        lock_time: bdk_wallet::bitcoin::absolute::LockTime::ZERO,
        input: vec![],
        output: vec![],
    })
    .unwrap();
    assert_eq!(
        sign_mobile_psbt_for(
            &metadata,
            &mnemonic,
            &encode_psbt(&empty),
            "stale-revision".to_owned(),
        )
        .unwrap_err()
        .code,
        "proposal_mismatch"
    );
}

#[test]
fn phone_key_health_check_is_bound_to_the_saved_wallet_identity() {
    let (mnemonic, _, mut wallet, coordination) = coordinated_wallet();
    let expected = coordination.mobile_signer_fingerprint.as_deref().unwrap();
    assert!(mobile_signer_matches_wallet(&wallet, expected, &mnemonic).unwrap());
    assert!(!mobile_signer_matches_wallet(&wallet, "00000000", &mnemonic).unwrap());

    let foreign_xpub = wallet.cosigners[0].xpub.clone();
    let local = wallet
        .cosigners
        .iter_mut()
        .find(|signer| signer.device_type.as_deref() == Some(MOBILE_DEVICE_TYPE))
        .unwrap();
    local.xpub = foreign_xpub;
    assert!(!mobile_signer_matches_wallet(&wallet, expected, &mnemonic).unwrap());
}
