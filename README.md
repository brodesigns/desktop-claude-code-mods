<p align="center"><img src="docs/assets/social-preview.png" alt="Claude Code Mods: panes, bands and a guard that stops leaked secrets, by BroDesigns" width="100%"></p>

# Claude Code Mods: Dashboard, Status Bands, Prompt Library and Secret Guard

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Claude Code](https://img.shields.io/badge/Claude_Code-mods_(early_access)-D97757)
![Tested with](https://img.shields.io/badge/tested_with-Claude_Code_2.1.308-blue)
![Model tokens](https://img.shields.io/badge/model_tokens-none-success)
![Mods](https://img.shields.io/badge/mods-7-informational)

**Seven plugins (mods) for Claude Code in the Claude desktop app:** a session dashboard next to the chat, status bands above the prompt, a prompt library, a permission log and a guard that stops Claude from writing API keys and passwords into files. Mods run in the plugin engine, not in the model: **no extra tokens**.

> **Not an official Anthropic project.** Claude and Claude Code are trademarks of Anthropic. This repository is not affiliated with or endorsed by Anthropic.

## Quick start

1. In the Claude desktop app click the **plus** next to the prompt box, open **Plugins**.
2. **Add marketplace:** `brodesigns/desktop-claude-code-mods`.
3. Add what you want. Start with `bro-cockpit` (type `/cockpit`) or `secret-guard`. Restart the app if a mod does not show.

Terminal: `claude plugin marketplace add brodesigns/desktop-claude-code-mods`, then `claude plugin install <mod>@desktop-claude-code-mods`. Step by step: [docs/03-install-in-claude-desktop.md](docs/03-install-in-claude-desktop.md).

## The 7 mods

Every mod is its own plugin, install only what you need. Full details are in each mod's README.

| Mod | What it does | Command |
|---|---|---|
| [`bro-cockpit`](mods/bro-cockpit/README.md) | Dashboard pane with 9 tabs and a git line above the prompt | `/cockpit` |
| [`secret-guard`](mods/secret-guard/README.md) | Blocks API keys, tokens, private keys and passwords from being written | none |
| [`branch-guard-band`](mods/branch-guard-band/README.md) | Warns when you work directly on `main` | none |
| [`env-band`](mods/env-band/README.md) | Shows the active environment and the `.env` files | none |
| [`limit-band`](mods/limit-band/README.md) | Shows your 5-hour and 7-day usage limit and when it resets | none |
| [`prompt-library`](mods/prompt-library/README.md) | Saves prompts once, reuses them in every project | `/prompts`, `/p`, `/prompt-save` |
| [`permission-log`](mods/permission-log/README.md) | Logs permission prompts, offers rules for the ones you always allow | `/permlog` |

### `bro-cockpit`: Claude Code session dashboard

| Tab | Shows |
|---|---|
| Overview | One tile per tab (except Usage), red problems in an attention card |
| Files | Files Claude read, wrote or edited, with lines added |
| Subagents | Status, runtime and tool calls of every subagent, list or tree |
| Tool calls | Timeline of every call, details on click, filters |
| Instruments | Context window, 5-hour and 7-day limit, cost, cache hit rate |
| Errors | Failed tool calls in one list |
| Todo | `todo.md` as a checklist you can tick, plus TODO/FIXME markers in code |
| Project | Stack, scripts, and ideas and change requests saved per project |
| Usage | Which skills, plugins, connectors and tools you use, which never, and what they cost in context |

Plus a **git line** above the prompt (branch, changes, commits to push or pull). Every tab can be switched off in `/config`. Commands: `/cockpit [tab]`, `/idea <text>`, `/change <text>`.

### `secret-guard`: stop Claude Code from writing secrets

Blocks `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash` calls that contain an API key, token, private key or plaintext password. Placeholders (`YOUR_TOKEN_HERE`) and references (`process.env.KEY`) pass. The message names the kind of secret, never the value. A safety net, not a guarantee.

### Bands above the prompt

- **`branch-guard-band`:** `⚠ Working directly on main`, a click copies `git switch -c`. Protected branches are configurable.
- **`env-band`:** `◉ development .env.local .env`, red for production. Reads only the environment name, never other values.
- **`limit-band`:** `◔ 5h 72% · ↻ 1 h 23 min`, yellow from 80%, red from 95%. Needs a subscription.

### Panes

- **`prompt-library`:** save a prompt for all projects or one, use `{{placeholders}}`, put it into the prompt box with one click. `/p <name>` does the same from the keyboard.
- **`permission-log`:** counts which permission prompts you allowed or declined. Rules you allowed 3 times and never declined show as "worth allowing", ready to copy into `.claude/settings.json`. It changes no settings.

## Screenshots

The cockpit pane next to the chat:

<table>
  <tr>
    <td align="center"><img src="docs/assets/cockpit-overview.png" alt="Claude Code cockpit pane, Overview tab with one tile per area and an attention card" width="260"></td>
    <td align="center"><img src="docs/assets/cockpit-todo.png" alt="Claude Code cockpit pane, Todo tab with the open items of todo.md as a checklist" width="260"></td>
    <td align="center"><img src="docs/assets/cockpit-subagents.png" alt="Claude Code cockpit pane, Subagents tab with three running subagents and the animated worker" width="260"></td>
  </tr>
  <tr>
    <td align="center">Overview</td>
    <td align="center">Todo</td>
    <td align="center">Subagents</td>
  </tr>
</table>

More screenshots follow: the Project and Usage tabs, the prompt library and the bands above the prompt.

## Turn parts off

Disable a whole mod with `claude plugin disable <mod>@desktop-claude-code-mods`. Switch single cockpit tabs and the git line off in `/config`, section `bro-cockpit`. Bands have their own settings, see each README.

## FAQ

**Do these mods cost tokens?** No. They add no prompt text, no tools and no subagents. Only a guard's short block message is read by Claude. One button costs tokens: `↵ send` in `prompt-library` submits a prompt like a typed one.

**Does it work in the terminal?** Yes. Hooks, bands and commands work in both. Panes draw graphics in the desktop app and fall back to text in the terminal.

**What do the mods access?** `git` locally (`bro-cockpit`, `branch-guard-band`) and `open`/`xdg-open` on a click (project folder, GitHub branch page, a file in the file manager, the usage page). No network requests of their own. Saved data (ideas, prompts, usage counts, permission log) stays in the Claude Code plugin store on your machine. No mod sends data to a model.

**Which Claude Code version?** Tested with 2.1.308. The mod API is early access and can change; please open an issue with your version.

## Limits and security

- The mod API is early access and can change. A pane can only use the slots the engine offers.
- `secret-guard` knows only its patterns. Encoded, split or multi-edit values pass.
- Running `git` in an untrusted repository can run that repository's own git config. Open such folders with care.
- Tested with `claude plugin test`, not every mod by eye in the desktop app.

Report problems: [SECURITY.md](SECURITY.md).

## Docs and license

[Basics](docs/01-basics.md) · [Rules and pitfalls](docs/02-rules-and-pitfalls.md) · [Install in the desktop app](docs/03-install-in-claude-desktop.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE). Built by [BroDesigns](https://brodesigns.de).

---

*Keywords: Claude Code mods, Claude Code plugins, Claude desktop app, Claude Code hooks, Claude Code dashboard, Claude Code subagents, Claude Code context window, Claude Code rate limit, Claude Code secret scanner, git status band, prompt library.*
