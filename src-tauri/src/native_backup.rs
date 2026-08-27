use tauri::AppHandle;
use zeroize::Zeroizing;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackupOutcome {
    pub cancelled: bool,
    pub verified: bool,
}

#[cfg(target_os = "macos")]
pub fn present(app: &AppHandle, words: &str) -> Result<BackupOutcome, String> {
    macos::present(app, words)
}

#[cfg(target_os = "macos")]
pub fn verify(app: &AppHandle, words: &str) -> Result<bool, String> {
    macos::verify(app, words)
}

#[cfg(target_os = "macos")]
pub fn recover(app: &AppHandle) -> Result<Option<Zeroizing<String>>, String> {
    macos::recover(app)
}

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "ios")]
pub fn present(_app: &AppHandle, words: &str) -> Result<BackupOutcome, String> {
    use std::ffi::c_char;

    if words.split_whitespace().count() != 24 || words.as_bytes().contains(&0) {
        return Err("Native backup requires exactly 24 recovery words.".to_owned());
    }
    let mut payload = Zeroizing::new(words.as_bytes().to_vec());
    payload.push(0);
    unsafe extern "C" {
        fn groot_present_ios_recovery_words(words_utf8: *const c_char) -> i32;
    }
    // SAFETY: The Objective-C boundary copies this bounded, NUL-terminated UTF-8
    // string before returning. The backing bytes remain alive for the call and
    // are zeroized immediately afterward.
    match unsafe { groot_present_ios_recovery_words(payload.as_ptr().cast()) } {
        1 => Ok(BackupOutcome {
            cancelled: false,
            verified: false,
        }),
        0 => Ok(BackupOutcome {
            cancelled: true,
            verified: false,
        }),
        _ => Err("The native iOS recovery sheet could not be presented.".to_owned()),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
pub fn present(app: &AppHandle, words: &str) -> Result<BackupOutcome, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let reveal = app
        .dialog()
        .message("Only continue in a private place. Make sure no person, camera, or screen sharing can see your recovery words.")
        .title("Check your surroundings")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "I'm private. Reveal words".to_owned(),
            "Cancel".to_owned(),
        ))
        .blocking_show();
    if !reveal {
        return Ok(BackupOutcome {
            cancelled: true,
            verified: false,
        });
    }

    let display = Zeroizing::new(format_words(words)?);
    Ok(if app
        .dialog()
        .message(format!(
            "Write these 24 words down in order. Keep them offline.\n\n{}\n\nGroot cannot recover these words for you.",
            display.as_str()
        ))
        .title("Groot recovery words")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "I wrote them down".to_owned(),
            "Cancel".to_owned(),
        ))
        .blocking_show()
    {
        BackupOutcome {
            cancelled: false,
            verified: false,
        }
    } else {
        BackupOutcome {
            cancelled: true,
            verified: false,
        }
    })
}

#[cfg(not(target_os = "macos"))]
pub fn verify(_app: &AppHandle, _words: &str) -> Result<bool, String> {
    Err("Recovery-word verification is not yet available on this platform.".to_owned())
}

#[cfg(not(target_os = "macos"))]
pub fn recover(_app: &AppHandle) -> Result<Option<Zeroizing<String>>, String> {
    Err("Native recovery-word entry is not yet available on this platform.".to_owned())
}

#[cfg(any(not(any(target_os = "macos", target_os = "ios")), test))]
fn format_words(words: &str) -> Result<String, String> {
    let words = words.split_whitespace().collect::<Vec<_>>();
    if words.len() != 24 {
        return Err("Native backup requires exactly 24 recovery words.".to_owned());
    }

    // Platforms without a dedicated native grid use a sequential list because
    // their generic alert font cannot align space-padded columns reliably.
    Ok(words
        .iter()
        .enumerate()
        .map(|(index, word)| format!("{}. {}", index + 1, word))
        .collect::<Vec<_>>()
        .join("\n"))
}

#[cfg(test)]
mod tests {
    use super::format_words;

    #[test]
    fn recovery_words_are_formatted_as_an_unambiguous_sequential_list() {
        let words = (1..=24)
            .map(|index| format!("word{index}"))
            .collect::<Vec<_>>()
            .join(" ");
        let formatted = format_words(&words).expect("valid words");
        let rows = formatted.lines().collect::<Vec<_>>();

        assert_eq!(rows.len(), 24);
        assert_eq!(rows[0], "1. word1");
        assert_eq!(rows[8], "9. word9");
        assert_eq!(rows[16], "17. word17");
        assert_eq!(rows[23], "24. word24");
    }

    #[test]
    fn recovery_word_grid_rejects_the_wrong_word_count() {
        assert!(format_words("one two three").is_err());
    }
}
