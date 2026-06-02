# Architecture: prompt routing & cross-platform boundary

> Design doc backing two Phase-5 bets from [VISION.md](../VISION.md):
> **Bet A** (capability from tool descriptions, not a hardcoded prompt) and
> **Bet B** (cross-platform is an abstraction, not a rewrite).
>
> Status: **proposed**. This is the agreed direction before code is written, so
> incoming contributors build on the target shape, not the current debt.

---

## Part 1 — System-prompt refactor (Bet A)

### Problem

`build_system_prompt` in [`src-tauri/src/llm.rs`](../src-tauri/src/llm.rs) hardcodes ~160 lines
of intent rules: per-tool keyword tables, EN/PL phrase lists, "if user says X call tool Y"
mappings, and macOS-specific routing. Concretely this means:

- **It doesn't scale.** Every new tool or MCP server needs hand-written prompt rules.
- **It contradicts Pillar 2** (open MCP host): a third-party server can't "just work" if the
  prompt has no rules for its tools.
- **It blocks cross-platform.** The prompt is full of macOS app names and behaviours.
- **It's brittle.** Routing quality depends on a giant prose lookup table instead of the
  structured tool schemas the model already receives.

### Principle

> The **tool descriptions** (already passed to the model via `tools/list`) carry *what each
> tool does*. The **system prompt** should carry only *how the agent behaves* — never a
> per-tool lookup table.

### Target system prompt (behaviour only)

Keep ~5 short sections, all tool- and platform-agnostic:

1. **Identity & date/time context** (keep the live date injection — it's correct and useful).
2. **Agent loop contract** — call tools, observe results, chain, stop with a concise final
   answer when done. (Already present and good.)
3. **Routing principle** — prefer tools for actionable requests; choose the tool whose
   *description* best matches intent; only answer in plain text when no tool fits or the task
   is done.
4. **Language-agnostic intent** — understand the user in any language; do not rely on a fixed
   keyword list.
5. **Safety posture** — never assume an action succeeded without a tool result; respect that
   some actions require approval (the host enforces this — see Part of `security.rs`).

Everything currently under `CRITICAL PATTERN MATCHING`, `INTENT RECOGNITION`, `SMART ROUTING`,
`EXAMPLES OF SMART ROUTING`, the EN/PL phrase tables, and the per-server `*_INTENT` blocks is
**deleted from the prompt** and pushed into where it belongs:

### Where the deleted knowledge goes

| Old prompt content | New home |
|---|---|
| "tool X does Y / call X when user says Z" | The tool's own `description` in its MCP server |
| `open spotify and play X → search_and_play` disambiguation | Sharper `search_and_play` description ("plays media by query; use this instead of open_app when a song/artist is named") |
| macOS app-name localisation (`pogoda → Pogoda`) | The `automation` server's `open_app` (already does fuzzy/locale matching) |
| "yes after mail check → mail_read" conversational glue | Rely on session history + clear tool descriptions; do not encode in prompt |

### Acceptance criteria

- System prompt is **under ~40 lines** and references **zero specific tool names**.
- Adding a new MCP server changes routing behaviour **with no prompt edit**.
- A regression set of representative prompts (EN + PL) routes to the same tools as today.
  Capture these as fixtures (see [Testing](#testing)) **before** refactoring.

### Migration order (safe)

1. Add a routing-regression fixture set (prompts → expected tool) using the current prompt as
   the baseline (golden file).
2. Audit each bundled server's tool `description`s; enrich any that relied on prompt rules.
3. Replace `build_system_prompt` body with the behaviour-only version behind a setting/flag.
4. Run fixtures against both prompts; close gaps by improving **descriptions**, not the prompt.
5. Remove the flag once parity holds.

---

## Part 2 — `PlatformAutomation` boundary (Bet B)

### Current state

- The Rust core (`llm.rs` `run_agent`, `security.rs`, `mcp_multi.rs`) is already
  **platform-agnostic** — good, keep it that way.
- [`src-tauri/src/main.rs`](../src-tauri/src/main.rs) already gates native bits with
  `#[cfg(target_os = "macos")]` / `#[cfg(not(target_os = "macos"))]` (window setup, Cocoa icon
  extraction). This is the right pattern — extend it, don't fight it.
- The **real blocker** is [`mcp-servers/automation/index.js`](../mcp-servers/automation/index.js):
  ~40 tools implemented entirely via **AppleScript / `osascript`**. None of it runs off macOS.

### Principle

> Platform-specific capability lives **only** in (a) `cfg`-gated native helpers in `main.rs`
> and (b) a **platform-specific `automation` MCP server**. The agent core never knows which OS
> it's on.

### Two boundaries, two responsibilities

**Boundary 1 — Rust native helpers (`main.rs`).** Already partially done. Define a small
internal trait so the macOS-only functions (icon extraction, window collection behaviour,
global shortcut quirks) have a typed contract and a stub fallback:

```rust
// proposed: src-tauri/src/platform/mod.rs
pub trait PlatformShell {
    fn app_icon_path(&self, bundle_or_exe: &str) -> Option<String>;
    fn configure_window(&self, window: &tauri::Window);
    // ... only things that genuinely need OS APIs
}

#[cfg(target_os = "macos")]   pub use macos::MacShell as Shell;
#[cfg(target_os = "windows")] pub use windows::WinShell as Shell;
```

This is a mechanical extraction of the existing `cfg` blocks into one place — no behaviour
change on macOS.

**Boundary 2 — platform `automation` MCP server.** This is where most porting effort goes.
The **tool contract is the boundary**: the same tool names and schemas, different
implementation per OS.

| Tool (stable name/schema) | macOS impl | Windows impl |
|---|---|---|
| `open_app`, `quit_app`, `get_running_apps` | AppleScript / `osascript` | PowerShell / `Start-Process` / `Get-Process` |
| `set_volume`, `set_brightness`, `toggle_dark_mode` | AppleScript | PowerShell / registry / WinAPI |
| `lock_screen`, `sleep_display`, `restart/shutdown` | AppleScript | `rundll32` / `shutdown.exe` |
| `show_notification` | AppleScript | Windows toast |
| Mail/Calendar/Messages/Reminders/Notes/Contacts | Apple apps via AppleScript | **out of scope for native parity** — provide via cross-platform MCP servers (Gmail/Outlook/etc.) |

Recommended layout:

```
mcp-servers/
  automation-macos/     # current index.js, renamed
  automation-windows/   # new, same tool names/schemas
  automation/           # thin launcher that selects by process.platform (or set in config.json)
```

`config.json` picks the right server per platform; the agent sees identical tool names either
way, so **`llm.rs` and the prompt never change**.

### What is explicitly NOT ported 1:1

Apple-app integrations (Mail/Calendar/Messages/…) have no Windows equivalent. Don't fake them.
On Windows those capabilities come from **cross-platform MCP servers** (e.g. a Gmail or Outlook
MCP server) — which is exactly Pillar 2 working as designed.

### Acceptance criteria

- Building for Windows compiles with **no changes** to `llm.rs`, `security.rs`, `mcp_multi.rs`.
- All `#[cfg(target_os)]` in `main.rs` resolve through the `platform` module, not inline.
- `automation-windows` implements the system/app/notification subset with matching tool
  schemas; tool names are identical to macOS.
- `security.rs::categorize` already covers these tool names — confirm no new uncategorized
  tools slip through to the global default.

---

## Testing

- **Routing fixtures** (Part 1): a JSON list of `{ prompt, expected_tool }` run against a mock
  `LlmProvider`, asserting the model is *offered* the right tools and the agent loop dispatches
  correctly. Lives next to existing MCP tests.
- **Platform parity** (Part 2): each `automation-*` server runs the existing
  `mcp-servers/tests` smoke suite; tool list and schemas must match across platforms.
- **Security**: `security.rs` already has unit tests — extend `categorize` coverage if new
  tool names are introduced.

---

## Tracking

This document is the spec for the Phase-5 architecture issues. The prompt refactor (Part 1) is
the prerequisite for the MCP marketplace and plugin API; the platform boundary (Part 2) is the
prerequisite for the Windows/Linux tracking issue.
