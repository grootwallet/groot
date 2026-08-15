use bdk_wallet::bitcoin::{
    hashes::{sha256, Hash as _, HashEngine as _},
    Network,
};
use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const MAX_ARGUMENT_BYTES: usize = 384 * 1024;
const MAX_SECRET_INPUT_BYTES: usize = 128;
const MAX_PIN_POSITIONS: usize = 50;
const MAX_OUTPUT_BYTES: u64 = 384 * 1024;
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(90);
const USER_REVIEW_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const HWI_DIGEST_HEX_BYTES: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HardwareError {
    InvalidArgument,
    Unavailable,
    TimedOut,
    OutputTooLarge,
    CommandFailed(Option<i64>),
    Io,
}

impl HardwareError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidArgument => "invalid_hardware_request",
            Self::Unavailable => "hardware_unavailable",
            Self::TimedOut => "hardware_timeout",
            Self::OutputTooLarge => "hardware_response_too_large",
            Self::CommandFailed(_) => "hardware_command_failed",
            Self::Io => "hardware_io_error",
        }
    }
}

fn validate_arguments(arguments: &[String]) -> Result<(), HardwareError> {
    let total = arguments.iter().try_fold(0usize, |total, argument| {
        if argument.is_empty()
            || argument.contains('\0')
            || argument.chars().any(|character| character.is_control())
        {
            return Err(HardwareError::InvalidArgument);
        }
        total
            .checked_add(argument.len())
            .ok_or(HardwareError::InvalidArgument)
    })?;
    if total > MAX_ARGUMENT_BYTES {
        return Err(HardwareError::InvalidArgument);
    }
    Ok(())
}

fn read_bounded<R: Read>(reader: R) -> Result<Vec<u8>, HardwareError> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_OUTPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| HardwareError::Io)?;
    if bytes.len() as u64 > MAX_OUTPUT_BYTES {
        return Err(HardwareError::OutputTooLarge);
    }
    Ok(bytes)
}

fn hwi_error_code(stdout: &[u8]) -> Option<i64> {
    serde_json::from_slice::<serde_json::Value>(stdout)
        .ok()?
        .get("code")?
        .as_i64()
}

fn pin_command_input(pin_positions: &[u8]) -> Result<Vec<u8>, HardwareError> {
    if pin_positions.is_empty()
        || pin_positions.len() > MAX_PIN_POSITIONS
        || !pin_positions
            .iter()
            .all(|position| matches!(position, b'1'..=b'9'))
    {
        return Err(HardwareError::InvalidArgument);
    }
    let mut input = Vec::with_capacity(pin_positions.len() + 10);
    input.extend_from_slice(b"sendpin ");
    input.extend_from_slice(pin_positions);
    input.extend_from_slice(b"\n\n");
    Ok(input)
}

pub trait HardwareTransport: Send + Sync {
    fn enumerate(&self) -> Result<Vec<u8>, HardwareError>;
    fn account_keypool(
        &self,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError>;
    fn sign_psbt(
        &self,
        device_type: &str,
        device_path: &str,
        psbt: &str,
    ) -> Result<Vec<u8>, HardwareError>;
    fn display_descriptor_address(
        &self,
        device_type: &str,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError>;
    fn prompt_pin(&self, device_type: &str, device_path: &str) -> Result<Vec<u8>, HardwareError>;
    fn send_pin(
        &self,
        device_type: &str,
        device_path: &str,
        pin_positions: &[u8],
    ) -> Result<Vec<u8>, HardwareError>;
}

#[derive(Debug, Clone)]
pub struct HwiCli {
    program: PathBuf,
    chain: HwiChain,
    home: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HwiChain {
    Main,
    Test,
    Regtest,
    Signet,
}

impl HwiChain {
    pub(crate) const fn for_network(network: Network) -> Self {
        match network {
            Network::Bitcoin => Self::Main,
            Network::Testnet | Network::Testnet4 => Self::Test,
            Network::Signet => Self::Signet,
            Network::Regtest => Self::Regtest,
        }
    }

    pub(crate) const fn as_hwi_argument(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Test => "test",
            Self::Regtest => "regtest",
            Self::Signet => "signet",
        }
    }
}

impl Default for HwiCli {
    fn default() -> Self {
        Self::for_chain(HwiChain::Test)
    }
}

impl HwiCli {
    pub fn for_chain(chain: HwiChain) -> Self {
        Self {
            program: trusted_hwi_path(),
            chain,
            home: None,
        }
    }

    pub fn with_home(mut self, home: PathBuf) -> Result<Self, HardwareError> {
        self.home = Some(trusted_home(&home)?);
        Ok(self)
    }

    fn device_command(
        &self,
        device_type: &str,
        device_path: &str,
        command: &str,
        value: &str,
    ) -> Vec<String> {
        vec![
            "--chain".into(),
            self.chain.as_hwi_argument().into(),
            "--device-type".into(),
            device_type.into(),
            "--device-path".into(),
            device_path.into(),
            command.into(),
            value.into(),
        ]
    }

    fn device_command_without_value(
        &self,
        device_type: &str,
        device_path: &str,
        command: &str,
    ) -> Vec<String> {
        vec![
            "--chain".into(),
            self.chain.as_hwi_argument().into(),
            "--device-type".into(),
            device_type.into(),
            "--device-path".into(),
            device_path.into(),
            command.into(),
        ]
    }
}

impl HardwareTransport for HwiCli {
    fn enumerate(&self) -> Result<Vec<u8>, HardwareError> {
        run_program(
            &self.program,
            &[
                "--chain".into(),
                self.chain.as_hwi_argument().into(),
                "enumerate".into(),
            ],
            USER_REVIEW_TIMEOUT,
            self.home.as_deref(),
        )
    }

    fn account_keypool(
        &self,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let keypool_path = format!("{derivation_path}/0/*");
        run_program(
            &self.program,
            &[
                "--chain".into(),
                self.chain.as_hwi_argument().into(),
                "--device-type".into(),
                device_type.into(),
                "--device-path".into(),
                device_path.into(),
                "getkeypool".into(),
                "--path".into(),
                keypool_path,
                "0".into(),
                "1".into(),
            ],
            DEFAULT_TIMEOUT,
            self.home.as_deref(),
        )
    }

    fn sign_psbt(
        &self,
        device_type: &str,
        device_path: &str,
        psbt: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        run_program(
            &self.program,
            &self.device_command(device_type, device_path, "signtx", psbt),
            USER_REVIEW_TIMEOUT,
            self.home.as_deref(),
        )
    }

    fn display_descriptor_address(
        &self,
        device_type: &str,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let mut arguments =
            self.device_command(device_type, device_path, "displayaddress", "--desc");
        arguments.push(descriptor.into());
        run_program(
            &self.program,
            &arguments,
            USER_REVIEW_TIMEOUT,
            self.home.as_deref(),
        )
    }

    fn prompt_pin(&self, device_type: &str, device_path: &str) -> Result<Vec<u8>, HardwareError> {
        run_program(
            &self.program,
            &self.device_command_without_value(device_type, device_path, "promptpin"),
            DEFAULT_TIMEOUT,
            self.home.as_deref(),
        )
    }

    fn send_pin(
        &self,
        device_type: &str,
        device_path: &str,
        pin_positions: &[u8],
    ) -> Result<Vec<u8>, HardwareError> {
        let arguments = self.device_command_without_value(device_type, device_path, "--stdin");
        let mut input = pin_command_input(pin_positions)?;
        let result = run_program_with_input(
            &self.program,
            &arguments,
            DEFAULT_TIMEOUT,
            self.home.as_deref(),
            Some(&input),
        );
        input.fill(0);
        result
    }
}

fn trusted_hwi_path() -> PathBuf {
    if let Some(configured) = option_env!("GROOT_HWI_PATH") {
        return PathBuf::from(configured);
    }
    #[cfg(target_os = "macos")]
    return first_existing_absolute(&["/opt/homebrew/bin/hwi", "/usr/local/bin/hwi"]);
    #[cfg(target_os = "linux")]
    return first_existing_absolute(&["/usr/bin/hwi", "/usr/local/bin/hwi"]);
    #[cfg(target_os = "windows")]
    return PathBuf::from(r"C:\Program Files\Groot\hwi.exe");
    #[allow(unreachable_code)]
    PathBuf::from("/unsupported-platform/hwi")
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn first_existing_absolute(candidates: &[&str]) -> PathBuf {
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| PathBuf::from(candidates[0]))
}

fn run_program(
    program: &Path,
    arguments: &[String],
    timeout: Duration,
    home: Option<&Path>,
) -> Result<Vec<u8>, HardwareError> {
    run_program_with_input(program, arguments, timeout, home, None)
}

fn run_program_with_input(
    program: &Path,
    arguments: &[String],
    timeout: Duration,
    home: Option<&Path>,
    input: Option<&[u8]>,
) -> Result<Vec<u8>, HardwareError> {
    if !program.is_absolute() {
        return Err(HardwareError::Unavailable);
    }
    let program = trusted_executable(program)?;
    validate_arguments(arguments)?;
    if input.is_some_and(|bytes| bytes.is_empty() || bytes.len() > MAX_SECRET_INPUT_BYTES) {
        return Err(HardwareError::InvalidArgument);
    }
    let mut command = Command::new(program);
    command.args(arguments).env_clear();
    if let Some(home) = home {
        command.env("HOME", trusted_home(home)?);
    }
    let mut child = command
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| HardwareError::Unavailable)?;
    let stdout = child.stdout.take().ok_or(HardwareError::Io)?;
    let stderr = child.stderr.take().ok_or(HardwareError::Io)?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    if let Some(input) = input {
        let mut secret = input.to_vec();
        let write_result = child
            .stdin
            .take()
            .ok_or(HardwareError::Io)
            .and_then(|mut stdin| stdin.write_all(&secret).map_err(|_| HardwareError::Io));
        secret.fill(0);
        if let Err(error) = write_result {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(error);
        }
    }
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| HardwareError::Io)? {
            break status;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(HardwareError::TimedOut);
        }
        thread::sleep(Duration::from_millis(20));
    };
    let stdout = stdout_reader.join().map_err(|_| HardwareError::Io)??;
    let stderr = stderr_reader.join().map_err(|_| HardwareError::Io)??;
    if !status.success() {
        // HWI stderr can contain device paths and transaction details. It is deliberately
        // discarded here; callers expose a stable error without leaking it to the webview.
        drop(stderr);
        return Err(HardwareError::CommandFailed(hwi_error_code(&stdout)));
    }
    Ok(stdout)
}

fn trusted_home(home: &Path) -> Result<PathBuf, HardwareError> {
    let canonical = home
        .canonicalize()
        .map_err(|_| HardwareError::Unavailable)?;
    if !canonical.is_absolute() || !canonical.is_dir() {
        return Err(HardwareError::Unavailable);
    }
    Ok(canonical)
}

fn trusted_executable(program: &Path) -> Result<PathBuf, HardwareError> {
    let canonical = program
        .canonicalize()
        .map_err(|_| HardwareError::Unavailable)?;
    let metadata = canonical
        .metadata()
        .map_err(|_| HardwareError::Unavailable)?;
    if !metadata.is_file() {
        return Err(HardwareError::Unavailable);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o022 != 0 {
            return Err(HardwareError::Unavailable);
        }
    }
    if release_hwi_verification_required(crate::build_network::NETWORK) {
        verify_release_hwi(&canonical, &metadata)?;
    }
    Ok(canonical)
}

const fn release_hwi_verification_required(network: Network) -> bool {
    !matches!(network, Network::Regtest)
}

fn configured_hwi_digest() -> Result<[u8; 32], HardwareError> {
    let encoded = option_env!("GROOT_HWI_SHA256").ok_or(HardwareError::Unavailable)?;
    if encoded.len() != HWI_DIGEST_HEX_BYTES {
        return Err(HardwareError::Unavailable);
    }
    let mut digest = [0_u8; 32];
    for (index, pair) in encoded.as_bytes().chunks_exact(2).enumerate() {
        let high = hex_nibble(pair[0]).ok_or(HardwareError::Unavailable)?;
        let low = hex_nibble(pair[1]).ok_or(HardwareError::Unavailable)?;
        digest[index] = (high << 4) | low;
    }
    Ok(digest)
}

const fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn executable_digest(path: &Path) -> Result<[u8; 32], HardwareError> {
    let mut file = File::open(path).map_err(|_| HardwareError::Unavailable)?;
    let mut engine = sha256::Hash::engine();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| HardwareError::Unavailable)?;
        if read == 0 {
            break;
        }
        engine.input(&buffer[..read]);
    }
    Ok(sha256::Hash::from_engine(engine).to_byte_array())
}

fn verify_executable_digest(path: &Path, expected: [u8; 32]) -> Result<(), HardwareError> {
    if executable_digest(path)? == expected {
        Ok(())
    } else {
        Err(HardwareError::Unavailable)
    }
}

#[cfg(unix)]
fn verify_release_hwi(canonical: &Path, metadata: &std::fs::Metadata) -> Result<(), HardwareError> {
    use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

    // A pinned digest authenticates the artifact. Root-owned, non-writable
    // ancestors make the pathname stable between this check and exec for the
    // same-user attacker in Groot's desktop threat model.
    if metadata.uid() != 0 || metadata.permissions().mode() & 0o022 != 0 {
        return Err(HardwareError::Unavailable);
    }
    let mut ancestor = canonical.parent();
    while let Some(path) = ancestor {
        let metadata = path.metadata().map_err(|_| HardwareError::Unavailable)?;
        if !metadata.is_dir() || metadata.uid() != 0 || metadata.permissions().mode() & 0o022 != 0 {
            return Err(HardwareError::Unavailable);
        }
        ancestor = path.parent();
    }
    verify_executable_digest(canonical, configured_hwi_digest()?)
}

#[cfg(windows)]
fn verify_release_hwi(_: &Path, _: &std::fs::Metadata) -> Result<(), HardwareError> {
    // Windows production builds stay fail-closed until Authenticode identity
    // validation is implemented and certified for the packaged HWI artifact.
    Err(HardwareError::Unavailable)
}

#[cfg(not(any(unix, windows)))]
fn verify_release_hwi(_: &Path, _: &std::fs::Metadata) -> Result<(), HardwareError> {
    Err(HardwareError::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_control_and_oversized_arguments() {
        assert_eq!(
            validate_arguments(&[String::new()]),
            Err(HardwareError::InvalidArgument)
        );
        assert_eq!(
            validate_arguments(&["enumerate\nnext".to_owned()]),
            Err(HardwareError::InvalidArgument)
        );
        assert_eq!(
            validate_arguments(&["x".repeat(MAX_ARGUMENT_BYTES + 1)]),
            Err(HardwareError::InvalidArgument)
        );
    }

    #[test]
    fn release_hwi_digest_parser_is_exact_and_case_insensitive() {
        assert_eq!(hex_nibble(b'0'), Some(0));
        assert_eq!(hex_nibble(b'a'), Some(10));
        assert_eq!(hex_nibble(b'F'), Some(15));
        assert_eq!(hex_nibble(b'g'), None);
        assert_eq!(hex_nibble(b'/'), None);
        assert!(!release_hwi_verification_required(Network::Regtest));
        assert!(release_hwi_verification_required(Network::Signet));
        assert!(release_hwi_verification_required(Network::Testnet4));
        assert!(release_hwi_verification_required(Network::Bitcoin));
    }

    #[test]
    fn executable_digest_rejects_substituted_bytes() {
        let path = std::env::temp_dir().join(format!("groot-hwi-digest-{}", std::process::id()));
        std::fs::write(&path, b"reviewed hwi artifact").unwrap();
        let reviewed = executable_digest(&path).unwrap();
        assert_eq!(verify_executable_digest(&path, reviewed), Ok(()));
        std::fs::write(&path, b"substituted hwi artifact").unwrap();
        assert_eq!(
            verify_executable_digest(&path, reviewed),
            Err(HardwareError::Unavailable)
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_relative_executable_paths_without_searching_path() {
        assert_eq!(
            run_program(
                Path::new("hwi"),
                &["enumerate".into()],
                Duration::ZERO,
                None,
            ),
            Err(HardwareError::Unavailable)
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_group_or_world_writable_executables() {
        use std::os::unix::fs::PermissionsExt;

        let path = std::env::temp_dir().join(format!("groot-hwi-{}", std::process::id()));
        std::fs::write(&path, b"#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o777)).unwrap();
        assert_eq!(
            run_program(&path, &["enumerate".into()], Duration::from_secs(1), None,),
            Err(HardwareError::Unavailable)
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn preserves_argument_boundaries_without_shell_interpolation() {
        let output = run_program(
            Path::new("/bin/echo"),
            &["$(touch /tmp/groot-must-not-exist)".to_owned()],
            Duration::from_secs(1),
            None,
        )
        .expect("echo");
        assert_eq!(
            String::from_utf8(output).expect("utf8"),
            "$(touch /tmp/groot-must-not-exist)\n"
        );
        assert!(!std::path::Path::new("/tmp/groot-must-not-exist").exists());
    }

    #[test]
    fn reports_failure_timeout_and_missing_executable_without_output_leaks() {
        assert_eq!(
            run_program(
                Path::new("/usr/bin/false"),
                &["test".to_owned()],
                Duration::from_secs(1),
                None,
            ),
            Err(HardwareError::CommandFailed(None))
        );
        assert_eq!(
            run_program(
                Path::new("/bin/sleep"),
                &["1".to_owned()],
                Duration::from_millis(10),
                None,
            ),
            Err(HardwareError::TimedOut)
        );
        assert_eq!(
            run_program(
                Path::new("/definitely/not/an/executable"),
                &["test".to_owned()],
                Duration::from_secs(1),
                None,
            ),
            Err(HardwareError::Unavailable)
        );
    }

    #[test]
    fn bounds_stdout_and_stderr() {
        let oversized = "x".repeat(MAX_OUTPUT_BYTES as usize + 1);
        assert_eq!(
            read_bounded(oversized.as_bytes()),
            Err(HardwareError::OutputTooLarge)
        );
    }

    #[test]
    fn every_error_has_a_stable_code() {
        let errors = [
            (HardwareError::InvalidArgument, "invalid_hardware_request"),
            (HardwareError::Unavailable, "hardware_unavailable"),
            (HardwareError::TimedOut, "hardware_timeout"),
            (HardwareError::OutputTooLarge, "hardware_response_too_large"),
            (
                HardwareError::CommandFailed(Some(-12)),
                "hardware_command_failed",
            ),
            (HardwareError::Io, "hardware_io_error"),
        ];
        for (error, code) in errors {
            assert_eq!(error.code(), code);
        }
    }

    #[test]
    fn retains_only_the_typed_hwi_code_from_failed_output() {
        assert_eq!(
            hwi_error_code(br#"{"error":"private device detail","code":-12}"#),
            Some(-12)
        );
        assert_eq!(hwi_error_code(b"not json"), None);
        assert_eq!(hwi_error_code(br#"{"code":"-12"}"#), None);
    }

    #[test]
    fn trezor_pin_positions_are_bounded_and_built_only_for_stdin() {
        assert_eq!(pin_command_input(b"719").unwrap(), b"sendpin 719\n\n");
        assert_eq!(pin_command_input(b""), Err(HardwareError::InvalidArgument));
        assert_eq!(
            pin_command_input(b"120"),
            Err(HardwareError::InvalidArgument)
        );
        assert_eq!(
            pin_command_input(&[b'1'; MAX_PIN_POSITIONS + 1]),
            Err(HardwareError::InvalidArgument)
        );

        let arguments =
            HwiCli::default().device_command_without_value("trezor", "usb-device-path", "--stdin");
        assert!(!arguments.iter().any(|argument| argument.contains("719")));
        assert_eq!(arguments.last().map(String::as_str), Some("--stdin"));
    }

    #[test]
    fn passes_only_a_validated_home_after_clearing_the_environment() {
        let home = std::env::temp_dir();
        let output = run_program(
            Path::new("/usr/bin/env"),
            &[],
            Duration::from_secs(1),
            Some(&home),
        )
        .unwrap();
        let environment = String::from_utf8(output).unwrap();
        assert_eq!(
            environment,
            format!("HOME={}\n", home.canonicalize().unwrap().display())
        );
        assert_eq!(
            trusted_home(Path::new("relative")),
            Err(HardwareError::Unavailable)
        );
    }

    #[test]
    fn constructs_fixed_hwi_commands_for_every_supported_operation() {
        use crate::build_network::parameters_for;

        let test = HwiCli::for_chain(HwiChain::Test);
        assert_eq!(
            test.device_command("coldcard", "usb:1", "getxpub", "m/48'/1'/0'/2'"),
            [
                "--chain",
                "test",
                "--device-type",
                "coldcard",
                "--device-path",
                "usb:1",
                "getxpub",
                "m/48'/1'/0'/2'"
            ]
        );
        let arguments = test.device_command("coldcard", "usb:1", "signtx", "cHNidP8=");
        assert_eq!(arguments[6], "signtx");
        assert_eq!(arguments[7], "cHNidP8=");

        let main = HwiCli::for_chain(HwiChain::Main);
        assert_eq!(
            main.device_command("coldcard", "usb:2", "getxpub", "m/48'/0'/0'/2'")[..2],
            ["--chain", "main"]
        );
        assert_eq!(HwiChain::Main.as_hwi_argument(), "main");
        assert_eq!(HwiChain::Test.as_hwi_argument(), "test");
        assert_eq!(HwiChain::Regtest.as_hwi_argument(), "regtest");
        assert_eq!(HwiChain::Signet.as_hwi_argument(), "signet");
        for network in [
            Network::Bitcoin,
            Network::Testnet,
            Network::Testnet4,
            Network::Signet,
            Network::Regtest,
        ] {
            assert_eq!(
                HwiChain::for_network(network).as_hwi_argument(),
                parameters_for(network).hwi_chain
            );
        }
    }

    #[test]
    fn transport_operations_share_the_fail_closed_process_boundary() {
        let transport = HwiCli {
            program: PathBuf::from("/definitely/not/an/executable"),
            chain: HwiChain::Test,
            home: None,
        };
        assert_eq!(transport.enumerate(), Err(HardwareError::Unavailable));
        assert_eq!(
            transport.account_keypool("trezor", "usb:1", "m/84'/1'/0'"),
            Err(HardwareError::Unavailable)
        );
        assert_eq!(
            transport.sign_psbt("coldcard", "usb:1", "cHNidP8="),
            Err(HardwareError::Unavailable)
        );
        assert_eq!(
            transport.display_descriptor_address("coldcard", "usb:1", "wsh(pk(tpub...))#checksum"),
            Err(HardwareError::Unavailable)
        );
    }
}
