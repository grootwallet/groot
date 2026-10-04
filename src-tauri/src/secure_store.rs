use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;
use zeroize::Zeroizing;

const VERSION: u8 = 5;
const DEVICE_BOUND_VERSION: u8 = 2;
const LEGACY_PORTABLE_VERSION: u8 = 3;
const LEGACY_AAD_VERSION: u8 = 4;
const MAX_METADATA_BYTES: u64 = 256 * 1024;
const KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;
const LEGACY_ARGON2_MEMORY_KIB: u32 = 19_456;
const LEGACY_ARGON2_ITERATIONS: u32 = 2;
const ARGON2_MEMORY_KIB: u32 = 65_536;
const ARGON2_ITERATIONS: u32 = 3;
const ARGON2_PARALLELISM: u32 = 1;
const LEGACY_PAYLOAD_AAD: &[u8] = b"groot/secure-store/v4/payload";
const LEGACY_CREDENTIAL_WRAP_AAD: &[u8] = b"groot/secure-store/v4/credential-wrap";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecureStorePurpose {
    WalletSecret,
    NodeAuth,
}

impl SecureStorePurpose {
    fn as_str(self) -> &'static str {
        match self {
            Self::WalletSecret => "wallet-secret",
            Self::NodeAuth => "node-auth",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SecureStoreContext {
    wallet_id: Uuid,
    purpose: SecureStorePurpose,
}

impl SecureStoreContext {
    pub fn new(wallet_id: Uuid, purpose: SecureStorePurpose) -> Self {
        Self { wallet_id, purpose }
    }

    fn aad(self, layer: &str) -> Vec<u8> {
        format!(
            "groot/secure-store/v5/{}/{}/{}",
            self.wallet_id,
            self.purpose.as_str(),
            layer
        )
        .into_bytes()
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SecureStoreError {
    #[error("secure storage metadata is corrupt")]
    Corrupt,
    #[error("secure storage could not authenticate the credential")]
    InvalidCredential,
    #[error("secure storage is unavailable")]
    Unavailable,
}

fn fill_os_random(destination: &mut [u8]) -> Result<(), SecureStoreError> {
    OsRng
        .try_fill_bytes(destination)
        .map_err(|_| SecureStoreError::Unavailable)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct KdfMetadata {
    algorithm: String,
    version: u32,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    output_bytes: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    version: u8,
    salt: String,
    payload_nonce: String,
    payload: String,
    credential_nonce: String,
    credential_wrapped_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    kdf: Option<KdfMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    device_nonce: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    device_wrapped_key: Option<String>,
}

fn current_kdf_metadata() -> KdfMetadata {
    KdfMetadata {
        algorithm: "argon2id".to_owned(),
        version: 0x13,
        memory_kib: ARGON2_MEMORY_KIB,
        iterations: ARGON2_ITERATIONS,
        parallelism: ARGON2_PARALLELISM,
        output_bytes: KEY_BYTES,
    }
}

fn credential_kdf(memory_kib: u32, iterations: u32) -> Result<Argon2<'static>, SecureStoreError> {
    let params = Params::new(memory_kib, iterations, ARGON2_PARALLELISM, Some(KEY_BYTES))
        .map_err(|_| SecureStoreError::Unavailable)?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

fn derive_credential_key(
    credential: &str,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    let mut key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
    credential_kdf(memory_kib, iterations)?
        .hash_password_into(credential.as_bytes(), salt, &mut key)
        .map_err(|_| SecureStoreError::Unavailable)?;
    Ok(key)
}

fn derive_current_credential_key(
    credential: &str,
    salt: &[u8],
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    derive_credential_key(credential, salt, ARGON2_MEMORY_KIB, ARGON2_ITERATIONS)
}

fn derive_legacy_credential_key(
    credential: &str,
    salt: &[u8],
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    derive_credential_key(
        credential,
        salt,
        LEGACY_ARGON2_MEMORY_KIB,
        LEGACY_ARGON2_ITERATIONS,
    )
}

#[cfg(test)]
fn encrypt(key: &[u8], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), SecureStoreError> {
    encrypt_with_aad(key, plaintext, &[])
}

fn encrypt_with_aad(
    key: &[u8],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), SecureStoreError> {
    let mut nonce = vec![0_u8; NONCE_BYTES];
    fill_os_random(&mut nonce)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| SecureStoreError::Unavailable)?;
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| SecureStoreError::Unavailable)?;
    Ok((nonce, ciphertext))
}

fn decrypt_with_aad(
    key: &[u8],
    nonce: &[u8],
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    if key.len() != KEY_BYTES || nonce.len() != NONCE_BYTES {
        return Err(SecureStoreError::Corrupt);
    }
    Ok(Zeroizing::new(
        Aes256Gcm::new_from_slice(key)
            .map_err(|_| SecureStoreError::Corrupt)?
            .decrypt(
                Nonce::from_slice(nonce),
                Payload {
                    msg: ciphertext,
                    aad,
                },
            )
            .map_err(|_| SecureStoreError::InvalidCredential)?,
    ))
}

fn decode(value: &str) -> Result<Vec<u8>, SecureStoreError> {
    BASE64.decode(value).map_err(|_| SecureStoreError::Corrupt)
}

fn write_owner_only(path: &Path, bytes: &[u8]) -> Result<(), SecureStoreError> {
    let parent = path.parent().ok_or(SecureStoreError::Unavailable)?;
    fs::create_dir_all(parent).map_err(|_| SecureStoreError::Unavailable)?;
    let temporary = parent.join(format!(".secure-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| SecureStoreError::Unavailable)?;
        file.write_all(bytes)
            .map_err(|_| SecureStoreError::Unavailable)?;
        file.sync_all().map_err(|_| SecureStoreError::Unavailable)?;
        fs::rename(&temporary, path).map_err(|_| SecureStoreError::Unavailable)?;
        #[cfg(unix)]
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| SecureStoreError::Unavailable)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn read_metadata(path: &Path) -> Result<Metadata, SecureStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| SecureStoreError::Unavailable)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(SecureStoreError::Corrupt);
    }
    let file = File::open(path).map_err(|_| SecureStoreError::Unavailable)?;
    if metadata.len() > MAX_METADATA_BYTES {
        return Err(SecureStoreError::Corrupt);
    }
    let mut encoded = String::new();
    file.take(MAX_METADATA_BYTES + 1)
        .read_to_string(&mut encoded)
        .map_err(|_| SecureStoreError::Corrupt)?;
    if encoded.len() as u64 > MAX_METADATA_BYTES {
        return Err(SecureStoreError::Corrupt);
    }
    let metadata: Metadata =
        serde_json::from_str(&encoded).map_err(|_| SecureStoreError::Corrupt)?;
    if !matches!(
        metadata.version,
        DEVICE_BOUND_VERSION | LEGACY_PORTABLE_VERSION | LEGACY_AAD_VERSION | VERSION
    ) {
        return Err(SecureStoreError::Corrupt);
    }
    if metadata.version == DEVICE_BOUND_VERSION
        && (metadata.device_nonce.is_none() || metadata.device_wrapped_key.is_none())
    {
        return Err(SecureStoreError::Corrupt);
    }
    if matches!(
        metadata.version,
        LEGACY_PORTABLE_VERSION | LEGACY_AAD_VERSION | VERSION
    ) && (metadata.device_nonce.is_some() || metadata.device_wrapped_key.is_some())
    {
        return Err(SecureStoreError::Corrupt);
    }
    match metadata.version {
        LEGACY_AAD_VERSION | VERSION if metadata.kdf.as_ref() != Some(&current_kdf_metadata()) => {
            Err(SecureStoreError::Corrupt)
        }
        DEVICE_BOUND_VERSION | LEGACY_PORTABLE_VERSION if metadata.kdf.is_some() => {
            Err(SecureStoreError::Corrupt)
        }
        _ => Ok(metadata),
    }
}

fn encode_metadata(metadata: &Metadata) -> Result<Vec<u8>, SecureStoreError> {
    serde_json::to_vec(metadata).map_err(|_| SecureStoreError::Corrupt)
}

fn store_portable(
    metadata_path: &Path,
    secret: &[u8],
    credential: &str,
    context: SecureStoreContext,
) -> Result<(), SecureStoreError> {
    write_owner_only(
        metadata_path,
        &encode_metadata(&new_metadata(secret, credential, context)?)?,
    )
}

fn new_metadata(
    secret: &[u8],
    credential: &str,
    context: SecureStoreContext,
) -> Result<Metadata, SecureStoreError> {
    let mut salt = Zeroizing::new(vec![0_u8; 16]);
    let mut data_key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
    fill_os_random(&mut salt)?;
    fill_os_random(&mut data_key)?;
    let credential_key = derive_current_credential_key(credential, &salt)?;
    let payload_aad = context.aad("payload");
    let credential_wrap_aad = context.aad("credential-wrap");
    let (payload_nonce, payload) = encrypt_with_aad(&data_key, secret, &payload_aad)?;
    let (credential_nonce, credential_wrapped_key) =
        encrypt_with_aad(&credential_key, &data_key, &credential_wrap_aad)?;
    Ok(Metadata {
        version: VERSION,
        salt: BASE64.encode(&salt),
        payload_nonce: BASE64.encode(payload_nonce),
        payload: BASE64.encode(payload),
        credential_nonce: BASE64.encode(credential_nonce),
        credential_wrapped_key: BASE64.encode(credential_wrapped_key),
        kdf: Some(current_kdf_metadata()),
        device_nonce: None,
        device_wrapped_key: None,
    })
}

fn load_portable_with_writer(
    metadata_path: &Path,
    credential: &str,
    context: SecureStoreContext,
    write_metadata: impl FnOnce(&Path, &[u8]) -> Result<(), SecureStoreError>,
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    let metadata = read_metadata(metadata_path)?;
    let salt = Zeroizing::new(decode(&metadata.salt)?);
    if salt.len() != 16 {
        return Err(SecureStoreError::Corrupt);
    }
    let uses_legacy_kdf = matches!(
        metadata.version,
        DEVICE_BOUND_VERSION | LEGACY_PORTABLE_VERSION
    );
    let credential_key = if uses_legacy_kdf {
        derive_legacy_credential_key(credential, &salt)?
    } else {
        derive_current_credential_key(credential, &salt)?
    };
    let payload_aad = context.aad("payload");
    let credential_wrap_aad = context.aad("credential-wrap");
    let (payload_aad, credential_wrap_aad) = match metadata.version {
        VERSION => (payload_aad.as_slice(), credential_wrap_aad.as_slice()),
        LEGACY_AAD_VERSION => (LEGACY_PAYLOAD_AAD, LEGACY_CREDENTIAL_WRAP_AAD),
        DEVICE_BOUND_VERSION | LEGACY_PORTABLE_VERSION => (&[][..], &[][..]),
        _ => return Err(SecureStoreError::Corrupt),
    };
    let credential_data_key = decrypt_with_aad(
        &credential_key,
        &decode(&metadata.credential_nonce)?,
        &decode(&metadata.credential_wrapped_key)?,
        credential_wrap_aad,
    )?;
    if credential_data_key.len() != KEY_BYTES {
        return Err(SecureStoreError::Corrupt);
    }
    let plaintext = decrypt_with_aad(
        &credential_data_key,
        &decode(&metadata.payload_nonce)?,
        &decode(&metadata.payload)?,
        payload_aad,
    )
    .map_err(|_| SecureStoreError::Corrupt)?;

    if metadata.version != VERSION {
        let migrated = new_metadata(&plaintext, credential, context)?;
        write_metadata(metadata_path, &encode_metadata(&migrated)?)?;
    }

    Ok(plaintext)
}

fn load_portable(
    metadata_path: &Path,
    credential: &str,
    context: SecureStoreContext,
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    load_portable_with_writer(metadata_path, credential, context, write_owner_only)
}

pub fn store(
    metadata_path: &Path,
    secret: &[u8],
    credential: &str,
    context: SecureStoreContext,
) -> Result<(), SecureStoreError> {
    store_portable(metadata_path, secret, credential, context)
}

pub fn load(
    metadata_path: &Path,
    credential: &str,
    context: SecureStoreContext,
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    load_portable(metadata_path, credential, context)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Write};
    use std::time::Instant;

    fn directory() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("groot-secure-store-{}", Uuid::new_v4()))
    }

    fn wallet_context(wallet_id: Uuid) -> SecureStoreContext {
        SecureStoreContext::new(wallet_id, SecureStorePurpose::WalletSecret)
    }

    fn write_v2_fixture(path: &Path, secret: &[u8], credential: &str) {
        let mut salt = Zeroizing::new(vec![0_u8; 16]);
        let mut data_key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
        fill_os_random(&mut salt).unwrap();
        fill_os_random(&mut data_key).unwrap();
        let credential_key = derive_legacy_credential_key(credential, &salt).unwrap();
        let (payload_nonce, payload) = encrypt(&data_key, secret).unwrap();
        let (credential_nonce, credential_wrapped_key) =
            encrypt(&credential_key, &data_key).unwrap();
        let (device_nonce, device_wrapped_key) = encrypt(&[7_u8; KEY_BYTES], &data_key).unwrap();
        let metadata = Metadata {
            version: DEVICE_BOUND_VERSION,
            salt: BASE64.encode(&salt),
            payload_nonce: BASE64.encode(payload_nonce),
            payload: BASE64.encode(payload),
            credential_nonce: BASE64.encode(credential_nonce),
            credential_wrapped_key: BASE64.encode(credential_wrapped_key),
            kdf: None,
            device_nonce: Some(BASE64.encode(device_nonce)),
            device_wrapped_key: Some(BASE64.encode(device_wrapped_key)),
        };
        write_owner_only(path, &encode_metadata(&metadata).unwrap()).unwrap();
    }

    fn write_v3_fixture(path: &Path, secret: &[u8], credential: &str) {
        let mut salt = Zeroizing::new(vec![0_u8; 16]);
        let mut data_key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
        fill_os_random(&mut salt).unwrap();
        fill_os_random(&mut data_key).unwrap();
        let credential_key = derive_legacy_credential_key(credential, &salt).unwrap();
        let (payload_nonce, payload) = encrypt(&data_key, secret).unwrap();
        let (credential_nonce, credential_wrapped_key) =
            encrypt(&credential_key, &data_key).unwrap();
        let metadata = Metadata {
            version: LEGACY_PORTABLE_VERSION,
            salt: BASE64.encode(&salt),
            payload_nonce: BASE64.encode(payload_nonce),
            payload: BASE64.encode(payload),
            credential_nonce: BASE64.encode(credential_nonce),
            credential_wrapped_key: BASE64.encode(credential_wrapped_key),
            kdf: None,
            device_nonce: None,
            device_wrapped_key: None,
        };
        write_owner_only(path, &encode_metadata(&metadata).unwrap()).unwrap();
    }

    fn write_v4_fixture(path: &Path, secret: &[u8], credential: &str) {
        let mut metadata =
            new_metadata(secret, credential, wallet_context(Uuid::from_u128(1))).unwrap();
        metadata.version = LEGACY_AAD_VERSION;
        let salt = Zeroizing::new(decode(&metadata.salt).unwrap());
        let mut data_key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
        fill_os_random(&mut data_key).unwrap();
        let credential_key = derive_current_credential_key(credential, &salt).unwrap();
        let (payload_nonce, payload) =
            encrypt_with_aad(&data_key, secret, LEGACY_PAYLOAD_AAD).unwrap();
        let (credential_nonce, credential_wrapped_key) =
            encrypt_with_aad(&credential_key, &data_key, LEGACY_CREDENTIAL_WRAP_AAD).unwrap();
        metadata.payload_nonce = BASE64.encode(payload_nonce);
        metadata.payload = BASE64.encode(payload);
        metadata.credential_nonce = BASE64.encode(credential_nonce);
        metadata.credential_wrapped_key = BASE64.encode(credential_wrapped_key);
        write_owner_only(path, &encode_metadata(&metadata).unwrap()).unwrap();
    }

    #[test]
    #[ignore = "release evidence benchmark; run explicitly with --release --ignored --nocapture"]
    fn credential_kdf_calibration() {
        const SAMPLE_COUNT: usize = 11;
        let credential = "disposable calibration credential";
        let salt = [0x42_u8; 16];

        derive_current_credential_key(credential, &salt).expect("warm-up derivation");
        let mut elapsed_ms = Vec::with_capacity(SAMPLE_COUNT);
        for _ in 0..SAMPLE_COUNT {
            let started = Instant::now();
            let key =
                derive_current_credential_key(credential, &salt).expect("calibration derivation");
            assert_eq!(key.len(), KEY_BYTES);
            elapsed_ms.push(started.elapsed().as_secs_f64() * 1_000.0);
        }
        elapsed_ms.sort_by(f64::total_cmp);

        writeln!(
            io::stdout().lock(),
            "argon2id version=0x13 memory_kib={ARGON2_MEMORY_KIB} iterations={ARGON2_ITERATIONS} parallelism={ARGON2_PARALLELISM} output_bytes={KEY_BYTES} samples={SAMPLE_COUNT} min_ms={:.3} median_ms={:.3} max_ms={:.3}",
            elapsed_ms[0],
            elapsed_ms[SAMPLE_COUNT / 2],
            elapsed_ms[SAMPLE_COUNT - 1]
        )
        .expect("write calibration result");
    }

    #[test]
    fn wallet_bound_v5_round_trip_requires_the_credential_and_context() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        let wallet_id = Uuid::new_v4();
        let context = wallet_context(wallet_id);
        store(&metadata, b"never leave rust", "correct", context).unwrap();
        let plaintext = load(&metadata, "correct", context).unwrap();
        let _: &Zeroizing<Vec<u8>> = &plaintext;
        assert_eq!(plaintext.as_slice(), b"never leave rust");
        assert_eq!(
            load(&metadata, "wrong", context),
            Err(SecureStoreError::InvalidCredential)
        );
        assert_eq!(
            load(&metadata, "correct", wallet_context(Uuid::new_v4())),
            Err(SecureStoreError::InvalidCredential)
        );
        assert_eq!(
            load(
                &metadata,
                "correct",
                SecureStoreContext::new(wallet_id, SecureStorePurpose::NodeAuth)
            ),
            Err(SecureStoreError::InvalidCredential)
        );
        let encoded = fs::read_to_string(&metadata).unwrap();
        assert!(encoded.contains("\"version\":5"));
        assert!(encoded.contains("\"memoryKib\":65536"));
        assert!(!encoded.contains("deviceNonce"));
        assert!(!encoded.contains("deviceWrappedKey"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn portable_v5_profile_can_be_relocated_with_the_same_wallet_identity() {
        let original_directory = directory();
        let restored_directory = directory();
        let original = original_directory.join("wallet-a").join("secret.json");
        let restored = restored_directory.join("wallet-b").join("secret.json");
        let context = wallet_context(Uuid::new_v4());
        store(&original, b"portable secret", "correct", context).unwrap();
        fs::create_dir_all(restored.parent().unwrap()).unwrap();
        fs::copy(&original, &restored).unwrap();

        assert_eq!(
            load(&restored, "correct", context).unwrap().as_slice(),
            b"portable secret"
        );
        assert_eq!(
            load(&restored, "wrong", context),
            Err(SecureStoreError::InvalidCredential)
        );
        fs::remove_dir_all(original_directory).unwrap();
        fs::remove_dir_all(restored_directory).unwrap();
    }

    #[test]
    fn authenticated_v2_load_migrates_without_a_device_key() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v2_fixture(&metadata, b"migration secret", "correct");
        assert_eq!(
            load(&metadata, "correct", wallet_context(Uuid::new_v4()))
                .unwrap()
                .as_slice(),
            b"migration secret"
        );
        let migrated = read_metadata(&metadata).unwrap();
        assert_eq!(migrated.version, VERSION);
        assert!(migrated.device_nonce.is_none());
        assert!(migrated.device_wrapped_key.is_none());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn authenticated_v3_load_migrates_to_the_stronger_versioned_kdf() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v3_fixture(&metadata, b"portable migration secret", "correct");

        assert_eq!(
            load(&metadata, "correct", wallet_context(Uuid::new_v4()))
                .unwrap()
                .as_slice(),
            b"portable migration secret"
        );
        let migrated = read_metadata(&metadata).unwrap();
        assert_eq!(migrated.version, VERSION);
        assert_eq!(migrated.kdf, Some(current_kdf_metadata()));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn authenticated_v4_load_migrates_to_wallet_bound_v5() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v4_fixture(&metadata, b"portable migration secret", "correct");
        let context = wallet_context(Uuid::new_v4());

        assert_eq!(
            load(&metadata, "correct", context).unwrap().as_slice(),
            b"portable migration secret"
        );
        assert_eq!(read_metadata(&metadata).unwrap().version, VERSION);
        assert_eq!(
            load(&metadata, "correct", wallet_context(Uuid::new_v4())),
            Err(SecureStoreError::InvalidCredential)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn v5_rejects_modified_kdf_parameters_without_allocating_them() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        let context = wallet_context(Uuid::new_v4());
        store(&metadata, b"secret", "correct", context).unwrap();
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&metadata).unwrap()).unwrap();
        value["kdf"]["memoryKib"] = serde_json::Value::from(1_048_576_u64);
        write_owner_only(&metadata, &serde_json::to_vec(&value).unwrap()).unwrap();

        assert_eq!(
            load(&metadata, "correct", context),
            Err(SecureStoreError::Corrupt)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn authenticated_v2_migration_prewrite_failure_keeps_ciphertext_and_fails_closed() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v2_fixture(&metadata, b"migration secret", "correct");
        let before = fs::read(&metadata).unwrap();

        assert_eq!(
            load_portable_with_writer(
                &metadata,
                "correct",
                wallet_context(Uuid::new_v4()),
                |_path, _encoded| { Err(SecureStoreError::Unavailable) },
            ),
            Err(SecureStoreError::Unavailable)
        );
        assert_eq!(fs::read(&metadata).unwrap(), before);
        assert_eq!(
            read_metadata(&metadata).unwrap().version,
            DEVICE_BOUND_VERSION
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn authenticated_v4_migration_prewrite_failure_keeps_ciphertext_and_fails_closed() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v4_fixture(&metadata, b"migration secret", "correct");
        let before = fs::read(&metadata).unwrap();

        assert_eq!(
            load_portable_with_writer(
                &metadata,
                "correct",
                wallet_context(Uuid::new_v4()),
                |_path, _encoded| { Err(SecureStoreError::Unavailable) },
            ),
            Err(SecureStoreError::Unavailable)
        );
        assert_eq!(fs::read(&metadata).unwrap(), before);
        assert_eq!(
            read_metadata(&metadata).unwrap().version,
            LEGACY_AAD_VERSION
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn wrong_credential_does_not_migrate_v2() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v2_fixture(&metadata, b"migration secret", "correct");
        let before = fs::read(&metadata).unwrap();

        assert_eq!(
            load(&metadata, "wrong", wallet_context(Uuid::new_v4())),
            Err(SecureStoreError::InvalidCredential)
        );
        assert_eq!(fs::read(&metadata).unwrap(), before);
        assert_eq!(
            read_metadata(&metadata).unwrap().version,
            DEVICE_BOUND_VERSION
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn wrong_credential_does_not_migrate_v4() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v4_fixture(&metadata, b"migration secret", "correct");
        let before = fs::read(&metadata).unwrap();

        assert_eq!(
            load(&metadata, "wrong", wallet_context(Uuid::new_v4())),
            Err(SecureStoreError::InvalidCredential)
        );
        assert_eq!(fs::read(&metadata).unwrap(), before);
        assert_eq!(
            read_metadata(&metadata).unwrap().version,
            LEGACY_AAD_VERSION
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn unknown_future_version_is_rejected_without_rewrite() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        let context = wallet_context(Uuid::new_v4());
        store(&metadata, b"future secret", "correct", context).unwrap();
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&metadata).unwrap()).unwrap();
        value["version"] = serde_json::Value::from(VERSION + 1);
        write_owner_only(&metadata, &serde_json::to_vec(&value).unwrap()).unwrap();
        let before = fs::read(&metadata).unwrap();

        assert_eq!(
            load(&metadata, "correct", context),
            Err(SecureStoreError::Corrupt)
        );
        assert_eq!(fs::read(&metadata).unwrap(), before);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn corrupt_payload_does_not_migrate_v2() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        write_v2_fixture(&metadata, b"migration secret", "correct");
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&metadata).unwrap()).unwrap();
        value["payload"] = serde_json::Value::String(BASE64.encode(b"corrupt"));
        write_owner_only(&metadata, &serde_json::to_vec(&value).unwrap()).unwrap();
        let before = fs::read(&metadata).unwrap();

        assert_eq!(
            load(&metadata, "correct", wallet_context(Uuid::new_v4())),
            Err(SecureStoreError::Corrupt)
        );
        assert_eq!(fs::read(&metadata).unwrap(), before);
        assert_eq!(
            read_metadata(&metadata).unwrap().version,
            DEVICE_BOUND_VERSION
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn corrupt_and_oversized_metadata_fail_closed() {
        let directory = directory();
        fs::create_dir_all(&directory).unwrap();
        let metadata = directory.join("secret.json");
        fs::write(&metadata, b"not json").unwrap();
        let context = wallet_context(Uuid::new_v4());
        assert_eq!(
            load(&metadata, "x", context),
            Err(SecureStoreError::Corrupt)
        );
        fs::write(&metadata, vec![b'x'; MAX_METADATA_BYTES as usize + 1]).unwrap();
        assert_eq!(
            load(&metadata, "x", context),
            Err(SecureStoreError::Corrupt)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn metadata_rejects_symlink_storage() {
        use std::os::unix::fs::symlink;

        let directory = directory();
        fs::create_dir_all(&directory).unwrap();
        let target = directory.join("target.json");
        fs::write(&target, b"{}").unwrap();
        let metadata = directory.join("secret.json");
        symlink(&target, &metadata).unwrap();
        assert!(matches!(
            read_metadata(&metadata),
            Err(SecureStoreError::Corrupt)
        ));
        fs::remove_dir_all(directory).unwrap();
    }
}
