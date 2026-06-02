# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

openMOON is an AI-powered macOS launcher with multi-MCP (Model Context Protocol) server integration for comprehensive system control. Built with Tauri (Rust backend + WebView) and React frontend, it provides natural language control over macOS services, applications, and system functions.

## Architecture

### Three-Layer Architecture

**Frontend (React/TypeScript)**: Located in `src/`
- [App.tsx](src/App.tsx) - Main UI component with input handling, suggestions, and workflows
- [main.tsx](src/main.tsx) - React entry point
- [hooks/](src/hooks/) - Custom React hooks:
  - [useMcp.ts](src/hooks/useMcp.ts) - MCP server lifecycle management
  - [useApps.ts](src/hooks/useApps.ts) - Application discovery and icon loading
  - [useQuickNotes.ts](src/hooks/useQuickNotes.ts) - Local note storage
  - [useRamMonitor.ts](src/hooks/useRamMonitor.ts) - Memory usage tracking
  - [useWindowManager.ts](src/hooks/useWindowManager.ts) - Dynamic window resizing
- Tailwind CSS with custom semi-transparent glass morphism design

**Backend (Rust/Tauri)**: Located in `src-tauri/src/`
- [main.rs](src-tauri/src/main.rs) - Application entry point with Tauri commands:
  - `send_prompt` - Routes user prompts through OpenAI to appropriate MCP tools
  - `execute_workflow` - Executes multi-step automated workflows
  - `get_all_applications` / `open_application` - macOS app management
  - `get_app_icon_path` - Native icon extraction using Cocoa APIs
  - Window setup with always-on-top and transparency
- [mcp_multi.rs](src-tauri/src/mcp_multi.rs) - Multi-server MCP manager:
  - Manages lifecycle of multiple MCP servers simultaneously
  - Handles JSON-RPC communication via stdin/stdout
  - Routes tool calls to appropriate server based on tool discovery
- [llm.rs](src-tauri/src/llm.rs) - OpenAI integration:
  - Converts user prompts into tool calls using GPT-4
  - Translates MCP tools into OpenAI function calling format
  - Handles multilingual intent recognition (English, Polish, etc.)
- [mcp.rs](src-tauri/src/mcp.rs) - Legacy single-server implementation (kept for reference)

**MCP Servers (Node.js)**: Located in `mcp-servers/`
- Configuration in [mcp-servers/config.json](mcp-servers/config.json)
- **apple** - Apple ecosystem via `bunx apple-mcp@latest` (Messages, Mail, Calendar, etc.)
- **filesystem** - File operations (read, write, search, list)
- **automation** - Extended macOS control (apps, network, display, power)
- **productivity** - Task management, notes, pomodoro, habits
- **browser** - Browser automation (URLs, tabs, bookmarks)
- **media** - Media control (music, screenshots, screen recording)

### Communication Flow

1. User types command in React UI
2. Frontend calls `invoke('send_prompt', { prompt })` via Tauri IPC
3. Rust backend sends prompt + all available tools to OpenAI API
4. OpenAI returns which tool to call with what parameters
5. `McpManager` routes the tool call to the appropriate MCP server
6. MCP server executes tool and returns result
7. Result formatted in `format_tool_response()` and displayed in UI

### Platform-Specific Features

The macOS window setup in [main.rs:610-624](src-tauri/src/main.rs#L610) uses Cocoa APIs to:
- Make titlebar transparent
- Set window collection behavior (join all spaces, stationary, fullscreen auxiliary)
- Enable always-on-top floating window

App icon extraction in [main.rs:434-537](src-tauri/src/main.rs#L434) uses NSWorkspace and NSBitmapImageRep to convert .app bundle icons to base64 PNG data.

## Development Commands

```bash
# Development mode (hot reload for both frontend and Rust)
npm run tauri:dev

# Production build
npm run tauri:build
# Output: src-tauri/target/release/bundle/macos/openMOON.app

# Frontend only (without Tauri)
npm run dev

# TypeScript compilation + Vite build
npm run build

# MCP server tests
npm run test:mcp          # Basic tests
npm run test:mcp:full     # Full functional tests
```

## Environment Setup

### Required Dependencies
- **Node.js** 18+
- **Rust** (install via [rustup](https://rustup.rs/))
- **Bun** for apple-mcp: `brew install oven-sh/bun/bun`
- **OpenAI API Key** - Set in `.env` file as `OPENAI_API_KEY=sk-...`

### Optional Dependencies
- **JetBrains Mono** font: `brew install --cask font-jetbrains-mono`

### First Time Setup
1. `npm install` - Install frontend dependencies
2. Create `.env` file in project root with `OPENAI_API_KEY=your_key_here`
3. `npm run tauri:dev` - This will install Rust dependencies and start dev server

## Configuration Files

- [tauri.conf.json](src-tauri/tauri.conf.json) - Window properties (transparent: true, decorations: false, alwaysOnTop: true), build commands, bundle settings
- [Cargo.toml](src-tauri/Cargo.toml) - Rust dependencies with platform-specific macOS deps (cocoa, objc)
- [package.json](package.json) - npm scripts and frontend dependencies
- [mcp-servers/config.json](mcp-servers/config.json) - MCP server definitions (command, args, description)
- `.env` - OpenAI API key (not in repo, create manually)

## Key Features

### Spotlight-Style App Launcher
- Type app name directly to launch (e.g., "Safari")
- Real-time app suggestions with icons from both `/Applications` and `/System/Applications`
- "Quit [app]" to close running applications

### AI-Powered Commands
- Natural language requests routed to appropriate MCP tools
- Multilingual support (English, Polish, Spanish, French, German)
- Examples: "send message to John", "take screenshot", "what's my battery"

### Workflows
- Multi-step automation stored in `~/Library/Application Support/openMOON/workflows/`
- JSON format with steps array containing action, params, and delay
- Execute via `execute_workflow` command

### Quick Notes
- "remember [something]" - Store quick notes
- "show notes" or "what did I remember" - View all notes
- "forget all" - Clear all notes
- Stored in localStorage

### Global Shortcut
- `Cmd+Shift+Space` - Toggle window visibility (registered in [main.rs:664-680](src-tauri/src/main.rs#L664))

## Styling Approach

Semi-transparent glass UI with:
- `rgba(0, 0, 0, 0.85)` background
- `backdrop-filter: blur(60px)` for glass effect
- Gradient border: yellow-orange to red-orange (`#FF8918` → `#A22904`)
- Rounded 3xl corners
- Monospace font (JetBrains Mono)
- Dynamic window resizing based on content

## Adding New MCP Servers

1. Add entry to [mcp-servers/config.json](mcp-servers/config.json):
```json
"myserver": {
  "command": "node",
  "args": ["mcp-servers/myserver/index.js"],
  "description": "My server description"
}
```

2. Create server implementation in `mcp-servers/myserver/`
3. Server must implement JSON-RPC 2.0 over stdin/stdout
4. Required methods: `initialize`, `tools/list`, `tools/call`
5. Restart application - server will auto-start and tools will be available

## Adding New Tauri Commands

1. Add function in [main.rs](src-tauri/src/main.rs) with `#[tauri::command]` macro
2. Add to `invoke_handler!` in [main.rs:684-698](src-tauri/src/main.rs#L684)
3. Call from frontend using `invoke<ReturnType>('command_name', { param: value })`

## Common Development Tasks

### Debugging MCP Communication
- MCP requests/responses are logged to stderr
- Check console in dev tools for frontend errors
- Use `list_mcp_tools` command to see available tools

### Testing Tool Execution
- Use Test Commands library (Cmd+K in app)
- Or manually invoke from frontend: `invoke('send_prompt', { prompt: 'test message' })`

### Window Not Positioning Correctly
- Window sizing logic is in [useWindowManager.ts](src/hooks/useWindowManager.ts)
- Depends on `containerRef` height measurement
- May need `setTimeout()` to wait for DOM updates

## Polish Language Features

The app includes Polish-to-English app name mapping in [main.rs:556-586](src-tauri/src/main.rs#L556) for common system apps:
- "przypomnienia" → "Reminders"
- "kalendarz" → "Calendar"
- "notatki" → "Notes"
- etc.

Add new mappings to the match statement if expanding Polish support.
