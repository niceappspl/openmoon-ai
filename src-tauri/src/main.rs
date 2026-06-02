#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod llm;
mod mcp_multi;
mod ollama;
mod secrets;
mod security;
mod settings;
mod triggers;
mod wifi;

use dirs;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use sysinfo::System;
use tauri::{Emitter, Manager};
use tokio::sync::oneshot;

const MAX_AGENT_STEPS: u32 = 8;
const MAX_HISTORY_MESSAGES: usize = 20;
const APPROVAL_TIMEOUT_SECS: u64 = 120;

/// Correlates `ask` approval requests with the frontend's `respond_approval`
/// reply via per-request oneshot channels kept in managed state.
pub(crate) struct ApprovalRegistry {
    pending: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    counter: AtomicU64,
}

impl ApprovalRegistry {
    fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(1),
        }
    }

    /// Reserves a request id and a receiver the caller awaits. The mutex guard
    /// is released before the caller awaits the receiver.
    fn register(&self) -> (String, oneshot::Receiver<bool>) {
        let id = format!("appr-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);
        (id, rx)
    }

    fn respond(&self, id: &str, approved: bool) {
        if let Some(tx) = self.pending.lock().unwrap().remove(id) {
            let _ = tx.send(approved);
        }
    }

    fn remove(&self, id: &str) {
        self.pending.lock().unwrap().remove(id);
    }
}

/// Records the tool calls executed during the most recent agent run per window,
/// enabling "Save as workflow" without another LLM round-trip.
struct LastRunStore {
    steps: Mutex<HashMap<String, Vec<serde_json::Value>>>,
}

impl LastRunStore {
    fn new() -> Self {
        Self {
            steps: Mutex::new(HashMap::new()),
        }
    }

    fn set(&self, label: &str, steps: Vec<serde_json::Value>) {
        self.steps.lock().unwrap().insert(label.to_string(), steps);
    }

    fn get(&self, label: &str) -> Vec<serde_json::Value> {
        self.steps
            .lock()
            .unwrap()
            .get(label)
            .cloned()
            .unwrap_or_default()
    }
}

/// In-memory conversation history keyed by window label, enabling multi-turn context.
struct SessionStore {
    sessions: Mutex<HashMap<String, Vec<llm::ChatMessage>>>,
}

impl SessionStore {
    fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    fn history(&self, label: &str) -> Vec<llm::ChatMessage> {
        self.sessions
            .lock()
            .unwrap()
            .get(label)
            .cloned()
            .unwrap_or_default()
    }

    fn append_turn(&self, label: &str, user: String, assistant: String) {
        let mut sessions = self.sessions.lock().unwrap();
        let entry = sessions.entry(label.to_string()).or_default();
        entry.push(llm::ChatMessage {
            role: "user".to_string(),
            content: user,
        });
        entry.push(llm::ChatMessage {
            role: "assistant".to_string(),
            content: assistant,
        });
        if entry.len() > MAX_HISTORY_MESSAGES {
            let overflow = entry.len() - MAX_HISTORY_MESSAGES;
            entry.drain(0..overflow);
        }
    }

    fn clear(&self, label: &str) {
        self.sessions.lock().unwrap().remove(label);
    }
}

fn format_tool_response(tool_name: &str, raw_response: &str) -> String {
    match tool_name {
        "get_battery_status" => {
            let battery_percent = extract_battery_percent(raw_response);

            if raw_response.contains("AC Power") {
                let charging_status = if raw_response.contains("not charging") {
                    "Plugged in (not charging)"
                } else if raw_response.contains("AC attached")
                    && raw_response.contains("charging present: true")
                {
                    "Charging"
                } else if raw_response.contains("charging") {
                    "Charging"
                } else {
                    "Plugged in"
                };
                format!(
                    "**Battery Status**\n\n**{}%** - {}\n\nConnected to power",
                    battery_percent, charging_status
                )
            } else {
                format!(
                    "**Battery Status**\n\n**{}%** - On battery power",
                    battery_percent
                )
            }
        }
        "get_system_info" => {
            if raw_response.contains("macOS") {
                let os_version = extract_os_version(raw_response);
                let hardware = extract_hardware_info(raw_response);
                format!("**System Information**\n\n{}\n{}", os_version, hardware)
            } else {
                format!("**System Information**\n\n{}", raw_response)
            }
        }
        "get_running_apps" => {
            let apps: Vec<&str> = raw_response
                .lines()
                .filter(|line| !line.is_empty() && !line.contains("Running applications"))
                .collect();
            if apps.is_empty() {
                "**Running Applications**\n\nNo applications currently running".to_string()
            } else {
                let visible_apps = 8;
                let app_list = apps
                    .iter()
                    .take(visible_apps)
                    .map(|app| format!("• {}", app))
                    .collect::<Vec<_>>()
                    .join("\n");

                let total_apps = apps.len();
                let more_apps = if total_apps > visible_apps {
                    format!("\n\n+{} more running", total_apps - visible_apps)
                } else {
                    String::new()
                };

                format!(
                    "**Running Applications**\n\n{}\n\nTotal: {} apps{}",
                    app_list, total_apps, more_apps
                )
            }
        }
        "take_screenshot" => {
            if raw_response.contains("screenshot") {
                "**Screenshot Taken**\n\nScreenshot saved successfully to Desktop".to_string()
            } else {
                format!("**Screenshot**\n\n{}", raw_response)
            }
        }
        "show_notification" => "**Notification Sent**\n\nNotification displayed".to_string(),
        "set_volume" => {
            if let Some(volume) = extract_volume_level(raw_response) {
                format!("**Volume Set**\n\nVolume: **{}%**", volume)
            } else {
                "**Volume Updated**\n\nVolume level changed".to_string()
            }
        }
        "focus_mode" => {
            if raw_response.contains("enabled") || raw_response.contains("true") {
                "**Focus Mode**\n\n**Do Not Disturb enabled**\n\nNotifications silenced".to_string()
            } else {
                "**Focus Mode**\n\n**Do Not Disturb disabled**\n\nNotifications active".to_string()
            }
        }
        "get_wifi_info" => {
            if let Some(ssid) = raw_response
                .lines()
                .find(|l| l.starts_with("Network Name:"))
                .and_then(|l| l.strip_prefix("Network Name:"))
                .map(str::trim)
            {
                let status = raw_response
                    .lines()
                    .find(|l| l.starts_with("Status:"))
                    .and_then(|l| l.strip_prefix("Status:"))
                    .map(str::trim)
                    .unwrap_or("Unknown");
                let ip = raw_response
                    .lines()
                    .find(|l| l.starts_with("IP Address:"))
                    .and_then(|l| l.strip_prefix("IP Address:"))
                    .map(str::trim)
                    .unwrap_or("Unknown");
                format!(
                    "**WiFi Status**\n\n**{}**\n\nStatus: {}\nIP: {}",
                    ssid, status, ip
                )
            } else {
                format!("**WiFi Status**\n\n{}", raw_response)
            }
        }
        "open_app" => {
            if raw_response.contains("SUCCESS") || raw_response.contains("activated") {
                "**App Opened**\n\nApplication launched successfully".to_string()
            } else if raw_response.contains("NOT_FOUND") {
                format!(
                    "**App Not Found**\n\n{}",
                    raw_response.replace("NOT_FOUND:", "")
                )
            } else {
                format!("**App Launch**\n\n{}", raw_response)
            }
        }
        "quit_app" => "**App Closed**\n\nApplication quit successfully".to_string(),
        _ => {
            // Default formatting for unknown tools
            if raw_response.len() > 200 {
                format!(
                    "**{}**\n\n{}",
                    tool_name.replace("_", " ").to_uppercase(),
                    raw_response
                )
            } else {
                format!(
                    "**{}**\n\n{}",
                    tool_name.replace("_", " ").to_uppercase(),
                    raw_response
                )
            }
        }
    }
}

fn extract_battery_percent(text: &str) -> String {
    // Look for pattern like "80%" or "80%;"
    // We need to find the COMPLETE number before %, not just the last digit

    let chars: Vec<char> = text.chars().collect();

    // Find all positions of '%'
    for (i, &ch) in chars.iter().enumerate() {
        if ch == '%' && i > 0 {
            // Go backwards to find the complete number
            let mut j = i - 1;
            let mut number_chars = Vec::new();

            // Collect all consecutive digits
            while j < chars.len() && chars[j].is_ascii_digit() {
                number_chars.insert(0, chars[j]);
                if j == 0 {
                    break;
                }
                j -= 1;
            }

            // Convert collected digits to string
            if !number_chars.is_empty() {
                let number_str: String = number_chars.into_iter().collect();
                if let Ok(num) = number_str.parse::<i32>() {
                    // Make sure it's a reasonable battery percentage
                    if num >= 0 && num <= 100 {
                        return num.to_string();
                    }
                }
            }
        }
    }

    "Unknown".to_string()
}

fn extract_os_version(text: &str) -> String {
    if let Some(start) = text.find("macOS") {
        if let Some(end) = text[start..].find('\n') {
            return text[start..start + end].to_string();
        }
    }
    "macOS".to_string()
}

fn extract_hardware_info(text: &str) -> String {
    if let Some(start) = text.find("Model:") {
        if let Some(end) = text[start..].find('\n') {
            return text[start + 7..start + end].trim().to_string();
        }
    }
    "Mac".to_string()
}

fn extract_volume_level(text: &str) -> Option<String> {
    if let Some(start) = text.find("Volume:") {
        if let Some(end) = text[start..].find('%') {
            return Some(text[start + 7..start + end].trim().to_string());
        }
    }
    None
}

/// Builds the configured LLM provider from settings (OpenAI or local Ollama).
fn build_provider(
    app_settings: &settings::AppSettings,
) -> Result<Box<dyn llm::LlmProvider>, String> {
    match app_settings.provider.as_str() {
        "ollama" => Ok(Box::new(llm::OllamaProvider::new(
            app_settings.ollama_base_url.clone(),
            app_settings.model.clone(),
        ))),
        _ => {
            let api_key = secrets::get_api_key("openai").ok_or_else(|| {
                "No OpenAI API key configured. Add one in Settings → Provider.".to_string()
            })?;
            let model = if app_settings.model.is_empty() {
                "gpt-4o-mini".to_string()
            } else {
                app_settings.model.clone()
            };
            Ok(Box::new(llm::OpenAiProvider::new(api_key, model)))
        }
    }
}

/// Flattens the per-server tool listing into the `{ "tools": [...] }` shape the
/// providers expect.
fn flatten_tools(all_tools: &serde_json::Value) -> serde_json::Value {
    let mut flattened = Vec::new();
    if let Some(obj) = all_tools.as_object() {
        for (_, server_tools) in obj {
            if let Some(tools_array) = server_tools["tools"].as_array() {
                flattened.extend(tools_array.clone());
            }
        }
    }
    serde_json::json!({ "tools": flattened })
}

fn summarize_args(args: &serde_json::Value) -> String {
    let raw = serde_json::to_string(args).unwrap_or_default();
    const MAX: usize = 200;
    if raw.chars().count() > MAX {
        format!("{}…", raw.chars().take(MAX).collect::<String>())
    } else {
        raw
    }
}

/// Single enforcement point for the security model. Resolves the per-tool
/// policy, enforces the path allowlist for filesystem tools, awaits user
/// approval for `ask` tools (or rejects immediately when unattended), audits
/// the decision/outcome, and finally dispatches to the MCP manager.
pub(crate) async fn execute_tool_with_policy(
    manager: Arc<mcp_multi::McpManager>,
    security: security::SecuritySettings,
    approvals: Arc<ApprovalRegistry>,
    app: tauri::AppHandle,
    attended: bool,
    recorder: Option<Arc<Mutex<Vec<serde_json::Value>>>>,
    name: String,
    args: serde_json::Value,
) -> Result<String, String> {
    let args_summary = summarize_args(&args);

    // Path allowlist enforcement for filesystem tools (treated like deny).
    if security::is_filesystem_tool(&name) {
        if let Some(path) = security::extract_path_arg(&args) {
            if !security::path_allowed(&path, &security) {
                let _ = db::append_audit(&name, &args_summary, "deny-path", None, false);
                return Ok(format!(
                    "Denied: path '{}' is outside the allowed locations. Add it under Settings → Security to permit access.",
                    path
                ));
            }
        }
    }

    let policy = security::resolve_policy(&name, &security);

    match policy {
        security::Policy::Deny => {
            let _ = db::append_audit(&name, &args_summary, "deny", None, false);
            return Ok(format!(
                "Denied: tool '{}' is blocked by the security policy.",
                name
            ));
        }
        security::Policy::Ask => {
            if !attended {
                let _ = db::append_audit(&name, &args_summary, "ask-rejected", None, false);
                return Ok(format!(
                    "Denied: tool '{}' requires approval and was triggered unattended.",
                    name
                ));
            }

            let (id, rx) = approvals.register();
            let _ = app.emit(
                "approval-request",
                serde_json::json!({
                    "id": id,
                    "tool": name,
                    "args": args,
                    "risk": security::risk_label(&name),
                }),
            );

            let approved = match tokio::time::timeout(
                std::time::Duration::from_secs(APPROVAL_TIMEOUT_SECS),
                rx,
            )
            .await
            {
                Ok(Ok(value)) => value,
                _ => false,
            };
            approvals.remove(&id);

            if !approved {
                let _ = db::append_audit(&name, &args_summary, "ask-rejected", None, false);
                return Ok(format!("User denied execution of '{}'.", name));
            }

            dispatch_tool(
                &manager,
                &name,
                args,
                &args_summary,
                "ask-approved",
                &recorder,
            )
            .await
        }
        security::Policy::Auto => {
            dispatch_tool(&manager, &name, args, &args_summary, "auto", &recorder).await
        }
    }
}

/// Executes the tool through the MCP manager, audits the outcome and records
/// the call for save-as-workflow.
async fn dispatch_tool(
    manager: &Arc<mcp_multi::McpManager>,
    name: &str,
    args: serde_json::Value,
    args_summary: &str,
    decision: &str,
    recorder: &Option<Arc<Mutex<Vec<serde_json::Value>>>>,
) -> Result<String, String> {
    if name == "get_wifi_info" {
        match wifi::get_wifi_info() {
            Ok(info) => {
                let content_text = info.format();
                let _ = db::append_audit(name, args_summary, decision, Some("native"), true);
                if let Some(recorder) = recorder {
                    recorder.lock().unwrap().push(serde_json::json!({
                        "action": name,
                        "params": args,
                    }));
                }
                return Ok(format_tool_response(name, &content_text));
            }
            Err(e) => eprintln!("[WIFI] Native lookup failed, falling back to MCP: {}", e),
        }
    }

    match manager.find_and_call_tool(name, args.clone()).await {
        Ok((server, response)) => {
            if let Some(tool_result) = response.result {
                let content_text = if let Some(content_array) = tool_result["content"].as_array() {
                    content_array
                        .iter()
                        .filter_map(|item| item["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    serde_json::to_string_pretty(&tool_result)
                        .unwrap_or_else(|_| tool_result.to_string())
                };
                let _ = db::append_audit(name, args_summary, decision, Some(&server), true);
                if let Some(recorder) = recorder {
                    recorder.lock().unwrap().push(serde_json::json!({
                        "action": name,
                        "params": args,
                    }));
                }
                Ok(format_tool_response(name, &content_text))
            } else if let Some(error) = response.error {
                let _ = db::append_audit(name, args_summary, decision, Some(&server), false);
                Err(format!("Tool error {}: {}", error.code, error.message))
            } else {
                let _ = db::append_audit(name, args_summary, decision, Some(&server), false);
                Err("No result from tool execution".to_string())
            }
        }
        Err(e) => {
            let _ = db::append_audit(name, args_summary, decision, None, false);
            Err(e)
        }
    }
}

/// Runs a fired trigger in the background, honoring the security policy with
/// unattended semantics (`ask` tools are rejected immediately).
pub(crate) async fn run_trigger(
    app: tauri::AppHandle,
    manager: Arc<mcp_multi::McpManager>,
    approvals: Arc<ApprovalRegistry>,
    trigger: db::Trigger,
) {
    let result = match trigger.kind.as_str() {
        "workflow" => {
            run_workflow_trigger(
                &manager,
                &security_settings(),
                &approvals,
                &app,
                &trigger.payload,
            )
            .await
        }
        _ => run_prompt_trigger(&manager, &approvals, &app, &trigger.payload).await,
    };

    let _ = app.emit(
        "trigger-result",
        serde_json::json!({
            "id": trigger.id,
            "name": trigger.name,
            "ok": result.is_ok(),
            "text": result.unwrap_or_else(|e| e),
        }),
    );
}

fn security_settings() -> security::SecuritySettings {
    settings::load().security
}

async fn run_prompt_trigger(
    manager: &Arc<mcp_multi::McpManager>,
    approvals: &Arc<ApprovalRegistry>,
    app: &tauri::AppHandle,
    prompt: &str,
) -> Result<String, String> {
    let all_tools = manager.list_all_tools().await?;
    let tools_for_llm = flatten_tools(&all_tools);
    let app_settings = settings::load();
    let provider = build_provider(&app_settings)?;

    let manager_for_closure = manager.clone();
    let security = app_settings.security.clone();
    let approvals_for_closure = approvals.clone();
    let app_for_closure = app.clone();
    let execute_tool = move |name: String, args: serde_json::Value| {
        let manager = manager_for_closure.clone();
        let security = security.clone();
        let approvals = approvals_for_closure.clone();
        let app = app_for_closure.clone();
        async move {
            execute_tool_with_policy(manager, security, approvals, app, false, None, name, args)
                .await
        }
    };

    let on_step = |_step: llm::AgentStep| {};

    llm::run_agent(
        provider.as_ref(),
        prompt,
        &[],
        &tools_for_llm,
        MAX_AGENT_STEPS,
        execute_tool,
        on_step,
    )
    .await
}

async fn run_workflow_trigger(
    manager: &Arc<mcp_multi::McpManager>,
    security: &security::SecuritySettings,
    approvals: &Arc<ApprovalRegistry>,
    app: &tauri::AppHandle,
    workflow_id: &str,
) -> Result<String, String> {
    let workflows_dir = get_workflows_dir()?;
    let file_path = workflows_dir.join(format!("{}.json", workflow_id));
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workflow '{}': {}", workflow_id, e))?;
    let workflow: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid workflow: {}", e))?;

    let steps = workflow["steps"]
        .as_array()
        .ok_or("Invalid workflow format")?;
    let mut executed = 0;

    for (index, step) in steps.iter().enumerate() {
        let action = step["action"].as_str().ok_or("Step missing action")?;
        let params = step["params"].clone();
        let delay = step["delay"].as_u64().unwrap_or(0);

        if delay > 0 && index > 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }

        execute_tool_with_policy(
            manager.clone(),
            security.clone(),
            approvals.clone(),
            app.clone(),
            false,
            None,
            action.to_string(),
            params,
        )
        .await?;
        executed += 1;
    }

    Ok(format!(
        "Workflow '{}' completed ({} steps)",
        workflow_id, executed
    ))
}

#[tauri::command]
async fn send_prompt(
    prompt: String,
    window: tauri::Window,
    state: tauri::State<'_, Arc<mcp_multi::McpManager>>,
    sessions: tauri::State<'_, Arc<SessionStore>>,
    approvals: tauri::State<'_, Arc<ApprovalRegistry>>,
    last_run: tauri::State<'_, Arc<LastRunStore>>,
) -> Result<String, String> {
    let all_tools = state.list_all_tools().await?;

    let app_settings = settings::load();
    let provider = build_provider(&app_settings)?;

    let tools_for_llm = flatten_tools(&all_tools);

    let label = window.label().to_string();
    let history = sessions.history(&label);

    let recorder: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));

    let manager = state.inner().clone();
    let security = app_settings.security.clone();
    let approvals_handle = approvals.inner().clone();
    let app_handle = window.app_handle().clone();
    let recorder_for_closure = recorder.clone();
    let execute_tool = move |name: String, args: serde_json::Value| {
        let manager = manager.clone();
        let security = security.clone();
        let approvals = approvals_handle.clone();
        let app = app_handle.clone();
        let recorder = recorder_for_closure.clone();
        async move {
            execute_tool_with_policy(
                manager,
                security,
                approvals,
                app,
                true,
                Some(recorder),
                name,
                args,
            )
            .await
        }
    };

    let emit_window = window.clone();
    let on_step = move |step: llm::AgentStep| {
        let _ = emit_window.emit("agent-step", &step);
    };

    let final_text = llm::run_agent(
        provider.as_ref(),
        &prompt,
        &history,
        &tools_for_llm,
        MAX_AGENT_STEPS,
        execute_tool,
        on_step,
    )
    .await?;

    sessions.append_turn(&label, prompt, final_text.clone());
    last_run.set(&label, recorder.lock().unwrap().clone());

    Ok(final_text)
}

#[tauri::command]
async fn reset_session(
    window: tauri::Window,
    sessions: tauri::State<'_, Arc<SessionStore>>,
) -> Result<(), String> {
    sessions.clear(window.label());
    Ok(())
}

#[tauri::command]
fn get_settings() -> Result<settings::AppSettings, String> {
    Ok(settings::load())
}

#[tauri::command]
fn save_settings(settings: settings::AppSettings) -> Result<(), String> {
    settings::save(&settings)
}

/// Validates that the selected provider is reachable and usable before the user
/// relies on it. For OpenAI it performs a lightweight `GET /v1/models` with the
/// stored key (save the key first), mapping common failures to actionable
/// messages. For Ollama it probes the base URL and confirms the model is
/// installed. Returns a human-readable success message or a fixable error.
#[tauri::command]
async fn test_provider_connection(
    provider: String,
    model: String,
    ollama_base_url: String,
) -> Result<String, String> {
    match provider.as_str() {
        "ollama" => {
            let base = {
                let trimmed = ollama_base_url.trim();
                if trimmed.is_empty() {
                    "http://localhost:11434".to_string()
                } else {
                    trimmed.to_string()
                }
            };
            let model = model.trim();
            if model.is_empty() {
                return Err("Select a model first".to_string());
            }
            let status = ollama::ollama_status(Some(base.clone())).await?;
            if !status.running {
                return Err(format!("Ollama not reachable at {}", base));
            }
            if !status.models.iter().any(|m| m == model) {
                return Err(format!("Model '{}' not installed — pull it first", model));
            }
            Ok(format!("Ollama reachable — model '{}' installed", model))
        }
        _ => {
            let api_key = secrets::get_api_key("openai")
                .ok_or_else(|| "No OpenAI API key configured. Save a key first.".to_string())?;
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
            let response = client
                .get("https://api.openai.com/v1/models")
                .bearer_auth(&api_key)
                .send()
                .await
                .map_err(|e| format!("Network error reaching OpenAI: {}", e))?;
            match response.status().as_u16() {
                200 => Ok("OpenAI reachable".to_string()),
                401 => Err("Invalid API key".to_string()),
                429 => Err("OpenAI rate limit reached — try again shortly".to_string()),
                code => Err(format!("OpenAI returned HTTP {}", code)),
            }
        }
    }
}

#[tauri::command]
fn get_notes() -> Result<Vec<String>, String> {
    db::get_notes()
}

#[tauri::command]
fn add_note(note: String) -> Result<(), String> {
    db::add_note(&note)
}

#[tauri::command]
fn clear_notes() -> Result<(), String> {
    db::clear_notes()
}

#[tauri::command]
fn migrate_quick_notes(notes: Vec<String>) -> Result<(), String> {
    db::migrate_notes(&notes)
}

#[tauri::command]
async fn start_mcp_server(
    state: tauri::State<'_, Arc<mcp_multi::McpManager>>,
) -> Result<String, String> {
    let mut config_path =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    if config_path.ends_with("src-tauri") {
        config_path.pop();
    }

    config_path.push("mcp-servers");
    config_path.push("config.json");

    let config_path_str = config_path
        .to_str()
        .ok_or_else(|| "Invalid config path".to_string())?;

    state.start_all(config_path_str).await
}

#[tauri::command]
async fn stop_mcp_server(
    state: tauri::State<'_, Arc<mcp_multi::McpManager>>,
) -> Result<String, String> {
    state.stop_all().await?;
    Ok("All MCP servers stopped successfully".to_string())
}

#[tauri::command]
async fn list_mcp_tools(
    state: tauri::State<'_, Arc<mcp_multi::McpManager>>,
) -> Result<String, String> {
    let tools = state.list_all_tools().await?;
    Ok(serde_json::to_string_pretty(&tools).unwrap_or_else(|_| "{}".to_string()))
}

#[tauri::command]
async fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn execute_workflow(
    workflow: serde_json::Value,
    state: tauri::State<'_, Arc<mcp_multi::McpManager>>,
) -> Result<String, String> {
    let steps = workflow["steps"]
        .as_array()
        .ok_or("Invalid workflow format")?;

    let mut results = Vec::new();

    for (index, step) in steps.iter().enumerate() {
        // Extract step details
        let action = step["action"].as_str().ok_or("Step missing action")?;
        let params = step["params"].clone();
        let delay = step["delay"].as_u64().unwrap_or(0);

        // Wait if there's a delay
        if delay > 0 && index > 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }

        // Execute the action
        let (_, result) = state.find_and_call_tool(action, params).await?;

        if let Some(tool_result) = result.result {
            let _content_text = if let Some(content_array) = tool_result["content"].as_array() {
                content_array
                    .iter()
                    .filter_map(|item| item["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                tool_result.to_string()
            };
            results.push(format!("Step {}: {}", index + 1, action));
        } else if let Some(error) = result.error {
            return Err(format!("Step {} failed: {}", index + 1, error.message));
        }
    }

    Ok(format!(
        "**Workflow Completed**\n\n{}\n\nAll {} steps executed successfully",
        results.join("\n"),
        steps.len()
    ))
}

#[tauri::command]
fn get_workflows_dir() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not find config directory")?;
    let workflows_dir = config_dir.join("openMOON").join("workflows");

    // Create directory if it doesn't exist
    fs::create_dir_all(&workflows_dir)
        .map_err(|e| format!("Failed to create workflows directory: {}", e))?;

    Ok(workflows_dir)
}

#[tauri::command]
async fn save_workflow(workflow: serde_json::Value) -> Result<String, String> {
    let workflows_dir = get_workflows_dir()?;
    let id = workflow["id"].as_str().ok_or("Workflow missing id")?;
    let file_path = workflows_dir.join(format!("{}.json", id));

    let content = serde_json::to_string_pretty(&workflow)
        .map_err(|e| format!("Failed to serialize workflow: {}", e))?;

    fs::write(&file_path, content).map_err(|e| format!("Failed to save workflow: {}", e))?;

    Ok(format!("Workflow saved to: {:?}", file_path))
}

#[tauri::command]
async fn load_workflows() -> Result<Vec<serde_json::Value>, String> {
    let workflows_dir = get_workflows_dir()?;
    let mut workflows = Vec::new();

    if let Ok(entries) = fs::read_dir(&workflows_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(workflow) = serde_json::from_str::<serde_json::Value>(&content) {
                            workflows.push(workflow);
                        }
                    }
                }
            }
        }
    }

    Ok(workflows)
}

#[tauri::command]
async fn delete_workflow(id: String) -> Result<String, String> {
    let workflows_dir = get_workflows_dir()?;
    let file_path = workflows_dir.join(format!("{}.json", id));

    fs::remove_file(&file_path).map_err(|e| format!("Failed to delete workflow: {}", e))?;

    Ok(format!("Workflow {} deleted", id))
}

#[tauri::command]
fn respond_approval(
    request_id: String,
    approved: bool,
    approvals: tauri::State<'_, Arc<ApprovalRegistry>>,
) -> Result<(), String> {
    approvals.respond(&request_id, approved);
    Ok(())
}

#[tauri::command]
fn get_audit_log(limit: Option<i64>) -> Result<Vec<db::AuditEntry>, String> {
    db::get_audit_log(limit.unwrap_or(100))
}

#[tauri::command]
fn get_recorded_steps(
    window: tauri::Window,
    last_run: tauri::State<'_, Arc<LastRunStore>>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(last_run.get(window.label()))
}

#[tauri::command]
fn create_trigger(
    trigger: db::Trigger,
    engine: tauri::State<'_, Arc<triggers::TriggerEngine>>,
) -> Result<(), String> {
    db::create_trigger(&trigger)?;
    engine.reload();
    Ok(())
}

#[tauri::command]
fn list_triggers() -> Result<Vec<db::Trigger>, String> {
    db::list_triggers()
}

#[tauri::command]
fn delete_trigger(
    id: String,
    engine: tauri::State<'_, Arc<triggers::TriggerEngine>>,
) -> Result<(), String> {
    db::delete_trigger(&id)?;
    engine.reload();
    Ok(())
}

#[tauri::command]
fn set_trigger_enabled(
    id: String,
    enabled: bool,
    engine: tauri::State<'_, Arc<triggers::TriggerEngine>>,
) -> Result<(), String> {
    db::set_trigger_enabled(&id, enabled)?;
    engine.reload();
    Ok(())
}

#[tauri::command]
async fn get_memory_usage() -> Result<serde_json::Value, String> {
    let mut system = System::new_all();
    system.refresh_all();

    let pid = sysinfo::get_current_pid().map_err(|e| format!("Failed to get PID: {}", e))?;

    if let Some(process) = system.process(pid) {
        let memory_bytes = process.memory();
        let memory_mb = memory_bytes / (1024 * 1024);

        Ok(serde_json::json!({
            "totalMB": memory_mb,
            "totalBytes": memory_bytes
        }))
    } else {
        Err("Process not found".to_string())
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn get_all_applications() -> Result<Vec<String>, String> {
    use std::fs;

    let mut apps = Vec::new();
    let app_dirs = vec!["/Applications", "/System/Applications"];

    for dir in app_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.ends_with(".app") {
                        // Remove .app extension
                        let app_name = name.trim_end_matches(".app").to_string();
                        apps.push(app_name);
                    }
                }
            }
        }
    }

    // Sort alphabetically
    apps.sort();
    apps.dedup();

    Ok(apps)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn get_all_applications() -> Result<Vec<String>, String> {
    Err("Only supported on macOS".to_string())
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
#[tauri::command]
async fn get_app_icon_path(app_name: String) -> Result<String, String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString};
    use objc::runtime::Class;
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let pool = NSAutoreleasePool::new(nil);

        // Get shared workspace
        let workspace_class = class!(NSWorkspace);
        let workspace: id = msg_send![workspace_class, sharedWorkspace];

        // Create NSString from app name
        let app_name_ns = NSString::alloc(nil).init_str(&format!("{}.app", app_name));

        // Get full path to application
        let mut app_path: id = msg_send![workspace, fullPathForApplication: app_name_ns];

        // If not found in /Applications, try /System/Applications
        if app_path == nil {
            let system_app_path = format!("/System/Applications/{}.app", app_name);
            let system_path_ns = NSString::alloc(nil).init_str(&system_app_path);

            // Check if the system app exists
            let file_manager_class = class!(NSFileManager);
            let file_manager: id = msg_send![file_manager_class, defaultManager];
            let exists: bool = msg_send![file_manager, fileExistsAtPath: system_path_ns];

            if exists {
                app_path = system_path_ns;
            }
        }

        if app_path == nil {
            return Err(format!("Application not found: {}", app_name));
        }

        // Get icon for application
        let icon: id = msg_send![workspace, iconForFile: app_path];

        if icon == nil {
            // Try to get icon from app bundle directly using sips command
            use std::process::Command;
            let temp_path = format!("/tmp/{}_icon.png", app_name);

            // Try system applications first
            let system_icon_path = format!(
                "/System/Applications/{}.app/Contents/Resources/AppIcon.icns",
                app_name
            );
            let output = Command::new("sips")
                .args(&[
                    "-s",
                    "format",
                    "png",
                    &system_icon_path,
                    "--out",
                    &temp_path,
                ])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    if let Ok(icon_bytes) = std::fs::read(&temp_path) {
                        let base64 = base64_encode(&icon_bytes);
                        let _ = std::fs::remove_file(&temp_path);
                        return Ok(format!("data:image/png;base64,{}", base64));
                    }
                }
            }

            // Try regular applications
            let app_icon_path = format!(
                "/Applications/{}.app/Contents/Resources/AppIcon.icns",
                app_name
            );
            let output = Command::new("sips")
                .args(&["-s", "format", "png", &app_icon_path, "--out", &temp_path])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    if let Ok(icon_bytes) = std::fs::read(&temp_path) {
                        let base64 = base64_encode(&icon_bytes);
                        let _ = std::fs::remove_file(&temp_path);
                        return Ok(format!("data:image/png;base64,{}", base64));
                    }
                }
            }

            return Err(format!("Could not get icon for: {}", app_name));
        }

        // Convert to PNG data
        let image_rep_class = Class::get("NSBitmapImageRep").unwrap();
        let tiff_data: id = msg_send![icon, TIFFRepresentation];
        let image_rep: id = msg_send![image_rep_class, imageRepWithData: tiff_data];

        // PNG file type constant
        let png_type: usize = 4; // NSBitmapImageFileTypePNG = 4
        let png_data: id = msg_send![image_rep, representationUsingType:png_type properties:nil];

        // Convert NSData to base64 string
        let length: usize = msg_send![png_data, length];
        let bytes: *const u8 = msg_send![png_data, bytes];
        let slice = std::slice::from_raw_parts(bytes, length);
        let base64 = base64_encode(slice);

        let _: () = msg_send![pool, drain];

        Ok(format!("data:image/png;base64,{}", base64))
    }
}

fn base64_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose, Engine as _};
    general_purpose::STANDARD.encode(data)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn get_app_icon_path(_app_name: String) -> Result<String, String> {
    Err("Icon paths only supported on macOS".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn open_application(app_name: String) -> Result<String, String> {
    use std::process::Command;

    // Simple mapping for common Polish app names to system names
    let system_app_name = match app_name.to_lowercase().as_str() {
        "przypomnienia" => "Reminders",
        "pogoda" => "Weather",
        "kalendarz" => "Calendar",
        "notatki" => "Notes",
        "muzyka" => "Music",
        "zdjęcia" => "Photos",
        "wiadomości" => "Messages",
        "kontakty" => "Contacts",
        "mapy" => "Maps",
        "safari" => "Safari",
        "terminal" => "Terminal",
        "finder" => "Finder",
        "kalkulator" => "Calculator",
        "zegar" => "Clock",
        "akcje" => "Shortcuts",
        "ustawienia" => "System Settings",
        "sklep" => "App Store",
        "podcasty" => "Podcasts",
        "telewizja" => "TV",
        "gry" => "Chess",
        "książki" => "Books",
        "słownik" => "Dictionary",
        "czcionki" => "Font Book",
        "podgląd" => "Preview",
        "głosowe notatki" => "VoiceMemos",
        "sticky notes" => "Stickies",
        "sticky" => "Stickies",
        "notatki samoprzylepne" => "Stickies",
        _ => &app_name, // Use original name if no mapping found
    };

    let output = Command::new("open")
        .arg("-a")
        .arg(system_app_name)
        .output()
        .map_err(|e| format!("Failed to execute open command: {}", e))?;

    if output.status.success() {
        Ok(format!("✅ Opened {}", app_name))
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("❌ Failed to open {}: {}", app_name, error))
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn open_application(_app_name: String) -> Result<String, String> {
    Err("Only supported on macOS".to_string())
}

#[cfg(target_os = "macos")]
fn setup_macos_window(window: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::id;

    unsafe {
        let ns_window = window.ns_window().unwrap() as id;
        NSWindow::setTitlebarAppearsTransparent_(ns_window, cocoa::base::YES);
        NSWindow::setCollectionBehavior_(
            ns_window,
            NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
        );
    }
}

/// Circular tray glyph matching the main app icon (ring + center dot).
/// Drawn at runtime as a macOS template image (alpha-only silhouette).
fn build_tray_icon() -> tauri::image::Image<'static> {
    const SIZE: u32 = 32;
    let dim = SIZE as f32;
    let cx = dim / 2.0;
    let cy = dim / 2.0;
    let r_ring = dim * 0.38;
    let ring_stroke = dim * 0.11;
    let r_dot = dim * 0.13;

    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;
            let dist = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
            let on_ring = (dist - r_ring).abs() <= ring_stroke / 2.0;
            let on_dot = dist <= r_dot;
            if on_ring || on_dot {
                let idx = ((y * SIZE + x) * 4) as usize;
                rgba[idx + 3] = 255;
            }
        }
    }

    tauri::image::Image::new_owned(rgba, SIZE, SIZE)
}

fn mcp_config_path() -> Result<String, String> {
    let mut config_path =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;
    if config_path.ends_with("src-tauri") {
        config_path.pop();
    }
    config_path.push("mcp-servers");
    config_path.push("config.json");
    config_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid config path".to_string())
}

fn main() {
    // Load .env file
    dotenv::dotenv().ok();

    let mcp_manager = Arc::new(mcp_multi::McpManager::new());

    tauri::async_runtime::block_on(async {
        let mut config_path = std::env::current_dir().expect("Failed to get current directory");

        if config_path.ends_with("src-tauri") {
            config_path.pop();
        }

        config_path.push("mcp-servers");
        config_path.push("config.json");

        let config_path_str = config_path.to_str().expect("Invalid config path");

        let _ = mcp_manager.load_from_config(config_path_str).await;
    });

    let app = tauri::Builder::default()
        .manage(mcp_manager)
        .manage(Arc::new(SessionStore::new()))
        .manage(Arc::new(ApprovalRegistry::new()))
        .manage(Arc::new(LastRunStore::new()))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            setup_macos_window(&window);

            window.show().unwrap();
            window.set_focus().unwrap();

            // Start the background trigger engine (scheduler + file watcher).
            let manager = app.state::<Arc<mcp_multi::McpManager>>().inner().clone();
            let approvals = app.state::<Arc<ApprovalRegistry>>().inner().clone();
            let engine = triggers::TriggerEngine::start(app.handle().clone(), manager, approvals);
            app.manage(engine);

            // Register global shortcut Cmd+Shift+Space
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
            let shortcut = "CmdOrCtrl+Shift+Space".parse::<Shortcut>().unwrap();
            let window_clone = window.clone();

            app.handle()
                .global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    // Only trigger on key release to avoid multiple triggers
                    if event.state == ShortcutState::Released {
                        let window = window_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        });
                    }
                })
                .unwrap();

            // macOS menu-bar tray icon (circular glyph, distinct from Focus/DND crescent).
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show_item = MenuItem::with_id(
                app.handle(),
                "show",
                "Show openMOON  (⌘⇧Space)",
                true,
                None::<&str>,
            )?;
            let hide_item =
                MenuItem::with_id(app.handle(), "hide", "Hide openMOON", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app.handle())?;
            let new_session_item = MenuItem::with_id(
                app.handle(),
                "new_session",
                "New Conversation",
                true,
                None::<&str>,
            )?;
            let workflows_item =
                MenuItem::with_id(app.handle(), "workflows", "Workflows", true, None::<&str>)?;
            let restart_mcp_item = MenuItem::with_id(
                app.handle(),
                "restart_mcp",
                "Restart MCP Servers",
                true,
                None::<&str>,
            )?;
            let sep2 = PredefinedMenuItem::separator(app.handle())?;
            let settings_item =
                MenuItem::with_id(app.handle(), "settings", "Settings…", true, None::<&str>)?;
            let sep3 = PredefinedMenuItem::separator(app.handle())?;
            let quit_item =
                MenuItem::with_id(app.handle(), "quit", "Quit openMOON", true, None::<&str>)?;
            let tray_menu = Menu::with_items(
                app.handle(),
                &[
                    &show_item,
                    &hide_item,
                    &sep1,
                    &new_session_item,
                    &workflows_item,
                    &restart_mcp_item,
                    &sep2,
                    &settings_item,
                    &sep3,
                    &quit_item,
                ],
            )?;

            let tray_window = window.clone();
            let _tray = TrayIconBuilder::with_id("openmoon-tray")
                .icon(build_tray_icon())
                .icon_as_template(true)
                .tooltip("openMOON — ⌘⇧Space to toggle")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "new_session" => {
                        if let Some(window) = app.get_webview_window("main") {
                            app.state::<Arc<SessionStore>>().clear(window.label());
                            let _ = window.emit("new-session", ());
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "workflows" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("open-workflows", ());
                        }
                    }
                    "restart_mcp" => {
                        let manager = app.state::<Arc<mcp_multi::McpManager>>().inner().clone();
                        if let Ok(config_path) = mcp_config_path() {
                            tauri::async_runtime::spawn(async move {
                                let _ = manager.stop_all().await;
                                let _ = manager.start_all(&config_path).await;
                            });
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("open-settings", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let window = tray_window.clone();
                        tauri::async_runtime::spawn(async move {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        });
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            reset_session,
            get_settings,
            save_settings,
            test_provider_connection,
            secrets::set_api_key,
            secrets::remove_api_key,
            secrets::has_api_key_cmd,
            get_notes,
            add_note,
            clear_notes,
            migrate_quick_notes,
            hide_window,
            start_mcp_server,
            stop_mcp_server,
            list_mcp_tools,
            get_app_icon_path,
            get_all_applications,
            open_application,
            get_memory_usage,
            execute_workflow,
            save_workflow,
            load_workflows,
            delete_workflow,
            respond_approval,
            get_audit_log,
            get_recorded_steps,
            create_trigger,
            list_triggers,
            delete_trigger,
            set_trigger_enabled,
            ollama::ollama_status,
            ollama::ollama_pull
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {});
}
