use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// A persisted agent run (prompt + response + tool steps).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub id: i64,
    pub prompt: String,
    pub response: String,
    /// JSON array of recorded tool-call objects (`{action, params}`).
    pub steps_json: String,
    pub created_at: String,
    pub provider: String,
    pub model: String,
}

/// A single audited tool decision + execution outcome.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub timestamp: String,
    pub tool: String,
    pub args_summary: String,
    pub decision: String,
    pub server: Option<String>,
    pub ok: bool,
}

/// A persisted automation trigger (time interval and/or file-watch bound task).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trigger {
    pub id: String,
    pub name: String,
    /// "prompt" (natural-language) or "workflow" (saved workflow id).
    pub kind: String,
    /// Prompt text or workflow id depending on `kind`.
    pub payload: String,
    #[serde(default)]
    pub interval_secs: Option<u64>,
    #[serde(default)]
    pub watch_path: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

/// Resolves the SQLite database path under the openMOON config dir, creating the
/// directory if needed (mirrors the workflows dir pattern in `main.rs`).
fn db_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not find config directory")?;
    let dir = config_dir.join("openMOON");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    Ok(dir.join("openmoon.db"))
}

/// Opens a connection and ensures the schema exists (idempotent migrations).
fn open() -> Result<Connection, String> {
    let conn =
        Connection::open(db_path()?).map_err(|e| format!("Failed to open database: {}", e))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            tool TEXT NOT NULL,
            args_summary TEXT NOT NULL,
            decision TEXT NOT NULL,
            server TEXT,
            ok INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS triggers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            payload TEXT NOT NULL,
            interval_secs INTEGER,
            watch_path TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            response TEXT NOT NULL,
            steps_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            provider TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT ''
        );",
    )
    .map_err(|e| format!("Failed to initialize schema: {}", e))?;
    Ok(conn)
}

pub fn get_notes() -> Result<Vec<String>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare("SELECT content FROM notes ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut notes = Vec::new();
    for row in rows {
        notes.push(row.map_err(|e| e.to_string())?);
    }
    Ok(notes)
}

pub fn add_note(content: &str) -> Result<(), String> {
    let conn = open()?;
    conn.execute("INSERT INTO notes (content) VALUES (?1)", [content])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_notes() -> Result<(), String> {
    let conn = open()?;
    conn.execute("DELETE FROM notes", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// One-time migration of Quick Notes from localStorage. Inserts the provided
/// notes only when the table is empty, so repeated calls are idempotent.
pub fn migrate_notes(notes: &[String]) -> Result<(), String> {
    let conn = open()?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if count == 0 {
        for note in notes {
            conn.execute("INSERT INTO notes (content) VALUES (?1)", [note])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Appends a tool decision/execution record to the audit log.
pub fn append_audit(
    tool: &str,
    args_summary: &str,
    decision: &str,
    server: Option<&str>,
    ok: bool,
) -> Result<(), String> {
    let conn = open()?;
    conn.execute(
        "INSERT INTO audit_log (tool, args_summary, decision, server, ok) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![tool, args_summary, decision, server, ok as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the most recent audit entries, newest first.
pub fn get_audit_log(limit: i64) -> Result<Vec<AuditEntry>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare(
            "SELECT timestamp, tool, args_summary, decision, server, ok
             FROM audit_log ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit], |row| {
            Ok(AuditEntry {
                timestamp: row.get(0)?,
                tool: row.get(1)?,
                args_summary: row.get(2)?,
                decision: row.get(3)?,
                server: row.get(4)?,
                ok: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| e.to_string())?);
    }
    Ok(entries)
}

pub fn create_trigger(trigger: &Trigger) -> Result<(), String> {
    let conn = open()?;
    conn.execute(
        "INSERT OR REPLACE INTO triggers (id, name, kind, payload, interval_secs, watch_path, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            trigger.id,
            trigger.name,
            trigger.kind,
            trigger.payload,
            trigger.interval_secs.map(|v| v as i64),
            trigger.watch_path,
            trigger.enabled as i64,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_triggers() -> Result<Vec<Trigger>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, kind, payload, interval_secs, watch_path, enabled
             FROM triggers ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Trigger {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                payload: row.get(3)?,
                interval_secs: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                watch_path: row.get(5)?,
                enabled: row.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut triggers = Vec::new();
    for row in rows {
        triggers.push(row.map_err(|e| e.to_string())?);
    }
    Ok(triggers)
}

pub fn delete_trigger(id: &str) -> Result<(), String> {
    let conn = open()?;
    conn.execute("DELETE FROM triggers WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_trigger_enabled(id: &str, enabled: bool) -> Result<(), String> {
    let conn = open()?;
    conn.execute(
        "UPDATE triggers SET enabled = ?1 WHERE id = ?2",
        rusqlite::params![enabled as i64, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Persists a completed agent run to the `runs` table.
pub fn save_run(
    prompt: &str,
    response: &str,
    steps_json: &str,
    provider: &str,
    model: &str,
) -> Result<(), String> {
    let conn = open()?;
    conn.execute(
        "INSERT INTO runs (prompt, response, steps_json, provider, model) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![prompt, response, steps_json, provider, model],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the most recent runs, newest first.
pub fn list_runs(limit: i64) -> Result<Vec<RunRecord>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, prompt, response, steps_json, created_at, provider, model
             FROM runs ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit], |row| {
            Ok(RunRecord {
                id: row.get(0)?,
                prompt: row.get(1)?,
                response: row.get(2)?,
                steps_json: row.get(3)?,
                created_at: row.get(4)?,
                provider: row.get(5)?,
                model: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut runs = Vec::new();
    for row in rows {
        runs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(runs)
}

/// Deletes a run by id.
pub fn delete_run(id: i64) -> Result<(), String> {
    let conn = open()?;
    conn.execute("DELETE FROM runs WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
