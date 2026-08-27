fn main() {
    println!("cargo:rerun-if-env-changed=GROOT_BUILD_NETWORK");
    println!("cargo:rerun-if-env-changed=GROOT_BUNDLED_HWI_RESOURCE");
    println!("cargo:rerun-if-env-changed=GROOT_HWI_SHA256");
    println!("cargo:rerun-if-env-changed=GROOT_MACOS_SIGNING_TEAM_ID");
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
