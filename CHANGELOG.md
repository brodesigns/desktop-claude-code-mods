# Changelog

## Changes since the first version (mods are at 0.1.1 to 0.1.8)

- All bands are one borderless row in small text with a `▌` marker in the BroDesigns blue `#39639E`; long text is cut instead of wrapping, and parts are clickable (project folder, GitHub branch page, env file in the file manager, usage page).
- `bro-cockpit`: clicking an idea in the Project tab puts its text into the prompt box, the Todo tab shows plain text instead of raw Markdown marks, a failed draw shows a card instead of an empty pane, new Todo tab (todo.md checklist you can tick, add to and undo; TODO, FIXME, HACK and XXX anywhere in the project with file, line and text, a click shows the file in the file manager), a "‹ Overview" button on every tab, faster tool calls (the marker search no longer blocks edits), correct call counts in long sessions, a git band that follows commits at once.
- `limit-band`: the 5-hour countdown is always shown (switch `fiveHour`).
- `snippet-pane`, `prompt-library`, `kanban-pane`, `log-viewer`, `dependency-pane`: light one-line-per-entry panes, forms behind `＋ new`, copy and insert actions, fixes for stale data across sessions.
- `session-summary` (new): short running summary by Haiku in cheap batches while its pane is open, language choice, on/off switch in the pane. The one mod that spends model tokens.
- Removed: `port-band`, `todo-band`, `todo-md-pane` (their features live in the cockpit).

## 0.1.0

First public version, tested with Claude Code 2.1.308.

### bro-cockpit

- Pane with tabs: Overview (tiles, attention card), Files (read and changed), Subagents (list, tree view, animated worker), Tool calls (grouped, details on click), Instruments (context, 5 hour limit, cost, turns), Errors (failed tool calls), Todo (open items of the project's todo.md as a checklist, ticking removes the line with undo; TODO, FIXME, HACK and XXX markers anywhere in the project, each file one click away), Project (info, scripts, ideas and change requests).
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

- `env-band`: shows the active environment and which `.env` files exist.
- `daily-band`: today's working time, cost, turns and commits across all sessions.
- `deadline-band`: countdown to the project deadline set with `/deadline`.
- `limit-band`: 5 hour and 7 day limits with a countdown, above a threshold.

### Panes next to the chat

- `prompt-library`: saved prompts with search and placeholders, inserted with `/p`.
- `snippet-pane`: code snippets per project, secrets redacted.
- `session-summary`: short running summary of the session in a pane, written after each turn by Haiku from a small digest.
- `kanban-pane`: small board per project with open, in progress and done.
- `log-viewer`: output of the latest Bash calls with filter and search.
- `dependency-pane`: project dependencies, checked with `npm outdated` on request.
