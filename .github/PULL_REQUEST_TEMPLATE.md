<!-- Thanks for contributing to openMOON! Keep PRs focused and small. -->

## What & why

<!-- What does this change and which problem/issue does it solve? -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature / enhancement
- [ ] New MCP server / integration
- [ ] Docs
- [ ] Refactor / chore

## Scope check (see [VISION.md](../VISION.md))

- [ ] This serves a pillar or bet, and does not push toward an anti-goal
- [ ] No per-app/per-platform logic added to the agent core (`llm.rs`) — platform/app specifics live in MCP servers or `cfg`-gated helpers

## Security (see [CONTRIBUTING.md](../CONTRIBUTING.md#security-considerations))

- [ ] New tools that write files / communicate / control the system default to `ask`
- [ ] New tool names are categorised in `security.rs::categorize`
- [ ] No credentials or API keys hardcoded; secrets via `.env` / `${VAR}`
- [ ] Filesystem access respects the path allowlist

## Checks run locally

- [ ] `npm run build`
- [ ] `cd src-tauri && cargo fmt --check && cargo clippy && cargo test`
- [ ] `npm run test:mcp` (if MCP servers touched)

## Notes for reviewers

<!-- Anything that needs context, screenshots, or follow-ups. -->
