use super::BackupOutcome;
use objc2::{
    define_class, msg_send, rc::autoreleasepool, rc::Retained, sel, DefinedClass, MainThreadMarker,
};
use objc2_app_kit::{
    NSApplication, NSBackingStoreType, NSBezelStyle, NSBox, NSBoxType, NSButton, NSColor, NSFont,
    NSModalResponseCancel, NSModalResponseOK, NSPanel, NSTextAlignment, NSTextField,
    NSTitlePosition, NSView, NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use rand::seq::SliceRandom;
use std::{cell::RefCell, sync::mpsc::sync_channel};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

const HEIGHT: f64 = 670.0;

struct BackupViewIvars;

struct VerificationState {
    words: Zeroizing<Vec<String>>,
    selected: Vec<usize>,
    pool_buttons: Vec<(usize, Retained<NSButton>)>,
    slot_buttons: Vec<Retained<NSButton>>,
    confirm_button: Option<Retained<NSButton>>,
    error_label: Option<Retained<NSTextField>>,
}

struct VerificationViewIvars {
    state: RefCell<VerificationState>,
}

struct RecoveryInputViewIvars {
    field: RefCell<Option<Retained<NSTextField>>>,
    error_label: RefCell<Option<Retained<NSTextField>>>,
}

define_class!(
    #[unsafe(super(NSView))]
    #[name = "GrootRecoveryBackupView"]
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

        #[unsafe(method(revealBackup:))]
        fn reveal_backup(&self, _sender: &NSButton) {
            NSApplication::sharedApplication(MainThreadMarker::from(self))
                .stopModalWithCode(NSModalResponseOK);
        }
    }
);

define_class!(
    #[unsafe(super(NSView))]
    #[name = "GrootRecoveryInputView"]
    #[ivars = RecoveryInputViewIvars]
    struct RecoveryInputView;

    impl RecoveryInputView {
        #[unsafe(method(confirmRecovery:))]
        fn confirm_recovery(&self, _sender: &NSButton) {
            let words = self
                .ivars()
                .field
                .borrow()
                .as_ref()
                .map(|field| field.stringValue().to_string())
                .unwrap_or_default();
            if words.split_whitespace().count() == 24 {
                NSApplication::sharedApplication(MainThreadMarker::from(self))
                    .stopModalWithCode(NSModalResponseOK);
            } else if let Some(label) = self.ivars().error_label.borrow().as_ref() {
                label.setStringValue(&NSString::from_str(
                    "Enter exactly 24 recovery words, separated by spaces.",
                ));
            }
        }

        #[unsafe(method(cancelRecovery:))]
        fn cancel_recovery(&self, _sender: &NSButton) {
            NSApplication::sharedApplication(MainThreadMarker::from(self))
                .stopModalWithCode(NSModalResponseCancel);
        }
    }
);

define_class!(
    #[unsafe(super(NSView))]
    #[name = "GrootRecoveryVerificationView"]
    #[ivars = VerificationViewIvars]
    struct VerificationView;

    impl VerificationView {
        #[unsafe(method(selectWord:))]
        fn select_word(&self, sender: &NSButton) {
            let index = sender.tag() as usize;
            let mut state = self.ivars().state.borrow_mut();
            if !state.selected.contains(&index) {
                state.selected.push(index);
            }
            drop(state);
            update_verification(self);
        }

        #[unsafe(method(removeWord:))]
        fn remove_word(&self, sender: &NSButton) {
            let position = sender.tag() as usize;
            let mut state = self.ivars().state.borrow_mut();
            if position < state.selected.len() {
                state.selected.remove(position);
            }
            drop(state);
            update_verification(self);
        }

        #[unsafe(method(confirmOrder:))]
        fn confirm_order(&self, _sender: &NSButton) {
            let state = self.ivars().state.borrow();
            if state.selected.iter().copied().eq(0..state.words.len()) {
                NSApplication::sharedApplication(MainThreadMarker::from(self))
                    .stopModalWithCode(NSModalResponseOK);
            } else if let Some(label) = &state.error_label {
                label.setStringValue(&NSString::from_str(
                    "That order does not match. Check your written backup and correct the sequence.",
                ));
            }
        }

        #[unsafe(method(cancelVerification:))]
        fn cancel_verification(&self, _sender: &NSButton) {
            NSApplication::sharedApplication(MainThreadMarker::from(self))
                .stopModalWithCode(NSModalResponseCancel);
        }
    }
);

pub(super) fn present(app: &AppHandle, words: &str) -> Result<BackupOutcome, String> {
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
                    let _ = sender.send(Err("Native backup must run on the main thread.".into()));
                    return;
                };
                let Some(window) = app.get_webview_window("main") else {
                    let _ = sender.send(Err("Groot's main window is unavailable.".into()));
                    return;
                };
                let Ok(raw_window) = window.ns_window() else {
                    let _ = sender.send(Err("Groot's native window is unavailable.".into()));
                    return;
                };

                // Tauri owns this NSWindow for the application lifetime.
                let parent = unsafe { &*(raw_window.cast::<NSWindow>()) };
                if !confirm_private_reveal(parent, mtm) {
                    let _ = sender.send(Ok(BackupOutcome {
                        cancelled: true,
                        verified: false,
                    }));
                    return;
                }
                let width = sheet_width(parent, 720.0);
                let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
                    mtm.alloc(),
                    rect(0.0, 0.0, width, HEIGHT),
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
                    msg_send![super(allocated), initWithFrame: rect(0.0, 0.0, width, HEIGHT)]
                };
                panel.setContentView(Some(&root));

                add_label(
                    &root,
                    "STEP 2 OF 3",
                    rect(32.0, 606.0, width - 64.0, 18.0),
                    &NSFont::systemFontOfSize_weight(11.0, 0.35),
                    &brand_red(),
                    mtm,
                );
                add_label(
                    &root,
                    "Recovery words",
                    rect(32.0, 550.0, width - 64.0, 44.0),
                    &NSFont::systemFontOfSize_weight(34.0, 0.4),
                    &NSColor::labelColor(),
                    mtm,
                );
                add_label(
                    &root,
                    "Write these down in order. Keep them offline.",
                    rect(32.0, 520.0, width - 64.0, 24.0),
                    &NSFont::systemFontOfSize_weight(15.0, 0.0),
                    &NSColor::secondaryLabelColor(),
                    mtm,
                );

                let card_gap = 10.0;
                let card_width = (width - 64.0 - card_gap * 2.0) / 3.0;
                for index in 0..24 {
                    let column = index / 8;
                    let row = index % 8;
                    add_word_card(
                        &root,
                        index + 1,
                        &words[index],
                        rect(
                            32.0 + column as f64 * (card_width + card_gap),
                            458.0 - row as f64 * 49.0,
                            card_width,
                            39.0,
                        ),
                        mtm,
                    );
                }

                add_label(
                    &root,
                    "Anyone with these words can spend your bitcoin.",
                    rect(32.0, 49.0, (width - 326.0).max(120.0), 20.0),
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
                confirm.setBezelStyle(NSBezelStyle::Push);
                confirm.setBezelColor(Some(&NSColor::systemBlueColor()));
                confirm.setKeyEquivalent(&NSString::from_str("\r"));
                layout_trailing_actions(&cancel, &confirm, width, 36.0, 140.0);
                root.addSubview(&confirm);

                parent.beginSheet_completionHandler(&panel, None);
                let response = NSApplication::sharedApplication(mtm).runModalForWindow(&panel);
                parent.endSheet_returnCode(&panel, response);
                if response != NSModalResponseOK {
                    let _ = sender.send(Ok(BackupOutcome {
                        cancelled: true,
                        verified: false,
                    }));
                    return;
                }
                let verified = verify_backup_order(parent, &words, mtm);
                let _ = sender.send(Ok(BackupOutcome {
                    cancelled: false,
                    verified,
                }));
            });
        })
        .map_err(|error| error.to_string())?;

    receiver
        .recv()
        .map_err(|_| "Native recovery-word presentation closed unexpectedly.".to_owned())?
}

pub(super) fn verify(app: &AppHandle, words: &str) -> Result<bool, String> {
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
                    let _ = sender.send(Err("Native backup must run on the main thread.".into()));
                    return;
                };
                let Some(window) = app.get_webview_window("main") else {
                    let _ = sender.send(Err("Groot's main window is unavailable.".into()));
                    return;
                };
                let Ok(raw_window) = window.ns_window() else {
                    let _ = sender.send(Err("Groot's native window is unavailable.".into()));
                    return;
                };

                // Tauri owns this NSWindow for the application lifetime.
                let parent = unsafe { &*(raw_window.cast::<NSWindow>()) };
                let _ = sender.send(Ok(verify_backup_order(parent, &words, mtm)));
            });
        })
        .map_err(|error| error.to_string())?;

    receiver
        .recv()
        .map_err(|_| "Native recovery-word verification closed unexpectedly.".to_owned())?
}

pub(super) fn recover(app: &AppHandle) -> Result<Option<Zeroizing<String>>, String> {
    let app = app.clone();
    let (sender, receiver) = sync_channel(1);
    app.clone()
        .run_on_main_thread(move || {
            autoreleasepool(|_| {
                let Some(mtm) = MainThreadMarker::new() else {
                    let _ = sender.send(Err("Native recovery must run on the main thread.".into()));
                    return;
                };
                let Some(window) = app.get_webview_window("main") else {
                    let _ = sender.send(Err("Groot's main window is unavailable.".into()));
                    return;
                };
                let Ok(raw_window) = window.ns_window() else {
                    let _ = sender.send(Err("Groot's native window is unavailable.".into()));
                    return;
                };
                let parent = unsafe { &*(raw_window.cast::<NSWindow>()) };
                let width = sheet_width(parent, 660.0);
                let height = 340.0;
                let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
                    mtm.alloc(),
                    rect(0.0, 0.0, width, height),
                    NSWindowStyleMask::Titled | NSWindowStyleMask::FullSizeContentView,
                    NSBackingStoreType::Buffered,
                    false,
                );
                panel.setTitlebarAppearsTransparent(true);
                panel.setBackgroundColor(Some(&NSColor::windowBackgroundColor()));
                panel.setHasShadow(true);

                let allocated = mtm.alloc().set_ivars(RecoveryInputViewIvars {
                    field: RefCell::new(None),
                    error_label: RefCell::new(None),
                });
                let root: Retained<RecoveryInputView> = unsafe {
                    msg_send![super(allocated), initWithFrame: rect(0.0, 0.0, width, height)]
                };
                panel.setContentView(Some(&root));
                add_label(
                    &root,
                    "RECOVER SOFTWARE WALLET",
                    rect(28.0, 278.0, width - 56.0, 18.0),
                    &NSFont::systemFontOfSize_weight(11.0, 0.35),
                    &brand_red(),
                    mtm,
                );
                add_label(
                    &root,
                    "Enter your recovery words",
                    rect(28.0, 234.0, width - 56.0, 34.0),
                    &NSFont::systemFontOfSize_weight(24.0, 0.4),
                    &NSColor::labelColor(),
                    mtm,
                );
                add_label(
                    &root,
                    "The 24 words stay in this native window and never enter Groot's web interface.",
                    rect(28.0, 204.0, width - 56.0, 22.0),
                    &NSFont::systemFontOfSize_weight(12.0, 0.0),
                    &NSColor::secondaryLabelColor(),
                    mtm,
                );
                let field = NSTextField::textFieldWithString(&NSString::from_str(""), mtm);
                field.setFrame(rect(28.0, 121.0, width - 56.0, 68.0));
                field.setMaximumNumberOfLines(3);
                field.setPlaceholderString(Some(&NSString::from_str(
                    "word1 word2 word3 … word24",
                )));
                root.addSubview(&field);
                let error = add_label(
                    &root,
                    "",
                    rect(28.0, 88.0, width - 56.0, 22.0),
                    &NSFont::systemFontOfSize_weight(11.0, 0.0),
                    &NSColor::systemRedColor(),
                    mtm,
                );
                *root.ivars().field.borrow_mut() = Some(field);
                *root.ivars().error_label.borrow_mut() = Some(error);

                let cancel = unsafe {
                    NSButton::buttonWithTitle_target_action(
                        &NSString::from_str("Cancel"),
                        Some(&root),
                        Some(sel!(cancelRecovery:)),
                        mtm,
                    )
                };
                cancel.setBezelStyle(NSBezelStyle::Push);
                root.addSubview(&cancel);
                let confirm = unsafe {
                    NSButton::buttonWithTitle_target_action(
                        &NSString::from_str("Use recovery words"),
                        Some(&root),
                        Some(sel!(confirmRecovery:)),
                        mtm,
                    )
                };
                confirm.setBezelStyle(NSBezelStyle::Push);
                confirm.setBezelColor(Some(&NSColor::systemBlueColor()));
                confirm.setKeyEquivalent(&NSString::from_str("\r"));
                layout_trailing_actions(&cancel, &confirm, width, 30.0, 155.0);
                root.addSubview(&confirm);

                parent.beginSheet_completionHandler(&panel, None);
                let response = NSApplication::sharedApplication(mtm).runModalForWindow(&panel);
                parent.endSheet_returnCode(&panel, response);
                if response != NSModalResponseOK {
                    let _ = sender.send(Ok(None));
                    return;
                }
                let words = root
                    .ivars()
                    .field
                    .borrow()
                    .as_ref()
                    .map(|field| field.stringValue().to_string())
                    .unwrap_or_default();
                let _ = sender.send(Ok(Some(Zeroizing::new(words))));
            });
        })
        .map_err(|error| error.to_string())?;
    receiver
        .recv()
        .map_err(|_| "Native recovery entry closed unexpectedly.".to_owned())?
}

fn confirm_private_reveal(parent: &NSWindow, mtm: MainThreadMarker) -> bool {
    let width = sheet_width(parent, 520.0);
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        mtm.alloc(),
        rect(0.0, 0.0, width, 286.0),
        NSWindowStyleMask::Titled | NSWindowStyleMask::FullSizeContentView,
        NSBackingStoreType::Buffered,
        false,
    );
    panel.setTitlebarAppearsTransparent(true);
    panel.setBackgroundColor(Some(&NSColor::windowBackgroundColor()));
    panel.setHasShadow(true);
    panel.setMovableByWindowBackground(false);

    let allocated = mtm.alloc().set_ivars(BackupViewIvars);
    let root: Retained<BackupView> =
        unsafe { msg_send![super(allocated), initWithFrame: rect(0.0, 0.0, width, 286.0)] };
    panel.setContentView(Some(&root));

    add_label(
        &root,
        "BEFORE YOU REVEAL",
        rect(28.0, 225.0, width - 56.0, 18.0),
        &NSFont::systemFontOfSize_weight(11.0, 0.35),
        &brand_red(),
        mtm,
    );
    add_label(
        &root,
        "Check your surroundings",
        rect(28.0, 181.0, width - 56.0, 34.0),
        &NSFont::systemFontOfSize_weight(24.0, 0.4),
        &NSColor::labelColor(),
        mtm,
    );
    add_label(
        &root,
        "Only continue in a private place.",
        rect(28.0, 149.0, width - 56.0, 22.0),
        &NSFont::systemFontOfSize_weight(14.0, 0.15),
        &NSColor::labelColor(),
        mtm,
    );
    add_label(
        &root,
        "Make sure no person, camera, or screen sharing can see your recovery words.",
        rect(28.0, 108.0, width - 56.0, 38.0),
        &NSFont::systemFontOfSize_weight(12.0, 0.0),
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
    cancel.setBezelStyle(NSBezelStyle::Push);
    root.addSubview(&cancel);

    let reveal = unsafe {
        NSButton::buttonWithTitle_target_action(
            &NSString::from_str("I'm private — reveal words"),
            Some(&root),
            Some(sel!(revealBackup:)),
            mtm,
        )
    };
    reveal.setBezelStyle(NSBezelStyle::Push);
    reveal.setBezelColor(Some(&NSColor::systemBlueColor()));
    reveal.setKeyEquivalent(&NSString::from_str("\r"));
    layout_trailing_actions(&cancel, &reveal, width, 40.0, 170.0);
    root.addSubview(&reveal);

    parent.beginSheet_completionHandler(&panel, None);
    let response = NSApplication::sharedApplication(mtm).runModalForWindow(&panel);
    parent.endSheet_returnCode(&panel, response);
    response == NSModalResponseOK
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

    let number_label = add_centered_card_label(
        &card,
        &number.to_string(),
        rect(8.0, 0.0, 22.0, frame.size.height),
        &NSFont::monospacedSystemFontOfSize_weight(12.0, 0.0),
        &NSColor::secondaryLabelColor(),
        mtm,
    );
    number_label.setAlignment(NSTextAlignment(2));
    add_centered_card_label(
        &card,
        word,
        rect(37.0, 0.0, frame.size.width - 45.0, frame.size.height),
        &NSFont::monospacedSystemFontOfSize_weight(12.0, 0.25),
        &NSColor::labelColor(),
        mtm,
    );
    root.addSubview(&card);
}

fn add_centered_card_label(
    parent: &NSView,
    text: &str,
    frame: NSRect,
    font: &NSFont,
    color: &NSColor,
    mtm: MainThreadMarker,
) -> Retained<NSTextField> {
    let label = add_label(parent, text, frame, font, color, mtm);
    label.sizeToFit();
    let label_height = label.frame().size.height.min(frame.size.height);
    label.setFrame(rect(
        frame.origin.x,
        (frame.size.height - label_height) / 2.0,
        frame.size.width,
        label_height,
    ));
    label
}

fn verify_backup_order(parent: &NSWindow, words: &[String], mtm: MainThreadMarker) -> bool {
    let width = sheet_width(parent, 720.0);
    let height = 690.0;
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        mtm.alloc(),
        rect(0.0, 0.0, width, height),
        NSWindowStyleMask::Titled | NSWindowStyleMask::FullSizeContentView,
        NSBackingStoreType::Buffered,
        false,
    );
    panel.setTitlebarAppearsTransparent(true);
    panel.setBackgroundColor(Some(&NSColor::windowBackgroundColor()));
    panel.setHasShadow(true);

    let state = VerificationState {
        words: Zeroizing::new(words.to_vec()),
        selected: Vec::with_capacity(24),
        pool_buttons: Vec::with_capacity(24),
        slot_buttons: Vec::with_capacity(24),
        confirm_button: None,
        error_label: None,
    };
    let allocated = mtm.alloc().set_ivars(VerificationViewIvars {
        state: RefCell::new(state),
    });
    let root: Retained<VerificationView> =
        unsafe { msg_send![super(allocated), initWithFrame: rect(0.0, 0.0, width, height)] };
    panel.setContentView(Some(&root));

    add_label(
        &root,
        "CONFIRM YOUR BACKUP",
        rect(28.0, 632.0, width - 56.0, 18.0),
        &NSFont::systemFontOfSize_weight(11.0, 0.35),
        &brand_red(),
        mtm,
    );
    add_label(
        &root,
        "Put all 24 words in order",
        rect(28.0, 590.0, width - 56.0, 34.0),
        &NSFont::systemFontOfSize_weight(24.0, 0.4),
        &NSColor::labelColor(),
        mtm,
    );
    add_label(
        &root,
        "Tap a shuffled word to place it. Tap a placed word to return it.",
        rect(28.0, 563.0, width - 56.0, 22.0),
        &NSFont::systemFontOfSize_weight(12.0, 0.0),
        &NSColor::secondaryLabelColor(),
        mtm,
    );

    let gap = 6.0;
    let slot_width = (width - 56.0 - gap * 2.0) / 3.0;
    for position in 0..24 {
        let column = position / 8;
        let row = position % 8;
        let button = unsafe {
            NSButton::buttonWithTitle_target_action(
                &NSString::from_str(&format!("{}. Empty", position + 1)),
                Some(&root),
                Some(sel!(removeWord:)),
                mtm,
            )
        };
        button.setTag(position as isize);
        button.setFrame(rect(
            28.0 + column as f64 * (slot_width + gap),
            520.0 - row as f64 * 31.0,
            slot_width,
            26.0,
        ));
        button.setBezelStyle(NSBezelStyle::Push);
        button.setEnabled(false);
        root.addSubview(&button);
        root.ivars().state.borrow_mut().slot_buttons.push(button);
    }

    add_label(
        &root,
        "SHUFFLED WORDS",
        rect(28.0, 267.0, width - 56.0, 18.0),
        &NSFont::systemFontOfSize_weight(10.0, 0.3),
        &NSColor::secondaryLabelColor(),
        mtm,
    );
    let mut shuffled = (0..24).collect::<Vec<_>>();
    shuffled.shuffle(&mut rand::thread_rng());
    let pool_columns = 4;
    let pool_rows = 24 / pool_columns;
    let pool_width = (width - 56.0 - gap * (pool_columns - 1) as f64) / pool_columns as f64;
    for (display_index, word_index) in shuffled.into_iter().enumerate() {
        let column = display_index / pool_rows;
        let row = display_index % pool_rows;
        let button = unsafe {
            NSButton::buttonWithTitle_target_action(
                &NSString::from_str(&words[word_index]),
                Some(&root),
                Some(sel!(selectWord:)),
                mtm,
            )
        };
        button.setTag(word_index as isize);
        button.setFrame(rect(
            28.0 + column as f64 * (pool_width + gap),
            237.0 - row as f64 * 30.0,
            pool_width,
            25.0,
        ));
        button.setBezelStyle(NSBezelStyle::Push);
        root.addSubview(&button);
        root.ivars()
            .state
            .borrow_mut()
            .pool_buttons
            .push((word_index, button));
    }

    let error = add_label(
        &root,
        "",
        rect(28.0, 80.0, width - 56.0, 24.0),
        &NSFont::systemFontOfSize_weight(10.0, 0.0),
        &NSColor::systemRedColor(),
        mtm,
    );
    let cancel = unsafe {
        NSButton::buttonWithTitle_target_action(
            &NSString::from_str("Verify later"),
            Some(&root),
            Some(sel!(cancelVerification:)),
            mtm,
        )
    };
    cancel.setBezelStyle(NSBezelStyle::Push);
    root.addSubview(&cancel);
    let confirm = unsafe {
        NSButton::buttonWithTitle_target_action(
            &NSString::from_str("Confirm order"),
            Some(&root),
            Some(sel!(confirmOrder:)),
            mtm,
        )
    };
    confirm.setBezelStyle(NSBezelStyle::Push);
    confirm.setBezelColor(Some(&NSColor::systemBlueColor()));
    confirm.setEnabled(false);
    layout_trailing_actions(&cancel, &confirm, width, 28.0, 130.0);
    root.addSubview(&confirm);
    {
        let mut state = root.ivars().state.borrow_mut();
        state.error_label = Some(error);
        state.confirm_button = Some(confirm);
    }

    parent.beginSheet_completionHandler(&panel, None);
    let response = NSApplication::sharedApplication(mtm).runModalForWindow(&panel);
    parent.endSheet_returnCode(&panel, response);
    response == NSModalResponseOK
}

fn update_verification(root: &VerificationView) {
    let state = root.ivars().state.borrow();
    for (position, button) in state.slot_buttons.iter().enumerate() {
        if let Some(word_index) = state.selected.get(position) {
            button.setTitle(&NSString::from_str(&format!(
                "{}. {}",
                position + 1,
                state.words[*word_index]
            )));
            button.setEnabled(true);
        } else {
            button.setTitle(&NSString::from_str(&format!("{}. Empty", position + 1)));
            button.setEnabled(false);
        }
    }
    for (index, button) in &state.pool_buttons {
        let available = !state.selected.contains(index);
        button.setEnabled(available);
        button.setAlphaValue(if available { 1.0 } else { 0.18 });
    }
    if let Some(confirm) = &state.confirm_button {
        confirm.setEnabled(state.selected.len() == state.words.len());
    }
    if let Some(error) = &state.error_label {
        error.setStringValue(&NSString::from_str(""));
    }
}

fn sheet_width(parent: &NSWindow, preferred: f64) -> f64 {
    (parent.frame().size.width - 32.0).clamp(340.0, preferred)
}

fn layout_trailing_actions(
    cancel: &NSButton,
    primary: &NSButton,
    container_width: f64,
    y: f64,
    primary_min_width: f64,
) {
    const RIGHT_MARGIN: f64 = 24.0;
    const GAP: f64 = 8.0;
    const HEIGHT: f64 = 38.0;

    cancel.sizeToFit();
    primary.sizeToFit();
    let cancel_width = (cancel.frame().size.width + 8.0).max(90.0);
    let primary_width = (primary.frame().size.width + 8.0).max(primary_min_width);
    let primary_x = container_width - RIGHT_MARGIN - primary_width;
    primary.setFrame(rect(primary_x, y, primary_width, HEIGHT));
    cancel.setFrame(rect(
        primary_x - GAP - cancel_width,
        y,
        cancel_width,
        HEIGHT,
    ));
}

fn add_label(
    parent: &NSView,
    text: &str,
    frame: NSRect,
    font: &NSFont,
    color: &NSColor,
    mtm: MainThreadMarker,
) -> Retained<NSTextField> {
    let label = NSTextField::labelWithString(&NSString::from_str(text), mtm);
    label.setFrame(frame);
    label.setFont(Some(font));
    label.setTextColor(Some(color));
    parent.addSubview(&label);
    label
}

fn brand_red() -> Retained<NSColor> {
    NSColor::colorWithSRGBRed_green_blue_alpha(0.82, 0.08, 0.15, 1.0)
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
    NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
}
