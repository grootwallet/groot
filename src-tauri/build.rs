fn main() {
    println!("cargo:rerun-if-env-changed=GROOT_BUILD_NETWORK");
    println!("cargo:rerun-if-env-changed=GROOT_BUILD_COMMIT");
    println!("cargo:rerun-if-env-changed=GROOT_BUNDLED_HWI_RESOURCE");
    println!("cargo:rerun-if-env-changed=GROOT_HWI_SHA256");
    println!("cargo:rerun-if-env-changed=GROOT_MACOS_SIGNING_TEAM_ID");
    if let Some(head_path) = git_path("HEAD") {
        println!("cargo:rerun-if-changed={head_path}");
    }
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

    let build_commit = std::env::var("GROOT_BUILD_COMMIT")
        .ok()
        .filter(|value| is_short_commit(value))
        .or_else(git_commit)
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=GROOT_BUILD_COMMIT={build_commit}");

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        println!("cargo:rerun-if-changed=src/native_backup/ios.mm");
        cc::Build::new()
            .cpp(true)
            .file("src/native_backup/ios.mm")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("groot_ios_native_backup");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=UIKit");
    }

    tauri_build::build()
}

fn git_commit() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--short=8", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let commit = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    is_short_commit(&commit).then_some(commit)
}

fn git_path(name: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--git-path", name])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    (!path.is_empty()).then_some(path)
}

fn is_short_commit(value: &str) -> bool {
    (7..=12).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
