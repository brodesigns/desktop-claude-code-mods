<p align="center"><img src="docs/assets/social-preview.png" alt="Claude Code Mods: panes, bands and a guard that stops leaked secrets, by BroDesigns" width="100%"></p>

# Claude Code Desktop Mods: Session Dashboard, Prompt Bands, Panes and Guards

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Claude Code](https://img.shields.io/badge/Claude_Code-mods_(early_access)-D97757)
![Tested with](https://img.shields.io/badge/tested_with-Claude_Code_2.1.308-blue)
![Model tokens](https://img.shields.io/badge/model_tokens-none-success)
![Mods](https://img.shields.io/badge/mods-7-informational)

**Plugins (mods) for Claude Code in the Claude desktop app.** Add a live session dashboard pane next to the chat, small status bands above the prompt (branch warning, environment, usage limit), a prompt library, a permission log, and a hook that stops Claude from writing API keys and passwords into files or shell commands. Mods run in the Claude Code plugin engine, not in the model, so they cost no extra tokens.

> **Not an official Anthropic project.** Claude and Claude Code are trademarks of Anthropic. This repository is not affiliated with or endorsed by Anthropic.

## Quick start in the Claude desktop app

1. Click the **plus** next to the prompt box and open **Plugins**.
2. Choose **Add marketplace** and enter `brodesigns/desktop-claude-code-mods`.
3. Add the mods you want. Start with `bro-cockpit` (type `/cockpit`) or `secret-guard`.
4. Restart the app if a mod does not show up.

`/plugin` does not run in the desktop app. More detail, a table of which mod to try first and troubleshooting: [docs/03-install-in-claude-desktop.md](docs/03-install-in-claude-desktop.md). Terminal install: [Install Claude Code mods](#install-claude-code-mods).

## All 7 mods

One marketplace, 7 mods: **1 dashboard, 1 guard, 3 bands, 2 panes**. Every mod is its own plugin, so you install only the ones you want. A **pane** opens next to the chat, a **band** is one line above the prompt, a **guard** works in the background. None of them calls a model, so none costs tokens (one exception for a button, see `prompt-library`).

| Mod | Kind | What it does | Command |
|---|---|---|---|
| `bro-cockpit` | Dashboard | Session overview in tabs, plus a git line above the prompt | `/cockpit`, `/idea`, `/change` |
| `secret-guard` | Guard | Blocks tool calls that would write a secret in plaintext | none |
| `branch-guard-band` | Band | Warns when you work directly on `main` | none |
| `env-band` | Band | Shows the active environment and the `.env` files | none |
| `limit-band` | Band | Shows how much of the usage limit is used and when it resets | none |
| `prompt-library` | Pane | Saved prompts you reuse in every project | `/prompts`, `/p`, `/prompt-save` |
| `permission-log` | Pane | Logs permission prompts and offers rules for the ones you always allow | `/permlog` |

### `bro-cockpit`: the session dashboard

One pane next to the chat with nine tabs, and a git line above the prompt. A dropdown at the top of the pane switches the tab; every tab except Overview has a `‹ Overview` button. Every tab and the git line can be switched off in `/config`. The pane only shows the current session, except where a tab says otherwise. Commands and error messages are redacted for known secret patterns before they are stored.

- **Overview:** one tile per tab with its most important number (changed files, running subagents, tool calls, context percent, errors, open todos, open ideas). Anything red (context or limit from 85 %, errors above 0) also appears in an attention card at the top with an `open ›` button. Without anything red the card says "All calm".
- **Files:** every file Claude read, wrote or edited in the session, grouped by folder, with how often, lines added and whether a subagent did it. `Clear` empties the list. Three tiles show changed files, read files and lines added; filters switch between all, changed and read-only files.
- **Subagents:** every subagent with type, description, status (running, done, failed), run time, number of tool calls and its last tool. `List` and `Tree` buttons switch between a flat list and a tree that shows who started whom. A small animated worker shows while one runs (a text mark in the terminal).
- **Tool calls:** the calls of the session as a timeline, newest at the bottom, in fixed columns: status, tool, argument, time. Equal calls in a row are grouped. A click opens the full arguments, the note of a failed or refused call and the subagent that made it. Filters: all, errors, Bash, files, agents. `Clear` empties the list, `↓ Newest` scrolls to the end.
- **Instruments:** context window fill (percent, tokens), the 5-hour limit and the 7-day limit as meters, the session cost in dollars, the cache hit rate and the latest turns with time and tokens. Without a subscription no limits are reported and those meters stay empty.
- **Errors:** three tiles (failed calls, by subagents, tools) and the failed tool calls as cards with the tool, the time, the argument and the error note, newest first, so you do not scroll the timeline for them. Without failures it says "All calm".
- **Todo:** the open items of `todo.md` in the project root (any capitalisation) as a checklist. `- [ ]`, `* [ ]`, `1. [ ]` and plain bullets count, headings become sections, indented entries stay indented, `[x]` entries are not shown. A click ticks an entry and removes its line and the indented lines below it from the file; `↶ undo` puts the last one back for the session. `+ add` appends a new entry. Below it the markers TODO, FIXME, HACK and XXX found in the project's code, with file, line and text; a click shows the file in the file manager, it never opens or runs it. Binary, lock, minified files, `todo.md` itself and prose documents (`.md`, `.txt`, `.rst`) are skipped. Without git the files Claude wrote in this session are scanned instead.
- **Project:** project name, folder, detected stack (Next.js, WordPress, Node, PHP, Docker) and the scripts of `package.json`. Below it ideas and change requests, saved per project across sessions in the plugin store (two sessions saving at once keep each other's entries). A click on the text of an entry puts it into the prompt box (clipboard if the box is not reachable); the status button cycles open, running, done; `Delete` removes it.
- **Usage:** counts what you use. Four views: **Used** (uses per skill, plugin and connector (MCP server); a skill run counts whether you typed `/name` or the Skill tool started it; every MCP tool call counts for its connector; a plugin counts when one of its skills or its own MCP servers runs; calls refused by a hook do not count), **Unused** (installed but never used, biggest context cost first, the list to remove from), **Context** (everything installed with a rough token estimate of its name and description, about 4 characters a token, plus its use count; `0×` in yellow costs context and is never used) and **Tools** (built-in tools such as Bash, Read, Edit: calls, failed calls `✗`, calls refused by a hook `⊘`, average time). `This session` / `All sessions` switches the scope (all sessions shows how long ago something was last used: `5m`, `3h`, `12d`). `Most used` / `Least used` sorts. `↻ Refresh` re-reads what is installed. `Reset all` (all sessions) asks a second time before it clears the stored counts. It counts only while the tab is on and only from the moment it is turned on; it keeps at most 300 counts, 200 skills, 200 connectors, 200 plugins and 80 tools, and stores only names and numbers, never arguments or output. Plugins that only add hooks never show, and commands a plugin registers in code are left out.
- **Git line (above the prompt):** project, branch, uncommitted changes (staged, modified, untracked) and commits to push or pull. Runs `git status` every 15 seconds and right after Claude runs a command or writes a file. A checked-out commit shows as `detached`. `↑ N to push` copies `git push`, `↓ N to pull` opens the commits page of a `github.com` remote. Bands of other mods stay drawn beneath it.

**Commands:** `/cockpit [home|files|agents|calls|meter|errors|todo|project|usage]` opens the pane, optionally on a tab (an unknown tab is named in the reply, the pane opens anyway). `/idea <text>` saves an idea and `/change <text>` a change request for the current project.

**Settings** (`/config`, section `bro-cockpit`; all on by default): `show_home`, `show_files`, `show_agents`, `show_calls`, `show_meter`, `show_errors`, `show_todo`, `show_project`, `show_usage`, `show_gitband` show or hide a tab or the git line. A hidden tab is only hidden, the cockpit keeps counting, except Usage: with `show_usage` off nothing is counted. `markers` (default `TODO,FIXME,HACK,XXX`) are the words the Todo tab looks for. `sessionFiles` (default on) scans the session's files in a project without git.

**What it runs:** `git` locally (`status` every 15 seconds; a `git grep` for the code markers every 30 seconds while the pane is open; `rev-parse` and `remote get-url` when the project changes). No network requests of its own. A click hands a folder or address to your system's opener (`open`, `xdg-open`): the project folder, the branch page on GitHub, a marker's file in the file manager. It never opens or runs a file of the project.

It adapts to narrow panes, works in light and dark mode and falls back to text without graphics in the terminal. Install: `claude plugin install bro-cockpit@desktop-claude-code-mods`. Details: [mods/bro-cockpit/README.md](mods/bro-cockpit/README.md).

### `secret-guard`: stops secrets from being written

Blocks `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash` calls whose content matches a secret pattern:

- API keys (OpenAI-style `sk-`, Stripe `sk_live_` and `rk_live_`, Google, AWS), GitHub, GitLab, npm and Slack tokens, JSON web tokens, bearer tokens
- private keys (PEM header, also PGP blocks)
- a real-looking password inside a connection URL
- plaintext credentials such as `password = "..."`, a JSON `"password"` key, `DB_PASSWORD=...`, `export API_KEY=...` or `token: '...'`

A value counts only when it looks real: placeholders (`YOUR_TOKEN_HERE`), references (`${API_KEY}`, `process.env.KEY`) and short plain words pass. The message names only the kind of secret, never the value. A match is blocked on every attempt, and if the guard itself fails the call is blocked. Only `node_modules/` and `.env.example` are skipped, so Claude cannot write a real key into a `.env` file either; put real values there yourself. It has no interface, no command and no setting. It reads one tool call at a time, so encoded, split or concatenated values, values assembled over several edits and tools outside its matcher (an MCP file tool, PowerShell) pass. It is a safety net, not a guarantee. Install: `claude plugin install secret-guard@desktop-claude-code-mods`. Details: [mods/secret-guard/README.md](mods/secret-guard/README.md).

### `branch-guard-band`: warns when you work on main

A band above the prompt with `⚠ Working directly on main` in the warning colour and the hint `click to copy: git switch -c` (dropped in a narrow window). A click copies `git switch -c ` to the clipboard. It only warns, it stops no commit and no push. On other branches, with a detached HEAD and outside git the band is hidden. It checks the branch with `git symbolic-ref HEAD` every 15 seconds and right after every Bash command by Claude that contains `git`, so a branch switch outside Claude shows after 15 seconds at most.

**Settings:** `branches` (default `main,master`, comma separated, `*` as wildcard, for example `release/*`), `hint` (show the hint, default on). Install: `claude plugin install branch-guard-band@desktop-claude-code-mods`. Details: [mods/branch-guard-band/README.md](mods/branch-guard-band/README.md).

### `env-band`: shows the active environment

A band above the prompt that names the environment your project uses and lists its `.env` files, for example `◉ development .env.local .env`. Red for `production` (also `prod`, `live`), yellow for `staging` (also `stage`, `preprod`, `uat`), calm otherwise. If no file names an environment, only the file names show. More files than fit add a dim `+N`. A click on a file name shows the file in Finder (macOS) or opens its folder (Linux); the content is never opened. Without `.env` files the band is hidden.

The name comes from `NODE_ENV`, `APP_ENV` or `ENV`, looked up in `.env.local`, `.env`, `.env.<mode>.local` and `.env.<mode>` in this order. Only the environment name and the file names are shown or stored, and the name only when it is a plain word (no URL, no `${...}`). `.env.keys` and `.env.vault` are listed, never read. It looks into the project folder (no subfolders, at most 20 files of up to 256 KiB) every 30 seconds and right away when Claude writes a `.env` file. It reads the files, not the environment of the running process.

**Settings:** `variables` (default `NODE_ENV,APP_ENV,ENV`, the first one found wins), `ignoreTemplates` (skip `.env.example`, `.env.sample`, `.env.template`, `.env.tpl`, `.env.dist`, default on). Install: `claude plugin install env-band@desktop-claude-code-mods`. Details: [mods/env-band/README.md](mods/env-band/README.md).

### `limit-band`: your usage limit

A band above the prompt, for example `◔ 5h 72% · ↻ 1 h 23 min`: how much of the 5-hour limit is used and the countdown to its reset. The 5-hour limit always shows while its reset time is known; the 7-day limit only above a threshold (default 50 %). From 80 % the band turns to a warning (`◕`), from 95 % to an error (`⚠`), symbol and colour together. The countdown moves every 30 seconds and is read again after every turn; it shows no clock time. Below 44 columns only the fullest limit shows. A click opens the usage page (claude.ai/settings/usage) in the browser.

The numbers come from the last API response. Without a subscription (API key) Claude Code reports no limits and the band stays empty. Other sessions use the same limit; the band sees that only with its own next response.

**Settings:** `fiveHour` (always show the 5-hour limit, default on), `threshold` (percent above which other windows show, default 50), `sevenDay` (show the 7-day limit, default on). Install: `claude plugin install limit-band@desktop-claude-code-mods`. Details: [mods/limit-band/README.md](mods/limit-band/README.md).

### `prompt-library`: save prompts once, reuse them everywhere

A pane with a list of prompts, one line each: the name, `▣` for project prompts. `↳` puts the prompt into the prompt box without sending it. A click on the name opens the text with `⧉ copy`, `↵ send` and `✕ delete`. `＋ new` opens a field for a new prompt with the choice "all projects" or "only this project". A search field appears from 6 prompts on.

- **Placeholders:** `{{file}}` in the text. The opened entry asks for the values; empty values stay as `{{…}}`.
- **Use:** fills the prompt box (`$.prompt.fill`). If that fails the text goes to the clipboard; if that fails too, the entry shows the full text to copy. `↵ send` sends the prompt as a turn of its own and costs tokens like a typed prompt; this is the only place where a mod causes model tokens, and only when you press it.
- **Storage:** in the plugin store on your machine, one global list and one list per project (a worktree has its own). Project prompts win over global ones with the same name. After every turn the lists are re-read, so prompts saved in another session show up. Text that looks like a key is redacted before saving (an aid, not protection).

**Commands:** `/prompt-save <name>: <text>` saves for all projects (several lines allowed, the same name replaces the old prompt), `/prompt-save --project <name>: <text>` for the current project only, `/prompts [search]` opens the pane, `/p <name> [value | value]` fills the prompt box, values fill the placeholders in order (without placeholders the rest is appended as a paragraph). A name has at most 40 characters, no `:` and no `|`. Install: `claude plugin install prompt-library@desktop-claude-code-mods`. Details: [mods/prompt-library/README.md](mods/prompt-library/README.md).

### `permission-log`: stop answering the same prompt

A pane that logs your permission prompts. Every prompt where a person is asked counts for its rule, the one Claude Code itself suggests (for example `Bash(git push:*)`). It counts as allowed when the tool ran afterwards and as declined when the call came back refused; calls refused without asking (by a rule or the auto-mode classifier) count as asked and declined.

- **★ Worth allowing:** rules you allowed at least 3 times and never declined, most allowed first. Rules for a whole sensitive tool (`Bash`, `Read`, `Edit`, `Write`, `WebFetch`) or for commands that run other code or delete (`rm`, `curl`, `sh`, `python`, `sudo`, and so on) are never offered. **All asked** lists everything, most asked first.
- **A click on a rule** opens a card with a redacted example, the counts and when it was last asked. `⧉ copy rule` puts the rule on the clipboard; you add it under `permissions.allow` in `.claude/settings.json` yourself. The mod changes no settings.
- **Scope:** `this session` or `all sessions` (kept in the plugin store, written once per turn and at the end of the session). `Reset all` asks a second time before it clears the stored counts.

It counts only from the moment it is installed and only prompts, so calls your rules already allow never show. It keeps at most 150 rules and stores only rules, short redacted examples and numbers. **Command:** `/permlog`. Install: `claude plugin install permission-log@desktop-claude-code-mods`. Details: [mods/permission-log/README.md](mods/permission-log/README.md).

## Contents

- [Quick start in the Claude desktop app](#quick-start-in-the-claude-desktop-app)
- [All 7 mods](#all-7-mods)
- [What are Claude Code mods?](#what-are-claude-code-mods)
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

Mods are plugins with a hooks module that change the interface or the behavior of Claude Code: a pane that stays next to the chat, a band above the prompt, a status line, slash commands, and hooks on tool calls. They are an early access feature of Claude Code, available in the desktop app and in the terminal. A mod is a folder with a `plugin.json` and a hooks module written in TypeScript. This repository contains 7 mods and the lessons learned while building them (see [docs](#documentation)).

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

## Install Claude Code mods

The marketplace is `brodesigns/desktop-claude-code-mods`. It lists all 7 mods.

**Claude desktop app:** click the plus next to the prompt box, open Plugins, choose Add marketplace, enter `brodesigns/desktop-claude-code-mods`, then add the mods you want. `/plugin` does not run in the desktop app. Step by step, with a table of which mod to try first: [docs/03-install-in-claude-desktop.md](docs/03-install-in-claude-desktop.md).

**Terminal:** add the marketplace once, then install each mod you want with the same pattern:

```bash
claude plugin marketplace add brodesigns/desktop-claude-code-mods
claude plugin install <mod>@desktop-claude-code-mods
```

Mod names: `bro-cockpit`, `secret-guard`, `branch-guard-band`, `env-band`, `limit-band`, `prompt-library`, `permission-log`.

Example: `claude plugin install bro-cockpit@desktop-claude-code-mods`.

**From a local clone:** use the folder path instead of the repository name, for example `claude plugin marketplace add ./desktop-claude-code-mods`.

Reload after changes with `/reload-plugins`. Uninstall with `claude plugin uninstall <mod>`.

**Update:** every mod has its own version, and an installed mod only updates when its version in the marketplace is newer. Refresh the catalog, update the mods you use, then restart Claude Code:

```bash
claude plugin marketplace update desktop-claude-code-mods
claude plugin update <mod>@desktop-claude-code-mods
```

What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## Turn mods or parts off

- **Whole mods:** every mod is its own plugin. Install only what you want, or disable one with `claude plugin disable <mod>@desktop-claude-code-mods`.
- **Parts of the cockpit:** switch each tab and the git band on or off in `/config`, section `bro-cockpit`. Details in [mods/bro-cockpit/README.md](mods/bro-cockpit/README.md).
- **Bands with settings:** some bands have their own `/config` settings, for example a threshold for `limit-band`. See the mod's README.

## Commands

| Command | Effect |
|---|---|
| `/cockpit [home\|files\|agents\|calls\|meter\|errors\|todo\|project\|usage]` | Opens the cockpit pane, optionally on a given tab |
| `/idea <text>` | Saves an idea for the current project (click it in the Project tab to put it into the prompt box) |
| `/change <text>` | Saves a change request for the current project |
| `/prompts`, `/p <name>`, `/prompt-save <name>: <text>` | Opens the prompt library, inserts a saved prompt, saves a prompt |
| `/permlog` | Opens the permission log |

The full command list of each mod is in its README.

## Requirements

- Claude Code with plugin hooks module support, tested with version 2.1.308.
- Mods are an early access feature and may not be enabled in every version or account.
- Optional: `git` for the cockpit and `branch-guard-band`. Without it they show only the folder name or stay hidden.

## FAQ

### How do I install Claude Code mods in the desktop app?

Add this repository as a marketplace (plus button next to the prompt, Plugins, Add marketplace) and install the mods you want. See [Install Claude Code mods](#install-claude-code-mods).

### Do these Claude Code mods cost tokens?

Almost never. They add no prompt text, no tools for the model and no subagents. Only when a guard blocks a call does Claude read the short block message. One exception: sending a prompt from `prompt-library` submits it as if you typed it, which costs normal tokens.

### Does it work in the terminal, not only in the desktop app?

The hooks, bands and commands work in both. The panes draw graphics in the desktop app and fall back to text in the terminal.

### What do the mods access on my machine?

Programs that mods run locally: `git` (`bro-cockpit`, `branch-guard-band`); `open` and `xdg-open` on a click (`bro-cockpit`: project folder, GitHub branch page, a file shown in the file manager; `env-band`: an env file shown in the file manager; `limit-band`: the usage page in your browser). `secret-guard` runs nothing. Every program runs as an argument list, never through a shell. Saved data (ideas, prompts, usage counts, the permission log) stays in the Claude Code plugin store on your machine. No mod sends data to a model.

### Can I use only the secret guard?

Yes. Every mod installs separately. `secret-guard` has no interface and needs no other mod.

### Can I hide single tabs of the cockpit?

Yes. Open `/config` and switch off the tabs you do not need in the `bro-cockpit` section. The git band has its own switch.

### Which Claude Code version do I need?

Tested with 2.1.308. The mod API is early access and can change between versions, which can break a mod. Please open an issue with your version.

## Security and privacy

Mods run with your permissions. The mods make no network requests of their own. Some clicks open a web page in your browser (`limit-band` the Claude usage page, `bro-cockpit` the GitHub page of your branch, only for a `github.com` remote). Everything stays on your machine. Mods only show files in the file manager and never open or run them. Running `git` in a repository you did not write can run that repository's own git configuration (for example `core.fsmonitor`): open untrusted repositories with care, as with any git tool. The guards are helpers, not guaranteed protection. See [SECURITY.md](SECURITY.md) to report a problem.

## Limitations

- The mod API of Claude Code is early access and can change.
- A pane can only use the slots the engine offers. The session list in the sidebar and the built-in session overview cannot be changed by a mod.
- The secret guard only knows the patterns it has been given. Unknown formats and split or encoded values pass through. Placeholders and references to variables pass on purpose.
- Git runs with `core.fsmonitor` off, but a repository whose own `.git/config` or `.git/info/attributes` is hostile (an extracted archive or shared folder) can still make any git command run code, as it can for Claude Code itself. Open such folders with care.
- The mods are tested with `claude plugin test`. The author has not checked every mod by eye in the desktop app.

## Documentation

1. [docs/01-basics.md](docs/01-basics.md): structure, types, testing, installing, developing
2. [docs/02-rules-and-pitfalls.md](docs/02-rules-and-pitfalls.md): rules and pitfalls found while building
3. [docs/03-install-in-claude-desktop.md](docs/03-install-in-claude-desktop.md): step by step guide for the Claude desktop app

## Contributing and license

Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE). Built by [BroDesigns](https://brodesigns.de).

---

*Keywords: Claude Code mods, Claude Code plugins, Claude desktop app, Claude Code hooks, Claude Code dashboard, Claude Code subagents, Claude Code context window, Claude Code rate limit, Claude Code secret scanner, git status band, prompt library.*
