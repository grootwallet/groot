use super::{api_error, internal, proposal_api_error, ApiResult, AppState};
use crate::proposal::decode_psbt;
use serde::Serialize;
#[cfg(not(mobile))]
use std::fs::{self, File};
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
use tauri::WebviewWindow;
#[cfg(target_os = "macos")]
use tauri::{webview::PageLoadEvent, WebviewUrl, WebviewWindowBuilder};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const MAX_PUBLIC_BACKUP_BYTES: usize = 256 * 1024;
#[cfg(any(target_os = "macos", test))]
const MAX_PUBLIC_BACKUP_PDF_BYTES: usize = 32 * 1024 * 1024;
#[cfg(any(target_os = "macos", test))]
const MAX_PUBLIC_BACKUP_PDF_HTML_BYTES: usize = 2 * 1024 * 1024;
pub(super) const SAVED_FILE_REVEAL_TIMEOUT: Duration = Duration::from_secs(10 * 60);
#[cfg(any(target_os = "macos", test))]
pub(super) const PENDING_PDF_EXPORT_TIMEOUT: Duration = Duration::from_secs(2 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFileDto {
    pub saved: bool,
    pub reveal_token: Option<String>,
    pub reveal_label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPdfExportDto {
    pub prepared: bool,
    pub save_token: Option<String>,
}

#[cfg(any(target_os = "macos", test))]
pub(super) struct PendingPdfExport {
    pub(super) path: PathBuf,
    pub(super) prepared_at: Instant,
}

pub(super) struct SavedFileReveal {
    pub(super) path: PathBuf,
    pub(super) saved_at: Instant,
}

pub(super) fn validate_public_backup_filename(value: &str) -> ApiResult<&str> {
    let trimmed = value.trim();
    let valid_extension =
        trimmed.ends_with(".bsms") || trimmed.ends_with(".json") || trimmed.ends_with(".txt");
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.contains(['/', '\\', '\0'])
        || !valid_extension
    {
        return Err(api_error(
            "invalid_backup",
            "Choose a valid .bsms, .json, or .txt backup name.",
        ));
    }
    Ok(trimmed)
}

#[cfg(any(target_os = "macos", test))]
pub(super) fn validate_public_backup_pdf_filename(value: &str) -> ApiResult<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.contains(['/', '\\', '\0'])
        || !trimmed.ends_with(".pdf")
    {
        return Err(api_error(
            "invalid_backup",
            "Choose a valid .pdf backup name.",
        ));
    }
    Ok(trimmed)
}

pub(super) fn validate_psbt_filename(value: &str) -> ApiResult<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.contains(['/', '\\', '\0'])
        || !trimmed.ends_with(".psbt")
    {
        return Err(api_error(
            "invalid_backup",
            "Choose a valid .psbt filename.",
        ));
    }
    Ok(trimmed)
}

#[cfg(not(mobile))]
pub(super) fn write_public_export(path: &Path, content: &[u8]) -> ApiResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| internal("The selected export path has no parent directory."))?;
    let temp = parent.join(format!(".groot-export-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(internal)?;
        file.write_all(content).map_err(internal)?;
        file.sync_all().map_err(internal)?;
        fs::rename(&temp, path).map_err(internal)?;
        #[cfg(unix)]
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(internal)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

// Mobile document pickers grant access to the selected file, not necessarily
// to its parent directory. Write the user-selected public export directly so
// iOS does not reject the desktop-only sibling-temp-file strategy.
#[cfg(mobile)]
pub(super) fn write_public_export(path: &Path, content: &[u8]) -> ApiResult<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(internal)?;
    file.write_all(content).map_err(internal)?;
    file.sync_all().map_err(internal)
}

pub async fn public_backup_save(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
    content: String,
) -> ApiResult<SavedFileDto> {
    let filename = validate_public_backup_filename(&suggested_filename)?.to_owned();
    if content.is_empty() || content.len() > MAX_PUBLIC_BACKUP_BYTES {
        return Err(api_error(
            "invalid_backup",
            "The public backup has an invalid size.",
        ));
    }
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        let extension = if filename.ends_with(".bsms") {
            "bsms"
        } else if filename.ends_with(".txt") {
            "txt"
        } else {
            "json"
        };
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Groot public backup", &[extension])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(internal)?;
        write_public_export(&path, content.as_bytes())?;
        Ok(Some(path))
    })
    .await
    .map_err(internal)??;
    saved_file_result(&state, saved_path)
}

pub async fn psbt_file_save(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
    psbt: String,
) -> ApiResult<SavedFileDto> {
    let filename = validate_psbt_filename(&suggested_filename)?.to_owned();
    let content = psbt.trim().to_owned();
    decode_psbt(&content).map_err(proposal_api_error)?;
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Partially signed Bitcoin transaction", &["psbt"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(internal)?;
        write_public_export(&path, content.as_bytes())?;
        Ok(Some(path))
    })
    .await
    .map_err(internal)??;
    saved_file_result(&state, saved_path)
}

pub(super) fn saved_file_result(
    state: &AppState,
    saved_path: Option<PathBuf>,
) -> ApiResult<SavedFileDto> {
    let Some(path) = saved_path else {
        return Ok(SavedFileDto {
            saved: false,
            reveal_token: None,
            reveal_label: None,
        });
    };

    #[cfg(target_os = "macos")]
    {
        let token = Uuid::new_v4().to_string();
        let now = Instant::now();
        let mut saved_files = state.saved_files.lock().map_err(internal)?;
        saved_files
            .retain(|_, saved| now.duration_since(saved.saved_at) <= SAVED_FILE_REVEAL_TIMEOUT);
        if saved_files.len() >= 16 {
            saved_files.clear();
        }
        saved_files.insert(
            token.clone(),
            SavedFileReveal {
                path,
                saved_at: now,
            },
        );
        Ok(SavedFileDto {
            saved: true,
            reveal_token: Some(token),
            reveal_label: Some("Show in Finder".to_owned()),
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        let _ = path;
        Ok(SavedFileDto {
            saved: true,
            reveal_token: None,
            reveal_label: None,
        })
    }
}

pub async fn psbt_file_reveal(
    app: AppHandle,
    state: State<'_, AppState>,
    reveal_token: String,
) -> ApiResult<()> {
    Uuid::parse_str(&reveal_token).map_err(|_| {
        api_error(
            "file_reveal_unavailable",
            "This saved-file shortcut is no longer available.",
        )
    })?;
    let saved = state
        .saved_files
        .lock()
        .map_err(internal)
        .and_then(|mut saved_files| {
            consume_saved_file_token(&mut saved_files, &reveal_token, Instant::now()).ok_or_else(
                || {
                    api_error(
                        "file_reveal_unavailable",
                        "This saved-file shortcut expired. The file remains saved.",
                    )
                },
            )
        })?;
    if !saved.path.is_file() {
        return Err(api_error(
            "file_reveal_unavailable",
            "The file was moved or is no longer available at its saved location.",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || reveal_saved_file(&app, saved.path))
        .await
        .map_err(internal)?
}

pub(super) fn consume_saved_file_token(
    saved_files: &mut HashMap<String, SavedFileReveal>,
    reveal_token: &str,
    now: Instant,
) -> Option<SavedFileReveal> {
    if Uuid::parse_str(reveal_token).is_err() {
        return None;
    }
    saved_files.retain(|_, saved| now.duration_since(saved.saved_at) <= SAVED_FILE_REVEAL_TIMEOUT);
    saved_files.remove(reveal_token)
}

#[cfg(any(target_os = "macos", test))]
pub(super) fn consume_pending_pdf_export(
    pending_exports: &mut HashMap<String, PendingPdfExport>,
    save_token: &str,
    now: Instant,
) -> Option<PendingPdfExport> {
    if Uuid::parse_str(save_token).is_err() {
        return None;
    }
    pending_exports
        .retain(|_, pending| now.duration_since(pending.prepared_at) <= PENDING_PDF_EXPORT_TIMEOUT);
    pending_exports.remove(save_token)
}

#[cfg(target_os = "macos")]
fn reveal_saved_file(app: &AppHandle, path: PathBuf) -> ApiResult<()> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;
    use std::sync::mpsc::sync_channel;

    let parent = path
        .parent()
        .ok_or_else(|| internal("The saved file has no parent directory."))?
        .to_owned();
    let full_path = path.to_string_lossy().into_owned();
    let parent_path = parent.to_string_lossy().into_owned();
    let (sender, receiver) = sync_channel(1);
    app.run_on_main_thread(move || {
        let revealed = autoreleasepool(|_| {
            NSWorkspace::sharedWorkspace().selectFile_inFileViewerRootedAtPath(
                Some(&NSString::from_str(&full_path)),
                &NSString::from_str(&parent_path),
            )
        });
        let _ = sender.send(revealed);
    })
    .map_err(internal)?;
    if receiver.recv().map_err(internal)? {
        Ok(())
    } else {
        Err(api_error(
            "file_reveal_unavailable",
            "Finder could not reveal the saved file.",
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn reveal_saved_file(_app: &AppHandle, _path: PathBuf) -> ApiResult<()> {
    Err(api_error(
        "file_reveal_unavailable",
        "Showing saved files is not available on this platform yet.",
    ))
}

#[cfg(target_os = "macos")]
async fn capture_public_backup_pdf(
    window: WebviewWindow,
    width: f64,
    height: f64,
) -> ApiResult<Vec<u8>> {
    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::{WKPDFConfiguration, WKWebView};
    use std::sync::mpsc::sync_channel;

    if !width.is_finite()
        || !height.is_finite()
        || !(300.0..=2_000.0).contains(&width)
        || !(300.0..=4_000.0).contains(&height)
    {
        return Err(api_error(
            "invalid_backup",
            "The PDF backup has invalid page dimensions.",
        ));
    }

    let (sender, receiver) = sync_channel(1);
    window
        .with_webview(move |platform| unsafe {
            let webview: &WKWebView = &*platform.inner().cast();
            let configuration = WKPDFConfiguration::new(MainThreadMarker::new_unchecked());
            configuration.setRect(CGRect::new(CGPoint::ZERO, CGSize::new(width, height)));
            let completion = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
                let result = if let Some(data) = data.as_ref() {
                    Ok(data.to_vec())
                } else if let Some(error) = error.as_ref() {
                    Err(error.localizedDescription().to_string())
                } else {
                    Err("WebKit returned no PDF data.".to_owned())
                };
                let _ = sender.send(result);
            });
            webview.createPDFWithConfiguration_completionHandler(Some(&configuration), &completion);
        })
        .map_err(internal)?;

    let pdf = tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| api_error("backup_export_failed", "PDF export timed out."))?
            .map_err(|message| api_error("backup_export_failed", message))
    })
    .await
    .map_err(internal)??;
    if pdf.len() > MAX_PUBLIC_BACKUP_PDF_BYTES || !pdf.starts_with(b"%PDF-") {
        return Err(api_error(
            "backup_export_failed",
            "WebKit returned an invalid PDF backup.",
        ));
    }
    Ok(pdf)
}

#[cfg(target_os = "macos")]
async fn render_public_backup_pdf(app: &AppHandle, markup: String) -> ApiResult<Vec<u8>> {
    use std::sync::mpsc::sync_channel;

    const PDF_WIDTH: f64 = 595.0;
    const PDF_HEIGHT: f64 = 842.0;

    if markup.is_empty() || markup.len() > MAX_PUBLIC_BACKUP_PDF_HTML_BYTES {
        return Err(api_error(
            "invalid_backup",
            "The PDF backup has invalid document content.",
        ));
    }

    let encoded_markup = serde_json::to_string(&markup).map_err(internal)?;
    let initialization_script = format!(
        "window.addEventListener('DOMContentLoaded',()=>{{document.body.innerHTML={encoded_markup};}});"
    );
    let (sender, receiver) = sync_channel(1);
    let label = format!("public-backup-pdf-{}", Uuid::new_v4());
    let renderer = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App("pdf-backup-renderer.html".into()),
    )
    .title("Groot PDF renderer")
    .inner_size(PDF_WIDTH, PDF_HEIGHT)
    .min_inner_size(PDF_WIDTH, PDF_HEIGHT)
    .max_inner_size(PDF_WIDTH, PDF_HEIGHT)
    .visible(false)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .initialization_script(initialization_script)
    .on_page_load(move |_window, payload| {
        if matches!(payload.event(), PageLoadEvent::Finished) {
            let _ = sender.try_send(());
        }
    })
    .build()
    .map_err(internal)?;

    let loaded = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(10)).map_err(|_| {
            api_error(
                "backup_export_failed",
                "The isolated PDF renderer timed out.",
            )
        })
    })
    .await
    .map_err(internal)?;
    if let Err(error) = loaded {
        let _ = renderer.close();
        return Err(error);
    }

    let result = capture_public_backup_pdf(renderer.clone(), PDF_WIDTH, PDF_HEIGHT).await;
    let _ = renderer.close();
    result
}

#[cfg(target_os = "macos")]
pub async fn public_backup_pdf_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_filename: String,
) -> ApiResult<PendingPdfExportDto> {
    let filename = validate_public_backup_pdf_filename(&suggested_filename)?.to_owned();
    let selected_path = tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("PDF wallet backup", &["pdf"])
            .blocking_save_file();
        selected
            .map(|path| path.into_path().map_err(internal))
            .transpose()
    })
    .await
    .map_err(internal)??;
    let Some(path) = selected_path else {
        return Ok(PendingPdfExportDto {
            prepared: false,
            save_token: None,
        });
    };

    let token = Uuid::new_v4().to_string();
    let now = Instant::now();
    let mut pending_exports = state.pending_pdf_exports.lock().map_err(internal)?;
    pending_exports
        .retain(|_, pending| now.duration_since(pending.prepared_at) <= PENDING_PDF_EXPORT_TIMEOUT);
    if pending_exports.len() >= 4 {
        pending_exports.clear();
    }
    pending_exports.insert(
        token.clone(),
        PendingPdfExport {
            path,
            prepared_at: now,
        },
    );
    Ok(PendingPdfExportDto {
        prepared: true,
        save_token: Some(token),
    })
}

#[cfg(target_os = "macos")]
pub async fn public_backup_pdf_save(
    app: AppHandle,
    state: State<'_, AppState>,
    save_token: String,
    markup: String,
) -> ApiResult<SavedFileDto> {
    let pending = state
        .pending_pdf_exports
        .lock()
        .map_err(internal)
        .and_then(|mut pending_exports| {
            consume_pending_pdf_export(&mut pending_exports, &save_token, Instant::now())
                .ok_or_else(|| {
                    api_error(
                        "backup_export_failed",
                        "This PDF save request expired. Choose Save PDF again.",
                    )
                })
        })?;

    let pdf = render_public_backup_pdf(&app, markup).await?;
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        write_public_export(&pending.path, &pdf)?;
        Ok(pending.path)
    })
    .await
    .map_err(internal)??;
    saved_file_result(&state, Some(saved_path))
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
pub fn public_backup_pdf_prepare(
    window: WebviewWindow,
    _suggested_filename: String,
) -> ApiResult<PendingPdfExportDto> {
    window.print().map_err(internal)?;
    Ok(PendingPdfExportDto {
        prepared: false,
        save_token: None,
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn public_backup_pdf_prepare(_suggested_filename: String) -> ApiResult<PendingPdfExportDto> {
    Err(api_error(
        "backup_export_failed",
        "Native PDF printing is not available on mobile.",
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn public_backup_pdf_save(_save_token: String, _markup: String) -> ApiResult<SavedFileDto> {
    Err(api_error(
        "backup_export_failed",
        "Native PDF saving is not available on this platform.",
    ))
}
