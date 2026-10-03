use bdk_wallet::bitcoin::{Network, NetworkKind};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU8, Ordering},
};
use uuid::Uuid;

const NETWORK_SELECTION_VERSION: u8 = 1;
const NETWORK_SELECTION_FILE: &str = "network-selection.json";
const MAX_NETWORK_SELECTION_BYTES: u64 = 256;
const MULTI_NETWORK_APP_DATA_OVERRIDE: &str = "GROOT_MULTI_NETWORK_APP_DATA_DIR";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NetworkParameters {
    pub network: Network,
    pub extended_key_network: NetworkKind,
    pub singlesig_account_path: &'static str,
    pub multisig_account_path: &'static str,
    pub hwi_chain: &'static str,
    pub address_hrp: &'static str,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum NetworkSelectionError {
    #[error("network switching is unavailable in this build")]
    Unavailable,
    #[error("the selected Bitcoin network is unsupported")]
    Unsupported,
    #[error("the saved Bitcoin network selection is corrupt or unsafe")]
    UnsafeSelection,
    #[error("the Bitcoin network selection could not be saved")]
    Io,
    #[error("the isolated multi-network app-data directory is unsafe")]
    UnsafeTestRoot,
}

impl NetworkSelectionError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unavailable => "network_switch_unavailable",
            Self::Unsupported => "invalid_network",
            Self::UnsafeSelection => "unsafe_network_selection",
            Self::Io => "network_selection_failed",
            Self::UnsafeTestRoot => "unsafe_test_root",
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct NetworkSelection {
    version: u8,
    network: String,
}

pub const fn parameters_for(network: Network) -> NetworkParameters {
    match network {
        Network::Bitcoin => NetworkParameters {
            network,
            extended_key_network: NetworkKind::Main,
            singlesig_account_path: "m/84'/0'/0'",
            multisig_account_path: "m/48'/0'/0'/2'",
            hwi_chain: "main",
            address_hrp: "bc",
        },
        Network::Signet => test_parameters(network, "signet", "tb"),
        Network::Regtest => test_parameters(network, "regtest", "bcrt"),
        Network::Testnet => test_parameters(network, "test", "tb"),
        Network::Testnet4 => test_parameters(network, "testnet4", "tb"),
    }
}

const fn test_parameters(
    network: Network,
    hwi_chain: &'static str,
    address_hrp: &'static str,
) -> NetworkParameters {
    NetworkParameters {
        network,
        extended_key_network: NetworkKind::Test,
        singlesig_account_path: "m/84'/1'/0'",
        multisig_account_path: "m/48'/1'/0'/2'",
        hwi_chain,
        address_hrp,
    }
}

#[cfg(groot_network = "signet")]
const COMPILED_NETWORK: Network = Network::Signet;
#[cfg(groot_network = "testnet4")]
const COMPILED_NETWORK: Network = Network::Testnet4;
#[cfg(any(groot_network = "regtest", groot_network = "multi"))]
const COMPILED_NETWORK: Network = Network::Regtest;
#[cfg(groot_network = "mainnet")]
const COMPILED_NETWORK: Network = Network::Bitcoin;

static ACTIVE_NETWORK: AtomicU8 = AtomicU8::new(network_code(COMPILED_NETWORK));

const fn network_code(network: Network) -> u8 {
    match network {
        Network::Bitcoin => 0,
        Network::Testnet4 => 1,
        Network::Regtest => 2,
        Network::Signet => 3,
        Network::Testnet => 4,
    }
}

fn network_from_code(code: u8) -> Network {
    match code {
        0 => Network::Bitcoin,
        1 => Network::Testnet4,
        2 => Network::Regtest,
        3 => Network::Signet,
        4 => Network::Testnet,
        _ => COMPILED_NETWORK,
    }
}

pub fn network() -> Network {
    network_from_code(ACTIVE_NETWORK.load(Ordering::Acquire))
}

pub fn name() -> &'static str {
    name_for(network())
}

pub const fn name_for(network: Network) -> &'static str {
    match network {
        Network::Bitcoin => "mainnet",
        Network::Signet => "signet",
        Network::Regtest => "regtest",
        Network::Testnet => "testnet",
        Network::Testnet4 => "testnet4",
    }
}

pub fn default_rpc_url() -> &'static str {
    default_rpc_url_for(network())
}

const fn default_rpc_url_for(network: Network) -> &'static str {
    match network {
        Network::Bitcoin => "http://127.0.0.1:8332",
        Network::Signet => "http://127.0.0.1:38332",
        Network::Regtest => "http://127.0.0.1:18443",
        Network::Testnet => "http://127.0.0.1:18332",
        Network::Testnet4 => "http://127.0.0.1:48332",
    }
}

pub fn is_regtest() -> bool {
    network() == Network::Regtest
}

pub fn parameters() -> NetworkParameters {
    parameters_for(network())
}

pub fn singlesig_account_path() -> &'static str {
    parameters().singlesig_account_path
}

pub fn multisig_account_path() -> &'static str {
    parameters().multisig_account_path
}

pub const fn switching_enabled() -> bool {
    cfg!(groot_network = "multi")
}

fn validate_multi_network_app_data_override(
    path: PathBuf,
    switching: bool,
) -> Result<PathBuf, NetworkSelectionError> {
    if !switching || !path.is_absolute() {
        return Err(NetworkSelectionError::UnsafeTestRoot);
    }
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(NetworkSelectionError::UnsafeTestRoot)?;
    let parent = path
        .parent()
        .ok_or(NetworkSelectionError::UnsafeTestRoot)?
        .canonicalize()
        .map_err(|_| NetworkSelectionError::UnsafeTestRoot)?;
    #[cfg(unix)]
    let temporary_root = Path::new("/tmp")
        .canonicalize()
        .map_err(|_| NetworkSelectionError::UnsafeTestRoot)?;
    #[cfg(not(unix))]
    let temporary_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|_| NetworkSelectionError::UnsafeTestRoot)?;
    if parent != temporary_root || !filename.starts_with("groot-multi-") {
        return Err(NetworkSelectionError::UnsafeTestRoot);
    }
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(NetworkSelectionError::UnsafeTestRoot);
        }
    }
    Ok(path)
}

pub fn multi_network_app_data_override() -> Result<Option<PathBuf>, NetworkSelectionError> {
    resolve_multi_network_app_data_override(
        std::env::var_os(MULTI_NETWORK_APP_DATA_OVERRIDE),
        switching_enabled(),
    )
}

fn resolve_multi_network_app_data_override(
    configured: Option<OsString>,
    switching: bool,
) -> Result<Option<PathBuf>, NetworkSelectionError> {
    match configured {
        Some(path) => {
            validate_multi_network_app_data_override(PathBuf::from(path), switching).map(Some)
        }
        None => Ok(None),
    }
}

pub fn activate_selection(root: &Path) -> Result<(), NetworkSelectionError> {
    let selected = load_selection(root)?.unwrap_or(COMPILED_NETWORK);
    ACTIVE_NETWORK.store(network_code(selected), Ordering::Release);
    Ok(())
}

pub fn save_selection_at(root: &Path, selected: Network) -> Result<(), NetworkSelectionError> {
    if !is_selectable(selected) {
        return Err(NetworkSelectionError::Unsupported);
    }
    save_selection_file(root, selected)
}

pub fn parse_selectable(value: &str) -> Result<Network, NetworkSelectionError> {
    match value {
        "regtest" => Ok(Network::Regtest),
        "testnet4" => Ok(Network::Testnet4),
        "mainnet" => Ok(Network::Bitcoin),
        _ => Err(NetworkSelectionError::Unsupported),
    }
}

const fn is_selectable(network: Network) -> bool {
    matches!(
        network,
        Network::Regtest | Network::Testnet4 | Network::Bitcoin
    )
}

pub fn data_directory(root: PathBuf) -> PathBuf {
    data_directory_for(root, network(), switching_enabled())
}

fn data_directory_for(root: PathBuf, selected: Network, switching: bool) -> PathBuf {
    if switching && selected != Network::Regtest {
        root.join("networks").join(name_for(selected))
    } else {
        root
    }
}

fn selection_path(root: &Path) -> PathBuf {
    root.join(NETWORK_SELECTION_FILE)
}

fn load_selection(root: &Path) -> Result<Option<Network>, NetworkSelectionError> {
    let path = selection_path(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(NetworkSelectionError::Io),
    };
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_NETWORK_SELECTION_BYTES
    {
        return Err(NetworkSelectionError::UnsafeSelection);
    }
    let mut encoded = String::new();
    File::open(path)
        .and_then(|file| {
            file.take(MAX_NETWORK_SELECTION_BYTES + 1)
                .read_to_string(&mut encoded)
        })
        .map_err(|_| NetworkSelectionError::Io)?;
    let selection: NetworkSelection =
        serde_json::from_str(&encoded).map_err(|_| NetworkSelectionError::UnsafeSelection)?;
    if selection.version != NETWORK_SELECTION_VERSION {
        return Err(NetworkSelectionError::UnsafeSelection);
    }
    parse_selectable(&selection.network)
        .map(Some)
        .map_err(|_| NetworkSelectionError::UnsafeSelection)
}

fn save_selection_file(root: &Path, selected: Network) -> Result<(), NetworkSelectionError> {
    ensure_private_directory(root)?;
    let path = selection_path(root);
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(NetworkSelectionError::UnsafeSelection);
        }
    }
    let temporary = root.join(format!(".network-selection-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt as _;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| NetworkSelectionError::Io)?;
        let encoded = serde_json::to_vec(&NetworkSelection {
            version: NETWORK_SELECTION_VERSION,
            network: name_for(selected).to_owned(),
        })
        .map_err(|_| NetworkSelectionError::Io)?;
        file.write_all(&encoded)
            .and_then(|_| file.sync_all())
            .map_err(|_| NetworkSelectionError::Io)?;
        fs::rename(&temporary, &path).map_err(|_| NetworkSelectionError::Io)?;
        File::open(root)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| NetworkSelectionError::Io)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn ensure_private_directory(path: &Path) -> Result<(), NetworkSelectionError> {
    fs::create_dir_all(path).map_err(|_| NetworkSelectionError::Io)?;
    let metadata = fs::symlink_metadata(path).map_err(|_| NetworkSelectionError::Io)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(NetworkSelectionError::UnsafeSelection);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|_| NetworkSelectionError::Io)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        Address, CompressedPublicKey,
    };
    use std::str::FromStr;

    #[test]
    fn compiled_default_identity_is_consistent() {
        activate_selection(Path::new("/path/that/does/not/exist")).unwrap();
        assert_eq!(network(), COMPILED_NETWORK);
        assert_eq!(name(), name_for(COMPILED_NETWORK));
        assert_eq!(is_regtest(), network() == Network::Regtest);
        assert_eq!(parameters().network, network());
        assert_eq!(
            data_directory(PathBuf::from("/application-data")),
            PathBuf::from("/application-data")
        );
    }

    #[test]
    fn selectable_networks_are_an_exact_closed_set() {
        assert_eq!(parse_selectable("regtest"), Ok(Network::Regtest));
        assert_eq!(parse_selectable("testnet4"), Ok(Network::Testnet4));
        assert_eq!(parse_selectable("mainnet"), Ok(Network::Bitcoin));
        assert!(parse_selectable("signet").is_err());
        assert!(parse_selectable("testnet").is_err());
        assert!(parse_selectable("bitcoin").is_err());
        assert_eq!(
            NetworkSelectionError::Unavailable.code(),
            "network_switch_unavailable"
        );
        assert_eq!(NetworkSelectionError::Unsupported.code(), "invalid_network");
        assert_eq!(
            NetworkSelectionError::UnsafeSelection.code(),
            "unsafe_network_selection"
        );
        assert_eq!(NetworkSelectionError::Io.code(), "network_selection_failed");
        assert_eq!(
            NetworkSelectionError::UnsafeTestRoot.code(),
            "unsafe_test_root"
        );
    }

    #[test]
    fn dormant_mainnet_and_every_rehearsal_network_have_atomic_parameters() {
        let mainnet = parameters_for(Network::Bitcoin);
        assert_eq!(mainnet.extended_key_network, NetworkKind::Main);
        assert_eq!(mainnet.singlesig_account_path, "m/84'/0'/0'");
        assert_eq!(mainnet.multisig_account_path, "m/48'/0'/0'/2'");
        assert_eq!(mainnet.hwi_chain, "main");
        assert_eq!(mainnet.address_hrp, "bc");
        assert_parameter_keys_and_paths(mainnet, "xpub");

        for (network, hwi_chain, address_hrp) in [
            (Network::Regtest, "regtest", "bcrt"),
            (Network::Signet, "signet", "tb"),
            (Network::Testnet4, "testnet4", "tb"),
        ] {
            let parameters = parameters_for(network);
            assert_eq!(parameters.network, network);
            assert_eq!(parameters.extended_key_network, NetworkKind::Test);
            assert_eq!(parameters.singlesig_account_path, "m/84'/1'/0'");
            assert_eq!(parameters.multisig_account_path, "m/48'/1'/0'/2'");
            assert_eq!(parameters.hwi_chain, hwi_chain);
            assert_eq!(parameters.address_hrp, address_hrp);
            assert_parameter_keys_and_paths(parameters, "tpub");
        }

        for (network, code, name, rpc_url) in [
            (Network::Bitcoin, 0, "mainnet", "http://127.0.0.1:8332"),
            (Network::Testnet4, 1, "testnet4", "http://127.0.0.1:48332"),
            (Network::Regtest, 2, "regtest", "http://127.0.0.1:18443"),
            (Network::Signet, 3, "signet", "http://127.0.0.1:38332"),
            (Network::Testnet, 4, "testnet", "http://127.0.0.1:18332"),
        ] {
            assert_eq!(network_code(network), code);
            assert_eq!(network_from_code(code), network);
            assert_eq!(name_for(network), name);
            assert_eq!(default_rpc_url_for(network), rpc_url);
        }
        assert_eq!(network_from_code(u8::MAX), COMPILED_NETWORK);
    }

    #[test]
    fn selection_file_round_trips_and_rejects_corruption() {
        let root = std::env::temp_dir().join(format!("groot-network-selection-{}", Uuid::new_v4()));
        save_selection_at(&root, Network::Testnet4).unwrap();
        assert_eq!(load_selection(&root).unwrap(), Some(Network::Testnet4));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            assert_eq!(
                fs::metadata(&root).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(selection_path(&root))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        save_selection_at(&root, Network::Bitcoin).unwrap();
        assert_eq!(load_selection(&root).unwrap(), Some(Network::Bitcoin));
        for corrupt in [
            b"not-json".as_slice(),
            br#"{"version":2,"network":"regtest"}"#,
            br#"{"version":1,"network":"signet"}"#,
            br#"{"version":1,"network":"regtest","extra":true}"#,
        ] {
            fs::write(selection_path(&root), corrupt).unwrap();
            assert!(matches!(
                load_selection(&root),
                Err(NetworkSelectionError::UnsafeSelection)
            ));
        }
        fs::write(
            selection_path(&root),
            vec![b'x'; MAX_NETWORK_SELECTION_BYTES as usize + 1],
        )
        .unwrap();
        assert!(matches!(
            load_selection(&root),
            Err(NetworkSelectionError::UnsafeSelection)
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn selection_file_rejects_symlink_replacement() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!("groot-network-selection-{}", Uuid::new_v4()));
        let target = root.join("target");
        fs::create_dir_all(&root).unwrap();
        fs::write(&target, b"unchanged").unwrap();
        symlink(&target, selection_path(&root)).unwrap();
        assert!(matches!(
            save_selection_at(&root, Network::Bitcoin),
            Err(NetworkSelectionError::UnsafeSelection)
        ));
        assert_eq!(fs::read(target).unwrap(), b"unchanged");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selection_file_rejects_a_non_product_network() {
        let root = std::env::temp_dir().join(format!("groot-network-selection-{}", Uuid::new_v4()));
        assert_eq!(
            save_selection_at(&root, Network::Signet),
            Err(NetworkSelectionError::Unsupported)
        );
        assert!(!root.exists());
    }

    #[test]
    fn multi_network_storage_never_reuses_a_foreign_wallet_namespace() {
        let root = PathBuf::from("/application-data");
        assert_eq!(
            data_directory_for(root.clone(), Network::Regtest, true),
            root
        );
        assert_eq!(
            data_directory_for(root.clone(), Network::Testnet4, true),
            root.join("networks/testnet4")
        );
        assert_eq!(
            data_directory_for(root.clone(), Network::Bitcoin, true),
            root.join("networks/mainnet")
        );
        assert_eq!(
            data_directory_for(root.clone(), Network::Bitcoin, false),
            root
        );
    }

    #[test]
    fn isolated_multi_network_root_is_strictly_temporary_and_mode_bound() {
        #[cfg(unix)]
        let temporary_root = Path::new("/tmp").canonicalize().unwrap();
        #[cfg(not(unix))]
        let temporary_root = std::env::temp_dir().canonicalize().unwrap();
        let valid = temporary_root.join(format!("groot-multi-{}", Uuid::new_v4()));
        assert_eq!(
            validate_multi_network_app_data_override(valid.clone(), true),
            Ok(valid.clone())
        );
        assert_eq!(
            validate_multi_network_app_data_override(
                temporary_root.join(format!("groot-regtest-{}", Uuid::new_v4())),
                true
            ),
            Err(NetworkSelectionError::UnsafeTestRoot)
        );
        assert_eq!(
            validate_multi_network_app_data_override(
                temporary_root.join(format!("groot-multi-{}", Uuid::new_v4())),
                false
            ),
            Err(NetworkSelectionError::UnsafeTestRoot)
        );
        assert_eq!(
            validate_multi_network_app_data_override(PathBuf::from("groot-multi-relative"), true),
            Err(NetworkSelectionError::UnsafeTestRoot)
        );
        assert_eq!(
            resolve_multi_network_app_data_override(None, true),
            Ok(None)
        );
        assert_eq!(
            resolve_multi_network_app_data_override(Some(valid.clone().into_os_string()), true),
            Ok(Some(valid.clone()))
        );
        fs::write(&valid, b"not a directory").unwrap();
        assert_eq!(
            validate_multi_network_app_data_override(valid.clone(), true),
            Err(NetworkSelectionError::UnsafeTestRoot)
        );
        fs::remove_file(valid).unwrap();
    }

    #[test]
    fn optional_multi_network_root_uses_the_same_strict_validator() {
        assert_eq!(
            multi_network_app_data_override(),
            resolve_multi_network_app_data_override(
                std::env::var_os(MULTI_NETWORK_APP_DATA_OVERRIDE),
                switching_enabled(),
            )
        );
    }

    fn assert_parameter_keys_and_paths(parameters: NetworkParameters, xpub_prefix: &str) {
        DerivationPath::from_str(parameters.singlesig_account_path).unwrap();
        DerivationPath::from_str(parameters.multisig_account_path).unwrap();
        let master = Xpriv::new_master(parameters.extended_key_network, &[7_u8; 32]).unwrap();
        let account = Xpub::from_priv(&Secp256k1::new(), &master);
        assert!(account.to_string().starts_with(xpub_prefix));
        assert!(
            Address::p2wpkh(&CompressedPublicKey(account.public_key), parameters.network)
                .to_string()
                .starts_with(&format!("{}1", parameters.address_hrp))
        );
    }
}
