# Contributing to openMOON

Thank you for your interest in contributing! openMOON is an open-source project and contributions of all kinds are welcome.

## Before you start (read these)

- **[VISION.md](VISION.md)** — what openMOON is, the three pillars, and the anti-goals. Every change should serve a pillar or bet.
- **[ROADMAP.md](ROADMAP.md)** — phase plan and what's already done.
- **[docs/platform-and-prompt-architecture.md](docs/platform-and-prompt-architecture.md)** — the target shape for the agent prompt and cross-platform boundary. Build toward this, not the current debt.

> The fastest way to get a PR merged: pick an issue, comment that you're taking it, and check it against the pillars in VISION.md before writing code.

## Ways to contribute

- **Bug reports** — open an issue with reproduction steps
- **Feature requests** — open an issue describing the use case and expected behaviour
- **Code** — pick up an open issue or propose something new via an issue first
- **Documentation** — improve the README, add examples, fix typos
- **New MCP servers** — extend the ecosystem with additional integrations

## Development setup

Follow the [Quick start](README.md#quick-start) section in the README.

For the Rust backend, make sure you have `rustfmt` and `clippy` installed:

```bash
rustup component add rustfmt clippy
```

## Workflow

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
   (Clone from your fork: `git clone https://github.com/YOUR_USERNAME/openmoon-ai.git`)
2. Make your changes.
3. Run the checks locally before opening a PR:
   ```bash
   npm run build                        # TypeScript + Vite
   cd src-tauri && cargo fmt --check    # Rust format
   cd src-tauri && cargo clippy         # Rust lint
   cd src-tauri && cargo test           # Rust tests
   npm run test:mcp                     # MCP server tests
   ```
4. Commit with a short, descriptive message (imperative mood, no period):
   ```
   feat: add webhook trigger type
   fix: correct path allowlist check on symlinks
   docs: document remote MCP configuration
   ```
5. Open a **pull request** against `main`. Fill in the PR template.

## Code conventions

### Rust (`src-tauri/src/`)
- Follow existing module structure (`llm.rs`, `security.rs`, etc.)
- Use `thiserror` / `anyhow` for error handling — no bare `unwrap()` in production paths
- Document public functions and types with `///` doc comments

### TypeScript / React (`src/`)
- Functional components + hooks only
- Types over `any`; avoid `as` casts unless necessary
- Keep components focused — extract logic into hooks

### MCP servers (`mcp-servers/`)
- Each server is a self-contained Node.js module
- Must implement `initialize`, `tools/list`, `tools/call` (JSON-RPC 2.0 over stdio)
- Add an entry in `mcp-servers/config.example.json` for new servers
- Include at least a basic test in `mcp-servers/tests/`

## Adding a new MCP server

1. Create `mcp-servers/myserver/index.js` and `mcp-servers/myserver/package.json`
2. Implement the JSON-RPC 2.0 protocol (see existing servers for reference)
3. Add an entry to `mcp-servers/config.example.json`
4. Add tests in `mcp-servers/tests/myserver.test.js`
5. Document the tools in the PR description

## Security considerations

openMOON has a security model built around per-tool policies and an audit log. When contributing:

- New tools that modify files, send messages, or control system state should default to `ask` policy
- Read-only / informational tools can default to `auto`
- Never hardcode credentials or API keys
- Respect the filesystem path allowlist

## Reporting security vulnerabilities

Please **do not** open a public issue for security vulnerabilities.
Email [jarzebowski.marcin@gmail.com](mailto:jarzebowski.marcin@gmail.com) directly with a description and reproduction steps.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
