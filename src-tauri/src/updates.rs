//! Public release discovery and installer preparation. No wallet state or automatic installation.
use bdk_wallet::bitcoin::hashes::{sha256, Hash, HashEngine};
use ed25519_dalek::{Signature, VerifyingKey};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

const RELEASES: &str = "https://api.github.com/repos/grootwallet/groot/releases/latest";
const ASSET_ROOT: &str = "https://github.com/grootwallet/groot/releases/download/";
const MAX_INSTALLER: u64 = 2 * 1024 * 1024 * 1024;
// This is intentionally empty until the owner verifies and commits the real raw public key.
const PINNED_KEY: &str = include_str!("../../docs/release-update-key.hex");

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateError {
    Offline,
    RateLimited,
    InvalidRelease,
    UnsupportedPlatform,
    TrustUnavailable,
    VerificationFailed,
    Cancelled,
    Busy,
    Io,
}
type Result<T> = std::result::Result<T, UpdateError>;

#[derive(Clone, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
    state: String,
}
#[derive(Clone, Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOffer {
    version: String,
    verification_ready: bool,
}
#[derive(Default)]
pub struct UpdateState {
    operation: Mutex<()>,
    generation: AtomicU64,
    release: Mutex<Option<Release>>,
    retry_after: Mutex<Option<Instant>>,
    prepared: Mutex<Option<(String, PathBuf)>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedUpdate {
    pub filename: String,
    pub reveal_token: String,
}

fn stable_version(value: &str) -> Result<Version> {
    let version = Version::parse(value.strip_prefix('v').unwrap_or(value))
        .map_err(|_| UpdateError::InvalidRelease)?;
    if !version.pre.is_empty() || !version.build.is_empty() {
        return Err(UpdateError::InvalidRelease);
    }
    Ok(version)
}
fn newer(tag: &str, current: &str) -> Result<bool> {
    let available = stable_version(tag)?;
    let current = Version::parse(current).map_err(|_| UpdateError::InvalidRelease)?;
    Ok(available > current)
}
fn platform() -> Result<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok("macos-arm64.dmg")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok("windows-x64.msi")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok("linux-x64.deb")
    } else {
        Err(UpdateError::UnsupportedPlatform)
    }
}
fn artifact_name(version: &str, platform: &str) -> String {
    format!("Groot-{version}-{platform}")
}
fn key_from_hex(encoded: &str) -> Result<VerifyingKey> {
    let encoded = encoded.trim();
    if encoded.len() != 64 || !encoded.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(UpdateError::TrustUnavailable);
    }
    let mut key = [0; 32];
    for (i, byte) in key.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&encoded[i * 2..i * 2 + 2], 16)
            .map_err(|_| UpdateError::TrustUnavailable)?;
    }
    let key = VerifyingKey::from_bytes(&key).map_err(|_| UpdateError::TrustUnavailable)?;
    if key.is_weak() {
        return Err(UpdateError::TrustUnavailable);
    }
    Ok(key)
}
fn asset<'a>(release: &'a Release, name: &str, limit: u64) -> Result<&'a Asset> {
    let matches: Vec<_> = release.assets.iter().filter(|a| a.name == name).collect();
    if matches.len() != 1 {
        return Err(UpdateError::InvalidRelease);
    }
    let selected = matches[0];
    let expected = format!("{ASSET_ROOT}{}/{name}", release.tag_name);
    if selected.browser_download_url != expected
        || selected.state != "uploaded"
        || selected.size == 0
        || selected.size > limit
    {
        return Err(UpdateError::InvalidRelease);
    }
    Ok(selected)
}
fn allowed_cdn(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.fragment().is_none()
        && url.host_str() == Some("release-assets.githubusercontent.com")
}
fn cancelled(state: &UpdateState, generation: u64, start: Instant) -> Result<()> {
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err(UpdateError::Cancelled);
    }
    if start.elapsed() > Duration::from_secs(300) {
        return Err(UpdateError::Offline);
    }
    Ok(())
}
fn response(url: &str, allow_asset_redirect: bool) -> Result<minreq::ResponseLazy> {
    let request = |url: &str| {
        minreq::get(url)
            .with_timeout(20)
            .with_follow_redirects(false)
            .with_max_headers_size(32 * 1024)
            .with_max_status_line_length(1024)
            .with_header("User-Agent", concat!("Groot/", env!("CARGO_PKG_VERSION")))
            .with_header(
                "Accept",
                if url == RELEASES {
                    "application/vnd.github+json"
                } else {
                    "application/octet-stream"
                },
            )
    };
    let mut response = request(url).send_lazy().map_err(|_| UpdateError::Offline)?;
    if allow_asset_redirect && [301, 302, 303, 307, 308].contains(&response.status_code) {
        let location = response
            .headers
            .get("location")
            .ok_or(UpdateError::InvalidRelease)?;
        if !allowed_cdn(location) {
            return Err(UpdateError::InvalidRelease);
        }
        response = request(location)
            .send_lazy()
            .map_err(|_| UpdateError::Offline)?;
    }
    match response.status_code {
        200 => Ok(response),
        404 if url == RELEASES => Ok(response),
        403 | 429 => Err(UpdateError::RateLimited),
        _ => Err(UpdateError::InvalidRelease),
    }
}
fn transfer(
    reader: &mut impl Read,
    writer: &mut impl Write,
    limit: u64,
    state: &UpdateState,
    generation: u64,
) -> Result<(u64, String)> {
    let start = Instant::now();
    let mut buffer = [0; 64 * 1024];
    let mut count = 0u64;
    let mut hash = sha256::Hash::engine();
    loop {
        cancelled(state, generation, start)?;
        let read = reader.read(&mut buffer).map_err(|_| UpdateError::Offline)?;
        if read == 0 {
            break;
        }
        count = count
            .checked_add(read as u64)
            .ok_or(UpdateError::VerificationFailed)?;
        if count > limit {
            return Err(UpdateError::VerificationFailed);
        }
        hash.input(&buffer[..read]);
        writer
            .write_all(&buffer[..read])
            .map_err(|_| UpdateError::Io)?;
    }
    cancelled(state, generation, start)?;
    Ok((count, sha256::Hash::from_engine(hash).to_string()))
}
fn bytes(
    url: &str,
    redirect: bool,
    limit: u64,
    state: &UpdateState,
    generation: u64,
) -> Result<Vec<u8>> {
    let mut response = response(url, redirect)?;
    if response.status_code == 404 && url == RELEASES {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    transfer(&mut response, &mut result, limit, state, generation)?;
    Ok(result)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u32,
    product: String,
    channel: String,
    version: String,
    commit: String,
    artifact: String,
    sha256: String,
    minimum_supported_version: String,
    rollback_allowed_from: Vec<String>,
}
fn verified_manifest(
    encoded: &[u8],
    signature: &[u8],
    key: &VerifyingKey,
    version: &str,
    filename: &str,
    current: &str,
) -> Result<Manifest> {
    if encoded.is_empty() || encoded.len() > 64 * 1024 {
        return Err(UpdateError::VerificationFailed);
    }
    let signature =
        Signature::from_slice(signature).map_err(|_| UpdateError::VerificationFailed)?;
    key.verify_strict(encoded, &signature)
        .map_err(|_| UpdateError::VerificationFailed)?;
    let m: Manifest =
        serde_json::from_slice(encoded).map_err(|_| UpdateError::VerificationFailed)?;
    let hex = |s: &str, n: usize| {
        s.len() == n
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    };
    let current = Version::parse(current).map_err(|_| UpdateError::VerificationFailed)?;
    if m.schema_version != 1
        || m.product != "Groot"
        || m.channel != "stable"
        || m.version != version
        || m.artifact != filename
        || !hex(&m.commit, 40)
        || !hex(&m.sha256, 64)
        || stable_version(&m.version).is_err()
        || Version::parse(&m.minimum_supported_version)
            .map_err(|_| UpdateError::VerificationFailed)?
            > current
        || m.rollback_allowed_from.len() > 100
        || m.rollback_allowed_from
            .iter()
            .any(|v| Version::parse(v).is_err())
    {
        return Err(UpdateError::VerificationFailed);
    }
    Ok(m)
}
fn check(state: &UpdateState, generation: u64) -> Result<Option<UpdateOffer>> {
    let _operation = state.operation.try_lock().map_err(|_| UpdateError::Busy)?;
    if state
        .retry_after
        .lock()
        .map_err(|_| UpdateError::Io)?
        .is_some_and(|until| Instant::now() < until)
    {
        return Err(UpdateError::RateLimited);
    }
    *state.release.lock().map_err(|_| UpdateError::Io)? = None;
    cancelled(state, generation, Instant::now())?;
    let encoded = match bytes(RELEASES, false, 256 * 1024, state, generation) {
        Err(UpdateError::RateLimited) => {
            *state.retry_after.lock().map_err(|_| UpdateError::Io)? =
                Some(Instant::now() + Duration::from_secs(3600));
            return Err(UpdateError::RateLimited);
        }
        result => result?,
    };
    let release: Release =
        serde_json::from_slice(&encoded).map_err(|_| UpdateError::InvalidRelease)?;
    if release.draft || release.prerelease {
        return Ok(None);
    }
    let version = stable_version(&release.tag_name)?.to_string();
    if !newer(&release.tag_name, env!("CARGO_PKG_VERSION"))? {
        return Ok(None);
    }
    if release.assets.len() > 100 {
        return Err(UpdateError::InvalidRelease);
    }
    let filename = artifact_name(&version, platform()?);
    let ready = key_from_hex(PINNED_KEY).is_ok()
        && asset(&release, &filename, MAX_INSTALLER).is_ok()
        && asset(&release, &format!("{filename}.update.json"), 64 * 1024).is_ok()
        && asset(&release, &format!("{filename}.update.sig"), 64).is_ok();
    cancelled(state, generation, Instant::now())?;
    *state.release.lock().map_err(|_| UpdateError::Io)? = Some(release);
    Ok(Some(UpdateOffer {
        version,
        verification_ready: ready,
    }))
}
// Random private staging directory; failures, cancellation and process restart clean it.
struct Stage {
    path: PathBuf,
    keep: bool,
}
impl Drop for Stage {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
fn download(state: &UpdateState, root: PathBuf, generation: u64) -> Result<PreparedUpdate> {
    let _operation = state.operation.try_lock().map_err(|_| UpdateError::Busy)?;
    cancelled(state, generation, Instant::now())?;
    let key = key_from_hex(PINNED_KEY)?;
    let release = state
        .release
        .lock()
        .map_err(|_| UpdateError::Io)?
        .clone()
        .ok_or(UpdateError::InvalidRelease)?;
    prepare(state, root, &key, &release, generation, |url| {
        response(url, true)
    })
}
fn prepare<R: Read>(
    state: &UpdateState,
    root: PathBuf,
    key: &VerifyingKey,
    release: &Release,
    generation: u64,
    mut fetch: impl FnMut(&str) -> Result<R>,
) -> Result<PreparedUpdate> {
    cancelled(state, generation, Instant::now())?;
    let version = stable_version(&release.tag_name)?.to_string();
    if release.draft || release.prerelease || !newer(&release.tag_name, env!("CARGO_PKG_VERSION"))?
    {
        return Err(UpdateError::InvalidRelease);
    }
    let filename = artifact_name(&version, platform()?);
    let installer = asset(release, &filename, MAX_INSTALLER)?;
    let manifest_asset = asset(release, &format!("{filename}.update.json"), 64 * 1024)?;
    let signature_asset = asset(release, &format!("{filename}.update.sig"), 64)?;
    let mut encoded = Vec::new();
    transfer(
        &mut fetch(&manifest_asset.browser_download_url)?,
        &mut encoded,
        64 * 1024,
        state,
        generation,
    )?;
    let mut signature = Vec::new();
    transfer(
        &mut fetch(&signature_asset.browser_download_url)?,
        &mut signature,
        64,
        state,
        generation,
    )?;
    if encoded.len() as u64 != manifest_asset.size || signature.len() as u64 != signature_asset.size
    {
        return Err(UpdateError::VerificationFailed);
    }
    let manifest = verified_manifest(
        &encoded,
        &signature,
        key,
        &version,
        &filename,
        env!("CARGO_PKG_VERSION"),
    )?;
    fs::create_dir_all(&root).map_err(|_| UpdateError::Io)?;
    if fs::symlink_metadata(&root)
        .map_err(|_| UpdateError::Io)?
        .file_type()
        .is_symlink()
    {
        return Err(UpdateError::Io);
    }
    let mut stage = Stage {
        path: root.join(format!("pending-{}", uuid::Uuid::new_v4())),
        keep: false,
    };
    fs::create_dir(&stage.path).map_err(|_| UpdateError::Io)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&stage.path, fs::Permissions::from_mode(0o700))
            .map_err(|_| UpdateError::Io)?;
    }
    let partial = stage.path.join("installer.part");
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&partial).map_err(|_| UpdateError::Io)?;
    let mut reader = fetch(&installer.browser_download_url)?;
    let (count, digest) = transfer(&mut reader, &mut file, installer.size, state, generation)?;
    if count != installer.size || digest != manifest.sha256 {
        return Err(UpdateError::VerificationFailed);
    }
    file.sync_all().map_err(|_| UpdateError::Io)?;
    drop(file);
    cancelled(state, generation, Instant::now())?;
    let completed = stage.path.join(&filename);
    fs::rename(partial, &completed).map_err(|_| UpdateError::Io)?;
    let reveal_token = uuid::Uuid::new_v4().to_string();
    let mut prepared = state.prepared.lock().map_err(|_| UpdateError::Io)?;
    cancelled(state, generation, Instant::now())?;
    if let Some((_, old)) = prepared.take() {
        if let Some(parent) = old.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }
    *prepared = Some((reveal_token.clone(), completed));
    stage.keep = true; // Kept until app restart for explicit user installation.
    Ok(PreparedUpdate {
        filename,
        reveal_token,
    })
}
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<Option<UpdateOffer>> {
    let generation = app.state::<UpdateState>().generation.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || check(&app.state::<UpdateState>(), generation))
        .await
        .map_err(|_| UpdateError::Io)?
}
#[tauri::command]
pub async fn update_download(app: tauri::AppHandle) -> Result<PreparedUpdate> {
    let generation = app.state::<UpdateState>().generation.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let root = app
            .path()
            .app_cache_dir()
            .map_err(|_| UpdateError::Io)?
            .join("verified-updates");
        download(&app.state::<UpdateState>(), root, generation)
    })
    .await
    .map_err(|_| UpdateError::Io)?
}
#[tauri::command]
pub fn update_cancel(state: tauri::State<'_, UpdateState>) {
    state.generation.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut prepared) = state.prepared.lock() {
        if let Some((_, path)) = prepared.take() {
            if let Some(parent) = path.parent() {
                let _ = fs::remove_dir_all(parent);
            }
        }
    }
}
#[tauri::command]
pub fn update_reveal(app: tauri::AppHandle, token: String) -> Result<()> {
    let state = app.state::<UpdateState>();
    let prepared = state.prepared.lock().map_err(|_| UpdateError::Io)?;
    let (expected, path) = prepared.as_ref().ok_or(UpdateError::InvalidRelease)?;
    if expected != &token {
        return Err(UpdateError::InvalidRelease);
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|_| UpdateError::Io)
}

pub fn cleanup(app: &tauri::AppHandle) {
    // Only this application's cache entries, never a wallet/profile directory.
    let Ok(root) = app.path().app_cache_dir() else {
        return;
    };
    let root = root.join("verified-updates");
    let Ok(metadata) = fs::symlink_metadata(&root) else {
        return;
    };
    if metadata.file_type().is_symlink() {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name
            .strip_prefix("pending-")
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
            && entry
                .file_type()
                .is_ok_and(|kind| kind.is_dir() && !kind.is_symlink())
        {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    fn fixture() -> (Vec<u8>, Signature, VerifyingKey) {
        // Disposable deterministic fixture. Compiled only in tests, never in an application.
        let signing = SigningKey::from_bytes(&[7; 32]);
        let body = serde_json::to_vec(&serde_json::json!({
            "schemaVersion":1,"product":"Groot","channel":"stable","version":"5.2.0",
            "commit":"a".repeat(40),"artifact":"Groot-5.2.0-macos-arm64.dmg",
            "sha256":sha256::Hash::hash(b"fixture installer").to_string(),
            "minimumSupportedVersion":"0.5.1","rollbackAllowedFrom":[]
        }))
        .unwrap();
        let signature = signing.sign(&body);
        (body, signature, signing.verifying_key())
    }
    #[test]
    fn versions_do_not_notify_for_same_older_or_prerelease_and_compare_numerically() {
        assert!(!newer("v0.5.1", "5.2.0-rc03").unwrap());
        assert!(!newer("v5.2.0", "5.2.0").unwrap());
        assert!(newer("v5.2.0", "5.2.0-rc03").unwrap());
        assert!(newer("v5.10.0", "5.9.0").unwrap());
        for version in ["v5.2.0-rc03", "5.2.0+build", "5.02.0", "../5.2.0", "5.2"] {
            assert!(stable_version(version).is_err());
        }
    }
    #[test]
    fn signature_binds_bytes_platform_version_and_schema() {
        let (body, signature, key) = fixture();
        let verify = |b: &[u8], sig: &[u8], k: &VerifyingKey, v: &str, name: &str| {
            verified_manifest(b, sig, k, v, name, "5.2.0-rc03")
        };
        let name = "Groot-5.2.0-macos-arm64.dmg";
        assert!(verify(&body, &signature.to_bytes(), &key, "5.2.0", name).is_ok());
        let mut tampered = body.clone();
        tampered[0] ^= 1;
        assert!(verify(&tampered, &signature.to_bytes(), &key, "5.2.0", name).is_err());
        assert!(verify(&body, &[0; 64], &key, "5.2.0", name).is_err());
        assert!(verify(
            &body,
            &signature.to_bytes(),
            &SigningKey::from_bytes(&[9; 32]).verifying_key(),
            "5.2.0",
            name
        )
        .is_err());
        assert!(verify(&body, &signature.to_bytes(), &key, "5.3.0", name).is_err());
        assert!(verify(&body, &signature.to_bytes(), &key, "5.2.0", "windows.msi").is_err());
        let mut expanded: serde_json::Value = serde_json::from_slice(&body).unwrap();
        expanded["extra"] = true.into();
        let expanded = serde_json::to_vec(&expanded).unwrap();
        let signer = SigningKey::from_bytes(&[7; 32]);
        assert!(verify(
            &expanded,
            &signer.sign(&expanded).to_bytes(),
            &key,
            "5.2.0",
            name
        )
        .is_err());
        assert!(
            verified_manifest(&body, &signature.to_bytes(), &key, "5.2.0", name, "0.5.0").is_err()
        );
        assert_eq!(key_from_hex("").unwrap_err(), UpdateError::TrustUnavailable);
        assert_eq!(
            key_from_hex(&"00".repeat(32)).unwrap_err(),
            UpdateError::TrustUnavailable
        );
    }
    #[test]
    fn selection_rejects_duplicate_foreign_path_unuploaded_and_oversized_assets() {
        let name = "Groot-5.2.0-macos-arm64.dmg";
        let a = Asset {
            name: name.into(),
            browser_download_url: format!("{ASSET_ROOT}v5.2.0/{name}"),
            size: 12,
            state: "uploaded".into(),
        };
        let mut r = Release {
            tag_name: "v5.2.0".into(),
            draft: false,
            prerelease: false,
            assets: vec![a.clone()],
        };
        assert!(asset(&r, name, 12).is_ok());
        assert!(asset(&r, name, 11).is_err());
        r.assets.push(a);
        assert!(asset(&r, name, 12).is_err());
        r.assets.pop();
        r.assets[0].browser_download_url =
            format!("https://github.com/attacker/groot/releases/download/v5.2.0/{name}");
        assert!(asset(&r, name, 12).is_err());
        for u in [
            "http://release-assets.githubusercontent.com/a",
            "https://release-assets.githubusercontent.com.evil/a",
            "https://user@release-assets.githubusercontent.com/a",
            "https://127.0.0.1/a",
            "https://github.com/a",
        ] {
            assert!(!allowed_cdn(u));
        }
        assert!(allowed_cdn(
            "https://release-assets.githubusercontent.com/a?token=fixture"
        ));
    }
    #[test]
    fn bounded_transfer_checks_digest_cancellation_and_stage_cleanup() {
        let state = UpdateState::default();
        let input = b"fixture installer";
        let (manifest, signature, key) = fixture();
        let m = verified_manifest(
            &manifest,
            &signature.to_bytes(),
            &key,
            "5.2.0",
            "Groot-5.2.0-macos-arm64.dmg",
            "5.2.0-rc03",
        )
        .unwrap();
        let root =
            std::env::temp_dir().join(format!("groot-update-fixture-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        {
            let _stage = Stage {
                path: root.clone(),
                keep: false,
            };
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(root.join("installer.part"))
                .unwrap();
            let (count, digest) =
                transfer(&mut input.as_slice(), &mut file, 100, &state, 0).unwrap();
            assert_eq!(count, input.len() as u64);
            assert_eq!(digest, m.sha256);
            assert!(transfer(&mut input.as_slice(), &mut Vec::new(), 5, &state, 0).is_err());
            state.generation.store(1, Ordering::SeqCst);
            assert_eq!(
                transfer(&mut input.as_slice(), &mut Vec::new(), 100, &state, 0).unwrap_err(),
                UpdateError::Cancelled
            );
        }
        assert!(!root.exists());
        assert_eq!(
            download(&state, root, 1).err(),
            Some(UpdateError::TrustUnavailable)
        );
    }
}

#[cfg(test)]
mod preparation_tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    #[test]
    fn signed_fixture_runs_whole_preparation_and_corrupt_download_never_exposes_installer() {
        let key = SigningKey::from_bytes(&[11; 32]);
        let installer = b"disposable fixture installer";
        let name = artifact_name("5.2.0", platform().unwrap());
        let manifest = serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"product":"Groot","channel":"stable","version":"5.2.0","artifact":name,"sha256":sha256::Hash::hash(installer).to_string(),"commit":"b".repeat(40),"minimumSupportedVersion":"0.5.1","rollbackAllowedFrom":[]})).unwrap();
        let signature = key.sign(&manifest).to_bytes().to_vec();
        let r = Release {
            tag_name: "v5.2.0".into(),
            draft: false,
            prerelease: false,
            assets: [
                (name.clone(), installer.len()),
                (format!("{name}.update.json"), manifest.len()),
                (format!("{name}.update.sig"), signature.len()),
            ]
            .into_iter()
            .map(|(name, size)| Asset {
                browser_download_url: format!("{ASSET_ROOT}v5.2.0/{name}"),
                name,
                size: size as u64,
                state: "uploaded".into(),
            })
            .collect(),
        };
        let root =
            std::env::temp_dir().join(format!("groot-update-fixture-{}", uuid::Uuid::new_v4()));
        let state = UpdateState::default();
        let fetch = |url: &str| {
            Ok(std::io::Cursor::new(if url.ends_with(".json") {
                manifest.clone()
            } else if url.ends_with(".sig") {
                signature.clone()
            } else {
                installer.to_vec()
            }))
        };
        let result = prepare(&state, root.clone(), &key.verifying_key(), &r, 0, fetch).unwrap();
        assert_eq!(result.filename, name);
        let stored = state.prepared.lock().unwrap().clone().unwrap();
        assert_eq!(stored.0, result.reveal_token);
        assert_eq!(fs::read(&stored.1).unwrap(), installer);
        fs::remove_dir_all(&root).unwrap();
        *state.prepared.lock().unwrap() = None;
        let corrupt = |url: &str| {
            Ok(std::io::Cursor::new(if url.ends_with(".json") {
                manifest.clone()
            } else if url.ends_with(".sig") {
                signature.clone()
            } else {
                vec![0; installer.len()]
            }))
        };
        assert_eq!(
            prepare(&state, root.clone(), &key.verifying_key(), &r, 0, corrupt).err(),
            Some(UpdateError::VerificationFailed)
        );
        assert!(state.prepared.lock().unwrap().is_none());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
}
