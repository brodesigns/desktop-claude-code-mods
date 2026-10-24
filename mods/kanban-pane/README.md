# kanban-pane

A small kanban board per project for Claude Code: Open, In progress, Done. One pane, two commands. No model tokens.

- **Pane:** three columns with a count in the header. Side by side when wide, stacked when narrow. Each card has `‹` and `›` to move it (with the column names at medium width) and `✕` to delete it. A moved card lands at the bottom of its new column.
- **Done:** cards finished more than 14 days ago are folded away (`▸ N older than 14 days`). The count includes them.
- **New card:** the input field at the top of the pane or `/card`.

## Commands

- `/card <text>` adds a card to Open. Several lines make several cards, a leading `- ` or `* ` is dropped.
- `/kanban` opens the board.

## Settings

- `doneDays` (fold Done after days, default 14).

## Storage

In the plugin store (`$.store`, the user's config folder) under `kanban:project:<folder>:<hash of the project root>`. A worktree has its own root and therefore its own board.

## Limits

- Cards are plain text up to 300 characters, without due dates, manual ordering or assignees.
- Text that looks like a key is redacted before it is saved. This is an aid, not a guaranteed protection.
- Delete does not ask for confirmation.

Installation: `claude plugin install kanban-pane@desktop-claude-code-mods`, details in `../../README.md`.
