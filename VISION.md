# openMOON — Product Vision

> This is the **why** and **what** of openMOON. For the **how** and **when**, see [ROADMAP.md](ROADMAP.md).
> If you're a new contributor, read this first — it tells you what we are building and, just as importantly, what we are *not*.

---

## 1. One sentence

**openMOON is a local-first, privacy-respecting autonomous agent that can operate your computer the way you do — driving any app, the system and the browser to carry out multi-step tasks in the background, asking for approval only before anything risky.**

You hand it a goal. It does the work — on its own, in the background — and it gets done.

---

## 1a. The North Star

> **An autonomous agent that can perform practically any action a human can on the machine — across every app and the browser — given a task in plain language and left to complete it in the background.**

This is the destination. Not "an assistant with 77 buttons", but a system-level operator that can be *delegated to*. Three commitments define it:

1. **Universal control.** It is not limited to apps we wrote a tool for. Through OS accessibility/UI automation and browser control, it can drive *any* application — the long tail, not just the integrations.
2. **Autonomous, background execution.** You assign a task and walk away. It runs as a background job, makes progress on its own, recovers from small failures, and notifies you when done (or when it genuinely needs a decision).
3. **Trustworthy by construction.** The more power it has, the more the security model (Pillar 3) matters. Autonomy never means unsupervised risk — approval gates and the audit log scale *with* capability, not against it.

### The capability ladder (how we get there)

Each rung is real, shippable, and builds on the last. We climb it in order.

| Rung | Capability | Status |
|---|---|---|
| 1 | **Curated tools** — discrete, reliable actions via MCP servers (apps, files, system, media, comms) | ✅ shipped |
| 2 | **Agentic chaining** — multi-step tasks from one command, streamed live | ✅ shipped |
| 3 | **Real browser control** — DOM-level automation (navigate, click, fill, extract), not just "open URL" | 🔜 next |
| 4 | **Computer use** — screen + accessibility tree → click/type anywhere, so *any* app is controllable without a bespoke tool | 🔜 next |
| 5 | **Background task runner** — long-running, autonomous jobs with progress, retries, and completion notifications | 🔜 next |
| 6 | **Self-correction & verification** — the agent checks its own results and retries until the goal is actually met | planned |

Rungs 3–5 are the leap from "launcher that does things" to "agent you delegate to". They are the core of the next phase.

---

## 2. What it is — and is not

| openMOON **is** | openMOON **is not** |
|---|---|
| An **executive system agent** — it acts | A chatbot — it doesn't just talk |
| A **universal operator** — drives any app & the browser | Limited to apps we wrote a tool for |
| A task you **delegate** — runs in the background | A command you babysit click-by-click |
| A **full MCP host** — plug in any server | A closed, fixed-feature app |
| **Local-first** — runs offline on Ollama | A cloud service / ChatGPT wrapper |
| **Security-first** — approval + audit per action | A "yolo" automation script |
| A floating presence (`Cmd+Shift+Space`) | A Spotlight / launcher replacement |

If a proposed feature pushes us toward the right-hand column, we say no.

---

## 3. The three pillars (our only real moat)

Everything we build must strengthen at least one of these. They are the reason openMOON can exist next to Raycast AI, Claude Desktop and Open Interpreter.

### Pillar 1 — Local-first & private
The agent must run **fully offline** on a local model (Ollama) with zero data leaving the machine. Cloud providers (OpenAI, later Anthropic/Gemini) are an *option*, never a requirement. This is the single feature no competitor with system access offers.

### Pillar 2 — Open MCP host
openMOON is a **complete [MCP](https://modelcontextprotocol.io) host**, not a bundle of hardcoded integrations. Any stdio or HTTP/SSE MCP server from the wider ecosystem works in seconds. Our own servers are just *good defaults*, not the boundary of what's possible.

### Pillar 3 — Security model & audit
An agent with real system access is dangerous by default. We treat that seriously: every tool call is resolved against a policy (`auto` / `ask` / `deny`), risky actions show an approval card, a filesystem allowlist is enforced, and **every decision is logged to SQLite**. Trust is the product.

---

## 4. Who it's for

- **Power users & developers** who want to drive their machine by intent, not clicks.
- **Privacy-conscious users** who refuse to send their mail, files and prompts to a cloud.
- **The MCP ecosystem** — anyone building MCP servers gets a native, secure, local host for free.

---

## 5. What "great" looks like (north-star scenarios)

| You say | openMOON does — multi-step, on its own, with approval gates |
|---|---|
| "Find the invoice email and reply that I'll pay Friday" | Searches Mail → reads it → drafts reply → **asks approval** → sends |
| "Enable focus mode for 2 hours" | DND on → quits Slack → sets timer → mutes notifications |
| "Summarise today's work" | Reads git + calendar + files → writes a summary note |
| "Every Friday 17:00, back up and report" | Saves as a cron trigger, runs autonomously |
| "Go to the supplier portal, download this month's invoices, file them in Finance" | Drives the **browser** (login, navigate, download) → files via filesystem — as a **background job**, notifies when done |
| "Fill in this web form from the data in my spreadsheet" | Reads the file → **controls the browser/app UI directly** (computer use) → submits after approval |
| "Clean up the 200 screenshots on my Desktop into dated folders" | Long-running background job with progress; survives across many steps |

The differentiator vs. today's tools: **action chains + context + approval gates + universal app/browser control**, run locally and in the background.

---

## 6. Strategic bets (decisions, not wishes)

These shape *how* contributions should be designed. Build with them in mind.

### Bet A — Capability comes from tool descriptions, not a hardcoded prompt
Today the system prompt hardcodes ~160 lines of macOS/EN/PL intent rules. **This does not scale** and contradicts Pillar 2 (any MCP server should "just work"). The direction is: the model routes via clean tool descriptions; the prompt teaches *behaviour* (agent loop, safety, language-agnostic intent), not a per-tool lookup table. See [docs/platform-and-prompt-architecture.md](docs/platform-and-prompt-architecture.md).

### Bet B — Cross-platform is an abstraction, not a rewrite
macOS ships first, but Windows (and later Linux) is a first-class goal. We will **not** sprinkle `cfg(target_os)` through the agent core. Native control sits behind a `PlatformAutomation` boundary (apps · system · files · media · notifications). Porting = a new implementation of that boundary + a platform `automation` MCP server, never touching `llm.rs` / `security.rs`. See [docs/platform-and-prompt-architecture.md](docs/platform-and-prompt-architecture.md).

### Bet C — Safety is non-negotiable and never bypassed for convenience
New tools that write files, communicate, or control the system default to `ask`. Triggers auto-reject `ask` tools so unattended runs can never silently do something risky. No feature ships that can disable the audit log.

### Bet D — Onboarding under 5 minutes
Clone → `.env` → run. If a change makes first-run harder, it needs a very good reason. The first distributed `.dmg` (and Homebrew cask) is a top priority so non-developers can try openMOON at all.

### Bet E — Prefer reliable tools; fall back to computer-use
Universal control (rungs 3–4) is powerful but inherently less reliable than a purpose-built tool. So the order of preference is always: **(1) a dedicated MCP tool → (2) browser DOM automation → (3) screen + accessibility "computer use"**. Computer-use is the universal fallback that guarantees *coverage*, not the default that sacrifices *reliability*. When the agent uses a lower rung, it should say so and verify the outcome (Bet F).

### Bet F — Autonomy requires verification
A background agent that can't check its own work is a liability. Every autonomous task must, where possible, **verify the goal was actually met** (re-read the file, confirm the element, re-query state) and retry or escalate to the user instead of silently reporting success.

---

## 7. Anti-goals (say no to these)

- Becoming a general chat UI / "ask me anything" assistant.
- A plugin system that bypasses the security model.
- Cloud-only features that don't degrade gracefully to local.
- Per-app hardcoded logic in the agent core (belongs in an MCP server).
- Telemetry that phones home by default.

---

## 8. How this maps to work

- **Milestones** group issues by the phase they serve: **v0.1** public release · **v0.2** ecosystem · **v0.3** cross-platform · **v0.4** universal autonomous control (the North Star — rungs 3–6).
- Every issue should be answerable: *which pillar, bet, or capability-ladder rung does this serve?* If none, it's probably an anti-goal.
- Architecture & phase ordering: [ROADMAP.md](ROADMAP.md).
- Contributing mechanics: [CONTRIBUTING.md](CONTRIBUTING.md).

> *"openMOON doesn't ask — it understands. It doesn't talk — it acts. It is not an app — it is a presence."*
