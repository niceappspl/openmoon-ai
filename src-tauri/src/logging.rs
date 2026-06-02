use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Once;

static INIT: Once = Once::new();

/// Resolves the log file path under the openMOON config dir
/// (`.../openMOON/logs/openmoon.log`), creating the `logs/` directory if needed.
fn log_file_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not find config directory")?;
    let dir = config_dir.join("openMOON").join("logs");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs directory: {}", e))?;
    Ok(dir.join("openmoon.log"))
}

/// Appends a single timestamped line to the log file. Best-effort: failures are
/// swallowed so logging never crashes a caller.
fn write_line(level: &str, msg: &str) {
    let path = match log_file_path() {
        Ok(path) => path,
        Err(_) => return,
    };
    let line = format!("{} [{}] {}\n", Local::now().to_rfc3339(), level, msg);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Initialises file logging: ensures the log file exists and installs a panic
/// hook that records the panic message, location, and backtrace (when enabled)
/// to the log file before delegating to the previous hook.
///
/// Never logs user prompt content or API keys. Safe to call once; subsequent
/// calls are ignored.
pub fn init() {
    INIT.call_once(|| {
        write_line("INFO", "openMOON started");

        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let location = info
                .location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "unknown location".to_string());

            let message = if let Some(s) = info.payload().downcast_ref::<&str>() {
                (*s).to_string()
            } else if let Some(s) = info.payload().downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic payload".to_string()
            };

            let backtrace = std::backtrace::Backtrace::force_capture();
            write_line(
                "PANIC",
                &format!("{} at {}\n{}", message, location, backtrace),
            );

            previous(info);
        }));
    });
}

/// Records an error message to the log file. Callers must avoid passing user
/// prompt content or secrets.
#[allow(dead_code)]
pub fn log_error(msg: &str) {
    write_line("ERROR", msg);
}

/// Returns the absolute path to the log file, or an empty string if the path
/// could not be resolved.
#[tauri::command]
pub fn get_log_path() -> String {
    log_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Reveals the log file in the system file manager (Finder on macOS).
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn open_logs() -> Result<(), String> {
    use std::process::Command;
    let path = log_file_path()?;
    let status = Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|e| format!("Failed to open logs: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err("Failed to reveal log file".to_string())
    }
}

/// Cross-platform fallback: opens the directory containing the log file.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn open_logs() -> Result<(), String> {
    let path = log_file_path()?;
    let dir = path
        .parent()
        .ok_or("Could not resolve logs directory")?
        .to_path_buf();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(&dir).status();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let result = std::process::Command::new("xdg-open").arg(&dir).status();

    result
        .map_err(|e| format!("Failed to open logs: {}", e))
        .map(|_| ())
}
