use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;

pub const REGISTRY_VERSION: u8 = 1;
pub const DEFAULT_INACTIVITY_TIMEOUT_MINUTES: u16 = 5;
pub const INACTIVITY_TIMEOUT_CHOICES: [u16; 5] = [1, 5, 15, 30, 60];

fn default_inactivity_timeout_minutes() -> u16 {
    DEFAULT_INACTIVITY_TIMEOUT_MINUTES
}

fn legacy_backup_verified() -> bool {
    true
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WalletKind {
    SingleKey,
    Multisig,
    WatchOnly,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletProfile {
    pub id: Uuid,
    pub name: String,
    pub network: String,
    pub kind: WalletKind,
    pub descriptor_checksum: String,
    pub created_at: u64,
    #[serde(default = "legacy_backup_verified")]
    pub backup_verified: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletRegistry {
    pub version: u8,
    pub selected_wallet_id: Option<Uuid>,
    pub wallets: Vec<WalletProfile>,
    #[serde(default = "default_inactivity_timeout_minutes")]
    pub inactivity_timeout_minutes: u16,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistryError {
    UnsupportedVersion,
    InvalidName,
    InvalidNetwork,
    InvalidChecksum,
    InvalidInactivityTimeout,
    DuplicateId,
    UnknownSelection,
    Missing,
    Corrupt,
    Io,
}

const MAX_REGISTRY_BYTES: u64 = 256 * 1024;

impl Default for WalletRegistry {
    fn default() -> Self {
        Self {
            version: REGISTRY_VERSION,
            selected_wallet_id: None,
            wallets: vec![],
            inactivity_timeout_minutes: DEFAULT_INACTIVITY_TIMEOUT_MINUTES,
        }
    }
}

pub fn load(path: &Path) -> Result<WalletRegistry, RegistryError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            RegistryError::Missing
        } else {
            RegistryError::Io
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(RegistryError::Corrupt);
    }
    let file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            RegistryError::Missing
        } else {
            RegistryError::Io
        }
    })?;
    if metadata.len() > MAX_REGISTRY_BYTES {
        return Err(RegistryError::Corrupt);
    }
    let mut encoded = String::new();
    file.take(MAX_REGISTRY_BYTES + 1)
        .read_to_string(&mut encoded)
        .map_err(|_| RegistryError::Corrupt)?;
    if encoded.len() as u64 > MAX_REGISTRY_BYTES {
        return Err(RegistryError::Corrupt);
    }
    let registry: WalletRegistry =
        serde_json::from_str(&encoded).map_err(|_| RegistryError::Corrupt)?;
    registry.validate()?;
    Ok(registry)
}

pub fn save_atomic(path: &Path, registry: &WalletRegistry) -> Result<(), RegistryError> {
    save_atomic_with(
        path,
        registry,
        |file, encoded| file.write_all(encoded).map_err(|_| RegistryError::Io),
        || Ok(()),
    )
}

fn save_atomic_with<W, B>(
    path: &Path,
    registry: &WalletRegistry,
    write: W,
    before_rename: B,
) -> Result<(), RegistryError>
where
    W: FnOnce(&mut File, &[u8]) -> Result<(), RegistryError>,
    B: FnOnce() -> Result<(), RegistryError>,
{
    registry.validate()?;
    let parent = path.parent().ok_or(RegistryError::Io)?;
    fs::create_dir_all(parent).map_err(|_| RegistryError::Io)?;
    let temporary = parent.join(format!(".registry-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|_| RegistryError::Io)?;
        let encoded = serde_json::to_vec(registry).map_err(|_| RegistryError::Corrupt)?;
        write(&mut file, &encoded)?;
        file.sync_all().map_err(|_| RegistryError::Io)?;
        before_rename()?;
        fs::rename(&temporary, path).map_err(|_| RegistryError::Io)?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| RegistryError::Io)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
impl WalletRegistry {
    pub fn validate(&self) -> Result<(), RegistryError> {
        if self.version != REGISTRY_VERSION {
            return Err(RegistryError::UnsupportedVersion);
        }
        if !INACTIVITY_TIMEOUT_CHOICES.contains(&self.inactivity_timeout_minutes) {
            return Err(RegistryError::InvalidInactivityTimeout);
        }
        let mut ids = HashSet::new();
        for wallet in &self.wallets {
            if wallet.name.trim().is_empty() || wallet.name.chars().count() > 48 {
                return Err(RegistryError::InvalidName);
            }
            if !matches!(wallet.network.as_str(), "regtest" | "signet" | "testnet4") {
                return Err(RegistryError::InvalidNetwork);
            }
            if wallet.descriptor_checksum.len() != 8
                || !wallet
                    .descriptor_checksum
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric())
            {
                return Err(RegistryError::InvalidChecksum);
            }
            if !ids.insert(wallet.id) {
                return Err(RegistryError::DuplicateId);
            }
        }
        if self.selected_wallet_id.is_some_and(|id| !ids.contains(&id)) {
            return Err(RegistryError::UnknownSelection);
        }
        Ok(())
    }
    pub fn storage_key(id: Uuid) -> String {
        format!("wallets/{id}")
    }
    pub fn add(&mut self, wallet: WalletProfile) -> Result<(), RegistryError> {
        self.wallets.push(wallet);
        if self.selected_wallet_id.is_none() {
            self.selected_wallet_id = Some(self.wallets[0].id)
        };
        if let Err(e) = self.validate() {
            self.wallets.pop();
            return Err(e);
        }
        Ok(())
    }

    pub fn select(&mut self, id: Uuid) -> Result<(), RegistryError> {
        if !self.wallets.iter().any(|wallet| wallet.id == id) {
            return Err(RegistryError::UnknownSelection);
        }
        self.selected_wallet_id = Some(id);
        self.validate()
    }

    pub fn rename_selected(&mut self, name: &str) -> Result<WalletProfile, RegistryError> {
        let normalized = name.trim();
        if normalized.is_empty() || normalized.chars().count() > 48 {
            return Err(RegistryError::InvalidName);
        }
        let selected = self
            .selected_wallet_id
            .ok_or(RegistryError::UnknownSelection)?;
        let wallet = self
            .wallets
            .iter_mut()
            .find(|wallet| wallet.id == selected)
            .ok_or(RegistryError::UnknownSelection)?;
        wallet.name = normalized.to_owned();
        let renamed = wallet.clone();
        self.validate()?;
        Ok(renamed)
    }

    pub fn remove(&mut self, id: Uuid) -> Result<WalletProfile, RegistryError> {
        let index = self
            .wallets
            .iter()
            .position(|wallet| wallet.id == id)
            .ok_or(RegistryError::UnknownSelection)?;
        let removed = self.wallets.remove(index);
        if self.selected_wallet_id == Some(id) {
            self.selected_wallet_id = self.wallets.first().map(|wallet| wallet.id);
        }
        self.validate()?;
        Ok(removed)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn p(id: Uuid) -> WalletProfile {
        WalletProfile {
            id,
            name: "Wallet".into(),
            network: "regtest".into(),
            kind: WalletKind::SingleKey,
            descriptor_checksum: "abcd1234".into(),
            created_at: 1,
            backup_verified: true,
        }
    }
    #[test]
    fn creates_isolated_stable_storage_keys() {
        let id = Uuid::nil();
        assert_eq!(
            WalletRegistry::storage_key(id),
            "wallets/00000000-0000-0000-0000-000000000000"
        );
        let mut r = WalletRegistry::default();
        r.add(p(id)).unwrap();
        assert_eq!(r.selected_wallet_id, Some(id));
    }

    #[test]
    fn selection_and_removal_never_leave_a_dangling_profile() {
        let first = Uuid::nil();
        let second = Uuid::new_v4();
        let mut registry = WalletRegistry::default();
        registry.add(p(first)).unwrap();
        let mut other = p(second);
        other.descriptor_checksum = "efgh5678".into();
        registry.add(other).unwrap();
        registry.select(second).unwrap();
        assert_eq!(registry.selected_wallet_id, Some(second));
        registry.remove(second).unwrap();
        assert_eq!(registry.selected_wallet_id, Some(first));
        assert_eq!(
            registry.select(second),
            Err(RegistryError::UnknownSelection)
        );
        registry.remove(first).unwrap();
        assert_eq!(registry.selected_wallet_id, None);
    }
    #[test]
    fn renames_only_the_selected_profile_with_a_normalized_valid_name() {
        let id = Uuid::nil();
        let mut registry = WalletRegistry::default();
        registry.add(p(id)).unwrap();

        let renamed = registry.rename_selected("  Ledger savings  ").unwrap();
        assert_eq!(renamed.name, "Ledger savings");
        assert_eq!(registry.wallets[0].name, "Ledger savings");
        assert_eq!(renamed.descriptor_checksum, "abcd1234");
        assert_eq!(
            registry.rename_selected("   "),
            Err(RegistryError::InvalidName)
        );
        assert_eq!(
            registry.rename_selected(&"x".repeat(49)),
            Err(RegistryError::InvalidName)
        );
    }
    #[test]
    fn rejects_every_identity_and_schema_failure() {
        let id = Uuid::nil();
        let mut r = WalletRegistry {
            version: 2,
            ..Default::default()
        };
        assert_eq!(r.validate(), Err(RegistryError::UnsupportedVersion));
        r.version = 1;
        r.inactivity_timeout_minutes = 0;
        assert_eq!(r.validate(), Err(RegistryError::InvalidInactivityTimeout));
        r.inactivity_timeout_minutes = 2;
        assert_eq!(r.validate(), Err(RegistryError::InvalidInactivityTimeout));
        r.inactivity_timeout_minutes = DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
        let mut x = p(id);
        x.name = "".into();
        r.wallets = vec![x];
        assert_eq!(r.validate(), Err(RegistryError::InvalidName));
        let mut x = p(id);
        x.network = "mainnet".into();
        r.wallets = vec![x];
        assert_eq!(r.validate(), Err(RegistryError::InvalidNetwork));
        let mut x = p(id);
        x.descriptor_checksum = "bad".into();
        r.wallets = vec![x];
        assert_eq!(r.validate(), Err(RegistryError::InvalidChecksum));
        r.wallets = vec![p(id), p(id)];
        assert_eq!(r.validate(), Err(RegistryError::DuplicateId));
        let b = p(Uuid::new_v4());
        r.wallets = vec![p(id), b];
        assert_eq!(r.validate(), Ok(()));
        r.wallets = vec![p(id)];
        r.selected_wallet_id = Some(Uuid::new_v4());
        assert_eq!(r.validate(), Err(RegistryError::UnknownSelection));
    }

    #[test]
    fn accepts_only_the_documented_inactivity_timeout_choices() {
        for minutes in INACTIVITY_TIMEOUT_CHOICES {
            let registry = WalletRegistry {
                inactivity_timeout_minutes: minutes,
                ..Default::default()
            };
            registry.validate().unwrap();
        }
    }

    #[test]
    fn older_registry_json_receives_the_secure_default_timeout() {
        let decoded: WalletRegistry =
            serde_json::from_str(r#"{"version":1,"selectedWalletId":null,"wallets":[]}"#).unwrap();
        assert_eq!(
            decoded.inactivity_timeout_minutes,
            DEFAULT_INACTIVITY_TIMEOUT_MINUTES
        );
        decoded.validate().unwrap();
    }

    #[test]
    fn legacy_wallet_profiles_remain_verified_while_new_state_round_trips() {
        let legacy = r#"{"id":"00000000-0000-0000-0000-000000000000","name":"Wallet","network":"regtest","kind":"single_key","descriptorChecksum":"abcd1234","createdAt":1}"#;
        let decoded: WalletProfile = serde_json::from_str(legacy).unwrap();
        assert!(decoded.backup_verified);

        let mut unverified = decoded;
        unverified.backup_verified = false;
        let encoded = serde_json::to_string(&unverified).unwrap();
        let round_trip: WalletProfile = serde_json::from_str(&encoded).unwrap();
        assert!(!round_trip.backup_verified);
    }

    fn test_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("groot-registry-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn atomically_round_trips_and_replaces_a_registry() {
        let dir = test_dir();
        let path = dir.join("registry.json");
        let mut registry = WalletRegistry::default();
        registry.add(p(Uuid::nil())).unwrap();
        save_atomic(&path, &registry).unwrap();
        assert_eq!(load(&path).unwrap(), registry);
        registry.wallets[0].name = "Renamed".into();
        save_atomic(&path, &registry).unwrap();
        assert_eq!(load(&path).unwrap().wallets[0].name, "Renamed");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn partial_write_and_pre_rename_failures_preserve_the_authoritative_registry() {
        let dir = test_dir();
        let path = dir.join("registry.json");
        let original = WalletRegistry::default();
        save_atomic(&path, &original).unwrap();

        let mut replacement = original.clone();
        replacement.add(p(Uuid::new_v4())).unwrap();
        let partial = save_atomic_with(
            &path,
            &replacement,
            |file, encoded| {
                file.write_all(&encoded[..encoded.len() / 2])
                    .map_err(|_| RegistryError::Io)?;
                Err(RegistryError::Io)
            },
            || Ok(()),
        );
        assert_eq!(partial, Err(RegistryError::Io));
        assert_eq!(load(&path).unwrap(), original);

        let disk_full_before_commit = save_atomic_with(
            &path,
            &replacement,
            |file, encoded| file.write_all(encoded).map_err(|_| RegistryError::Io),
            || Err(RegistryError::Io),
        );
        assert_eq!(disk_full_before_commit, Err(RegistryError::Io));
        assert_eq!(load(&path).unwrap(), original);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn sqlite_abort_rolls_back_all_authoritative_rows_after_reopen() {
        use bdk_wallet::rusqlite::{params, Connection};

        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("wallet.sqlite");
        {
            let mut db = Connection::open(&path).unwrap();
            db.execute_batch(
                "CREATE TABLE state (id INTEGER PRIMARY KEY, value TEXT NOT NULL); \
                 INSERT INTO state VALUES (1, 'before'); \
                 CREATE TRIGGER fail_second BEFORE INSERT ON state \
                 WHEN NEW.id = 3 BEGIN SELECT RAISE(ABORT, 'simulated disk full'); END;",
            )
            .unwrap();
            let tx = db.transaction().unwrap();
            tx.execute("UPDATE state SET value = 'after' WHERE id = 1", [])
                .unwrap();
            tx.execute("INSERT INTO state VALUES (2, 'new')", [])
                .unwrap();
            assert!(tx
                .execute("INSERT INTO state VALUES (3, 'fail')", [])
                .is_err());
            tx.rollback().unwrap();
        }
        let db = Connection::open(&path).unwrap();
        assert_eq!(
            db.query_row("SELECT value FROM state WHERE id = 1", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "before"
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM state", params![], |row| row
                .get::<_, u64>(0))
                .unwrap(),
            1
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn validation_remains_linear_for_large_wallet_registries() {
        let wallets = (0..2_000_u64)
            .map(|index| WalletProfile {
                id: Uuid::new_v4(),
                name: format!("Wallet {index}"),
                network: "regtest".into(),
                kind: WalletKind::WatchOnly,
                descriptor_checksum: format!("{index:08x}"),
                created_at: index,
                backup_verified: true,
            })
            .collect::<Vec<_>>();
        let registry = WalletRegistry {
            selected_wallet_id: Some(wallets[1_999].id),
            wallets,
            ..Default::default()
        };
        registry.validate().unwrap();
    }

    #[test]
    fn fails_closed_for_missing_corrupt_oversized_and_invalid_registries() {
        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("registry.json");
        assert_eq!(load(&path), Err(RegistryError::Missing));
        fs::write(&path, b"not-json").unwrap();
        assert_eq!(load(&path), Err(RegistryError::Corrupt));
        fs::write(&path, vec![b'x'; MAX_REGISTRY_BYTES as usize + 1]).unwrap();
        assert_eq!(load(&path), Err(RegistryError::Corrupt));
        fs::write(
            &path,
            serde_json::to_vec(&WalletRegistry {
                version: 99,
                ..Default::default()
            })
            .unwrap(),
        )
        .unwrap();
        assert_eq!(load(&path), Err(RegistryError::UnsupportedVersion));
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn registry_rejects_symlink_storage() {
        use std::os::unix::fs::symlink;

        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("target.json");
        fs::write(
            &target,
            serde_json::to_vec(&WalletRegistry::default()).unwrap(),
        )
        .unwrap();
        let link = dir.join("registry.json");
        symlink(&target, &link).unwrap();
        assert_eq!(load(&link), Err(RegistryError::Corrupt));
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn registry_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = test_dir();
        let path = dir.join("registry.json");
        save_atomic(&path, &WalletRegistry::default()).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
