# bro-cockpit: dashboard pane for Claude Code

A session dashboard for Claude Code in the Claude desktop app: one pane with tabs next to the chat and a git band above the prompt. Costs no model tokens.

- **Tabs:** Overview (tiles and an attention card for anything red), Files (read and changed), Subagents (list, tree view, animated worker), Tool calls, Instruments (context window, 5 hour rate limit, cost), Errors (failed tool calls), Todo (the open items of the project's `todo.md` as a checklist and the TODO, FIXME, HACK and XXX markers found anywhere in the project), Project (info, scripts, ideas and change requests).
- **Git band:** project, branch, uncommitted changes, commits to push or pull. Runs `git status` in your project every 15 seconds and right after Claude runs a command or writes a file. A checked-out commit shows as `detached`; `↑ N to push` copies `git push`, `↓ N to pull` opens the commits page.
- **Ideas and change requests** are saved per project and survive across sessions (plugin store on your machine).
- **Commands:** `/cockpit [home|files|agents|calls|meter|errors|todo|project]` (an unknown tab is named in the reply, the pane opens anyway), `/idea <text>`, `/change <text>` (change request).

## Turn tabs off one by one

Every tab and the git band can be switched on and off on its own: open `/config` and flip the switches in the `bro-cockpit` section. The mod reloads by itself afterwards.

| Switch | Effect |
|---|---|
| `show_home`, `show_files`, `show_agents`, `show_calls`, `show_meter`, `show_errors`, `show_todo`, `show_project` | Shows or hides the tab and its tile on the Overview |
| `markers` | Comma separated words the Todo tab looks for in the project (default `TODO,FIXME,HACK,XXX`) |
| `sessionFiles` | Todo tab, project without git: also scan the files Claude wrote or edited in this session |
| `show_gitband` | Shows or hides the git band above the prompt |

All are on by default. A tab that is switched off is only hidden: the cockpit keeps counting, and `/idea` and `/change` keep saving.

Install: `claude plugin install bro-cockpit@desktop-claude-code-mods`. More in the [main README](../../README.md).

Limits: the pane only shows what happens in the current session. Commands and error messages are redacted by known secret patterns before they are stored, which is a helper and not guaranteed protection.

## Todo tab

- **todo.md:** the file in the project root (any capitalisation) as a checklist. `- [ ] task`, `* [ ] task`, `1. [ ] task` and plain bullets count, headings become sections, indented entries stay indented, entries marked `[x]` are not shown. A click ticks an entry: its line and the indented lines below it are removed from the file (read again right before the write; a moved line is found by its text, a vanished one is left alone). `↶ undo` puts the last one back for the session.
- **In code:** TODO, FIXME, HACK and XXX anywhere in the project, also in the middle of a file: one `git grep` over every tracked file and every untracked one that is not ignored (a few milliseconds), checked every 30 seconds and right after Claude writes a file. Each hit shows `file:line` and the line; a click opens the file in your editor. `todo.md` itself, binary files, lock files and minified files are left out. Without git, the files Claude wrote in this session are scanned instead.
- **Settings:** `show_todo`, `markers` (comma separated) and `sessionFiles`. `/cockpit todo` jumps to the tab.
