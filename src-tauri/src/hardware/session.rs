//! ADR 0101: one fresh full identity and one action on one isolated client.
use super::*;
#[cfg(target_os = "macos")]
use bdk_wallet::bitcoin::bip32::{Fingerprint, Xpub};
#[cfg(any(target_os = "macos", test))]
use serde::Deserialize;
use serde::Serialize;
#[cfg(target_os = "macos")]
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

impl HwiCli {
    pub(crate) fn supports_operation_session(&self, device_type: &str) -> bool {
        #[cfg(target_os = "macos")]
        {
            option_env!("GROOT_HWI_SESSION_PROTOCOL") == Some("1")
                && self.chain == HwiChain::Testnet4
                && matches!(device_type, "coldcard" | "ledger" | "bitbox02")
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
            if !matches!(account_path, "m/48'/1'/0'/2'" | "m/84'/1'/0'")
                || expected.is_empty()
                || expected.len() > 16
            {
                return Err(HardwareError::InvalidArgument);
            }
            for item in expected {
                if Fingerprint::from_str(&item.fingerprint).is_err()
                    || item.fingerprint != item.fingerprint.to_ascii_lowercase()
                    || Xpub::from_str(&item.xpub).map_or(true, |key| {
                        key.network != bdk_wallet::bitcoin::NetworkKind::Test
                    })
                {
                    return Err(HardwareError::InvalidArgument);
                }
            }
            let _original = trusted_executable(&self.program, &self.source)?;
            let arguments =
                ["--chain", "testnet4", "--device-type", device_type].map(str::to_owned);
            let root = runtime::for_operation(&self.source, &arguments)?
                .ok_or(HardwareError::Unavailable)?;
            let helper = root.join("groot-hwi-session");
            if !helper.is_file() {
                return Err(HardwareError::Unavailable);
            }
            let mut input = Zeroizing::new(
                serde_json::to_vec(&Request {
                    version: 1,
                    chain: "testnet4",
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
    fn expected() -> HwiSessionExpected {
        HwiSessionExpected {
            fingerprint: "12345678".to_owned(),
            xpub: "public-account".to_owned(),
            allow_action: true,
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
            for family in ["coldcard", "ledger", "bitbox02"] {
                let operation = hwi.begin_interactive_operation().unwrap();
                let started = Instant::now();
                trusted_executable(&hwi.program, &hwi.source).unwrap();
                let arguments = ["--chain", "testnet4", "--device-type", family].map(str::to_owned);
                let root = runtime::for_operation(&hwi.source, &arguments)
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
        assert_eq!(
            serde_json::to_string(&HwiSessionAction::Probe).unwrap(),
            "\"probe\""
        );
    }
}
