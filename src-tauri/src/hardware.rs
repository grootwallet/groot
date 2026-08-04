use std::{
    io::Read,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const MAX_ARGUMENT_BYTES: usize = 384 * 1024;
const MAX_OUTPUT_BYTES: u64 = 384 * 1024;
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HardwareError {
    InvalidArgument,
    Unavailable,
    TimedOut,
    OutputTooLarge,
    CommandFailed,
    Io,
}

impl HardwareError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidArgument => "invalid_hardware_request",
            Self::Unavailable => "hardware_unavailable",
            Self::TimedOut => "hardware_timeout",
            Self::OutputTooLarge => "hardware_response_too_large",
            Self::CommandFailed => "hardware_command_failed",
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

pub trait HardwareTransport: Send + Sync {
    fn enumerate(&self) -> Result<Vec<u8>, HardwareError>;
    fn account_xpub(
        &self,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError>;
    fn sign_psbt(&self, device_path: &str, psbt: &str) -> Result<Vec<u8>, HardwareError>;
    fn display_descriptor_address(
        &self,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError>;
}

#[derive(Debug, Clone, Copy)]
pub struct HwiCli {
    program: &'static str,
    chain: HwiChain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HwiChain {
    Main,
    Test,
}

impl HwiChain {
    fn as_hwi_argument(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Test => "test",
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
            program: "hwi",
            chain,
        }
    }

    fn device_command(&self, device_path: &str, command: &str, value: &str) -> Vec<String> {
        vec![
            "--chain".into(),
            self.chain.as_hwi_argument().into(),
            "--device-path".into(),
            device_path.into(),
            command.into(),
            value.into(),
        ]
    }
}

impl HardwareTransport for HwiCli {
    fn enumerate(&self) -> Result<Vec<u8>, HardwareError> {
        run_program(
            self.program,
            &[
                "--chain".into(),
                self.chain.as_hwi_argument().into(),
                "enumerate".into(),
            ],
            DEFAULT_TIMEOUT,
        )
    }

    fn account_xpub(
        &self,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        run_program(
            self.program,
            &self.device_command(device_path, "getxpub", derivation_path),
            DEFAULT_TIMEOUT,
        )
    }

    fn sign_psbt(&self, device_path: &str, psbt: &str) -> Result<Vec<u8>, HardwareError> {
        run_program(
            self.program,
            &self.device_command(device_path, "signtx", psbt),
            DEFAULT_TIMEOUT,
        )
    }

    fn display_descriptor_address(
        &self,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let mut arguments = self.device_command(device_path, "displayaddress", "--desc");
        arguments.push(descriptor.into());
        run_program(self.program, &arguments, DEFAULT_TIMEOUT)
    }
}

fn run_program(
    program: &str,
    arguments: &[String],
    timeout: Duration,
) -> Result<Vec<u8>, HardwareError> {
    validate_arguments(arguments)?;
    let mut child = Command::new(program)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| HardwareError::Unavailable)?;
    let stdout = child.stdout.take().ok_or(HardwareError::Io)?;
    let stderr = child.stderr.take().ok_or(HardwareError::Io)?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
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
        return Err(HardwareError::CommandFailed);
    }
    Ok(stdout)
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
    fn preserves_argument_boundaries_without_shell_interpolation() {
        let output = run_program(
            "/bin/echo",
            &["$(touch /tmp/satchel-must-not-exist)".to_owned()],
            Duration::from_secs(1),
        )
        .expect("echo");
        assert_eq!(
            String::from_utf8(output).expect("utf8"),
            "$(touch /tmp/satchel-must-not-exist)\n"
        );
        assert!(!std::path::Path::new("/tmp/satchel-must-not-exist").exists());
    }

    #[test]
    fn reports_failure_timeout_and_missing_executable_without_output_leaks() {
        assert_eq!(
            run_program(
                "/usr/bin/false",
                &["test".to_owned()],
                Duration::from_secs(1)
            ),
            Err(HardwareError::CommandFailed)
        );
        assert_eq!(
            run_program("/bin/sleep", &["1".to_owned()], Duration::from_millis(10)),
            Err(HardwareError::TimedOut)
        );
        assert_eq!(
            run_program(
                "/definitely/not/an/executable",
                &["test".to_owned()],
                Duration::from_secs(1)
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
            (HardwareError::CommandFailed, "hardware_command_failed"),
            (HardwareError::Io, "hardware_io_error"),
        ];
        for (error, code) in errors {
            assert_eq!(error.code(), code);
        }
    }

    #[test]
    fn constructs_fixed_hwi_commands_for_every_supported_operation() {
        let test = HwiCli::for_chain(HwiChain::Test);
        assert_eq!(
            test.device_command("usb:1", "getxpub", "m/48'/1'/0'/2'"),
            [
                "--chain",
                "test",
                "--device-path",
                "usb:1",
                "getxpub",
                "m/48'/1'/0'/2'"
            ]
        );
        let arguments = test.device_command("usb:1", "signtx", "cHNidP8=");
        assert_eq!(arguments[4], "signtx");
        assert_eq!(arguments[5], "cHNidP8=");

        let main = HwiCli::for_chain(HwiChain::Main);
        assert_eq!(
            main.device_command("usb:2", "getxpub", "m/48'/0'/0'/2'")[..2],
            ["--chain", "main"]
        );
        assert_eq!(HwiChain::Main.as_hwi_argument(), "main");
        assert_eq!(HwiChain::Test.as_hwi_argument(), "test");
    }

    #[test]
    fn transport_operations_share_the_fail_closed_process_boundary() {
        let transport = HwiCli {
            program: "/definitely/not/an/executable",
            chain: HwiChain::Test,
        };
        assert_eq!(transport.enumerate(), Err(HardwareError::Unavailable));
        assert_eq!(
            transport.account_xpub("usb:1", "m/48'/1'/0'/2'"),
            Err(HardwareError::Unavailable)
        );
        assert_eq!(
            transport.sign_psbt("usb:1", "cHNidP8="),
            Err(HardwareError::Unavailable)
        );
        assert_eq!(
            transport.display_descriptor_address("usb:1", "wsh(pk(tpub...))#checksum"),
            Err(HardwareError::Unavailable)
        );
    }
}
