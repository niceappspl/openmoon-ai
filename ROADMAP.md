# openMOON — Roadmap

> Direction document: **what** we are building, **in what order**.
> The product **why** and the strategic bets live in [VISION.md](VISION.md) — read that first.
> One goal: make openMOON the local AI agent that genuinely works on your behalf.

---

## 1. What openMOON is (in one sentence)

**A local, macOS-native AI agent that understands your goal and executes it autonomously — controlling apps, files and the system via the Model Context Protocol (MCP), running entirely locally and privately.**

What it is **not**:
- a chatbot (it doesn't just talk),
- a launcher / Spotlight replacement (it doesn't just open apps),
- a ChatGPT wrapper (it doesn't require the cloud).

It is: an **executive system agent** — you say *what* you want to achieve, it selects the tools and does it step by step.

---

## 2. What makes it different

The market today looks like this:
- **Raycast AI** — native, great UX, but closed-source, paid, cloud-dependent.
- **Claude Desktop** — MCP host, but **does not automate macOS** (no app launching, no system control).
- **Open Interpreter / CLI agents** — powerful, but non-native, no UX, risky.

**The gap we fill:**

> **Open-source, local-first AI agent native to macOS, acting as a full MCP host — with real system access and a security model.**

The revolution is not "another AI", it is combining four things that nobody else has together:
1. **Native macOS automation** (apps, files, system, media, communications).
2. **A real agentic loop** (multi-step tasks, not single commands).
3. **Full MCP host** (plug in any MCP server from the wider ecosystem, not just ours).
4. **Local-first + privacy + open source** (run entirely on a local model, no cloud required).

---

## 3. Concrete scenarios

| You say | openMOON does (multi-step, on its own) |
|---------|--------------------------------------|
| "Open project CodexY, start the backend, show logs" | Opens editor, runs terminal, starts backend, streams logs. |
| "Enable focus mode for 2 hours" | Enables DND, closes Slack, sets timer, mutes notifications. |
| "Summarise today's work" | Reads git, calendar and files; generates a summary note. |
| "Find the invoice email and reply that I'll pay on Friday" | Finds the mail, reads it, drafts reply, **asks for approval**, sends. |
| "Every Friday at 17:00 run a backup and report" | Saves as an automation with a cron trigger. |

Key difference from today: **action chains + context + approval gates for risky steps.**

---

## 4. Starting point — what we already have

- ✅ Native macOS integration: icon extraction (Cocoa), glass always-on-top window, global shortcut `Cmd+Shift+Space`, app launching.
- ✅ Working multi-server **MCP manager** (Rust, JSON-RPC over stdio).
- ✅ ~70 tools across 5 servers: `automation` (apps/system/network/mail/maps/calendar/messages/reminders/notes/contacts), `filesystem`, `productivity`, `browser`, `media`.
- ✅ React/Tauri UI, JSON workflows, Quick Notes.
- ✅ **Agentic loop** (`run_agent` with step limit, tool chaining, streamed steps to UI).
- ✅ **Session memory** (per-window conversation history).
- ✅ **LLM provider abstraction** — OpenAI and Ollama (fully local inference).
- ✅ **Security model** — per-tool `auto/ask/deny`, approval card in UI, path allowlist, SQLite audit log.
- ✅ **Triggers** — cron schedule + file watcher engine.
- ✅ Remote MCP servers (Streamable HTTP / SSE transport).
- ✅ MIT licence.

---

## 5. Phase plan

### Phase 1 — Agentic foundation *(done)*
- [x] **1.1 Agentic loop** (`llm.rs` + `main.rs:send_prompt`): model → tool → result back to model → next step → final answer. Step limit, tool call IDs, `tool` role messages.
- [x] **1.2 Step streaming** to UI (Tauri events + `listen` in frontend).
- [x] **1.3 Routing cache** in `McpManager` (`tool_name → server`, O(1) lookup).
- [x] **1.4 Session memory** — per-window conversation history (eliminates "yes after mail" workarounds).

### Phase 2 — MCP host + provider independence *(done)*
- [x] **2.1 Standard MCP client** — `stdio` + `http/sse` (Streamable HTTP) transport.
- [x] **2.2 LLM abstraction** — `trait LlmProvider`: OpenAI / **Ollama (local)** / extensible; selectable in Settings.
- [x] **2.3 Long-term memory** — SQLite (`rusqlite`), notes migrated from localStorage.

### Phase 3 — Automation platform *(done)*
- [x] **3.1 Security model** — per-tool `auto/ask/deny`, approval card, path allowlist, audit log.
- [x] **3.2 Triggers** — cron schedule, file-watcher, events → execute saved tasks (tray/background).
- [x] **3.3 AI-generated workflows** — NL → execution → "Save as workflow" (repeatable without re-running LLM).

### Phase 4 — Open source release *(in progress)*
- [x] Cleanup: removed `App.tsx.backup`, legacy dev scripts, empty server stubs.
- [x] English README + architecture diagram + security section.
- [x] Example configs (provider + MCP), onboarding < 5 min.
- [x] CI: Tauri build (macOS), Rust lint/tests, MCP tests.
- [ ] First public GitHub release with pre-built `.dmg`.
- [ ] Publish to Homebrew cask.

### Phase 5 — Ecosystem & community
> Architectural prerequisites for this phase are specified in
> [docs/platform-and-prompt-architecture.md](docs/platform-and-prompt-architecture.md).
- [ ] **System-prompt refactor** *(unblocks everything below)* — move from a hardcoded ~160-line macOS/EN/PL intent table to behaviour-only prompt + clean tool descriptions, so any MCP server works without prompt edits.
- [ ] **`PlatformAutomation` boundary** — extract native control behind a trait + platform `automation` MCP server, so cross-platform is an implementation, not a rewrite.
- [ ] **Plugin/extension API** — allow third-party MCP servers to declare UI extensions (settings page, custom cards).
- [ ] **Windows and Linux** — implement the `PlatformAutomation` boundary for each target; keep `llm.rs` / `security.rs` platform-agnostic.
- [ ] **Webhook triggers** — HTTP endpoint that fires a saved task.
- [ ] **System-event triggers** — network change, display connect/disconnect, app launch.
- [ ] **Voice input** — Whisper integration for hands-free commands.
- [ ] **Better Ollama compatibility** — model picker, automatic fallback for models without tool calling.
- [ ] **MCP server marketplace** — curated list of community MCP servers with one-click install.

### Phase 6 — Universal autonomous control *(the North Star)*
> This is the leap from "launcher that does things" to "an agent you delegate to".
> See [VISION.md §1a — The North Star](VISION.md) and the capability ladder (rungs 3–6).
> Depends on the Phase 5 prompt refactor (so new capabilities route without prompt edits).
- [ ] **Real browser control (rung 3)** — DOM-level automation MCP server (navigate, click, fill, extract, download) via Playwright/CDP, replacing "open URL only".
- [ ] **Computer use (rung 4)** — screen capture + accessibility tree → click/type at element/coordinate, so *any* app is controllable without a bespoke tool. macOS Accessibility (AX) first, then Windows UI Automation.
- [ ] **Background task runner (rung 5)** — first-class "task" concept: long-running autonomous jobs with status, progress events, retries, cancellation, and completion notifications. Builds on the existing trigger engine.
- [ ] **Self-correction & verification (rung 6)** — agent verifies the goal was met (re-read/re-query) and retries or escalates instead of reporting false success (VISION Bet F).
- [ ] **Capability fallback policy** — enforce preference order: dedicated tool → browser DOM → computer-use (VISION Bet E), with the chosen rung surfaced in the UI/audit log.

---

## 6. Risks & open questions

- **Reliability of computer-use** — pixel/AX-driven actions are brittle; mitigate with the tool→DOM→computer-use preference order and mandatory verification (Bet E/F).
- **Permissions** — universal control needs macOS Accessibility & Screen Recording permissions (and Windows UI Automation); onboarding must request these clearly without scaring users.
- **Safety surface grows with autonomy** — background, self-directed runs must keep approval gates for risky tools and never disable the audit log.

- Tool calling quality in Ollama depends heavily on the model — need to document recommended models and add a fallback.
- Agent loop cost: more LLM calls per task → hard step limit + token counter per session.
- Windows/Linux: Cocoa-dependent features (icon extraction, window behaviour) need platform-specific implementations.

---

## 7. Definition of done

openMOON is "ready" when:
1. It can execute a **multi-step task** from a single natural-language command.
2. It runs **fully locally** (Ollama) without sending data to the cloud.
3. It connects **any MCP server** from the ecosystem in seconds.
4. It **asks for approval** before risky actions and logs everything it does.
5. It can be installed from GitHub and launched in **< 5 minutes**.
6. *(North Star)* It can be **delegated a goal** and complete it **autonomously in the background** — driving any app or the browser, verifying the result, and notifying you when done.

> *"openMOON doesn't ask — it understands. It doesn't talk — it acts. It is not an app — it is a presence."*
