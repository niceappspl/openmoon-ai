use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

/// Resolved decision for a single tool invocation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Policy {
    Auto,
    Ask,
    Deny,
}

impl Policy {
    pub fn parse(value: &str) -> Policy {
        match value.to_ascii_lowercase().as_str() {
            "auto" => Policy::Auto,
            "deny" => Policy::Deny,
            _ => Policy::Ask,
        }
    }
}

/// Coarse risk grouping used to provide sane per-category defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Read,
    Media,
    App,
    Productivity,
    FileWrite,
    Communication,
    SystemControl,
}

/// User-configurable security policy, persisted as part of `AppSettings`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySettings {
    pub global_default: String,
    pub tool_overrides: HashMap<String, String>,
    pub allowed_paths: Vec<String>,
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            global_default: "ask".to_string(),
            tool_overrides: HashMap::new(),
            allowed_paths: Vec::new(),
        }
    }
}

/// Maps a tool name to its risk category. Unknown tools are uncategorized and
/// fall back to the global default during resolution.
pub fn categorize(tool: &str) -> Option<Category> {
    let category = match tool {
        // Pure reads / info.
        "read_file"
        | "list_directory"
        | "search_files"
        | "get_file_info"
        | "search_notes"
        | "get_running_apps"
        | "get_installed_apps"
        | "get_app_icon_mapping"
        | "get_clipboard"
        | "get_system_info"
        | "get_battery_status"
        | "get_wifi_info"
        | "get_current_time"
        | "get_current_date"
        | "mail_search"
        | "mail_unread"
        | "mail_read"
        | "maps_search"
        | "maps_directions"
        | "calendar_events"
        | "reminders_list"
        | "notes_list"
        | "contacts_search"
        | "list_tasks"
        | "get_pomodoro_stats"
        | "get_habit_streak"
        | "get_current_track"
        | "get_active_tab_info"
        | "list_open_tabs" => Category::Read,

        // Media playback (low risk, frequent).
        "play_pause_media" | "next_track" | "previous_track" | "set_media_volume"
        | "toggle_shuffle" | "toggle_repeat" | "search_and_play" | "create_playlist"
        | "add_to_playlist" => Category::Media,

        // App / browser navigation and benign output.
        "open_app"
        | "open_url"
        | "search_web"
        | "take_screenshot"
        | "capture_screenshot"
        | "show_notification"
        | "reload_tab"
        | "go_back"
        | "go_forward"
        | "bookmark_current_page" => Category::App,

        // Local productivity data creation.
        "create_task" | "complete_task" | "delete_task" | "create_note" | "notes_create"
        | "create_reminder" | "reminders_create" | "calendar_create" | "start_pomodoro"
        | "start_break" | "track_habit" => Category::Productivity,

        // File writes.
        "write_file" | "save_page_as_pdf" => Category::FileWrite,

        // Outbound communication.
        "mail_send" | "messages_send" => Category::Communication,

        // System control / destructive.
        "run_shell_command"
        | "set_volume"
        | "set_clipboard"
        | "empty_trash"
        | "lock_screen"
        | "sleep_display"
        | "restart_computer"
        | "shutdown_computer"
        | "toggle_wifi"
        | "toggle_bluetooth"
        | "toggle_dark_mode"
        | "focus_mode"
        | "quit_app"
        | "record_screen"
        | "clear_browsing_data"
        | "close_tab" => Category::SystemControl,

        _ => return None,
    };
    Some(category)
}

/// Fixed default policy per category. Read/media/app/productivity are `auto`;
/// file writes, communication and system control require confirmation.
pub fn category_default(category: Category) -> Policy {
    match category {
        Category::Read | Category::Media | Category::App | Category::Productivity => Policy::Auto,
        Category::FileWrite | Category::Communication | Category::SystemControl => Policy::Ask,
    }
}

/// Resolves the effective policy for a tool. Resolution order:
/// explicit per-tool override -> category default -> global default.
pub fn resolve_policy(tool: &str, settings: &SecuritySettings) -> Policy {
    if let Some(override_value) = settings.tool_overrides.get(tool) {
        return Policy::parse(override_value);
    }
    if let Some(category) = categorize(tool) {
        return category_default(category);
    }
    Policy::parse(&settings.global_default)
}

/// Human-friendly risk label surfaced in the approval card.
pub fn risk_label(tool: &str) -> &'static str {
    match categorize(tool) {
        Some(Category::Communication) | Some(Category::SystemControl) => "high",
        Some(Category::FileWrite) => "medium",
        Some(Category::Read)
        | Some(Category::Media)
        | Some(Category::App)
        | Some(Category::Productivity) => "low",
        None => "unknown",
    }
}

/// Tools whose `path` argument must fall inside the allowlist.
pub fn is_filesystem_tool(tool: &str) -> bool {
    matches!(
        tool,
        "read_file" | "write_file" | "list_directory" | "search_files" | "get_file_info"
    )
}

/// Extracts the path argument from a filesystem tool call, if present.
pub fn extract_path_arg(args: &serde_json::Value) -> Option<String> {
    args.get("path")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    } else if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(path)
}

/// Lexically resolves `.` and `..` without touching the filesystem so that
/// non-existent write targets can still be validated.
fn lexically_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn allowed_roots(settings: &SecuritySettings) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home);
    }
    if let Some(config) = dirs::config_dir() {
        roots.push(config.join("openMOON"));
    }
    for extra in &settings.allowed_paths {
        let trimmed = extra.trim();
        if !trimmed.is_empty() {
            roots.push(lexically_normalize(&expand_tilde(trimmed)));
        }
    }
    roots
}

/// Returns true when `raw_path` resolves under one of the allowed roots
/// (user home, the openMOON config dir, plus any user-configured paths).
pub fn path_allowed(raw_path: &str, settings: &SecuritySettings) -> bool {
    let expanded = expand_tilde(raw_path);
    let absolute = if expanded.is_absolute() {
        expanded
    } else {
        match std::env::current_dir() {
            Ok(cwd) => cwd.join(expanded),
            Err(_) => return false,
        }
    };
    let candidate = lexically_normalize(&absolute);

    allowed_roots(settings)
        .iter()
        .any(|root| candidate.starts_with(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> SecuritySettings {
        SecuritySettings::default()
    }

    #[test]
    fn read_tools_default_to_auto() {
        assert_eq!(resolve_policy("read_file", &settings()), Policy::Auto);
        assert_eq!(
            resolve_policy("get_battery_status", &settings()),
            Policy::Auto
        );
    }

    #[test]
    fn risky_tools_default_to_ask() {
        assert_eq!(resolve_policy("write_file", &settings()), Policy::Ask);
        assert_eq!(resolve_policy("mail_send", &settings()), Policy::Ask);
        assert_eq!(
            resolve_policy("run_shell_command", &settings()),
            Policy::Ask
        );
    }

    #[test]
    fn override_takes_precedence_over_category() {
        let mut s = settings();
        s.tool_overrides
            .insert("write_file".to_string(), "auto".to_string());
        assert_eq!(resolve_policy("write_file", &s), Policy::Auto);
        s.tool_overrides
            .insert("read_file".to_string(), "deny".to_string());
        assert_eq!(resolve_policy("read_file", &s), Policy::Deny);
    }

    #[test]
    fn unknown_tool_uses_global_default() {
        assert_eq!(resolve_policy("mystery_tool", &settings()), Policy::Ask);
        let mut s = settings();
        s.global_default = "auto".to_string();
        assert_eq!(resolve_policy("mystery_tool", &s), Policy::Auto);
    }

    #[test]
    fn home_paths_are_allowed() {
        let home = dirs::home_dir().expect("home dir");
        let inside = home.join("Documents/report.txt");
        assert!(path_allowed(inside.to_str().unwrap(), &settings()));
    }

    #[test]
    fn system_paths_are_rejected() {
        assert!(!path_allowed("/etc/passwd", &settings()));
        assert!(!path_allowed("/usr/bin/secret", &settings()));
    }

    #[test]
    fn traversal_escaping_home_is_rejected() {
        let home = dirs::home_dir().expect("home dir");
        let escaping = home.join("../../etc/passwd");
        assert!(!path_allowed(escaping.to_str().unwrap(), &settings()));
    }

    #[test]
    fn extra_allowed_path_is_honored() {
        let mut s = settings();
        s.allowed_paths.push("/tmp/openmoon".to_string());
        assert!(path_allowed("/tmp/openmoon/output.txt", &s));
        assert!(!path_allowed("/tmp/other/output.txt", &s));
    }
}
