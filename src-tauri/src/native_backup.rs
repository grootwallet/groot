use tauri::AppHandle;
#[cfg(not(target_os = "macos"))]
use zeroize::Zeroizing;

#[cfg(target_os = "macos")]
pub fn present(app: &AppHandle, words: &str) -> Result<bool, String> {
    macos::present(app, words)
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::{define_class, msg_send, rc::autoreleasepool, rc::Retained, sel, MainThreadMarker};
    use objc2_app_kit::{
        NSApplication, NSBackingStoreType, NSBezelStyle, NSBox, NSBoxType, NSButton, NSColor,
        NSFont, NSModalResponseCancel, NSModalResponseOK, NSPanel, NSTextField, NSTitlePosition,
        NSView, NSWindow, NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use std::sync::mpsc::sync_channel;
    use tauri::{AppHandle, Manager};
    use zeroize::Zeroizing;

    const WIDTH: f64 = 720.0;
    const HEIGHT: f64 = 670.0;

    struct BackupViewIvars;

    define_class!(
        #[unsafe(super(NSView))]
        #[name = "SatchelRecoveryBackupView"]
        #[ivars = BackupViewIvars]
        struct BackupView;

        impl BackupView {
            #[unsafe(method(confirmBackup:))]
            fn confirm_backup(&self, _sender: &NSButton) {
                NSApplication::sharedApplication(MainThreadMarker::from(self))
                    .stopModalWithCode(NSModalResponseOK);
            }

            #[unsafe(method(cancelBackup:))]
            fn cancel_backup(&self, _sender: &NSButton) {
                NSApplication::sharedApplication(MainThreadMarker::from(self))
                    .stopModalWithCode(NSModalResponseCancel);
            }
        }
    );

    pub(super) fn present(app: &AppHandle, words: &str) -> Result<bool, String> {
        let words = words
            .split_whitespace()
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        if words.len() != 24 {
            return Err("Native backup requires exactly 24 recovery words.".to_owned());
        }
        let words = Zeroizing::new(words);
        let app = app.clone();
        let (sender, receiver) = sync_channel(1);

        app.clone()
            .run_on_main_thread(move || {
                autoreleasepool(|_| {
                    let Some(mtm) = MainThreadMarker::new() else {
                        let _ =
                            sender.send(Err("Native backup must run on the main thread.".into()));
                        return;
                    };
                    let Some(window) = app.get_webview_window("main") else {
                        let _ = sender.send(Err("Satchel's main window is unavailable.".into()));
                        return;
                    };
                    let Ok(raw_window) = window.ns_window() else {
                        let _ = sender.send(Err("Satchel's native window is unavailable.".into()));
                        return;
                    };

                    // Tauri owns this NSWindow for the application lifetime.
                    let parent = unsafe { &*(raw_window.cast::<NSWindow>()) };
                    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
                        mtm.alloc(),
                        rect(0.0, 0.0, WIDTH, HEIGHT),
                        NSWindowStyleMask::Titled | NSWindowStyleMask::FullSizeContentView,
                        NSBackingStoreType::Buffered,
                        false,
                    );
                    panel.setTitlebarAppearsTransparent(true);
                    panel.setBackgroundColor(Some(&NSColor::windowBackgroundColor()));
                    panel.setHasShadow(true);
                    panel.setMovableByWindowBackground(false);

                    let allocated = mtm.alloc().set_ivars(BackupViewIvars);
                    let root: Retained<BackupView> = unsafe {
                        msg_send![super(allocated), initWithFrame: rect(0.0, 0.0, WIDTH, HEIGHT)]
                    };
                    panel.setContentView(Some(&root));

                    add_label(
                        &root,
                        "STEP 2 OF 3",
                        rect(42.0, 606.0, 620.0, 18.0),
                        &NSFont::systemFontOfSize_weight(11.0, 0.35),
                        &NSColor::systemBlueColor(),
                        mtm,
                    );
                    add_label(
                        &root,
                        "Recovery words",
                        rect(42.0, 550.0, 620.0, 44.0),
                        &NSFont::systemFontOfSize_weight(34.0, 0.4),
                        &NSColor::labelColor(),
                        mtm,
                    );
                    add_label(
                        &root,
                        "Write these down in order. Keep them offline.",
                        rect(42.0, 520.0, 620.0, 24.0),
                        &NSFont::systemFontOfSize_weight(15.0, 0.0),
                        &NSColor::secondaryLabelColor(),
                        mtm,
                    );

                    for index in 0..24 {
                        let column = index % 3;
                        let row = index / 3;
                        add_word_card(
                            &root,
                            index + 1,
                            &words[index],
                            rect(
                                42.0 + column as f64 * 218.0,
                                458.0 - row as f64 * 49.0,
                                202.0,
                                39.0,
                            ),
                            mtm,
                        );
                    }

                    add_label(
                        &root,
                        "Anyone with these words can spend your bitcoin.",
                        rect(42.0, 49.0, 350.0, 20.0),
                        &NSFont::systemFontOfSize_weight(11.0, 0.0),
                        &NSColor::secondaryLabelColor(),
                        mtm,
                    );

                    let cancel = unsafe {
                        NSButton::buttonWithTitle_target_action(
                            &NSString::from_str("Cancel"),
                            Some(&root),
                            Some(sel!(cancelBackup:)),
                            mtm,
                        )
                    };
                    cancel.setFrame(rect(410.0, 36.0, 110.0, 38.0));
                    cancel.setBezelStyle(NSBezelStyle::Push);
                    root.addSubview(&cancel);

                    let confirm = unsafe {
                        NSButton::buttonWithTitle_target_action(
                            &NSString::from_str("I wrote them down"),
                            Some(&root),
                            Some(sel!(confirmBackup:)),
                            mtm,
                        )
                    };
                    confirm.setFrame(rect(526.0, 36.0, 152.0, 38.0));
                    confirm.setBezelStyle(NSBezelStyle::Push);
                    confirm.setBezelColor(Some(&NSColor::systemBlueColor()));
                    confirm.setKeyEquivalent(&NSString::from_str("\r"));
                    root.addSubview(&confirm);

                    parent.beginSheet_completionHandler(&panel, None);
                    let response = NSApplication::sharedApplication(mtm).runModalForWindow(&panel);
                    parent.endSheet_returnCode(&panel, response);
                    let _ = sender.send(Ok(response == NSModalResponseOK));
                });
            })
            .map_err(|error| error.to_string())?;

        receiver
            .recv()
            .map_err(|_| "Native recovery-word presentation closed unexpectedly.".to_owned())?
    }

    fn add_word_card(
        root: &BackupView,
        number: usize,
        word: &str,
        frame: NSRect,
        mtm: MainThreadMarker,
    ) {
        let card = NSBox::initWithFrame(mtm.alloc(), frame);
        card.setBoxType(NSBoxType::Custom);
        card.setTitlePosition(NSTitlePosition::NoTitle);
        card.setBorderWidth(1.0);
        card.setBorderColor(&NSColor::separatorColor());
        card.setFillColor(&NSColor::controlBackgroundColor());
        card.setCornerRadius(7.0);

        add_label(
            &card,
            &number.to_string(),
            rect(11.0, 10.0, 24.0, 18.0),
            &NSFont::monospacedSystemFontOfSize_weight(12.0, 0.0),
            &NSColor::secondaryLabelColor(),
            mtm,
        );
        add_label(
            &card,
            word,
            rect(38.0, 8.0, 150.0, 21.0),
            &NSFont::monospacedSystemFontOfSize_weight(14.0, 0.25),
            &NSColor::labelColor(),
            mtm,
        );
        root.addSubview(&card);
    }

    fn add_label(
        parent: &NSView,
        text: &str,
        frame: NSRect,
        font: &NSFont,
        color: &NSColor,
        mtm: MainThreadMarker,
    ) {
        let label = NSTextField::labelWithString(&NSString::from_str(text), mtm);
        label.setFrame(frame);
        label.setFont(Some(font));
        label.setTextColor(Some(color));
        parent.addSubview(&label);
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn present(app: &AppHandle, words: &str) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let display = Zeroizing::new(format_words(words)?);
    Ok(app
        .dialog()
        .message(format!(
            "Write these 24 words down in order. Keep them offline.\n\n{}\n\nSatchel cannot recover these words for you.",
            display.as_str()
        ))
        .title("Satchel recovery words")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "I wrote them down".to_owned(),
            "Cancel".to_owned(),
        ))
        .blocking_show())
}

#[cfg(any(not(target_os = "macos"), test))]
fn format_words(words: &str) -> Result<String, String> {
    let words = words.split_whitespace().collect::<Vec<_>>();
    if words.len() != 24 {
        return Err("Native backup requires exactly 24 recovery words.".to_owned());
    }

    Ok((0..8)
        .map(|row| {
            [row, row + 8, row + 16]
                .into_iter()
                .map(|index| format!("{:>2}. {:<8}", index + 1, words[index]))
                .collect::<Vec<_>>()
                .join("     ")
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

#[cfg(test)]
mod tests {
    use super::format_words;

    #[test]
    fn recovery_words_are_formatted_as_an_eight_by_three_grid() {
        let words = (1..=24)
            .map(|index| format!("word{index}"))
            .collect::<Vec<_>>()
            .join(" ");
        let formatted = format_words(&words).expect("valid words");
        let rows = formatted.lines().collect::<Vec<_>>();

        assert_eq!(rows.len(), 8);
        assert!(rows[0].contains(" 1. word1"));
        assert!(rows[0].contains(" 9. word9"));
        assert!(rows[0].contains("17. word17"));
        assert!(rows[7].contains("24. word24"));
    }

    #[test]
    fn recovery_word_grid_rejects_the_wrong_word_count() {
        assert!(format_words("one two three").is_err());
    }
}
