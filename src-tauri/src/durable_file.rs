//! Cross-platform primitives for committing an already-synced temporary file.
//!
//! Groot writes sensitive state to a temporary file in the destination
//! directory, syncs that file, then replaces the authoritative path. Unix
//! `rename` replaces an existing file atomically. Windows `std::fs::rename`
//! does not, so the Windows implementation uses the matching OS primitive.

use std::{io, path::Path};

pub(crate) fn replace(temporary: &Path, destination: &Path) -> io::Result<()> {
    replace_platform(temporary, destination)
}

pub(crate) fn sync_parent(directory: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::fs::File;

        File::open(directory)?.sync_all()
    }

    #[cfg(windows)]
    {
        // MOVEFILE_WRITE_THROUGH makes the Windows replacement wait for the
        // filesystem commit. Windows directories cannot be opened with the
        // portable File API used by the Unix implementation above.
        let _ = directory;
        Ok(())
    }
}

#[cfg(unix)]
fn replace_platform(temporary: &Path, destination: &Path) -> io::Result<()> {
    std::fs::rename(temporary, destination)
}

#[cfg(windows)]
fn replace_platform(temporary: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt as _;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x0000_0001;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x0000_0008;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    fn wide_path(path: &Path) -> io::Result<Vec<u16>> {
        let mut encoded = path.as_os_str().encode_wide().collect::<Vec<_>>();
        if encoded.contains(&0) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "path contains a NUL code unit",
            ));
        }
        encoded.push(0);
        Ok(encoded)
    }

    let temporary = wide_path(temporary)?;
    let destination = wide_path(destination)?;
    // SAFETY: both pointers reference NUL-terminated UTF-16 buffers that stay
    // alive for the call, and the flags are documented MoveFileExW values.
    let moved = unsafe {
        MoveFileExW(
            temporary.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn replaces_an_existing_file() {
        let directory = std::env::temp_dir().join(format!("groot-durable-file-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let destination = directory.join("state.json");
        let temporary = directory.join(".state.tmp");
        fs::write(&destination, b"before").unwrap();
        fs::write(&temporary, b"after").unwrap();

        replace(&temporary, &destination).unwrap();
        sync_parent(&directory).unwrap();

        assert_eq!(fs::read(&destination).unwrap(), b"after");
        assert!(!temporary.exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
