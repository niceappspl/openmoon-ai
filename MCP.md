# MCP Servers

openMOON is a full [Model Context Protocol](https://modelcontextprotocol.io) host. It runs local stdio servers and connects to remote HTTP/SSE servers. The agent picks the right tool automatically — no configuration needed per task.

## How it works

```
User prompt → Agent loop (llm.rs) → McpManager (mcp_multi.rs) → server → tool result
```

`McpManager` maintains an O(1) routing cache — tool name → server name — refreshed automatically when new servers are added.

---

## Bundled servers

### `automation` — macOS automation (~44 tools)

The core server. Controls apps, system, and native macOS apps via AppleScript.

| Category | Tools |
|----------|-------|
| **Apps** | `open_app` `quit_app` `get_running_apps` `get_installed_apps` `focus_mode` |
| **System** | `get_system_info` `get_battery_status` `lock_screen` `sleep_display` `restart_computer` `shutdown_computer` `set_volume` `set_brightness` `toggle_dark_mode` `empty_trash` `run_shell_command` |
| **Clipboard** | `get_clipboard` `set_clipboard` `type_text` |
| **Notifications** | `show_notification` `take_screenshot` |
| **Wi-Fi / Bluetooth** | `get_wifi_info` `wifi_scan` `wifi_connect` `toggle_wifi` `toggle_bluetooth` |
| **Windows** | `window_manage` |
| **Mail** | `mail_unread` `mail_read` `mail_search` `mail_send` |
| **Calendar** | `calendar_events` `calendar_create` |
| **Messages** | `messages_send` |
| **Reminders** | `reminders_list` `reminders_create` |
| **Notes** | `notes_list` `notes_create` |
| **Contacts** | `contacts_search` |
| **Maps** | `maps_search` `maps_directions` |
| **Time** | `get_current_date` `get_current_time` |

---

### `filesystem` — File operations (5 tools)

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write / create a file |
| `list_directory` | List directory contents |
| `search_files` | Search by name or content |
| `get_file_info` | Metadata (size, dates, permissions) |

Scope is limited to `$HOME` and `~/Library/Application Support/openMOON/` by default. Extra paths can be added in Settings → Security → Allowed paths.

---

### `browser` — Browser control (6 tools)

| Tool | Description |
|------|-------------|
| `open_url` | Open URL in default browser |
| `search_web` | Google/DuckDuckGo search |
| `get_active_tab_info` | URL + title of current tab |
| `list_open_tabs` | All open tabs |
| `close_tab` | Close by index |
| `reload_tab` | Reload current tab |

---

### `media` — Media playback & capture (11 tools)

| Tool | Description |
|------|-------------|
| `play_pause_media` | Play / pause |
| `next_track` / `previous_track` | Track navigation |
| `get_current_track` | Now playing info |
| `set_media_volume` | Volume control |
| `search_and_play` | Search by artist / title and play |
| `create_playlist` | Create a new playlist |
| `add_to_playlist` | Add track to playlist |
| `toggle_shuffle` | Toggle shuffle |
| `toggle_repeat` | Set repeat (off / one / all) |
| `capture_screenshot` | Fullscreen, window, or selection screenshot |

---

### `productivity` — Tasks, notes & focus (11 tools)

| Tool | Description |
|------|-------------|
| `create_task` / `list_tasks` / `complete_task` / `delete_task` | Task management |
| `create_note` / `search_notes` | Simple note storage |
| `create_reminder` | One-off reminders |
| `start_pomodoro` / `start_break` / `get_pomodoro_stats` | Pomodoro timer |
| `track_habit` / `get_habit_streak` | Habit tracking |

Data stored in `~/Library/Application Support/openMOON/`.

---

## Adding a custom server

Any MCP-compliant server works. Add it to `mcp-servers/config.json` and restart:

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "node",
      "args": ["mcp-servers/my-tools/index.js"],
      "description": "My custom tools"
    }
  }
}
```

Remote servers (HTTP/SSE) are supported too:

```json
{
  "mcpServers": {
    "remote": {
      "transport": "http",
      "url": "https://my-server.example.com/mcp",
      "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
    }
  }
}
```

`${VAR}` placeholders are expanded from `.env` at startup.

---

## Planned integrations

Contributions welcome — pick an item, open a PR.

### Communication & productivity
| Service | Status | Issue |
|---------|--------|-------|
| **Slack** — send messages, read channels, list channels | Planned | [#1](https://github.com/niceappspl/openmoon/issues/1) |
| **Notion** — search pages, create/append content | Planned | [#8](https://github.com/niceappspl/openmoon/issues/8) |
| **GitHub** — list PRs/issues, post comments, read files | Planned | [#5](https://github.com/niceappspl/openmoon/issues/5) |
| **Linear** — create/list issues, update status | Planned | — |
| **Jira** — create/list tickets | Planned | — |
| **Discord** — send messages, read channels | Planned | — |
| **Telegram** — send/receive messages | Planned | — |

### AI & data
| Service | Status | Issue |
|---------|--------|-------|
| **Anthropic Claude** provider | Planned | [#6](https://github.com/niceappspl/openmoon/issues/6) |
| **Gemini** provider | Planned | — |
| **Perplexity** — web search with citations | Planned | — |
| **Wolfram Alpha** — calculations & data | Planned | — |

### Developer tools
| Service | Status | Issue |
|---------|--------|-------|
| **Terminal / shell** — run commands with approval | Planned | — |
| **VS Code** — open files, run tasks, read diagnostics | Planned | — |
| **Docker** — list containers, start/stop | Planned | — |
| **PostgreSQL / SQLite** — run queries | Planned | — |

### Cloud & services
| Service | Status | Issue |
|---------|--------|-------|
| **Google Drive** — search, read, create docs | Planned | — |
| **Google Calendar** — read/create events (alternative to native) | Planned | — |
| **Spotify Web API** — extended control beyond AppleScript | Planned | — |
| **Home Assistant** — smart home control | Planned | — |
| **Obsidian** — read/write vault notes | Planned | — |

---

> Want to add a server? See [CONTRIBUTING.md](CONTRIBUTING.md) — the MCP server checklist is in the *Adding a new MCP server* section.
