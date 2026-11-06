# 03 Install the mods in the Claude desktop app

Every mod is its own plugin. You add the marketplace once, then add only the mods you want.

## Steps

1. **Open the plugin list.** Click the plus next to the prompt box and open **Plugins**.
2. **Add the marketplace.** Choose **Add marketplace** and enter:

   ```
   brodesigns/desktop-claude-code-mods
   ```

3. **Add the mods you want.** The marketplace lists 7. Start with one or two (see the table below).
4. **Try it.** Type the mod's command in the prompt box, for example `/cockpit`. A pane opens next to the chat, a band shows above the prompt.

`/plugin` does not run in the desktop app, so the steps above are done in the Plugins screen. The exact button names can differ between app versions.

## Which mod first

Start small: `bro-cockpit` and `secret-guard` cover most needs.

| You want | Add | Try |
|---|---|---|
| One overview of project, git, files, todos, calls, context and what you use | `bro-cockpit` | `/cockpit` |
| Secrets never written into files or commands | `secret-guard` | nothing to open, it works in the background |
| Stop being asked the same safe permission again | `permission-log` | `/permlog` |
| Saved prompts | `prompt-library` | `/prompts` |
| A one-line band above the prompt | `branch-guard-band`, `env-band`, `limit-band` | shows by itself |

All commands and settings of each mod are in its README under `mods/<name>/`.

## If nothing shows up

- Mods are an early access feature and may not be enabled in every version or account of the app.
- Restart the app after adding a mod.
- Check that the mod is listed as added in the Plugins screen.
- Open an issue with the app version if a mod does not load.

## Update

An installed mod only updates when its version in the marketplace is newer. In a terminal:

```bash
claude plugin marketplace update desktop-claude-code-mods
claude plugin update <mod>@desktop-claude-code-mods
```

Restart afterwards. What changed in each version is in [CHANGELOG.md](../CHANGELOG.md).

## Turn off or remove

- In a terminal: `claude plugin disable <mod>@desktop-claude-code-mods` turns one mod off, `claude plugin uninstall <mod>` removes it. The Plugins screen of the app may offer the same; this guide does not cover it.
- Parts of the cockpit (each tab, the git band) are switched in `/config`, section `bro-cockpit`.

## What the mods access

They run no programs except `git` (`bro-cockpit`, `branch-guard-band`) and `open` or `xdg-open` on a click. Saved data (ideas, prompts, usage counts, permission log) stays on your machine in the Claude Code plugin store. No mod sends data to a model. Details: [Security and privacy](../README.md#limits-and-security).
