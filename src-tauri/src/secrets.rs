//! OS-keychain-backed storage for provider API keys.
//!
//! Keys are never written to the plaintext `settings.json`. They live in the
//! macOS login keychain (via the `keyring` crate). For backwards compatibility
//! the OpenAI key still falls back to the `OPENAI_API_KEY` environment variable
//! / `.env` when nothing is stored in the keychain.

use keyring::Entry;

const SERVICE: &str = "openMOON";

/// Maps a provider id to its keychain account name.
fn account_for(provider: &str) -> String {
    format!("{}-api-key", provider.trim().to_lowercase())
}

fn entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &account_for(provider))
        .map_err(|e| format!("Failed to open keychain entry: {}", e))
}

/// Returns the stored API key for a provider, falling back to the environment
/// (`OPENAI_API_KEY`) for the OpenAI provider when the keychain has no entry.
pub fn get_api_key(provider: &str) -> Option<String> {
    if let Ok(entry) = entry(provider) {
        match entry.get_password() {
            Ok(key) if !key.trim().is_empty() => return Some(key),
            _ => {}
        }
    }

    if provider.eq_ignore_ascii_case("openai") {
        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            if !key.trim().is_empty() {
                return Some(key);
            }
        }
    }

    None
}

/// Persists an API key in the OS keychain. An empty key deletes the entry.
pub fn store_api_key(provider: &str, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return delete_api_key(provider);
    }
    entry(provider)?
        .set_password(trimmed)
        .map_err(|e| format!("Failed to store API key: {}", e))
}

/// Removes a provider's API key from the keychain (no-op if absent).
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete API key: {}", e)),
    }
}

/// Reports whether a usable key exists for the provider (keychain or env),
/// without exposing the key itself.
pub fn has_api_key(provider: &str) -> bool {
    get_api_key(provider).is_some()
}

// --- Tauri commands -------------------------------------------------------

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), String> {
    store_api_key(&provider, &key)
}

#[tauri::command]
pub fn remove_api_key(provider: String) -> Result<(), String> {
    delete_api_key(&provider)
}

/// Returns `true` if a key is available for the provider (never the value).
#[tauri::command]
pub fn has_api_key_cmd(provider: String) -> bool {
    has_api_key(&provider)
}
