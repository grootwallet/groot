use bdk_wallet::bitcoin::{
    hashes::{sha256, Hash as _, HashEngine as _},
    Network,
};
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};
use zeroize::Zeroizing;

const MAX_ARGUMENT_BYTES: usize = 384 * 1024;
const MAX_STDIN_BYTES: usize = MAX_ARGUMENT_BYTES + 1024;
const MAX_PIN_POSITIONS: usize = 50;
const MAX_OUTPUT_BYTES: u64 = 384 * 1024;
const PIPE_CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);
const CANCELLATION_CLEANUP_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(90);
const PIN_SESSION_TIMEOUT: Duration = Duration::from_secs(2 * 60);
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(30);
const USER_REVIEW_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const HWI_DIGEST_HEX_BYTES: usize = 64;
const HWI_FIXED_ARGV: &[&str] = &["--stdin"];
static HWI_COORDINATOR: OnceLock<HardwareCoordinator> = OnceLock::new();

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HardwareError {
    InvalidArgument,
    Unavailable,
    TimedOut,
    Busy,
    Cancelled,
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
            Self::Busy => "hardware_busy",
            Self::Cancelled => "hardware_cancelled",
            Self::OutputTooLarge => "hardware_response_too_large",
            Self::CommandFailed(_) => "hardware_command_failed",
            Self::Io => "hardware_io_error",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HardwareOperationKind {
    Discovery,
    Interactive,
}

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug)]
struct ActiveHardwareOperation {
    id: u64,
    kind: HardwareOperationKind,
    cancelled: Arc<AtomicBool>,
}

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Default)]
struct HardwareCoordinatorState {
    active: Option<ActiveHardwareOperation>,
    interactive_waiter: bool,
    cancellation_generation: u64,
}

#[derive(Debug)]
struct HardwareCoordinator {
    state: Mutex<HardwareCoordinatorState>,
    available: Condvar,
    next_id: AtomicU64,
}

impl Default for HardwareCoordinator {
    fn default() -> Self {
        Self {
            state: Mutex::new(HardwareCoordinatorState::default()),
            available: Condvar::new(),
            next_id: AtomicU64::new(1),
        }
    }
}

fn hardware_coordinator() -> &'static HardwareCoordinator {
    HWI_COORDINATOR.get_or_init(HardwareCoordinator::default)
}

fn admission_error(
    state: &HardwareCoordinatorState,
    kind: HardwareOperationKind,
) -> Option<HardwareError> {
    if state.interactive_waiter {
        return Some(HardwareError::Busy);
    }
    match (kind, state.active.as_ref().map(|active| active.kind)) {
        (HardwareOperationKind::Discovery, Some(_))
        | (HardwareOperationKind::Interactive, Some(HardwareOperationKind::Interactive)) => {
            Some(HardwareError::Busy)
        }
        _ => None,
    }
}

#[derive(Debug)]
pub struct HardwareOperation {
    id: u64,
    deadline: Instant,
    cancelled: Arc<AtomicBool>,
}

impl HardwareOperation {
    fn acquire(kind: HardwareOperationKind, timeout: Duration) -> Result<Self, HardwareError> {
        #[cfg(not(test))]
        let requested_deadline = Instant::now()
            .checked_add(timeout)
            .ok_or(HardwareError::InvalidArgument)?;
        let coordinator = hardware_coordinator();
        let mut state = coordinator.state.lock().map_err(|_| HardwareError::Io)?;

        #[cfg(test)]
        while state.active.is_some() {
            state = coordinator
                .available
                .wait(state)
                .map_err(|_| HardwareError::Io)?;
        }

        // Parallel unit tests share this process-wide coordinator. Their
        // production admission/deadline semantics are covered separately;
        // do not charge unrelated test execution against a fixture timeout.
        #[cfg(test)]
        let requested_deadline = Instant::now()
            .checked_add(timeout)
            .ok_or(HardwareError::InvalidArgument)?;

        #[cfg(not(test))]
        {
            if let Some(error) = admission_error(&state, kind) {
                return Err(error);
            }
            if kind == HardwareOperationKind::Interactive {
                if let Some(active) = state.active.as_ref() {
                    let cancellation_generation = state.cancellation_generation;
                    active.cancelled.store(true, Ordering::Release);
                    state.interactive_waiter = true;
                    while state.active.is_some() {
                        if state.cancellation_generation != cancellation_generation {
                            state.interactive_waiter = false;
                            return Err(HardwareError::Cancelled);
                        }
                        let now = Instant::now();
                        if now >= requested_deadline {
                            state.interactive_waiter = false;
                            return Err(HardwareError::TimedOut);
                        }
                        let remaining = requested_deadline.saturating_duration_since(now);
                        let (next, wait) = coordinator
                            .available
                            .wait_timeout(state, remaining)
                            .map_err(|_| HardwareError::Io)?;
                        state = next;
                        if state.cancellation_generation != cancellation_generation {
                            state.interactive_waiter = false;
                            return Err(HardwareError::Cancelled);
                        }
                        if wait.timed_out() && state.active.is_some() {
                            state.interactive_waiter = false;
                            return Err(HardwareError::TimedOut);
                        }
                    }
                    state.interactive_waiter = false;
                }
            }
        }

        Self::claim(coordinator, state, kind, requested_deadline)
    }

    fn claim(
        coordinator: &HardwareCoordinator,
        mut state: std::sync::MutexGuard<'_, HardwareCoordinatorState>,
        kind: HardwareOperationKind,
        deadline: Instant,
    ) -> Result<Self, HardwareError> {
        let id = coordinator.next_id.fetch_add(1, Ordering::Relaxed);
        let cancelled = Arc::new(AtomicBool::new(false));
        state.active = Some(ActiveHardwareOperation {
            id,
            kind,
            cancelled: Arc::clone(&cancelled),
        });
        Ok(Self {
            id,
            deadline,
            cancelled,
        })
    }

    fn remaining(&self) -> Result<Duration, HardwareError> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(HardwareError::Cancelled);
        }
        self.deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(HardwareError::TimedOut)
    }
}

impl Drop for HardwareOperation {
    fn drop(&mut self) {
        let coordinator = hardware_coordinator();
        if let Ok(mut state) = coordinator.state.lock() {
            if state
                .active
                .as_ref()
                .is_some_and(|active| active.id == self.id)
            {
                state.active = None;
                coordinator.available.notify_all();
            }
        }
    }
}

pub fn cancel_hardware_operations_and_wait() -> Result<(), HardwareError> {
    let coordinator = hardware_coordinator();
    let mut state = coordinator.state.lock().map_err(|_| HardwareError::Io)?;
    let cancelled_id = state.active.as_ref().map(|active| active.id);
    cancel_coordinator_state(&mut state);
    coordinator.available.notify_all();

    let deadline = Instant::now()
        .checked_add(CANCELLATION_CLEANUP_TIMEOUT)
        .ok_or(HardwareError::Io)?;
    while cancelled_id.is_some_and(|id| state.active.as_ref().is_some_and(|active| active.id == id))
    {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(HardwareError::TimedOut)?;
        let (next, wait) = coordinator
            .available
            .wait_timeout(state, remaining)
            .map_err(|_| HardwareError::Io)?;
        state = next;
        if wait.timed_out()
            && cancelled_id
                .is_some_and(|id| state.active.as_ref().is_some_and(|active| active.id == id))
        {
            return Err(HardwareError::TimedOut);
        }
    }
    Ok(())
}

fn cancel_coordinator_state(state: &mut HardwareCoordinatorState) {
    state.cancellation_generation = state.cancellation_generation.wrapping_add(1);
    if let Some(active) = state.active.as_ref() {
        active.cancelled.store(true, Ordering::Release);
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
    fn account_xpub(
        &self,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError>;
    #[cfg(test)]
    fn sign_psbt(
        &self,
        device_type: &str,
        device_path: &str,
        psbt: &str,
    ) -> Result<Vec<u8>, HardwareError>;
    #[cfg(test)]
    fn display_descriptor_address(
        &self,
        device_type: &str,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError>;
}

pub struct HwiPinSession {
    commands: Option<mpsc::SyncSender<PinSessionCommand>>,
    worker: Option<thread::JoinHandle<()>>,
}

enum PinSessionCommand {
    Send {
        input: Zeroizing<Vec<u8>>,
        response: mpsc::SyncSender<Result<Vec<u8>, HardwareError>>,
    },
    Cancel,
}

struct PinProcess {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: mpsc::Receiver<Result<Vec<u8>, HardwareError>>,
    stdout_done: mpsc::Receiver<()>,
    stderr: mpsc::Receiver<Result<Vec<u8>, HardwareError>>,
    operation: Option<HardwareOperation>,
}

#[derive(Debug, Clone)]
pub struct HwiCli {
    program: PathBuf,
    chain: HwiChain,
    home: Option<PathBuf>,
    source: HwiSource,
}

#[derive(Debug, Clone)]
enum HwiSource {
    External,
    #[cfg(target_os = "macos")]
    Bundled {
        bundle_root: PathBuf,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HwiChain {
    Main,
    Test,
    Testnet4,
    Regtest,
    Signet,
}

impl HwiChain {
    pub(crate) const fn for_network(network: Network) -> Self {
        match network {
            Network::Bitcoin => Self::Main,
            Network::Testnet => Self::Test,
            Network::Testnet4 => Self::Testnet4,
            Network::Signet => Self::Signet,
            Network::Regtest => Self::Regtest,
        }
    }

    pub(crate) const fn as_hwi_argument(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Test => "test",
            Self::Testnet4 => "testnet4",
            Self::Regtest => "regtest",
            Self::Signet => "signet",
        }
    }

    fn as_hwi_argument_for_device(self, device_type: &str) -> &'static str {
        // HWI 3.2.0 exposes Testnet4 globally, but its Jade adapter only maps
        // Chain::TEST to Jade's shared test-network family. Passing TESTNET4
        // fails before JadeClient can call auth_user and display the PIN flow.
        if self == Self::Testnet4 && device_type.eq_ignore_ascii_case("jade") {
            Self::Test.as_hwi_argument()
        } else {
            self.as_hwi_argument()
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
            source: HwiSource::External,
        }
    }

    #[cfg(target_os = "macos")]
    pub fn for_bundled_resource(
        chain: HwiChain,
        resource_dir: &Path,
        resource_name: &str,
    ) -> Result<Self, HardwareError> {
        let (program, bundle_root) = bundled_hwi_paths(resource_dir, resource_name)?;
        Ok(Self {
            program,
            chain,
            home: None,
            source: HwiSource::Bundled { bundle_root },
        })
    }

    pub fn with_home(mut self, home: PathBuf) -> Result<Self, HardwareError> {
        self.home = Some(trusted_home(&home)?);
        Ok(self)
    }

    #[cfg(test)]
    pub(crate) fn for_test_program(program: PathBuf) -> Self {
        Self {
            program,
            chain: HwiChain::Test,
            home: None,
            source: HwiSource::External,
        }
    }

    fn device_command(
        &self,
        device_type: &str,
        device_path: &str,
        command: &str,
        value: &str,
    ) -> Vec<String> {
        let mut arguments = vec![
            "--chain".into(),
            self.chain.as_hwi_argument_for_device(device_type).into(),
            "--device-type".into(),
            device_type.into(),
        ];
        if !device_path.is_empty() && !device_path.starts_with("groot-saved-device:") {
            arguments.extend(["--device-path".into(), device_path.into()]);
        }
        arguments.extend([command.into(), value.into()]);
        arguments
    }

    fn device_command_without_value(
        &self,
        device_type: &str,
        device_path: &str,
        command: &str,
    ) -> Vec<String> {
        vec![
            "--chain".into(),
            self.chain.as_hwi_argument_for_device(device_type).into(),
            "--device-type".into(),
            device_type.into(),
            "--device-path".into(),
            device_path.into(),
            command.into(),
        ]
    }

    pub fn begin_interactive_operation(&self) -> Result<HardwareOperation, HardwareError> {
        HardwareOperation::acquire(HardwareOperationKind::Interactive, USER_REVIEW_TIMEOUT)
    }

    fn begin_discovery_operation(&self) -> Result<HardwareOperation, HardwareError> {
        HardwareOperation::acquire(HardwareOperationKind::Discovery, DISCOVERY_TIMEOUT)
    }

    pub fn start_pin_session(
        &self,
        device_type: &str,
        device_path: &str,
    ) -> Result<(Vec<u8>, HwiPinSession), HardwareError> {
        HwiPinSession::start(
            &self.program,
            &self.source,
            &self.device_command_without_value(device_type, device_path, "--stdin"),
            self.home.as_deref(),
        )
    }

    pub fn account_keypool_in_operation(
        &self,
        operation: &HardwareOperation,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let keypool_path = format!("{derivation_path}/0/*");
        run_program_in_operation(
            &self.program,
            &self.source,
            &[
                "--chain".into(),
                self.chain.as_hwi_argument_for_device(device_type).into(),
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
            operation,
            self.home.as_deref(),
            None,
        )
    }

    pub fn account_xpub_in_operation(
        &self,
        operation: &HardwareOperation,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        run_program_in_operation(
            &self.program,
            &self.source,
            &self.device_command(device_type, device_path, "getxpub", derivation_path),
            operation,
            self.home.as_deref(),
            None,
        )
    }

    pub fn sign_psbt_in_operation(
        &self,
        operation: &HardwareOperation,
        device_type: &str,
        device_path: &str,
        psbt: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        run_program_in_operation(
            &self.program,
            &self.source,
            &self.device_command(device_type, device_path, "signtx", psbt),
            operation,
            self.home.as_deref(),
            None,
        )
    }

    pub fn display_descriptor_address_in_operation(
        &self,
        operation: &HardwareOperation,
        device_type: &str,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let mut arguments =
            self.device_command(device_type, device_path, "displayaddress", "--desc");
        arguments.push(descriptor.into());
        run_program_in_operation(
            &self.program,
            &self.source,
            &arguments,
            operation,
            self.home.as_deref(),
            None,
        )
    }
}

impl HardwareTransport for HwiCli {
    fn enumerate(&self) -> Result<Vec<u8>, HardwareError> {
        let operation = self.begin_discovery_operation()?;
        run_program_in_operation(
            &self.program,
            &self.source,
            &[
                "--chain".into(),
                self.chain.as_hwi_argument().into(),
                "enumerate".into(),
            ],
            &operation,
            self.home.as_deref(),
            None,
        )
    }

    fn account_keypool(
        &self,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let operation =
            HardwareOperation::acquire(HardwareOperationKind::Interactive, DEFAULT_TIMEOUT)?;
        self.account_keypool_in_operation(&operation, device_type, device_path, derivation_path)
    }

    fn account_xpub(
        &self,
        device_type: &str,
        device_path: &str,
        derivation_path: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let operation =
            HardwareOperation::acquire(HardwareOperationKind::Interactive, DEFAULT_TIMEOUT)?;
        self.account_xpub_in_operation(&operation, device_type, device_path, derivation_path)
    }

    #[cfg(test)]
    fn sign_psbt(
        &self,
        device_type: &str,
        device_path: &str,
        psbt: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let operation = self.begin_interactive_operation()?;
        self.sign_psbt_in_operation(&operation, device_type, device_path, psbt)
    }

    #[cfg(test)]
    fn display_descriptor_address(
        &self,
        device_type: &str,
        device_path: &str,
        descriptor: &str,
    ) -> Result<Vec<u8>, HardwareError> {
        let operation = self.begin_interactive_operation()?;
        self.display_descriptor_address_in_operation(
            &operation,
            device_type,
            device_path,
            descriptor,
        )
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

#[cfg(target_os = "macos")]
fn bundled_hwi_paths(
    resource_dir: &Path,
    resource_name: &str,
) -> Result<(PathBuf, PathBuf), HardwareError> {
    if resource_name != "hwi"
        || !resource_dir.is_absolute()
        || resource_dir.file_name().and_then(|name| name.to_str()) != Some("Resources")
    {
        return Err(HardwareError::Unavailable);
    }
    let contents = resource_dir.parent().ok_or(HardwareError::Unavailable)?;
    if contents.file_name().and_then(|name| name.to_str()) != Some("Contents") {
        return Err(HardwareError::Unavailable);
    }
    let bundle_root = contents.parent().ok_or(HardwareError::Unavailable)?;
    if bundle_root
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("app")
    {
        return Err(HardwareError::Unavailable);
    }
    Ok((resource_dir.join(resource_name), bundle_root.to_path_buf()))
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn first_existing_absolute(candidates: &[&str]) -> PathBuf {
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| PathBuf::from(candidates[0]))
}

#[cfg(test)]
fn run_program(
    program: &Path,
    source: &HwiSource,
    arguments: &[String],
    timeout: Duration,
    home: Option<&Path>,
) -> Result<Vec<u8>, HardwareError> {
    if !program.is_absolute() {
        return Err(HardwareError::Unavailable);
    }
    let _ = trusted_executable(program, source)?;
    let operation = HardwareOperation::acquire(HardwareOperationKind::Interactive, timeout)?;
    run_program_in_operation(program, source, arguments, &operation, home, None)
}

fn quote_hwi_stdin_argument(argument: &str) -> String {
    format!("'{}'", argument.replace('\'', "'\"'\"'"))
}

fn hwi_stdin_command_line(arguments: &[String]) -> Result<Vec<u8>, HardwareError> {
    validate_arguments(arguments)?;
    let mut input = arguments
        .iter()
        .map(|argument| quote_hwi_stdin_argument(argument))
        .collect::<Vec<_>>()
        .join(" ")
        .into_bytes();
    input.push(b'\n');
    if input.len() > MAX_STDIN_BYTES {
        input.fill(0);
        return Err(HardwareError::InvalidArgument);
    }
    Ok(input)
}

fn hwi_stdin_command(
    arguments: &[String],
    extra_input: Option<&[u8]>,
) -> Result<Vec<u8>, HardwareError> {
    let mut input = hwi_stdin_command_line(arguments)?;
    if let Some(extra) = extra_input {
        if extra.is_empty() || extra.contains(&0) {
            input.fill(0);
            return Err(HardwareError::InvalidArgument);
        }
        input.extend_from_slice(extra);
        if !extra.ends_with(b"\n") {
            input.push(b'\n');
        }
    }
    input.push(b'\n');
    if input.len() > MAX_STDIN_BYTES {
        input.fill(0);
        return Err(HardwareError::InvalidArgument);
    }
    Ok(input)
}

fn read_bounded_line<R: BufRead>(reader: &mut R) -> Result<Option<Vec<u8>>, HardwareError> {
    let mut bytes = Vec::new();
    let read = reader
        .take(MAX_OUTPUT_BYTES + 1)
        .read_until(b'\n', &mut bytes)
        .map_err(|_| HardwareError::Io)?;
    if read == 0 {
        return Ok(None);
    }
    if bytes.len() as u64 > MAX_OUTPUT_BYTES {
        return Err(HardwareError::OutputTooLarge);
    }
    Ok(Some(bytes))
}

impl HwiPinSession {
    fn start(
        program: &Path,
        source: &HwiSource,
        arguments: &[String],
        home: Option<&Path>,
    ) -> Result<(Vec<u8>, Self), HardwareError> {
        let program = program.to_path_buf();
        let source = source.clone();
        let arguments = arguments.to_vec();
        let home = home.map(Path::to_path_buf);
        let (commands_tx, commands_rx) = mpsc::sync_channel(1);
        let (started_tx, started_rx) = mpsc::sync_channel(1);
        let worker = thread::spawn(move || {
            let (prompt, process) =
                match PinProcess::start(&program, &source, &arguments, home.as_deref()) {
                    Ok(started) => started,
                    Err(error) => {
                        let _ = started_tx.send(Err(error));
                        return;
                    }
                };
            if started_tx.send(Ok(prompt)).is_err() {
                return;
            }
            loop {
                let remaining = match process
                    .operation
                    .as_ref()
                    .ok_or(HardwareError::Io)
                    .and_then(HardwareOperation::remaining)
                {
                    Ok(remaining) => remaining,
                    Err(_) => return,
                };
                match commands_rx.recv_timeout(remaining.min(Duration::from_millis(20))) {
                    Ok(PinSessionCommand::Send { input, response }) => {
                        let _ = response.send(process.send_input(input));
                        return;
                    }
                    Ok(PinSessionCommand::Cancel) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                        return
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
            }
        });
        let mut session = Self {
            commands: Some(commands_tx),
            worker: Some(worker),
        };
        match started_rx.recv_timeout(PIN_SESSION_TIMEOUT + PIPE_CLEANUP_TIMEOUT) {
            Ok(Ok(prompt)) => Ok((prompt, session)),
            Ok(Err(error)) => {
                session.join_worker()?;
                Err(error)
            }
            Err(_) => {
                drop(session);
                Err(HardwareError::TimedOut)
            }
        }
    }

    fn join_worker(&mut self) -> Result<(), HardwareError> {
        self.commands = None;
        match self.worker.take() {
            Some(worker) => worker.join().map_err(|_| HardwareError::Io),
            None => Ok(()),
        }
    }

    pub fn send_pin(mut self, pin_positions: &[u8]) -> Result<Vec<u8>, HardwareError> {
        let commands = self.commands.as_ref().cloned().ok_or(HardwareError::Io)?;
        let input = Zeroizing::new(pin_command_input(pin_positions)?);
        let (response_tx, response_rx) = mpsc::sync_channel(1);
        let command = PinSessionCommand::Send {
            input,
            response: response_tx,
        };
        if let Err(mpsc::SendError(command)) = commands.send(command) {
            if let PinSessionCommand::Send { mut input, .. } = command {
                input.fill(0);
            }
            return Err(HardwareError::Io);
        }
        self.commands = None;
        let result = response_rx
            .recv_timeout(PIN_SESSION_TIMEOUT + PIPE_CLEANUP_TIMEOUT)
            .map_err(|_| HardwareError::TimedOut)?;
        self.join_worker()?;
        result
    }
}

impl Drop for HwiPinSession {
    fn drop(&mut self) {
        if let Some(commands) = self.commands.take() {
            let _ = commands.send(PinSessionCommand::Cancel);
        }
        let _ = self.join_worker();
    }
}

impl PinProcess {
    fn start(
        program: &Path,
        source: &HwiSource,
        arguments: &[String],
        home: Option<&Path>,
    ) -> Result<(Vec<u8>, Self), HardwareError> {
        if !program.is_absolute() {
            return Err(HardwareError::Unavailable);
        }
        let program = trusted_executable(program, source)?;
        let operation =
            HardwareOperation::acquire(HardwareOperationKind::Interactive, PIN_SESSION_TIMEOUT)?;
        let mut input = hwi_stdin_command_line(arguments)?;
        input.extend_from_slice(b"promptpin\n");
        if input.len() > MAX_STDIN_BYTES {
            input.fill(0);
            return Err(HardwareError::InvalidArgument);
        }

        let mut command = Command::new(program);
        command.args(HWI_FIXED_ARGV).env_clear();
        if let Some(home) = home {
            command.env("HOME", trusted_home(home)?);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            command.process_group(0);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| HardwareError::Unavailable)?;
        let Some(stdin) = child.stdin.take() else {
            terminate_process_tree(&mut child);
            return Err(HardwareError::Io);
        };
        let Some(stdout) = child.stdout.take() else {
            terminate_process_tree(&mut child);
            return Err(HardwareError::Io);
        };
        let Some(stderr) = child.stderr.take() else {
            terminate_process_tree(&mut child);
            return Err(HardwareError::Io);
        };

        let (stdout_tx, stdout_rx) = mpsc::channel();
        let (stdout_done_tx, stdout_done_rx) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let mut stdout = BufReader::new(stdout);
            loop {
                match read_bounded_line(&mut stdout) {
                    Ok(Some(line)) => {
                        if stdout_tx.send(Ok(line)).is_err() {
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = stdout_tx.send(Err(error));
                        break;
                    }
                }
            }
            let _ = stdout_done_tx.send(());
        });
        let (stderr_tx, stderr_rx) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let _ = stderr_tx.send(read_bounded(stderr));
        });

        let mut session = Self {
            child: Some(child),
            stdin: Some(stdin),
            stdout: stdout_rx,
            stdout_done: stdout_done_rx,
            stderr: stderr_rx,
            operation: Some(operation),
        };
        let write_result = session
            .stdin
            .as_mut()
            .ok_or(HardwareError::Io)
            .and_then(|stdin| stdin.write_all(&input).map_err(|_| HardwareError::Io));
        input.fill(0);
        if let Err(error) = write_result {
            session.abort();
            return Err(error);
        }
        let prompt = match session.next_output() {
            Ok(output) => output,
            Err(error) => {
                session.abort();
                return Err(error);
            }
        };
        Ok((prompt, session))
    }

    fn next_output(&mut self) -> Result<Vec<u8>, HardwareError> {
        loop {
            let remaining = self
                .operation
                .as_ref()
                .ok_or(HardwareError::Io)?
                .remaining()?;
            match self
                .stdout
                .recv_timeout(remaining.min(Duration::from_millis(20)))
            {
                Ok(output) => return output,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(HardwareError::CommandFailed(None));
                }
            }
        }
    }

    fn wait_for_exit(&mut self) -> Result<std::process::ExitStatus, HardwareError> {
        loop {
            if let Some(status) = self
                .child
                .as_mut()
                .ok_or(HardwareError::Io)?
                .try_wait()
                .map_err(|_| HardwareError::Io)?
            {
                return Ok(status);
            }
            self.operation
                .as_ref()
                .ok_or(HardwareError::Io)?
                .remaining()?;
            thread::sleep(Duration::from_millis(20));
        }
    }

    fn collect_pipes(&self) -> Result<(), HardwareError> {
        let deadline = Instant::now()
            .checked_add(PIPE_CLEANUP_TIMEOUT)
            .ok_or(HardwareError::Io)?;
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(HardwareError::Io)?;
        self.stdout_done
            .recv_timeout(remaining)
            .map_err(|_| HardwareError::Io)?;
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(HardwareError::Io)?;
        self.stderr
            .recv_timeout(remaining)
            .map_err(|_| HardwareError::Io)??;
        match self.stdout.try_recv() {
            Err(mpsc::TryRecvError::Empty | mpsc::TryRecvError::Disconnected) => Ok(()),
            Ok(_) => Err(HardwareError::Io),
        }
    }

    fn abort(&mut self) {
        self.stdin.take();
        if let Some(child) = self.child.as_mut() {
            terminate_process_tree(child);
            let _ = self.collect_pipes();
        }
        self.child = None;
        self.operation = None;
    }

    fn send_input(mut self, mut input: Zeroizing<Vec<u8>>) -> Result<Vec<u8>, HardwareError> {
        let write_result = self
            .stdin
            .as_mut()
            .ok_or(HardwareError::Io)
            .and_then(|stdin| stdin.write_all(&input).map_err(|_| HardwareError::Io));
        input.fill(0);
        self.stdin.take();
        if let Err(error) = write_result {
            self.abort();
            return Err(error);
        }
        let output = match self.next_output() {
            Ok(output) => output,
            Err(error) => {
                self.abort();
                return Err(error);
            }
        };
        let status = match self.wait_for_exit() {
            Ok(status) => status,
            Err(error) => {
                self.abort();
                return Err(error);
            }
        };
        if let Err(error) = self.collect_pipes() {
            self.abort();
            return Err(error);
        }
        self.child = None;
        self.operation = None;
        if !status.success() {
            return Err(HardwareError::CommandFailed(hwi_error_code(&output)));
        }
        Ok(output)
    }
}

impl Drop for PinProcess {
    fn drop(&mut self) {
        if self.child.is_some() {
            self.abort();
        }
    }
}

fn run_program_in_operation(
    program: &Path,
    source: &HwiSource,
    arguments: &[String],
    operation: &HardwareOperation,
    home: Option<&Path>,
    extra_input: Option<&[u8]>,
) -> Result<Vec<u8>, HardwareError> {
    operation.remaining()?;
    if !program.is_absolute() {
        return Err(HardwareError::Unavailable);
    }
    let program = trusted_executable(program, source)?;
    let mut input = hwi_stdin_command(arguments, extra_input)?;
    let mut command = Command::new(program);
    // HWI 3.2.0 reparses all selectors and the command from stdin. Keeping argv
    // fixed prevents process metadata from exposing device paths, fingerprints,
    // addresses, descriptors, account keys, or PSBTs.
    command.args(HWI_FIXED_ARGV).env_clear();
    if let Some(home) = home {
        command.env("HOME", trusted_home(home)?);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.process_group(0);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| HardwareError::Unavailable)?;
    let stdout = child.stdout.take().ok_or(HardwareError::Io)?;
    let stderr = child.stderr.take().ok_or(HardwareError::Io)?;
    let (stdout_tx, stdout_rx) = mpsc::sync_channel(1);
    let (stderr_tx, stderr_rx) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let _ = stdout_tx.send(read_bounded(stdout));
    });
    thread::spawn(move || {
        let _ = stderr_tx.send(read_bounded(stderr));
    });
    let write_result = child
        .stdin
        .take()
        .ok_or(HardwareError::Io)
        .and_then(|mut stdin| stdin.write_all(&input).map_err(|_| HardwareError::Io));
    input.fill(0);
    if let Err(error) = write_result {
        terminate_process_tree(&mut child);
        let _ = collect_pipes(&stdout_rx, &stderr_rx);
        return Err(error);
    }
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| HardwareError::Io)? {
            break status;
        }
        if operation.cancelled.load(Ordering::Acquire) {
            terminate_process_tree(&mut child);
            let _ = collect_pipes(&stdout_rx, &stderr_rx);
            return Err(HardwareError::Cancelled);
        }
        if operation.remaining().is_err() {
            terminate_process_tree(&mut child);
            let _ = collect_pipes(&stdout_rx, &stderr_rx);
            return Err(HardwareError::TimedOut);
        }
        thread::sleep(Duration::from_millis(20));
    };
    let (stdout, stderr) = match collect_pipes(&stdout_rx, &stderr_rx) {
        Ok(output) => output,
        Err(error) => {
            // A direct parent can exit while one of its descendants still owns
            // an inherited pipe. Reap the whole isolated process group before
            // releasing the global HWI lease.
            terminate_process_tree(&mut child);
            let _ = collect_pipes(&stdout_rx, &stderr_rx);
            return Err(error);
        }
    };
    if !status.success() {
        // HWI stderr can contain device paths and transaction details. It is deliberately
        // discarded here; callers expose a stable error without leaking it to the webview.
        drop(stderr);
        return Err(HardwareError::CommandFailed(hwi_error_code(&stdout)));
    }
    Ok(stdout)
}

fn collect_pipe_until(
    receiver: &mpsc::Receiver<Result<Vec<u8>, HardwareError>>,
    deadline: Instant,
) -> Result<Vec<u8>, HardwareError> {
    let remaining = deadline
        .checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or(HardwareError::Io)?;
    receiver
        .recv_timeout(remaining)
        .map_err(|_| HardwareError::Io)?
}

fn collect_pipes(
    stdout: &mpsc::Receiver<Result<Vec<u8>, HardwareError>>,
    stderr: &mpsc::Receiver<Result<Vec<u8>, HardwareError>>,
) -> Result<(Vec<u8>, Vec<u8>), HardwareError> {
    let deadline = Instant::now() + PIPE_CLEANUP_TIMEOUT;
    let stdout = collect_pipe_until(stdout, deadline)?;
    let stderr = collect_pipe_until(stderr, deadline)?;
    Ok((stdout, stderr))
}

fn terminate_process_tree(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let process_group = child.id() as i32;
        // SAFETY: the child was placed in a new process group whose id is its
        // pid. A negative pid targets only that group.
        unsafe {
            libc::kill(-process_group, libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        let _ = Command::new(r"C:\Windows\System32\taskkill.exe")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
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

fn trusted_executable(program: &Path, source: &HwiSource) -> Result<PathBuf, HardwareError> {
    let link_metadata = program
        .symlink_metadata()
        .map_err(|_| HardwareError::Unavailable)?;
    if link_metadata.file_type().is_symlink() {
        return Err(HardwareError::Unavailable);
    }
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
    match source {
        HwiSource::External => {
            if release_hwi_verification_required(crate::build_network::NETWORK) {
                verify_release_hwi(&canonical, &metadata)?;
            }
        }
        #[cfg(target_os = "macos")]
        HwiSource::Bundled { bundle_root } => {
            verify_bundled_macos_hwi(program, &canonical, &metadata, bundle_root)?;
        }
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

#[cfg(target_os = "macos")]
fn verify_bundled_macos_hwi(
    requested: &Path,
    canonical: &Path,
    metadata: &std::fs::Metadata,
    bundle_root: &Path,
) -> Result<(), HardwareError> {
    use std::os::unix::fs::PermissionsExt as _;

    if requested != canonical
        || metadata.permissions().mode() & 0o022 != 0
        || bundle_root
            .symlink_metadata()
            .map_err(|_| HardwareError::Unavailable)?
            .file_type()
            .is_symlink()
    {
        return Err(HardwareError::Unavailable);
    }
    let canonical_bundle = bundle_root
        .canonicalize()
        .map_err(|_| HardwareError::Unavailable)?;
    if canonical_bundle != bundle_root || !canonical_bundle.is_dir() {
        return Err(HardwareError::Unavailable);
    }

    verify_macos_code_signature(&canonical_bundle, true)?;
    verify_macos_code_signature(canonical, false)?;
    verify_executable_digest(canonical, configured_hwi_digest()?)
}

#[cfg(target_os = "macos")]
fn verify_macos_code_signature(path: &Path, app_bundle: bool) -> Result<(), HardwareError> {
    use core_foundation::url::CFURL;
    use security_framework::os::macos::code_signing::{Flags, SecRequirement, SecStaticCode};
    use std::str::FromStr as _;

    let url = CFURL::from_path(path, app_bundle).ok_or(HardwareError::Unavailable)?;
    let code =
        SecStaticCode::from_path(&url, Flags::NONE).map_err(|_| HardwareError::Unavailable)?;
    let requirement_text = if app_bundle {
        macos_app_signing_requirement()?
    } else {
        "always".to_owned()
    };
    let requirement =
        SecRequirement::from_str(&requirement_text).map_err(|_| HardwareError::Unavailable)?;
    let mut flags =
        Flags::STRICT_VALIDATE | Flags::CHECK_ALL_ARCHITECTURES | Flags::NO_NETWORK_ACCESS;
    if app_bundle {
        flags |= Flags::CHECK_NESTED_CODE | Flags::RESTRICT_SYMLINKS;
    }
    code.check_validity(flags, &requirement)
        .map_err(|_| HardwareError::Unavailable)
}

#[cfg(target_os = "macos")]
fn macos_app_signing_requirement() -> Result<String, HardwareError> {
    let Some(team_id) = option_env!("GROOT_MACOS_SIGNING_TEAM_ID") else {
        return Ok("always".to_owned());
    };
    if team_id.len() != 10 || !team_id.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return Err(HardwareError::Unavailable);
    }
    Ok(format!(
        "anchor apple generic and certificate leaf[subject.OU] = \"{team_id}\""
    ))
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

    #[cfg(unix)]
    fn test_script(name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt as _;

        let path = std::env::temp_dir().join(format!(
            "groot-hwi-{name}-{}-{:?}",
            std::process::id(),
            thread::current().id()
        ));
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

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

    #[cfg(target_os = "macos")]
    #[test]
    fn bundled_hwi_path_is_fixed_inside_an_app_resource_directory() {
        let resources = Path::new("/Applications/Groot Testnet4.app/Contents/Resources");
        assert_eq!(
            bundled_hwi_paths(resources, "hwi"),
            Ok((
                resources.join("hwi"),
                PathBuf::from("/Applications/Groot Testnet4.app")
            ))
        );
        assert_eq!(
            bundled_hwi_paths(resources, "../MacOS/Groot"),
            Err(HardwareError::Unavailable)
        );
        assert_eq!(
            bundled_hwi_paths(Path::new("/tmp/Resources"), "hwi"),
            Err(HardwareError::Unavailable)
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn bundled_hwi_resource_constructor_never_searches_path() {
        let resources = Path::new("/Applications/Groot Testnet4.app/Contents/Resources");
        let cli = HwiCli::for_bundled_resource(HwiChain::Test, resources, "hwi").unwrap();
        assert_eq!(cli.program, resources.join("hwi"));
        assert!(matches!(cli.source, HwiSource::Bundled { .. }));
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
                &HwiSource::External,
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
            run_program(
                &path,
                &HwiSource::External,
                &["enumerate".into()],
                Duration::from_secs(1),
                None,
            ),
            Err(HardwareError::Unavailable)
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn keeps_dynamic_and_sensitive_values_in_stdin_only() {
        let sensitive = [
            "signtx".to_owned(),
            "cHNidP8=private-transaction-metadata".to_owned(),
            "--device-path".to_owned(),
            "private-usb-path".to_owned(),
            "a1b2c3d4".to_owned(),
            "tb1qprivateaddressmetadata".to_owned(),
            "tpub-private-account-metadata".to_owned(),
            "displayaddress".to_owned(),
            "--desc".to_owned(),
            "wsh(sortedmulti(2,private-wallet-metadata))".to_owned(),
        ];
        let input = String::from_utf8(hwi_stdin_command(&sensitive, None).unwrap()).unwrap();
        for value in &sensitive {
            assert!(input.contains(value));
            assert!(!HWI_FIXED_ARGV
                .iter()
                .any(|argument| argument.contains(value)));
        }
        assert_eq!(HWI_FIXED_ARGV, ["--stdin"]);
        assert!(!std::path::Path::new("/tmp/groot-must-not-exist").exists());
    }

    #[test]
    fn spawned_hwi_process_receives_only_the_fixed_argv() {
        let script = test_script(
            "argv-inspection",
            "IFS= read -r command\nprintf '%s\\n' \"$@\"",
        );
        let output = HwiCli::for_test_program(script.clone())
            .enumerate()
            .unwrap();
        assert_eq!(output, b"--stdin\n");
        std::fs::remove_file(script).unwrap();
    }

    #[test]
    fn reports_failure_timeout_and_missing_executable_without_output_leaks() {
        assert_eq!(
            run_program(
                Path::new("/usr/bin/false"),
                &HwiSource::External,
                &["test".to_owned()],
                Duration::from_secs(1),
                None,
            ),
            Err(HardwareError::CommandFailed(None))
        );
        let slow = test_script("slow", "IFS= read -r command\n/bin/sleep 1");
        assert_eq!(
            run_program(
                &slow,
                &HwiSource::External,
                &["1".to_owned()],
                Duration::from_millis(10),
                None,
            ),
            Err(HardwareError::TimedOut)
        );
        std::fs::remove_file(slow).unwrap();
        assert_eq!(
            run_program(
                Path::new("/definitely/not/an/executable"),
                &HwiSource::External,
                &["test".to_owned()],
                Duration::from_secs(1),
                None,
            ),
            Err(HardwareError::Unavailable)
        );
    }

    #[cfg(unix)]
    #[test]
    fn cancellation_terminates_running_work_and_releases_the_next_lease() {
        let started_file = std::env::temp_dir().join(format!(
            "groot-hwi-cancel-started-{}-{:?}",
            std::process::id(),
            thread::current().id()
        ));
        let slow = test_script(
            "cancel",
            &format!(
                "IFS= read -r command\nprintf '%s\\n' started > '{}'\n/bin/sleep 30\nprintf '%s\\n' '[]'",
                started_file.display()
            ),
        );
        let hwi = HwiCli::for_test_program(slow.clone());
        let running = thread::spawn(move || hwi.enumerate());
        let wait_started = Instant::now();
        while !started_file.exists() && wait_started.elapsed() < Duration::from_secs(5) {
            thread::sleep(Duration::from_millis(10));
        }
        assert!(started_file.exists(), "cancellation fixture did not start");
        cancel_hardware_operations_and_wait().unwrap();

        let fast = test_script("after-cancel", "IFS= read -r command\nprintf '%s\\n' '[]'");
        assert_eq!(
            HwiCli::for_test_program(fast.clone()).enumerate().unwrap(),
            b"[]\n"
        );
        assert_eq!(running.join().unwrap(), Err(HardwareError::Cancelled));
        std::fs::remove_file(slow).unwrap();
        std::fs::remove_file(fast).unwrap();
        std::fs::remove_file(started_file).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn timeout_terminates_descendants_and_bounds_pipe_cleanup() {
        let pid_file = std::env::temp_dir().join(format!(
            "groot-hwi-descendant-pid-{}-{:?}",
            std::process::id(),
            thread::current().id()
        ));
        let script = test_script(
            "descendant",
            &format!(
                "/bin/sleep 30 &\nprintf '%s\\n' \"$!\" > '{}'\nwait",
                pid_file.display()
            ),
        );
        let operation =
            HardwareOperation::acquire(HardwareOperationKind::Interactive, Duration::from_secs(2))
                .unwrap();
        let started = Instant::now();
        assert_eq!(
            run_program_in_operation(
                &script,
                &HwiSource::External,
                &["enumerate".into()],
                &operation,
                None,
                None,
            ),
            Err(HardwareError::TimedOut)
        );
        // Admission completed before timing starts, so unrelated parallel
        // fixtures cannot consume this operation's cleanup assertion.
        assert!(started.elapsed() < Duration::from_secs(8));
        let pid = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse::<i32>()
            .unwrap();
        let descendant_alive = unsafe { libc::kill(pid, 0) } == 0;
        assert!(
            !descendant_alive,
            "the timed-out descendant survived cleanup"
        );
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(pid_file).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn exited_parent_with_inherited_pipes_still_terminates_descendants() {
        let pid_file = std::env::temp_dir().join(format!(
            "groot-hwi-exited-parent-pid-{}-{:?}",
            std::process::id(),
            thread::current().id()
        ));
        let script = test_script(
            "exited-parent",
            &format!(
                "IFS= read -r command\n/bin/sleep 30 &\nprintf '%s\\n' \"$!\" > '{}'\nprintf '%s\\n' '[]'\nexit 0",
                pid_file.display()
            ),
        );
        let operation =
            HardwareOperation::acquire(HardwareOperationKind::Interactive, Duration::from_secs(5))
                .unwrap();
        let started = Instant::now();
        assert_eq!(
            run_program_in_operation(
                &script,
                &HwiSource::External,
                &["enumerate".into()],
                &operation,
                None,
                None,
            ),
            Err(HardwareError::Io)
        );
        assert!(started.elapsed() < Duration::from_secs(6));
        let pid = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse::<i32>()
            .unwrap();
        assert_ne!(unsafe { libc::kill(pid, 0) }, 0);
        drop(operation);

        let fast = test_script(
            "after-exited-parent",
            "IFS= read -r command\nprintf '%s\\n' '[]'",
        );
        assert_eq!(
            HwiCli::for_test_program(fast.clone()).enumerate().unwrap(),
            b"[]\n"
        );
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(fast).unwrap();
        std::fs::remove_file(pid_file).unwrap();
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
            (HardwareError::Busy, "hardware_busy"),
            (HardwareError::Cancelled, "hardware_cancelled"),
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
    fn discovery_is_bounded_below_interactive_device_review() {
        assert_eq!(DISCOVERY_TIMEOUT, Duration::from_secs(30));
        assert!(DISCOVERY_TIMEOUT < DEFAULT_TIMEOUT);
        assert!(DEFAULT_TIMEOUT < USER_REVIEW_TIMEOUT);
    }

    #[test]
    fn interactive_prompt_blocks_discovery_and_excess_work_is_rejected() {
        let state = HardwareCoordinatorState {
            active: Some(ActiveHardwareOperation {
                id: 1,
                kind: HardwareOperationKind::Interactive,
                cancelled: Arc::new(AtomicBool::new(false)),
            }),
            interactive_waiter: false,
            cancellation_generation: 0,
        };
        assert_eq!(
            admission_error(&state, HardwareOperationKind::Discovery),
            Some(HardwareError::Busy)
        );
        assert_eq!(
            admission_error(&state, HardwareOperationKind::Interactive),
            Some(HardwareError::Busy)
        );

        let pending = HardwareCoordinatorState {
            active: None,
            interactive_waiter: true,
            cancellation_generation: 0,
        };
        assert_eq!(
            admission_error(&pending, HardwareOperationKind::Discovery),
            Some(HardwareError::Busy)
        );
    }

    #[test]
    fn cancellation_invalidates_queued_work_and_flags_active_work() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut state = HardwareCoordinatorState {
            active: Some(ActiveHardwareOperation {
                id: 1,
                kind: HardwareOperationKind::Discovery,
                cancelled: Arc::clone(&cancelled),
            }),
            interactive_waiter: true,
            cancellation_generation: 7,
        };
        cancel_coordinator_state(&mut state);
        assert!(cancelled.load(Ordering::Acquire));
        assert_eq!(state.cancellation_generation, 8);
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

    #[cfg(unix)]
    #[test]
    fn trezor_pin_prompt_and_submission_share_one_fixed_argv_process() {
        let argv_file = std::env::temp_dir().join(format!(
            "groot-hwi-pin-argv-{}-{:?}",
            std::process::id(),
            thread::current().id()
        ));
        let script = test_script(
            "pin-session",
            &format!(
                "printf '%s\\n' \"$@\" > '{}'\nIFS= read -r selector\nIFS= read -r prompt\n[ \"$prompt\" = promptpin ] || exit 2\nprintf '%s\\n' '{{\"success\":true}}'\nIFS= read -r send\n[ \"$send\" = 'sendpin 719' ] || exit 3\nIFS= read -r terminator\n[ -z \"$terminator\" ] || exit 4\nprintf '%s\\n' '{{\"success\":true}}'",
                argv_file.display()
            ),
        );
        let hwi = HwiCli::for_test_program(script.clone());
        let (prompt, session) = hwi.start_pin_session("trezor", "usb-device-path").unwrap();
        assert_eq!(prompt, b"{\"success\":true}\n");
        assert_eq!(session.send_pin(b"719").unwrap(), b"{\"success\":true}\n");
        assert_eq!(std::fs::read_to_string(&argv_file).unwrap(), "--stdin\n");
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(argv_file).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn dropping_a_pending_pin_session_terminates_it_and_releases_the_lease() {
        let script = test_script(
            "pin-session-cancel",
            "IFS= read -r selector\nIFS= read -r prompt\nprintf '%s\\n' '{\"success\":true}'\nIFS= read -r send",
        );
        let hwi = HwiCli::for_test_program(script.clone());
        let (_, session) = hwi.start_pin_session("trezor", "usb-device-path").unwrap();
        drop(session);

        let fast = test_script(
            "after-pin-session",
            "IFS= read -r command\nprintf '%s\\n' '[]'",
        );
        assert_eq!(
            HwiCli::for_test_program(fast.clone()).enumerate().unwrap(),
            b"[]\n"
        );
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(fast).unwrap();
    }

    #[test]
    fn passes_only_a_validated_home_after_clearing_the_environment() {
        let home = std::env::temp_dir();
        let environment_fixture = test_script(
            "environment",
            "IFS= read -r command\nprintf 'HOME=%s\\n' \"$HOME\"",
        );
        let output = run_program(
            &environment_fixture,
            &HwiSource::External,
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
        std::fs::remove_file(environment_fixture).unwrap();
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
        assert_eq!(
            test.device_command("jade", "", "getxpub", "m/48'/1'/0'/2'"),
            [
                "--chain",
                "test",
                "--device-type",
                "jade",
                "getxpub",
                "m/48'/1'/0'/2'"
            ]
        );
        assert_eq!(
            test.device_command(
                "jade",
                "groot-saved-device:jade:00000000",
                "displayaddress",
                "wsh(sortedmulti(2,...))#checksum"
            ),
            [
                "--chain",
                "test",
                "--device-type",
                "jade",
                "displayaddress",
                "wsh(sortedmulti(2,...))#checksum"
            ]
        );

        let main = HwiCli::for_chain(HwiChain::Main);
        assert_eq!(
            main.device_command("coldcard", "usb:2", "getxpub", "m/48'/0'/0'/2'")[..2],
            ["--chain", "main"]
        );
        assert_eq!(HwiChain::Main.as_hwi_argument(), "main");
        assert_eq!(HwiChain::Test.as_hwi_argument(), "test");
        assert_eq!(HwiChain::Testnet4.as_hwi_argument(), "testnet4");
        let testnet4 = HwiCli::for_chain(HwiChain::Testnet4);
        assert_eq!(
            testnet4.device_command("jade", "usb:jade", "getxpub", "m/84'/1'/0'")[1],
            "test"
        );
        assert_eq!(
            testnet4.device_command("ledger", "usb:ledger", "getxpub", "m/84'/1'/0'")[1],
            "testnet4"
        );
        assert_eq!(
            testnet4.device_command("bitbox02", "usb:bitbox", "getxpub", "m/84'/1'/0'")[1],
            "testnet4"
        );
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
            source: HwiSource::External,
        };
        assert_eq!(transport.enumerate(), Err(HardwareError::Unavailable));
        assert_eq!(
            transport.account_keypool("trezor", "usb:1", "m/84'/1'/0'"),
            Err(HardwareError::Unavailable)
        );
        assert_eq!(
            transport.account_xpub("trezor", "usb:1", "m/84'/1'/0'"),
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
