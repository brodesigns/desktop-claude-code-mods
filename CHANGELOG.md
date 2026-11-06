# Changelog

## Fixes for the first ten issues (versions raised)

- `bro-cockpit` 0.1.12, `kanban-pane` 0.1.4, `session-summary` 0.1.8, `prompt-library` 0.1.5, `snippet-pane` 0.1.5, `env-band`, `limit-band`, `branch-guard-band`, `daily-band` 0.1.4: the fixes for the ten issues (merged idea saves, column cap, no model call on a language switch, caught promises, and more) reach installed copies only with these versions.

## First public release (mods are at 0.1.3 to 0.1.11)

What changed since the internal first version described at the end of this file.

- `permission-log` (new): logs which permission prompts were allowed or declined, lists the rules you keep allowing and copies a ready allow rule; it changes no settings.
- `usage-pane` (new): counts the skills, plugins, connectors and built-in tools used (per session and over all sessions), lists installed things that were never used, and estimates what each costs in context, to decide what to remove.
- Security pass: the secret patterns no longer take quadratic time on long runs of name characters, and long lines from a repository or from command output are cut before they are processed. `secret-guard` resolves `..` in a path before its `node_modules/` rule, no longer blocks code that only reads a secret (`req.headers.authorization`, `getToken()`, `hashedPassword`), and knows Telegram, Slack and Discord webhook, Basic authorization, Hugging Face, SendGrid and Azure formats. `bro-cockpit` shows the project folder in the file manager instead of opening it. `env-band` refuses variable names that look secret. `session-summary` treats `auto: false` as final.
- Review fixes: `bro-cockpit` no longer goes blank at pane widths of 44 to 67 columns (the engine refuses a fractional percentage and then skips the whole pane), strips terminal control characters and colour codes from every text it shows, redacts secrets in marker hits, tool call notes and agent descriptions, keeps the token out of a remote URL, and runs git with `core.fsmonitor` off (also `daily-band`, `deadline-band`, `branch-guard-band`). `branch-guard-band` finds `main` even when a tag of the same name exists. `secret-guard` finds more secrets (JSON and env style passwords, `DB_PASSWORD=`, `export` lines, passwords in URLs, whole private key blocks, JWTs, more token formats), lets placeholders (also in URLs), `${ENV}` references and plain label words pass, and blocks a malformed edit list instead of waving it through. All panes mask the same wider secret list. `session-summary` waits 1, 2, 5, then 10 minutes after a failed model call instead of retrying every 10 seconds. `dependency-pane` reports an npm failure instead of "all up to date".
- All bands are one borderless row in small text with a `▌` marker in the BroDesigns blue `#39639E`; long text is cut instead of wrapping, and parts are clickable (project folder, GitHub branch page, env file in the file manager, usage page).
- `bro-cockpit`: clicking an idea in the Project tab puts its text into the prompt box, the Todo tab shows plain text instead of raw Markdown marks and ignores prose documents (`.md`, `.txt`, `.rst`) when it looks for markers, a failed draw shows a card instead of an empty pane, new Todo tab (todo.md checklist you can tick, add to and undo; TODO, FIXME, HACK and XXX anywhere in the project with file, line and text, a click shows the file in the file manager), a "‹ Overview" button on every tab, faster tool calls (the marker search no longer blocks edits), correct call counts in long sessions, a git band that follows commits at once.
- `bro-cockpit` fixes: ideas from two sessions saved at once are merged (the store is read again before each write), the tool call total lives in engine state, a todo.md change made elsewhere right after a tick or add is shown, marker hits keep non-ASCII file names readable, a remote added during the session is picked up on the 15 second git poll, and the subagent tree draws flat beyond 8 levels so a deep chain cannot blank the pane.
- `limit-band`: the 5-hour countdown is always shown (switch `fiveHour`).
- `snippet-pane`, `prompt-library`, `kanban-pane`, `log-viewer`, `dependency-pane`: light one-line-per-entry panes, forms behind `＋ new`, copy and insert actions, fixes for stale data across sessions.
- `session-summary` (new): short running summary by Haiku in cheap batches while its pane is open, language choice, on/off switch in the pane. The one mod that spends model tokens.
- `kanban-pane` draws at most 30 cards per column with a `+N more` row (no card is dropped). `session-summary` no longer makes a model call when the language is switched; the next update uses it. `prompt-library` shows the `/p <name> value | value` way to fill placeholders on surfaces without input fields.
- Removed: `port-band`, `todo-band`, `todo-md-pane` (their features live in the cockpit).

## Internal first version (0.1.0)

Tested with Claude Code 2.1.308.

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
