# 01 Basics

For people who build or change mods. To only use them, read [03 Install](03-install-in-claude-desktop.md). Next: [02 Rules and pitfalls](02-rules-and-pitfalls.md).

## What a mod is

A plugin with a hooks module. The module exports `register`, receives `on` and attaches hooks to engine events. It has no DOM and no Node. It reaches everything outside through `$`.

## Files

```
<mod>/
  .claude-plugin/plugin.json     { "name", "version", "description", "author", "types": "./types/index.d.ts" }
  hooks/hooks.json               { "modules": ["./register.tsx"] }
  hooks/register.tsx             export const register: Register = (on, options) => { ... }
  hooks/*.test.ts                tests for `claude plugin test`
  types/index.d.ts               state types (only when $.state or atom() is used)
  README.md                      otherwise the directory check warns
```

- `hooks.json` may name exactly ONE module. More files: `register.tsx` imports them.
- JSX uses the global function `h`. Elements come from `$.ui.resolve(e)`.
- Types come from `'claude-code'`, state types from `'../types'`.
- A mod without state (like `secret-guard`) needs neither `types` in `plugin.json` nor `types/index.d.ts`.

## Where the types come from

- When it loads a mod, the engine writes the types to `<mod>/.claude-plugin/types/`. That folder holds `claude-code` (engine, `$`, events, elements) and `claude-code/testing` (tests). The folder does not belong in the repo (`.gitignore`).
- The `plugin-authoring` skill in Claude Code describes the types, the events and the engine rules. Load this skill first for a new mod.
- Search the types directly, for example for `'tool.call'`, `Pane: {` or `export type ToolCallResult`.

## Checking

```bash
claude plugin validate <mod-folder>   # manifest, hooks, calls, state keys
claude plugin test <mod-folder>       # runs *.test.ts
claude plugin validate <repo-folder>  # checks the marketplace.json
```

- `validate` checks the source the way the engine reads it. Errors there are real errors. The notes "ICON_MISSING" and findings of the directory profile only concern the public plugin directory.
- `validate` does not check types. For a type check run `tsc` from an existing project with a tsconfig that includes the mods and the types from `.claude-plugin/types/`. Known note: `MultiEdit` is not a tool in every engine version, so its matcher is a RegExp; in a test, `$.command.run` needs `origin` and `presentation`.
- Tests: `import { expect, test } from 'claude-code/testing'`. Nothing sits below the plugin. Every call the plugin makes (`clock.now`, `command.register`, `ui.open`) needs an `on('<event>', () => ({ value: ... }))` in the test. The answer to an event is its own result.
- A denied `tool.call` returns `ran.deny` (a string), not `isError`.

## Installing

Through this repo's marketplace:

```bash
claude plugin marketplace add brodesigns/desktop-claude-code-mods
claude plugin install bro-cockpit@desktop-claude-code-mods
```

- From a cloned folder: `claude plugin marketplace add <path-to-folder>`. The entries in `marketplace.json` are relative paths, so Claude Code then reads the mods straight from the folder.
- `/plugin` does not run in the desktop app. There: plus next to the prompt, Plugins, Add marketplace, then add the mod.
- Uninstall: `claude plugin uninstall <name>`.

## Developing

1. Clone the repo, add the folder as a local marketplace (see above) and install the mods.
2. Change files in the mod folder. `/reload-plugins` in the prompt reloads the mods without a new install.
3. On reload, `register` and `session.start` run again. `$.state` and `$.store` stay, module variables start fresh.
4. Before every commit run `validate` and `test` for every changed mod.

A new mod: create a folder under `mods/<name>/` as described in "Files", add it to `.claude-plugin/marketplace.json`, then install it. Alternatively the `plugin-authoring` skill creates a mod for the running session only; the app then asks once whether it should turn on the mods from this session.
