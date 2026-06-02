# Execution plan — reaching the North Star

> The full task breakdown to get from "launcher that does things" to an
> **autonomous agent you delegate to** — driving any app and the browser,
> running tasks in the background, verifying its own results.
>
> Read [VISION.md](../VISION.md) (the *why*) and [ROADMAP.md](../ROADMAP.md)
> (the *phases*) first. This document is the *how* — the concrete tasks,
> their order, and their dependencies. Each task maps to a GitHub issue.

---

## How to read this

- **Workstreams** are parallel tracks. Within a workstream, tasks are mostly sequential.
- **Effort**: `S` ≈ <1 day · `M` ≈ a few days · `L` ≈ 1–2 weeks.
- **gfi** = good first issue (self-contained, well-bounded, low-context).
- **Epic** = the parent tracking issue the task rolls up to.
- The **critical path** to the North Star is: WS-1 → (WS-3 ∥ WS-4) → WS-5 → WS-6.

```
v0.1 release ──┐
               ├─► WS-1 prompt refactor ─┬─► WS-3 browser ─┐
WS-2 platform ─┘   (unblocks routing)    └─► WS-4 computer ├─► WS-5 background ─► WS-6 verify
                                                            ┘        runner
WS-7 safety-at-scale runs alongside WS-3..6
WS-8 ecosystem runs in parallel throughout
```

---

## Milestones

| Milestone | Theme | What "done" means |
|---|---|---|
| **v0.1 — Public Release** | Installable & trustworthy | A non-developer can install a signed `.dmg`, run locally on Ollama, and trust the approval/audit model |
| **v0.2 — Ecosystem** | Open MCP host grows | Behaviour-only prompt; more servers/providers; marketplace; plugin API |
| **v0.3 — Cross-platform** | Beyond macOS | `PlatformAutomation` boundary; Windows automation server |
| **v0.4 — Universal autonomous control** | The North Star | Browser + computer-use + background runner + self-verification |

---

## WS-0 — Release & foundation  *(milestone v0.1)*

Get it into people's hands and make autonomy *safe to grow into*.

| ID | Task | Depends on | Effort | gfi | Issue/Epic |
|----|------|-----------|--------|-----|-----------|
| 0.1 | First public `.dmg` GitHub Release | — | M | | #12 |
| 0.2 | CI: build & attach signed/notarised `.dmg` on tag | 0.1 | M | | new |
| 0.3 | Homebrew cask | 0.1 | S | | #13 |
| 0.4 | Better Ollama: model picker, tool-calling validation, fallback | — | M | | #16 |
| 0.5 | First-run onboarding: request Accessibility & Screen Recording permissions | — | M | | new |
| 0.6 | Token counter in UI | — | S | ✓ | #3 |
| 0.7 | Syntax highlighting in responses | — | S | ✓ | #7 |
| 0.8 | Dark / light theme | — | S | ✓ | #4 |
| 0.9 | Session history browser | — | M | ✓ | #20 |

> 0.5 is here (not in v0.4) on purpose: permissions onboarding is needed before computer-use and is best designed once, early.

---

## WS-1 — Behaviour-only prompt  *(epic #21 · milestone v0.2)*  **← critical-path prerequisite**

Capability must come from tool descriptions, not a 160-line hardcoded prompt. Without this, every new browser/computer-use/MCP tool would need prompt edits.

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 1.1 | Routing-regression harness: mock `LlmProvider`, assert prompt→tool dispatch | — | M | |
| 1.2 | Capture golden routing fixtures (EN + PL) against current prompt | 1.1 | S | ✓ |
| 1.3 | Audit & enrich tool descriptions — `automation` server | 1.2 | M | |
| 1.4 | Audit & enrich tool descriptions — filesystem/browser/media/productivity | 1.2 | S | ✓ |
| 1.5 | Rewrite `build_system_prompt` → behaviour-only (<40 lines), behind a flag | 1.3, 1.4 | M | |
| 1.6 | Reach fixture parity by improving descriptions; remove the flag | 1.5 | M | |

---

## WS-2 — PlatformAutomation boundary  *(epic #21 · milestone v0.3)*

Keep the agent core OS-agnostic so cross-platform is an implementation, not a rewrite.

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 2.1 | Extract `main.rs` `#[cfg(target_os)]` helpers into a `platform` module + trait | — | M | |
| 2.2 | Split `automation` server → `automation-macos` + thin platform launcher | 2.1 | M | |
| 2.3 | Scaffold `automation-windows` (system/app/notification subset, matching schemas) | 2.2 | L | |

---

## WS-3 — Real browser control (rung 3)  *(epic #22 · milestone v0.4)*

DOM-level control of a real browser. Preferred over computer-use for the web (more reliable).

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 3.1 | Scaffold `browser-web` MCP server (Playwright/CDP lifecycle, launch/attach) | WS-1 | M | |
| 3.2 | `browser_navigate` / `browser_back` / `browser_forward` | 3.1 | S | ✓ |
| 3.3 | `browser_snapshot` — accessibility/DOM tree the model reasons over | 3.1 | M | |
| 3.4 | `browser_click` / `browser_type` / `browser_select` (by ref from snapshot) | 3.3 | M | |
| 3.5 | `browser_extract` — read text/attributes | 3.3 | S | ✓ |
| 3.6 | `browser_download` / `browser_upload` | 3.4 | M | |
| 3.7 | `browser_wait_for` + robustness (timeouts, retries, navigation waits) | 3.4 | S | |
| 3.8 | Persistent session/context + privacy doc (reuse user login safely) | 3.1 | M | |
| 3.9 | Security categorisation (`security.rs`) + smoke tests | 3.4 | S | ✓ |

---

## WS-4 — Computer use (rung 4)  *(epic #23 · milestone v0.4)*

The universal fallback: drive *any* app via the OS accessibility tree (+ screenshots).

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 4.1 | Permission flow: macOS Accessibility (AX) + Screen Recording | WS-0.5 | M | |
| 4.2 | `screen_capture` (screen/window) tool | 4.1 | S | ✓ |
| 4.3 | `ui_tree` — AX element tree (role, label, value, bounds) for focused app | 4.1 | L | |
| 4.4 | `ui_click` / `ui_type` / `ui_key` | 4.3 | M | |
| 4.5 | `ui_set_value` / `ui_focus_app` | 4.3 | S | |
| 4.6 | UI indicator + audit note: "acting via computer-use (less reliable)" | 4.4 | S | ✓ |
| 4.7 | Security: all state-changing UI actions default `ask`; tests | 4.4 | S | |
| 4.8 | (later) Windows UI Automation (UIA) implementation | 4.4, WS-2 | L | |

---

## WS-5 — Background task runner (rung 5)  *(epic #24 · milestone v0.4)*  **← the core of the vision**

"Give it a task, it runs in the background, it gets done."

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 5.1 | `tasks` table + `db.rs` CRUD (goal, status, result, step log) | — | M | |
| 5.2 | Background executor: run `run_agent` off the UI thread, tray-resident | 5.1 | L | |
| 5.3 | Lifecycle state machine (queued→running→needs-approval→done/failed/cancelled) + progress events | 5.2 | M | |
| 5.4 | Tasks panel UI (list, live status, cancel, view full log) | 5.3 | M | (frontend) |
| 5.5 | Completion notification + "needs your decision" surfacing | 5.3 | S | ✓ |
| 5.6 | Retry/backoff for transient failures + hard step/time limits | 5.3 | S | |
| 5.7 | Per-task autonomy level (fully-autonomous auto-rejects `ask`, like triggers) | 5.3, WS-7 | S | |
| 5.8 | Resume / replay a finished task | 5.3 | M | |

---

## WS-6 — Self-correction & verification (rung 6)  *(epic: new · milestone v0.4)*

A background agent that can't check its own work is a liability.

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 6.1 | Post-condition verification hook in the agent loop (re-read/re-query goal state) | WS-5 | M | |
| 6.2 | Retry-on-failed-verification policy (bounded) before escalating to user | 6.1 | S | |
| 6.3 | Capability fallback enforcement: tool → browser DOM → computer-use, with chosen rung surfaced in UI/audit | WS-3, WS-4 | M | |

---

## WS-7 — Safety at scale  *(epic: new · milestone v0.4)*  **(runs alongside WS-3..6)**

The more power, the more the security model matters. Autonomy ≠ unsupervised risk.

| ID | Task | Depends on | Effort | gfi |
|----|------|-----------|--------|-----|
| 7.1 | Pending-approvals queue UI for background tasks (don't lose a paused `ask`) | WS-5 | M | (frontend) |
| 7.2 | Audit log viewer improvements (filter by task, tool, decision) | — | S | ✓ |
| 7.3 | Dry-run / preview mode for risky multi-step chains | — | M | |

---

## WS-8 — Ecosystem  *(milestone v0.2 · parallel throughout)*

Each new MCP server/provider expands what the agent can do for free.

| ID | Task | Effort | gfi | Issue |
|----|------|--------|-----|-------|
| 8.1 | Slack MCP server | S | ✓ | #1 |
| 8.2 | GitHub MCP server | S | ✓ | #5 |
| 8.3 | Notion MCP server | S | ✓ | #8 |
| 8.4 | Anthropic Claude provider | M | ✓ | #6 |
| 8.5 | MCP server marketplace (curated, one-click install) | L | | #14 |
| 8.6 | Plugin/extension API (third-party Settings pages/cards) | L | | #18 |
| 8.7 | Webhook trigger type | M | | #2 |
| 8.8 | System-event triggers (network/display/app-launch) | M | | #15 |
| 8.9 | Keyboard shortcut customisation | S | | #9 |
| 8.10 | Voice input (Whisper) | M | | #11 |
| 8.11 | Wake word detection | M | | #17 |
| 8.12 | Context-aware suggestions | M | | #19 |

---

## Suggested sequencing (for maintainers assigning work)

1. **Ship v0.1** (WS-0.1–0.4) so people can actually run it. In parallel, WS-0.5 permission onboarding.
2. **Land WS-1** (prompt refactor) — unblocks every new capability routing.
3. **Fork effort**: WS-3 (browser) and WS-4 (computer-use) can proceed in parallel — different skill sets (web/Playwright vs. macOS/Rust AX).
4. **WS-5** (background runner) — the moment openMOON becomes "delegate-and-walk-away". Start 5.1–5.3 as soon as WS-1 is stable; it doesn't strictly need WS-3/4.
5. **WS-6** verification + **WS-7** safety harden autonomy before we call it done.
6. **WS-8** ecosystem is a steady parallel stream — great for new contributors via `good first issue`.

## Definition of North Star done

A user types *"download this month's invoices from the supplier portal and file them in ~/Finance"*, closes the window, and later gets a notification: **done** — with the agent having driven the browser (with approval at login/download), filed the files, and verified each one exists. Every step is in the audit log. It ran fully locally if the user chose Ollama.
