# desktop-claude-code-mods

Claude Code mods (plugins with a hooks module) in `mods/`: bro-cockpit, secret-guard, branch-guard-band, env-band, daily-band, deadline-band, limit-band, prompt-library, snippet-pane, session-summary, kanban-pane, log-viewer, dependency-pane, usage-pane, permission-log.

## Rules

- Everything in this repository is written in English: interface texts, docs, code, comments, names, tests, commit messages. No exceptions.
- Do not add `Co-Authored-By` lines or any Claude attribution to commits or pull requests (`.claude/settings.json` turns it off).
- Before finishing, run `claude plugin validate mods/<name>` and `claude plugin test mods/<name>` for every changed mod. All tests must pass.
- Follow [docs/02-rules-and-pitfalls.md](docs/02-rules-and-pitfalls.md): one hooks module per plugin, `$` only passed to top-level function declarations, the performance rules.
- Mods cost no model tokens: no `prompt.compose`, no `$.tool.register`, no `$.agent.register`. The one exception is `session-summary` (`$.model.complete` with the cheapest model, small digest, opt-out setting); another model call needs the same care.
- Never commit secrets. Tests build fake tokens from parts (`'gh' + 'p_' + 'a'.repeat(36)`).
- Files from the user's project (marker files, `todo.md`) are only revealed (`revealTarget`, `open -R`), never opened, so a click cannot run a cloned `.command` or `.app`. Writes to a symlinked `todo.md` are refused.
