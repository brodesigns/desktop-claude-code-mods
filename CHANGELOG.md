# Changelog

## 0.1.0

First public version, tested with Claude Code 2.1.308.

### bro-cockpit

- Pane with tabs: Overview (tiles, attention card), Files (read and changed), Subagents (list, tree view, animated worker), Tool calls (grouped, details on click), Instruments (context, 5 hour limit, cost, turns), Errors (failed tool calls), Project (info, scripts, ideas and change requests).
- Every tab and the git band can be switched off on its own in `/config`, section `bro-cockpit` (switches `show_<tab>` and `show_gitband`, all on by default). A tab that is off also disappears from the Overview; with all tabs off the pane shows a hint.
- Ideas and change requests are saved per project and survive across sessions.
- Git band above the prompt: project, branch, uncommitted changes, commits to push or pull. Bands of other mods stay drawn beneath it.
- Commands `/cockpit`, `/idea`, `/change`.
- Light and dark mode, narrow and wide panes, text fallback without graphics in the terminal.
- Commands and error messages are redacted by secret patterns before they are stored.

### Guards

- `secret-guard`: blocks tokens, keys, private keys and plaintext passwords in Write, Edit, MultiEdit, NotebookEdit and Bash, on every attempt. The message names only the kind of secret. A failure inside the guard blocks the call.
- `branch-guard-band`: red warning above the prompt when you work directly on a protected branch, display only.

### Bands above the prompt

- `todo-band`: counts TODO, FIXME, HACK and XXX in changed files.
- `env-band`: shows the active environment and which `.env` files exist.
- `daily-band`: today's working time, cost, turns and commits across all sessions.
- `deadline-band`: countdown to the project deadline set with `/deadline`.
- `limit-band`: 5 hour and 7 day limits with a countdown, above a threshold.
- `port-band`: local dev servers and the ports they listen on.

### Panes next to the chat

- `prompt-library`: saved prompts with search and placeholders, inserted with `/p`.
- `snippet-pane`: code snippets per project, secrets redacted.
- `kanban-pane`: small board per project with open, in progress and done.
- `log-viewer`: output of the latest Bash calls with filter and search.
- `dependency-pane`: project dependencies, checked with `npm outdated` on request.
