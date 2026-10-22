//! ADRs 0101/0102/0103: one fresh full identity and one action on one isolated client.
use super::*;
#[cfg(any(target_os = "macos", test))]
use bdk_wallet::bitcoin::{
    bip32::{Fingerprint, Xpub},
    NetworkKind,
};
#[cfg(any(target_os = "macos", test))]
use serde::Deserialize;
use serde::Serialize;
#[cfg(any(target_os = "macos", test))]
use std::str::FromStr;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HwiSessionExpected {
    pub fingerprint: String,
    pub xpub: String,
    pub allow_action: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HwiSessionAction {
    Identity,
    Display,
    Sign,
    #[cfg(test)]
    Probe,
}

pub(crate) struct HwiSessionInput<'a> {
    pub device_type: &'a str,
    pub device_path: &'a str,
    pub account_path: &'a str,
    pub expected: &'a [HwiSessionExpected],
    pub action: HwiSessionAction,
    pub value: Option<&'a str>,
}

#[cfg(target_os = "macos")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Request<'a> {
    version: u8,
    chain: &'static str,
    device_type: &'a str,
    device_path: &'a str,
    account_path: &'a str,
    expected: &'a [HwiSessionExpected],
    action: HwiSessionAction,
    value: Option<&'a str>,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    fingerprint: String,
    xpub: String,
    result: serde_json::Value,
}

#[cfg(any(target_os = "macos", test))]
fn validated_response(
    bytes: &[u8],
    expected: &[HwiSessionExpected],
) -> Result<(String, Vec<u8>), HardwareError> {
    let parsed: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| HardwareError::Io)?;
    if parsed.get("error").and_then(serde_json::Value::as_str) == Some("wrong_network") {
        return Err(HardwareError::WrongNetwork);
    }
    if parsed.get("error").is_some() {
        return Err(HardwareError::CommandFailed(
            parsed.get("code").and_then(serde_json::Value::as_i64),
        ));
    }
    let response: Response = serde_json::from_value(parsed).map_err(|_| HardwareError::Io)?;
    if expected
        .iter()
        .filter(|item| item.fingerprint == response.fingerprint && item.xpub == response.xpub)
        .count()
        != 1
    {
        return Err(HardwareError::CommandFailed(Some(-100)));
    }
    Ok((
        response.fingerprint,
        serde_json::to_vec(&response.result).map_err(|_| HardwareError::Io)?,
    ))
}

// Mainnet validation is prepared for review. The native session selector below
// continues to admit Testnet4 only, so this scope is not active in an RC yet.
#[cfg(any(target_os = "macos", test))]
fn session_scope(
    chain: HwiChain,
) -> Option<(&'static str, &'static str, &'static str, NetworkKind)> {
    match chain {
        HwiChain::Testnet4 => Some((
            "testnet4",
            "m/48'/1'/0'/2'",
            "m/84'/1'/0'",
            NetworkKind::Test,
        )),
        HwiChain::Main => Some(("main", "m/48'/0'/0'/2'", "m/84'/0'/0'", NetworkKind::Main)),
        _ => None,
    }
}

#[cfg(any(target_os = "macos", test))]
fn valid_session_account(
    chain: HwiChain,
    account_path: &str,
    expected: &[HwiSessionExpected],
) -> bool {
    let Some((_, multisig_path, singlesig_path, network)) = session_scope(chain) else {
        return false;
    };
    (account_path == multisig_path || account_path == singlesig_path)
        && !expected.is_empty()
        && expected.len() <= 16
        && expected.iter().all(|item| {
            Fingerprint::from_str(&item.fingerprint).is_ok()
                && item.fingerprint == item.fingerprint.to_ascii_lowercase()
                && Xpub::from_str(&item.xpub).is_ok_and(|key| key.network == network)
        })
}

impl HwiCli {
    pub(crate) fn supports_operation_session(&self, device_type: &str) -> bool {
        #[cfg(target_os = "macos")]
        {
            option_env!("GROOT_HWI_SESSION_PROTOCOL") == Some("1")
                && (self.chain == HwiChain::Testnet4
                    || (MAINNET_FAST_ENABLED && self.chain == HwiChain::Main))
                && matches!(
                    device_type,
                    "coldcard" | "ledger" | "bitbox02" | "trezor" | "jade"
                )
                && matches!(self.source, HwiSource::Bundled { .. })
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = device_type;
            false
        }
    }

    pub(crate) fn session_action_in_operation(
        &self,
        operation: &HardwareOperation,
        input: HwiSessionInput<'_>,
    ) -> Result<Option<(String, Vec<u8>)>, HardwareError> {
        let HwiSessionInput {
            device_type,
            device_path,
            account_path,
            expected,
            action,
            value,
        } = input;
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (
                operation,
                device_type,
                device_path,
                account_path,
                expected,
                action,
                value,
            );
            Ok(None)
        }
        #[cfg(target_os = "macos")]
        {
            if !self.supports_operation_session(device_type) {
                return Ok(None);
            }
            operation.remaining()?;
            validate_selected_device_path(device_path)?;
            if !valid_session_account(self.chain, account_path, expected) {
                return Err(HardwareError::InvalidArgument);
            }
            let (chain, _, _, _) = session_scope(self.chain).ok_or(HardwareError::WrongNetwork)?;
            let _original = trusted_executable(&self.program, &self.source)?;
            let arguments = ["--chain", chain, "--device-type", device_type].map(str::to_owned);
            let root = runtime::for_operation(&self.source, &arguments, self.chain)?
                .ok_or(HardwareError::Unavailable)?;
            let helper = root.join("groot-hwi-session");
            if !helper.is_file() {
                return Err(HardwareError::Unavailable);
            }
            let mut input = Zeroizing::new(
                serde_json::to_vec(&Request {
                    version: 1,
                    chain,
                    device_type,
                    device_path,
                    account_path,
                    expected,
                    action,
                    value,
                })
                .map_err(|_| HardwareError::InvalidArgument)?,
            );
            input.push(b'\n');
            if input.len() > MAX_STDIN_BYTES + 8192 {
                return Err(HardwareError::InvalidArgument);
            }
            let mut command = Command::new(helper);
            command.args(HWI_FIXED_ARGV).env_clear();
            if let Some(home) = &self.home {
                command.env("HOME", trusted_home(home)?);
            }
            let bytes = run_verified_process(command, &input, operation)?;
            validated_response(&bytes, expected).map(Some)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const MAIN_XPUB: &str = "xpub6FA5rfxJc94K1kNtxRby1hoHwi7YDyTWwx1KUR3FwskaF6HzCbZMz3zQwGnCqdiFeMTPV3YneTGS2YQPiuNYsSvtggWWMQpEJD4jXU7ZzEh";
    fn expected() -> HwiSessionExpected {
        HwiSessionExpected {
            fingerprint: "12345678".to_owned(),
            xpub: "public-account".to_owned(),
            allow_action: true,
        }
    }
    #[test]
    fn session_account_scope_rejects_cross_network_paths_and_keys() {
        let mut main = expected();
        main.xpub = MAIN_XPUB.to_owned();
        let mut test = main.clone();
        let mut test_key = Xpub::from_str(MAIN_XPUB).unwrap();
        test_key.network = NetworkKind::Test;
        test.xpub = test_key.to_string();
        assert!(valid_session_account(
            HwiChain::Main,
            "m/48'/0'/0'/2'",
            std::slice::from_ref(&main)
        ));
        assert!(valid_session_account(
            HwiChain::Main,
            "m/84'/0'/0'",
            std::slice::from_ref(&main)
        ));
        assert!(valid_session_account(
            HwiChain::Testnet4,
            "m/48'/1'/0'/2'",
            std::slice::from_ref(&test)
        ));
        assert!(valid_session_account(
            HwiChain::Testnet4,
            "m/84'/1'/0'",
            std::slice::from_ref(&test)
        ));
        assert!(!valid_session_account(
            HwiChain::Main,
            "m/48'/1'/0'/2'",
            std::slice::from_ref(&main)
        ));
        assert!(!valid_session_account(
            HwiChain::Main,
            "m/84'/0'/0'",
            std::slice::from_ref(&test)
        ));
        assert!(!valid_session_account(
            HwiChain::Testnet4,
            "m/48'/1'/0'/2'",
            std::slice::from_ref(&main)
        ));
        assert!(!valid_session_account(
            HwiChain::Test,
            "m/84'/1'/0'",
            std::slice::from_ref(&test)
        ));
        assert!(!valid_session_account(HwiChain::Main, "m/84'/0'/0'", &[]));
    }
    #[test]
    fn prepared_mainnet_scope_does_not_enable_the_operation_session() {
        let hwi = HwiCli {
            program: PathBuf::from("/unused/hwi"),
            chain: HwiChain::Main,
            home: None,
            source: HwiSource::Bundled {
                bundle_root: PathBuf::from("/unused/Groot.app"),
            },
        };
        for family in ["coldcard", "ledger", "bitbox02", "trezor", "jade"] {
            assert!(!hwi.supports_operation_session(family));
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "explicit packaged startup measurement; probe never calls get_client"]
    fn packaged_session_startup_probe() {
        assert_eq!(option_env!("GROOT_HWI_SESSION_PROTOCOL"), Some("1"));
        let app = PathBuf::from(std::env::var("GROOT_TEST_HWI_APP").unwrap());
        let output = PathBuf::from(std::env::var("GROOT_TEST_HWI_TIMINGS").unwrap());
        let hwi = HwiCli::for_bundled_resource(
            HwiChain::Testnet4,
            &app.join("Contents/Resources"),
            "hwi",
        )
        .unwrap();
        let mut timings = Vec::new();
        for _ in 0..20 {
            for family in ["coldcard", "ledger", "bitbox02", "trezor", "jade"] {
                let operation = hwi.begin_interactive_operation().unwrap();
                let started = Instant::now();
                trusted_executable(&hwi.program, &hwi.source).unwrap();
                let arguments = ["--chain", "testnet4", "--device-type", family].map(str::to_owned);
                let root = runtime::for_operation(&hwi.source, &arguments, hwi.chain)
                    .unwrap()
                    .unwrap();
                let input = serde_json::to_vec(&Request {
                    version: 1,
                    chain: "testnet4",
                    device_type: family,
                    device_path: "device-free-probe",
                    account_path: "m/48'/1'/0'/2'",
                    expected: &[],
                    action: HwiSessionAction::Probe,
                    value: None,
                })
                .unwrap();
                let mut input = input;
                input.push(b'\n');
                let mut command = Command::new(root.join("groot-hwi-session"));
                command.args(HWI_FIXED_ARGV).env_clear();
                let result = run_verified_process(command, &input, &operation).unwrap();
                let parsed: serde_json::Value = serde_json::from_slice(&result).unwrap();
                assert_eq!(parsed["probe"], "groot-hwi-session-v1");
                timings.push(serde_json::json!({"family":family,"ms":started.elapsed().as_secs_f64()*1000.0}));
            }
        }
        std::fs::write(output, serde_json::to_vec_pretty(&serde_json::json!({"source":env!("GROOT_BUILD_COMMIT"),"scope":"all Rust app, helper digest and runtime checks plus device-free worker import; never opens USB","samples":timings})).unwrap()).unwrap();
    }
    #[test]
    fn response_requires_one_full_identity_and_rejects_substitution() {
        let bytes = br#"{"fingerprint":"12345678","xpub":"public-account","result":{"address":"test-address"}}"#;
        let identity = expected();
        assert!(validated_response(bytes, std::slice::from_ref(&identity)).is_ok());
        assert!(validated_response(bytes, &[]).is_err());
        assert!(validated_response(bytes, &[identity.clone(), identity.clone()]).is_err());
        let mut changed = identity.clone();
        changed.xpub = "other-account".to_owned();
        assert!(validated_response(bytes, &[changed]).is_err());
        let mut changed = identity;
        changed.fingerprint = "87654321".to_owned();
        assert!(validated_response(bytes, &[changed]).is_err());
        assert!(validated_response(
            br#"{"fingerprint":"12345678","xpub":"public-account","result":null,"extra":true}"#,
            &[expected()]
        )
        .is_err());
        assert!(validated_response(b"invalid", &[expected()]).is_err());
    }
    #[test]
    fn identity_denial_and_rejection_remain_errors() {
        assert!(matches!(
            validated_response(
                br#"{"error":"identity_mismatch","code":-100}"#,
                &[expected()]
            ),
            Err(HardwareError::CommandFailed(Some(-100)))
        ));
        assert!(matches!(
            validated_response(br#"{"error":"session_failed","code":-14}"#, &[expected()]),
            Err(HardwareError::CommandFailed(Some(-14)))
        ));
        assert!(matches!(
            validated_response(br#"{"error":"wrong_network","code":-3}"#, &[expected()]),
            Err(HardwareError::WrongNetwork)
        ));
        assert_eq!(
            serde_json::to_string(&HwiSessionAction::Probe).unwrap(),
            "\"probe\""
        );
    }
}
