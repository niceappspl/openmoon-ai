use crate::security::SecuritySettings;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// User-configurable LLM settings, persisted as JSON in the openMOON config dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub provider: String,
    pub model: String,
    #[serde(rename = "ollamaBaseUrl")]
    pub ollama_base_url: String,
    #[serde(default)]
    pub security: SecuritySettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: "gpt-4o-mini".to_string(),
            ollama_base_url: "http://localhost:11434".to_string(),
            security: SecuritySettings::default(),
        }
    }
}

fn settings_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not find config directory")?;
    let dir = config_dir.join("openMOON");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    Ok(dir.join("settings.json"))
}

pub fn load() -> AppSettings {
    let path = match settings_path() {
        Ok(path) => path,
        Err(_) => return AppSettings::default(),
    };
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to save settings: {}", e))?;
    Ok(())
}
