# 07 Limits

What a mod can NOT do. The API has no hook for it.

- **Session list on the left (sidebar):** cannot be changed, not even the project name in its rows. Workaround 1: the app's filter menu, grouping by project (`group_by: project`, which drops the global sort by recency). Workaround 2: put the project name into the session title (`[Project] Title`) with `set_session_title`. New sessions have to be named by hand.
- **Session overview (popover with environment, context, connectors):** built in, not extensible.
- **How tool calls are shown in the chat itself:** cannot be changed. The fallback is the "Tool calls" tab.
- **More slots:** only `Pane` and `AbovePrompt` (plus status line, toast, notification). A pane opens in the pane area on the right; there is no freely placeable area.
- **Terminal:** no `Svg`, `Input` or `Select`.
- **Plugin `CLAUDE.md`:** as far as I know it is not loaded, so prompt mods from other repos probably have no effect.
- **Hot reload:** only after the user agrees. Mods in `dev-mods/<session>` apply to that session only.
- **`/plugin`:** does not run in the desktop app. Install through the plus menu or the terminal.

## Finding what breaks

- `claude plugin validate <folder>` names every rejected spot with its line.
- A line in the transcript like `<plugin>: ui.render hook skipped: returned the wrong shape (...)` means the tree was invalid.
- `claude --debug` writes every rejected answer to the debug log.
