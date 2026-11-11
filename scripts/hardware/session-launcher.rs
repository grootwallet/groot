//! Starts the reviewed Python runtime unpacked beside this executable.
//!
//! This launcher has no third-party dependencies and never searches PATH. It
//! loads the exact library from the sealed runtime directory, starts isolated
//! Python, and executes Groot's fixed session bootstrap from the same tree.

use std::{
    ffi::{c_char, c_int, c_void, CString},
    path::{Path, PathBuf},
    ptr,
};

#[cfg(unix)]
type Wide = u32;
#[cfg(windows)]
type Wide = u16;

type Decode = unsafe extern "C" fn(*const c_char, *mut usize) -> *mut Wide;
type SetWide = unsafe extern "C" fn(*const Wide);
type Initialize = unsafe extern "C" fn();
#[cfg(unix)]
type Unicode = unsafe extern "C" fn(*const c_char) -> *mut c_void;
#[cfg(windows)]
type UnicodeWide = unsafe extern "C" fn(*const Wide, isize) -> *mut c_void;
type SetSys = unsafe extern "C" fn(*const c_char, *mut c_void) -> c_int;
type RunString = unsafe extern "C" fn(*const c_char, *mut c_void) -> c_int;
type Finalize = unsafe extern "C" fn() -> c_int;

#[cfg(unix)]
mod loader {
    use super::*;
    const RTLD_NOW: c_int = 2;
    #[cfg(target_os = "macos")]
    const RTLD_GLOBAL: c_int = 8;
    #[cfg(target_os = "linux")]
    const RTLD_GLOBAL: c_int = 0x100;
    #[cfg_attr(target_os = "macos", link(name = "System"))]
    #[cfg_attr(target_os = "linux", link(name = "dl"))]
    unsafe extern "C" {
        fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
        fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
    }
    pub unsafe fn open(path: &Path) -> *mut c_void {
        let Ok(path) = CString::new(path.as_os_str().as_encoded_bytes()) else {
            return ptr::null_mut();
        };
        dlopen(path.as_ptr(), RTLD_NOW | RTLD_GLOBAL)
    }
    pub unsafe fn symbol(handle: *mut c_void, name: &CStrName) -> *mut c_void {
        dlsym(handle, name.0.as_ptr())
    }
}

#[cfg(windows)]
mod loader {
    use super::*;
    use std::os::windows::ffi::OsStrExt as _;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn LoadLibraryW(path: *const u16) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
    }
    pub unsafe fn open(path: &Path) -> *mut c_void {
        let path = path
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        LoadLibraryW(path.as_ptr())
    }
    pub unsafe fn symbol(handle: *mut c_void, name: &CStrName) -> *mut c_void {
        GetProcAddress(handle, name.0.as_ptr().cast())
    }
}

struct CStrName(CString);

unsafe fn symbol<T: Copy>(library: *mut c_void, name: &str) -> Result<T, ()> {
    let name = CStrName(CString::new(name).map_err(|_| ())?);
    let address = loader::symbol(library, &name);
    if address.is_null() {
        return Err(());
    }
    Ok(std::mem::transmute_copy(&address))
}

fn wide_from_path(path: &Path, decode: Decode) -> Result<Vec<Wide>, ()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt as _;
        let _ = decode;
        Ok(path.as_os_str().encode_wide().chain(Some(0)).collect())
    }
    #[cfg(unix)]
    unsafe {
        let encoded = CString::new(path.as_os_str().as_encoded_bytes()).map_err(|_| ())?;
        let wide = decode(encoded.as_ptr(), ptr::null_mut());
        if wide.is_null() {
            return Err(());
        }
        let mut length = 0usize;
        while *wide.add(length) != 0 {
            length += 1;
        }
        Ok(std::slice::from_raw_parts(wide, length + 1).to_vec())
    }
}

unsafe fn unicode_from_path(library: *mut c_void, path: &Path) -> Result<*mut c_void, ()> {
    #[cfg(unix)]
    {
        let unicode: Unicode = symbol(library, "PyUnicode_DecodeFSDefault")?;
        let encoded = CString::new(path.as_os_str().as_encoded_bytes()).map_err(|_| ())?;
        Ok(unicode(encoded.as_ptr()))
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt as _;
        let unicode: UnicodeWide = symbol(library, "PyUnicode_FromWideChar")?;
        let encoded = path.as_os_str().encode_wide().collect::<Vec<_>>();
        Ok(unicode(encoded.as_ptr(), encoded.len() as isize))
    }
}

fn python_path(root: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        root.join("Python")
    }
    #[cfg(target_os = "linux")]
    {
        root.join("libpython3.9.so.1.0")
    }
    #[cfg(windows)]
    {
        root.join("python39.dll")
    }
}

fn search_path(root: &Path) -> PathBuf {
    let delimiter = if cfg!(windows) { ";" } else { ":" };
    PathBuf::from(format!(
        "{}{}{}{}{}",
        root.join("base_library.zip").display(),
        delimiter,
        root.display(),
        delimiter,
        root.join("lib-dynload").display()
    ))
}

fn run() -> Result<(), ()> {
    if std::env::args_os().len() != 2
        || std::env::args_os().nth(1).as_deref() != Some("--stdin".as_ref())
    {
        return Err(());
    }
    let executable = std::env::current_exe()
        .map_err(|_| ())?
        .canonicalize()
        .map_err(|_| ())?;
    let root = executable.parent().ok_or(())?.to_path_buf();
    let library = unsafe { loader::open(&python_path(&root)) };
    if library.is_null() {
        return Err(());
    }
    unsafe {
        for flag in [
            "Py_IsolatedFlag",
            "Py_NoSiteFlag",
            "Py_IgnoreEnvironmentFlag",
            "Py_UTF8Mode",
            "Py_DontWriteBytecodeFlag",
        ] {
            let pointer: *mut c_int = symbol(library, flag)?;
            *pointer = 1;
        }
        let decode: Decode = symbol(library, "Py_DecodeLocale")?;
        let set_home: SetWide = symbol(library, "Py_SetPythonHome")?;
        let set_path: SetWide = symbol(library, "Py_SetPath")?;
        let initialize: Initialize = symbol(library, "Py_Initialize")?;
        let set_sys: SetSys = symbol(library, "PySys_SetObject")?;
        let run_string: RunString = symbol(library, "PyRun_SimpleStringFlags")?;
        let finalize: Finalize = symbol(library, "Py_FinalizeEx")?;
        let home = wide_from_path(&root, decode)?;
        let path = wide_from_path(&search_path(&root), decode)?;
        set_home(home.as_ptr());
        set_path(path.as_ptr());
        initialize();
        let runtime = unicode_from_path(library, &root)?;
        let script = unicode_from_path(library, &root.join("groot-session.py"))?;
        let runtime_name = CString::new("_groot_runtime").map_err(|_| ())?;
        let script_name = CString::new("_groot_script").map_err(|_| ())?;
        if runtime.is_null()
            || script.is_null()
            || set_sys(runtime_name.as_ptr(), runtime) != 0
            || set_sys(script_name.as_ptr(), script) != 0
        {
            return Err(());
        }
        let code = CString::new("import sys\np=sys._groot_script\nexec(compile(open(p,'rb').read(),p,'exec'),{'__name__':'__main__'})\n").map_err(|_| ())?;
        let result = run_string(code.as_ptr(), ptr::null_mut());
        if finalize() < 0 || result != 0 {
            return Err(());
        }
    }
    Ok(())
}

fn main() {
    if run().is_err() {
        std::process::exit(2);
    }
}
