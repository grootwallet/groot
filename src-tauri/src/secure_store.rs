use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
use std::path::PathBuf;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;
use zeroize::Zeroizing;

const VERSION: u8 = 2;
const MAX_METADATA_BYTES: u64 = 256 * 1024;
const KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;
#[cfg(any(target_os = "macos", target_os = "ios"))]
const KEYCHAIN_SERVICE: &str = "app.satchel.wallet.device-wrap.v1";
#[cfg(any(target_os = "macos", target_os = "ios"))]
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25_300;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SecureStoreError {
    #[error("secure storage metadata is corrupt")]
    Corrupt,
    #[error("secure storage could not authenticate the credential")]
    InvalidCredential,
    #[error("secure storage is unavailable")]
    Unavailable,
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
    device_nonce: String,
    device_wrapped_key: String,
}

trait DeviceKeyProvider {
    fn get_or_create(&self, metadata_path: &Path) -> Result<Vec<u8>, SecureStoreError>;
    fn get(&self, metadata_path: &Path) -> Result<Vec<u8>, SecureStoreError>;
}

struct SystemDeviceKeyProvider;

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn account(metadata_path: &Path) -> Result<String, SecureStoreError> {
    metadata_path
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .map(|name| format!("wallet:{name}"))
        .ok_or(SecureStoreError::Unavailable)
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
impl DeviceKeyProvider for SystemDeviceKeyProvider {
    fn get_or_create(&self, metadata_path: &Path) -> Result<Vec<u8>, SecureStoreError> {
        use security_framework::passwords::{get_generic_password, set_generic_password};
        let account = account(metadata_path)?;
        match get_generic_password(KEYCHAIN_SERVICE, &account) {
            Ok(key) => return validate_device_key(key),
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => {}
            Err(_) => return Err(SecureStoreError::Unavailable),
        }
        let mut key = vec![0_u8; KEY_BYTES];
        OsRng.fill_bytes(&mut key);
        set_generic_password(KEYCHAIN_SERVICE, &account, &key)
            .map_err(|_| SecureStoreError::Unavailable)?;
        Ok(key)
    }

    fn get(&self, metadata_path: &Path) -> Result<Vec<u8>, SecureStoreError> {
        use security_framework::passwords::get_generic_password;
        validate_device_key(
            get_generic_password(KEYCHAIN_SERVICE, &account(metadata_path)?)
                .map_err(|_| SecureStoreError::Unavailable)?,
        )
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
impl DeviceKeyProvider for SystemDeviceKeyProvider {
    fn get_or_create(&self, metadata_path: &Path) -> Result<Vec<u8>, SecureStoreError> {
        let path = sandbox_key_path(metadata_path)?;
        if path.exists() {
            return read_sandbox_key(&path);
        }
        let mut key = vec![0_u8; KEY_BYTES];
        OsRng.fill_bytes(&mut key);
        write_owner_only(&path, &key)?;
        Ok(key)
    }

    fn get(&self, metadata_path: &Path) -> Result<Vec<u8>, SecureStoreError> {
        read_sandbox_key(&sandbox_key_path(metadata_path)?)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn sandbox_key_path(metadata_path: &Path) -> Result<PathBuf, SecureStoreError> {
    Ok(metadata_path
        .parent()
        .ok_or(SecureStoreError::Unavailable)?
        .join("device.wrap"))
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn read_sandbox_key(path: &Path) -> Result<Vec<u8>, SecureStoreError> {
    let key = fs::read(path).map_err(|_| SecureStoreError::Unavailable)?;
    validate_device_key(key)
}

fn validate_device_key(key: Vec<u8>) -> Result<Vec<u8>, SecureStoreError> {
    if key.len() == KEY_BYTES {
        Ok(key)
    } else {
        Err(SecureStoreError::Corrupt)
    }
}

fn credential_kdf() -> Result<Argon2<'static>, SecureStoreError> {
    let params =
        Params::new(19_456, 2, 1, Some(KEY_BYTES)).map_err(|_| SecureStoreError::Unavailable)?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

fn derive_credential_key(
    credential: &str,
    salt: &[u8],
) -> Result<Zeroizing<Vec<u8>>, SecureStoreError> {
    let mut key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
    credential_kdf()?
        .hash_password_into(credential.as_bytes(), salt, &mut key)
        .map_err(|_| SecureStoreError::Unavailable)?;
    Ok(key)
}

fn encrypt(key: &[u8], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), SecureStoreError> {
    let mut nonce = vec![0_u8; NONCE_BYTES];
    OsRng.fill_bytes(&mut nonce);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| SecureStoreError::Unavailable)?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| SecureStoreError::Unavailable)?;
    Ok((nonce, ciphertext))
}

fn decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, SecureStoreError> {
    if key.len() != KEY_BYTES || nonce.len() != NONCE_BYTES {
        return Err(SecureStoreError::Corrupt);
    }
    Aes256Gcm::new_from_slice(key)
        .map_err(|_| SecureStoreError::Corrupt)?
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| SecureStoreError::InvalidCredential)
}

fn decode(value: String) -> Result<Vec<u8>, SecureStoreError> {
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
    if metadata.version != VERSION {
        return Err(SecureStoreError::Corrupt);
    }
    Ok(metadata)
}

fn store_with_provider(
    metadata_path: &Path,
    secret: &[u8],
    credential: &str,
    provider: &impl DeviceKeyProvider,
) -> Result<(), SecureStoreError> {
    let mut salt = Zeroizing::new(vec![0_u8; 16]);
    let mut data_key = Zeroizing::new(vec![0_u8; KEY_BYTES]);
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut data_key);
    let credential_key = derive_credential_key(credential, &salt)?;
    let device_key = Zeroizing::new(provider.get_or_create(metadata_path)?);
    let (payload_nonce, payload) = encrypt(&data_key, secret)?;
    let (credential_nonce, credential_wrapped_key) = encrypt(&credential_key, &data_key)?;
    let (device_nonce, device_wrapped_key) = encrypt(&device_key, &data_key)?;
    let metadata = Metadata {
        version: VERSION,
        salt: BASE64.encode(&salt),
        payload_nonce: BASE64.encode(payload_nonce),
        payload: BASE64.encode(payload),
        credential_nonce: BASE64.encode(credential_nonce),
        credential_wrapped_key: BASE64.encode(credential_wrapped_key),
        device_nonce: BASE64.encode(device_nonce),
        device_wrapped_key: BASE64.encode(device_wrapped_key),
    };
    let encoded = serde_json::to_vec(&metadata).map_err(|_| SecureStoreError::Corrupt)?;
    write_owner_only(metadata_path, &encoded)
}

fn load_with_provider(
    metadata_path: &Path,
    credential: &str,
    provider: &impl DeviceKeyProvider,
) -> Result<Vec<u8>, SecureStoreError> {
    let metadata = read_metadata(metadata_path)?;
    let salt = Zeroizing::new(decode(metadata.salt)?);
    if salt.len() != 16 {
        return Err(SecureStoreError::Corrupt);
    }
    let credential_key = derive_credential_key(credential, &salt)?;
    let device_key = Zeroizing::new(provider.get(metadata_path)?);
    let credential_data_key = Zeroizing::new(decrypt(
        &credential_key,
        &decode(metadata.credential_nonce)?,
        &decode(metadata.credential_wrapped_key)?,
    )?);
    let device_data_key = Zeroizing::new(
        decrypt(
            &device_key,
            &decode(metadata.device_nonce)?,
            &decode(metadata.device_wrapped_key)?,
        )
        .map_err(|_| SecureStoreError::Unavailable)?,
    );
    let mismatch = credential_data_key
        .iter()
        .zip(device_data_key.iter())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        });
    if credential_data_key.len() != KEY_BYTES || device_data_key.len() != KEY_BYTES || mismatch != 0
    {
        return Err(SecureStoreError::Corrupt);
    }
    decrypt(
        &credential_data_key,
        &decode(metadata.payload_nonce)?,
        &decode(metadata.payload)?,
    )
    .map_err(|_| SecureStoreError::Corrupt)
}

pub fn store(
    metadata_path: &Path,
    secret: &[u8],
    credential: &str,
) -> Result<(), SecureStoreError> {
    store_with_provider(metadata_path, secret, credential, &SystemDeviceKeyProvider)
}

pub fn load(metadata_path: &Path, credential: &str) -> Result<Vec<u8>, SecureStoreError> {
    load_with_provider(metadata_path, credential, &SystemDeviceKeyProvider)
}

pub fn forget_device_key(metadata_path: &Path) {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        use security_framework::passwords::delete_generic_password;
        if let Ok(account) = account(metadata_path) {
            let _ = delete_generic_password(KEYCHAIN_SERVICE, &account);
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    if let Ok(path) = sandbox_key_path(metadata_path) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MemoryProvider(Mutex<Option<Vec<u8>>>);

    impl DeviceKeyProvider for MemoryProvider {
        fn get_or_create(&self, _path: &Path) -> Result<Vec<u8>, SecureStoreError> {
            let mut key = self.0.lock().unwrap();
            Ok(key.get_or_insert_with(|| vec![7_u8; KEY_BYTES]).clone())
        }

        fn get(&self, _path: &Path) -> Result<Vec<u8>, SecureStoreError> {
            self.0
                .lock()
                .unwrap()
                .clone()
                .ok_or(SecureStoreError::Unavailable)
        }
    }

    fn directory() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("satchel-secure-store-{}", Uuid::new_v4()))
    }

    #[test]
    fn requires_both_the_credential_and_device_key() {
        let directory = directory();
        let metadata = directory.join("secret.json");
        let provider = MemoryProvider::default();
        store_with_provider(&metadata, b"never leave rust", "correct", &provider).unwrap();
        assert_eq!(
            load_with_provider(&metadata, "correct", &provider).unwrap(),
            b"never leave rust"
        );
        assert_eq!(
            load_with_provider(&metadata, "wrong", &provider),
            Err(SecureStoreError::InvalidCredential)
        );
        *provider.0.lock().unwrap() = Some(vec![9_u8; KEY_BYTES]);
        assert_eq!(
            load_with_provider(&metadata, "correct", &provider),
            Err(SecureStoreError::Unavailable)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn corrupt_and_oversized_metadata_fail_closed() {
        let directory = directory();
        fs::create_dir_all(&directory).unwrap();
        let metadata = directory.join("secret.json");
        let provider = MemoryProvider::default();
        fs::write(&metadata, b"not json").unwrap();
        assert_eq!(
            load_with_provider(&metadata, "x", &provider),
            Err(SecureStoreError::Corrupt)
        );
        fs::write(&metadata, vec![b'x'; MAX_METADATA_BYTES as usize + 1]).unwrap();
        assert_eq!(
            load_with_provider(&metadata, "x", &provider),
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

    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    #[test]
    fn forgetting_a_wallet_removes_the_sandbox_device_key() {
        let directory = directory();
        fs::create_dir_all(&directory).unwrap();
        let metadata = directory.join("secret.json");
        let device_key = sandbox_key_path(&metadata).unwrap();
        fs::write(&device_key, vec![7_u8; KEY_BYTES]).unwrap();

        forget_device_key(&metadata);

        assert!(!device_key.exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
