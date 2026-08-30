fn main() {
    println!("cargo:rerun-if-env-changed=GROOT_BUILD_NETWORK");
    println!("cargo:rerun-if-env-changed=GROOT_BUILD_COMMIT");
    println!("cargo:rerun-if-env-changed=GROOT_BUNDLED_HWI_RESOURCE");
    println!("cargo:rerun-if-env-changed=GROOT_HWI_SHA256");
    println!("cargo:rerun-if-env-changed=GROOT_MACOS_SIGNING_TEAM_ID");
    watch_git_identity();
    println!(
        "cargo:rustc-check-cfg=cfg(groot_network, values(\"regtest\", \"signet\", \"testnet4\"))"
    );
    let network = std::env::var("GROOT_BUILD_NETWORK").unwrap_or_else(|_| "regtest".to_owned());
    match network.as_str() {
        "regtest" | "signet" | "testnet4" => {}
        _ => panic!(
            "GROOT_BUILD_NETWORK must be exactly regtest, signet, or testnet4; mainnet is not compiled into this release"
        ),
    }
    println!("cargo:rustc-cfg=groot_network=\"{network}\"");
    let commit = build_commit();
    println!("cargo:rustc-env=GROOT_BUILD_COMMIT={commit}");
    tauri_build::build()
}

fn git_output(arguments: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(arguments)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    (!value.is_empty()).then_some(value)
}

fn git_commit() -> Option<String> {
    git_output(&["rev-parse", "HEAD"])
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| is_commit(value))
}

fn build_commit() -> String {
    let repository_commit = git_commit();
    let release_build = std::env::var("PROFILE").as_deref() == Ok("release");
    let supplied_commit = match std::env::var("GROOT_BUILD_COMMIT") {
        Ok(value) => {
            let normalized = value.to_ascii_lowercase();
            if !is_commit(&normalized) {
                panic!("GROOT_BUILD_COMMIT must be exactly 40 hexadecimal characters");
            }
            Some(normalized)
        }
        Err(std::env::VarError::NotPresent) => None,
        Err(std::env::VarError::NotUnicode(_)) => {
            panic!("GROOT_BUILD_COMMIT must be valid Unicode hexadecimal text")
        }
    };
    if let (Some(supplied), Some(repository)) = (&supplied_commit, &repository_commit) {
        if supplied != repository {
            panic!(
                "GROOT_BUILD_COMMIT does not match the checked-out repository commit; refusing to embed stale release identity"
            );
        }
    }
    let working_tree_changes = repository_commit
        .as_ref()
        .and_then(|_| git_working_tree_changes());
    if release_build && working_tree_changes == Some(true) {
        panic!("A release build requires a clean source checkout");
    }
    let commit = supplied_commit.or(repository_commit).unwrap_or_else(|| {
        if release_build {
            panic!("A release build requires an exact repository commit identity");
        }
        "unknown".to_owned()
    });
    if !release_build && working_tree_changes == Some(true) {
        format!("{commit}-dirty")
    } else {
        commit
    }
}

fn git_working_tree_changes() -> Option<bool> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain", "--untracked-files=all"])
        .output()
        .ok()?;
    output.status.success().then_some(!output.stdout.is_empty())
}

fn watch_git_identity() {
    for name in ["HEAD", "packed-refs"] {
        if let Some(path) = git_output(&["rev-parse", "--git-path", name]) {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    if let Some(reference) = git_output(&["symbolic-ref", "-q", "HEAD"]) {
        if let Some(path) = git_output(&["rev-parse", "--git-path", &reference]) {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    watch_repository_sources();
}

fn watch_repository_sources() {
    let Some(root) = git_output(&["rev-parse", "--show-toplevel"]) else {
        return;
    };
    let output = std::process::Command::new("git")
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .output()
        .unwrap_or_else(|error| panic!("Could not enumerate tracked release sources: {error}"));
    if !output.status.success() {
        panic!("Could not enumerate tracked release sources");
    }
    let mut directories = std::collections::BTreeSet::from([
        "src".to_owned(),
        "static".to_owned(),
        "src-tauri/src".to_owned(),
        "src-tauri/capabilities".to_owned(),
    ]);
    for encoded in output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
    {
        let relative = std::str::from_utf8(encoded)
            .unwrap_or_else(|_| panic!("Tracked release source paths must be valid UTF-8"));
        if relative.contains('\n') || relative.contains('\r') {
            panic!("Tracked release source paths must not contain line breaks");
        }
        println!("cargo:rerun-if-changed={root}/{relative}");
        let mut parent = std::path::Path::new(relative).parent();
        while let Some(directory) = parent {
            let encoded = directory.to_string_lossy();
            if encoded.is_empty() {
                break;
            }
            directories.insert(encoded.into_owned());
            parent = directory.parent();
        }
    }
    for relative in directories {
        println!("cargo:rerun-if-changed={root}/{relative}");
    }
}

fn is_commit(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
