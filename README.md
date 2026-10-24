# Claude Code Desktop Mods: Session Dashboard, Prompt Bands, Panes and Guards

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Claude Code](https://img.shields.io/badge/Claude_Code-mods_(early_access)-D97757)
![Tested with](https://img.shields.io/badge/tested_with-Claude_Code_2.1.308-blue)
![Zero model tokens](https://img.shields.io/badge/model_tokens-zero-success)
![Mods](https://img.shields.io/badge/mods-13-informational)

**Plugins (mods) for Claude Code in the Claude desktop app.** Add a live session dashboard pane next to the chat, small status bands above the prompt (git, branch warning, environment, usage limits, deadline, daily totals), panes for prompts, snippets, a kanban board, Bash logs and dependencies, and a hook that stops Claude from writing API keys and passwords into files or shell commands. Mods run in the Claude Code plugin engine, not in the model, so they cost no extra tokens.

13 mods, one marketplace. Every mod is its own plugin: install only the ones you want.

### Dashboard

| Mod | What it does |
|---|---|
| [`bro-cockpit`](mods/bro-cockpit) | Dashboard pane with tabs (overview, files read and changed, subagent tree, tool calls, context and rate limit meter, errors, project ideas) plus a git band above the prompt. Every tab and the band can be switched off in `/config` |

### Guards

| Mod | What it does |
|---|---|
| [`secret-guard`](mods/secret-guard) | Hook that blocks API keys, tokens, private keys and plaintext passwords in `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash` |
| [`branch-guard-band`](mods/branch-guard-band) | Red warning above the prompt when you work directly on a protected branch such as `main` or `master`. Display only, blocks nothing |

### Bands above the prompt

Bands appear only when there is something to show, and they stack.

| Mod | What it does |
|---|---|
| [`env-band`](mods/env-band) | Shows the active environment (`NODE_ENV`, `APP_ENV` or `ENV` from the project's `.env` files) and which `.env` files exist, no other values |
| [`daily-band`](mods/daily-band) | Today's working time, cost, turns and commits, added up across all sessions of the day |
| [`deadline-band`](mods/deadline-band) | Countdown to the project deadline set with `/deadline <date> [text]`, colored by urgency |
| [`limit-band`](mods/limit-band) | 5 hour and 7 day usage limits with a countdown to the reset, shown only above a threshold |

### Panes next to the chat

| Mod | What it does |
|---|---|
| [`prompt-library`](mods/prompt-library) | Light list of saved prompts for all projects or just this one, with placeholders, inserted into the prompt box with `/p` |
| [`snippet-pane`](mods/snippet-pane) | Light list of code snippets per project, one line each, with insert, copy and delete; secrets are redacted |
| [`todo-md-pane`](mods/todo-md-pane) | Todo pane: open items of the project's `todo.md` as a checklist (ticking removes the line, with undo) plus TODO, FIXME, HACK and XXX markers of changed files, each file one click away |
| [`kanban-pane`](mods/kanban-pane) | Small kanban board per project with open, in progress and done columns |
| [`log-viewer`](mods/log-viewer) | Output of the latest Bash calls in this session: command, exit status, duration, highlighted errors and warnings, filter and search |
| [`dependency-pane`](mods/dependency-pane) | Dependencies from `package.json`, `requirements.txt`, `pyproject.toml` and `composer.json`, checked with `npm outdated` at the push of a button |

Every mod has its own README in `mods/<name>/` with commands and settings.

> **Not an official Anthropic project.** Claude and Claude Code are trademarks of Anthropic.

## Contents

- [What are Claude Code mods?](#what-are-claude-code-mods)
- [bro-cockpit: dashboard for Claude Code](#bro-cockpit-dashboard-for-claude-code)
- [secret-guard: stop Claude Code from writing secrets](#secret-guard-stop-claude-code-from-writing-secrets)
- [Bands and panes](#bands-and-panes)
- [Screenshots](#screenshots)
- [Install Claude Code mods](#install-claude-code-mods)
- [Turn mods or parts off](#turn-mods-or-parts-off)
- [Commands](#commands)
- [Requirements](#requirements)
- [FAQ](#faq)
- [Security and privacy](#security-and-privacy)
- [Limitations](#limitations)
- [Documentation](#documentation)
- [Contributing and license](#contributing-and-license)

## What are Claude Code mods?

Mods are plugins with a hooks module that change the interface or the behavior of Claude Code: a pane that stays next to the chat, a band above the prompt, a status line, slash commands, and hooks on tool calls. They are an early access feature of Claude Code, available in the desktop app and in the terminal. A mod is a folder with a `plugin.json` and a hooks module written in TypeScript. This repository contains 15 mods and the lessons learned while building them (see [docs](#documentation)).

## bro-cockpit: dashboard for Claude Code

A single pane next to your Claude Code chat that answers "what is happening in this session?" at a glance.

- **Overview:** one tile per tab with the most important number, and an attention card for anything red.
- **Files:** every file Claude read or changed in the session, grouped by folder, with filters for changed and read-only files and lines added.
- **Subagents:** list and tree view of subagents with status, runtime and tool count, plus a small animated worker mascot.
- **Tool calls:** compact timeline grouped by tool, with filters, durations and details on click. Secrets are redacted before they are stored.
- **Instruments:** context window fill, rate limit (5 hour) flame meter, session cost, cache hit rate and the latest turns.
- **Errors:** failed tool calls in one place.
- **Project:** project name, folder, detected stack (Next.js, WordPress, Node, PHP, Docker) and `package.json` scripts, plus ideas and change requests that are **saved per project across sessions**.
- **Git band:** project, branch, uncommitted changes (staged, modified, untracked) and commits to push or pull, above the prompt. Bands of other mods stay drawn beneath it.
- **Per-tab switches:** every tab and the git band can be switched off on its own in `/config`, section `bro-cockpit` (`show_home`, `show_files`, `show_agents`, `show_calls`, `show_meter`, `show_errors`, `show_project`, `show_gitband`). All are on by default.

It adapts to narrow panes, works in light and dark mode and falls back to text without graphics in the terminal. It runs only `git status` locally every 15 seconds and makes no network requests.

## secret-guard: stop Claude Code from writing secrets

Blocks tool calls that would write credentials in plaintext: OpenAI-style and Stripe keys, Google and AWS keys, GitHub and Slack tokens, bearer tokens, PEM private keys and `password = "..."` style assignments. The message names only the kind of secret, never the value. If the guard itself fails, the call is blocked. It is a safety net, not a guarantee.


## Bands and panes

The bands are small status lines above the prompt. Each one hides itself when it has nothing to say, so several can be installed at once without cluttering the prompt. The panes open next to the chat with their own slash command and keep their data (prompts, snippets, cards) per project in the plugin store on your machine. Details, commands and settings for each one are in its README under `mods/<name>/`.

## Screenshots

Screenshots are coming soon.

<!-- Add images with descriptive alt text, for example:
![Claude Code dashboard pane with overview tiles and attention card in the desktop app](docs/assets/overview.png)
-->

## Install Claude Code mods

The marketplace is `brodesigns/desktop-claude-code-mods`. It lists all 13 mods.

**Claude desktop app:** click the plus next to the prompt box, open Plugins, choose Add marketplace, enter `brodesigns/desktop-claude-code-mods`, then add the mods you want. `/plugin` does not run in the desktop app.

**Terminal:** add the marketplace once, then install each mod you want with the same pattern:

```bash
claude plugin marketplace add brodesigns/desktop-claude-code-mods
claude plugin install <mod>@desktop-claude-code-mods
```

Mod names: `bro-cockpit`, `secret-guard`, `branch-guard-band`, `env-band`, `daily-band`, `deadline-band`, `limit-band`, `prompt-library`, `snippet-pane`, `todo-md-pane`, `kanban-pane`, `log-viewer`, `dependency-pane`.

Example: `claude plugin install bro-cockpit@desktop-claude-code-mods`.

**From a local clone:** use the folder path instead of the repository name, for example `claude plugin marketplace add ./desktop-claude-code-mods`.

Reload after changes with `/reload-plugins`. Uninstall with `claude plugin uninstall <mod>`.

## Turn mods or parts off

- **Whole mods:** every mod is its own plugin. Install only what you want, or disable one with `claude plugin disable <mod>@desktop-claude-code-mods`.
- **Parts of the cockpit:** switch each tab and the git band on or off in `/config`, section `bro-cockpit`. Details in [mods/bro-cockpit/README.md](mods/bro-cockpit/README.md).
- **Bands with settings:** some bands have their own `/config` settings, for example a threshold for `limit-band`. See the mod's README.

## Commands

| Command | Effect |
|---|---|
| `/cockpit [home\|files\|agents\|calls\|meter\|errors\|project]` | Opens the cockpit pane, optionally on a given tab |
| `/idea <text>` | Saves an idea for the current project |
| `/change <text>` | Saves a change request for the current project |
| `/deadline <date> [text]` | Sets the project deadline for `deadline-band` |
| `/prompts`, `/p <name>` | Opens the prompt library, inserts a saved prompt |
| `/snippets`, `/snippet <title>` | Opens the snippet pane, saves a snippet |
| `/kanban` | Opens the kanban board |
| `/logs` | Opens the log viewer |
| `/deps` | Opens the dependency pane |

The full command list of each mod is in its README.

## Requirements

- Claude Code with plugin hooks module support, tested with version 2.1.308.
- Mods are an early access feature and may not be enabled in every version or account.
- Optional: `git` for the cockpit and the git-based bands. Without it they show only the folder name or stay hidden.
- Optional: `npm` for the outdated check in `dependency-pane`.

## FAQ

### How do I install Claude Code mods in the desktop app?

Add this repository as a marketplace (plus button next to the prompt, Plugins, Add marketplace) and install the mods you want. See [Install Claude Code mods](#install-claude-code-mods).

### Do these Claude Code mods cost tokens?

No. They add no prompt text, no tools for the model and no subagents. Only when a guard blocks a call does Claude read the short block message. One exception: sending a prompt from `prompt-library` submits it as if you typed it, which costs normal tokens.

### Does it work in the terminal, not only in the desktop app?

The hooks, bands and commands work in both. The panes draw graphics in the desktop app and fall back to text in the terminal.

### What do the mods access on my machine?

Programs that mods run locally: `git` (cockpit, `todo-md-pane`, `branch-guard-band`, `deadline-band`, `daily-band`) and `npm outdated` only on a button press (`dependency-pane`). The guards run nothing. Saved data (ideas, prompts, snippets, cards, deadlines, daily totals) stays in the Claude Code plugin store on your machine.

### Can I use only the secret guard?

Yes. Every mod installs separately. `secret-guard` has no interface and needs no other mod.

### Can I hide single tabs of the cockpit?

Yes. Open `/config` and switch off the tabs you do not need in the `bro-cockpit` section. The git band has its own switch.

### Which Claude Code version do I need?

Tested with 2.1.308. The mod API is early access and can change between versions, which can break a mod. Please open an issue with your version.

## Security and privacy

Mods run with your permissions. The mods themselves make no network calls, with one exception: `npm outdated` in `dependency-pane` asks the npm registry when you press its button. Data stays on your machine. The guards are helpers, not guaranteed protection. See [SECURITY.md](SECURITY.md) to report a problem.

## Limitations

- The mod API of Claude Code is early access and can change.
- A pane can only use the slots the engine offers. The session list in the sidebar and the built-in session overview cannot be changed by a mod.
- The secret guard only knows the patterns it has been given. Unknown formats, split or encoded values and values read from variables pass through.
- The mods are tested with `claude plugin test`. The author has not checked every mod by eye in the desktop app.

More in [docs/07-limits.md](docs/07-limits.md).

## Documentation

1. [docs/01-basics.md](docs/01-basics.md): structure, types, testing, installing, developing
2. [docs/02-api.md](docs/02-api.md): events, the `$` interface, state, elements
3. [docs/03-rules-and-pitfalls.md](docs/03-rules-and-pitfalls.md): rules and pitfalls found while building
4. [docs/05-design-ui.md](docs/05-design-ui.md): layout, colors, SVG animation
5. [docs/07-limits.md](docs/07-limits.md): what mods cannot do

## Contributing and license

Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).

---

*Keywords: Claude Code mods, Claude Code plugins, Claude desktop app, Claude Code hooks, Claude Code dashboard, Claude Code subagents, Claude Code context window, Claude Code rate limit, Claude Code secret scanner, git status band, prompt library, kanban board, Bash log viewer, dependency checker.*
