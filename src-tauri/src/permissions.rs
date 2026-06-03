//! macOS privacy permission helpers.
//!
//! Provides commands for the first-run onboarding flow to report and trigger
//! the system permission prompts (Accessibility, Screen Recording, Automation).
//! All native calls are gated behind `#[cfg(target_os = "macos")]`; other
//! platforms get inert stubs so the crate still compiles everywhere.

use serde::Serialize;

/// Snapshot of the macOS privacy permissions openMOON cares about.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    /// Accessibility — required to control apps and synthesize input events.
    pub accessibility: bool,
    /// Screen Recording — required to capture the screen / read window contents.
    pub screen_recording: bool,
    /// Automation (Apple Events). There is no clean public preflight API, so
    /// this is reported best-effort and is never used to block onboarding.
    pub automation: bool,
}

#[cfg(target_os = "macos")]
mod imp {
    use super::PermissionStatus;
    use cocoa::base::{id, YES};
    use objc::{class, msg_send, sel, sel_impl};
    use std::process::Command;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: id) -> bool;
        static kAXTrustedCheckOptionPrompt: id;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    fn accessibility_granted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    fn screen_recording_granted() -> bool {
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    /// Apple provides no reliable read-only preflight for Automation, so we
    /// report `true` (non-blocking). The real Apple Events consent prompt is
    /// raised lazily by macOS the first time a tool drives another app.
    fn automation_granted() -> bool {
        true
    }

    pub fn check() -> PermissionStatus {
        PermissionStatus {
            accessibility: accessibility_granted(),
            screen_recording: screen_recording_granted(),
            automation: automation_granted(),
        }
    }

    /// Trigger the system prompt for `kind`, then return a fresh snapshot.
    pub fn request(kind: &str) -> PermissionStatus {
        match kind {
            "accessibility" => unsafe {
                let value: id = msg_send![class!(NSNumber), numberWithBool: YES];
                let options: id = msg_send![
                    class!(NSDictionary),
                    dictionaryWithObject: value
                    forKey: kAXTrustedCheckOptionPrompt
                ];
                let _ = AXIsProcessTrustedWithOptions(options);
            },
            "screen_recording" => unsafe {
                let _ = CGRequestScreenCaptureAccess();
            },
            _ => {}
        }
        check()
    }

    /// Open the relevant System Settings privacy pane for `kind`.
    pub fn open_settings(kind: &str) -> Result<(), String> {
        let anchor = match kind {
            "accessibility" => "Privacy_Accessibility",
            "screen_recording" => "Privacy_ScreenCapture",
            "automation" => "Privacy_Automation",
            "microphone" => "Privacy_Microphone",
            "files" => "Privacy_FilesAndFolders",
            "speech_recognition" => "Privacy_SpeechRecognition",
            other => return Err(format!("unknown permission kind: {other}")),
        };
        let url = format!("x-apple.systempreferences:com.apple.preference.security?{anchor}");
        Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("failed to open System Settings: {e}"))
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::PermissionStatus;

    pub fn check() -> PermissionStatus {
        PermissionStatus {
            accessibility: true,
            screen_recording: true,
            automation: true,
        }
    }

    pub fn request(_kind: &str) -> PermissionStatus {
        check()
    }

    pub fn open_settings(_kind: &str) -> Result<(), String> {
        Err("permission settings are only available on macOS".to_string())
    }
}

/// Report the current grant state of the macOS privacy permissions.
#[tauri::command]
pub fn check_permissions() -> PermissionStatus {
    imp::check()
}

/// Trigger the system permission prompt for the given `kind`
/// (`"accessibility"` or `"screen_recording"`) and return the refreshed state.
#[tauri::command]
pub fn request_permission(kind: String) -> PermissionStatus {
    imp::request(&kind)
}

/// Open the System Settings privacy pane for the given `kind`
/// (`"accessibility"`, `"screen_recording"`, or `"automation"`).
#[tauri::command]
pub fn open_permission_settings(kind: String) -> Result<(), String> {
    imp::open_settings(&kind)
}
