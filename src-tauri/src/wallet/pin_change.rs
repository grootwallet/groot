use super::*;

const JOURNAL: &str = "pin-change-rollback.json";
const STAGE: &str = "pin-change-stage.json";

// Only ciphertext is journaled. Existing secret/node-secret formats do not change.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Rollback {
    wallet_id: Uuid,
    files: Vec<(String, serde_json::Value)>,
}

pub(super) fn recover_pending(directory: &Path, wallet_id: Uuid) -> ApiResult<()> {
    let path = directory.join(JOURNAL);
    if !path.try_exists().map_err(internal)? {
        return Ok(());
    }
    let rollback: Rollback = serde_json::from_str(&read_private_text(&path)?).map_err(internal)?;
    if rollback.wallet_id != wallet_id
        || rollback.files.is_empty()
        || rollback.files.len() > 2
        || rollback
            .files
            .iter()
            .any(|(name, _)| name != "secret.json" && name != "node-secret.json")
    {
        return Err(api_error(
            "wallet_corrupt",
            "The interrupted PIN change cannot be recovered safely.",
        ));
    }
    for (name, value) in rollback.files {
        write_private_json(&directory.join(name), &value)?;
    }
    fs::remove_file(&path).map_err(internal)?;
    sync_directory(directory)?;
    Ok(())
}

fn sync_directory(directory: &Path) -> ApiResult<()> {
    #[cfg(unix)]
    File::open(directory)
        .and_then(|dir| dir.sync_all())
        .map_err(internal)?;
    #[cfg(not(unix))]
    let _ = directory;
    Ok(())
}

fn rotate_files(directory: &Path, wallet_id: Uuid, current: &str, new: &str) -> ApiResult<()> {
    recover_pending(directory, wallet_id)?;
    let mut old_files = Vec::new();
    let mut new_files = Vec::<(String, serde_json::Value)>::new();
    for (name, purpose) in [
        (
            "secret.json",
            secure_store::SecureStorePurpose::WalletSecret,
        ),
        (
            "node-secret.json",
            secure_store::SecureStorePurpose::NodeAuth,
        ),
    ] {
        let path = directory.join(name);
        if name == "node-secret.json" && !path.try_exists().map_err(internal)? {
            continue;
        }
        let context = secure_store::SecureStoreContext::new(wallet_id, purpose);
        let material = secure_store::load(&path, current, context).map_err(secure_store_error)?;
        let old = serde_json::from_str(&read_private_text(&path)?).map_err(internal)?;
        let stage = directory.join(STAGE);
        let prepared: ApiResult<serde_json::Value> = (|| {
            secure_store::store(&stage, &material, new, context).map_err(secure_store_error)?;
            serde_json::from_str(&read_private_text(&stage)?).map_err(internal)
        })();
        let cleanup = fs::remove_file(&stage);
        let next = prepared?;
        cleanup.map_err(internal)?;
        old_files.push((name.to_owned(), old));
        new_files.push((name.to_owned(), next));
    }
    write_private_json(
        &directory.join(JOURNAL),
        &Rollback {
            wallet_id,
            files: old_files,
        },
    )?;
    let result = (|| {
        for (name, value) in new_files {
            write_private_json(&directory.join(name), &value)?;
        }
        fs::remove_file(directory.join(JOURNAL)).map_err(internal)?;
        sync_directory(directory)
    })();
    if result.is_err() {
        recover_pending(directory, wallet_id)?;
    }
    result
}

#[tauri::command]
pub async fn wallet_pin_change(
    app: AppHandle,
    current_pin: String,
    new_pin: String,
    expected_wallet_id: Uuid,
) -> ApiResult<()> {
    let current_pin = Zeroizing::new(current_pin);
    let new_pin = Zeroizing::new(new_pin);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        cancel_foreground_sync(&state)?;
        let _operation = operation_guard(&state)?;
        require_unlocked(&app, &state)?;
        let profile = selected_profile(&app)?;
        if profile.id != expected_wallet_id {
            return Err(api_error(
                "wallet_selection_changed",
                "The selected wallet changed. Open its PIN settings again.",
            ));
        }
        if profile.kind == WalletKind::SingleKey {
            return Err(api_error(
                "invalid_credential",
                "A software wallet passphrase cannot be changed.",
            ));
        }
        validate_credential(new_pin.as_str())?;
        if current_pin.as_str() == new_pin.as_str() {
            return Err(api_error(
                "invalid_credential",
                "Choose a different app PIN.",
            ));
        }
        check_auth_throttle(&app, &state)?;
        let verified = verify_selected_credential(&app, current_pin.as_str());
        record_auth_result(&app, &state, &verified)?;
        verified?;
        let directory = profile_directory(&app, profile.id)?;
        // Lock before persistence; a failure cannot retain a session authenticated by an old PIN.
        lock_wallet(&state, profile.id)?;
        state.proposals.lock().map_err(internal)?.clear();
        rotate_files(
            &directory,
            profile.id,
            current_pin.as_str(),
            new_pin.as_str(),
        )
    })
    .await
    .map_err(internal)?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (PathBuf, Uuid) {
        let root = std::env::temp_dir().join(format!("groot-pin-change-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let id = Uuid::new_v4();
        for (name, purpose) in [
            (
                "secret.json",
                secure_store::SecureStorePurpose::WalletSecret,
            ),
            (
                "node-secret.json",
                secure_store::SecureStorePurpose::NodeAuth,
            ),
        ] {
            secure_store::store(
                &root.join(name),
                name.as_bytes(),
                "old-pin",
                secure_store::SecureStoreContext::new(id, purpose),
            )
            .unwrap();
        }
        (root, id)
    }
    #[test]
    fn changes_both_protected_files_and_rejects_old_pin() {
        let (root, id) = fixture();
        rotate_files(&root, id, "old-pin", "new-pin").unwrap();
        for (name, purpose) in [
            (
                "secret.json",
                secure_store::SecureStorePurpose::WalletSecret,
            ),
            (
                "node-secret.json",
                secure_store::SecureStorePurpose::NodeAuth,
            ),
        ] {
            let context = secure_store::SecureStoreContext::new(id, purpose);
            assert_eq!(
                secure_store::load(&root.join(name), "new-pin", context)
                    .unwrap()
                    .as_slice(),
                name.as_bytes()
            );
            assert!(secure_store::load(&root.join(name), "old-pin", context).is_err());
        }
        assert!(!root.join(JOURNAL).exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn cookie_node_requires_only_wallet_verifier_rotation() {
        let (root, id) = fixture();
        fs::remove_file(root.join("node-secret.json")).unwrap();
        rotate_files(&root, id, "old-pin", "new-pin").unwrap();
        assert!(secure_store::load(
            &root.join("secret.json"),
            "new-pin",
            wallet_secret_context(id)
        )
        .is_ok());
        assert!(!root.join("node-secret.json").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn foreign_or_unsafe_rollback_is_rejected_before_mutation() {
        let (root, id) = fixture();
        let original = fs::read(root.join("secret.json")).unwrap();
        write_private_json(
            &root.join(JOURNAL),
            &Rollback {
                wallet_id: id,
                files: vec![("../secret.json".to_owned(), serde_json::Value::Null)],
            },
        )
        .unwrap();
        assert_eq!(
            recover_pending(&root, id).unwrap_err().code,
            "wallet_corrupt"
        );
        assert_eq!(original, fs::read(root.join("secret.json")).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn wrong_pin_leaves_both_files_unchanged() {
        let (root, id) = fixture();
        let before = fs::read(root.join("secret.json")).unwrap();
        assert!(rotate_files(&root, id, "wrong-pin", "new-pin").is_err());
        assert_eq!(before, fs::read(root.join("secret.json")).unwrap());
        assert!(!root.join(JOURNAL).exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn interrupted_two_file_update_rolls_back_before_authentication() {
        let (root, id) = fixture();
        let files = ["secret.json", "node-secret.json"]
            .into_iter()
            .map(|name| {
                (
                    name.to_owned(),
                    serde_json::from_slice(&fs::read(root.join(name)).unwrap()).unwrap(),
                )
            })
            .collect();
        write_private_json(
            &root.join(JOURNAL),
            &Rollback {
                wallet_id: id,
                files,
            },
        )
        .unwrap();
        secure_store::store(
            &root.join("node-secret.json"),
            b"replacement",
            "new-pin",
            secure_store::SecureStoreContext::new(id, secure_store::SecureStorePurpose::NodeAuth),
        )
        .unwrap();
        recover_pending(&root, id).unwrap();
        assert_eq!(
            secure_store::load(
                &root.join("node-secret.json"),
                "old-pin",
                secure_store::SecureStoreContext::new(
                    id,
                    secure_store::SecureStorePurpose::NodeAuth
                )
            )
            .unwrap()
            .as_slice(),
            b"node-secret.json"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
