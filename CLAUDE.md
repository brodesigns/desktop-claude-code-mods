# desktop-claude-code-mods

Claude Code mods (plugins with a hooks module) in `mods/`: bro-cockpit, secret-guard, branch-guard-band, env-band, daily-band, deadline-band, limit-band, prompt-library, snippet-pane, todo-md-pane, kanban-pane, log-viewer, dependency-pane.

## Rules

- Everything in this repository is written in English: interface texts, docs, code, comments, names, tests, commit messages. No exceptions.
- Do not add `Co-Authored-By` lines or any Claude attribution to commits or pull requests (`.claude/settings.json` turns it off).
- Before finishing, run `claude plugin validate mods/<name>` and `claude plugin test mods/<name>` for every changed mod. All tests must pass.
- Follow [docs/03-rules-and-pitfalls.md](docs/03-rules-and-pitfalls.md): one hooks module per plugin, `$` only passed to top-level function declarations, the performance rules.
- Mods cost no model tokens: no `prompt.compose`, no `$.tool.register`, no `$.agent.register`.
- Never commit secrets. Tests build fake tokens from parts (`'gh' + 'p_' + 'a'.repeat(36)`).
