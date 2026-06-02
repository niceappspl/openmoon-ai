use crate::db;
use crate::mcp_multi::McpManager;
use crate::ApprovalRegistry;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::sync::mpsc;

/// Debounce window for file-watch triggers to coalesce burst events.
const WATCH_DEBOUNCE_SECS: u64 = 2;

/// Handle to the background trigger engine. `reload` asks the engine to
/// re-read triggers from the database and rebuild its file watchers.
pub struct TriggerEngine {
    reload_tx: mpsc::UnboundedSender<()>,
}

impl TriggerEngine {
    pub fn reload(&self) {
        let _ = self.reload_tx.send(());
    }

    /// Spawns the engine task: an interval scheduler plus a file watcher. The
    /// scheduler uses simple interval timing (lighter than full cron) measured
    /// from app start / trigger creation.
    pub fn start(
        app: AppHandle,
        manager: Arc<McpManager>,
        approvals: Arc<ApprovalRegistry>,
    ) -> Arc<TriggerEngine> {
        let (reload_tx, mut reload_rx) = mpsc::unbounded_channel::<()>();
        let engine = Arc::new(TriggerEngine { reload_tx });

        tauri::async_runtime::spawn(async move {
            let (event_tx, mut event_rx) = mpsc::unbounded_channel::<PathBuf>();
            let (mut _watcher, mut watched) = rebuild_watcher(&event_tx);
            let mut last_fire: HashMap<String, Instant> = HashMap::new();
            let mut ticker = tokio::time::interval(Duration::from_secs(1));

            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        let now = Instant::now();
                        let triggers = db::list_triggers().unwrap_or_default();
                        for trigger in triggers.into_iter().filter(|t| t.enabled) {
                            let secs = match trigger.interval_secs {
                                Some(s) if s > 0 => s,
                                _ => continue,
                            };
                            match last_fire.get(&trigger.id) {
                                Some(prev) if now.duration_since(*prev).as_secs() < secs => {}
                                Some(_) => {
                                    last_fire.insert(trigger.id.clone(), now);
                                    spawn_run(&app, &manager, &approvals, trigger);
                                }
                                None => {
                                    last_fire.insert(trigger.id.clone(), now);
                                }
                            }
                        }
                    }
                    Some(()) = reload_rx.recv() => {
                        let (w, w_list) = rebuild_watcher(&event_tx);
                        _watcher = w;
                        watched = w_list;
                    }
                    Some(path) = event_rx.recv() => {
                        let now = Instant::now();
                        for (watched_path, trigger) in watched.iter() {
                            if !path.starts_with(watched_path) && !watched_path.starts_with(&path) {
                                continue;
                            }
                            let recently = last_fire
                                .get(&trigger.id)
                                .map(|prev| now.duration_since(*prev).as_secs() < WATCH_DEBOUNCE_SECS)
                                .unwrap_or(false);
                            if !recently {
                                last_fire.insert(trigger.id.clone(), now);
                                spawn_run(&app, &manager, &approvals, trigger.clone());
                            }
                        }
                    }
                }
            }
        });

        engine
    }
}

fn spawn_run(
    app: &AppHandle,
    manager: &Arc<McpManager>,
    approvals: &Arc<ApprovalRegistry>,
    trigger: db::Trigger,
) {
    let app = app.clone();
    let manager = manager.clone();
    let approvals = approvals.clone();
    tauri::async_runtime::spawn(async move {
        crate::run_trigger(app, manager, approvals, trigger).await;
    });
}

/// Builds a fresh watcher for all enabled triggers that declare a watch path,
/// returning the watcher (kept alive by the caller) and the watched mapping.
fn rebuild_watcher(
    event_tx: &mpsc::UnboundedSender<PathBuf>,
) -> (Option<RecommendedWatcher>, Vec<(PathBuf, db::Trigger)>) {
    let triggers = db::list_triggers().unwrap_or_default();
    let tx = event_tx.clone();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            for path in event.paths {
                let _ = tx.send(path);
            }
        }
    }) {
        Ok(watcher) => watcher,
        Err(_) => return (None, Vec::new()),
    };

    let mut watched = Vec::new();
    for trigger in triggers.into_iter().filter(|t| t.enabled) {
        if let Some(path) = trigger.watch_path.clone() {
            if path.trim().is_empty() {
                continue;
            }
            let pb = PathBuf::from(&path);
            if watcher.watch(&pb, RecursiveMode::Recursive).is_ok() {
                watched.push((pb, trigger));
            }
        }
    }

    (Some(watcher), watched)
}
