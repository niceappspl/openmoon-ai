# AGENTS.md — openMOON

Guidelines for AI agents (Claude, Cursor, Copilot, etc.) working in this codebase.

## Architecture overview

Three-layer system:
- **Frontend** — `src/` — React 18 + TypeScript + Tailwind CSS
- **Backend** — `src-tauri/src/` — Rust (Tauri 2), async agent loop, MCP host, security engine
- **MCP servers** — `mcp-servers/` — Node.js (stdio JSON-RPC 2.0)

## Key files

| File | Purpose |
|------|---------|
| `src-tauri/src/main.rs` | Tauri commands, tray, global shortcut, window setup |
| `src-tauri/src/llm.rs` | Agent loop + LlmProvider trait (OpenAI / Ollama) |
| `src-tauri/src/mcp_multi.rs` | MCP host — stdio + http/sse, O(1) tool routing |
| `src-tauri/src/security.rs` | Policy engine (auto / ask / deny) + audit log |
| `src-tauri/src/triggers.rs` | Cron scheduler + file watcher |
| `src-tauri/src/db.rs` | SQLite — notes, audit log, triggers |
| `src/App.tsx` | Main UI — prompt input, step streaming, approval card |
| `src/components/Settings.tsx` | Settings panel (permissions, security, triggers, audit) |
| `mcp-servers/automation/index.js` | ~40 macOS automation tools via AppleScript |

## Development commands

```bash
npm run tauri:dev        # dev server (hot reload frontend + Rust)
npm run tauri:build      # production .app bundle
npm run build            # TypeScript + Vite only
npm run test:mcp         # MCP server smoke tests
cd src-tauri && cargo fmt && cargo clippy && cargo test
```

## Code conventions

### Rust
- No bare `unwrap()` in production paths — use `map_err`, `?`, or `unwrap_or_default`
- Match existing module structure — don't create new files unless necessary
- Public functions get `///` doc comments

### TypeScript / React
- Functional components + hooks only
- No `any` — proper types throughout
- Business logic in hooks (`src/hooks/`), not in components

### MCP servers
- Each server is a self-contained Node.js module
- No `console.log` / `appendFileSync` debug output in production paths
- Tool parameters that control files, communication, or system state → default policy `ask`

## Security model

Every tool call passes through `security.rs` before execution:
- `auto` — silent execution (read-only, app launch, media)
- `ask` — shows approval card in UI, waits for user
- `deny` — always blocked

Policies are configurable per-tool. All decisions are recorded in SQLite audit log.

## What to avoid

- Do NOT add `console.log` / `eprintln!` that log user data (prompts, passwords, mail content)
- Do NOT use `current_dir()` for resolving config paths in production code
- Do NOT commit `.env`, `mcp-servers/config.json`, or any secrets
- Do NOT change public Tauri command signatures without updating all frontend callers
