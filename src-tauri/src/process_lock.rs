//! Process-lifetime exclusion for an app-data directory.
//!
//! The operating system owns lock release, including after a crash. The lock
//! file is deliberately never deleted or replaced: doing so would allow two
//! processes to lock different inodes at the same pathname.

use std::{
    fs::{self, File, OpenOptions},
    io,
    path::Path,
};
use tauri::AppHandle;

const LOCK_FILENAME: &str = ".groot-process.lock";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProcessLockError {
    AlreadyRunning,
    UnsafePath,
    Io,
}

impl std::fmt::Display for ProcessLockError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::AlreadyRunning => {
                "Groot is already open for this wallet data directory. Quit the other Groot process and try again."
            }
            Self::UnsafePath => "Groot refused to open an unsafe app-data lock path.",
            Self::Io => {
                "Groot could not secure exclusive access to its wallet data. No wallet was opened."
            }
        })
    }
}

impl std::error::Error for ProcessLockError {}

/// Holds the file description on which the operating system owns the lock.
/// Dropping it, including during process teardown, releases the lock.
pub(crate) struct ProcessLock {
    _file: File,
}

impl ProcessLock {
    pub(crate) fn acquire_for_app(app: &AppHandle) -> Result<Self, ProcessLockError> {
        // Lock the application root, not only the active network namespace, so
        // two processes cannot race the global network selection.
        let app_data =
            crate::wallet::app_data_root(app).map_err(|_| ProcessLockError::UnsafePath)?;
        Self::acquire(&app_data)
    }

    fn acquire(app_data: &Path) -> Result<Self, ProcessLockError> {
        ensure_private_directory(app_data)?;
        let path = app_data.join(LOCK_FILENAME);
        let file = open_regular_lock_file(&path)?;

        match file.try_lock() {
            Ok(()) => {}
            Err(fs::TryLockError::WouldBlock) => {
                return Err(ProcessLockError::AlreadyRunning);
            }
            Err(_) => return Err(ProcessLockError::Io),
        }

        // Recheck after locking so a concurrent pathname replacement cannot
        // make this process believe that it owns the lock used by later opens.
        ensure_same_regular_file(&path, &file)?;
        Ok(Self { _file: file })
    }
}

fn ensure_private_directory(path: &Path) -> Result<(), ProcessLockError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(ProcessLockError::UnsafePath);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let mut builder = fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt as _;
                builder.mode(0o700);
            }
            builder.create(path).map_err(|_| ProcessLockError::Io)?;
            let metadata = fs::symlink_metadata(path).map_err(|_| ProcessLockError::Io)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(ProcessLockError::UnsafePath);
            }
        }
        Err(_) => return Err(ProcessLockError::Io),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|_| ProcessLockError::Io)?;
    }
    Ok(())
}

fn open_regular_lock_file(path: &Path) -> Result<File, ProcessLockError> {
    let mut create = OpenOptions::new();
    create.read(true).write(true).create_new(true);
    prevent_windows_path_replacement(&mut create);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        create.mode(0o600);
    }

    let file = match create.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path).map_err(|_| ProcessLockError::Io)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(ProcessLockError::UnsafePath);
            }
            let mut existing = OpenOptions::new();
            existing.read(true).write(true);
            prevent_windows_path_replacement(&mut existing);
            existing.open(path).map_err(|_| ProcessLockError::Io)?
        }
        Err(_) => return Err(ProcessLockError::Io),
    };

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| ProcessLockError::Io)?;
    }

    ensure_same_regular_file(path, &file)?;
    Ok(file)
}

fn prevent_windows_path_replacement(options: &mut OpenOptions) {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt as _;

        // Allow other contenders to open the same inode so the OS file lock
        // can reject them, but deny delete sharing so the pathname cannot be
        // renamed/replaced while Groot holds the handle.
        const FILE_SHARE_READ: u32 = 0x0000_0001;
        const FILE_SHARE_WRITE: u32 = 0x0000_0002;
        options.share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE);
    }

    #[cfg(not(windows))]
    let _ = options;
}

fn ensure_same_regular_file(path: &Path, file: &File) -> Result<(), ProcessLockError> {
    let opened = file.metadata().map_err(|_| ProcessLockError::Io)?;
    let current = fs::symlink_metadata(path).map_err(|_| ProcessLockError::Io)?;
    if current.file_type().is_symlink() || !opened.is_file() || !current.is_file() {
        return Err(ProcessLockError::UnsafePath);
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        if opened.dev() != current.dev() || opened.ino() != current.ino() {
            return Err(ProcessLockError::UnsafePath);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::{Path, PathBuf},
        process::{Child, Command, Stdio},
        thread,
        time::{Duration, Instant},
    };
    use uuid::Uuid;

    const CHILD_DIRECTORY: &str = "GROOT_PROCESS_LOCK_TEST_DIRECTORY";
    const CHILD_READY: &str = "GROOT_PROCESS_LOCK_TEST_READY";

    fn temporary_directory() -> PathBuf {
        std::env::temp_dir().join(format!("groot-process-lock-test-{}", Uuid::new_v4()))
    }

    fn wait_for(path: &Path) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !path.exists() {
            assert!(Instant::now() < deadline, "timed out waiting for {path:?}");
            thread::sleep(Duration::from_millis(10));
        }
    }

    struct ChildGuard(Option<Child>);

    impl ChildGuard {
        fn terminate(&mut self) {
            if let Some(mut child) = self.0.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    impl Drop for ChildGuard {
        fn drop(&mut self) {
            self.terminate();
        }
    }

    struct LockTestPaths {
        directory: PathBuf,
        ready: PathBuf,
    }

    impl LockTestPaths {
        fn new() -> Self {
            let directory = temporary_directory();
            let ready = directory.with_extension("ready");
            Self { directory, ready }
        }
    }

    impl Drop for LockTestPaths {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.ready);
            let _ = fs::remove_dir_all(&self.directory);
        }
    }

    #[test]
    fn child_process_holds_lock_for_parent_test() {
        let Some(directory) = std::env::var_os(CHILD_DIRECTORY) else {
            return;
        };
        let directory = PathBuf::from(directory);
        let ready = PathBuf::from(std::env::var_os(CHILD_READY).unwrap());
        let _lock = ProcessLock::acquire(&directory).unwrap();
        File::create(&ready).unwrap();
        loop {
            thread::sleep(Duration::from_secs(60));
        }
    }

    #[test]
    fn excludes_another_process_and_recovers_after_it_is_killed() {
        let paths = LockTestPaths::new();
        let mut child = ChildGuard(Some(
            Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "process_lock::tests::child_process_holds_lock_for_parent_test",
                    "--nocapture",
                ])
                .env(CHILD_DIRECTORY, &paths.directory)
                .env(CHILD_READY, &paths.ready)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap(),
        ));

        wait_for(&paths.ready);
        assert_eq!(
            ProcessLock::acquire(&paths.directory).err(),
            Some(ProcessLockError::AlreadyRunning)
        );
        child.terminate();
        let recovered = ProcessLock::acquire(&paths.directory).unwrap();

        drop(recovered);
    }

    #[test]
    fn already_running_error_tells_the_user_how_to_recover() {
        assert_eq!(
            ProcessLockError::AlreadyRunning.to_string(),
            "Groot is already open for this wallet data directory. Quit the other Groot process and try again."
        );
    }

    #[test]
    fn rejects_non_directory_app_data_path() {
        let path = temporary_directory();
        File::create(&path).unwrap();
        assert_eq!(
            ProcessLock::acquire(&path).err(),
            Some(ProcessLockError::UnsafePath)
        );
        fs::remove_file(path).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_app_data_path() {
        use std::os::unix::fs::symlink;

        let target = temporary_directory();
        let link = target.with_extension("link");
        fs::create_dir(&target).unwrap();
        symlink(&target, &link).unwrap();
        assert_eq!(
            ProcessLock::acquire(&link).err(),
            Some(ProcessLockError::UnsafePath)
        );
        fs::remove_file(link).unwrap();
        fs::remove_dir(target).unwrap();
    }

    #[test]
    fn rejects_non_regular_lock_path() {
        let directory = temporary_directory();
        fs::create_dir(&directory).unwrap();
        fs::create_dir(directory.join(LOCK_FILENAME)).unwrap();
        assert_eq!(
            ProcessLock::acquire(&directory).err(),
            Some(ProcessLockError::UnsafePath)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_lock_path() {
        use std::os::unix::fs::symlink;

        let directory = temporary_directory();
        fs::create_dir(&directory).unwrap();
        let target = directory.join("target");
        File::create(&target).unwrap();
        symlink(&target, directory.join(LOCK_FILENAME)).unwrap();
        assert_eq!(
            ProcessLock::acquire(&directory).err(),
            Some(ProcessLockError::UnsafePath)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn existing_lock_file_is_restricted_to_its_owner() {
        use std::os::unix::fs::PermissionsExt as _;

        let directory = temporary_directory();
        fs::create_dir(&directory).unwrap();
        let path = directory.join(LOCK_FILENAME);
        File::create(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o666)).unwrap();

        let lock = ProcessLock::acquire(&directory).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );

        drop(lock);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn existing_app_data_directory_is_restricted_before_lock_use() {
        use std::os::unix::fs::PermissionsExt as _;

        let directory = temporary_directory();
        fs::create_dir(&directory).unwrap();
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o777)).unwrap();

        let lock = ProcessLock::acquire(&directory).unwrap();
        assert_eq!(
            fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );

        drop(lock);
        fs::remove_dir_all(directory).unwrap();
    }
}
