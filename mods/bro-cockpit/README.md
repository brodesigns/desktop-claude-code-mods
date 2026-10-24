# bro-cockpit: dashboard pane for Claude Code

A session dashboard for Claude Code in the Claude desktop app: one pane with tabs next to the chat and a git band above the prompt. Costs no model tokens.

- **Tabs:** Overview (tiles and an attention card for anything red), Files (read and changed), Subagents (list, tree view, animated worker), Tool calls, Instruments (context window, 5 hour rate limit, cost), Errors (failed tool calls), Project (info, scripts, ideas and change requests).
- **Git band:** project, branch, uncommitted changes, commits to push or pull. Runs `git status` in your project every 15 seconds and nothing else.
- **Ideas and change requests** are saved per project and survive across sessions (plugin store on your machine).
- **Commands:** `/cockpit [home|files|agents|calls|meter|errors|project]`, `/idea <text>`, `/change <text>` (change request).

## Turn tabs off one by one

Every tab and the git band can be switched on and off on its own: open `/config` and flip the switches in the `bro-cockpit` section. The mod reloads by itself afterwards.

| Switch | Effect |
|---|---|
| `show_home`, `show_files`, `show_agents`, `show_calls`, `show_meter`, `show_errors`, `show_project` | Shows or hides the tab and its tile on the Overview |
| `show_gitband` | Shows or hides the git band above the prompt |

All are on by default. A tab that is switched off is only hidden: the cockpit keeps counting, and `/idea` and `/change` keep saving.

Install: `claude plugin install bro-cockpit@desktop-claude-code-mods`. More in the [main README](../../README.md).

Limits: the pane only shows what happens in the current session. Commands and error messages are redacted by known secret patterns before they are stored, which is a helper and not guaranteed protection.
