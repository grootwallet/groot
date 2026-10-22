//! ADRs 0098/0102/0103/0104: app-sealed HWI payload for explicit network scopes.
use super::{HardwareError, HwiChain, HwiSource, MAINNET_FAST_ENABLED};
use bdk_wallet::bitcoin::hashes::{sha256, Hash};
use serde::Deserialize;
use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 256;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeManifest {
    schema_version: u32,
    source_sha256: String,
    files: Vec<RuntimeFile>,
    links: Vec<RuntimeLink>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RuntimeFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RuntimeLink {
    path: String,
    target: String,
}

fn relative_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() < 512
        && value.is_ascii()
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_./+-".contains(&byte))
        && Path::new(value)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

fn digest_matches(bytes: &[u8], expected: &str) -> bool {
    expected.len() == 64
        && expected
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        && sha256::Hash::hash(bytes).to_string() == expected
}

fn regular_file(path: &Path, limit: u64) -> Result<Vec<u8>, HardwareError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| HardwareError::Unavailable)?;
    use std::os::unix::fs::PermissionsExt as _;
    if !metadata.is_file() || metadata.len() > limit || metadata.permissions().mode() & 0o022 != 0 {
        return Err(HardwareError::Unavailable);
    }
    let file = fs::File::open(path).map_err(|_| HardwareError::Unavailable)?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| HardwareError::Unavailable)?;
    if bytes.len() as u64 != metadata.len() {
        return Err(HardwareError::Unavailable);
    }
    Ok(bytes)
}

fn inventory(
    root: &Path,
    directory: &Path,
    actual: &mut BTreeSet<String>,
    visited: &mut usize,
) -> Result<(), HardwareError> {
    use std::os::unix::fs::PermissionsExt as _;
    if directory
        .components()
        .count()
        .saturating_sub(root.components().count())
        > 16
    {
        return Err(HardwareError::Unavailable);
    }
    for entry in fs::read_dir(directory).map_err(|_| HardwareError::Unavailable)? {
        *visited += 1;
        if *visited > MAX_ENTRIES * 2 {
            return Err(HardwareError::Unavailable);
        }
        let path = entry.map_err(|_| HardwareError::Unavailable)?.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|_| HardwareError::Unavailable)?
            .to_str()
            .ok_or(HardwareError::Unavailable)?
            .to_owned();
        if !relative_path(&relative) {
            return Err(HardwareError::Unavailable);
        }
        let metadata = fs::symlink_metadata(&path).map_err(|_| HardwareError::Unavailable)?;
        if metadata.is_dir() {
            if metadata.permissions().mode() & 0o022 != 0 {
                return Err(HardwareError::Unavailable);
            }
            inventory(root, &path, actual, visited)?;
        } else {
            if relative != "runtime-manifest.json" {
                actual.insert(relative);
            }
            if actual.len() > MAX_ENTRIES {
                return Err(HardwareError::Unavailable);
            }
        }
    }
    Ok(())
}

fn verify_runtime(
    root: &Path,
    manifest_digest: &str,
    source_digest: &str,
) -> Result<PathBuf, HardwareError> {
    use std::os::unix::fs::PermissionsExt as _;
    let metadata = fs::symlink_metadata(root).map_err(|_| HardwareError::Unavailable)?;
    if !metadata.is_dir()
        || metadata.permissions().mode() & 0o022 != 0
        || root
            .canonicalize()
            .map_err(|_| HardwareError::Unavailable)?
            != root
    {
        return Err(HardwareError::Unavailable);
    }
    let bytes = regular_file(&root.join("runtime-manifest.json"), 128 * 1024)?;
    if !digest_matches(&bytes, manifest_digest) {
        return Err(HardwareError::Unavailable);
    }
    let manifest: RuntimeManifest =
        serde_json::from_slice(&bytes).map_err(|_| HardwareError::Unavailable)?;
    if manifest.schema_version != 1
        || manifest.source_sha256 != source_digest
        || manifest.files.is_empty()
        || manifest.files.len() + manifest.links.len() > MAX_ENTRIES
    {
        return Err(HardwareError::Unavailable);
    }
    let mut expected = BTreeSet::new();
    let mut total = 0_u64;
    for file in manifest.files {
        if !relative_path(&file.path)
            || !expected.insert(file.path.clone())
            || file.path == "runtime-manifest.json"
        {
            return Err(HardwareError::Unavailable);
        }
        total = total
            .checked_add(file.size)
            .ok_or(HardwareError::Unavailable)?;
        if total > MAX_BYTES {
            return Err(HardwareError::Unavailable);
        }
        let path = root.join(&file.path);
        if path
            .canonicalize()
            .map_err(|_| HardwareError::Unavailable)?
            != path
        {
            return Err(HardwareError::Unavailable);
        }
        let data = regular_file(&path, file.size)?;
        if data.len() as u64 != file.size || !digest_matches(&data, &file.sha256) {
            return Err(HardwareError::Unavailable);
        }
    }
    for link in manifest.links {
        if !relative_path(&link.path)
            || !relative_path(&link.target)
            || !expected.insert(link.path.clone())
        {
            return Err(HardwareError::Unavailable);
        }
        let path = root.join(&link.path);
        if fs::read_link(&path).map_err(|_| HardwareError::Unavailable)? != Path::new(&link.target)
            || !path
                .canonicalize()
                .map_err(|_| HardwareError::Unavailable)?
                .starts_with(root)
        {
            return Err(HardwareError::Unavailable);
        }
    }
    let mut actual = BTreeSet::new();
    inventory(root, root, &mut actual, &mut 0)?;
    if actual != expected {
        return Err(HardwareError::Unavailable);
    }
    Ok(root.to_path_buf())
}

fn selected_fast_internal(
    arguments: &[String],
    active_chain: HwiChain,
    mainnet_enabled: bool,
) -> bool {
    if arguments.first().map(String::as_str) != Some("--chain")
        || arguments.get(2).map(String::as_str) != Some("--device-type")
    {
        return false;
    }
    match (
        active_chain,
        arguments.get(1).map(String::as_str),
        arguments.get(3).map(String::as_str),
    ) {
        (
            HwiChain::Testnet4,
            Some("testnet4"),
            Some("coldcard" | "ledger" | "bitbox02" | "trezor" | "jade"),
        ) => true,
        // HWI 3.2.0's Jade driver requires its shared test-network selector.
        // The explicit native chain prevents this from admitting Testnet3.
        (HwiChain::Testnet4, Some("test"), Some("jade")) => true,
        (
            HwiChain::Main,
            Some("main"),
            Some("coldcard" | "ledger" | "bitbox02" | "trezor" | "jade"),
        ) if mainnet_enabled => true,
        _ => false,
    }
}

fn approved_runtime_scope(network_is_multi: bool, team: Option<&str>, version: &str) -> bool {
    network_is_multi
        && match team {
            Some("REHEARSAL_ONLY") => true,
            Some("6Z85HGDUU7") => version == "5.3.0",
            _ => false,
        }
}

// Called only after the existing full app/helper signature and HWI digest checks.
// An enabled but invalid runtime fails closed; it never falls back after a request.
pub(super) fn for_operation(
    source: &HwiSource,
    arguments: &[String],
    active_chain: HwiChain,
) -> Result<Option<PathBuf>, HardwareError> {
    let Some(expected) = option_env!("GROOT_HWI_RUNTIME_SHA256") else {
        return Ok(None);
    };
    if !selected_fast_internal(arguments, active_chain, MAINNET_FAST_ENABLED) {
        return Ok(None);
    }
    if !approved_runtime_scope(
        cfg!(groot_network = "multi"),
        option_env!("GROOT_MACOS_SIGNING_TEAM_ID"),
        env!("CARGO_PKG_VERSION"),
    ) {
        return Err(HardwareError::Unavailable);
    }
    let HwiSource::Bundled { bundle_root } = source else {
        return Err(HardwareError::Unavailable);
    };
    let source_digest = option_env!("GROOT_HWI_SHA256").ok_or(HardwareError::Unavailable)?;
    verify_runtime(
        &bundle_root.join("Contents/Resources/hwi-runtime"),
        expected,
        source_digest,
    )
    .map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::os::unix::fs::symlink;

    #[test]
    fn production_runtime_scope_is_exactly_the_approved_team_version_and_network() {
        assert!(approved_runtime_scope(
            true,
            Some("REHEARSAL_ONLY"),
            "5.3.0-rc18"
        ));
        assert!(approved_runtime_scope(true, Some("6Z85HGDUU7"), "5.3.0"));
        for (network, team, version) in [
            (false, Some("6Z85HGDUU7"), "5.3.0"),
            (true, Some("6Z85HGDUU7"), "5.3.0-rc18"),
            (true, Some("6Z85HGDUU7"), "5.3.1"),
            (true, Some("OTHERTEAM1"), "5.3.0"),
            (true, None, "5.3.0"),
        ] {
            assert!(!approved_runtime_scope(network, team, version));
        }
    }

    fn fixture() -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("groot-hwi-runtime-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("Python"), b"runtime fixture").unwrap();
        symlink("Python", root.join("alias")).unwrap();
        let manifest = json!({"schemaVersion":1,"sourceSha256":"source", "files":[
            {"path":"Python","size":15,"sha256":sha256::Hash::hash(b"runtime fixture").to_string()}],
            "links":[{"path":"alias","target":"Python"}]});
        let bytes = serde_json::to_vec(&manifest).unwrap();
        fs::write(root.join("runtime-manifest.json"), &bytes).unwrap();
        (
            root.canonicalize().unwrap(),
            sha256::Hash::hash(&bytes).to_string(),
        )
    }

    #[test]
    fn runtime_selection_binds_mainnet_to_explicit_main_only_when_enabled() {
        for active_chain in [
            HwiChain::Main,
            HwiChain::Test,
            HwiChain::Signet,
            HwiChain::Regtest,
            HwiChain::Testnet4,
        ] {
            for selector in ["main", "test", "signet", "regtest", "testnet4"] {
                for device in ["coldcard", "trezor", "bitbox02", "ledger", "jade"] {
                    let args = ["--chain", selector, "--device-type", device].map(str::to_owned);
                    for mainnet_enabled in [false, true] {
                        let testnet4 = active_chain == HwiChain::Testnet4
                            && (selector == "testnet4" || (selector == "test" && device == "jade"));
                        let mainnet =
                            mainnet_enabled && active_chain == HwiChain::Main && selector == "main";
                        assert_eq!(
                            selected_fast_internal(&args, active_chain, mainnet_enabled),
                            testnet4 || mainnet
                        );
                    }
                }
            }
        }
        assert!(!selected_fast_internal(&[], HwiChain::Testnet4, false));
        assert!(selected_fast_internal(
            &["--chain", "main", "--device-type", "jade"].map(str::to_owned),
            HwiChain::Main,
            MAINNET_FAST_ENABLED
        ));
    }

    #[test]
    fn sealed_runtime_requires_exact_manifest_and_source() {
        let (root, digest) = fixture();
        assert_eq!(verify_runtime(&root, &digest, "source").unwrap(), root);
        assert!(verify_runtime(&root, &"0".repeat(64), "source").is_err());
        assert!(verify_runtime(&root, &digest, "different").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sealed_runtime_rejects_modified_missing_and_extra_files() {
        let (root, digest) = fixture();
        fs::write(root.join("extra"), b"injected").unwrap();
        assert!(verify_runtime(&root, &digest, "source").is_err());
        fs::remove_file(root.join("extra")).unwrap();
        fs::write(root.join("Python"), b"tampered bytes!").unwrap();
        assert!(verify_runtime(&root, &digest, "source").is_err());
        fs::remove_file(root.join("Python")).unwrap();
        assert!(verify_runtime(&root, &digest, "source").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sealed_runtime_rejects_symlink_substitution_and_writable_payload() {
        use std::os::unix::fs::PermissionsExt as _;
        let (root, digest) = fixture();
        fs::set_permissions(root.join("Python"), fs::Permissions::from_mode(0o666)).unwrap();
        assert!(verify_runtime(&root, &digest, "source").is_err());
        fs::set_permissions(root.join("Python"), fs::Permissions::from_mode(0o644)).unwrap();
        fs::remove_file(root.join("alias")).unwrap();
        symlink("/etc/hosts", root.join("alias")).unwrap();
        assert!(verify_runtime(&root, &digest, "source").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "explicit build-time payload probe; never opens a device"]
    fn packaged_runtime_integrity_probe() {
        let root = PathBuf::from(std::env::var("GROOT_TEST_HWI_RUNTIME_DIR").unwrap());
        let digest = std::env::var("GROOT_TEST_HWI_RUNTIME_SHA256").unwrap();
        let source = "87a8991848a0216213ddf6497c753cebbda492626afaf5608c30931155c922c3";
        assert_eq!(verify_runtime(&root, &digest, source).unwrap(), root);
    }

    #[test]
    fn runtime_paths_reject_traversal_and_ambiguous_components() {
        for invalid in [
            "",
            "/Python",
            "../Python",
            "a/../Python",
            "a//b",
            "./Python",
            "a\\b",
        ] {
            assert!(!relative_path(invalid));
        }
        assert!(relative_path("Python.framework/Versions/3.9/Python"));
    }
}
