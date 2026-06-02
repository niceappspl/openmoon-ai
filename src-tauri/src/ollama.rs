use serde::Serialize;
use std::time::Duration;

const DEFAULT_BASE_URL: &str = "http://localhost:11434";
const STATUS_TIMEOUT_SECS: u64 = 3;

/// Result of probing a local Ollama instance for liveness and installed models.
#[derive(Debug, Clone, Serialize)]
pub struct OllamaStatus {
    pub running: bool,
    pub models: Vec<String>,
}

/// Resolves the effective base url: explicit override, then persisted settings,
/// then the built-in default.
fn resolve_base_url(base_url: Option<String>) -> String {
    base_url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            let configured = crate::settings::load().ollama_base_url;
            if configured.trim().is_empty() {
                DEFAULT_BASE_URL.to_string()
            } else {
                configured
            }
        })
}

/// Lazily probes Ollama via `GET /api/tags`. Connection or parse failures map to
/// `running: false` so the command never errors and detection degrades quietly.
#[tauri::command]
pub async fn ollama_status(base_url: Option<String>) -> Result<OllamaStatus, String> {
    let base = resolve_base_url(base_url);
    let url = format!("{}/api/tags", base.trim_end_matches('/'));

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(STATUS_TIMEOUT_SECS))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return Ok(OllamaStatus {
                running: false,
                models: Vec::new(),
            })
        }
    };

    let response = match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => response,
        _ => {
            return Ok(OllamaStatus {
                running: false,
                models: Vec::new(),
            })
        }
    };

    let payload: serde_json::Value = match response.json().await {
        Ok(payload) => payload,
        Err(_) => {
            return Ok(OllamaStatus {
                running: false,
                models: Vec::new(),
            })
        }
    };

    let models = payload["models"]
        .as_array()
        .map(|models| {
            models
                .iter()
                .filter_map(|model| model["name"].as_str().map(|name| name.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(OllamaStatus {
        running: true,
        models,
    })
}

/// Pulls a model via `POST /api/pull` with `stream: false`. Uses a client with
/// no timeout because a pull can take minutes.
#[tauri::command]
pub async fn ollama_pull(base_url: Option<String>, model: String) -> Result<String, String> {
    let base = resolve_base_url(base_url);
    let url = format!("{}/api/pull", base.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&serde_json::json!({ "name": model, "stream": false }))
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let status = response.status();
    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    if !status.is_success() {
        let detail = payload["error"].as_str().unwrap_or("unknown error");
        return Err(format!("Pull failed ({}): {}", status, detail));
    }

    if let Some(error) = payload["error"].as_str() {
        return Err(error.to_string());
    }

    Ok(format!("Model '{}' pulled successfully", model))
}
