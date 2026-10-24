# todo-md-pane

One todo pane: the open items of the project's `todo.md` as a checklist, and below them the TODO, FIXME, HACK and XXX markers found in your changed code. Ticking an item removes its line from the file. No model tokens.

- **File:** `todo.md` in the project root, any capitalisation. The pane opens by itself when the file exists and checks the file every 5 seconds, so changes made by you or Claude show up.
- **Entries:** `- [ ] task`, `* [ ] task`, `1. [ ] task` and plain bullets `- task`. Headings (`#`, `##`) become section titles, indented entries are indented in the pane. Entries already marked `[x]` are not shown (they are counted in the empty state). Code fences are skipped.
- **Ticking:** a click removes the entry's line and the indented lines right below it (sub-entries, notes). The file is read again right before the write; if the line moved, it is found by its text, and if it is gone nothing is removed.
- **Undo:** `↶ undo` puts the last removed lines back at their place.

## In code

- **Which files:** everything `git status` reports as modified, added or untracked, plus the files Claude wrote in this session. Whole words only, case sensitive. Checked every 20 seconds and right after Claude writes a file.
- **Click:** a file under "In code" opens in your editor (`open`, `xdg-open`).
- **Settings:** `markers` (comma separated, default `TODO,FIXME,HACK,XXX`) and `sessionFiles` (count files Claude wrote, default on).

## Commands

- `/todolist` opens the pane.

## Limits

- Only the project root is searched for `todo.md`, no subfolders.
- Removing is permanent apart from the one-step undo (kept for the session only). Use git for more.
- Not yet tried in the desktop app.

Installation: `claude plugin install todo-md-pane@desktop-claude-code-mods`, details in `../../README.md`.
