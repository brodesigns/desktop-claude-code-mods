# todo-md-pane

A pane that shows the open items of the project's `todo.md` as a checklist. Ticking an item removes its line from the file. No model tokens.

- **File:** `todo.md` in the project root, any capitalisation. The pane opens by itself when the file exists and checks the file every 5 seconds, so changes made by you or Claude show up.
- **Entries:** `- [ ] task`, `* [ ] task`, `1. [ ] task` and plain bullets `- task`. Headings (`#`, `##`) become section titles, indented entries are indented in the pane. Entries already marked `[x]` are not shown (they are counted in the empty state). Code fences are skipped.
- **Ticking:** a click removes the entry's line and the indented lines right below it (sub-entries, notes). The file is read again right before the write; if the line moved, it is found by its text, and if it is gone nothing is removed.
- **Undo:** `↶ undo` puts the last removed lines back at their place.

## Commands

- `/todolist` opens the pane.

## Limits

- Only the project root is searched, no subfolders.
- Removing is permanent apart from the one-step undo (kept for the session only). Use git for more.
- Not yet tried in the desktop app.

Installation: `claude plugin install todo-md-pane@desktop-claude-code-mods`, details in `../../README.md`.
